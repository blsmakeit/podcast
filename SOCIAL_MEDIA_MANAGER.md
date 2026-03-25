# Social Media Manager — Technical Reference

This document is a deep-dive into the Social Media Manager module of the MAKEIT.TECH Media Navigator platform. It covers the campaign workflow, post types, AI strategy, video pipeline, and all admin tooling.

---

## Overview

The Social Media Manager turns a podcast episode (or a standalone image set) into a complete, publication-ready social media campaign. The workflow is linear and stage-gated:

```
Episode or Image input
        │
        ▼
  ┌─────────────┐
  │    DRAFT    │  AI generates 5 ranked content drafts from episode data
  └──────┬──────┘
         │  Admin selects 1 draft
         ▼
  ┌─────────────┐
  │ PRODUCTION  │  Admin generates + approves up to 8 post types × 4 platforms
  └──────┬──────┘
         │  Posts approved
         ▼
  ┌─────────────┐
  │ PUBLICATION │  Copy/download text; upload video teaser; generate background
  └──────┬──────┘
         │  Admin marks published
         ▼
  ┌─────────────┐
  │  COMPLETED  │  Campaign archived
  └─────────────┘
```

Each campaign is one row in `media_campaigns`. Stage transitions are manual — the admin advances each stage explicitly.

---

## Database Tables

### `media_campaigns`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `episodeId` | integer → podcasts | Nullable for image-only campaigns |
| `inputType` | text | `episode` \| `image_only` |
| `stage` | text | `draft` \| `production` \| `publication` \| `completed` |
| `selectedDraftId` | integer → draft_suggestions | Set after admin selects a draft |
| `sourceVideoUrl` | text | Path to uploaded MP4 (e.g. `/uploads/videos/123-source.mp4`) |
| `teaserJobId` | text | BullMQ job ID for FFmpeg processing |
| `teaserJobStatus` | text | `idle` \| `ready` \| `processing` \| `completed` \| `failed` |
| `teaserJobError` | text | Human-readable error if failed |
| `teaserLandscapeUrl` | text | Output path for 16:9 teaser |
| `teaserPortraitUrl` | text | Output path for 9:16 teaser |
| `backgroundStyle` | text | `aurora` \| `minimal` \| `grid` |
| `backgroundImageUrl` | text | Path to AI-generated or SVG background |
| `notes` | text | Admin notes |
| `createdAt` / `updatedAt` | timestamp | |

### `draft_suggestions`

One campaign has up to 5 drafts, ranked 1–5 by AI.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `campaignId` | integer → media_campaigns | |
| `rank` | integer | 1 (best) to 5 |
| `keyMomentIndex` | integer | Index into `podcasts.transcripts` array |
| `timestamp` | text | `MM:SS` |
| `impactScore` | integer | 1–10, AI-assigned |
| `insight` | text | AI paraphrase of the key moment (≤280 chars) |
| `theme` | text | 3–5 word theme label |
| `hook` | text | Scroll-stopping hook (≤120 chars) |
| `linkedinCaption` | text | Full LinkedIn draft caption |
| `instagramCaption` | text | Full Instagram draft caption |
| `hashtags` | text[] | 8–12 hashtag strings |
| `isSelected` | boolean | True for the draft the admin picked |

### `media_posts`

One row per (campaign × postType × platform).

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `campaignId` | integer → media_campaigns | |
| `postType` | text | See post types below |
| `platform` | text | `linkedin` \| `instagram` \| `facebook` \| `twitter` |
| `content` | text | Generated caption text |
| `characterCount` | integer | |
| `status` | text | `not_generated` → `generating` → `draft` → `approved` → `copied` → `published` |
| `generatedAt` / `approvedAt` / `publishedAt` | timestamp | |

### `media_assets`

Uploaded images and generated video files.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `campaignId` | integer → media_campaigns | |
| `assetType` | text | `cover_photo` \| `teaser_video` \| `manual_image` |
| `fileUrl` | text | `/uploads/media/...` or `/uploads/videos/...` |
| `fileName` / `fileSize` / `mimeType` | | |

---

## Stage 1 — Draft

### What happens

A single Claude call analyses the episode's key moments and returns 5 ranked draft objects. The admin reviews the 5 draft cards and selects one to take into Production.

### API endpoint

```
POST /api/social-media/campaigns/:id/drafts/generate
```

No request body needed — all data is fetched from the campaign's episode record on the server side.

### Claude prompt strategy

**System prompt:**
```
You are a social media content strategist for MAKEIT.TECH, a hardware R&D and AI company
from Portugal. The show is MAKEITorBREAKIT — a 2.5-hour Portuguese-language videocast about
technology, AI, hardware, and entrepreneurship. Audience: tech founders, engineers, makers.
Brand tone: bold, expert, human, optimistic.
```

