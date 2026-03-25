# MAKEIT.TECH — Media Navigator

![Status](https://img.shields.io/badge/Status-Ongoing-green)
![Version](https://img.shields.io/badge/Version-2.0.0-blue)
![Node](https://img.shields.io/badge/Node.js-24-blue)
![React](https://img.shields.io/badge/React-18-61DAFB)
![Claude](https://img.shields.io/badge/Claude-Sonnet_4.6-orange)
![Express](https://img.shields.io/badge/Express-5-black)
![pgvector](https://img.shields.io/badge/pgvector-1024_dims-6B5B95)
![VoyageAI](https://img.shields.io/badge/Voyage_AI-voyage--3-5B4A8A)
![Render](https://img.shields.io/badge/Deployed-Render-46E3B7)
![Neon](https://img.shields.io/badge/Database-Neon-00E5C0)

**Media Navigator** is the full-stack digital platform for **MAKEITorBREAKIT** — the Portuguese-language videocast about technology, hardware, AI, and entrepreneurship. The platform combines a public-facing podcast browser with a private **Social Media Manager** that automates the entire content marketing workflow: from AI-generated post drafts to image generation, video teaser clipping, and publication tracking.

**Live:** https://makeitorbreakit.onrender.com

---

## What is this platform?

Two distinct surfaces in one codebase:

**Public (audience-facing)**
- **PCB** (Podcast Content Browser) — natural language AI search across all episodes, returns exact timestamps
- **RAG Chatbot** — floating widget that answers questions about episodes using semantic vector search
- Episode grid with category filters, YouTube video player, key moments sidebar, PT/EN language switch, newsletter subscription, contact form

**Admin (password-protected)**
- **Social Media Manager** — full campaign workflow: Draft → Production → Publication
- AI-generated post content (8 post types × 4 platforms) from episode data
- Video teaser generation (20s clip, landscape + portrait) via FFmpeg + BullMQ
- AI background image generation (Gemini 3.1 Flash) or procedural PCB SVG
- Post visual composer with PNG export (html2canvas)
- Image-only campaigns (no episode required)
- API usage cost tracking per Claude/Gemini call
- Metrics dashboard

---

## Features

### Public Features

| Feature | Description |
|---------|-------------|
| PCB AI Search | Natural language → exact timestamp in any episode |
| RAG Chatbot | Floating widget, semantic search via pgvector + Voyage AI + Claude |
| Episode Grid | Category filters, real-time client-side search |
| Video Player | YouTube IFrame, key moments sidebar, timestamp deep-links |
| Questions Carousel | 8 AI-generated search prompts, 24h DB cache, rotates every 6s |
| Featured Q&A Cards | 3 AI-generated question/answer cards with play buttons |
| PT/EN Language Switch | Pill toggle in nav, DB-backed translations, instant static fallback |
| Email Subscriptions | Newsletter list in Neon, deduplication on insert |
| Contact Form | Sends email via Resend to `contact@make-it.tech` |
| Section Toggles | Admin can show/hide carousel and featured Q&A cards |

### Admin — Social Media Manager

| Feature | Description |
|---------|-------------|
| Campaign Draft | Claude generates 5 ranked draft suggestions from episode key moments |
| Campaign Production | 8 post types × up to 4 platforms, generated on-demand per type |
| Campaign Publication | Copy/download/status tracking per post, progress tracker |
| Image-only Campaigns | Create posts from photos without a video episode (multer upload) |
| AI Description Improvement | Claude rewrites image post descriptions in 150 words |
| Video Teaser Generation | yt-dlp download + FFmpeg trim → 20s landscape + portrait clips |
| YouTube Auto-download | yt-dlp with SSE progress streaming, `--cookies` authentication |
| Manual MP4 Upload | XHR with real progress bar, `beforeunload` navigation guard |
| AI Background Generation | Gemini 3.1 Flash image generation OR procedural PCB SVG |
| Post Visual Composer | Preview post card with background overlay, PNG download via html2canvas |
| Metrics Dashboard | API usage costs per endpoint, published campaign list |
| Backoffice | Add, edit, delete episodes — no direct DB access needed |

### Admin — Episode Backoffice

| Feature | Description |
|---------|-------------|
| YouTube Auto-Extraction | Paste URL → Supadata fetches transcript → Claude generates description + key moments |
| Guest Metadata | Guest name and role fields used in social post generation |
| Raw Transcript Storage | Stored for higher-quality AI quote extraction |

---

## Architecture

Everything runs on a **single Render service**. Express 5 serves both the API and the built Vite frontend as static files. There is no separate frontend hosting — no Netlify.

```
Browser
  │
  └── Render Web Service (https://makeitorbreakit.onrender.com)
        │
        ├── Express 5 (Node 24, TypeScript)
        │     ├── /api/*          → all API endpoints
        │     ├── /uploads/media  → uploaded images (multer → local disk)
        │     ├── /uploads/videos → uploaded/downloaded video files
        │     └── /*              → serves dist/public (Vite build)
        │
        ├── BullMQ Worker
        │     └── Upstash Redis (rediss://) → video teaser processing jobs
        │
        └── PostgreSQL
              └── Neon serverless + pgvector
```

### Language split

| Location | Language |
|----------|----------|
| `client/src/` | JavaScript / JSX (no TypeScript) |
| `server/` | TypeScript |
| `shared/` | TypeScript (Vite resolves it for the client too) |
| `client/src/hooks/use-toast.ts` | TypeScript (Shadcn/ui exception) |

---

## Quick Start

```bash
git clone https://github.com/blsmakeit/podcast.git media-navigator
cd media-navigator
npm install
cp .env.example .env      # fill in required keys (see Environment Variables below)
npm run db:push           # create all 11 tables in Neon
npm run dev               # http://localhost:5000
```

Seed translations once (idempotent):
```bash
curl -X POST http://localhost:5000/api/translations/seed
```

> The dev server runs on port 5000. Vite proxies all `/api/*` requests to Express — no CORS issues locally.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Yes | Claude Sonnet 4.6 — PCB search, chatbot, post generation, extraction |
| `VOYAGE_API_KEY` | Yes | Voyage AI `voyage-3` — RAG embeddings (1024 dims) |
| `SUPADATA_API_KEY` | Yes | YouTube transcript extraction |
| `RESEND_API_KEY` | Yes | Contact form email delivery via Resend |
| `GEMINI_API_KEY` | Yes* | Gemini 3.1 Flash — AI background image generation (`*` required for AI backgrounds) |
| `REDIS_URL` | Yes* | Upstash Redis (`rediss://`) — BullMQ video teaser job queue (`*` required for video teasers) |
| `MEDIA_STORAGE_PATH` | No | Local path for uploaded images (default: `./uploads/media`) |
| `VIDEO_STORAGE_PATH` | No | Local path for video files (default: `./uploads/videos`) |
| `PORT` | No | Express port (default: `5000`) |
| `NODE_ENV` | Production | Set to `production` on Render |
| `VITE_API_URL` | No | Leave empty — not needed (same-origin, Render serves everything) |

> Copy `.env.example` to `.env`. Never commit `.env`. The `VITE_API_URL` variable is vestigial from the old Netlify split-hosting setup — leave it empty or omit it.

---

## Database Schema

11 tables in Neon serverless PostgreSQL. Run `npm run db:push` to create them.

Enable pgvector once (Neon SQL editor):
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX ON episode_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
```

| Table | Purpose |
|-------|---------|
| `podcasts` | Episodes — title, description, video_url, thumbnail_url, category, transcripts (JSONB), guest_name, guest_role, raw_transcript, source_video_url, teaser fields |
| `episode_chunks` | RAG vector store — `vector(1024)`, chunk_type, content, time_ref, topic |
| `translations` | PT/EN i18n — key, en, pt (~80 keys) |
| `generated_content` | AI-generated questions carousel + featured Q&A cards (24h DB cache) |
| `site_settings` | Section visibility toggles (show_carousel, show_featured_questions) |
| `subscribers` | Newsletter email list |
| `media_campaigns` | Social media campaigns — episodeId (nullable), inputType, stage, backgroundImageUrl, sourceVideoUrl, teaser job fields |
| `draft_suggestions` | AI draft suggestions — rank, insight, hook, captions, hashtags, teaserTimestamp |
| `media_posts` | Generated posts — postType, platform, content, status (not_generated → approved → published) |
| `media_assets` | Uploaded files — manual images, teaser videos, assetType, fileUrl |
| `api_usage_logs` | AI API cost tracking — endpoint, model, tokens, cost_microdollars |

### Campaign stages

```
draft  →  production  →  publication  →  completed
```

### Post statuses

```
not_generated  →  generating  →  draft  →  approved  →  copied  →  downloaded  →  published
```

---

## API Reference

<details><summary>Public API (17 endpoints)</summary>

### Episodes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/podcasts` | List all episodes |
| `GET` | `/api/podcasts/:id` | Get single episode |
| `POST` | `/api/podcasts` | Create episode (triggers embeddings + question regeneration) |
| `PUT` | `/api/podcasts/:id` | Update episode (triggers embeddings + question regeneration) |
| `DELETE` | `/api/podcasts/:id` | Delete episode |
| `POST` | `/api/episodes/extract` | YouTube auto-extraction — Supadata + Claude or Gemini |

### AI

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ai/search` | PCB search — returns `{ podcastId, timestamp, explanation }` |
| `POST` | `/api/chat` | RAG chatbot — pgvector + Claude → `{ message, actions?, sources? }` |

### Content & Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/questions` | 8 AI search suggestions (24h cache) |
| `GET` | `/api/featured-questions` | 3 Q&A cards (24h cache) |
| `GET` | `/api/settings` | Section visibility flags |
| `PUT` | `/api/settings` | Update a setting key |
| `POST` | `/api/subscribe` | Add email to newsletter list |
| `GET` | `/api/subscribers` | List all subscribers (admin) |
| `POST` | `/api/contact` | Send contact form email |
| `GET` | `/api/translations/:lang` | All strings for `en` or `pt` |
| `POST` | `/api/translations/seed` | Upsert all translation strings (idempotent) |

</details>

<details><summary>Social Media Manager API (30+ endpoints)</summary>

### Campaigns

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/social-media/campaigns` | List all campaigns |
| `POST` | `/api/social-media/campaigns` | Create campaign from episode |
| `POST` | `/api/social-media/campaigns/image-only` | Create image-only campaign |
| `GET` | `/api/social-media/campaigns/:id` | Get campaign detail |
| `PATCH` | `/api/social-media/campaigns/:id` | Update campaign (stage, backgroundImageUrl, etc.) |
| `GET` | `/api/social-media/campaigns/episode/:episodeId` | Find campaign for an episode |
| `GET` | `/api/social-media/unprocessed-count` | Episodes without a campaign |

### Drafts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/social-media/campaigns/:id/drafts/generate` | Generate 5 ranked AI drafts (Claude) |
| `GET` | `/api/social-media/campaigns/:id/drafts` | List drafts for campaign |
| `PATCH` | `/api/social-media/campaigns/:id/drafts/:draftId/select` | Select a draft, advance to production |

### Posts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/social-media/campaigns/:id/posts` | List all posts for campaign |
| `POST` | `/api/social-media/campaigns/:id/posts/generate` | Generate post (Claude) — `{ postType, platforms[] }` |
| `PATCH` | `/api/social-media/campaigns/:id/posts/:postId` | Edit post content |
| `PATCH` | `/api/social-media/campaigns/:id/posts/:postId/approve` | Approve post |
| `PATCH` | `/api/social-media/campaigns/:id/posts/:postId/status` | Update status (copied/downloaded/published) |
| `GET` | `/api/social-media/campaigns/:id/publication` | Publication view — posts grouped by platform |

### AI Helpers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/social-media/image-posts/improve-description` | Claude rewrites image description (150 words) |

### Media Upload

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/social-media/media/upload` | Upload up to 3 images (multer, 10MB each, JPEG/PNG/WebP) |
| `POST` | `/api/social-media/admin/upload-yt-cookies` | Upload `cookies.txt` for yt-dlp YouTube auth |

### Video Teaser

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/social-media/campaigns/:id/teaser/upload-source` | Upload MP4/MOV source (multer, 4GB max) |
| `POST` | `/api/social-media/campaigns/:id/teaser/download-youtube` | yt-dlp download with SSE progress stream |
| `POST` | `/api/social-media/campaigns/:id/teaser/generate` | Queue FFmpeg trim job (BullMQ) |
| `GET` | `/api/social-media/campaigns/:id/teaser/status` | Poll teaser job status + output URLs |
| `DELETE` | `/api/social-media/campaigns/:id/teaser/reset` | Reset teaser status to retry |

### Backgrounds

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/social-media/backgrounds/generate-ai` | Gemini 3.1 Flash image → saves PNG |
| `GET` | `/api/social-media/backgrounds/preview` | Serve SVG preview (query: seed, style, w, h) |
| `POST` | `/api/social-media/campaigns/:id/background/generate` | Generate + save background for campaign |
| `DELETE` | `/api/social-media/campaigns/:id/background` | Remove campaign background |

### Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/social-media/metrics` | API usage costs per endpoint + total |
| `GET` | `/api/social-media/metrics/published-posts` | Completed campaigns with publish counts |

</details>

---

## Social Media Manager — Workflow

The Social Media Manager is entirely admin-only. The workflow has four stages:

```
1. DRAFT
   Admin selects an episode (or creates an image-only post).
   Claude analyses the episode key moments and returns 5 ranked draft
   suggestions, each with: insight, hook, LinkedIn caption, Instagram
   caption, hashtags, teaser timestamp + reason.
   Admin selects the best draft.

2. PRODUCTION
   8 post types are available: teaser, guest, insight, launch,
   brevemente, reengage, carousel, video_teaser.
   Each platform (LinkedIn, Instagram, Facebook, Twitter/X) gets its
   own generated post. Admin generates each on demand, edits inline,
   and approves.

3. PUBLICATION
   Approved posts are grouped by platform. Admin copies/downloads
   each, marks status, and tracks overall campaign progress.
   Visual post composer lets admin preview the post with background
   image and download a branded PNG.

4. COMPLETED
   Admin clicks "Mark all as published" — campaign stage set to
   completed, appears in the Published tab.
```

### Video Teaser flow

```
Admin pastes YouTube URL
  → server spawns yt-dlp (multi-candidate path detection)
  → SSE streams download % to browser
  → source MP4 saved to uploads/videos/

  OR

Admin drags MP4 into upload zone
  → XHR upload with real-time progress bar
  → beforeunload warning prevents accidental navigation
  → source MP4 saved via multer

Admin sets start timestamp (AI-suggested from selected draft)
  → "Generate Teaser" → BullMQ job queued in Upstash Redis
  → Worker process: FFmpeg trims 20s, creates landscape (16:9) + portrait (9:16)
  → Panel polls status every 2s, shows clips with download links
```

### Post types

| Type | Platforms | Purpose |
|------|-----------|---------|
| `teaser` | LinkedIn, Instagram | Pre-release excitement |
| `guest` | LinkedIn, Instagram | Guest spotlight / credibility |
| `insight` | LinkedIn, Instagram | Key insight quote card |
| `launch` | LinkedIn, Instagram, Facebook | Full episode launch |
| `brevemente` | LinkedIn, Instagram, Story | Coming soon / anticipation |
| `reengage` | LinkedIn, Instagram | Re-engagement for older episodes |
| `carousel` | Instagram | Educational slide concept |
| `video_teaser` | Instagram Reels, LinkedIn | Short punchy clip caption |

---

## Deployment

Everything is deployed as a **single Render Web Service**. One service, one URL, one deploy.

### Render setup

1. New Web Service → connect GitHub repo (`https://github.com/blsmakeit/podcast.git` or `https://github.com/MAKE-IT-TECH/mkit_podcast_pcb.git`)
2. Configure:

| Setting | Value |
|---------|-------|
| Build command | `npm install --include=dev && npm run build` |
| Start command | `npm run start` |
| Node version | `24` |

3. Add all environment variables from the table above.

> `--include=dev` is required because `tsx`, `vite`, and `esbuild` are devDependencies used at build time.

### Post-deploy checklist (run once)

```bash
# 1. Enable pgvector (Neon SQL editor)
CREATE EXTENSION IF NOT EXISTS vector;

# 2. Push Drizzle schema
npm run db:push

# 3. Create vector index (Neon SQL editor)
CREATE INDEX ON episode_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

# 4. Seed translations
curl -X POST https://makeitorbreakit.onrender.com/api/translations/seed
```

### Two git remotes

The repo is pushed to two GitHub accounts simultaneously:

```bash
git remote -v
# origin   https://github.com/blsmakeit/podcast.git
# makeit   https://github.com/MAKE-IT-TECH/mkit_podcast_pcb.git
```

Push rule — **always push to both**:
```bash
git push origin main
git push makeit main
# if makeit fails:
git pull makeit main --no-rebase && git push makeit main
```

### yt-dlp on Render

yt-dlp must be installed on the Render instance. Add to your build command or use a `render.yaml`:

```bash
pip3 install yt-dlp
```

The server auto-detects the binary at startup (checks `/usr/local/bin/yt-dlp`, `~/.local/bin/yt-dlp`, Render-specific paths, and falls back to `python3 -m yt_dlp`).

### File storage

Uploaded images and videos are saved to local disk on Render. This means they **do not persist across deploys** (Render's filesystem is ephemeral on free/starter tiers). For production persistence, mount a Render Disk or migrate to S3. The upload paths are configurable via `MEDIA_STORAGE_PATH` and `VIDEO_STORAGE_PATH`.

---

## Project Structure

```
Media-Navigator/
├── client/                              # React frontend (JavaScript/JSX only)
│   ├── index.html
│   └── src/
│       ├── components/
│       │   ├── admin/                   # Social Media Manager components
│       │   │   ├── BackgroundPanel.jsx       # Gemini/SVG background generator
│       │   │   ├── CampaignProgressBar.jsx   # Publication progress tracker
│       │   │   ├── CharCountBadge.jsx        # Platform char limit badge
│       │   │   ├── ImageUploadPanel.jsx      # Image-only campaign dialog
│       │   │   ├── PlatformExportCard.jsx    # Per-platform copy/download card
│       │   │   ├── PostComposer.jsx          # Visual post preview + PNG export
│       │   │   ├── PostTypeCard.jsx          # Production post card
│       │   │   └── VideoTeaserPanel.jsx      # Full teaser workflow (upload/download/generate)
│       │   ├── backoffice/
│       │   │   ├── BackofficeContext.jsx     # Admin auth context + password modal
│       │   │   └── AddEpisodeModal.jsx       # Add/edit episode form
│       │   ├── chat/
│       │   │   └── ChatWidget.jsx            # Draggable RAG chatbot widget
│       │   ├── ui/                           # Shadcn/ui primitives (do not edit)
│       │   ├── EpisodeCard.jsx
│       │   └── Layout.jsx                   # Nav + footer + admin toggle
│       ├── hooks/
│       │   ├── use-episodes.js              # Episode + PCB + questions + settings hooks
│       │   ├── use-chat.js                  # Chat state + POST /api/chat mutation
│       │   ├── use-language.jsx             # LanguageProvider + useLanguage()
│       │   ├── use-toast.ts                 # Shadcn/ui (TS exception)
│       │   └── use-mobile.tsx               # Shadcn/ui (TS exception)
│       ├── lib/
│       │   ├── translations.js              # Static PT/EN fallback (~80 keys)
│       │   ├── queryClient.js               # TanStack Query client
│       │   └── utils.js                     # cn() utility
│       └── pages/
│           ├── Home.jsx                     # Hero + PCB search + carousel + Q&A
│           ├── Episodes.jsx                 # Episode grid + category filters
│           ├── PodcastDetail.jsx            # Video player + key moments sidebar
│           ├── About.jsx
│           ├── Subscribe.jsx
│           ├── Contact.jsx
│           └── admin/
│               ├── SocialMediaManager.jsx   # Campaign list (Episodes / Image Posts / Published)
│               ├── CampaignDraft.jsx        # 5 ranked draft cards + select
│               ├── CampaignProduction.jsx   # 8 post type cards + generate + approve
│               ├── CampaignPublication.jsx  # Platform export + visual composer + assets
│               └── MetricsDashboard.jsx     # API cost metrics
│
├── server/                              # Express backend (TypeScript)
│   ├── index.ts                         # Entry — CORS, static files, Redis, routes
│   ├── routes.ts                        # All 47+ endpoints
│   ├── storage.ts                       # Database access layer (Drizzle)
│   ├── db.ts                            # Drizzle + pg pool
│   ├── jobs/
│   │   ├── queue.ts                     # BullMQ queue definition (Upstash Redis)
│   │   └── worker.ts                    # FFmpeg video teaser worker
│   ├── middleware/
│   │   └── upload.ts                    # multer config: images (10MB), video (4GB), cookies
│   ├── utils/
│   │   ├── backgroundGenerator.ts       # PCB SVG generator + Gemini 3.1 Flash image gen
│   │   ├── claudePricing.ts             # Token cost table for all Claude + Gemini models
│   │   └── ytDlpPath.ts                 # yt-dlp binary path detection at startup
│   ├── knowledge/
│   │   └── company.ts                   # Company knowledge injected into chat prompt
│   ├── static.ts                        # Serves dist/public in production
│   └── vite.ts                          # Vite dev middleware
│
├── shared/                              # Shared types (TypeScript)
│   ├── schema.ts                        # Drizzle schema — 11 tables
│   └── routes.ts                        # Typed API routes + Zod schemas
│
├── hpc/                                 # MareNostrum5 batch embedding pipeline
│   ├── export_chunks.ts                 # Local: export all chunks to JSON
│   ├── embed_episodes.py                # HPC: BAAI/bge-large-en-v1.5 embeddings
│   ├── embed_episodes.slurm             # SLURM job script
│   ├── import_embeddings.ts             # Local: import embeddings → Neon
│   └── requirements.txt
│
├── uploads/                             # Runtime file storage (gitignored)
│   ├── media/                           # Uploaded campaign images
│   └── videos/                          # Source MP4s + generated teaser clips
│
├── server/assets/                       # Server-side assets (gitignored selectively)
│   └── youtube-cookies.txt              # yt-dlp auth cookies (gitignored)
│
├── script/
│   └── build.ts                         # Vite + esbuild production build
│
├── .env.example                         # All environment variables documented
├── vite.config.ts                       # Vite: alias, dev proxy → :5000
├── drizzle.config.ts                    # Drizzle Kit config
├── tailwind.config.ts
└── package.json                         # Node 24, single-service build
```

---

## Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend | React | 18 | UI framework |
| Language (client) | JavaScript / JSX | ES2022 | No TypeScript on client |
| Language (server) | TypeScript | 5.6 | Type-safe server |
| Routing | Wouter | ^3.3 | SPA router |
| Data fetching | TanStack Query | ^5.60 | Server state + caching |
| UI components | Shadcn/ui + Radix | Latest | Accessible component library |
| Styling | Tailwind CSS | ^3.4 | Utility-first CSS |
| Animation | Framer Motion | ^11 | Page and component animations |
| Backend | Express | 5 | API server |
| ORM | Drizzle ORM | ^0.39 | Type-safe DB queries |
| Database | PostgreSQL (Neon) | — | Relational data + vector store |
| Vector search | pgvector | — | Cosine similarity, 1024 dims |
| Job queue | BullMQ | ^5.71 | Async video teaser jobs |
| Queue backend | Upstash Redis | rediss:// | BullMQ broker |
| File uploads | multer | ^2.1 | Images (10MB), video (4GB), cookies |
| Video download | yt-dlp | system | YouTube video download |
| Video processing | FFmpeg / fluent-ffmpeg | — | Trim + resize teaser clips |
| Image snapshot | html2canvas | ^1.4 | Post preview → PNG download |
| AI — primary | Anthropic Claude | Sonnet 4.6 | PCB search, chat, post generation, extraction |
| AI — image | Google Gemini | 3.1 Flash (`@google/genai`) | AI background image generation |
| AI — extraction | Google Gemini | 2.0 Flash | Alternative episode extraction |
| Embeddings | Voyage AI | voyage-3 (1024d) | RAG query + episode embeddings |
| Embeddings (HPC) | BAAI/bge-large-en-v1.5 | — | Bulk re-embedding on MareNostrum5 |
| Transcript API | Supadata | REST v1 | YouTube transcript extraction |
| Email | Resend | — | Contact form delivery |
| Build — client | Vite | ^7.3 | Frontend bundler |
| Build — server | esbuild | ^0.25 | Server bundler (CJS output) |
| Hosting | Render | — | Single Web Service (full-stack) |
| Database host | Neon | — | Serverless PostgreSQL |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Express + Vite together (port 5000) |
| `npm run build` | Production build — Vite (client) + esbuild (server) → `dist/` |
| `npm run start` | Start production server (`dist/index.cjs`) |
| `npm run db:push` | Push Drizzle schema to Neon |
| `npm run check` | TypeScript type check |

---

## RAG Chatbot

The floating `ChatWidget` sends conversation history (last 10 messages) to `POST /api/chat`. The server:

1. Embeds the latest user message with Voyage AI `voyage-3`
2. Cosine similarity search against `episode_chunks` (threshold 0.35, top 12)
3. Injects retrieved chunks + `companyKnowledge` into a Claude Sonnet 4.6 system prompt
4. Returns `{ message, actions?, sources? }`

The widget renders action pill buttons and source citations below each assistant message. It is rendered outside `<Router>` so it persists across all pages.

See [RAG_CHATBOT.md](./RAG_CHATBOT.md) for full technical documentation.

---

## HPC Batch Embedding (MareNostrum5)

For bulk re-embedding using `BAAI/bge-large-en-v1.5` (1024 dims) on BSC MareNostrum5 (SLURM):

```
local: hpc/export_chunks.ts  →  JSON file
         ↓ scp
MN5:  hpc/embed_episodes.slurm  →  embed_episodes.py
         ↓ scp output
local: hpc/import_embeddings.ts  →  Neon upsert
```

Used for initial bulk embedding and after major changes to `companyKnowledge`. New episodes are handled automatically by the Voyage AI pipeline on create/update.

See [RAG_CHATBOT.md](./RAG_CHATBOT.md) for the step-by-step guide.

---

## PT/EN Language Switch

Language state lives in `localStorage` (default: `en`). `LanguageProvider` fetches `/api/translations/:lang` via TanStack Query (staleTime 1h) and merges DB values over the static fallback in `client/src/lib/translations.js`. Resolution order: DB value → static[lang][key] → static.en[key] → key.

`LangToggle` (EN / PT pill) appears in the desktop nav and mobile header. Translations are seeded to Neon via `POST /api/translations/seed` (idempotent upsert).

---

## API Cost Tracking

Every Claude and Gemini API call is logged to the `api_usage_logs` table with:
- endpoint label (e.g. `"draft_generation"`, `"post_generation"`, `"background_generation"`)
- model name
- input/output token counts
- cost in microdollars (1 USD = 1,000,000 micros)

The Metrics Dashboard (`/admin/metrics`) aggregates costs per endpoint and shows total spend.

---

## Security Notes

- Backoffice password is set in `BackofficeContext.jsx` — change from the default before deploying to production
- `youtube-cookies.txt` is gitignored — never commit it
- The `uploads/` directory is served as static files — do not store sensitive content there
- `ANTHROPIC_API_KEY` and other secrets must be set as environment variables on Render, never committed

---

## Documentation

| Document | Contents |
|----------|----------|
| [README-v2.md](./README-v2.md) | This file — full platform overview |
| [RAG_CHATBOT.md](./RAG_CHATBOT.md) | RAG chatbot architecture, embedding pipelines, HPC guide, troubleshooting |
| [USAGE.md](./USAGE.md) | Admin usage guide: adding episodes, managing social campaigns, chatbot |
| [SOCIAL_MEDIA_MANAGER.md](./SOCIAL_MEDIA_MANAGER.md) | Social Media Manager deep dive: post types, campaign workflow, AI prompts *(recommended to create)* |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Render setup, yt-dlp install, file storage options, Redis config *(recommended to create)* |

---

## Author

**Bruno Sousa** — MAKEIT.TECH

Thanks to: **Anthropic** (Claude Sonnet 4.6), **Google** (Gemini), **Voyage AI** (voyage-3), **Supadata** (YouTube transcripts), **Neon** (serverless PostgreSQL + pgvector), **Upstash** (Redis), **Shadcn/ui**, **Drizzle ORM**, **Render**, **BSC MareNostrum5** (HPC batch embeddings).

---

**Version**: 2.0.0 | **Status**: Ongoing | **Last Updated**: 2026-03-25
