import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { insertPodcastSchema, generatedContent, siteSettings, subscribers, episodeChunks, translations } from "@shared/schema";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Resend } from "resend";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { companyKnowledge } from "./knowledge/company";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const resend = new Resend(process.env.RESEND_API_KEY);

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // GET /api/podcasts
  app.get(api.podcasts.list.path, async (_req, res) => {
    const allPodcasts = await storage.getPodcasts();
    res.json(allPodcasts);
  });

  // GET /api/podcasts/:id
  app.get(api.podcasts.get.path, async (req, res) => {
    const podcast = await storage.getPodcast(Number(req.params.id));
    if (!podcast) {
      return res.status(404).json({ message: 'Episode not found' });
    }
    res.json(podcast);
  });

  // POST /api/podcasts — create episode (backoffice)
  app.post(api.podcasts.list.path, async (req, res) => {
    try {
      const data = insertPodcastSchema.parse(req.body);
      const created = await storage.createPodcast(data);
      res.status(201).json(created);
      // Regenerate questions in background — direct call, no HTTP round-trip
      regenerateQuestions().catch((e) => console.error('Question regen failed:', e));
      // Generate and store RAG embeddings in background
      generateAndStoreEmbeddings(created.id).catch((e) => console.error('Embedding failed:', e));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? 'Validation error' });
      }
      console.error(err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // PUT /api/podcasts/:id — update episode (backoffice)
  app.put(api.podcasts.get.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const data = insertPodcastSchema.partial().parse(req.body);
      const updated = await storage.updatePodcast(id, data);
      if (!updated) return res.status(404).json({ message: "Episode not found" });
      res.json(updated);
      regenerateQuestions().catch((e) => console.error('Question regen failed:', e));
      generateAndStoreEmbeddings(id).catch((e) => console.error('Embedding failed:', e));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? 'Validation error' });
      }
      console.error("update error:", err);
      res.status(500).json({ message: "Failed to update episode" });
    }
  });

  // DELETE /api/podcasts/:id — delete episode (backoffice)
  app.delete(api.podcasts.get.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getPodcast(id);
      if (!existing) {
        return res.status(404).json({ message: 'Episode not found' });
      }
      await storage.deletePodcast(id);
      // Regenerate in background
      regenerateQuestions().catch((e) => console.error('Question regen failed:', e));
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // POST /api/ai/search — PCB search
  app.post(api.ai.search.path, async (req, res) => {
    try {
      const input = api.ai.search.input.parse(req.body);

      const allPodcasts = await storage.getPodcasts();
      const context = allPodcasts.map(p =>
        `Episode ID: ${p.id}\nTitle: ${p.title}\nDescription: ${p.description}\nTranscripts: ${JSON.stringify(p.transcripts)}`
      ).join('\n\n');

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: "You are PCB (Podcast Content Browser), an AI assistant for a podcast platform. Given the user's query, find the most relevant episode and the exact timestamp where the topic is discussed, based on the provided context. Return ONLY a valid JSON object — no markdown, no explanation — with 'podcastId' (number), 'timestamp' (string in 'MM:SS' or 'HH:MM:SS' format), and 'explanation' (string explaining why this timestamp is relevant). If no relevant episode is found, return podcastId as null and timestamp as null.",
        messages: [
          { role: "user", content: `Context:\n${context}\n\nQuery: ${input.query}` }
        ],
      });

      const block = response.content[0];
      const resultText = block.type === "text" ? block.text : null;
      if (!resultText) throw new Error("No response from PCB");

      const result = JSON.parse(resultText);
      res.json({
        podcastId: result.podcastId,
        timestamp: result.timestamp,
        explanation: result.explanation
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/episodes/extract — YouTube auto-extraction
  app.post("/api/episodes/extract", async (req, res) => {
    try {
      const { youtubeUrl, title, transcriptSource, transcriptText, analysisMode, aiProvider } = req.body as {
        youtubeUrl?: string;
        title?: string;
        transcriptSource?: "supadata" | "file";
        transcriptText?: string;
        analysisMode?: "full" | "summary";
        aiProvider?: "claude" | "gemini";
      };

      if (!youtubeUrl || !title) {
        return res.status(400).json({ message: "youtubeUrl and title are required" });
      }

      // Extract video ID from various YouTube URL formats
      const videoId = extractVideoId(youtubeUrl);
      if (!videoId) {
        return res.status(400).json({ message: "Could not recognise YouTube URL. Supported formats: youtube.com/watch?v=, youtu.be/, /embed/" });
      }

      const videoUrl = `https://www.youtube.com/embed/${videoId}`;
      const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      // TRANSCRIPT SOURCE
      let rawTranscript: Array<{ offset: number; text: string }> = [];

      if (transcriptSource === "file") {
        // User pasted transcript from Premiere or any tool
        if (!transcriptText || transcriptText.trim().length === 0) {
          return res.status(400).json({ message: "Transcript text is required when source is file." });
        }
        const lines = transcriptText.trim().split("\n").filter(l => l.trim());
        rawTranscript = lines.map((line, i) => {
          const timeMatch = line.match(/\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*/);
          const offset = timeMatch ? (() => {
            const parts = timeMatch[1].split(":").map(Number);
            return (parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1]) * 1000;
          })() : i * 5000;
          const text = line.replace(/\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/, "").trim();
          return { offset, text };
        }).filter(l => l.text.length > 0);
      } else {
        // Supadata
        const supadataRes = await fetch(
          `https://api.supadata.ai/v1/transcript?url=https://www.youtube.com/watch?v=${videoId}&mode=native&chunkSize=1000`,
          { headers: { "x-api-key": process.env.SUPADATA_API_KEY! } }
        );
        if (!supadataRes.ok) {
          return res.status(400).json({ message: "No transcript available for this video." });
        }
        const supadataData = await supadataRes.json() as {
          content: Array<{ text: string; offset: number }> | string;
        };
        if (!supadataData.content || (Array.isArray(supadataData.content) && supadataData.content.length === 0)) {
          return res.status(400).json({ message: "Transcript is empty." });
        }
        rawTranscript = Array.isArray(supadataData.content)
          ? supadataData.content.map(c => ({ offset: c.offset, text: c.text }))
          : [{ offset: 0, text: supadataData.content as string }];
      }

      if (rawTranscript.length === 0) {
        return res.status(400).json({ message: "Transcript is empty." });
      }

      // Format with MM:SS timestamps (offset is in ms)
      const allLines = rawTranscript.map(item => {
        const secs = Math.floor(item.offset / 1000);
        const mm = String(Math.floor(secs / 60)).padStart(2, "0");
        const ss = String(secs % 60).padStart(2, "0");
        return `[${mm}:${ss}] ${item.text}`;
      });

      // Auto-switch to summary mode for very long transcripts
      const effectiveMode = allLines.length > 500 ? "summary" : (analysisMode ?? "full");

      let formattedTranscript: string;
      if (effectiveMode === "summary") {
        // Very aggressive sampling — max 150 lines evenly distributed
        const MAX_LINES = 150;
        const step = Math.max(1, Math.ceil(allLines.length / MAX_LINES));
        formattedTranscript = allLines.filter((_, i) => i % step === 0).join("\n");
      } else {
        // Full mode — still cap at 800 lines to avoid rate limits
        const MAX_LINES_FULL = 800;
        if (allLines.length > MAX_LINES_FULL) {
          const step = Math.ceil(allLines.length / MAX_LINES_FULL);
          formattedTranscript = allLines.filter((_, i) => i % step === 0).join("\n");
        } else {
          formattedTranscript = allLines.join("\n");
        }
      }

      // Hard character cap regardless of mode — 6000 chars max (~1500 tokens)
      if (formattedTranscript.length > 6000) {
        const lines = formattedTranscript.split("\n");
        const step = Math.ceil(lines.length / 100);
        formattedTranscript = lines.filter((_, i) => i % step === 0).join("\n");
      }

      console.log(`[Extract] Transcript size: ${formattedTranscript.length} chars, ${allLines.length} original lines`);

      // Analyse the transcript with the selected AI provider
      const systemPrompt = `You are analysing a transcript from a MAKEIT.TECH videocast episode.
Return ONLY a valid JSON object with exactly these fields:
- "description": string (2-3 sentences summarising the episode)
- "category": one of exactly: "Technology" | "Hardware & PCB" | "Design" | "Business" | "AI & Software" | "Innovation" | "Other"
- "keyMoments": array of objects with { "time": "MM:SS", "topic": string (3-5 words), "text": string (1-2 sentences describing what is discussed at this moment) }
  - Include one entry per major topic change, roughly every 1-3 minutes
  - Aim for 8-20 key moments depending on episode length
  - "time" must match a timestamp that appears in the transcript`;
      const userMessage = `Title: ${title}\n\nTranscript:\n${formattedTranscript}`;

      console.log(`[Extract] Using AI provider: ${aiProvider ?? "claude (default)"}`);
      let responseText: string;
      if (aiProvider === "gemini") {
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const geminiResult = await geminiModel.generateContent(`${systemPrompt}\n\n${userMessage}`);
        responseText = geminiResult.response.text();
      } else {
        const claudeResponse = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        });
        const block = claudeResponse.content[0];
        responseText = block.type === "text" ? block.text : "";
      }

      if (!responseText) {
        return res.status(500).json({ message: "No response from AI" });
      }

      // Strip any markdown code fences if Claude wrapped the JSON
      const cleaned = responseText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const extracted = JSON.parse(cleaned);

      res.json({ videoUrl, thumbnailUrl, ...extracted });
    } catch (err) {
      console.error("extract error:", err);
      res.status(500).json({ message: "Extraction failed. Please try again." });
    }
  });

  // GET /api/questions — AI-generated suggested search questions (cached 24h in DB)
  app.get("/api/questions", async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === "true";

      // Check cache first
      if (!forceRefresh) {
        const cached = await db.select().from(generatedContent)
          .where(eq(generatedContent.key, "homepage_questions"))
          .limit(1);
        if (cached.length > 0) {
          const ageHours = (Date.now() - new Date(cached[0].generatedAt as Date).getTime()) / 3600000;
          if (ageHours < 24) {
            return res.json({ questions: cached[0].content, cached: true });
          }
        }
      }

      // Generate fresh (upsert to DB is handled inside regenerateQuestions)
      const questions = await regenerateQuestions();
      res.json({ questions, cached: false });
    } catch (err) {
      console.error("questions error:", err);
      res.status(500).json({ message: "Failed to generate questions" });
    }
  });

  // GET /api/settings
  app.get("/api/settings", async (_req, res) => {
    try {
      const settings = await db.select().from(siteSettings);
      const result: Record<string, unknown> = {};
      settings.forEach(s => result[s.key] = s.value);
      if (result.show_carousel === undefined) result.show_carousel = true;
      if (result.show_featured_questions === undefined) result.show_featured_questions = false;
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PUT /api/settings
  app.put("/api/settings", async (req, res) => {
    try {
      const { key, value } = req.body as { key: string; value: unknown };
      await db.insert(siteSettings)
        .values({ key, value })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: new Date() } });
      res.json({ key, value });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/subscribe — save subscriber email
  app.post("/api/subscribe", async (req, res) => {
    const { email } = req.body as { email?: string };
    if (!email || !email.includes("@")) {
      return res.status(400).json({ message: "Valid email required" });
    }
    try {
      await db.insert(subscribers)
        .values({ email: email.toLowerCase().trim() })
        .onConflictDoNothing();
      res.json({ success: true, message: "Subscribed successfully" });
    } catch (err) {
      console.error("subscribe error:", err);
      res.status(500).json({ message: "Failed to subscribe" });
    }
  });

  // GET /api/subscribers — list all subscriber emails (admin)
  app.get("/api/subscribers", async (_req, res) => {
    try {
      const allSubscribers = await db.select().from(subscribers).orderBy(subscribers.subscribedAt);
      res.json({ subscribers: allSubscribers, total: allSubscribers.length });
    } catch (err) {
      console.error("subscribers error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/contact — contact form
  app.post("/api/contact", async (req, res) => {
    const { name, email, subject, message } = req.body as {
      name?: string;
      email?: string;
      subject?: string;
      message?: string;
    };
    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return res.status(400).json({ message: "Name, email and message are required." });
    }
    if (!email.includes("@")) {
      return res.status(400).json({ message: "Valid email required." });
    }
    try {
      await resend.emails.send({
        from: "MAKEIT OR BREAKIT <onboarding@resend.dev>",
        to: "contact@make-it.tech",
        replyTo: email,
        subject: `[Contact Form] ${subject || "New message from " + name}`,
        html: `<h2>New contact form submission</h2>
<p><strong>Name:</strong> ${name}</p>
<p><strong>Email:</strong> ${email}</p>
<p><strong>Subject:</strong> ${subject || "—"}</p>
<hr/>
<p><strong>Message:</strong></p>
<p>${message.replace(/\n/g, "<br/>")}</p>`,
      });
      console.log(`[Contact] Message from ${name} <${email}>`);
      res.json({ success: true });
    } catch (err) {
      console.error("contact error:", err);
      res.status(500).json({ message: "Failed to send message. Please try again." });
    }
  });

  // GET /api/featured-questions — AI-generated featured Q&A cards (cached 24h in DB)
  app.get("/api/featured-questions", async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === "true";

      if (!forceRefresh) {
        const cached = await db.select().from(generatedContent)
          .where(eq(generatedContent.key, "featured_questions")).limit(1);
        if (cached.length > 0) {
          const ageHours = (Date.now() - new Date(cached[0].generatedAt as Date).getTime()) / 3600000;
          if (ageHours < 24) return res.json({ items: cached[0].content, cached: true });
        }
      }

      const items = await regenerateFeaturedQuestions();
      res.json({ items, cached: false });
    } catch (err) {
      console.error("featured-questions error:", err);
      res.status(500).json({ message: "Failed to generate featured questions" });
    }
  });

  // POST /api/chat — RAG chatbot
  app.post("/api/chat", async (req, res) => {
    const { messages } = req.body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
    };

    if (!messages?.length) {
      return res.status(400).json({ message: "Messages required" });
    }

    try {
      const lastUserMsg = [...messages].reverse().find(m => m.role === "user")?.content ?? "";

      const queryEmbedding = await getEmbedding(lastUserMsg);
      const relevantChunks = await searchChunks(queryEmbedding);

      const chunksContext = relevantChunks.length > 0
        ? relevantChunks.map((c: any) =>
            c.chunk_type === "company"
              ? `[Company info] ${c.content}`
              : `[Episode: "${c.episode_title}" @ ${c.time_ref ?? "N/A"}] ${c.content}`
          ).join("\n\n")
        : "No specific episode content found for this query.";

      const systemPrompt = `You are the MAKEIT OR BREAKIT chatbot — a helpful assistant for the MAKEIT OR BREAKIT podcast platform.

COMPANY & SHOW KNOWLEDGE:
${companyKnowledge}

RELEVANT EPISODE CONTENT (retrieved via semantic search):
${chunksContext}

BEHAVIOUR RULES:
- Answer questions about episodes using the retrieved content above — cite the episode title and timestamp when relevant
- Answer questions about the company, hosts, and show using the company knowledge above
- For contact/guest questions, always include an action button to /contact
- For subscription questions, include an action button to /subscribe
- If a question references a specific episode, include an action button to that episode
- If no episode chunks were retrieved but the question is about topics that might be covered in the show (tech, entrepreneurship, hardware, startups, AI, design, innovation), still try to answer based on the company knowledge and suggest using the PCB search bar for specific timestamps. Only say you don't know if the topic is completely unrelated to tech, entrepreneurship or innovation
- Keep answers concise and conversational — 2-4 sentences max unless detail is needed
- ALWAYS respond in the same language the user writes in (Portuguese or English)

RESPONSE FORMAT — return ONLY valid JSON:
{
  "message": "your response text here",
  "actions": [{ "label": "Go to Contact", "href": "/contact" }],
  "sources": [{ "episodeTitle": "Episode name", "timeRef": "02:37", "topic": "Topic name" }]
}
actions and sources are optional — only include when relevant. Never include empty arrays.`;

      const claudeResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.slice(-10),
      });

      const block = claudeResponse.content[0];
      const responseText = block.type === "text" ? block.text : "";

      let parsed;
      try {
        const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        // Try to extract JSON if wrapped in text
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
      } catch {
        // If Claude didn't return JSON, wrap the text response
        parsed = { message: responseText.trim() };
      }

      res.json(parsed);
    } catch (err) {
      console.error("chat error:", err);
      res.status(500).json({ message: "Chat failed. Please try again." });
    }
  });

  // GET /api/translations/:lang — return flat key→value object for a language
  app.get("/api/translations/:lang", async (req, res) => {
    const lang = req.params.lang as string;
    if (lang !== "en" && lang !== "pt") {
      return res.status(400).json({ message: "Language must be 'en' or 'pt'" });
    }
    try {
      const rows = await db.select().from(translations);
      const result: Record<string, string> = {};
      for (const row of rows) {
        result[row.key] = lang === "pt" ? row.pt : row.en;
      }
      res.json(result);
    } catch (err) {
      console.error("translations fetch error:", err);
      res.status(500).json({ message: "Failed to fetch translations" });
    }
  });

  // POST /api/translations/seed — upsert all UI strings (one-time setup)
  app.post("/api/translations/seed", async (_req, res) => {
    const seedData: Array<{ key: string; en: string; pt: string }> = [
      // Nav
      { key: "nav.home",      en: "Home",      pt: "Início" },
      { key: "nav.episodes",  en: "Episodes",  pt: "Episódios" },
      { key: "nav.about",     en: "About",     pt: "Sobre" },
      { key: "nav.subscribe", en: "Subscribe", pt: "Subscrever" },
      // Admin
      { key: "admin.banner",       en: "BACKOFFICE MODE ACTIVE — You have admin controls enabled.", pt: "MODO BACKOFFICE ATIVO — Tem controlos de administrador ativados." },
      { key: "admin.exit",         en: "Exit Admin",  pt: "Sair do Admin" },
      { key: "admin.toggle_exit",  en: "Exit Admin",  pt: "Sair do Admin" },
      { key: "admin.toggle_enter", en: "Admin",       pt: "Admin" },
      // Footer
      { key: "footer.tagline",   en: "Empowering creators and builders with cutting-edge technology and insights.", pt: "A capacitar criadores e construtores com tecnologia e insights de ponta." },
      { key: "footer.platform",  en: "Platform",        pt: "Plataforma" },
      { key: "footer.company",   en: "Company",         pt: "Empresa" },
      { key: "footer.legal",     en: "Legal",           pt: "Legal" },
      { key: "footer.episodes",  en: "Episodes",        pt: "Episódios" },
      { key: "footer.series",    en: "Series",          pt: "Séries" },
      { key: "footer.hosts",     en: "Hosts",           pt: "Apresentadores" },
      { key: "footer.about",     en: "About Us",        pt: "Sobre Nós" },
      { key: "footer.careers",   en: "Careers",         pt: "Carreiras" },
      { key: "footer.contact",   en: "Contact",         pt: "Contacto" },
      { key: "footer.privacy",   en: "Privacy Policy",  pt: "Política de Privacidade" },
      { key: "footer.terms",     en: "Terms of Service", pt: "Termos de Serviço" },
      { key: "footer.copyright", en: "© {year} MAKEIT.TECH. All rights reserved.", pt: "© {year} MAKEIT.TECH. Todos os direitos reservados." },
      // Home
      { key: "home.presents",        en: "MAKEIT.TECH presents", pt: "MAKEIT.TECH apresenta" },
      { key: "home.subtitle",        en: "The show where founders, engineers and builders share what it really takes — or what breaks you.", pt: "O programa onde fundadores, engenheiros e construtores partilham o que realmente é preciso — ou o que os destrói." },
      { key: "home.pcb.label",       en: "PCB — Podcast Content Browser", pt: "PCB — Navegador de Conteúdos Podcast" },
      { key: "home.pcb.description", en: "Search inside MAKEIT OR BREAKIT episodes", pt: "Pesquisa dentro dos episódios MAKEIT OR BREAKIT" },
      { key: "home.pcb.placeholder", en: "Ask PCB anything — topic, keyword, question…", pt: "Pergunta ao PCB — tema, palavra-chave, questão…" },
      { key: "home.pcb.button",      en: "Ask PCB",           pt: "Perguntar ao PCB" },
      { key: "home.pcb.found",       en: "PCB Found a Match", pt: "PCB Encontrou uma Correspondência" },
      { key: "home.pcb.timestamp",   en: "Timestamp:",        pt: "Timestamp:" },
      { key: "home.pcb.play",        en: "Play Segment",      pt: "Reproduzir Segmento" },
      { key: "home.pcb.word_limit",  en: "Max 20 words per search", pt: "Máx. 20 palavras por pesquisa" },
      { key: "home.carousel.label",   en: "Questions explored in MAKEIT OR BREAKIT", pt: "Questões exploradas no MAKEIT OR BREAKIT" },
      { key: "home.carousel.ask_pcb", en: "🔍 Ask PCB", pt: "🔍 Perguntar ao PCB" },
      { key: "home.featured.title",   en: "Questions worth exploring", pt: "Questões que valem a pena explorar" },
      { key: "home.featured.play",    en: "Play Segment", pt: "Reproduzir Segmento" },
      { key: "home.episodes.title",        en: "Latest Episodes",     pt: "Últimos Episódios" },
      { key: "home.episodes.subtitle",     en: "Fresh insights from industry leaders.", pt: "Perspetivas frescas de líderes da indústria." },
      { key: "home.episodes.view_all",     en: "View All",            pt: "Ver Todos" },
      { key: "home.episodes.add",          en: "Add Episode",         pt: "Adicionar Episódio" },
      { key: "home.episodes.add_first",    en: "Add First Episode",   pt: "Adicionar Primeiro Episódio" },
      { key: "home.episodes.none",         en: "No episodes yet.",    pt: "Ainda não há episódios." },
      { key: "home.episodes.view_all_mobile", en: "View All Episodes", pt: "Ver Todos os Episódios" },
      { key: "home.admin.visibility", en: "Section visibility:", pt: "Visibilidade de secção:" },
      { key: "home.admin.carousel",   en: "Questions Carousel",     pt: "Carrossel de Questões" },
      { key: "home.admin.featured",   en: "Featured Q&A Cards",     pt: "Cartões Q&A em Destaque" },
      { key: "home.admin.only",       en: "Only visible to admins", pt: "Apenas visível para admins" },
      // Episodes
      { key: "episodes.archive",             en: "Archive",           pt: "Arquivo" },
      { key: "episodes.title",               en: "All Episodes",      pt: "Todos os Episódios" },
      { key: "episodes.loading",             en: "Loading…",          pt: "A carregar…" },
      { key: "episodes.count_one",           en: "1 episode available",     pt: "1 episódio disponível" },
      { key: "episodes.count_many",          en: "{n} episodes available",  pt: "{n} episódios disponíveis" },
      { key: "episodes.add",                 en: "Add Episode",       pt: "Adicionar Episódio" },
      { key: "episodes.search_placeholder",  en: "Search episodes…",  pt: "Pesquisar episódios…" },
      { key: "episodes.showing",             en: "Showing",           pt: "A mostrar" },
      { key: "episodes.result_singular",     en: "result",            pt: "resultado" },
      { key: "episodes.result_plural",       en: "results",           pt: "resultados" },
      { key: "episodes.in_category",         en: "in \"{cat}\"",      pt: "em \"{cat}\"" },
      { key: "episodes.for_query",           en: "for \"{q}\"",       pt: "para \"{q}\"" },
      { key: "episodes.no_results",          en: "No episodes found", pt: "Nenhum episódio encontrado" },
      { key: "episodes.no_results_query",    en: "No results for \"{q}\"",         pt: "Sem resultados para \"{q}\"" },
      { key: "episodes.no_results_category", en: "No episodes in this category yet.", pt: "Ainda não há episódios nesta categoria." },
      // About
      { key: "about.badge",             en: "About MAKEIT.TECH Podcasts", pt: "Sobre MAKEIT.TECH Podcasts" },
      { key: "about.hero.title1",       en: "We build things.",         pt: "Construímos coisas." },
      { key: "about.hero.title2",       en: "Then we talk about it.",   pt: "Depois falamos sobre isso." },
      { key: "about.hero.subtitle",     en: "MAKEIT.TECH Podcasts & Videocasts is the media arm of MAKEIT.TECH — a company founded on hardware engineering and driven by a passion for building the future.", pt: "MAKEIT.TECH Podcasts & Videocasts é o braço mediático da MAKEIT.TECH — uma empresa fundada em engenharia de hardware e impulsionada pela paixão de construir o futuro." },
      { key: "about.browse",            en: "Browse Episodes", pt: "Explorar Episódios" },
      { key: "about.subscribe",         en: "Subscribe",       pt: "Subscrever" },
      { key: "about.pillars.title",     en: "What We Stand For",                     pt: "O Que Defendemos" },
      { key: "about.pillars.subtitle",  en: "Four pillars that define everything we create.", pt: "Quatro pilares que definem tudo o que criamos." },
      { key: "about.pillar1.title", en: "Born from Hardware",       pt: "Nascido do Hardware" },
      { key: "about.pillar1.desc",  en: "MAKEIT.TECH started as a hardware engineering company. PCB stands for both Printed Circuit Board — our roots — and Podcast Content Browser — our future.", pt: "A MAKEIT.TECH começou como uma empresa de engenharia de hardware. PCB significa tanto Printed Circuit Board — as nossas raízes — como Podcast Content Browser — o nosso futuro." },
      { key: "about.pillar2.title", en: "Honest Conversations",     pt: "Conversas Honestas" },
      { key: "about.pillar2.desc",  en: "We interview founders, engineers, and designers who are building real things. No fluff, no hype — just genuine insights from people doing the work.", pt: "Entrevistamos fundadores, engenheiros e designers que constroem coisas reais. Sem ruído, sem hype — apenas insights genuínos de pessoas que fazem o trabalho." },
      { key: "about.pillar3.title", en: "AI-Powered Discovery",     pt: "Descoberta com IA" },
      { key: "about.pillar3.desc",  en: "Our PCB feature uses cutting-edge AI to scan every episode and take you to the exact moment you're looking for — no more scrubbing through hours of content.", pt: "O nosso PCB usa IA de ponta para analisar cada episódio e levá-lo ao momento exato que procura — sem mais horas de scrubbing." },
      { key: "about.pillar4.title", en: "A Community of Builders",  pt: "Uma Comunidade de Construtores" },
      { key: "about.pillar4.desc",  en: "We're building a global community of engineers, entrepreneurs, and creatives who are passionate about turning ideas into reality.", pt: "Estamos a construir uma comunidade global de engenheiros, empreendedores e criativos apaixonados por transformar ideias em realidade." },
      { key: "about.cta.title",    en: "Ready to dive in?",  pt: "Pronto para mergulhar?" },
      { key: "about.cta.subtitle", en: "Subscribe to stay updated with our latest episodes, and use PCB to find exactly what you need — instantly.", pt: "Subscreva para ficar atualizado com os nossos últimos episódios e use o PCB para encontrar exatamente o que precisa — instantaneamente." },
      { key: "about.cta.button",   en: "Subscribe Now",      pt: "Subscrever Agora" },
      // Subscribe
      { key: "subscribe.badge",            en: "Never Miss an Episode",  pt: "Nunca Perca um Episódio" },
      { key: "subscribe.title1",           en: "Stay in the",            pt: "Fique a par" },
      { key: "subscribe.title2",           en: "loop.",                  pt: "de tudo." },
      { key: "subscribe.subtitle",         en: "Subscribe to MAKEIT.TECH Podcasts and get notified whenever a new episode drops.", pt: "Subscreva o MAKEIT.TECH Podcasts e seja notificado sempre que um novo episódio for publicado." },
      { key: "subscribe.success.title",    en: "You're subscribed!",     pt: "Subscreveu!" },
      { key: "subscribe.success.desc",     en: "Thanks for subscribing. We'll notify you when new episodes are published.", pt: "Obrigado por subscrever. Notificamo-lo quando novos episódios forem publicados." },
      { key: "subscribe.button",           en: "Subscribe Free",         pt: "Subscrever Gratuitamente" },
      { key: "subscribe.button_loading",   en: "Subscribing…",           pt: "A subscrever…" },
      { key: "subscribe.no_spam",          en: "No spam. Unsubscribe at any time.", pt: "Sem spam. Cancele a subscrição a qualquer momento." },
      { key: "subscribe.benefits.title",   en: "What you'll get",        pt: "O que vai receber" },
      { key: "subscribe.benefit1", en: "New episode notifications delivered to your inbox", pt: "Notificações de novos episódios entregues na sua caixa de entrada" },
      { key: "subscribe.benefit2", en: "Exclusive behind-the-scenes content",               pt: "Conteúdo exclusivo dos bastidores" },
      { key: "subscribe.benefit3", en: "Early access to special series",                    pt: "Acesso antecipado a séries especiais" },
      { key: "subscribe.benefit4", en: "Monthly digest with key highlights",                pt: "Digest mensal com os principais destaques" },
      // Chat
      { key: "chat.bubble",          en: "Ask me anything ✨",        pt: "Pergunte-me qualquer coisa ✨" },
      { key: "chat.header.subtitle", en: "Ask me about episodes or the show", pt: "Pergunte-me sobre episódios ou o programa" },
      { key: "chat.clear",           en: "Clear",                     pt: "Limpar" },
      { key: "chat.placeholder",     en: "Ask me anything...",        pt: "Pergunte-me qualquer coisa..." },
      { key: "chat.welcome",         en: "Hi! I'm the MAKEIT OR BREAKIT assistant. Ask me anything about our episodes, the show, or how to get involved!", pt: "Olá! Sou o assistente do MAKEIT OR BREAKIT. Pergunte-me qualquer coisa sobre os nossos episódios, o programa ou como se envolver!" },
      { key: "chat.browse_episodes", en: "Browse Episodes",           pt: "Ver Episódios" },
      { key: "chat.contact_us",      en: "Contact Us",                pt: "Contacte-nos" },
      { key: "chat.clear_welcome",   en: "Hi! I'm the MAKEIT OR BREAKIT assistant. Ask me anything!", pt: "Olá! Sou o assistente do MAKEIT OR BREAKIT. Pergunte-me qualquer coisa!" },
      { key: "chat.error",           en: "Sorry, something went wrong. Please try again.", pt: "Desculpe, algo correu mal. Por favor tente novamente." },
      { key: "chat.word_limit",      en: "Max 100 words per message", pt: "Máx. 100 palavras por mensagem" },
    ];

    try {
      for (const row of seedData) {
        await db.insert(translations)
          .values(row)
          .onConflictDoUpdate({ target: translations.key, set: { en: row.en, pt: row.pt } });
      }
      res.json({ success: true, count: seedData.length });
    } catch (err) {
      console.error("translations seed error:", err);
      res.status(500).json({ message: "Seed failed" });
    }
  });

  await seedDatabase();

  return httpServer;
}

