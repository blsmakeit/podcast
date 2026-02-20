import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI(); 

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get(api.podcasts.list.path, async (req, res) => {
    const allPodcasts = await storage.getPodcasts();
    res.json(allPodcasts);
  });

  app.get(api.podcasts.get.path, async (req, res) => {
    const podcast = await storage.getPodcast(Number(req.params.id));
    if (!podcast) {
      return res.status(404).json({ message: 'Podcast not found' });
    }
    res.json(podcast);
  });

  app.post(api.ai.search.path, async (req, res) => {
    try {
      const input = api.ai.search.input.parse(req.body);
      
      const allPodcasts = await storage.getPodcasts();
      const context = allPodcasts.map(p => `Podcast ID: ${p.id}\nTitle: ${p.title}\nDescription: ${p.description}\nTranscripts: ${JSON.stringify(p.transcripts)}`).join('\n\n');

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: "You are an AI assistant for a podcast platform. Given the user's query, find the most relevant podcast and the exact timestamp where the topic is discussed based on the provided context. Return ONLY a JSON object with 'podcastId' (number), 'timestamp' (string like 'MM:SS' or 'HH:MM:SS'), and 'explanation' (string explaining why this timestamp is relevant). If no relevant podcast is found, return podcastId null and timestamp null." 
          },
          { role: "user", content: `Context:\n${context}\n\nQuery: ${input.query}` }
        ],
        response_format: { type: "json_object" }
      });

      const resultText = response.choices[0].message.content;
      if (!resultText) throw new Error("No response from AI");
      
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

  // Seed data
  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const existing = await storage.getPodcasts();
  if (existing.length === 0) {
    await storage.createPodcast({
      title: "Building MVP in 2024",
      description: "We discuss how to build a Minimum Viable Product quickly and efficiently.",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      thumbnailUrl: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&q=80&w=1000",
      transcripts: [
        { time: "00:00", topic: "Intro", text: "Welcome to MakeIt podcasts." },
        { time: "00:05", topic: "MVP Definition", text: "An MVP is the smallest thing you can build to test your hypothesis." },
        { time: "00:08", topic: "Tools", text: "We use Node.js and React mostly for fast iterations." }
      ]
    });
    
    await storage.createPodcast({
      title: "Industrial Design Basics",
      description: "A deep dive into industrial design and rapid prototyping.",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      thumbnailUrl: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=1000",
      transcripts: [
        { time: "00:00", topic: "Intro", text: "Let's talk about Industrial Design." },
        { time: "00:05", topic: "Prototyping", text: "Rapid prototyping lets you fail fast and learn." },
        { time: "00:08", topic: "Testing", text: "Real world testing is crucial for hardware." }
      ]
    });
  }
}
