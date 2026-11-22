import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  showEnglish: boolean('show_english').notNull().default(false),
  streakCount: integer('streak_count').notNull().default(0),
  lastStudiedDate: text('last_studied_date'), // YYYY-MM-DD
  totalXp: integer('total_xp').notNull().default(0),
  dailyXp: integer('daily_xp').notNull().default(0),
  dailyXpDate: text('daily_xp_date'), // YYYY-MM-DD
  dailyGoal: integer('daily_goal').notNull().default(50),
  streakFreezes: integer('streak_freezes').notNull().default(2),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const globalWords = pgTable('global_words', {
  id: serial('id').primaryKey(),
  normalizedWord: text('normalized_word').notNull().unique(), // lowercase key e.g. "entscheidung" or "aufhören"
  word: text('word').notNull(), // e.g. "Entscheidung" or "aufhören"
  article: text('article'), // "der" | "die" | "das" | null
  plural: text('plural'), // e.g. "die Entscheidungen"
  partOfSpeech: text('part_of_speech').notNull().default('noun'), // noun | verb | adjective | adverb | phrase
  verbForms: text('verb_forms'), // e.g. "hörte auf · hat aufgehört"
  persianMeaning: text('persian_meaning').notNull(),
  englishMeaning: text('english_meaning').notNull().default(''),
  exampleDe: text('example_de').notNull().default(''),
  exampleFa: text('example_fa').notNull().default(''),
  level: text('level'), // A1 | A2 | B1 | B2 | C1
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const decks = pgTable('decks', {
  id: serial('id').primaryKey(),
  slug: text('slug').unique(), // unique slug for idempotent seeding of system decks
  title: text('title').notNull(),
  titleDe: text('title_de').notNull().default(''),
  description: text('description').notNull().default(''),
  level: text('level').notNull().default('CUSTOM'), // A1 | A2 | B1 | B2 | CUSTOM
  icon: text('icon').notNull().default('📚'),
  color: text('color').notNull().default('emerald'), // emerald | sky | violet | amber | rose
  isSystem: boolean('is_system').notNull().default(false),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const deckCards = pgTable(
  'deck_cards',
  {
    id: serial('id').primaryKey(),
    deckId: integer('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    wordId: integer('word_id')
      .notNull()
      .references(() => globalWords.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    customWord: text('custom_word'),
    customArticle: text('custom_article'),
    customPlural: text('custom_plural'),
    customVerbForms: text('custom_verb_forms'),
    customPersianMeaning: text('custom_persian_meaning'),
    customEnglishMeaning: text('custom_english_meaning'),
    customExampleDe: text('custom_example_de'),
    customExampleFa: text('custom_example_fa'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('deck_word_unique_idx').on(table.deckId, table.wordId)]
);

export const userCardProgress = pgTable(
  'user_card_progress',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    wordId: integer('word_id')
      .notNull()
      .references(() => globalWords.id, { onDelete: 'cascade' }),
    fsrsState: jsonb('fsrs_state'),
    dueAt: timestamp('due_at').defaultNow().notNull(),
    leitnerBox: integer('leitner_box').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    quizCorrect: integer('quiz_correct').notNull().default(0),
    quizWrong: integer('quiz_wrong').notNull().default(0),
    mastered: boolean('mastered').notNull().default(false),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('user_word_progress_idx').on(table.userId, table.wordId)]
);

export const starredWords = pgTable(
  'starred_cards',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    wordId: integer('word_id')
      .notNull()
      .references(() => globalWords.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('user_word_starred_idx').on(table.userId, table.wordId)]
);

export const userDeckBookmarks = pgTable(
  'user_deck_bookmarks',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deckId: integer('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    lastIndex: integer('last_index').notNull().default(0),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('user_deck_bookmark_idx').on(table.userId, table.deckId)]
);

export const deckStories = pgTable('deck_stories', {
  id: serial('id').primaryKey(),
  deckId: integer('deck_id')
    .notNull()
    .references(() => decks.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  titleDe: text('title_de').notNull(),
  titleFa: text('title_fa').notNull(),
  level: text('level').notNull().default('B1'),
  lines: jsonb('lines').notNull(),
  questions: jsonb('questions').notNull(),
  usedWords: jsonb('used_words').notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const grammarTopics = pgTable('grammar_topics', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  level: text('level').notNull().default('B1'),
  category: text('category').notNull(), // verbs | clauses | passive | relative | cases | connectors
  categoryFa: text('category_fa').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  titleDe: text('title_de').notNull(),
  titleFa: text('title_fa').notNull(),
  summaryFa: text('summary_fa').notNull(),
  icon: text('icon').notNull().default('📐'),
  color: text('color').notNull().default('emerald'),
  lessonContent: jsonb('lesson_content').notNull(),
  exercises: jsonb('exercises').notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userGrammarProgress = pgTable(
  'user_grammar_progress',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    topicId: integer('topic_id')
      .notNull()
      .references(() => grammarTopics.id, { onDelete: 'cascade' }),
    completedCount: integer('completed_count').notNull().default(0),
    correctCount: integer('correct_count').notNull().default(0),
    sessionsCompleted: integer('sessions_completed').notNull().default(0),
    masteryPct: integer('mastery_pct').notNull().default(0),
    lastPracticedAt: timestamp('last_practiced_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('user_grammar_progress_idx').on(table.userId, table.topicId)]
);

export const courseUnits = pgTable('course_units', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  level: text('level').notNull().default('B1'),
  orderIndex: integer('order_index').notNull().default(0),
  titleDe: text('title_de').notNull(),
  titleFa: text('title_fa').notNull(),
  descriptionFa: text('description_fa').notNull(),
  icon: text('icon').notNull().default('🗺️'),
  color: text('color').notNull().default('emerald'),
  grammarSlugs: jsonb('grammar_slugs').notNull().default([]),
  linkedDeckSlug: text('linked_deck_slug'),
  guidebookFa: jsonb('guidebook_fa').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const courseLessons = pgTable('course_lessons', {
  id: serial('id').primaryKey(),
  unitId: integer('unit_id')
    .notNull()
    .references(() => courseUnits.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull().unique(),
  orderIndex: integer('order_index').notNull().default(0),
  lessonType: text('lesson_type').notNull().default('vocab'), // vocab | grammar | listening | review
  titleFa: text('title_fa').notNull(),
  titleDe: text('title_de').notNull(),
  xpReward: integer('xp_reward').notNull().default(20),
  grammarSlug: text('grammar_slug'),
  exercises: jsonb('exercises').notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userLessonProgress = pgTable(
  'user_lesson_progress',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: integer('lesson_id')
      .notNull()
      .references(() => courseLessons.id, { onDelete: 'cascade' }),
    completedCount: integer('completed_count').notNull().default(0),
    bestAccuracy: integer('best_accuracy').notNull().default(0),
    completedAt: timestamp('completed_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('user_lesson_progress_idx').on(table.userId, table.lessonId)]
);
