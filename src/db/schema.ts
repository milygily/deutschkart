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
