# 🎙️ MAKEIT.TECH — Media Navigator

> A professional podcast and videocast platform with **PCB (Podcast Content Browser)** — an AI-powered tool built on Anthropic Claude that finds the exact moment you're looking for inside any episode — plus **YouTube Auto-Extraction** that turns any YouTube URL into a fully-structured episode in seconds.

![Status](https://img.shields.io/badge/Status-Ongoing-green)
![Node](https://img.shields.io/badge/Node.js-20+-blue)
![React](https://img.shields.io/badge/React-18-61DAFB)
![Claude](https://img.shields.io/badge/Claude-Sonnet_4.6-orange)
![Express](https://img.shields.io/badge/Express-5-black)
![GitHub](https://img.shields.io/badge/Source-GitHub-181717)
![YouTube](https://img.shields.io/badge/Videos-YouTube-FF0000)
![Netlify](https://img.shields.io/badge/Frontend-Netlify-00C7B7)
![Render](https://img.shields.io/badge/Backend-Render-46E3B7)
![Neon](https://img.shields.io/badge/Database-Neon-00E5C0)
![Supadata](https://img.shields.io/badge/Transcripts-Supadata-6366F1)

## 📖 Overview

**Media Navigator** is the digital home for MAKEIT.TECH Podcasts & Videocasts — a platform built for builders, engineers, and founders.

At its core is **PCB (Podcast Content Browser)** — a dual meaning: *Printed Circuit Board* (the company's hardware roots) and *Podcast Content Browser* (the AI feature). PCB uses **Anthropic Claude Sonnet 4.6** to analyse episode transcripts and jump you directly to the exact timestamp you're looking for.

The platform includes:
- **PCB AI Search** — natural language search across all episodes with timestamp precision
- **YouTube Auto-Extraction** — paste a YouTube URL, get description, category, and key moments generated automatically via Supadata + Claude
- **Episode Grid** with category filters and real-time client-side search
- **Video Player** with YouTube IFrame support, key moments sidebar, and share functionality
- **Password-protected Backoffice** — add and delete episodes without touching code
- **Category System** — 7 predefined categories for episode organisation
- **Full Deployment Pipeline** — GitHub → Render (backend) + Netlify (frontend) + Neon (DB)

---

## 🏗️ System Architecture

### Core Components

1. **React Frontend (Netlify)**
   - JavaScript/JSX — no TypeScript on the client
   - Wouter for routing, TanStack Query for data fetching
   - Shadcn/ui + Tailwind CSS + Framer Motion for UI
   - `VITE_API_URL` env var switches between local proxy and production API

2. **Express Backend (Render)**
   - TypeScript, Express 5, Drizzle ORM
   - CORS middleware for cross-origin requests from Netlify
   - PCB endpoint calls Anthropic Claude with all episode context
   - Seed data auto-inserted on first boot if DB is empty

3. **PostgreSQL Database (Neon)**
   - Serverless Postgres — free tier, always-on
   - Single `podcasts` table with JSONB `transcripts` column
   - Schema managed with Drizzle Kit (`npm run db:push`)

4. **PCB AI Engine**
   - `POST /api/ai/search` receives user query
   - Fetches all episodes + transcripts from DB
   - Sends context + query to Claude Sonnet 4.6
   - Returns `{ podcastId, timestamp, explanation }`

5. **YouTube Auto-Extraction Engine**
   - `POST /api/episodes/extract` receives `{ youtubeUrl, title }`
   - Extracts video ID → builds embed URL + thumbnail URL
   - Fetches transcript via **Supadata API** (`api.supadata.ai`) — no scraping, no bot detection
   - Sends formatted transcript to Claude Sonnet 4.6
   - Returns `{ videoUrl, thumbnailUrl, description, category, keyMoments }`

### Request Flow

```
┌─────────────────────────┐
│   Netlify (Frontend)    │
│  React 18 + Vite        │
│  VITE_API_URL → Render  │
└──────────┬──────────────┘
           │  HTTPS (CORS-enabled)
           ▼
┌─────────────────────────┐
│   Render (Backend)      │
│  Express 5 + TypeScript │◄──── env: DATABASE_URL
│  Port 5000              │◄──── env: ANTHROPIC_API_KEY
│                         │◄──── env: SUPADATA_API_KEY
└──────────┬──────────────┘
           │
     ┌─────┴──────────────┐
     │            │       │
     ▼            ▼       ▼
┌─────────┐  ┌──────────┐  ┌───────────────┐
│  Neon   │  │Anthropic │  │  Supadata     │
│Postgres │  │  Claude  │  │  (transcripts)│
│  (DB)   │  │ Sonnet   │  │               │
└─────────┘  └──────────┘  └───────────────┘
```

### PCB Search Flow

```
┌──────────────────────────┐
│  User types query        │
│  in PCB search bar       │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  POST /api/ai/search     │
│  { query: "..." }        │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  Fetch ALL episodes      │
│  + transcripts from DB   │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  Claude Sonnet 4.6       │
│  analyses context        │
│  → returns JSON          │
│  { podcastId,            │
│    timestamp,            │
│    explanation }         │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  Frontend navigates to   │
│  /podcasts/:id           │
│  at exact timestamp      │
└──────────────────────────┘
```

---

## 📂 Project Structure

```
Media-Navigator/
├── client/                      # React frontend (JavaScript/JSX)
│   ├── index.html
│   ├── public/
│   └── src/
│       ├── components/
│       │   ├── backoffice/      # Admin-only components
│       │   │   ├── BackofficeContext.jsx   # Auth context + password modal
│       │   │   └── AddEpisodeModal.jsx     # Add episode form
│       │   ├── ui/              # Shadcn/ui primitives (do not edit)
│       │   ├── EpisodeCard.jsx  # Card with category badge + delete button
│       │   └── Layout.jsx       # Nav + footer + admin toggle
│       ├── hooks/
│       │   ├── use-episodes.js  # All API hooks (episodes + PCB search)
│       │   ├── use-toast.ts     # Shadcn/ui toast (kept as TS)
│       │   └── use-mobile.tsx   # Shadcn/ui mobile hook (kept as TS)
│       ├── lib/
│       │   ├── queryClient.js   # TanStack Query client
│       │   └── utils.js         # cn() utility
│       └── pages/
│           ├── Home.jsx          # Landing page + PCB search hero
│           ├── Episodes.jsx      # Full episode grid + category filters
│           ├── PodcastDetail.jsx # Video player + key moments sidebar
│           ├── About.jsx
│           ├── Subscribe.jsx
│           ├── ComingSoon.jsx    # Placeholder for future pages
│           └── NotFound.jsx
├── server/                      # Express backend (TypeScript)
│   ├── index.ts                 # Entry point + CORS middleware
│   ├── routes.ts                # All API endpoints + PCB + seed data
│   ├── storage.ts               # Database access layer (Drizzle)
│   ├── db.ts                    # Drizzle + pg connection
│   ├── static.ts                # Serves dist/public in production
│   └── vite.ts                  # Vite dev middleware (development only)
├── shared/                      # Shared types — TypeScript
│   ├── schema.ts                # Drizzle schema + EPISODE_CATEGORIES
│   └── routes.ts                # Typed API route + Zod schemas
├── script/
│   └── build.ts                 # esbuild + vite production build
├── .env                         # Local secrets (gitignored)
├── .env.example                 # Environment variable reference
├── netlify.toml                 # Netlify: build command + SPA redirect
├── vite.config.ts               # Vite: root, alias, dev proxy → :5000
├── tailwind.config.ts
├── drizzle.config.ts
└── package.json
```

---

## 🚀 Local Development

### Prerequisites

- Node.js 20+
- A PostgreSQL database — [Neon](https://neon.tech) is recommended (free, no local install)
- An Anthropic API key — get one at [console.anthropic.com](https://console.anthropic.com)
- A Supadata API key — get one at [supadata.ai](https://supadata.ai) (required for YouTube transcript extraction)

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-username/media-navigator.git
cd media-navigator

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — fill in DATABASE_URL, ANTHROPIC_API_KEY, and SUPADATA_API_KEY

# 4. Push database schema (creates the podcasts table)
npm run db:push

# 5. Start the full dev server (Express + Vite together)
npm run dev
```

The app runs at **http://localhost:5000**

Vite proxies all `/api/*` requests to the Express server automatically — no CORS issues in development.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Express + Vite dev server together (port 5000) |
| `npm run dev:client` | Start Vite only, pointing at `VITE_API_URL` |
| `npm run build` | Production build — Vite (client) + esbuild (server) |
| `npm run build:client` | Build frontend only (used by Netlify) |
| `npm run start` | Start production server (`dist/index.cjs`) |
| `npm run db:push` | Push Drizzle schema to database |
| `npm run check` | TypeScript type check |

---

## 🎛️ Backoffice Admin

The backoffice is a hidden admin mode that lets you manage episodes without touching the database directly.

| Action | Detail |
|--------|--------|
| **Open** | Click **🔒 Admin** in the footer (far right) |
| **Password** | `MIcompany2020` |
| **Session** | Stored in `sessionStorage` — clears on tab close |
| **Exit** | Click **🔓 Exit Admin** in the footer |

**In admin mode:**
- A red banner appears at the top of every page
- **+ Add Episode** button appears on Home and Episodes pages
- A **Delete** button appears on each episode card (asks for confirmation)

---

## ➕ Adding Episodes

### Option 1 — YouTube Auto-Extract (recommended)

This is the fastest way to add a MAKEIT.TECH videocast episode:

1. Open the app → footer → **🔒 Admin** → enter password
2. Click **+ Add Episode**
3. Enter the **Title** and paste the **YouTube URL**
4. Choose extraction options:

   **Transcript Source**
   | Option | When to use |
   |--------|-------------|
   | **Auto (YouTube)** | Default — fetches transcript automatically from YouTube via Supadata |
   | **Import file** | Use when YouTube captions are unavailable — paste transcript exported from Adobe Premiere or any tool that generates timestamped text |

   **Analysis Mode**
   | Option | When to use |
   |--------|-------------|
   | **Full analysis** | Default — sends the complete transcript to Claude. Best for videos under 45 min |
   | **Summarised** | Recommended for videos over 45 min — samples the transcript evenly across the entire video to preserve full coverage (beginning, middle, end) without exceeding Claude's token limit |

5. Click **Extract** — the backend fetches the transcript, sends it to **Claude Sonnet 4.6**, and auto-fills description, category, thumbnail, and key moments
6. Review the extracted data (all fields remain editable)
7. Click **Add Episode** — appears immediately

**YouTube video requirements** when using Auto (YouTube) source:

| Requirement | Detail |
|-------------|--------|
| **Ownership** | Must be your own channel's video |
| **Visibility** | Public or Unlisted — Private videos are not supported |
| **Language** | English or Portuguese |
| **Chapters** | Add chapters/sections in the video description for best key moments |

> If a video has no YouTube captions, switch to **Import file** and paste the transcript manually (see Option 3 below).

### Option 2 — Manual entry via Backoffice

1. Open the app → footer → **🔒 Admin** → enter password
2. Click **+ Add Episode**
3. Fill in all fields manually:
   - **Title** — episode title
   - **Description** — short summary (used by PCB as fallback)
   - **Video URL** — direct `.mp4` link or YouTube embed URL
   - **Thumbnail URL** — card image (16:9 recommended)
   - **Category** — see [Categories](#-categories) below
   - **Key Moments** — rows of `Time / Topic / Text` (critical for PCB accuracy)
4. Click **Add Episode** — appears immediately

### Option 3 — Import Transcript from Premiere (or any tool)

Use this when the YouTube video has no captions, or when you have a higher-quality transcript from your editing software:

1. In **Adobe Premiere** (or any tool), export the transcript as a text file with timestamps
2. Open **Add Episode** modal → paste the **YouTube URL** and enter the **Title**
3. Under **Transcript Source**, select **Import file**
4. Paste the transcript text into the textarea that appears
5. Choose **Analysis Mode** (Full or Summarised — see Option 1 for guidance)
6. Click **Extract** — Claude analyses your pasted transcript instead of fetching from YouTube
7. Review and publish

**Supported transcript formats:**

| Format | Example |
|--------|---------|
| `[MM:SS]` timestamps | `[01:30] We discuss hardware prototyping...` |
| `[HH:MM:SS]` timestamps | `[00:01:30] We discuss hardware prototyping...` |
| Plain text (no timestamps) | Lines are assigned 5-second intervals automatically |

### Option 4 — Via Neon SQL Editor

Open the Neon dashboard → SQL Editor and run:

```sql
INSERT INTO podcasts (title, description, video_url, thumbnail_url, category, transcripts)
VALUES (
  'Episode Title',
  'Short episode description.',
  'https://your-cdn.com/episode.mp4',
  'https://your-cdn.com/thumbnail.jpg',
  'Technology',
  '[
    {"time":"00:00","topic":"Introduction","text":"Welcome and overview of the episode."},
    {"time":"05:30","topic":"Main Topic","text":"We dive into the core subject matter."},
    {"time":"18:45","topic":"Key Insight","text":"The most important takeaway from this discussion."}
  ]'
);
```

**Transcript format (JSONB):**
| Field | Format | Description |
|-------|--------|-------------|
| `time` | `"MM:SS"` or `"HH:MM:SS"` | Timestamp for this moment |
| `topic` | Short string | Label shown in the sidebar |
| `text` | 1–2 sentences | Context shown as preview — used by PCB |

---

## 🏷️ Categories

Defined in `shared/schema.ts` as `EPISODE_CATEGORIES`:

| Category | Use for |
|----------|---------|
| `Technology` | General tech topics |
| `Hardware & PCB` | Electronics, circuit boards, embedded systems |
| `Design` | UX, product design, visual design |
| `Business` | Entrepreneurship, strategy, growth |
| `AI & Software` | Machine learning, software engineering |
| `Innovation` | New ideas, future of tech |
| `Other` | Anything that doesn't fit |

---

## 🤖 PCB — How the AI Works

**PCB** = *Printed Circuit Board* (MAKEIT.TECH's hardware roots) + *Podcast Content Browser*

### Endpoint

```
POST /api/ai/search
Body: { "query": "how to build an MVP fast" }
Response: { "podcastId": 1, "timestamp": "05:30", "explanation": "..." }
```

### How to maximise accuracy

The quality of PCB results depends entirely on the **Key Moments** (transcripts) you add to each episode:

- Add **at least 5–10 key moments** per episode
- Write `text` in plain, searchable language — describe what is *discussed*, not just the topic name
- Cover the full timeline of the episode (beginning, middle, end)
- Be specific: `"We discuss the exact tools and frameworks used to build the MVP in 2024"` beats `"Tools"`

### Token management during extraction

When extracting with Claude, the transcript is sent as context. Long videos produce large transcripts that can exceed Claude's token limit:

| Mode | How it works | Best for |
|------|-------------|----------|
| **Full analysis** | Sends the complete transcript to Claude | Videos under ~45 min |
| **Summarised** | Samples 1 line every N lines, evenly across the entire video — preserves coverage of beginning, middle, and end without exceeding the token limit | Videos over 45 min |

If extraction fails with a token/context error, switch to **Summarised** mode.

**Environment variable required:**
- Local: `ANTHROPIC_API_KEY` in `.env`
- Production: `ANTHROPIC_API_KEY` in Render environment variables

---

## ☁️ Deployment: GitHub + Netlify + Render + Neon

All four services have **free tiers** — no credit card required for basic use.

| Service | Role | Free? |
|---------|------|-------|
| **GitHub** | Source code + auto-deploys trigger | Yes |
| **Neon** | Serverless PostgreSQL database | Yes — permanent free tier |
| **Render** | Express API server | Yes — sleeps after 15 min inactivity |
| **Netlify** | React frontend (static hosting) | Yes — unlimited deploys |

---

### Step 1 — Neon (database)

1. Go to [neon.tech](https://neon.tech) → Create account → **New Project**
2. Choose a region close to your audience
3. Copy the **Connection string** (format: `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`)
4. Add it to your local `.env` as `DATABASE_URL`
5. Run schema migration once from your local terminal:
   ```bash
   npm run db:push
   ```

---

### Step 2 — Render (backend)

1. Go to [render.com](https://render.com) → **New** → **Web Service** → connect GitHub → select repo
2. Configure:

   | Setting | Value |
   |---------|-------|
   | **Build command** | `npm install --include=dev && npm run build` |
   | **Start command** | `npm run start` |
   | **Node version** | `20` |

3. Add **Environment Variables**:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Your Neon connection string |
   | `ANTHROPIC_API_KEY` | Your Anthropic API key |
   | `SUPADATA_API_KEY` | Your Supadata API key |
   | `NODE_ENV` | `production` |

4. Deploy — note your Render URL (e.g. `https://media-navigator.onrender.com`)

> ⚠️ **Important:** The build command must use `--include=dev` because `tsx`, `vite`, and `esbuild` are devDependencies needed during the build phase.

> 💤 **Free tier note:** The server sleeps after 15 minutes of inactivity. The first request after sleeping takes ~30 seconds.

---

### Step 3 — Netlify (frontend)

1. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from GitHub** → select repo
2. Netlify reads `netlify.toml` automatically — no build settings needed
3. Add **Environment Variable**:

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | Your Render URL (e.g. `https://media-navigator.onrender.com`) |

4. Click **Deploy site**

---

### Updating the app

Every `git push` to `main` triggers automatic redeployment on both Render and Netlify:

```bash
git add .
git commit -m "Your change description"
git push
```

---

## 🔑 Environment Variables

| Variable | Where | Required | Description |
|----------|-------|----------|-------------|
| `DATABASE_URL` | `.env` + Render | Yes | Neon PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | `.env` + Render | Yes | Anthropic API key for PCB + auto-extraction |
| `SUPADATA_API_KEY` | `.env` + Render | Yes | Supadata API key for YouTube transcript extraction |
| `PORT` | `.env` only | No | Server port (default: `5000`) |
| `VITE_API_URL` | Netlify dashboard | Production only | Full Render backend URL |

> `.env` is gitignored and never committed. Use `.env.example` as reference.

---

## 🛠️ Technical Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | React | 18 | UI framework |
| **Language** | JavaScript/JSX | ES2022 | Client-side (no TypeScript) |
| **Routing** | Wouter | ^3.3 | Lightweight SPA router |
| **Data Fetching** | TanStack Query | ^5.60 | Server state + caching |
| **UI Components** | Shadcn/ui | Latest | Accessible component library |
| **Styling** | Tailwind CSS | ^3.4 | Utility-first CSS |
| **Animation** | Framer Motion | ^11 | Page and component animations |
| **Backend** | Express | 5 | API server |
| **Backend Language** | TypeScript | 5.6 | Server-side type safety |
| **ORM** | Drizzle ORM | ^0.39 | Type-safe database queries |
| **Database** | PostgreSQL | via Neon | Relational data storage |
| **AI** | Anthropic Claude | Sonnet 4.6 | PCB podcast search + episode analysis |
| **Transcript API** | Supadata | REST v1 | YouTube transcript extraction |
| **Build — Client** | Vite | ^7.3 | Frontend bundler |
| **Build — Server** | esbuild | ^0.25 | Server bundler (CJS output) |
| **Hosting — Frontend** | Netlify | — | Static site hosting |
| **Hosting — Backend** | Render | — | Node.js web service |
| **Database Host** | Neon | — | Serverless PostgreSQL |

---

## 📡 API Reference

### Episodes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/podcasts` | List all episodes |
| `GET` | `/api/podcasts/:id` | Get single episode |
| `POST` | `/api/podcasts` | Create episode (backoffice) |
| `DELETE` | `/api/podcasts/:id` | Delete episode (backoffice) |

### YouTube Auto-Extraction

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/episodes/extract` | Extract episode data from YouTube URL |

**Request:**
```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
  "title": "Episode Title",
  "transcriptSource": "supadata | file",
  "transcriptText": "optional — paste transcript from Premiere or any tool (required when transcriptSource is file)",
  "analysisMode": "full | summary"
}
```

| Field | Values | Default | Description |
|-------|--------|---------|-------------|
| `youtubeUrl` | URL string | — | Required. YouTube watch, short, or embed URL |
| `title` | string | — | Required. Episode title |
| `transcriptSource` | `"supadata"` \| `"file"` | `"supadata"` | Where to fetch the transcript from |
| `transcriptText` | string | — | Required when `transcriptSource` is `"file"` — raw transcript text, supports `[MM:SS]` timestamps or plain text |
| `analysisMode` | `"full"` \| `"summary"` | `"full"` | `"full"` sends the complete transcript; `"summary"` samples evenly up to 200 lines to prevent token overload on long videos |

**Response:**
```json
{
  "videoUrl": "https://www.youtube.com/embed/VIDEO_ID",
  "thumbnailUrl": "https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg",
  "description": "AI-generated 2–3 sentence summary.",
  "category": "Technology",
  "keyMoments": [
    { "time": "00:00", "topic": "Introduction", "text": "Opening discussion..." },
    { "time": "05:30", "topic": "Main Topic", "text": "Deep dive into..." }
  ]
}
```

### PCB AI Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ai/search` | Search episodes with Claude |

**PCB Request:**
```json
{ "query": "how to build an MVP fast" }
```

**PCB Response:**
```json
{
  "podcastId": 1,
  "timestamp": "05:30",
  "explanation": "At 5:30, the hosts discuss rapid MVP building techniques using lean startup principles."
}
```

---

## 👨‍💻 Author

**Bruno Sousa** — MAKEIT.TECH

---

## 🙏 Acknowledgments

- **Anthropic** for Claude Sonnet 4.6
- **Supadata** for YouTube transcript extraction API
- **Neon** for serverless PostgreSQL
- **Shadcn/ui** for the component library
- **Drizzle ORM** for type-safe database access
- **Render & Netlify** for free-tier hosting

---

**Version**: 1.0.0
**Status**: Ongoing
**Last Updated**: 2026-02-23
