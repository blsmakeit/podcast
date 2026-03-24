import { db } from "./db";
import {
  podcasts, type Podcast, type InsertPodcast,
  mediaCampaigns, type MediaCampaign, type InsertMediaCampaign,
  draftSuggestions, type DraftSuggestion, type InsertDraftSuggestion,
  mediaPosts, type MediaPost, type InsertMediaPost,
  mediaAssets, type MediaAsset, type InsertMediaAsset,
  apiUsageLogs, type ApiUsageLog, type InsertApiUsageLog,
} from "@shared/schema";
import { eq, isNull, notInArray, inArray } from "drizzle-orm";

export interface IStorage {
  getPodcasts(): Promise<Podcast[]>;
  getPodcast(id: number): Promise<Podcast | undefined>;
  createPodcast(podcast: InsertPodcast): Promise<Podcast>;
  updatePodcast(id: number, data: Partial<InsertPodcast>): Promise<Podcast | undefined>;
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

  async updatePodcast(id: number, data: Partial<InsertPodcast>): Promise<Podcast | undefined> {
    const [updated] = await db.update(podcasts).set(data).where(eq(podcasts.id, id)).returning();
    return updated;
  }

  async deletePodcast(id: number): Promise<void> {
    await db.delete(podcasts).where(eq(podcasts.id, id));
  }

  // ─────────────────────────────────────────────────────────────
  // Media Campaigns
  // ─────────────────────────────────────────────────────────────

  async createCampaign(data: InsertMediaCampaign): Promise<MediaCampaign> {
    const [campaign] = await db.insert(mediaCampaigns).values(data).returning();
    return campaign;
  }

  async getCampaigns(): Promise<(MediaCampaign & { episode?: Podcast | null })[]> {
    const campaigns = await db.select().from(mediaCampaigns);
    const result = await Promise.all(
      campaigns.map(async (c) => {
        if (c.episodeId) {
          const ep = await this.getPodcast(c.episodeId);
          return { ...c, episode: ep ?? null };
        }
        return { ...c, episode: null };
      })
    );
    return result;
  }

  async getCampaignById(id: number): Promise<(MediaCampaign & { episode?: Podcast | null }) | undefined> {
    const [campaign] = await db.select().from(mediaCampaigns).where(eq(mediaCampaigns.id, id));
    if (!campaign) return undefined;
    const episode = campaign.episodeId ? await this.getPodcast(campaign.episodeId) : null;
    return { ...campaign, episode: episode ?? null };
  }

  async getCampaignByEpisodeId(episodeId: number): Promise<MediaCampaign | undefined> {
    const [campaign] = await db.select().from(mediaCampaigns).where(eq(mediaCampaigns.episodeId, episodeId));
    return campaign;
  }

  async updateCampaign(id: number, data: Partial<InsertMediaCampaign>): Promise<MediaCampaign | undefined> {
    const [updated] = await db
      .update(mediaCampaigns)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(mediaCampaigns.id, id))
      .returning();
    return updated;
  }

  async getUnprocessedEpisodes(): Promise<Podcast[]> {
    const campaignsWithEpisodes = await db
      .select({ episodeId: mediaCampaigns.episodeId })
      .from(mediaCampaigns)
      .where(eq(mediaCampaigns.inputType, "episode"));

    const processedIds = campaignsWithEpisodes
      .map((c) => c.episodeId)
      .filter((id): id is number => id !== null);

    if (processedIds.length === 0) {
      return await db.select().from(podcasts);
    }

    return await db.select().from(podcasts).where(notInArray(podcasts.id, processedIds));
  }

  // ─────────────────────────────────────────────────────────────
  // Draft Suggestions
  // ─────────────────────────────────────────────────────────────

  async createDraftSuggestions(drafts: InsertDraftSuggestion[]): Promise<DraftSuggestion[]> {
    const inserted = await db.insert(draftSuggestions).values(drafts).returning();
    return inserted;
  }

  async getDraftsByCampaignId(campaignId: number): Promise<DraftSuggestion[]> {
    return await db.select().from(draftSuggestions).where(eq(draftSuggestions.campaignId, campaignId));
  }

  async selectDraft(campaignId: number, draftId: number): Promise<void> {
    // Clear all selections for this campaign
    await db
      .update(draftSuggestions)
      .set({ isSelected: false })
      .where(eq(draftSuggestions.campaignId, campaignId));
    // Select the chosen draft
    await db
      .update(draftSuggestions)
      .set({ isSelected: true })
      .where(eq(draftSuggestions.id, draftId));
    // Update campaign
    await db
      .update(mediaCampaigns)
      .set({ selectedDraftId: draftId, stage: "production", updatedAt: new Date() })
      .where(eq(mediaCampaigns.id, campaignId));
  }

  // ─────────────────────────────────────────────────────────────
  // Media Posts
  // ─────────────────────────────────────────────────────────────

  async createOrUpdatePost(data: InsertMediaPost): Promise<MediaPost> {
    const existing = await db
      .select()
      .from(mediaPosts)
      .where(
        eq(mediaPosts.campaignId, data.campaignId!)
      );
    const match = existing.find(
      (p) => p.postType === data.postType && p.platform === data.platform
    );

    if (match) {
      const [updated] = await db
        .update(mediaPosts)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(mediaPosts.id, match.id))
        .returning();
      return updated;
    }

    const [inserted] = await db.insert(mediaPosts).values(data).returning();
    return inserted;
  }

  async getPostsByCampaignId(campaignId: number): Promise<MediaPost[]> {
    return await db.select().from(mediaPosts).where(eq(mediaPosts.campaignId, campaignId));
  }

  async updatePost(id: number, data: Partial<InsertMediaPost>): Promise<MediaPost | undefined> {
    const [updated] = await db
      .update(mediaPosts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(mediaPosts.id, id))
      .returning();
    return updated;
  }

  // ─────────────────────────────────────────────────────────────
  // Media Assets
  // ─────────────────────────────────────────────────────────────

  async createMediaAsset(data: InsertMediaAsset): Promise<MediaAsset> {
    const [asset] = await db.insert(mediaAssets).values(data).returning();
    return asset;
  }

  async getAssetsByCampaignId(campaignId: number): Promise<MediaAsset[]> {
    return await db.select().from(mediaAssets).where(eq(mediaAssets.campaignId, campaignId));
  }

  // ─────────────────────────────────────────────────────────────
  // API Usage Logs
  // ─────────────────────────────────────────────────────────────

  async createApiUsageLog(data: InsertApiUsageLog): Promise<ApiUsageLog> {
    const [log] = await db.insert(apiUsageLogs).values(data).returning();
    return log;
  }

  async getApiUsageLogs(limit = 500): Promise<ApiUsageLog[]> {
    return await db.select().from(apiUsageLogs).orderBy(apiUsageLogs.createdAt).limit(limit);
  }
}

export const storage = new DatabaseStorage();
