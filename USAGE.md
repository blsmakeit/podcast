# MAKEIT.TECH — Media Navigator · Admin Usage Guide

Everything you need to manage the platform: episodes, content, chatbot, language, and subscribers.

---

## 🔐 Admin Mode

Admin mode unlocks content management controls across all pages.

1. Open the platform in your browser
2. Scroll to the footer → click **🔒 Admin** (centre of the footer bar)
3. Enter the password: `MIcompany2020`
4. A red **BACKOFFICE MODE ACTIVE** banner appears at the top of every page

To exit, click **🔓 Exit Admin** in the footer (same position).

> Session is stored in `sessionStorage` — closing the tab clears it automatically.

---

## 🌐 PT/EN Language Switch

The platform serves both English and Portuguese audiences. The language can be switched by any visitor — not just admins.

- **Desktop**: the **EN / PT** pill appears in the top navigation bar, to the right of the Subscribe button
- **Mobile**: the **EN / PT** pill appears in the header, left of the hamburger menu

Clicking either button switches the entire interface immediately. The choice is saved in `localStorage` and persists across visits.

> All UI text comes from the `translations` table in Neon. To add or update translated strings, re-run the seed endpoint (see [RAG_CHATBOT.md](./RAG_CHATBOT.md#updating-translations)).

---

## ➕ Adding Episodes

Four methods are available. Method 1 (YouTube Auto-Extract) is recommended for all standard MAKEIT OR BREAKIT episodes.

### Method 1 — YouTube Auto-Extract (recommended)

1. Enter admin mode
2. Click **+ Add Episode** (top of the Home or Episodes page)
3. Enter the **Title** and paste the **YouTube URL** (watch, short, or embed format)
4. Choose **Transcript Source**:

   | Option | When to use |
   |--------|-------------|
   | **Auto (YouTube)** | Default — fetches transcript automatically via Supadata. Requires captions on the video |
   | **Import file** | Use when YouTube captions are unavailable — paste transcript exported from Premiere or any tool |

5. Choose **Analysis Mode**:

   | Option | When to use |
   |--------|-------------|
   | **Full analysis** | Default — sends the complete transcript to Claude. Best for videos under 45 min |
   | **Summarised** | For videos over 45 min — samples evenly across the full video to stay within token limits |

6. Click **Extract** — the server fetches the transcript and Claude Sonnet 4.6 generates the description, category, thumbnail, and key moments
7. Review and edit any field
8. Click **Add Episode** — appears immediately in the grid

**YouTube video requirements:**

| Requirement | Detail |
|-------------|--------|
| Ownership | Must be published on your own YouTube channel |
| Visibility | Public or Unlisted — Private videos will not work |
| Captions | Required only when using Auto (YouTube) source |
| Chapters | Add chapters to the video description for better key moment coverage |

---

### Method 2 — Import Transcript from Premiere (or any tool)

Use this when the YouTube video has no captions, or when you have a higher-quality transcript from your editing software.

1. In **Adobe Premiere** → open the **Text** panel → **Transcript** tab → menu (⋯) → **Export transcript** → save as `.txt`
2. Open **Add Episode** → paste YouTube URL and enter the Title
3. Under **Transcript Source**, select **Import file**
4. Paste the transcript text into the textarea

   Supported formats:
   | Format | Example |
   |--------|---------|
   | `[MM:SS]` timestamps | `[01:30] We discuss hardware prototyping...` |
   | `[HH:MM:SS]` timestamps | `[00:01:30] We discuss hardware prototyping...` |
   | Plain text (no timestamps) | Lines are assigned 5-second intervals automatically |

5. Choose Analysis Mode and click **Extract**
6. Review and publish

> For recordings over 45 min, always use **Summarised** mode.

---

### Method 3 — Manual Entry

1. Enter admin mode → **+ Add Episode**
2. Fill in all fields manually:
   - **Title** — episode title
   - **Description** — short summary (used by PCB as context)
   - **Video URL** — YouTube embed URL or direct `.mp4` link
   - **Thumbnail URL** — card image (16:9 recommended)
   - **Category** — Technology / Hardware & PCB / Design / Business / AI & Software / Innovation / Other
   - **Key Moments** — rows of `Time / Topic / Text` (critical for PCB accuracy and chatbot citations)
3. Click **Add Episode**

---

### Method 4 — Neon SQL Editor

For bulk imports or migrations. Open the Neon dashboard → SQL Editor:

```sql
INSERT INTO podcasts (title, description, video_url, thumbnail_url, category, transcripts)
VALUES (
  'Episode Title',
  'Short episode description.',
  'https://www.youtube.com/embed/VIDEO_ID',
  'https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg',
  'Technology',
  '[
    {"time":"00:00","topic":"Introduction","text":"Welcome and overview."},
    {"time":"05:30","topic":"Main Topic","text":"Deep dive into the subject."},
    {"time":"18:45","topic":"Key Insight","text":"The main takeaway."}
  ]'
);
```

> After inserting via SQL, embeddings are **not** generated automatically. You must either re-run the HPC pipeline or wait — new Voyage AI embeddings are only generated via `POST /api/podcasts` and `PUT /api/podcasts/:id`. See [RAG_CHATBOT.md](./RAG_CHATBOT.md) for manual embedding options.

---

## ✏️ Editing Episodes

1. Enter admin mode
2. Navigate to an episode card or episode detail page
3. Click **Edit** — the same Add Episode modal opens pre-filled with the existing data
4. Make your changes and click **Save**

On save, the server regenerates embeddings for this episode (fire-and-forget via Voyage AI) and refreshes the questions carousel and featured Q&A cards in the background.

---

## 🗑️ Deleting Episodes

1. Enter admin mode
2. A **Delete** button appears on each episode card in the grid
3. Click **Delete** → confirm the prompt
4. The episode is removed immediately from the grid and from `episode_chunks` (cascade delete)

The questions carousel and featured Q&A cards are regenerated in the background after deletion.

---

## 👁️ Section Visibility Toggles

In admin mode, a **Section visibility** control bar appears on the Home page above the questions carousel. Use it to show or hide sections for all visitors:

| Toggle | Default | What it controls |
|--------|---------|-----------------|
| **Questions Carousel** | On | The rotating dark card with 8 AI-generated search questions |
| **Featured Q&A Cards** | Off | The 3-card grid below the carousel with question + answer + play button |

Click the toggle to switch — the change takes effect immediately for all visitors. The state is stored in the `site_settings` table.

> Both sections are always visible to admins regardless of the toggle state (the "Only visible to admins" label appears when a section is off).

---

## 📍 Key Moments Sidebar

On each episode detail page (`/podcasts/:id`), the sidebar lists all key moments generated during extraction. Scroll the sidebar (mouse or trackpad) to see all moments. Click any moment to jump the video player directly to that timestamp.

Key moments are the backbone of both PCB accuracy and chatbot citations — the more specific and descriptive the text, the better both features perform.

---

## 🔍 PCB — AI Search

Visitors use the **PCB** search bar on the Home page to find specific topics across all episodes. PCB sends the query and all episode transcripts to Claude Sonnet 4.6, which returns the most relevant episode and the exact timestamp.

**Word limit: 20 words.** A live counter appears below the search bar as the user types. The search button is disabled when the limit is exceeded.

**Tips for best results:**
- Add at least 8–15 key moments per episode during extraction
- Write the `text` field of each key moment in plain, searchable language — describe what is *discussed*, not just the topic name
- Cover the full timeline (beginning, middle, end)

---

## 💬 RAG Chatbot Widget

The floating chat button (bottom-right corner, red circle) opens a conversational assistant that knows the show, the company, and the episode catalogue.

### Opening and using it

- Click the **💬** button to open the panel
- Type a question (up to **100 words**) — a live counter appears below the input; the input border turns red and sending is blocked when over the limit
- The assistant responds in the same language as your message (EN or PT automatically)
- **Clear** button in the chat header resets the conversation
- **Action buttons** (pill links) below assistant messages navigate to `/contact`, `/subscribe`, or specific episodes
- **Source citations** below assistant messages show the episode name and timestamp the answer came from

### Dragging the widget

Click and drag the **💬** button to reposition it anywhere on the screen. The position is saved to `localStorage` and persists across page loads.

### What the chatbot knows

- Everything in `server/knowledge/company.ts` — show description, host (Francisco Mendes), MAKEIT company background, topics covered, contact info, how to apply as a guest, platform features
- All episode content retrieved via semantic search — titles, descriptions, key moments with timestamps
- It answers in whichever language the user writes in

### What the chatbot does NOT know

- Episode content for episodes added via the Neon SQL editor without triggering the Voyage AI pipeline (no embeddings = no retrieval)
- Real-time information (news, recent events outside the episode catalogue)
- Private or internal company information not in `company.ts`

> For a full technical description of how the chatbot works, see [RAG_CHATBOT.md](./RAG_CHATBOT.md).

---

## 🎠 Questions Carousel

The dark rotating card on the Home page displays 8 AI-generated search prompts based on episode topics. Questions cycle every 6 seconds (pauses on hover). Visitors can click any question to instantly run it as a PCB search.

Questions are regenerated automatically whenever an episode is added, edited, or deleted. They are cached for 24 hours in the `generated_content` table — so if you add multiple episodes in quick succession, the carousel updates only once.

To force a refresh without touching episodes:
```
GET /api/questions?refresh=true
```

---

## ⭐ Featured Q&A Cards

Three AI-generated question/answer cards, each with a **Play Segment** button linking to a specific episode timestamp. Visible only when enabled via the admin visibility toggle (off by default).

Cards are regenerated at the same time as the questions carousel (on episode create/edit/delete, 24h cache).

To force a refresh:
```
GET /api/featured-questions?refresh=true
```

---

## 🧠 Updating Company Knowledge

The chatbot's knowledge about MAKEIT, the show, and the host comes from `server/knowledge/company.ts`. This is a plain TypeScript file that exports a single string.

**When to update it:**
- The host changes
- New contact details or social links
- New topics the show covers
- New platform features worth mentioning
- The company's focus or description changes

**How to update:**

1. Edit `server/knowledge/company.ts` directly
2. Deploy the change to Render (push to `main`)
3. Re-run the HPC batch pipeline to generate fresh embeddings for the company chunks — company knowledge is split into paragraphs and stored as `chunk_type = 'company'` rows in `episode_chunks`

> Without step 3, the chatbot will use the updated text in its system prompt (immediately), but the old company chunks will still be retrieved from the vector store. Running the HPC pipeline replaces them. See [RAG_CHATBOT.md](./RAG_CHATBOT.md#pipeline-2-hpc-batch-embedding) for the full pipeline steps.

---

## 📬 Contact Form

The `/contact` page sends a message via Resend to `contact@make-it.tech`. The email includes the sender's name, email, subject, and message. The `replyTo` header is set to the sender's email so you can reply directly.

Required fields: name, email, message. Subject is optional.

**Requirement:** `RESEND_API_KEY` must be set in the server environment (Render dashboard in production).

---

## 📧 Newsletter Subscriptions

The `/subscribe` page collects email addresses into the `subscribers` table. Duplicate emails are silently ignored (`onConflictDoNothing`).

To view all subscribers, call the admin endpoint:
```
GET /api/subscribers
```

This returns:
```json
{
  "subscribers": [
    { "id": 1, "email": "user@example.com", "subscribed_at": "2026-02-26T...", "source": "website" }
  ],
  "total": 1
}
```

No authentication is required by the server for this endpoint — keep it internal or add middleware if you expose it publicly.

---

## 🔑 Quick Reference

| Item | Value |
|------|-------|
| Admin password | `MIcompany2020` |
| Admin toggle | Footer centre — 🔒 / 🔓 |
| PCB word limit | 20 words |
| Chat word limit | 100 words |
| Questions cache | 24 hours |
| Featured Q&A cache | 24 hours |
| Language default | English (EN) |
| Contact email | contact@make-it.tech |

---

**Version**: 1.1.0 | **Last Updated**: 2026-02-26
