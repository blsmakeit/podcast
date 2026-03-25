# Deployment Guide

This document covers everything needed to deploy, configure, and maintain the MAKEIT.TECH Media Navigator platform on Render.

---

## Architecture Overview

The entire platform runs as a **single Render Web Service**. Express 5 serves both the API (`/api/*`) and the built React frontend (static files from `dist/public/`). There is no separate frontend host — Netlify is not used.

```
Browser
  │
  └── Render Web Service  (https://makeitorbreakit.onrender.com)
        │
        ├── Express 5
        │     ├── /api/*              API endpoints
        │     ├── /uploads/media/*    Uploaded images (served as static)
        │     ├── /uploads/videos/*   Video files (served as static)
        │     └── /*                  React SPA (dist/public/index.html)
        │
        ├── BullMQ Worker (in-process, starts only when REDIS_URL is set)
        │     └── Video teaser processing jobs (FFmpeg)
        │
        └── External services
              ├── Neon (PostgreSQL + pgvector)
              ├── Upstash Redis  (BullMQ job queue, TLS)
              ├── Anthropic API  (Claude Sonnet 4.6)
              ├── Google Gemini  (@google/genai, background images)
              ├── Voyage AI      (embeddings)
              ├── Supadata       (YouTube transcripts)
              └── Resend         (email)
```

---

## Render Setup

### 1. Create the Web Service

1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub repo:
   - `https://github.com/blsmakeit/podcast.git`  (primary)
   - `https://github.com/MAKE-IT-TECH/mkit_podcast_pcb.git`  (mirror)
3. Configure:

| Setting | Value |
|---------|-------|
| Environment | Node |
| Region | Frankfurt (EU) or closest to your users |
| Branch | `main` |
| Build command | `npm install --include=dev && npm run build` |
| Start command | `npm run start` |
| Node version | `24` |

> `--include=dev` is required because `tsx`, `vite`, and `esbuild` are devDependencies used at build time.

### 2. Environment Variables

Add these in the Render dashboard under **Environment**:

| Key | Required | Value / Notes |
|-----|----------|---------------|
| `DATABASE_URL` | Yes | Neon connection string (includes `?sslmode=require`) |
| `ANTHROPIC_API_KEY` | Yes | `sk-ant-...` |
| `VOYAGE_API_KEY` | Yes | Voyage AI key |
| `SUPADATA_API_KEY` | Yes | Supadata key |
| `RESEND_API_KEY` | Yes | Resend key |
| `GEMINI_API_KEY` | Yes* | Google AI key — required for AI background generation |
| `REDIS_URL` | Yes* | Upstash Redis URL (`rediss://...`) — required for video teaser generation |
| `NODE_ENV` | Yes | `production` |
| `MEDIA_STORAGE_PATH` | No | Default: `./uploads/media` |
| `VIDEO_STORAGE_PATH` | No | Default: `./uploads/videos` |
| `PORT` | No | Default: `5000` (Render sets this automatically) |

`*` These features degrade gracefully without the key — AI background falls back to SVG, video teaser generation is disabled. All other features still work.

### 3. Install yt-dlp

yt-dlp is a Python tool required for YouTube video auto-download. It is **not** installed by npm. Add it to the build command:

```
pip3 install yt-dlp && npm install --include=dev && npm run build
```

Or create a `build.sh`:
```bash
#!/bin/bash
pip3 install yt-dlp
npm install --include=dev
npm run build
```

At startup, the server runs multi-candidate path detection to find the binary (`/usr/local/bin/yt-dlp`, `~/.local/bin/yt-dlp`, Render-specific paths, shell `find` fallback, `python3 -m yt_dlp` fallback). The resolved path is logged at startup — check Render logs if YouTube download fails.

### 4. FFmpeg

FFmpeg is **bundled via npm** (`@ffmpeg-installer/ffmpeg`). No system-level install is needed. The worker sets the FFmpeg path automatically:

```typescript
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
```

### 5. Redis (Upstash)

The video teaser job queue uses BullMQ with Upstash Redis over TLS (`rediss://`). The queue is lazy-initialised — if `REDIS_URL` is not set, the worker simply does not start and all other features remain functional.