// ── Voyage AI embedding helper ──────────────────────────────────────────────
async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "voyage-3", input: [text] }),
  });
  if (!res.ok) throw new Error(`Voyage AI error: ${res.status}`);
  const data = await res.json() as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

// ── Generate and store embeddings for a single episode ───────────────────────
async function generateAndStoreEmbeddings(episodeId: number) {
  const episode = await storage.getPodcast(episodeId);
  if (!episode) return;

  const chunks: Array<{
    chunkType: string;
    chunkIndex: number;
    content: string;
    timeRef?: string;
    topic?: string;
  }> = [];

  chunks.push({
    chunkType: "description",
    chunkIndex: 0,
    content: `Episode: ${episode.title}\n${episode.description}`,
  });

  const transcripts = episode.transcripts as Array<{ time: string; topic: string; text: string }>;
  transcripts.forEach((t, i) => {
    chunks.push({
      chunkType: "key_moment",
      chunkIndex: i + 1,
      content: `[${t.time}] ${t.topic}: ${t.text}`,
      timeRef: t.time,
      topic: t.topic,
    });
  });

  const texts = chunks.map(c => c.content);
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "voyage-3", input: texts }),
  });
  const embData = await res.json() as { data: Array<{ embedding: number[] }> };

  await db.delete(episodeChunks).where(eq(episodeChunks.episodeId, episodeId));

  await db.insert(episodeChunks).values(
    chunks.map((c, i) => ({
      episodeId,
      chunkType: c.chunkType,
      chunkIndex: c.chunkIndex,
      content: c.content,
      timeRef: c.timeRef ?? null,
      topic: c.topic ?? null,
      embedding: embData.data[i].embedding,
    }))
  );

  console.log(`[Embeddings] Stored ${chunks.length} chunks for episode ${episodeId}`);
}

