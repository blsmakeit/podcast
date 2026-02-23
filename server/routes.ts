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

  await seedDatabase();

  return httpServer;
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
