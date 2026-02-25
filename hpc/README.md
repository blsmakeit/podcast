# HPC Batch Embedding — MareNostrum

Use this workflow to generate embeddings for existing episodes using MareNostrum's compute.
For new episodes added via the backoffice, Voyage AI handles embeddings automatically in real time.

---

## Step 1 — Export chunks from Neon (run locally in WSL)

```bash
npx tsx hpc/export_chunks.ts
```

Creates `hpc/episodes_export.json` with all episode + company knowledge chunks.

---

## Step 2 — Copy files to MareNostrum

```bash
scp hpc/episodes_export.json hpc/embed_episodes.py hpc/embed_episodes.slurm hpc/requirements.txt \
  USER@mn5.bsc.es:~/podcast-embed/
```

---

## Step 3 — Setup Python environment on MareNostrum (run via SSH)

```bash
ssh USER@mn5.bsc.es
cd ~/podcast-embed
module load python/3.10
python -m venv $HOME/venvs/embed
source $HOME/venvs/embed/bin/activate
pip install -r requirements.txt
```

---

## Step 4 — Submit SLURM job

```bash
sbatch embed_episodes.slurm
squeue -u $USER   # check status
```

Logs go to `embed_<jobid>.log`. Output: `hpc/embeddings_output.json`.

---

## Step 5 — Copy results back to WSL

```bash
scp USER@mn5.bsc.es:~/podcast-embed/embeddings_output.json hpc/embeddings_output.json
```

---

## Step 6 — Import embeddings into Neon (run locally in WSL)

```bash
npx tsx hpc/import_embeddings.ts
```

Clears existing `episode_chunks` rows and inserts the new embeddings in batches of 100.

---

## Step 7 — Create vector index in Neon SQL editor

Run this once after the first import (improves similarity search performance):

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX ON episode_chunks USING hnsw (embedding vector_cosine_ops);
```

---

## Notes

- Model: `BAAI/bge-large-en-v1.5` — 1024 dimensions, normalised embeddings
- Matches the Voyage AI `voyage-large-2` model used for real-time embeddings (also 1024 dims)
- Re-run this workflow whenever a large batch of episodes is added at once
- Individual episode additions (via backoffice) are handled automatically by Voyage AI
