import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS user_deck_bookmarks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    last_index INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`;

await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS user_deck_bookmark_idx
  ON user_deck_bookmarks (user_id, deck_id)
`;

console.log('✅ user_deck_bookmarks table ready!');
