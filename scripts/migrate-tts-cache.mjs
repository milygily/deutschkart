import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS tts_audio_cache (
    text_hash TEXT PRIMARY KEY,
    text_content TEXT NOT NULL,
    blob_url TEXT NOT NULL,
    byte_size INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`;

console.log('✅ tts_audio_cache table ready in Neon!');