**User prompt input:**
- Episode title (~50 chars)
- Description (~250 chars)
- Category
- All key moments: `[MM:SS] {topic} — {text}` (~2,200 chars total for 15 moments)
- Guest name + role if available (stored in `podcasts.guestName` / `podcasts.guestRole`)
- Raw transcript if stored (stored in `podcasts.rawTranscript` — greatly improves quote quality)

**Expected output:** JSON array of 5 objects, each with:
`rank`, `keyMomentIndex`, `timestamp`, `impactScore`, `insight`, `theme`, `hook`, `linkedinCaption`, `instagramCaption`, `hashtags[]`

**Approximate token cost per draft generation:**
- Input: ~800 tokens
- Output: ~3,500 tokens
- **Total: ~4,300 tokens (~$0.013 at Sonnet 4.6 pricing)**

### Note on raw transcript

If `podcasts.rawTranscript` is not populated, the AI works only from 1–2 sentence topic summaries per key moment (the `transcripts` JSONB column). This means:
- Insights are paraphrases, never verbatim quotes
- Hook quality is slightly lower
- Label content as "Key Insight" not "Quote" in the UI

When `rawTranscript` is available, quote extraction is verbatim and hook writing is significantly stronger.

---

## Stage 2 — Production

### What happens

The admin generates content for up to 8 post types across 4 platforms. Each generation is a separate on-demand Claude call. Generated content is editable inline. Once satisfied, the admin approves each post. When enough posts are approved, they can advance to Publication.

### The 8 post types

| Post Type | Target Platforms | Purpose | Character target |
|-----------|-----------------|---------|-----------------|
| `teaser` | LinkedIn, Instagram | Pre-release excitement | LinkedIn ≤1,300 / Instagram ≤2,200 |
| `brevemente` | LinkedIn, Instagram, Story | Coming-soon anticipation | ≤500 chars |
| `guest` | LinkedIn, Instagram | Guest spotlight & credibility | ≤1,000 chars |
| `insight` | Instagram, LinkedIn | Thought-leadership quote card | ≤280 chars |
| `launch` | LinkedIn, Instagram, Facebook | Full episode launch | LinkedIn ≤1,300 / Instagram ≤2,200 |
| `reengage` | LinkedIn, Instagram | Second-chance framing | ≤800 chars |
| `carousel` | Instagram (text concept) | Educational slide series | 5–7 slides, ≤150 chars/slide |
| `video_teaser` | Instagram Reels, LinkedIn | Short punchy caption for video | ≤150 chars recommended |

### Platform character limits enforced

| Platform | Hard limit | Recommended max |
|----------|-----------|----------------|
| LinkedIn | 3,000 chars | 1,300 (before "see more") |
| Instagram | 2,200 chars | 2,200 |
| Facebook | 63,206 chars | Unlimited in practice |
| Twitter/X | 280 chars | 240 |
| Instagram Story/Reels caption | 2,200 chars | 150 |

### API endpoints

```
POST /api/social-media/campaigns/:id/posts/generate
Body: { postType: string, platform: string }

GET  /api/social-media/campaigns/:id/posts

PATCH /api/social-media/campaigns/:id/posts/:postId
Body: { content: string }

PATCH /api/social-media/campaigns/:id/posts/:postId/approve
```

### Token cost per post generation

- Input: episode context + selected draft + post-type instructions → ~700 tokens
- Output: 1 platform caption → ~600 tokens
- **Per generation: ~1,300 tokens (~$0.004)**
- Full campaign (8 types × 2 platforms avg): ~16 calls → **~20,800 tokens (~$0.06)**

### Total AI cost per full campaign (Phases 1–2)

| Step | Tokens | Cost |
|------|--------|------|
| Draft generation | ~4,300 | ~$0.013 |
| 16 post generations | ~20,800 | ~$0.062 |
| **Total** | **~25,100** | **~$0.075** |

All AI costs are tracked in the `api_usage_logs` table (model, tokens, cost_microdollars, operation).

---

## Stage 3 — Publication

### What happens

All approved posts are displayed grouped by platform. Admin copies text to clipboard, downloads as `.txt`, and marks each as published. Separately, the admin manages the visual assets: AI-generated background + video teaser.

### API endpoints

```
GET  /api/social-media/campaigns/:id/publication
     → Returns: campaign, selectedDraft, approvedPosts, videoTeaser status

PATCH /api/social-media/campaigns/:id/posts/:postId/status
Body: { status: "copied" | "published" }

GET  /api/social-media/campaigns/:id/export
     → Returns: zip file with all approved posts as .txt files
```

---

## Video Teaser Pipeline

