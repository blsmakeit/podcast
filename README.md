# 🎙️ MAKEIT.TECH — Media Navigator

![Status](https://img.shields.io/badge/Status-Ongoing-green)
![Version](https://img.shields.io/badge/Version-1.1.0-blue)
![Node](https://img.shields.io/badge/Node.js-20+-blue)
![React](https://img.shields.io/badge/React-18-61DAFB)
![Claude](https://img.shields.io/badge/Claude-Sonnet_4.6-orange)
![Express](https://img.shields.io/badge/Express-5-black)
![pgvector](https://img.shields.io/badge/pgvector-1024_dims-6B5B95)
![VoyageAI](https://img.shields.io/badge/Voyage_AI-voyage--3-5B4A8A)
![Netlify](https://img.shields.io/badge/Frontend-Netlify-00C7B7)
![Render](https://img.shields.io/badge/Backend-Render-46E3B7)
![Neon](https://img.shields.io/badge/Database-Neon-00E5C0)
![Supadata](https://img.shields.io/badge/Transcripts-Supadata-6366F1)

**Media Navigator** is the digital home for MAKEIT OR BREAKIT Podcasts & Videocasts — a platform built for builders, engineers, and founders. It combines **PCB (Podcast Content Browser)**, an AI-powered timestamp search across all episodes, with a full **RAG chatbot** that answers questions about episodes and the show using semantic retrieval. Episodes are enriched automatically via YouTube Auto-Extraction (Supadata + Claude Sonnet 4.6) and a **PT/EN language switch** serves both English and Portuguese audiences from a single Neon translations table.

**Live:** https://media-navigator.onrender.com/

---

## ✨ Features

- **PCB AI Search** — natural language query → exact timestamp in any episode (20-word limit)
- **RAG Chatbot** — floating widget, semantic search via pgvector + Voyage AI + Claude Sonnet 4.6 (100-word limit)
- **YouTube Auto-Extraction** — paste URL → description, category, key moments generated automatically
- **Gemini 2.0 Flash** as alternative AI provider for extraction
- **Episode Grid** — category filters, real-time client-side search
- **Video Player** — YouTube IFrame, key moments sidebar, timestamp deep-links
- **Backoffice** — password-protected admin mode: add, edit, delete episodes without touching the DB
- **Questions Carousel** — 8 AI-generated search prompts, 24h cached, rotates every 6s
- **Featured Q&A Cards** — 3 AI-generated question/answer cards with play buttons
- **Section Visibility Toggles** — admin can show/hide carousel and featured cards
- **PT/EN Language Switch** — pill toggle in navbar, DB-backed translations, instant static fallback
- **Email Subscriptions** — newsletter list stored in Neon, deduplication on insert
- **Contact Form** — sends email via Resend to `contact@make-it.tech`
- **HPC Batch Embedding** — MareNostrum5 SLURM pipeline for bulk re-embedding (BAAI/bge-large-en-v1.5)
- **Draggable chat widget** — position persisted to localStorage

---

## 🏗️ How It Was Built

React 18 (JSX, no TypeScript) on Netlify talks to an Express 5 + TypeScript API on Render, backed by Neon serverless PostgreSQL with pgvector for semantic search. All AI features — PCB search, RAG chatbot, auto-extraction — run through Anthropic Claude Sonnet 4.6, with Voyage AI `voyage-3` generating 1024-dim embeddings for the vector store and Gemini 2.0 Flash available as an alternative extraction engine.

<details><summary>Frontend</summary>

React 18 + Vite (JSX only — no TypeScript on the client). Wouter for routing, TanStack Query for server state and caching (staleTime 1h for translations). Shadcn/ui component library, Tailwind CSS, Framer Motion for animations. `LanguageProvider` (via `useLanguage`) wraps the entire app for PT/EN i18n — DB values from `/api/translations/:lang` take precedence, with a static JS file as an instant zero-latency fallback. `ChatWidget` is rendered outside `<Router>` so it persists across all pages.

</details>

<details><summary>Backend</summary>

Express 5 + TypeScript. Drizzle ORM with `drizzle-kit` for schema management. 17 API endpoints across episodes, AI search, chatbot, questions, settings, subscribers, contact, and translations. Claude Sonnet 4.6 handles PCB search (`max_tokens: 1024`), RAG chat responses (`max_tokens: 1024`), and episode extraction (`max_tokens: 4096`). Voyage AI `voyage-3` generates 1024-dim embeddings for both new episode chunks (fire-and-forget on create/update) and real-time query embedding in the chat endpoint. Gemini 2.0 Flash is available as an optional extraction AI provider. Resend sends contact form emails.

</details>

<details><summary>Database — Neon + pgvector</summary>

Six tables in Neon serverless PostgreSQL:

| Table | Purpose |
|-------|---------|
| `podcasts` | Episodes — title, description, video_url, thumbnail_url, category, transcripts (JSONB) |
| `episode_chunks` | RAG vector store — `vector(1024)`, chunk_type, content, time_ref, topic |
| `translations` | PT/EN i18n — key, en, pt (80 keys) |
| `generated_content` | AI-generated questions carousel + featured Q&A cards (24h DB cache) |
| `site_settings` | Section visibility toggles (show_carousel, show_featured_questions) |
| `subscribers` | Newsletter email list |

`episode_chunks` uses a custom Drizzle `customType` for the `vector(1024)` column (pgvector). An IVFFlat index is created manually in the Neon SQL editor.

</details>

<details><summary>RAG Chatbot</summary>

The floating `ChatWidget` sends conversation history (last 10 messages) to `POST /api/chat`. The server embeds the latest user message with Voyage AI `voyage-3`, runs a cosine similarity search against `episode_chunks` (threshold 0.35, top 12), injects the retrieved chunks plus `companyKnowledge` into a Claude Sonnet 4.6 system prompt, and returns JSON `{ message, actions?, sources? }`. The widget renders action pill buttons and source citations below each assistant message. See [RAG_CHATBOT.md](./RAG_CHATBOT.md) for the full technical guide.

</details>

<details><summary>PT/EN Language Switch</summary>

Language state lives in `localStorage` (default: `en`). `LanguageProvider` (`client/src/hooks/use-language.jsx`) fetches `/api/translations/:lang` via TanStack Query (staleTime 1h) and merges DB values over the static fallback in `client/src/lib/translations.js`. The `t(key)` function resolves: DB value → static[lang][key] → static.en[key] → fallback → key. The `LangToggle` pill (EN / PT) appears in the desktop nav (after Subscribe) and in the mobile header (left of hamburger). Translations are seeded to Neon via `POST /api/translations/seed` and updated by re-running the seed (idempotent upsert).

</details>

<details><summary>HPC Batch Embedding (MareNostrum5)</summary>

For bulk re-embedding of all episodes using `BAAI/bge-large-en-v1.5` (1024 dims) on MareNostrum5 (BSC). The pipeline: `hpc/export_chunks.ts` (local) → exports JSON → `scp` to MareNostrum → `hpc/embed_episodes.slurm` runs `hpc/embed_episodes.py` → `scp` output back → `hpc/import_embeddings.ts` (local) upserts into Neon. Used for initial bulk embedding and after major changes to `companyKnowledge`. New episodes are handled automatically by the Voyage AI pipeline. See [RAG_CHATBOT.md](./RAG_CHATBOT.md) for the full step-by-step guide.

</details>

---

## 🚀 Quick Start

```bash
git clone https://github.com/your-username/media-navigator.git && cd media-navigator
npm install
cp .env.example .env          # fill in DATABASE_URL, ANTHROPIC_API_KEY, VOYAGE_API_KEY
npm run db:push               # create tables in Neon
npm run dev                   # http://localhost:5000
```

Seed translations (one-time, idempotent):
```bash
curl -X POST http://localhost:5000/api/translations/seed
```

<details><summary>Full local setup</summary>

### Prerequisites

- Node.js 20+
- [Neon](https://neon.tech) account (free) — or any PostgreSQL instance with the `vector` extension
- [Anthropic API key](https://console.anthropic.com) — required for PCB search, chatbot, extraction
- [Voyage AI API key](https://voyageai.com) — required for RAG embeddings
- [Supadata API key](https://supadata.ai) — required for YouTube transcript extraction
- [Resend API key](https://resend.com) — required for contact form email
- Gemini API key — optional, enables Gemini as an alternative extraction AI

### Setup steps

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — fill in all required keys

# 3. Enable pgvector in Neon (run once in Neon SQL editor)
# CREATE EXTENSION IF NOT EXISTS vector;

# 4. Push Drizzle schema to create all 6 tables
npm run db:push

# 5. Create the IVFFlat index (run once in Neon SQL editor)
# CREATE INDEX ON episode_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

# 6. Seed translation strings (run once, safe to re-run)
curl -X POST http://localhost:5000/api/translations/seed

# 7. Start development server
npm run dev
```

The app runs at **http://localhost:5000**. Vite proxies all `/api/*` requests to Express — no CORS issues in development.
To analyse the full chatbot implementation go to https://htmlpreview.github.io/?https://github.com/blsmakeit/podcast/edit/main/rag-chatbot-notion.html

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Express + Vite together (port 5000) |
| `npm run build` | Production build — Vite (client) + esbuild (server) |
| `npm run start` | Start production server (`dist/index.cjs`) |
| `npm run db:push` | Push Drizzle schema to database |
| `npm run check` | TypeScript type check |

</details>

---

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Yes | Claude Sonnet 4.6 — PCB search, chatbot, extraction |
| `VOYAGE_API_KEY` | Yes | Voyage AI `voyage-3` — RAG embeddings |
| `SUPADATA_API_KEY` | Yes | YouTube transcript extraction |
| `RESEND_API_KEY` | Yes | Contact form email delivery |
| `GEMINI_API_KEY` | Optional | Gemini 2.0 Flash — alternative extraction AI |
| `PORT` | No | Server port (default: `5000`) |
| `VITE_API_URL` | Production | Full Render backend URL (set in Netlify dashboard) |

> Copy `.env.example` to `.env` for local development. Never commit `.env`.

---

## ☁️ Deployment

**Neon** hosts the PostgreSQL database (serverless, free tier, pgvector enabled). **Render** runs the Express API (free tier — sleeps after 15 min inactivity, ~30s cold start). **Netlify** serves the React frontend as a static site.

Every `git push` to `main` triggers automatic redeployment on both Render and Netlify.

<details><summary>Render configuration</summary>

1. New Web Service → connect GitHub repo
2. Configure:

   | Setting | Value |
   |---------|-------|
   | Build command | `npm install --include=dev && npm run build` |
   | Start command | `npm run start` |
   | Node version | `20` |

3. Environment variables to add:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Neon connection string |
   | `ANTHROPIC_API_KEY` | Anthropic key |
   | `VOYAGE_API_KEY` | Voyage AI key |
   | `SUPADATA_API_KEY` | Supadata key |
   | `RESEND_API_KEY` | Resend key |
   | `GEMINI_API_KEY` | Optional — Gemini key |
   | `NODE_ENV` | `production` |

> `--include=dev` is required in the build command because `tsx`, `vite`, and `esbuild` are devDependencies used at build time.

**Netlify:** add a single env var — `VITE_API_URL` → your Render URL (e.g. `https://media-navigator.onrender.com`).

</details>

<details><summary>Post-deploy checklist</summary>

Run these once after first deploy (or after a major schema change):

1. **Enable pgvector** — Neon SQL editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

2. **Create tables** — from local terminal (pointing at production `DATABASE_URL`):
   ```bash
   npm run db:push
   ```

3. **Create IVFFlat index** — Neon SQL editor:
   ```sql
   CREATE INDEX ON episode_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
   ```

4. **Seed translations** — after deploy:
   ```bash
   curl -X POST https://your-render-url.onrender.com/api/translations/seed
   ```

</details>

---

## 📡 API Reference

<details><summary>All 17 endpoints</summary>

### Episodes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/podcasts` | List all episodes |
| `GET` | `/api/podcasts/:id` | Get single episode |
| `POST` | `/api/podcasts` | Create episode — triggers embeddings + question regeneration |
| `PUT` | `/api/podcasts/:id` | Update episode — triggers embeddings + question regeneration |
| `DELETE` | `/api/podcasts/:id` | Delete episode — triggers question regeneration |
| `POST` | `/api/episodes/extract` | YouTube auto-extraction (Supadata + Claude or Gemini) |

### AI

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ai/search` | PCB search — all episodes → Claude → `{ podcastId, timestamp, explanation }` |
| `POST` | `/api/chat` | RAG chatbot — pgvector search → Claude → `{ message, actions?, sources? }` |

### Content

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/questions` | 8 AI-generated search suggestions (24h DB cache) |
| `GET` | `/api/featured-questions` | 3 AI-generated Q&A cards (24h DB cache) |

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/settings` | Section visibility flags |
| `PUT` | `/api/settings` | Update a single setting key |

### Subscribers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/subscribe` | Add email to subscriber list |
| `GET` | `/api/subscribers` | List all subscribers (admin) |

### Contact

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/contact` | Send contact form email via Resend |

### Translations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/translations/:lang` | Get all strings for `en` or `pt` |
| `POST` | `/api/translations/seed` | Upsert all 80 translation strings (idempotent) |

</details>

---

## 📂 Project Structure

<details><summary>Directory tree with descriptions</summary>

```
Media-Navigator/
├── client/                          # React frontend (JavaScript/JSX)
│   ├── index.html
│   ├── public/
│   └── src/
│       ├── components/
│       │   ├── backoffice/
│       │   │   ├── BackofficeContext.jsx   # Auth context + password modal
│       │   │   └── AddEpisodeModal.jsx     # Add/edit episode form
│       │   ├── chat/
│       │   │   └── ChatWidget.jsx          # Draggable RAG chatbot widget
│       │   ├── ui/                         # Shadcn/ui primitives (do not edit)
│       │   ├── EpisodeCard.jsx             # Card with category badge + delete button
│       │   └── Layout.jsx                  # Nav + footer + LangToggle + admin toggle
│       ├── hooks/
│       │   ├── use-episodes.js             # Episode + PCB + questions + settings hooks
│       │   ├── use-chat.js                 # Chat state + POST /api/chat mutation
│       │   ├── use-language.jsx            # LanguageProvider + useLanguage()
│       │   ├── use-toast.ts                # Shadcn/ui toast (kept as TS)
│       │   └── use-mobile.tsx              # Shadcn/ui mobile hook (kept as TS)
│       ├── lib/
│       │   ├── translations.js             # Static PT/EN fallback (80 keys)
│       │   ├── queryClient.js              # TanStack Query client
│       │   └── utils.js                    # cn() utility
│       └── pages/
│           ├── Home.jsx                    # Hero + PCB search + carousel + featured Q&A
│           ├── Episodes.jsx                # Full episode grid + category filters
│           ├── PodcastDetail.jsx           # Video player + key moments sidebar
│           ├── About.jsx                   # About page
│           ├── Subscribe.jsx               # Email subscription form
│           ├── Contact.jsx                 # Contact form
│           ├── ComingSoon.jsx              # Placeholder for future pages
│           └── NotFound.jsx
├── server/                          # Express backend (TypeScript)
│   ├── index.ts                     # Entry point + CORS middleware
│   ├── routes.ts                    # All 17 endpoints + AI helpers + seed
│   ├── storage.ts                   # Database access layer (Drizzle)
│   ├── db.ts                        # Drizzle + pg connection
│   ├── knowledge/
│   │   └── company.ts               # Company knowledge base (injected in chat prompt)
│   ├── static.ts                    # Serves dist/public in production
│   └── vite.ts                      # Vite dev middleware
├── shared/                          # Shared types — TypeScript
│   ├── schema.ts                    # Drizzle schema — 6 tables + EPISODE_CATEGORIES
│   └── routes.ts                    # Typed API routes + Zod schemas
├── hpc/                             # MareNostrum5 batch embedding pipeline
│   ├── export_chunks.ts             # Local: export all chunks to JSON
│   ├── embed_episodes.py            # HPC: generate embeddings with BAAI/bge-large-en-v1.5
│   ├── embed_episodes.slurm         # SLURM job script
│   ├── import_embeddings.ts         # Local: import embeddings back to Neon
│   ├── requirements.txt             # Python deps for HPC
│   └── README.md                    # HPC pipeline quick reference
├── script/
│   └── build.ts                     # esbuild + Vite production build
├── .env.example                     # Environment variable reference
├── netlify.toml                     # Netlify build config + SPA redirect
├── vite.config.ts                   # Vite: root, alias, dev proxy → :5000
├── drizzle.config.ts                # Drizzle Kit config
├── tailwind.config.ts
├── RAG_CHATBOT.md                   # Deep technical guide for the RAG chatbot
└── USAGE.md                         # Admin usage guide
```

</details>

---

## 🛠️ Tech Stack

<details><summary>Full stack table</summary>

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend | React | 18 | UI framework |
| Language | JavaScript/JSX | ES2022 | Client-side (no TypeScript) |
| Routing | Wouter | ^3.3 | Lightweight SPA router |
| Data Fetching | TanStack Query | ^5.60 | Server state + caching |
| UI Components | Shadcn/ui | Latest | Accessible component library |
| Styling | Tailwind CSS | ^3.4 | Utility-first CSS |
| Animation | Framer Motion | ^11 | Page and component animations |
| Backend | Express | 5 | API server |
| Backend Language | TypeScript | 5.6 | Server-side type safety |
| ORM | Drizzle ORM | ^0.39 | Type-safe database queries |
| Database | PostgreSQL (Neon) | — | Relational data + vector store |
| Vector Extension | pgvector | — | Cosine similarity search |
| AI — Chat/PCB | Anthropic Claude | Sonnet 4.6 | PCB search, RAG chat, extraction |
| AI — Extraction | Google Gemini | 2.0 Flash | Alternative extraction provider |
| Embeddings | Voyage AI | voyage-3 (1024 dims) | RAG query + episode embeddings |
| Embeddings (HPC) | BAAI/bge-large-en-v1.5 | — | Bulk embedding on MareNostrum5 |
| Transcript API | Supadata | REST v1 | YouTube transcript extraction |
| Email | Resend | — | Contact form delivery |
| Build — Client | Vite | ^7.3 | Frontend bundler |
| Build — Server | esbuild | ^0.25 | Server bundler (CJS output) |
| Hosting — Frontend | Netlify | — | Static site hosting |
| Hosting — Backend | Render | — | Node.js web service |
| Database Host | Neon | — | Serverless PostgreSQL |

</details>

---

## 📚 Documentation

- [USAGE.md](./USAGE.md) — Admin usage guide: adding episodes, managing content, chatbot, language switch
- [RAG_CHATBOT.md](./RAG_CHATBOT.md) — RAG chatbot deep technical guide: architecture, embedding pipelines, HPC, troubleshooting

---

## 👨‍💻 Author + Acknowledgments

**Bruno Sousa** — MAKEIT.TECH

Thanks to: **Anthropic** (Claude Sonnet 4.6), **Voyage AI** (voyage-3 embeddings), **Supadata** (YouTube transcripts), **Neon** (serverless PostgreSQL + pgvector), **Shadcn/ui**, **Drizzle ORM**, **Render**, **Netlify**, **BSC MareNostrum5** (HPC batch embeddings).

---

**Version**: 1.1.0 | **Status**: Ongoing | **Last Updated**: 2026-02-26
