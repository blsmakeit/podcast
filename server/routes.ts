import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { insertPodcastSchema } from "@shared/schema";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // GET /api/podcasts
  app.get(api.podcasts.list.path, async (req, res) => {
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
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? 'Validation error' });
      }
      console.error(err);
      res.status(500).json({ message: 'Internal server error' });
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
      res.status(204).send();
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
      const { youtubeUrl, title, transcriptSource, transcriptText, analysisMode } = req.body as {
        youtubeUrl?: string;
        title?: string;
        transcriptSource?: "supadata" | "file";
        transcriptText?: string;
        analysisMode?: "full" | "summary";
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

      // ANALYSIS MODE — sample evenly for summary to avoid token overload
      let formattedTranscript: string;
      if (analysisMode === "summary") {
        const MAX_LINES = 200;
        const step = Math.ceil(allLines.length / MAX_LINES);
        formattedTranscript = allLines.filter((_, i) => i % step === 0).join("\n");
      } else {
        formattedTranscript = allLines.join("\n");
      }

      // Ask Claude to analyse the transcript
      const claudeResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: `You are analysing a transcript from a MAKEIT.TECH videocast episode.
Return ONLY a valid JSON object with exactly these fields:
- "description": string (2-3 sentences summarising the episode)
- "category": one of exactly: "Technology" | "Hardware & PCB" | "Design" | "Business" | "AI & Software" | "Innovation" | "Other"
- "keyMoments": array of objects with { "time": "MM:SS", "topic": string (3-5 words), "text": string (1-2 sentences describing what is discussed at this moment) }
  - Include one entry per major topic change, roughly every 1-3 minutes
  - Aim for 8-20 key moments depending on episode length
  - "time" must match a timestamp that appears in the transcript`,
        messages: [{ role: "user", content: `Title: ${title}\n\nTranscript:\n${formattedTranscript}` }],
      });

      const block = claudeResponse.content[0];
      const responseText = block.type === "text" ? block.text : null;
      if (!responseText) {
        return res.status(500).json({ message: "No response from Claude" });
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

  await seedDatabase();

  return httpServer;
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
