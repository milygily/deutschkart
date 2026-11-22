import { NextResponse } from 'next/server';
import { db } from '@/db';
import { decks, deckCards, deckStories, globalWords } from '@/db/schema';
import { asc, desc, eq } from 'drizzle-orm';
import { GoogleGenAI } from '@google/genai';
import { getCurrentUser } from '@/lib/auth';

export const maxDuration = 60;

export interface StoryLine {
  speaker: 'Anna' | 'Lukas';
  de: string;
  fa: string;
}

export interface StoryQuestion {
  questionDe: string;
  questionFa: string;
  options: string[];
  correctIndex: number;
}

const STORY_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
];

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const deckId = Number(id);
    if (!deckId || Number.isNaN(deckId)) {
      return NextResponse.json({ error: 'شناسه دسته نامعتبر است.' }, { status: 400 });
    }

    const deckRows = await db.select().from(decks).where(eq(decks.id, deckId)).limit(1);
    const deck = deckRows[0];
    if (!deck) {
      return NextResponse.json({ error: 'دسته پیدا نشد.' }, { status: 404 });
    }

    const stories = await db
      .select()
      .from(deckStories)
      .where(eq(deckStories.deckId, deckId))
      .orderBy(desc(deckStories.createdAt))
      .limit(10);

    return NextResponse.json({
      deck: {
        id: deck.id,
        title: deck.title,
        level: deck.level,
        icon: deck.icon,
      },
      stories,
    });
  } catch (err) {
    console.error('GET /api/decks/[id]/story error:', err);
    return NextResponse.json({ error: 'خطا در دریافت داستان' }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const deckId = Number(id);
    if (!deckId || Number.isNaN(deckId)) {
      return NextResponse.json({ error: 'شناسه دسته نامعتبر است.' }, { status: 400 });
    }

    const user = await getCurrentUser();
    const deckRows = await db.select().from(decks).where(eq(decks.id, deckId)).limit(1);
    const deck = deckRows[0];
    if (!deck) {
      return NextResponse.json({ error: 'دسته پیدا نشد.' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const partIndex = Math.max(0, Number(body.partIndex) || 0);

    const rows = await db
      .select({
        word: globalWords.word,
        article: globalWords.article,
        persianMeaning: globalWords.persianMeaning,
        customWord: deckCards.customWord,
        customArticle: deckCards.customArticle,
        customPersianMeaning: deckCards.customPersianMeaning,
      })
      .from(deckCards)
      .innerJoin(globalWords, eq(deckCards.wordId, globalWords.id))
      .where(eq(deckCards.deckId, deckId))
      .orderBy(asc(deckCards.position), asc(deckCards.id));

    if (rows.length === 0) {
      return NextResponse.json({ error: 'این دسته هنوز هیچ کلمه‌ای ندارد.' }, { status: 400 });
    }

    // Focus on 10–12 words per episode so EVERY target word can be naturally repeated 2–3 times
    // in different grammatical cases & real situations!
    const BATCH_SIZE = 12;
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
    const start = (partIndex % totalBatches) * BATCH_SIZE;
    const selectedRows = rows.slice(start, start + BATCH_SIZE);

    const vocabList = selectedRows.map((r) => {
      const w = r.customWord ?? r.word;
      const art = r.customArticle === 'NONE' ? null : r.customArticle ?? r.article;
      const fa = r.customPersianMeaning ?? r.persianMeaning;
      return {
        rawWord: w,
        display: art ? `${art} ${w}` : w,
        fa,
      };
    });

    const targetLevel = ['A1', 'A2', 'B1', 'B2'].includes(deck.level) ? deck.level : 'B1';
    const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '').trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'کلید هوش مصنوعی تنظیم نشده است.' }, { status: 500 });
    }
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are a master German language podcast writer (like Easy German Podcast) creating a rich, relaxed, 3.5 to 5-minute German podcast episode for Persian speakers at CEFR level ${targetLevel}.

Write an authentic, warm, unhurried German podcast conversation between two friends: **Anna** and **Lukas**.

TARGET VOCABULARY TO TEACH AND REINFORCE:
${vocabList.map((v) => `- ${v.display} (${v.fa})`).join('\n')}

CRITICAL PEDAGOGICAL & PACING RULES:
1. **LENGTH & FLOW (NO PING-PONG!):**
   - Write **20 to 24 dialogue turns** totaling **550 to 720 German words** (about 3.5 to 5 minutes of calm spoken podcast!).
   - DO NOT write rapid-fire 1-sentence ping-pong replies! Each turn should be **2 to 4 relaxed, flowing spoken sentences** — telling short everyday anecdotes, explaining thoughts, reacting warmly ("Ach, das kenne ich total gut...", "Weißt du, letzte Woche ist mir etwas Ähnliches passiert..."), and developing a real story with a beginning, middle, and ending.
2. **DELIBERATE REPETITION ACROSS GRAMMATICAL CASES (SUPER IMPORTANT!):**
   - Repeat almost EVERY target word **2 to 3 times** naturally across different parts of the conversation!
   - Vary the grammatical forms so the learner absorbs real German grammar effortlessly:
     * For nouns: use them in **Nominativ, Akkusativ, Dativ**, and (where natural at ${targetLevel}) **Genitiv** or **Plural**!
     * For verbs: use them across **Präsens, Perfekt, Modalverb, and Nebensatz** (e.g. with weil / obwohl / wenn)!
     * For adjectives/adverbs: use them in different positions & comparisons!
3. **NATURAL TRANSLATIONS & QUIZ:**
   - Provide a fluent, accurate Iranian Persian translation ("fa") for every single turn.
   - Include **4 comprehension questions** ("questions") at the end in German with Persian translation and 3 short Persian answer choices ("correctIndex": 0, 1, or 2).

Return ONLY valid JSON (no markdown fences) matching this exact schema:
{
  "titleDe": "Engaging German podcast episode title (4-7 words)",
  "titleFa": "Natural Persian translation of the title",
  "lines": [
    { "speaker": "Anna", "de": "...", "fa": "..." },
    { "speaker": "Lukas", "de": "...", "fa": "..." }
  ],
  "questions": [
    {
      "questionDe": "...",
      "questionFa": "...",
      "options": ["گزینه ۱", "گزینه ۲", "گزینه ۳"],
      "correctIndex": 0
    }
  ]
}`;

    let parsed: {
      titleDe: string;
      titleFa: string;
      lines: StoryLine[];
      questions: StoryQuestion[];
    } | null = null;
    let lastErr: unknown = null;

    for (const model of STORY_MODELS) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 32000);
      try {
        let res;
        try {
          res = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.65,
              thinkingConfig: { thinkingBudget: 0 },
              abortSignal: ac.signal,
            },
          });
        } catch (innerErr) {
          const msg = innerErr instanceof Error ? innerErr.message : '';
          const status = (innerErr as { status?: number })?.status;
          if (status === 400 || /INVALID_ARGUMENT|thinking/i.test(msg)) {
            res = await ai.models.generateContent({
              model,
              contents: prompt,
              config: {
                responseMimeType: 'application/json',
                temperature: 0.65,
                abortSignal: ac.signal,
              },
            });
          } else {
            throw innerErr;
          }
        }
        clearTimeout(timer);

        const cleaned = (res.text || '{}')
          .replace(/^```json\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();
        const candidate = JSON.parse(cleaned);
        if (candidate && Array.isArray(candidate.lines) && candidate.lines.length >= 6) {
          parsed = {
            titleDe: String(candidate.titleDe || deck.titleDe || 'DeutschKart Podcast').trim(),
            titleFa: String(candidate.titleFa || deck.title).trim(),
            lines: candidate.lines.map(
              (l: { speaker?: string; de?: string; fa?: string }, i: number) => ({
                speaker:
                  l.speaker === 'Lukas'
                    ? 'Lukas'
                    : l.speaker === 'Anna'
                      ? 'Anna'
                      : i % 2 === 0
                        ? 'Anna'
                        : 'Lukas',
                de: String(l.de || '').trim(),
                fa: String(l.fa || '').trim(),
              })
            ),
            questions: Array.isArray(candidate.questions) ? candidate.questions.slice(0, 5) : [],
          };
          break;
        }
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;
      }
    }

    if (!parsed) {
      throw lastErr || new Error('Story generation failed');
    }

    const usedWords = vocabList.map((v) => v.rawWord);

    const [saved] = await db
      .insert(deckStories)
      .values({
        deckId,
        userId: user?.id ?? null,
        titleDe: parsed.titleDe,
        titleFa: parsed.titleFa,
        level: targetLevel,
        lines: parsed.lines,
        questions: parsed.questions,
        usedWords,
      })
      .returning();

    return NextResponse.json({ story: saved }, { status: 201 });
  } catch (err) {
    console.error('POST /api/decks/[id]/story error:', err);
    return NextResponse.json(
      { error: 'ساخت داستان با خطا مواجه شد. لطفاً چند ثانیه بعد دوباره امتحان کنید.' },
      { status: 500 }
    );
  }
}
