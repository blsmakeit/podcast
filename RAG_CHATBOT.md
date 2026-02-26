# RAG Chatbot — Technical Guide

Deep reference for the MAKEIT OR BREAKIT chatbot: architecture, embedding pipelines, HPC, vector search, and troubleshooting.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  User types message in ChatWidget (client)                      │
│  → 100-word limit enforced client-side                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ POST /api/chat
                           │ { messages: last 10 }
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Server: extract last user message                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Voyage AI API (voyage-3)                                       │
│  POST https://api.voyageai.com/v1/embeddings                    │
│  → 1024-dim float vector for the query                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  pgvector cosine similarity search                              │
│  episode_chunks WHERE similarity > 0.35                         │
│  ORDER BY distance ASC LIMIT 12                                 │
│  → top-12 chunks (episode content + company info)               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Build system prompt:                                           │
│    - companyKnowledge (static string)                           │
│    - retrieved chunks (formatted by type)                       │
│    - behaviour rules + JSON response schema                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Claude Sonnet 4.6                                              │
│  model: claude-sonnet-4-6                                       │
│  max_tokens: 1024                                               │
│  messages: full conversation history (last 10)                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Parse JSON response                                            │
│  { message, actions?, sources? }                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  ChatWidget renders:                                            │
│    - message bubble                                             │
│    - action pill buttons (links to routes)                      │
│    - source citations (episodeTitle @ timeRef — topic)          │
└─────────────────────────────────────────────────────────────────┘
```

---

## episode_chunks Table

```sql
CREATE TABLE episode_chunks (
  id          SERIAL PRIMARY KEY,
  episode_id  INTEGER REFERENCES podcasts(id) ON DELETE CASCADE,
  chunk_type  TEXT NOT NULL,      -- 'description' | 'key_moment' | 'company'
  chunk_index INTEGER NOT NULL,   -- 0-based position within episode
  content     TEXT NOT NULL,      -- raw text that was embedded
  time_ref    TEXT,               -- MM:SS timestamp (key_moment only)
  topic       TEXT,               -- topic label (key_moment only)
  embedding   VECTOR(1024),       -- pgvector column
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- IVFFlat index for approximate nearest-neighbour search
-- Run once in Neon SQL editor after creating the table
CREATE INDEX ON episode_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);
```

### Chunk types

| chunk_type | episode_id | content format | time_ref | topic |
|------------|------------|----------------|----------|-------|
| `description` | episode FK | `"Episode: {title}\n{description}"` | null | null |
| `key_moment` | episode FK | `"[MM:SS] {topic}: {text}"` | `"MM:SS"` | topic string |
| `company` | null | Paragraph from `companyKnowledge` | null | null |

Each episode with N key moments produces N+1 rows (1 description + N key_moments). Company knowledge is split by paragraph and stored as rows with `episode_id = NULL`.

---

## Embedding Models

Two models are used, both producing **1024-dimensional** embeddings. The dimension must match the `vector(1024)` column — mixing dimensions will cause a pgvector error.

| Model | Used by | Dimensions | Normalization | Notes |
|-------|---------|-----------|---------------|-------|
| `voyage-3` (Voyage AI) | Automatic pipeline + query-time | 1024 | Cosine (built-in) | Used for new episodes and real-time chat queries |
| `BAAI/bge-large-en-v1.5` (sentence-transformers) | HPC batch pipeline | 1024 | L2-normalized → cosine = dot product | Used on MareNostrum5 for bulk embedding |

Both models produce L2-normalized vectors, so cosine similarity equals dot product. The pgvector `<=>` operator computes cosine distance (lower = more similar).

**Why 1024 dims?** All three candidate models for this project — `BAAI/bge-large-en-v1.5`, `multilingual-e5-large`, and `voyage-3` — output 1024 dimensions. This makes the column definition consistent regardless of which model generated the embedding. Do not change the column dimension without wiping and re-embedding all rows.

---

## Pipeline 1 — Voyage AI Automatic (New Episodes)

Triggered automatically on every episode create or update. No manual action required.

### Trigger points

```typescript
// In POST /api/podcasts (create)
generateAndStoreEmbeddings(created.id).catch(e => console.error("Embedding failed:", e));

