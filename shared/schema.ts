import { pgTable, text, serial, integer, real, jsonb, timestamp, customType, boolean, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// pgvector custom type — dimension set to 1024 (BAAI/bge-large-en-v1.5, multilingual-e5-large, voyage-large-2)
const vector = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() { return `vector(${dimensions})`; },
    toDriver(value: number[]): string { return `[${value.join(',')}]`; },
    fromDriver(value: string): number[] { return value.slice(1, -1).split(',').map(Number); },
  })(name);
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
  rawTranscript: text("raw_transcript"),
  guestName: text("guest_name"),
  guestRole: text("guest_role"),
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

export const siteSettings = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const subscribers = pgTable("subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  subscribedAt: timestamp("subscribed_at").defaultNow(),
  source: text("source").default("website"),
});

export const translations = pgTable("translations", {
  id:  serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  en:  text("en").notNull(),
  pt:  text("pt").notNull(),
});

export const episodeChunks = pgTable("episode_chunks", {
  id:         serial("id").primaryKey(),
  episodeId:  integer("episode_id").references(() => podcasts.id, { onDelete: "cascade" }),
  chunkType:  text("chunk_type").notNull(), // 'description' | 'key_moment' | 'company'
  chunkIndex: integer("chunk_index").notNull(),
  content:    text("content").notNull(),
  timeRef:    text("time_ref"),
  topic:      text("topic"),
  embedding:  vector("embedding", 1024),
  createdAt:  timestamp("created_at").defaultNow(),
});

// ─────────────────────────────────────────────────────────────
// Social Media Manager tables
// ─────────────────────────────────────────────────────────────

export const mediaCampaigns = pgTable("media_campaigns", {
  id: serial("id").primaryKey(),
  episodeId: integer("episode_id").references(() => podcasts.id, { onDelete: "set null" }),
  inputType: text("input_type").notNull().default("episode"), // 'episode' | 'image_only'
  stage: text("stage").notNull().default("draft"), // 'draft' | 'production' | 'publication' | 'completed'
  selectedDraftId: integer("selected_draft_id"),
  notes: text("notes"),
  sourceVideoUrl: text("source_video_url"),
  teaserJobId: text("teaser_job_id"),
  teaserJobStatus: text("teaser_job_status"),
  teaserJobProgress: integer("teaser_job_progress").default(0),
  teaserLandscapeUrl: text("teaser_landscape_url"),
  teaserPortraitUrl: text("teaser_portrait_url"),
  teaserStartSeconds: integer("teaser_start_seconds"),
  teaserJobError: text("teaser_job_error"),
  backgroundImageUrl: text("background_image_url"),
  backgroundStyle: text("background_style").default("aurora"), // 'aurora' | 'minimal' | 'grid'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const draftSuggestions = pgTable("draft_suggestions", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => mediaCampaigns.id, { onDelete: "cascade" }),
  rank: integer("rank").notNull(),
  keyMomentIndex: integer("key_moment_index"),
  timestamp: text("timestamp"),
  impactScore: real("impact_score").notNull(),
  impactReason: text("impact_reason"),
  insight: text("insight").notNull(),
  theme: text("theme").notNull(),
  hook: text("hook").notNull(),
  linkedinCaption: text("linkedin_caption").notNull(),
  instagramCaption: text("instagram_caption").notNull(),
  hashtags: text("hashtags").array().notNull().default(sql`'{}'`),
  teaserTimestampSeconds: integer("teaser_timestamp_seconds"),
  teaserReason: text("teaser_reason"),
  isSelected: boolean("is_selected").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const mediaPosts = pgTable("media_posts", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => mediaCampaigns.id, { onDelete: "cascade" }),
  postType: text("post_type").notNull(), // 'teaser' | 'brevemente' | 'guest' | 'insight' | 'launch' | 'reengage' | 'carousel' | 'video_teaser'
  platform: text("platform").notNull(), // 'linkedin' | 'instagram' | 'facebook' | 'twitter' | 'story'
  content: text("content"),
  characterCount: integer("character_count"),
  status: text("status").notNull().default("not_generated"), // 'not_generated' | 'generating' | 'draft' | 'approved' | 'copied' | 'downloaded' | 'published'
  generatedAt: timestamp("generated_at"),
  approvedAt: timestamp("approved_at"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqueCampaignPostPlatform: unique().on(table.campaignId, table.postType, table.platform),
}));

export const mediaAssets = pgTable("media_assets", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => mediaCampaigns.id, { onDelete: "cascade" }),
  assetType: text("asset_type").notNull(), // 'cover_photo' | 'teaser_video' | 'manual_image'
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

// Insert schemas for new tables
export const insertMediaCampaignSchema = createInsertSchema(mediaCampaigns).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDraftSuggestionSchema = createInsertSchema(draftSuggestions).omit({ id: true, createdAt: true });
export const insertMediaPostSchema = createInsertSchema(mediaPosts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMediaAssetSchema = createInsertSchema(mediaAssets).omit({ id: true, uploadedAt: true });

export type MediaCampaign = typeof mediaCampaigns.$inferSelect;
export type InsertMediaCampaign = typeof mediaCampaigns.$inferInsert;
export type DraftSuggestion = typeof draftSuggestions.$inferSelect;
export type InsertDraftSuggestion = typeof draftSuggestions.$inferInsert;
export type MediaPost = typeof mediaPosts.$inferSelect;
export type InsertMediaPost = typeof mediaPosts.$inferInsert;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type InsertMediaAsset = typeof mediaAssets.$inferInsert;

// ─────────────────────────────────────────────────────────────
// API Usage Logs — Claude cost tracking
// ─────────────────────────────────────────────────────────────

export const apiUsageLogs = pgTable("api_usage_logs", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("anthropic"), // 'anthropic' | 'gemini' | 'voyage'
  model: text("model").notNull(),
  endpoint: text("endpoint").notNull(), // e.g. 'chat', 'draft-generation', 'post-generation'
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: integer("cost_usd_micros").notNull().default(0), // stored as microdollars (1 USD = 1_000_000)
  campaignId: integer("campaign_id"),
  episodeId: integer("episode_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ApiUsageLog = typeof apiUsageLogs.$inferSelect;
export type InsertApiUsageLog = typeof apiUsageLogs.$inferInsert;
