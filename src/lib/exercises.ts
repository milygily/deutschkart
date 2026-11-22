import type { WordCard } from './types';

export type ExerciseType =
  | 'word-bank'
  | 'grammar-cloze'
  | 'listening'
  | 'typing'
  | 'speaking'
  | 'match-pairs';

export interface BaseExercise {
  id: string;
  type: ExerciseType;
  explanationFa?: string;
  wordId?: number;
}

export interface WordBankExercise extends BaseExercise {
  type: 'word-bank';
  promptFa: string;
  hintDe?: string;
  targetDe: string;
  tokens: string[];
}

export interface GrammarClozeExercise extends BaseExercise {
  type: 'grammar-cloze';
  instructionFa: string;
  sentenceBefore: string;
  sentenceAfter: string;
  translationFa: string;
  options: string[];
  answer: string;
  fullSentenceDe?: string;
}

export interface ListeningExercise extends BaseExercise {
  type: 'listening';
  audioDe: string;
  translationFa: string;
  mode: 'word-bank' | 'type';
  tokens?: string[];
}

export interface TypingExercise extends BaseExercise {
  type: 'typing';
  promptFa: string;
  sentenceBefore?: string;
  sentenceAfter?: string;
  answerDe: string;
  acceptedAnswers?: string[];
  hintDe?: string;
}

export interface SpeakingExercise extends BaseExercise {
  type: 'speaking';
  promptFa: string;
  targetDe: string;
  translationFa: string;
}

export interface MatchPairsExercise extends BaseExercise {
  type: 'match-pairs';
  promptFa: string;
  pairs: Array<{ id: string; de: string; fa: string }>;
}

export type Exercise =
  | WordBankExercise
  | GrammarClozeExercise
  | ListeningExercise
  | TypingExercise
  | SpeakingExercise
  | MatchPairsExercise;

export interface GrammarTable {
  titleFa: string;
  headers: string[];
  rows: string[][];
}

export interface GrammarExample {
  de: string;
  fa: string;
  highlight?: string;
  noteFa?: string;
}

export interface GrammarPitfall {
  wrongDe: string;
  rightDe: string;
  whyFa: string;
}

export interface GrammarLessonContent {
  formulaDe: string;
  formulaFa: string;
  introFa: string;
  keyRulesFa: string[];
  tables: GrammarTable[];
  examples: GrammarExample[];
  persianPitfalls: GrammarPitfall[];
  externalRefs?: Array<{ label: string; url: string }>;
}

