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

    // Pick up to 16 words per story (rotating cleanly for large 30+ word decks)
    const BATCH_SIZE = 16;
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

    const prompt = `You are a creative German podcast & Duolingo Story writer for Persian speakers learning German at level ${targetLevel}.

Write a lively, engaging, realistic everyday German conversation/mini-podcast between two friends: **Anna** and **Lukas**.
You MUST naturally weave as many of these target German vocabulary words as possible into the conversation (ideally ALL of them!):
${vocabList.map((v) => `- ${v.display} (${v.fa})`).join('\n')}

Requirements:
- 10 to 14 dialogue turns alternating naturally between Anna and Lukas.
- Each line should be 1 to 2 natural, clear spoken German sentences (great for listening as a podcast!).
- Keep grammar and tone authentic for ${targetLevel} learners living in Germany.
- Provide a natural, fluent Iranian Persian translation ("fa") for every line.
- Create 3 short, fun reading/listening comprehension questions ("questions") in German with Persian translation and 3 short Persian answer options (with "correctIndex": 0, 1, or 2).

Return ONLY valid JSON (no markdown fences) matching this exact schema:
{
  "titleDe": "Catchy German episode title (3-6 words)",
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
      const timer = setTimeout(() => ac.abort(), 22000);
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
        if (candidate && Array.isArray(candidate.lines) && candidate.lines.length >= 4) {
          parsed = {
            titleDe: String(candidate.titleDe || deck.titleDe || 'DeutschKart Podcast').trim(),
            titleFa: String(candidate.titleFa || deck.title).trim(),
            lines: candidate.lines.map((l: { speaker?: string; de?: string; fa?: string }, i: number) => ({
              speaker: l.speaker === 'Lukas' ? 'Lukas' : l.speaker === 'Anna' ? 'Anna' : i % 2 === 0 ? 'Anna' : 'Lukas',
              de: String(l.de || '').trim(),
              fa: String(l.fa || '').trim(),
            })),
            questions: Array.isArray(candidate.questions) ? candidate.questions.slice(0, 4) : [],
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