// ── pgvector cosine similarity search ───────────────────────────────────────
async function searchChunks(queryEmbedding: number[], topK = 12): Promise<unknown[]> {
  const vectorStr = `[${queryEmbedding.join(",")}]`;
  const results = await db.execute(sql`
    SELECT
      ec.id,
      ec.episode_id,
      ec.chunk_type,
      ec.content,
      ec.time_ref,
      ec.topic,
      p.title AS episode_title,
      1 - (ec.embedding <=> ${vectorStr}::vector) AS similarity
    FROM episode_chunks ec
    LEFT JOIN podcasts p ON p.id = ec.episode_id
    WHERE 1 - (ec.embedding <=> ${vectorStr}::vector) > 0.35
    ORDER BY ec.embedding <=> ${vectorStr}::vector
    LIMIT ${topK}
  `);
  return results.rows;
}

async function regenerateQuestions(): Promise<string[]> {
  const episodes = await storage.getPodcasts();

  if (episodes.length === 0) {
    // Clear both caches when no episodes remain
    await db.delete(generatedContent).where(eq(generatedContent.key, 'homepage_questions'));
    await db.delete(generatedContent).where(eq(generatedContent.key, 'featured_questions'));
    return [];
  }

  const context = episodes.map(ep =>
    `Episode: ${ep.title}\nTopics: ${(ep.transcripts as Array<{time: string; topic: string; text: string}>).map(t => t.topic).join(", ")}`
  ).join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: `You write very short search prompt suggestions for a podcast platform.
Each suggestion must be under 8 words. No exceptions.
Style: casual, curious, conversational — like someone typing into a search bar.
Bad example (too long): "When building an MVP in 2024 with Node.js and React, how do you avoid over-engineering?"
Good examples: "How do you validate an idea fast?", "When should you pivot?", "What kills most startups early?", "How do founders handle burnout?"
Return ONLY a JSON array of exactly 8 strings. No other text.
Format: ["Question 1?", "Question 2?", ...]`,
    messages: [{ role: "user", content: `Topics from our podcast episodes:\n${context}\n\nWrite 8 short search suggestions based on these topics.` }],
  });

  const raw = (response.content[0] as { type: string; text: string }).text
    .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const questions: string[] = JSON.parse(raw);

  await db.insert(generatedContent)
    .values({ key: "homepage_questions", content: questions })
    .onConflictDoUpdate({
      target: generatedContent.key,
      set: { content: questions, generatedAt: new Date() },
    });

  // Also regenerate featured Q&A cards in background
  regenerateFeaturedQuestions().catch((e) => console.error("Featured questions regen failed:", e));

  return questions;
}