To set up:
1. Create a free database at [upstash.com](https://upstash.com)
2. Copy the connection URL (must start with `rediss://` for TLS)
3. Add as `REDIS_URL` environment variable on Render

The BullMQ connection is configured with `maxRetriesPerRequest: null` and `enableReadyCheck: false` — required for Upstash compatibility.

---

## Post-Deploy Checklist

Run these once after the first deploy (or after a major schema change):

### Database setup

```sql
-- 1. Enable pgvector extension (Neon SQL editor)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create vector index (after running db:push)
CREATE INDEX ON episode_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);
```

```bash
# 3. Push Drizzle schema (creates all 11 tables)
# Run from local terminal pointing at production DATABASE_URL
npm run db:push
```

### Seed translations

```bash
curl -X POST https://makeitorbreakit.onrender.com/api/translations/seed
```

This is idempotent — safe to run multiple times.

---

## File Storage

Uploaded images and videos are written to local disk. Render's filesystem is **ephemeral** on free/starter tiers — files are lost on each deploy or instance restart.

| Path | Content | Env var |
|------|---------|---------|
| `./uploads/media/` | Campaign images (from image-only posts) | `MEDIA_STORAGE_PATH` |
| `./uploads/videos/` | Source MP4s + generated teaser clips | `VIDEO_STORAGE_PATH` |
| `./server/assets/` | `youtube-cookies.txt` (gitignored) | — |

### Options for persistent file storage

**Option 1 — Render Disk** (simplest, paid plans)
Add a persistent disk to your Render service and mount it at `/uploads`. Update `MEDIA_STORAGE_PATH` and `VIDEO_STORAGE_PATH` accordingly.

**Option 2 — AWS S3 / Cloudflare R2**
Replace the `multer.diskStorage` in `server/middleware/upload.ts` with an S3-compatible storage adapter (e.g. `multer-s3`). The `fileUrl` pattern stored in the DB would change from `/uploads/...` to `https://...`. This is the recommended path for production at scale.

**For now (MVP)**: files survive between requests on the same instance but are lost on deploy. For a social media workflow where you generate and immediately download the teaser, this is acceptable.

---

## Git Workflow

The repo pushes to **two remotes simultaneously**. Every push must go to both:

```bash
git push origin main
git push makeit main
```

If the `makeit` remote has diverged:
```bash
git pull makeit main --no-rebase
git push makeit main
```

### Remote URLs

```
origin   https://github.com/blsmakeit/podcast.git
makeit   https://github.com/MAKE-IT-TECH/mkit_podcast_pcb.git
```

To set up locally after cloning:
```bash
git remote add makeit https://github.com/MAKE-IT-TECH/mkit_podcast_pcb.git
```

---

## Local Development

```bash
# 1. Clone and install
git clone https://github.com/blsmakeit/podcast.git media-navigator
cd media-navigator
npm install

# 2. Configure environment
cp .env.example .env
# Fill in DATABASE_URL, ANTHROPIC_API_KEY, VOYAGE_API_KEY, SUPADATA_API_KEY, RESEND_API_KEY
# GEMINI_API_KEY and REDIS_URL are optional for local dev

# 3. Create tables
npm run db:push

# 4. Seed translations (once)
curl -X POST http://localhost:5000/api/translations/seed

# 5. Start dev server
npm run dev
```

The dev server runs on **port 5000**. Vite's dev middleware runs inside Express — there is no separate Vite process. All `/api/*` requests go to Express directly; the Vite HMR and React client are served by the Vite middleware registered in `server/vite.ts`.

### Local Redis (optional)

If you want to test video teaser generation locally:

```bash
# Using Docker
docker run -d -p 6379:6379 redis

# Then in .env
REDIS_URL=redis://localhost:6379
```

Without `REDIS_URL`, the BullMQ worker simply won't start and video generation will be unavailable — everything else works normally.

### Local yt-dlp (optional)

```bash
pip3 install yt-dlp
```

---

## Build System

```bash
npm run build
```

This runs `script/build.ts` which:
1. Runs Vite to build the React frontend → `dist/public/`
2. Runs esbuild to bundle the Express server → `dist/index.cjs`

```bash
npm run start
```

Starts `dist/index.cjs` in production mode. Express serves `dist/public/` as static files and handles all API routes.

---

## Startup Logs to Watch

On Render, check the deploy logs for:

```
[yt-dlp] found at: /root/.local/bin/yt-dlp — version: 2025.x.x
[yt-dlp] final resolved path: /root/.local/bin/yt-dlp
[startup] PATH env: ...
serving on port 10000
```

If you see:
```
[yt-dlp] NOT FOUND — YouTube auto-download will fail
```
The yt-dlp install step in the build command is not working. Check the build logs.

---

## CORS Note

`server/index.ts` has a CORS allowlist that still references `media-navigator.netlify.app` (legacy). In production this does not matter because the frontend is served from the same origin as the API — same Render URL, no cross-origin requests. The CORS middleware only applies to requests from a different origin.

If you ever add an external frontend (e.g. a mobile app or a separate domain), update the `origin` array in `server/index.ts`.

---

## Render Free Tier Behaviour

On Render's free tier, the service **sleeps after 15 minutes of inactivity** and has a ~30 second cold start. For the Social Media Manager (admin-only, low traffic) this is acceptable. For production traffic on the public site, consider upgrading to a paid Render instance to avoid cold starts.

---

## Recommended Next Steps for Production

| Priority | Action |
|----------|--------|
| High | Add a Render Disk or migrate uploads to S3/R2 for persistent file storage |
| High | Change the backoffice password in `BackofficeContext.jsx` |
| Medium | Pin the Render Node version to 24 explicitly in `package.json` engines field |
| Medium | Set up a Render health check endpoint (`GET /api/health`) |
| Low | Upgrade Render to a paid plan to eliminate cold starts |
| Low | Add a CDN (Cloudflare) in front of Render for the public site |
