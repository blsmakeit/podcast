import { db } from '../server/db';
import { podcasts } from '../shared/schema';
import { companyKnowledge } from '../server/knowledge/company';
import fs from 'fs';

async function exportChunks() {
  const episodes = await db.select().from(podcasts);
  const chunks: any[] = [];

  // Episode chunks
  for (const ep of episodes) {
    // Description chunk
    chunks.push({
      episode_id: ep.id,
      chunk_type: 'description',
      chunk_index: 0,
      content: `Episode: ${ep.title}\n${ep.description}`,
      time_ref: null,
      topic: null,
    });

    // Key moment chunks
    const transcripts = ep.transcripts as any[];
    transcripts.forEach((t, i) => {
      chunks.push({
        episode_id: ep.id,
        chunk_type: 'key_moment',
        chunk_index: i + 1,
        content: `[${t.time}] ${t.topic}: ${t.text}`,
        time_ref: t.time,
        topic: t.topic,
      });
    });
  }

  // Company knowledge chunks (split by paragraph)
  const paragraphs = companyKnowledge.split('\n\n').filter(p => p.trim().length > 0);
  paragraphs.forEach((p, i) => {
    chunks.push({
      episode_id: null,
      chunk_type: 'company',
      chunk_index: i,
      content: p.trim(),
      time_ref: null,
      topic: null,
    });
  });

  fs.writeFileSync('hpc/episodes_export.json', JSON.stringify(chunks, null, 2));
  console.log(`Exported ${chunks.length} chunks to hpc/episodes_export.json`);
  process.exit(0);
}

exportChunks().catch(console.error);
