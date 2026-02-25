import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { insertPodcastSchema, generatedContent, siteSettings, subscribers } from "@shared/schema";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Resend } from "resend";
import { db } from "./db";
import { eq } from "drizzle-orm";

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

  await seedDatabase();

  return httpServer;
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