// In PUT /api/podcasts/:id (update)
generateAndStoreEmbeddings(id).catch(e => console.error("Embedding failed:", e));
```

Both calls are fire-and-forget — the API response is returned immediately and embeddings are generated asynchronously.

### What it does

1. Fetches the episode from DB
2. Builds 1 + N chunks:
   - One `description` chunk: `"Episode: {title}\n{description}"`
   - One `key_moment` chunk per transcript entry: `"[MM:SS] {topic}: {text}"`
3. Sends all texts in a single Voyage AI batch request (`model: "voyage-3"`)
4. Deletes all existing `episode_chunks` rows for this `episodeId` (handles update correctly)
5. Inserts all new rows with embeddings

### What it does NOT cover

- **Company chunks** (`chunk_type = 'company'`) — these are generated only by the HPC batch pipeline (`hpc/export_chunks.ts`). If company knowledge changes, you must re-run the HPC pipeline to update company chunk embeddings.
- **Episodes inserted directly via Neon SQL** — no server endpoint is called, so no embeddings are generated. These episodes are findable via PCB search (which uses a different approach) but will not appear in chatbot retrieval until their embeddings are created.

---

## Pipeline 2 — HPC Batch Embedding (MareNostrum5)

Use this for:
- Initial bulk embedding of all existing episodes when setting up the RAG system
- After editing `server/knowledge/company.ts` (to refresh company chunks)
- Periodic full re-embed after 20+ new episodes accumulate (optional — Voyage AI handles new episodes automatically, but a full re-embed ensures consistent embedding quality)

### Access details

| Item | Value |
|------|-------|
| Cluster | MareNostrum5 (BSC — Barcelona Supercomputing Centre) |
| SSH host | `mn5.bsc.es` |
| Account | `eporaif03` |
| Partition | `gpp` |
| QoS | `gp_debug` |
| Max time (debug) | 2 hours |

```bash
ssh username@mn5.bsc.es
```

### MareNostrum5 directory structure

```
$HOME/
└── podcast-embed/
    ├── hpc/
    │   ├── episodes_export.json     # uploaded from local (input)
    │   ├── embed_episodes.py        # uploaded from local
    │   ├── embed_episodes.slurm     # uploaded from local
    │   └── embeddings_output.json   # generated by the job (output)
    └── venvs/
        └── embed/                   # Python venv with sentence-transformers
```

### Full step-by-step

#### Step 1 — Export chunks locally

```bash
# From the project root on your local machine
npx tsx hpc/export_chunks.ts
```

This queries Neon, builds all chunks (episodes + company knowledge), and writes `hpc/episodes_export.json`.

You should see output like:
```
Exported 847 chunks to hpc/episodes_export.json
```

#### Step 2 — Transfer to MareNostrum5

```bash
scp hpc/episodes_export.json username@mn5.bsc.es:~/podcast-embed/hpc/
scp hpc/embed_episodes.py username@mn5.bsc.es:~/podcast-embed/hpc/
scp hpc/embed_episodes.slurm username@mn5.bsc.es:~/podcast-embed/hpc/
```

#### Step 3 — Set up Python environment (first time only)

```bash
ssh username@mn5.bsc.es

# Create venv
module load python/3.10
python -m venv $HOME/venvs/embed
source $HOME/venvs/embed/bin/activate

# Install dependencies
pip install sentence-transformers>=2.7 torch>=2.2 numpy>=1.26

# The model (~1.3GB) is downloaded automatically on first run
```

#### Step 4 — Submit the SLURM job

```bash
ssh username@mn5.bsc.es
cd ~/podcast-embed

sbatch --account=eporaif03 --partition=gpp --qos=gp_debug hpc/embed_episodes.slurm
```

Note the job ID returned (e.g. `Submitted batch job 1234567`).

#### Step 5 — Monitor the job

```bash
# Check queue status
squeue -u $USER

# Watch the log file (replace JOBID)
tail -f embed_JOBID.log
```

Expected output in the log:
```
Batches: 100%|██████████| 27/27 [02:14<00:00,  4.97s/it]
Done: 847 embeddings written to hpc/embeddings_output.json
```

#### Step 6 — Transfer output back

```bash
scp username@mn5.bsc.es:~/podcast-embed/hpc/embeddings_output.json hpc/
```

#### Step 7 — Import to Neon

```bash
# From the project root on your local machine
npx tsx hpc/import_embeddings.ts
```

This clears the entire `episode_chunks` table and re-inserts all rows in batches of 100. Output:
```
Importing 847 chunks...
Inserted batch 1/9
Inserted batch 2/9
...
Import complete.
```

> **Warning:** `import_embeddings.ts` does a full table clear (`DELETE FROM episode_chunks`) before inserting. Any rows not in the export file (e.g. rows added by the Voyage AI pipeline after the export) will be lost. Run the import before new episodes are added, or export again after all episodes are in place.

### SLURM job parameters

```bash
#!/bin/bash
#SBATCH --job-name=podcast-embed
#SBATCH --output=embed_%j.log
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --time=01:00:00
#SBATCH --partition=debug       # override at sbatch time with --partition=gpp --qos=gp_debug
```

The script loads `python/3.10`, activates the venv, and runs:
```bash
python hpc/embed_episodes.py \
  --input hpc/episodes_export.json \
  --output hpc/embeddings_output.json \
  --model BAAI/bge-large-en-v1.5
