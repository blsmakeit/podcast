import type { Express, Request } from "express";
import type { Server } from "http";
import { uploadImages, uploadVideo } from "./middleware/upload";
import { storage } from "./storage";
import { api } from "@shared/routes";
import {
  insertPodcastSchema,
  generatedContent,
  siteSettings,
  subscribers,
  episodeChunks,
  translations,
  mediaCampaigns,
  draftSuggestions,
  mediaPosts,
  mediaAssets,
  apiUsageLogs,
} from "@shared/schema";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Resend } from "resend";
import { db } from "./db";
import { eq, sql, desc, sum } from "drizzle-orm";
import { companyKnowledge } from "./knowledge/company";
import { calcCostMicros } from "./utils/claudePricing";
import { generateBackgroundSvg } from "./utils/backgroundGenerator";
import { ADMIN_WORKFLOW_KNOWLEDGE } from "./data/adminKnowledge";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const resend = new Resend(process.env.RESEND_API_KEY);

// ── Claude usage logger (fire-and-forget, never throws) ───────────────────
function logUsage(opts: {
  model: string;
  endpoint: string;
  inputTokens: number;
  outputTokens: number;
  campaignId?: number;
  episodeId?: number;
}) {
  const costUsd = calcCostMicros(opts.model, opts.inputTokens, opts.outputTokens);
  storage.createApiUsageLog({
    provider: "anthropic",
    model: opts.model,
    endpoint: opts.endpoint,
    inputTokens: opts.inputTokens,
    outputTokens: opts.outputTokens,
    costUsd,
    campaignId: opts.campaignId ?? null,
    episodeId: opts.episodeId ?? null,
  }).catch((e) => console.warn("[logUsage] failed:", (e as Error).message));
}

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
    const { messages, isAdmin } = req.body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      isAdmin?: boolean;
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

      const adminSection = isAdmin
        ? `\n${ADMIN_WORKFLOW_KNOWLEDGE}\n`
        : "";

      const systemPrompt = `You are the MAKEIT OR BREAKIT chatbot — a helpful assistant for the MAKEIT OR BREAKIT podcast platform.
${adminSection}
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
${isAdmin ? "- You also have detailed knowledge of the Social Media Manager admin workflow — answer admin questions about the pipeline, post types, video teaser generation, and metrics." : ""}

RESPONSE FORMAT — return ONLY valid JSON:
{
  "message": "your response text here",
  "actions": [{ "label": "Go to Contact", "href": "/contact" }],
  "sources": [{ "episodeTitle": "Episode name", "timeRef": "02:37", "topic": "Topic name" }]
}
actions and sources are optional — only include when relevant. Never include empty arrays.`;

      const MODEL = "claude-sonnet-4-6";
      const claudeResponse = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.slice(-10),
      });

      logUsage({
        model: MODEL,
        endpoint: "chat",
        inputTokens: claudeResponse.usage.input_tokens,
        outputTokens: claudeResponse.usage.output_tokens,
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

  // ─────────────────────────────────────────────────────────────────────────
  // Social Media Manager API
  // ─────────────────────────────────────────────────────────────────────────

  // GET /api/social-media/unprocessed-count
  app.get("/api/social-media/unprocessed-count", async (_req, res) => {
    try {
      const episodes = await storage.getUnprocessedEpisodes();
      res.json({
        success: true,
        data: {
          count: episodes.length,
          episodes: episodes.map((e) => ({ id: e.id, title: e.title, createdAt: null })),
        },
      });
    } catch (err) {
      console.error("unprocessed-count error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/social-media/campaigns
  app.get("/api/social-media/campaigns", async (_req, res) => {
    try {
      const campaigns = await storage.getCampaigns();
      res.json({ success: true, data: campaigns });
    } catch (err) {
      console.error("get campaigns error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/social-media/campaigns
  app.post("/api/social-media/campaigns", async (req, res) => {
    try {
      const { episodeId } = req.body as { episodeId: number };
      if (!episodeId) return res.status(400).json({ message: "episodeId is required" });
      const episode = await storage.getPodcast(episodeId);
      if (!episode) return res.status(404).json({ message: "Episode not found" });
      const existing = await storage.getCampaignByEpisodeId(episodeId);
      if (existing) return res.json({ success: true, data: existing });
      const campaign = await storage.createCampaign({ episodeId, inputType: "episode", stage: "draft" });
      res.status(201).json({ success: true, data: campaign });
    } catch (err) {
      console.error("create campaign error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/social-media/campaigns/image-only
  app.post("/api/social-media/campaigns/image-only", async (req, res) => {
    try {
      const { description, imageUrls, postTypes } = req.body as {
        description?: string;
        imageUrls?: string[];
        postTypes?: string[];
      };
      const campaign = await storage.createCampaign({
        inputType: "image_only",
        stage: "production",
        notes: description,
      });
      if (imageUrls?.length) {
        for (const url of imageUrls) {
          await storage.createMediaAsset({
            campaignId: campaign.id,
            assetType: "manual_image",
            fileUrl: url,
            fileName: url.split("/").pop() ?? "image",
          });
        }
      }
      res.status(201).json({ success: true, data: campaign });
    } catch (err) {
      console.error("image-only campaign error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/social-media/campaigns/:id
  app.get("/api/social-media/campaigns/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const campaign = await storage.getCampaignById(id);
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });
      const drafts = await storage.getDraftsByCampaignId(id);
      const posts = await storage.getPostsByCampaignId(id);
      const assets = await storage.getAssetsByCampaignId(id);
      res.json({ success: true, data: { ...campaign, drafts, posts, assets } });
    } catch (err) {
      console.error("get campaign error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/social-media/campaigns/episode/:episodeId
  app.get("/api/social-media/campaigns/episode/:episodeId", async (req, res) => {
    try {
      const episodeId = Number(req.params.episodeId);
      if (isNaN(episodeId)) return res.status(400).json({ message: "Invalid episodeId" });
      const campaign = await storage.getCampaignByEpisodeId(episodeId);
      if (!campaign) return res.json({ success: true, data: null });
      res.json({ success: true, data: campaign });
    } catch (err) {
      console.error("get campaign by episode error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH /api/social-media/campaigns/:id
  app.patch("/api/social-media/campaigns/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const updated = await storage.updateCampaign(id, req.body);
      if (!updated) return res.status(404).json({ message: "Campaign not found" });
      res.json({ success: true, data: updated });
    } catch (err) {
      console.error("update campaign error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/social-media/campaigns/:id/drafts/generate
  app.post("/api/social-media/campaigns/:id/drafts/generate", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

      const campaign = await storage.getCampaignById(id);
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });
      if (!campaign.episode) return res.status(400).json({ message: "Campaign has no linked episode" });

      const episode = campaign.episode;
      const transcripts = (episode.transcripts ?? []) as Array<{ time: string; topic: string; text: string }>;

      const keyMomentsText = transcripts
        .map((t, i) => `[${i}] [${t.time}] ${t.topic} — ${t.text}`)
        .join("\n");

      const guestInfo = episode.guestName
        ? `${episode.guestName}${episode.guestRole ? `, ${episode.guestRole}` : ""}`
        : "Not specified";

      const rawTranscriptSection = episode.rawTranscript
        ? `\nRaw Transcript excerpt (use for authentic insights):\n${episode.rawTranscript.substring(0, 8000)}`
        : "";

      const userMessage = `Episode: "${episode.title}"
Guest: ${guestInfo}
Category: ${episode.category}
Description: ${episode.description}

Key Moments:
${keyMomentsText}
${rawTranscriptSection}

Analyse all key moments. Return a JSON array of exactly 5 objects, ranked by social media impact (emotional resonance, shareability, insight density, potential for engagement). For each object return:
{
  "rank": (1-5, 1 is most impactful),
  "keyMomentIndex": (integer, index in key moments array above),
  "timestamp": ("MM:SS" string),
  "impactScore": (1-10),
  "impactReason": ("one sentence why this moment is impactful for social media"),
  "insight": ("compelling key insight, max 280 chars, paraphrase if no raw transcript provided"),
  "theme": ("3-5 word topic label"),
  "hook": ("scroll-stopping opening line, max 120 chars"),
  "linkedinCaption": ("professional caption max 1300 chars: hook + insight + guest context + CTA to watch"),
  "instagramCaption": ("energetic caption max 2200 chars: hook + emojis + insight + CTA, 10-12 hashtags inline at end"),
  "hashtags": (["8-12 relevant tags without # symbol"]),
  "teaserTimestampSeconds": (integer, start time in seconds for best 20s video clip),
  "teaserReason": ("one sentence why this is the best 20s segment to clip")
}`;

      const DRAFT_MODEL = "claude-sonnet-4-6";
      const claudeResponse = await anthropic.messages.create({
        model: DRAFT_MODEL,
        max_tokens: 8000,
        system: `You are a social media content strategist for MAKEIT.TECH, a hardware R&D and AI company from Portugal. The show is MAKEITorBREAKIT — a 2.5-hour videocast about technology, AI, hardware, and entrepreneurship. Target audience: tech founders, engineers, makers. Brand tone: bold, expert, human, optimistic. Brand colors: Red #D42B2B, White #FFFFFF, Black #0A0A0A. Never use the word "quote" — use "key insight" instead, as content is AI-paraphrased unless raw transcript is provided. Return ONLY valid JSON. No markdown fences. No explanation.`,
        messages: [{ role: "user", content: userMessage }],
      });

      logUsage({
        model: DRAFT_MODEL,
        endpoint: "draft-generation",
        inputTokens: claudeResponse.usage.input_tokens,
        outputTokens: claudeResponse.usage.output_tokens,
        campaignId: id,
        episodeId: campaign.episode?.id,
      });

      const block = claudeResponse.content[0];
      const responseText = block.type === "text" ? block.text : "";
      const cleaned = responseText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed) || parsed.length === 0) {
        return res.status(500).json({ message: "Invalid AI response format" });
      }

      // Clear old drafts for this campaign
      await db.delete(draftSuggestions).where(eq(draftSuggestions.campaignId, id));

      const draftsToInsert = parsed.map((d: any) => ({
        campaignId: id,
        rank: d.rank,
        keyMomentIndex: d.keyMomentIndex ?? null,
        timestamp: d.timestamp ?? null,
        impactScore: Math.round(Number(d.impactScore ?? 5) * 10) / 10,
        impactReason: d.impactReason ?? null,
        insight: d.insight,
        theme: d.theme,
        hook: d.hook,
        linkedinCaption: d.linkedinCaption,
        instagramCaption: d.instagramCaption,
        hashtags: d.hashtags ?? [],
        teaserTimestampSeconds: d.teaserTimestampSeconds ?? null,
        teaserReason: d.teaserReason ?? null,
        isSelected: false,
      }));

      const savedDrafts = await storage.createDraftSuggestions(draftsToInsert);
      res.json({ success: true, data: savedDrafts });
    } catch (err) {
      console.error("draft generation error:", err);
      res.status(500).json({ message: "Draft generation failed. Please try again." });
    }
  });

  // GET /api/social-media/campaigns/:id/drafts
  app.get("/api/social-media/campaigns/:id/drafts", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const drafts = await storage.getDraftsByCampaignId(id);
      res.json({ success: true, data: drafts });
    } catch (err) {
      console.error("get drafts error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH /api/social-media/campaigns/:id/drafts/:draftId/select
  app.patch("/api/social-media/campaigns/:id/drafts/:draftId/select", async (req, res) => {
    try {
      const campaignId = Number(req.params.id);
      const draftId = Number(req.params.draftId);
      if (isNaN(campaignId) || isNaN(draftId)) return res.status(400).json({ message: "Invalid ids" });
      await storage.selectDraft(campaignId, draftId);
      const campaign = await storage.getCampaignById(campaignId);
      res.json({ success: true, data: campaign });
    } catch (err) {
      console.error("select draft error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/social-media/campaigns/:id/posts
  app.get("/api/social-media/campaigns/:id/posts", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const posts = await storage.getPostsByCampaignId(id);
      res.json({ success: true, data: posts });
    } catch (err) {
      console.error("get posts error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/social-media/campaigns/:id/posts/generate
  app.post("/api/social-media/campaigns/:id/posts/generate", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

      const { postType, platforms } = req.body as { postType: string; platforms: string[] };
      if (!postType) return res.status(400).json({ message: "postType is required" });

      const campaign = await storage.getCampaignById(id);
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });
      if (!campaign.episode) return res.status(400).json({ message: "Campaign has no linked episode" });

      const episode = campaign.episode;
      const drafts = await storage.getDraftsByCampaignId(id);
      const selectedDraft = drafts.find((d) => d.isSelected) ?? drafts[0];

      if (!selectedDraft) return res.status(400).json({ message: "No draft selected" });

      const guestName = episode.guestName ?? "";
      const guestRole = episode.guestRole ?? "";
      const transcriptContext = episode.rawTranscript
        ? `\nTranscript context:\n${episode.rawTranscript.substring(0, 4000)}`
        : "";

      const baseContext = `Episode: "${episode.title}"
Guest: ${guestName}${guestRole ? `, ${guestRole}` : ""}
Category: ${episode.category}
Description: ${episode.description}

Selected Key Insight: ${selectedDraft.insight}
Theme: ${selectedDraft.theme}
Hook: ${selectedDraft.hook}
Timestamp: ${selectedDraft.timestamp ?? "N/A"}
${transcriptContext}`;

      const postTypeInstructions: Record<string, string> = {
        teaser: `Write a POST TEASER — "O episódio está no ar" (The episode is live).
LinkedIn (max 1300 chars): exciting live-now energy, lead with the hook, include the key insight, mention the guest, end with strong CTA to watch. Max 3 hashtags.
Instagram (max 2200 chars): high energy with emojis, lead with hook, develop the insight, mention guest, strong CTA, 10-12 hashtags at the end.
Return JSON: {"linkedin": {"content": "...", "charCount": N}, "instagram": {"content": "...", "charCount": N}}`,

        brevemente: `Write a POST BREVEMENTE — pre-launch teaser (episode not yet live, building anticipation).
LinkedIn (max 1000 chars): build anticipation, mysterious angle, hint at topic without spoilers, end with "Em breve na plataforma MAKEIT.TECH". Max 3 hashtags.
Instagram (max 1500 chars): teaser energy, 1 strong question to the audience, no spoilers, 8 hashtags.
Story (max 150 chars): ultra-short, create urgency, one powerful line.
Return JSON: {"linkedin": {"content": "...", "charCount": N}, "instagram": {"content": "...", "charCount": N}, "story": {"content": "...", "charCount": N}}`,

        guest: `Write a POST CONVIDADO — guest spotlight.
LinkedIn (max 1300 chars): professional bio-style intro, guest expertise, why this person matters to the tech/hardware/AI industry, credibility-first approach, subtle mention of the episode.
Instagram (max 2200 chars): warm and excited guest introduction, key achievement, what they brought to the show, conversational tone, 8-10 hashtags.
Return JSON: {"linkedin": {"content": "...", "charCount": N}, "instagram": {"content": "...", "charCount": N}}`,

        insight: `Write a POST INSIGHT — thought-provoking key insight post.
LinkedIn (max 1300 chars): lead with the insight as a bold statement or provocative question, discuss implications for the industry, professional analytical tone, ends with invitation to watch the full episode.
Instagram (max 2200 chars): insight-first, expands on the theme conversationally, adds context and the author's reaction, 10 hashtags.
Return JSON: {"linkedin": {"content": "...", "charCount": N}, "instagram": {"content": "...", "charCount": N}}`,

        launch: `Write a POST LANÇAMENTO — full launch day post.
LinkedIn (max 1300 chars visible before "see more"): article-opener style, episode overview with 3 key themes, guest credentials snippet, CTA to watch the full episode. Professional, thorough.
Instagram (max 2200 chars): full launch energy, episode overview, guest, 3 key themes, strong CTA, 12 hashtags.
Facebook: long-form version, most comprehensive, share all key themes and guest background, no char limit.
Return JSON: {"linkedin": {"content": "...", "charCount": N}, "instagram": {"content": "...", "charCount": N}, "facebook": {"content": "...", "charCount": N}}`,

        reengage: `Write a POST RE-ENGAGEMENT — 1 week after launch, bring the episode back.
LinkedIn (max 1000 chars): "Did you catch this?" framing, choose a DIFFERENT angle from the main launch post, highlight one insight not yet shared, soft CTA.
Instagram (max 1500 chars): "In case you missed it" energy, new hook for same episode, different insight highlighted, 8 hashtags.
Return JSON: {"linkedin": {"content": "...", "charCount": N}, "instagram": {"content": "...", "charCount": N}}`,

        carousel: `Write a CAROUSEL concept — 5 educational slides summarising the episode's key insights.
Return a JSON array of 5 slide objects:
[{
  "slideNumber": 1,
  "title": "Hook question or statement (max 60 chars)",
  "bodyText": "1-2 lines of content (max 100 chars)",
  "visualHint": "brief note on what image/graphic would work"
}]
Slide 1: hook/question, Slides 2-4: key insights, Slide 5: CTA with episode info.
Return JSON: {"slides": [{"slideNumber": N, "title": "...", "bodyText": "...", "visualHint": "..."}]}`,

        video_teaser: `Write a VIDEO TEASER POST — accompanying the 20-second video clip.
Instagram Reels caption (max 150 chars): one punchy hook line, 3-5 hashtags. Ultra short. Must make people want to watch.
LinkedIn (max 500 chars): context sentence + one key insight from the clip + CTA to watch the full episode.
Return JSON: {"instagram": {"content": "...", "charCount": N}, "linkedin": {"content": "...", "charCount": N}}`,
      };

      const instructions = postTypeInstructions[postType];
      if (!instructions) return res.status(400).json({ message: `Unknown post type: ${postType}` });

      const POST_MODEL = "claude-sonnet-4-6";
      const claudeResponse = await anthropic.messages.create({
        model: POST_MODEL,
        max_tokens: 4096,
        system: `You are a social media content strategist for MAKEIT.TECH. Write engaging content for the MAKEITorBREAKIT podcast. Brand tone: bold, expert, human, optimistic. Never use the word "quote" — always say "key insight". Return ONLY valid JSON. No markdown fences.`,
        messages: [{ role: "user", content: `${baseContext}\n\n${instructions}` }],
      });

      logUsage({
        model: POST_MODEL,
        endpoint: `post-generation:${postType}`,
        inputTokens: claudeResponse.usage.input_tokens,
        outputTokens: claudeResponse.usage.output_tokens,
        campaignId: id,
        episodeId: campaign.episode?.id,
      });

      const block = claudeResponse.content[0];
      const responseText = block.type === "text" ? block.text : "";
      const cleaned = responseText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(cleaned);

      // For carousel, store as single JSON blob in instagram
      if (postType === "carousel") {
        const content = JSON.stringify(parsed.slides ?? parsed);
        const savedPost = await storage.createOrUpdatePost({
          campaignId: id,
          postType,
          platform: "instagram",
          content,
          characterCount: content.length,
          status: "draft",
          generatedAt: new Date(),
        });
        return res.json({ success: true, data: { postType, posts: [savedPost] } });
      }

      const savedPosts = [];
      for (const [platform, data] of Object.entries(parsed)) {
        const platformData = data as { content: string; charCount: number };
        const saved = await storage.createOrUpdatePost({
          campaignId: id,
          postType,
          platform,
          content: platformData.content,
          characterCount: platformData.charCount ?? platformData.content.length,
          status: "draft",
          generatedAt: new Date(),
        });
        savedPosts.push(saved);
      }

      res.json({ success: true, data: { postType, posts: savedPosts } });
    } catch (err) {
      console.error("post generation error:", err);
      res.status(500).json({ message: "Post generation failed. Please try again." });
    }
  });

  // PATCH /api/social-media/campaigns/:id/posts/:postId
  app.patch("/api/social-media/campaigns/:id/posts/:postId", async (req, res) => {
    try {
      const postId = Number(req.params.postId);
      if (isNaN(postId)) return res.status(400).json({ message: "Invalid post id" });
      const { content } = req.body as { content: string };
      const updated = await storage.updatePost(postId, {
        content,
        characterCount: content?.length ?? 0,
      });
      if (!updated) return res.status(404).json({ message: "Post not found" });
      res.json({ success: true, data: updated });
    } catch (err) {
      console.error("update post error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH /api/social-media/campaigns/:id/posts/:postId/approve
  app.patch("/api/social-media/campaigns/:id/posts/:postId/approve", async (req, res) => {
    try {
      const postId = Number(req.params.postId);
      if (isNaN(postId)) return res.status(400).json({ message: "Invalid post id" });
      const updated = await storage.updatePost(postId, {
        status: "approved",
        approvedAt: new Date(),
      });
      if (!updated) return res.status(404).json({ message: "Post not found" });
      res.json({ success: true, data: updated });
    } catch (err) {
      console.error("approve post error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH /api/social-media/campaigns/:id/posts/:postId/status
  app.patch("/api/social-media/campaigns/:id/posts/:postId/status", async (req, res) => {
    try {
      const postId = Number(req.params.postId);
      if (isNaN(postId)) return res.status(400).json({ message: "Invalid post id" });
      const { status } = req.body as { status: string };
      const updateData: Record<string, unknown> = { status };
      if (status === "published") updateData.publishedAt = new Date();
      const updated = await storage.updatePost(postId, updateData as any);
      if (!updated) return res.status(404).json({ message: "Post not found" });
      res.json({ success: true, data: updated });
    } catch (err) {
      console.error("update post status error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/social-media/campaigns/:id/publication
  app.get("/api/social-media/campaigns/:id/publication", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const campaign = await storage.getCampaignById(id);
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });
      const posts = await storage.getPostsByCampaignId(id);
      const assets = await storage.getAssetsByCampaignId(id);
      const drafts = await storage.getDraftsByCampaignId(id);
      const selectedDraft = drafts.find((d) => d.isSelected) ?? null;

      const approvedPosts = posts.filter((p) => ["approved", "copied", "downloaded", "published"].includes(p.status));
      const byPlatform: Record<string, typeof approvedPosts> = {};
      for (const post of approvedPosts) {
        if (!byPlatform[post.platform]) byPlatform[post.platform] = [];
        byPlatform[post.platform].push(post);
      }

      res.json({
        success: true,
        data: {
          campaign,
          episode: campaign.episode,
          selectedDraft,
          postsByPlatform: byPlatform,
          allPosts: posts,
          assets,
        },
      });
    } catch (err) {
      console.error("get publication error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/social-media/media/upload
  app.post("/api/social-media/media/upload", (req, res) => {
    uploadImages.array("images", 3)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      const files = (req as any).files as Express.Multer.File[] ?? [];
      const data = files.map((f) => ({
        fileUrl: `/uploads/media/${f.filename}`,
        fileName: f.filename,
        fileSize: f.size,
        mimeType: f.mimetype,
      }));
      res.json({ success: true, data });
    });
  });

  // POST /api/social-media/campaigns/:id/teaser/upload-source
  app.post("/api/social-media/campaigns/:id/teaser/upload-source", (req, res) => {
    uploadVideo.single("video")(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
        const file = (req as any).file as Express.Multer.File | undefined;
        if (!file) return res.status(400).json({ message: "No video file uploaded" });
        const sourceVideoUrl = `/uploads/videos/${file.filename}`;
        await storage.updateCampaign(id, { sourceVideoUrl });
        res.json({ success: true, data: { sourceVideoUrl, fileName: file.filename } });
      } catch (error) {
        res.status(500).json({ message: "Upload failed" });
      }
    });
  });

  // POST /api/social-media/campaigns/:id/teaser/generate
  app.post("/api/social-media/campaigns/:id/teaser/generate", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const { startSeconds } = req.body as { startSeconds: number };

      const campaign = await storage.getCampaignById(id);
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });
      if (!campaign.sourceVideoUrl) return res.status(400).json({ message: "No source video uploaded yet" });

      const episode = campaign.episode;
      const sourceVideoPath = campaign.sourceVideoUrl.startsWith("/uploads")
        ? `.${campaign.sourceVideoUrl}`
        : campaign.sourceVideoUrl;

      // Try to enqueue — graceful fail if Redis not available
      let jobId: string | null = null;
      try {
        const { videoQueue } = await import("./jobs/queue.js");
        const job = await videoQueue.add("generate-teaser", {
          campaignId: id,
          sourceVideoPath,
          startSeconds: startSeconds ?? campaign.teaserStartSeconds ?? 0,
          duration: 20,
          episodeTitle: episode?.title ?? "",
          guestName: episode?.guestName ?? "",
          guestRole: episode?.guestRole ?? "",
        });
        jobId = job.id ?? null;
      } catch (redisErr) {
        console.warn("[Queue] Redis not available, cannot enqueue video job:", (redisErr as Error).message);
        return res.status(503).json({ message: "Video processing queue unavailable. Please ensure Redis is running." });
      }

      await storage.updateCampaign(id, {
        teaserJobId: jobId ?? undefined,
        teaserJobStatus: "queued",
        teaserJobProgress: 0,
        teaserStartSeconds: startSeconds ?? campaign.teaserStartSeconds ?? 0,
        teaserJobError: undefined,
      });

      res.json({ success: true, data: { jobId, status: "queued" } });
    } catch (err) {
      console.error("teaser generate error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/social-media/campaigns/:id/teaser/status
  app.get("/api/social-media/campaigns/:id/teaser/status", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const campaign = await storage.getCampaignById(id);
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });
      res.json({
        success: true,
        data: {
          jobId: campaign.teaserJobId,
          status: campaign.teaserJobStatus,
          progress: campaign.teaserJobProgress,
          landscapeUrl: campaign.teaserLandscapeUrl,
          portraitUrl: campaign.teaserPortraitUrl,
          error: campaign.teaserJobError,
          startSeconds: campaign.teaserStartSeconds,
        },
      });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── TASK 1: yt-dlp YouTube download ─────────────────────────────────────
  app.post("/api/social-media/campaigns/:id/teaser/download-youtube", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

      const { youtubeUrl } = req.body as { youtubeUrl: string };
      if (!youtubeUrl) return res.status(400).json({ message: "youtubeUrl is required" });

      const campaign = await storage.getCampaignById(id);
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });

      const VIDEO_STORAGE_PATH = process.env.VIDEO_STORAGE_PATH || "./uploads/videos";
      const { spawn } = await import("child_process");
      const path = await import("path");
      const outputFile = path.resolve(VIDEO_STORAGE_PATH, `${id}-source.mp4`);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const proc = spawn("yt-dlp", [
        "--no-playlist",
        "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "--merge-output-format", "mp4",
        "--progress",
        "--newline",
        "-o", outputFile,
        youtubeUrl,
      ]);

      let lastProgress = 0;

      proc.stdout.on("data", (chunk: Buffer) => {
        const line = chunk.toString();
        const match = line.match(/(\d+(?:\.\d+)?)%/);
        if (match) {
          const pct = Math.floor(Number(match[1]));
          if (pct !== lastProgress) {
            lastProgress = pct;
            res.write(`data: ${JSON.stringify({ progress: pct })}\n\n`);
          }
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const line = chunk.toString();
        const match = line.match(/(\d+(?:\.\d+)?)%/);
        if (match) {
          const pct = Math.floor(Number(match[1]));
          if (pct !== lastProgress) {
            lastProgress = pct;
            res.write(`data: ${JSON.stringify({ progress: pct })}\n\n`);
          }
        }
      });

      proc.on("close", async (code: number) => {
        if (code === 0) {
          const sourceVideoUrl = `/uploads/videos/${id}-source.mp4`;
          await storage.updateCampaign(id, { sourceVideoUrl });
          res.write(`data: ${JSON.stringify({ done: true, sourceVideoUrl })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ error: "yt-dlp exited with code " + code })}\n\n`);
        }
        res.end();
      });

      proc.on("error", (err: Error) => {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      });
    } catch (err) {
      console.error("yt-dlp download error:", err);
      res.status(500).json({ message: "Download failed" });
    }
  });

  // ─── TASK 3: PCB Background generator ────────────────────────────────────

  // GET /api/social-media/backgrounds/preview — returns SVG for a given style + seed
  app.get("/api/social-media/backgrounds/preview", (req, res) => {
    const style = (req.query.style as string) || "aurora";
    const seed = parseInt((req.query.seed as string) || "42", 10);
    const svg = generateBackgroundSvg({ style: style as any, seed, width: 1200, height: 630 });
    res.setHeader("Content-Type", "image/svg+xml");
    res.send(svg);
  });

  // POST /api/social-media/campaigns/:id/background/generate — save style+seed to campaign
  app.post("/api/social-media/campaigns/:id/background/generate", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const { style, seed } = req.body as { style?: string; seed?: number };
      const finalSeed = seed ?? id; // default: use campaign id as seed for determinism
      const finalStyle = style || "aurora";
      const url = `/api/social-media/backgrounds/preview?style=${finalStyle}&seed=${finalSeed}`;
      await storage.updateCampaign(id, {
        backgroundImageUrl: url,
        backgroundStyle: finalStyle,
      });
      res.json({ success: true, data: { backgroundImageUrl: url, backgroundStyle: finalStyle } });
    } catch (err) {
      console.error("background generate error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // DELETE /api/social-media/campaigns/:id/background — clear background
  app.delete("/api/social-media/campaigns/:id/background", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      await storage.updateCampaign(id, { backgroundImageUrl: undefined, backgroundStyle: undefined });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── TASK 4: Metrics endpoints ────────────────────────────────────────────

  // GET /api/social-media/metrics — total & per-endpoint cost summary
  app.get("/api/social-media/metrics", async (_req, res) => {
    try {
      const logs = await storage.getApiUsageLogs(1000);
      const totalInputTokens = logs.reduce((s, l) => s + l.inputTokens, 0);
      const totalOutputTokens = logs.reduce((s, l) => s + l.outputTokens, 0);
      const totalCostMicros = logs.reduce((s, l) => s + l.costUsd, 0);

      // Group by endpoint
      const byEndpoint: Record<string, { calls: number; inputTokens: number; outputTokens: number; costMicros: number }> = {};
      for (const l of logs) {
        if (!byEndpoint[l.endpoint]) byEndpoint[l.endpoint] = { calls: 0, inputTokens: 0, outputTokens: 0, costMicros: 0 };
        byEndpoint[l.endpoint].calls++;
        byEndpoint[l.endpoint].inputTokens += l.inputTokens;
        byEndpoint[l.endpoint].outputTokens += l.outputTokens;
        byEndpoint[l.endpoint].costMicros += l.costUsd;
      }

      // Recent 20 logs
      const recent = logs.slice(-20).reverse();

      res.json({
        success: true,
        data: {
          totalCalls: logs.length,
          totalInputTokens,
          totalOutputTokens,
          totalCostMicros,
          totalCostUsd: totalCostMicros / 1_000_000,
          byEndpoint,
          recent,
        },
      });
    } catch (err) {
      console.error("metrics error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── TASK 6: Published posts history ─────────────────────────────────────

  // GET /api/social-media/metrics/published-posts — campaigns with published posts
  app.get("/api/social-media/metrics/published-posts", async (_req, res) => {
    try {
      const campaigns = await storage.getCampaigns();
      const result = await Promise.all(
        campaigns.map(async (c) => {
          const posts = await storage.getPostsByCampaignId(c.id);
          const publishedPosts = posts.filter((p) => p.status === "published");
          return { ...c, publishedPosts, publishedCount: publishedPosts.length };
        })
      );
      // Only return campaigns with at least one published post OR stage = completed
      const filtered = result.filter((c) => c.publishedCount > 0 || c.stage === "completed");
      res.json({ success: true, data: filtered });
    } catch (err) {
      console.error("published-posts error:", err);
      res.status(500).json({ message: "Internal server error" });
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
