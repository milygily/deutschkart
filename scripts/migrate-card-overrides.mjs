import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

await sql`ALTER TABLE deck_cards ADD COLUMN IF NOT EXISTS custom_word TEXT`;
await sql`ALTER TABLE deck_cards ADD COLUMN IF NOT EXISTS custom_article TEXT`;
await sql`ALTER TABLE deck_cards ADD COLUMN IF NOT EXISTS custom_plural TEXT`;
await sql`ALTER TABLE deck_cards ADD COLUMN IF NOT EXISTS custom_verb_forms TEXT`;
await sql`ALTER TABLE deck_cards ADD COLUMN IF NOT EXISTS custom_persian_meaning TEXT`;
await sql`ALTER TABLE deck_cards ADD COLUMN IF NOT EXISTS custom_english_meaning TEXT`;
await sql`ALTER TABLE deck_cards ADD COLUMN IF NOT EXISTS custom_example_de TEXT`;
await sql`ALTER TABLE deck_cards ADD COLUMN IF NOT EXISTS custom_example_fa TEXT`;

console.log('✅ deck_cards override columns ready!');
