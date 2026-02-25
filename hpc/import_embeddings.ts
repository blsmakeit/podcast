import { db } from '../server/db';
import { episodeChunks } from '../shared/schema';
import fs from 'fs';

async function importEmbeddings() {
  const data = JSON.parse(fs.readFileSync('hpc/embeddings_output.json', 'utf-8'));
  console.log(`Importing ${data.length} chunks...`);

  // Clear existing chunks
  await db.delete(episodeChunks);

  // Insert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    await db.insert(episodeChunks).values(
      batch.map((c: any) => ({
        episodeId:  c.episode_id,
        chunkType:  c.chunk_type,
        chunkIndex: c.chunk_index,
        content:    c.content,
        timeRef:    c.time_ref ?? null,
        topic:      c.topic ?? null,
        embedding:  c.embedding,
      }))
    );
    console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(data.length / batchSize)}`);
  }

  console.log('Import complete.');
  process.exit(0);
}

importEmbeddings().catch(console.error);
