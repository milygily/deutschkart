import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS german_idioms (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    category_fa TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'B1',
    icon TEXT NOT NULL DEFAULT '✨',
    expression_de TEXT NOT NULL,
    literal_fa TEXT NOT NULL,
    persian_equivalent TEXT NOT NULL,
    meaning_fa TEXT NOT NULL,
    when_to_use_fa TEXT NOT NULL,
    example_de TEXT NOT NULL,
    example_fa TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`;

console.log('✅ german_idioms table ready in Neon!');