```

### Python embedding script

`hpc/embed_episodes.py` uses `sentence_transformers.SentenceTransformer`:
- `batch_size=32` — 32 texts embedded per forward pass
- `normalize_embeddings=True` — L2-normalizes output so cosine similarity = dot product
- Progress bar via `show_progress_bar=True`

---

## When to Use HPC vs Voyage AI

| Situation | Pipeline |
|-----------|---------|
| New episode added via backoffice | Voyage AI (automatic, no action needed) |
| Episode edited via backoffice | Voyage AI (automatic, no action needed) |
| Episode added via Neon SQL | HPC or manual (no automatic trigger) |
| Company knowledge file updated | HPC (to refresh company chunks) |
| 20+ episodes accumulated, want consistent quality | HPC (optional full re-embed) |
| Initial setup, no embeddings yet | HPC |

---

## Updating Company Knowledge

### File location

```
server/knowledge/company.ts
```

Exports a single string `companyKnowledge`. This file is imported directly in `server/routes.ts` and injected into every chat system prompt.

### What the file contains

- Show description and mission
- Host bio (Francisco Mendes, founder of MAKEIT Product R&D)
- Company description (MAKEIT — hardware design, PCB, software, UX/UI)
- Topics covered on the show
- Contact details (email, website, /contact, /subscribe)
- Guest application process
- Platform feature descriptions (PCB, key moments, episode grid)

### When to update

- Host or co-host changes
- New contact details
- Show format changes
- New platform features
- Company pivot or updated mission

### How to update

1. Edit `server/knowledge/company.ts`
2. Deploy to Render (push to `main` → auto-deploy)
3. Re-run the HPC batch pipeline (Steps 1–7 above) to regenerate company chunks in `episode_chunks`

After step 2 but before step 3, the system prompt will already use the new text (immediate effect for new conversations), but the vector store will still contain old company chunk embeddings. Complete all three steps for full consistency.

### Inserting company chunks manually (without HPC)

If HPC is unavailable, you can embed the company paragraphs directly using Voyage AI via curl and insert them into Neon manually.

**Step 1** — Get embeddings:
```bash
curl https://api.voyageai.com/v1/embeddings \
  -H "Authorization: Bearer $VOYAGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "voyage-3",
    "input": ["Paragraph 1 text here", "Paragraph 2 text here"]
  }'
```

**Step 2** — Insert into Neon SQL editor (repeat per paragraph, replacing the embedding array):
```sql
-- First clear old company chunks
DELETE FROM episode_chunks WHERE chunk_type = 'company';

-- Then insert each paragraph
INSERT INTO episode_chunks (episode_id, chunk_type, chunk_index, content, embedding)
VALUES (
  NULL,
  'company',
  0,
  'Paragraph text here',
  '[0.0123, -0.0456, ...]'   -- 1024 floats from Voyage AI response
);
```

---

## What Happens When You Add a New Episode

1. Admin clicks **Add Episode** in the backoffice
2. Server creates the episode row in `podcasts`
3. Response is returned immediately (201 Created)
4. **In the background (fire-and-forget):**
   - `generateAndStoreEmbeddings(episodeId)` calls Voyage AI with description + all key moments in one batch
   - Deletes any existing chunks for this episode
   - Inserts new `episode_chunks` rows
   - `regenerateQuestions()` calls Claude to generate 8 new search suggestions
   - `regenerateFeaturedQuestions()` calls Claude to generate 3 new Q&A cards
5. Within ~5–15 seconds, the new episode is fully indexed and the chatbot can answer questions about it

---

## When to Consider a Full HPC Re-Embed

The Voyage AI pipeline handles new and updated episodes automatically. A full HPC re-embed is useful but not required in these cases:

- After 20+ new episodes — a fresh IVFFlat index with more data can improve search quality
- After changing the embedding model (currently `voyage-3` for Voyage AI, `BAAI/bge-large-en-v1.5` for HPC — if you switch models, all existing embeddings must be regenerated)
- After bulk-editing many episode descriptions or transcripts via SQL
- After updating `companyKnowledge` (required, not optional)

---

## Chat System Prompt Structure

The system prompt sent to Claude Sonnet 4.6 has four sections:

```
You are the MAKEIT OR BREAKIT chatbot — a helpful assistant for the MAKEIT OR BREAKIT podcast platform.

