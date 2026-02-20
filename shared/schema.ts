import { pgTable, text, serial, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const podcasts = pgTable("podcasts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  videoUrl: text("video_url").notNull(),
  thumbnailUrl: text("thumbnail_url").notNull(),
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