async function regenerateFeaturedQuestions(): Promise<Array<{ question: string; answer: string; podcastId: number; timestamp: string }>> {
  const episodes = await storage.getPodcasts();
  if (episodes.length === 0) return [];

  const context = episodes.map(ep =>
    `Episode ID ${ep.id} — "${ep.title}"\nTopics: ${(ep.transcripts as Array<{time: string; topic: string; text: string}>).map(t => `[${t.time}] ${t.topic}`).join(", ")}`
  ).join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: `You generate 3 featured question cards for a podcast platform called MAKEIT OR BREAKIT.
Each card has a short punchy question (max 8 words) and a one-sentence answer that references a specific moment in an episode.
Return ONLY a valid JSON array of exactly 3 objects.
Format: [{ "question": "...", "answer": "...", "podcastId": <number>, "timestamp": "MM:SS" }]
Rules: use real episode IDs and real timestamps from the context provided.`,
    messages: [{ role: "user", content: `Episodes:\n${context}\n\nGenerate 3 featured question cards.` }],
  });

  const raw = (response.content[0] as { type: string; text: string }).text
    .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const items = JSON.parse(raw);

  await db.insert(generatedContent)
    .values({ key: "featured_questions", content: items })
    .onConflictDoUpdate({
      target: generatedContent.key,
      set: { content: items, generatedAt: new Date() },
    });

  return items;
}