The video teaser workflow turns a full-length episode MP4 into two branded clips:
- **Landscape** `{campaignId}-landscape.mp4` — 16:9, for LinkedIn and YouTube
- **Portrait** `{campaignId}-portrait.mp4` — 9:16, for Instagram Reels and TikTok

### Step 1 — Get the source MP4

Two methods, both available in the Publication panel:

**Option A — YouTube auto-download (yt-dlp)**

```
POST /api/social-media/campaigns/:id/teaser/download
     Accepts: { youtubeUrl: string }
     Streams: SSE progress events
```

yt-dlp is called as a subprocess. Progress is streamed to the client via SSE (`text/event-stream`). On completion the MP4 is saved to `VIDEO_STORAGE_PATH` and `campaign.sourceVideoUrl` is set.

Common failure modes and error messages:
| Error | Message shown |
|-------|--------------|
| HTTP 429 from YouTube | "YouTube is rate limiting this server. Please upload the MP4 manually." |
| "Only images are available" | "YouTube blocked video download from this server. Please upload the MP4 manually." |
| "Sign in" / "bot" in stderr | "YouTube bot detection triggered. Upload fresh cookies or use manual MP4 upload." |
| Any other non-zero exit | "YouTube download failed. Please upload the MP4 manually." |

**Option B — Manual MP4 upload**

```
POST /api/social-media/campaigns/:id/teaser/upload-source
     Content-Type: multipart/form-data
     Field: video (MP4 or MOV, max 4 GB)
```

Upload uses `XMLHttpRequest` (not `fetch`) for real progress reporting. The UI shows a blue banner with a live percentage bar while uploading, and fires a `beforeunload` warning if the admin tries to navigate away mid-upload.

On success, the server sets:
```json
{ "teaserJobStatus": "ready", "teaserJobError": null, "sourceVideoUrl": "/uploads/videos/..." }
```

The "Source video ready" banner persists across navigation because `teaserJobStatus: 'ready'` is stored in the database.

**YouTube cookies (optional)**

To avoid YouTube bot detection, the admin can upload a `youtube-cookies.txt` (Netscape/cookies.txt format). This is stored at `server/assets/youtube-cookies.txt` and passed to yt-dlp via `--cookies`. A persistent cookies section in the panel shows upload status and last-uploaded filename.

```
POST /api/social-media/upload-yt-cookies
     Content-Type: multipart/form-data
     Field: cookies (text/plain, max 5 MB)

GET  /api/social-media/cookies-status
     → Returns: { hasFile: boolean, filename: string | null }
```

### Step 2 — Trigger FFmpeg processing

Once a source video is uploaded (status = `ready`), the admin sets the clip timestamps and clicks Generate.

```
POST /api/social-media/campaigns/:id/teaser/generate
     Body: { startTime: string, endTime: string }
     (e.g. "04:32" and "09:15")
```

This enqueues a BullMQ job (`video-processing` queue) and returns `{ jobId }`. The UI polls the job status:

```
GET /api/social-media/campaigns/:id/teaser/status
    → Returns: { status, progress, error, landscapeUrl, portraitUrl }
```

### Step 3 — FFmpeg pipeline (7 steps)

Executed inside `server/jobs/videoProcessor.ts` by the BullMQ worker:

| Step | Operation | Output |
|------|-----------|--------|
| 1 | Trim raw clip from `startTime` to `endTime` | `{id}-raw.mp4` |
| 2 | Generate 2-second branded intro slate | `{id}-intro.mp4` |
| 3 | Generate 3-second branded outro slate | `{id}-outro.mp4` |
| 4 | Concatenate intro + clip + outro | `{id}-concat.mp4` |
| 5 | Add lower-third text overlay → landscape 16:9 | `{id}-landscape.mp4` |
| 6 | Create portrait 9:16 (blur background + centred overlay) | `{id}-portrait.mp4` |
| 7 | Clean up temporary files (raw, intro, outro, concat) | — |

Brand colour for overlays: `#D42B2B`. Font: `LiberationSans-Bold.ttf`.

FFmpeg is bundled via `@ffmpeg-installer/ffmpeg` — no system-level install required.

The worker only starts if `REDIS_URL` is set. Without Redis, the `video-processing` queue never initialises and all other Social Media Manager features remain functional.

---

## AI Background Generation

Every campaign can have an AI-generated background image for use in post cards and the Post Composer.

```
POST /api/social-media/campaigns/:id/background
     Body: { style: "aurora" | "minimal" | "grid", width: number, height: number }
```

### Primary path — Gemini image generation

Uses `@google/genai` SDK (`GoogleGenAI` client) with model `gemini-3.1-flash-image-preview`:

```typescript
const client = new GoogleGenAI({ apiKey: options.geminiApiKey });
const response = await client.models.generateContent({
  model: "gemini-3.1-flash-image-preview",
  contents: prompt,
  config: {
    responseModalities: ["IMAGE"],
    imageConfig: { aspectRatio },
  },
});
```

