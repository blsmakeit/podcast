import { pgTable, text, serial, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const EPISODE_CATEGORIES = [
  "Technology",
  "Hardware & PCB",
  "Design",
  "Business",
  "AI & Software",
  "Innovation",
  "Other",
] as const;

export type EpisodeCategory = typeof EPISODE_CATEGORIES[number];

export const podcasts = pgTable("podcasts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  videoUrl: text("video_url").notNull(),
  thumbnailUrl: text("thumbnail_url").notNull(),
  category: text("category").notNull().default("Technology"),
  transcripts: jsonb("transcripts").$type<Array<{time: string, topic: string, text: string}>>().notNull().default([]),
});

export const insertPodcastSchema = createInsertSchema(podcasts).omit({ id: true });

export type Podcast = typeof podcasts.$inferSelect;
export type InsertPodcast = z.infer<typeof insertPodcastSchema>;

export type AIQueryRequest = { query: string };
export type AIQueryResponse = {
  podcastId: number | null;
  timestamp: string | null;
  explanation: string;
};

export const generatedContent = pgTable("generated_content", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  content: jsonb("content").notNull(),
  generatedAt: timestamp("generated_at").defaultNow(),
});
