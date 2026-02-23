# MAKEIT.TECH — Media Navigator

A professional podcast and videocast platform built with React, Express, and PostgreSQL.
Featuring **PCB (Podcast Content Browser)** — an AI-powered tool that finds the exact moment you're looking for inside any episode.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Folder Structure](#folder-structure)
3. [Local Development](#local-development)
4. [Adding Episodes (via Backoffice)](#adding-episodes-via-backoffice)
5. [Adding Episodes (directly to the database)](#adding-episodes-directly-to-the-database)
6. [Categories](#categories)
7. [PCB — How the AI Works](#pcb--how-the-ai-works)
8. [Deployment: GitHub + Netlify + Railway](#deployment-github--netlify--railway)
9. [Environment Variables](#environment-variables)
10. [Backoffice Admin](#backoffice-admin)

---

## Project Overview

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, JavaScript/JSX, Wouter, TanStack Query, Tailwind CSS, Shadcn/ui, Framer Motion |
| Backend | Express 5, TypeScript, Drizzle ORM |
| Database | PostgreSQL |
| AI | OpenAI GPT-4o (PCB feature) |
| Build | Vite (client) + esbuild (server) |

---

## Folder Structure

```
Media-Navigator/
├── client/                     # React frontend (JavaScript/JSX)
│   ├── index.html
│   ├── public/
│   └── src/
│       ├── components/
│       │   ├── backoffice/     # Admin-only components
│       │   │   ├── BackofficeContext.jsx
│       │   │   └── AddEpisodeModal.jsx
│       │   ├── ui/             # Shadcn/ui primitives (do not edit)
│       │   ├── EpisodeCard.jsx
│       │   └── Layout.jsx
│       ├── hooks/
│       │   ├── use-episodes.js  # All episode + PCB API hooks
│       │   ├── use-toast.ts
│       │   └── use-mobile.tsx
│       ├── lib/
│       │   ├── queryClient.js
│       │   └── utils.js
│       └── pages/
│           ├── Home.jsx         # Landing page + PCB search
│           ├── Episodes.jsx     # Full episode grid with filters
│           ├── PodcastDetail.jsx# Video player + key moments
│           ├── About.jsx
│           ├── Subscribe.jsx
│           ├── ComingSoon.jsx   # Placeholder for future pages
│           └── NotFound.jsx
├── server/                     # Express backend (TypeScript)
│   ├── index.ts
│   ├── routes.ts               # All API endpoints
│   ├── storage.ts              # Database access layer
│   ├── db.ts                   # Drizzle database connection
│   ├── static.ts
│   └── vite.ts
├── shared/                     # Shared types (TypeScript)
│   ├── schema.ts               # Drizzle schema + EPISODE_CATEGORIES
│   └── routes.ts               # Typed API route definitions
├── script/
│   └── build.ts                # Production build script
├── .env.example                # Environment variable reference
├── netlify.toml                # Netlify build configuration
├── vite.config.ts
├── tailwind.config.ts
├── drizzle.config.ts
└── package.json
```

---

## Local Development

### Prerequisites

- Node.js 20+
- PostgreSQL database (local or cloud — e.g. Neon, Supabase, Railway)
- OpenAI API key (for PCB feature)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables and fill in your values
cp .env.example .env

# 3. Push the database schema
npm run db:push

# 4. Start the full dev server (Express + Vite together)
npm run dev
```

The app runs at `http://localhost:5000` in development.
Vite proxies all `/api/*` requests to Express automatically.

> **Tip:** To run just the frontend (pointing at a remote API), use `npm run dev:client` and set `VITE_API_URL` in your `.env`.

---

## Adding Episodes (via Backoffice)

The easiest way to add episodes is through the built-in **Backoffice**:

1. Open the app in your browser.
2. Scroll to the footer — click the small **🔒 Admin** link.
3. Enter the admin password (see [Backoffice Admin](#backoffice-admin)).
4. A red **BACKOFFICE MODE ACTIVE** banner appears.
5. On the Home or Episodes page, click **+ Add Episode**.
6. Fill in the form:
   - **Title** — episode title
   - **Description** — short summary
   - **Video URL** — direct link to the `.mp4` / stream URL
   - **Thumbnail URL** — image shown on the card (16:9 recommended)
   - **Category** — choose from the dropdown
   - **Key Moments (optional)** — add rows of `Time / Topic / Text` for the sidebar timestamps
7. Click **Add Episode** — the episode appears immediately.

---

## Adding Episodes (directly to the database)

You can also `INSERT` rows directly via SQL or Drizzle:

```sql
INSERT INTO podcasts (title, description, video_url, thumbnail_url, category, transcripts)
VALUES (
  'My Episode Title',
  'A short description of this episode.',
  'https://your-cdn.com/episode1.mp4',
  'https://your-cdn.com/thumb1.jpg',
  'Technology',
  '[{"time":"02:30","topic":"Opening","text":"Introduction to the topic."},
    {"time":"10:15","topic":"Deep Dive","text":"We explore the core concepts."}]'
);
```

The `transcripts` column is JSONB.  Each item must have:
- `time` — `"MM:SS"` or `"HH:MM:SS"` format
- `topic` — short label shown in the sidebar
- `text` — one or two sentences shown as preview text

---

## Categories

Available categories (defined in `shared/schema.ts`):

| Category | Use for |
|----------|---------|
| Technology | General tech topics |
| Hardware & PCB | Electronics, circuit boards |
| Design | UX, product, visual design |
| Business | Entrepreneurship, strategy |
| AI & Software | Machine learning, software engineering |
| Innovation | New ideas, future of tech |
| Other | Anything that doesn't fit |

---

## PCB — How the AI Works

**PCB** stands for *Printed Circuit Board* (the company's hardware roots) and *Podcast Content Browser*.

When a user types a question or keyword into the PCB search bar, the following happens:

1. The query is sent to `POST /api/ai/search` on the backend.
2. The server fetches all episodes (titles, descriptions, transcripts) from the database.
3. OpenAI GPT-4o analyses the content and returns the best matching episode + timestamp.
4. The frontend links the user directly to that episode at the exact moment.

**To make PCB accurate:**
- Add detailed **Key Moments** (transcripts) to each episode — the more, the better.
- Each key moment should describe what is discussed at that timestamp in plain language.
- The AI uses these as its primary source; the description is used as fallback.

**Environment variable required:** `OPENAI_API_KEY` in your `.env`.

---

## Deployment: GitHub + Netlify + Railway

Because the app has a backend (Express + PostgreSQL), you need **two** hosting services:

| Service | Hosts |
|---------|-------|
| **Netlify** | React frontend (static) |
| **Railway** (or Render) | Express server + PostgreSQL |

### Step 1 — Push to GitHub

```bash
git init          # if not already a git repo
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/media-navigator.git
git push -u origin main
```

### Step 2 — Deploy backend on Railway

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub.
2. Select your repository.
3. Add a PostgreSQL plugin inside Railway.
4. Set environment variables in Railway:
   - `DATABASE_URL` (Railway provides this automatically from the plugin)
   - `OPENAI_API_KEY`
   - `NODE_ENV=production`
5. Set the start command: `npm run start`
6. Note the public Railway URL (e.g. `https://media-navigator.up.railway.app`).

> **First deploy:** Railway will run `npm run build` (which builds both client and server via `script/build.ts`). If you only want the server built on Railway, set the build command to `tsx script/build.ts` explicitly.

### Step 3 — Deploy frontend on Netlify

1. Go to [netlify.com](https://netlify.com) → Add new site → Import from GitHub.
2. Select your repository.
3. Netlify reads `netlify.toml` automatically:
   - Build command: `npm run build:client`
   - Publish directory: `dist/public`
4. Add environment variable in Netlify dashboard:
   - `VITE_API_URL` = your Railway URL (e.g. `https://media-navigator.up.railway.app`)
5. Deploy!

### Step 4 — Run DB migration on Railway

After the first Railway deploy, open the Railway shell and run:

```bash
npm run db:push
```

This creates the `podcasts` table in your Railway PostgreSQL database.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `OPENAI_API_KEY` | Yes | OpenAI API key for PCB feature |
| `PORT` | No | Server port (default: 5000) |
| `VITE_API_URL` | Production only | Full URL of the backend API (e.g. `https://api.myapp.up.railway.app`) |

---

## Backoffice Admin

The backoffice is accessed from a small link in the footer (far right).

| Action | Detail |
|--------|--------|
| **Open** | Click **🔒 Admin** in the footer |
| **Password** | `MIcompany2020` |
| **Session** | Stored in `sessionStorage` — clears on tab close |
| **Exit** | Click **🔓 Exit Admin** in the footer (or close the tab) |

In admin mode:
- A red banner appears at the top of every page.
- **+ Add Episode** button appears on the Home and Episodes pages.
- A **Delete** button appears on each episode card.
- Deleting asks for confirmation before removing the episode from the database.