Three style prompts:
- **aurora** — Aurora borealis with PCB circuit traces, deep black, crimson red, cinematic
- **minimal** — Minimalist dark background, crimson circuit traces on edges
- **grid** — Pure black with crimson dot grid and PCB junction nodes

On success, the base64 image is saved to `MEDIA_STORAGE_PATH` and the URL stored in `campaign.backgroundImageUrl`.

### Fallback path — SVG generator

If `GEMINI_API_KEY` is not set or the API call fails, `generateBackgroundSvg()` generates a deterministic SVG using a seeded PRNG (mulberry32). The same `campaignId` as seed always produces the same background. SVGs are returned inline (not saved to disk) and rendered directly in the browser.

---

## Post Visual Composer

The Post Composer is a client-side canvas editor that layers:
- AI-generated or SVG background
- Episode thumbnail (YouTube thumbnail URL)
- Selected draft's hook text
- Brand logo / watermark

Export uses `html2canvas` to render the composed layer to a `<canvas>` element and download it as a PNG.

There is no server-side rendering for the visual composer — it is entirely browser-based.

---

## Image-only Campaigns

Campaigns without an episode can be created from uploaded images:

```
POST /api/media/upload
     Content-Type: multipart/form-data
     Fields: images[] (JPEG/PNG/WebP, max 10 MB each, max 3 files)
     → Returns: { urls: string[] }

POST /api/social-media/campaigns
     Body: { inputType: "image_only", description: string, imageUrls: string[] }
```

Image-only campaigns skip the Draft stage entirely and go directly to Production with a subset of post types (no `video_teaser`, no `brevemente` unless manually requested).

Images are stored in `MEDIA_STORAGE_PATH` (`./uploads/media/` by default) and served at `/uploads/media/*`. On Render's free tier, this is ephemeral — files are lost on redeploy. See DEPLOYMENT.md → File Storage for persistent options.

---

## Admin UI Navigation

All Social Media Manager pages are under `/admin/*` and require admin authentication (`useBackoffice()` → `isAdmin`). Non-authenticated users are redirected to `/`.

| Route | Page | Description |
|-------|------|-------------|
| `/admin/social-media` | SocialMediaManager | Campaign list + episode selector |
| `/admin/campaign/:id/draft` | CampaignDraft | 5 ranked draft cards |
| `/admin/campaign/:id/production` | CampaignProduction | 8 post type cards grid |
| `/admin/campaign/:id/publication` | CampaignPublication | Copy/export + video teaser + background |

Navigation link is visible only in admin mode via the admin banner in `Layout.jsx`.

---

## API Cost Tracking

All AI API calls log usage to `api_usage_logs`:

| Column | Type |
|--------|------|
| `id` | serial |
| `model` | text (e.g. `claude-sonnet-4-6`) |
| `operation` | text (e.g. `generate_drafts`, `generate_post_teaser`) |
| `inputTokens` | integer |
| `outputTokens` | integer |
| `costMicrodollars` | integer |
| `campaignId` | integer |
| `createdAt` | timestamp |

Costs are calculated server-side based on known Anthropic pricing at request time and stored as integer microdollars (1 USD = 1,000,000 microdollars) to avoid floating-point precision issues.

---

## Episode Schema Extensions

Three nullable columns were added to `podcasts` to support higher-quality Social Media Manager output:

| Column | Type | Purpose |
|--------|------|---------|
| `rawTranscript` | text | Full verbatim transcript — enables real quote extraction |
| `guestName` | text | Guest's full name (e.g. "João Silva") |
| `guestRole` | text | Guest's role/company (e.g. "CTO at Acme Hardware") |

These are optional fields in the Add/Edit Episode modal. If populated, they are included in all Claude prompts for Draft and Production generation. Without `guestName`/`guestRole`, the AI infers from the episode title — less reliable for guest spotlight posts.

---

## Adding a New Post Type

1. Add the post type string to the `postType` enum in `shared/schema.ts`
2. Add the Claude prompt for this type in the generation endpoint in `server/routes.ts`
3. Add a card configuration entry in `CampaignProduction.jsx` (icon, title, platform list, char limit)
4. No DB migration needed — `postType` is a free-text column

---

## Recommended Improvements

| Priority | Improvement |
|----------|-------------|
| High | Migrate uploads to S3/R2 for persistent file storage across deploys |
| High | Add `rawTranscript` field to episode edit modal so all new episodes store full text |
| Medium | Add bulk-generate button: generate all 8 post types in sequence with a single click |
| Medium | Add scheduling metadata (planned publish date per post) |
| Low | Add zip export of all approved posts for a campaign |
| Low | Add campaign duplication (copy approved posts as starting point for a new episode) |