COMPANY & SHOW KNOWLEDGE:
{companyKnowledge}

RELEVANT EPISODE CONTENT (retrieved via semantic search):
{retrieved chunks, formatted as:}
  [Company info] {content}                                          ← for chunk_type='company'
  [Episode: "{episode_title}" @ {time_ref}] {content}              ← for chunk_type='key_moment' or 'description'

BEHAVIOUR RULES:
- Answer questions about episodes using the retrieved content — cite episode title and timestamp
- Answer questions about the company using the company knowledge
- For contact/guest questions, include an action button to /contact
- For subscription questions, include an action button to /subscribe
- If a question references a specific episode, include an action button to that episode
- If no chunks are retrieved but the topic is related to tech/entrepreneurship/hardware, answer from company knowledge and suggest PCB search
- Keep answers concise — 2-4 sentences unless detail is needed
- ALWAYS respond in the same language the user writes in (Portuguese or English)

RESPONSE FORMAT — return ONLY valid JSON:
{
  "message": "your response text here",
  "actions": [{ "label": "Go to Contact", "href": "/contact" }],
  "sources": [{ "episodeTitle": "Episode name", "timeRef": "02:37", "topic": "Topic name" }]
}
actions and sources are optional — only include when relevant. Never include empty arrays.
```

---

## Response JSON Format

### Request

```typescript
POST /api/chat
{
  "messages": [
    { "role": "user", "content": "How do you validate a startup idea fast?" },
    { "role": "assistant", "content": "Great question! At 05:30 in..." },
    { "role": "user", "content": "What about hardware startups specifically?" }
  ]
}
```

The client sends the last 10 messages (filtered to `user`/`assistant` roles only, stripped of `actions` and `sources` metadata).

### Response

```json
{
  "message": "For hardware startups, Francisco Mendes discusses rapid prototyping at 12:45 in the Industrial Design episode — he recommends building a 'looks-like' model first before committing to PCB design.",
  "actions": [
    { "label": "Watch episode", "href": "/podcasts/2" }
  ],
  "sources": [
    {
      "episodeTitle": "Industrial Design Fundamentals",
      "timeRef": "12:45",
      "topic": "Rapid Prototyping"
    }
  ]
}
```

`actions` and `sources` are omitted when not relevant. The client handles missing fields gracefully — no empty arrays are rendered.

---

## Word Limits

| Location | Limit | Enforcement |
|----------|-------|-------------|
| PCB search (Home page) | 20 words | Client-side — button disabled, counter shown |
| Chat input (ChatWidget) | 100 words | Client-side — send blocked, input border turns red |

`wordCount()` splits on `/\s+/` and filters empty strings. Both limits are enforced client-side only — no server-side validation.

---

## Vector Search SQL

```sql
SELECT
  ec.id,
  ec.episode_id,
  ec.chunk_type,
  ec.content,
  ec.time_ref,
  ec.topic,
  p.title AS episode_title,
  1 - (ec.embedding <=> $1::vector) AS similarity
