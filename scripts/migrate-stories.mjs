import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS deck_stories (
    id SERIAL PRIMARY KEY,
    deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title_de TEXT NOT NULL,
    title_fa TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'B1',
    lines JSONB NOT NULL,
    questions JSONB NOT NULL,
    used_words JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`;

await sql`
  CREATE INDEX IF NOT EXISTS deck_stories_deck_idx ON deck_stories (deck_id, created_at DESC)
`;

console.log('✅ deck_stories table ready!');