export function normalizeGermanAnswer(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[.,!?;:„“"'«»()[\]–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function foldUmlauts(s: string): string {
  return s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[n];
}

export function checkGermanAnswer(
  userInput: string,
  expected: string,
  acceptedAnswers: string[] = [],
  strictShortToken = false
): { correct: boolean; minorTypo?: boolean } {
  const normUser = normalizeGermanAnswer(userInput);
  if (!normUser) return { correct: false };

  const candidates = [expected, ...acceptedAnswers].filter(Boolean);

  for (const cand of candidates) {
    const normCand = normalizeGermanAnswer(cand);
    if (normUser === normCand) {
      return { correct: true };
    }
    // Tolerate ae/oe/ue for ä/ö/ü
    if (foldUmlauts(normUser) === foldUmlauts(normCand)) {
      return { correct: true, minorTypo: true };
    }
    // Allow 1 small typo only on longer full phrases/words (never on short grammar tokens like dem/den/als/wenn)
    if (!strictShortToken && normCand.length >= 7 && levenshtein(normUser, normCand) <= 1) {
      return { correct: true, minorTypo: true };
    }
  }

  return { correct: false };
}

export function computeSpeechSimilarity(spoken: string, target: string): number {
  const normSpoken = normalizeGermanAnswer(spoken);
  const normTarget = normalizeGermanAnswer(target);
  if (!normSpoken || !normTarget) return 0;
  if (normSpoken === normTarget) return 1;

  const targetWords = normTarget.split(' ').filter(Boolean);
  const spokenWords = normSpoken.split(' ').filter(Boolean);
  if (!targetWords.length) return 0;

  let matched = 0;
  const remaining = [...spokenWords];
  for (const tw of targetWords) {
    const exactIdx = remaining.indexOf(tw);
    if (exactIdx !== -1) {
      matched += 1;
      remaining.splice(exactIdx, 1);
      continue;
    }
    // Check close phonetic/edit match
    const fuzzyIdx = remaining.findIndex(
      (sw) => (tw.length >= 4 && levenshtein(sw, tw) <= 1) || foldUmlauts(sw) === foldUmlauts(tw)
    );
    if (fuzzyIdx !== -1) {
      matched += 0.85;
      remaining.splice(fuzzyIdx, 1);
    }
  }

  const wordScore = matched / targetWords.length;
  const maxLen = Math.max(normSpoken.length, normTarget.length);
  const charScore = maxLen > 0 ? 1 - levenshtein(normSpoken, normTarget) / maxLen : 0;

  return Math.max(wordScore, charScore);
}

export function tokenizeGermanSentence(sentence: string): string[] {
  return sentence
    .trim()
    .replace(/[.,!?;:„“"'«»]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const COMMON_DISTRACTORS = [
  'nicht',
  'immer',
  'schon',
  'aber',
  'weil',
  'sehr',
  'heute',
  'morgen',
  'mit',
  'für',
  'haben',
  'werden',
  'können',
  'dass',
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generates an interactive 6-type Duolingo-style exercise session from any flashcard deck.
 */
export function buildExercisesFromCards(cards: WordCard[], maxExercises = 10): Exercise[] {
  if (!cards.length) return [];

  const pool = shuffle(cards);
  const exercises: Exercise[] = [];
  let idx = 0;

  // 1. Start with a Match Pairs warm-up if we have at least 4 cards
  if (pool.length >= 4) {
    const pairCards = pool.slice(0, Math.min(5, pool.length));
    exercises.push({
      id: `deck-match-${idx++}`,
      type: 'match-pairs',
      promptFa: 'جفت‌های آلمانی و فارسی را به هم وصل کن:',
      pairs: pairCards.map((c) => ({
        id: String(c.id),
        de: c.article ? `${c.article} ${c.word}` : c.word,
        fa: c.persianMeaning.split('،')[0].trim(),
      })),
      explanationFa: 'عالی! با تطبیق سریع کلمات، حافظه فعال ذهنت گرم شد.',
    });
  }

  const cardsWithExamples = pool.filter(
    (c) => c.exampleDe && c.exampleDe.trim().split(/\s+/).length >= 3 && c.exampleFa
  );

  // 2. Grammar Cloze / Context Cloze or Article Cloze
  for (const card of pool.slice(0, 3)) {
    if (exercises.length >= maxExercises) break;
    if (card.exampleDe && card.exampleFa) {
      const regex = new RegExp(`\\b(${escapeRegex(card.word)}[a-zäöüß]*)\\b`, 'i');
      const match = card.exampleDe.match(regex);
      if (match && match.index !== undefined) {
        const matchedForm = match[1];
        const before = card.exampleDe.slice(0, match.index);
        const after = card.exampleDe.slice(match.index + matchedForm.length);
        const distractors = shuffle(
          pool
            .filter((other) => other.id !== card.id && other.word.toLowerCase() !== card.word.toLowerCase())
            .map((other) => other.word)
        ).slice(0, 3);

        if (distractors.length >= 2) {
          exercises.push({
            id: `deck-cloze-${card.id}-${idx++}`,
            type: 'grammar-cloze',
            instructionFa: 'کلمه درست را برای تکمیل این جمله انتخاب کن:',
            sentenceBefore: before,
            sentenceAfter: after,
            translationFa: card.exampleFa,
            options: shuffle([matchedForm, ...distractors]),
            answer: matchedForm,
            fullSentenceDe: card.exampleDe,
            explanationFa: `«${card.article ? `${card.article} ` : ''}${card.word}» به معنی «${card.persianMeaning}» است.`,
            wordId: card.id,
          });
          continue;
        }
      }
    }

    // Fallback: Article cloze for nouns
    if (card.article === 'der' || card.article === 'die' || card.article === 'das') {
      exercises.push({
        id: `deck-article-${card.id}-${idx++}`,
        type: 'grammar-cloze',
        instructionFa: `آرتیکل درست «${card.word}» (${card.persianMeaning}) چیست؟`,
        sentenceBefore: '',
        sentenceAfter: ` ${card.word}`,
        translationFa: card.persianMeaning,
        options: ['der', 'die', 'das'],
        answer: card.article,
        fullSentenceDe: `${card.article} ${card.word}`,
        explanationFa: `آرتیکل صحیح «${card.article} ${card.word}» است${card.plural ? ` (جمع: ${card.plural})` : ''}.`,
        wordId: card.id,
      });
    }
  }

  // 3. Word Bank (sentence construction)
  for (const card of cardsWithExamples.slice(0, 2)) {
    if (exercises.length >= maxExercises) break;
    const correctTokens = tokenizeGermanSentence(card.exampleDe);
    if (correctTokens.length >= 3 && correctTokens.length <= 12) {
      const lowerSet = new Set(correctTokens.map((t) => t.toLowerCase()));
      const extra = shuffle(COMMON_DISTRACTORS.filter((d) => !lowerSet.has(d))).slice(0, 2);
      exercises.push({
        id: `deck-wb-${card.id}-${idx++}`,
        type: 'word-bank',
        promptFa: card.exampleFa,
        hintDe: card.article ? `${card.article} ${card.word}` : card.word,
        targetDe: card.exampleDe,
        tokens: shuffle([...correctTokens, ...extra]),
        explanationFa: `جمله صحیح: ${card.exampleDe}`,
        wordId: card.id,
      });
    }
  }

  // 4. Listening (Word Bank assembly)
  for (const card of cardsWithExamples.slice(2, 4)) {
    if (exercises.length >= maxExercises) break;
    const correctTokens = tokenizeGermanSentence(card.exampleDe);
    if (correctTokens.length >= 3 && correctTokens.length <= 12) {
      const lowerSet = new Set(correctTokens.map((t) => t.toLowerCase()));
      const extra = shuffle(COMMON_DISTRACTORS.filter((d) => !lowerSet.has(d))).slice(0, 2);
      exercises.push({
        id: `deck-listen-${card.id}-${idx++}`,
        type: 'listening',
        audioDe: card.exampleDe,
        translationFa: card.exampleFa,
        mode: 'word-bank',
        tokens: shuffle([...correctTokens, ...extra]),
        explanationFa: `معنی: ${card.exampleFa}`,
        wordId: card.id,
      });
    }
  }

  // 5. Typing (German word recall with ä ö ü ß)
  for (const card of pool.slice(3, 5)) {
    if (exercises.length >= maxExercises) break;
    const full = card.article ? `${card.article} ${card.word}` : card.word;
    exercises.push({
      id: `deck-type-${card.id}-${idx++}`,
      type: 'typing',
      promptFa: `معادل آلمانی «${card.persianMeaning}» را تایپ کن:`,
      answerDe: full,
      acceptedAnswers: card.article ? [card.word, full] : [card.word],
      hintDe: card.article ? `با آرتیکل (${card.article} / die / das)` : `اولین حرف: ${card.word[0]}...`,
      explanationFa: `پاسخ کامل: ${full}${card.plural ? ` (${card.plural})` : ''}`,
      wordId: card.id,
    });
  }

  // 6. Speaking check (1-2 per session)
  const speakCard = cardsWithExamples[4] || cardsWithExamples[0] || pool[0];
  if (speakCard && exercises.length < maxExercises) {
    const target = speakCard.exampleDe || (speakCard.article ? `${speakCard.article} ${speakCard.word}` : speakCard.word);
    exercises.push({
      id: `deck-speak-${speakCard.id}-${idx++}`,
      type: 'speaking',
      promptFa: 'این جمله را با صدای بلند و واضح به آلمانی بخوان:',
      targetDe: target,
      translationFa: speakCard.exampleFa || speakCard.persianMeaning,
      explanationFa: 'تلفظ با صدای بلند کمک می‌کند کلمات از حافظه منفعل به مکالمه فعال منتقل شوند.',
      wordId: speakCard.id,
    });
  }

  // Fill remaining slots with cloze / typing if needed
  for (const card of pool.slice(5)) {
    if (exercises.length >= maxExercises) break;
    const distractors = shuffle(
      pool.filter((o) => o.id !== card.id).map((o) => o.persianMeaning.split('،')[0].trim())
    ).slice(0, 3);
    if (distractors.length >= 2) {
      const answer = card.persianMeaning.split('،')[0].trim();
      exercises.push({
        id: `deck-meaning-${card.id}-${idx++}`,
        type: 'grammar-cloze',
        instructionFa: `معنی دقیق «${card.article ? `${card.article} ` : ''}${card.word}» کدام است؟`,
        sentenceBefore: '',
        sentenceAfter: '',
        translationFa: card.exampleDe || '',
        options: shuffle([answer, ...distractors]),
        answer,
        fullSentenceDe: card.article ? `${card.article} ${card.word}` : card.word,
        explanationFa: card.exampleDe ? `مثال: ${card.exampleDe} (${card.exampleFa})` : `معنی کامل: ${card.persianMeaning}`,
        wordId: card.id,
      });
    }
  }

  return exercises.slice(0, maxExercises);
}