function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    // youtube.com/watch?v=VIDEO_ID
    if (parsed.hostname.includes("youtube.com") && parsed.searchParams.get("v")) {
      return parsed.searchParams.get("v");
    }
    // youtu.be/VIDEO_ID
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1).split("?")[0] || null;
    }
    // youtube.com/embed/VIDEO_ID or /shorts/VIDEO_ID
    const match = parsed.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
    if (match) return match[1];
    return null;
  } catch {
    return null;
  }
}

async function seedDatabase() {
  const existing = await storage.getPodcasts();
  if (existing.length === 0) {
    await storage.createPodcast({
      title: "Building an MVP in 2024",
      description: "We discuss how to build a Minimum Viable Product quickly and efficiently, covering tools, mindset, and lessons learnt from real-world founders.",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      thumbnailUrl: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&q=80&w=1000",
      category: "Business",
      transcripts: [
        { time: "00:00", topic: "Introduction", text: "Welcome to MAKEIT.TECH Podcasts. Today we talk about building MVPs." },
        { time: "00:05", topic: "What is an MVP?", text: "An MVP is the smallest thing you can build to test your hypothesis." },
        { time: "00:08", topic: "Recommended Tools", text: "We use Node.js and React for fast iterations and rapid delivery." }
      ]
    });

    await storage.createPodcast({
      title: "Industrial Design Fundamentals",
      description: "A deep dive into industrial design and rapid prototyping, exploring how hardware startups bring physical products from concept to market.",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      thumbnailUrl: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=1000",
      category: "Hardware & PCB",
      transcripts: [
        { time: "00:00", topic: "Introduction", text: "Let's talk about Industrial Design and what it means for hardware startups." },
        { time: "00:05", topic: "Rapid Prototyping", text: "Rapid prototyping lets you fail fast, learn quickly, and iterate." },
        { time: "00:08", topic: "Real-World Testing", text: "Real-world testing is absolutely crucial when building physical products." }
      ]
    });
  }
}
