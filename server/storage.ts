import { db } from "./db";
import { podcasts, type Podcast, type InsertPodcast } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  getPodcasts(): Promise<Podcast[]>;
  getPodcast(id: number): Promise<Podcast | undefined>;
  createPodcast(podcast: InsertPodcast): Promise<Podcast>;
  deletePodcast(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getPodcasts(): Promise<Podcast[]> {
    return await db.select().from(podcasts);
  }

  async getPodcast(id: number): Promise<Podcast | undefined> {
    const [podcast] = await db.select().from(podcasts).where(eq(podcasts.id, id));
    return podcast;
  }

  async createPodcast(podcast: InsertPodcast): Promise<Podcast> {
    const [newPodcast] = await db.insert(podcasts).values(podcast).returning();
    return newPodcast;
  }

  async deletePodcast(id: number): Promise<void> {
    await db.delete(podcasts).where(eq(podcasts.id, id));
  }
}

export const storage = new DatabaseStorage();
