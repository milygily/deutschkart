import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

console.log('🚀 Running non-destructive Duolingo + B1 Grammar Lab migration...');

// 1. Add XP & Streak Freeze columns to users
await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_xp INTEGER NOT NULL DEFAULT 0`;
await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_xp INTEGER NOT NULL DEFAULT 0`;
await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_xp_date TEXT`;
await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_goal INTEGER NOT NULL DEFAULT 50`;
await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_freezes INTEGER NOT NULL DEFAULT 2`;

// 2. Grammar Topics table
await sql`
  CREATE TABLE IF NOT EXISTS grammar_topics (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    level TEXT NOT NULL DEFAULT 'B1',
    category TEXT NOT NULL,
    category_fa TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    title_de TEXT NOT NULL,
    title_fa TEXT NOT NULL,
    summary_fa TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '📐',
    color TEXT NOT NULL DEFAULT 'emerald',
    lesson_content JSONB NOT NULL,
    exercises JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`;

// 3. User Grammar Progress table
await sql`
  CREATE TABLE IF NOT EXISTS user_grammar_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic_id INTEGER NOT NULL REFERENCES grammar_topics(id) ON DELETE CASCADE,
    completed_count INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    sessions_completed INTEGER NOT NULL DEFAULT 0,
    mastery_pct INTEGER NOT NULL DEFAULT 0,
    last_practiced_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`;
await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS user_grammar_progress_idx
  ON user_grammar_progress (user_id, topic_id)
`;

// 4. Course Units table (8-unit B1 Learning Path)
await sql`
  CREATE TABLE IF NOT EXISTS course_units (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    level TEXT NOT NULL DEFAULT 'B1',
    order_index INTEGER NOT NULL DEFAULT 0,
    title_de TEXT NOT NULL,
    title_fa TEXT NOT NULL,
    description_fa TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '🗺️',
    color TEXT NOT NULL DEFAULT 'emerald',
    grammar_slugs JSONB NOT NULL DEFAULT '[]'::jsonb,
    linked_deck_slug TEXT,
    guidebook_fa JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`;

// 5. Course Lessons table
await sql`
  CREATE TABLE IF NOT EXISTS course_lessons (
    id SERIAL PRIMARY KEY,
    unit_id INTEGER NOT NULL REFERENCES course_units(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    order_index INTEGER NOT NULL DEFAULT 0,
    lesson_type TEXT NOT NULL DEFAULT 'vocab',
    title_fa TEXT NOT NULL,
    title_de TEXT NOT NULL,
    xp_reward INTEGER NOT NULL DEFAULT 20,
    grammar_slug TEXT,
    exercises JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`;

// 6. User Lesson Progress table
await sql`
  CREATE TABLE IF NOT EXISTS user_lesson_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id INTEGER NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
    completed_count INTEGER NOT NULL DEFAULT 0,
    best_accuracy INTEGER NOT NULL DEFAULT 0,
    completed_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`;
await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS user_lesson_progress_idx
  ON user_lesson_progress (user_id, lesson_id)
`;

console.log('✅ All Duolingo & B1 Grammar Lab tables & columns are ready!');
