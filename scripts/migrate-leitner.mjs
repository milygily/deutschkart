import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

await sql`
  ALTER TABLE user_card_progress
  ADD COLUMN IF NOT EXISTS leitner_box INTEGER NOT NULL DEFAULT 0
`;

// Backfill existing progress rows sensibly
await sql`
  UPDATE user_card_progress
  SET leitner_box = CASE
    WHEN mastered = true THEN 5
    WHEN reps >= 3 THEN 4
    WHEN reps = 2 THEN 3
    WHEN reps = 1 OR quiz_correct >= 1 THEN 1
    ELSE 0
  END
  WHERE leitner_box = 0 AND (mastered = true OR reps > 0 OR quiz_correct > 0)
`;

console.log('✅ leitner_box column ready and backfilled!');