FROM episode_chunks ec
LEFT JOIN podcasts p ON p.id = ec.episode_id
WHERE 1 - (ec.embedding <=> $1::vector) > 0.35
ORDER BY ec.embedding <=> $1::vector
LIMIT 12
```

### Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Similarity threshold | `0.35` | Low — broad recall. Better to include borderline chunks than miss relevant ones |
| Top-k | `12` | Enough context for multi-turn conversations without excessive token use |
| Operator | `<=>` | pgvector cosine distance (lower = more similar) |
| `LEFT JOIN podcasts` | | Company chunks have `episode_id = NULL` — LEFT JOIN preserves them with `episode_title = NULL` |

The query embedding is generated by `getEmbedding(lastUserMessage)` which calls Voyage AI `voyage-3` on the last user message extracted from the conversation history.

---

## Troubleshooting

### Chatbot says it doesn't know about a recent episode

**Cause:** Embeddings were not generated for this episode.

**Check:**
```sql
SELECT COUNT(*) FROM episode_chunks WHERE episode_id = YOUR_EPISODE_ID;
```

If 0 rows, the Voyage AI pipeline failed or the episode was inserted via SQL.

**Fix:**
- If the episode exists in `podcasts`, trigger embeddings by doing a no-op edit in the backoffice (e.g. add a space to the description and save)
- Or run `generateAndStoreEmbeddings` manually via a script

---

### Chatbot gives generic answers, not citing specific episodes

**Cause:** Similarity threshold is too high for this query, or no chunks match above 0.35.

**Check the chatbot logs** on Render — the server logs the number of chunks retrieved. A message like `No specific episode content found for this query` appears in the response context when retrieval returns 0 results.

**Possible fixes:**
- Improve key moment text during episode extraction (more descriptive, plain-language sentences)
- Temporarily lower the threshold in `searchChunks()` from `0.35` to `0.25` for testing
- Re-run the HPC pipeline for better embedding quality on older episodes

---

### Dimension mismatch error from pgvector

**Symptom:** Server error `ERROR: expected 1024 dimensions, not N`

**Cause:** An embedding was generated with a different model (different output dimensions) and you are trying to insert it into the `vector(1024)` column.

**Fix:** Ensure all embeddings are generated with a 1024-dim model. Check that `voyage-3` is specified in `getEmbedding()` and that the HPC script uses `BAAI/bge-large-en-v1.5` (not a smaller or larger model). Do not mix models without wiping the column first.

---

### HPC job fails with out-of-memory error

**Symptom:** SLURM log shows `OOM` or `Killed`

**Fix:** Increase `#SBATCH --mem` (try `32G`) or reduce `batch_size` in `embed_episodes.py` from 32 to 16.

---

### Voyage AI embeddings not appearing after adding an episode

**Symptom:** Episode added successfully but `SELECT COUNT(*) FROM episode_chunks WHERE episode_id = N` returns 0.

**Check Render logs** for:
```
[Embeddings] Stored N chunks for episode N
```

If absent, look for:
```
Embedding failed: Error: ...
```

**Common causes:**
- `VOYAGE_API_KEY` is not set or incorrect in Render environment variables
- Voyage AI API rate limit hit (unlikely for single episodes)
- Episode has no transcripts (0 key moments) — a description chunk is still created, but check that `transcripts` is not an empty array

---

### HPC import wipes embeddings generated by Voyage AI

**Cause:** `import_embeddings.ts` does `DELETE FROM episode_chunks` before inserting, so any rows added by Voyage AI after the export step are lost.

**Prevention:** Run the export (`hpc/export_chunks.ts`) only when the episode catalogue is stable. After import, any new episodes added via the backoffice will regenerate their own embeddings automatically via Voyage AI.

---

## File Reference

| File | Location | Purpose |
|------|----------|---------|
| Chat widget | `client/src/components/chat/ChatWidget.jsx` | Draggable floating button + chat panel + message rendering |
| Chat hook | `client/src/hooks/use-chat.js` | Local message state + `POST /api/chat` mutation |
| Chat endpoint | `server/routes.ts` → `POST /api/chat` | Embedding → vector search → Claude → JSON response |
| Vector search | `server/routes.ts` → `searchChunks()` | pgvector cosine similarity query |
| Voyage AI helper | `server/routes.ts` → `getEmbedding()` | Single-text embedding via `voyage-3` |
| Episode embeddings | `server/routes.ts` → `generateAndStoreEmbeddings()` | Fire-and-forget bulk embed on create/update |
| Company knowledge | `server/knowledge/company.ts` | Static knowledge base string |
| DB schema | `shared/schema.ts` → `episodeChunks` | Drizzle table definition with `vector(1024)` |
| HPC export | `hpc/export_chunks.ts` | Local: query Neon → `episodes_export.json` |
| HPC embed | `hpc/embed_episodes.py` | MareNostrum: BAAI/bge-large-en-v1.5 → `embeddings_output.json` |
| HPC SLURM | `hpc/embed_episodes.slurm` | SLURM job script |
| HPC import | `hpc/import_embeddings.ts` | Local: `embeddings_output.json` → Neon upsert |
| Python deps | `hpc/requirements.txt` | `sentence-transformers>=2.7`, `torch>=2.2`, `numpy>=1.26` |

---

**Version**: 1.1.0 | **Last Updated**: 2026-02-26
