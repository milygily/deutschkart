import { NextResponse } from 'next/server';
import { db } from '@/db';
import { globalWords } from '@/db/schema';
import { inArray } from 'drizzle-orm';
import {
  extractWordListFromImage,
  generateFlashcardsFromImage,
  generateFlashcardsFromText,
  generateFlashcardsInChunks,
  normalizeGermanWord,
  type GeneratedWordCard,
} from '@/lib/gemini';

export const maxDuration = 60;

async function cacheWordsInDb(cards: GeneratedWordCard[]) {
  const seen = new Set<string>();
  const rows: Array<{
    normalizedWord: string;
    word: string;
    article: string | null;
    plural: string | null;
    partOfSpeech: string;
    verbForms: string | null;
    persianMeaning: string;
    englishMeaning: string;
    exampleDe: string;
    exampleFa: string;
    level: string | null;
  }> = [];

  for (const c of cards) {
    const normalized = normalizeGermanWord(c.word);
    if (!normalized || !c.persianMeaning || seen.has(normalized)) continue;
    seen.add(normalized);
    rows.push({
      normalizedWord: normalized,
      word: c.word,
      article: c.article,
      plural: c.plural,
      partOfSpeech: c.partOfSpeech,
      verbForms: c.verbForms,
      persianMeaning: c.persianMeaning,
      englishMeaning: c.englishMeaning,
      exampleDe: c.exampleDe,
      exampleFa: c.exampleFa,
      level: c.level,
    });
  }

  if (rows.length > 0) {
    await db.insert(globalWords).values(rows).onConflictDoNothing();
  }
}

async function resolveWordListWithCache(tokens: string[]): Promise<{
  cards: GeneratedWordCard[];
  fromCache: number;
  fromAi: number;
}> {
  const normalizedList = Array.from(
    new Set(tokens.map((t) => normalizeGermanWord(t)).filter(Boolean))
  );

  const cachedByKey = new Map<string, GeneratedWordCard>();
  if (normalizedList.length > 0) {
    const found = await db
      .select()
      .from(globalWords)
      .where(inArray(globalWords.normalizedWord, normalizedList));

    for (const f of found) {
      cachedByKey.set(f.normalizedWord, {
        word: f.word,
        article:
          f.article === 'der' || f.article === 'die' || f.article === 'das'
            ? f.article
            : null,
        plural: f.plural,
        partOfSpeech: (f.partOfSpeech as GeneratedWordCard['partOfSpeech']) || 'noun',
        verbForms: f.verbForms,
        persianMeaning: f.persianMeaning,
        englishMeaning: f.englishMeaning,
        exampleDe: f.exampleDe,
        exampleFa: f.exampleFa,
        level: (f.level as GeneratedWordCard['level']) || null,
      });
    }
  }

  const missingTokens = tokens.filter((t) => !cachedByKey.has(normalizeGermanWord(t)));

  let aiCards: GeneratedWordCard[] = [];
  if (missingTokens.length > 0) {
    aiCards = await generateFlashcardsInChunks(missingTokens, 22);
    await cacheWordsInDb(aiCards);
  }

  const aiByKey = new Map<string, GeneratedWordCard>();
  for (const c of aiCards) {
    const k = normalizeGermanWord(c.word);
    if (k && !aiByKey.has(k)) aiByKey.set(k, c);
  }

  // Reconstruct in original textbook order + append any extra parsed items without duplicates
  const seen = new Set<string>();
  const combined: GeneratedWordCard[] = [];
  for (const tok of tokens) {
    const k = normalizeGermanWord(tok);
    if (!k || seen.has(k)) continue;
    const hit = cachedByKey.get(k) || aiByKey.get(k);
    if (hit) {
      seen.add(k);
      combined.push(hit);
    }
  }
  for (const c of aiCards) {
    const k = normalizeGermanWord(c.word);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    combined.push(c);
  }

  return {
    cards: combined,
    fromCache: cachedByKey.size,
    fromAi: aiCards.length,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mode = body.mode as 'text' | 'image' | 'image-ocr' | 'words-batch';

    // Step 1 (Fast Vision OCR only): extracts ALL words from a textbook/notes photo in ~2-5s
    if (mode === 'image-ocr') {
      const imageBase64 = String(body.imageBase64 || '').trim();
      const mimeType = String(body.mimeType || 'image/jpeg').trim();
      const hint = body.hint ? String(body.hint).trim() : undefined;

      if (!imageBase64) {
        return NextResponse.json({ error: 'لطفاً یک تصویر انتخاب کنید.' }, { status: 400 });
      }

      const words = await extractWordListFromImage(imageBase64, mimeType, hint);
      return NextResponse.json({ words });
    }

    // Step 2 (Fast chunk enrichment): resolves a batch of up to 30 words via Neon cache + Gemini
    if (mode === 'words-batch') {
      const rawWords = Array.isArray(body.words)
        ? body.words.map((w: unknown) => String(w || '').trim()).filter(Boolean).slice(0, 35)
        : [];
      if (rawWords.length === 0) {
        return NextResponse.json({ cards: [], stats: { fromCache: 0, fromAi: 0 } });
      }
      const result = await resolveWordListWithCache(rawWords);
      return NextResponse.json({
        cards: result.cards,
        stats: {
          fromCache: result.fromCache,
          fromAi: result.fromAi,
        },
      });
    }

    if (mode === 'text') {
      const rawText = String(body.text || '').trim();
      if (!rawText) {
        return NextResponse.json({ error: 'لطفاً متن یا لیست کلمات را وارد کنید.' }, { status: 400 });
      }

      const tokens = rawText
        .split(/[\n,،;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.split(/\s+/).length <= 5);

      const looksLikeWordList =
        tokens.length > 0 &&
        tokens.length <= 150 &&
        rawText.split('\n').every((l) => l.trim().length <= 65);

      if (looksLikeWordList) {
        const result = await resolveWordListWithCache(tokens);
        return NextResponse.json({
          cards: result.cards,
          stats: {
            fromCache: result.fromCache,
            fromAi: result.fromAi,
          },
        });
      }

      // Paragraph / prose input
      const aiCards = await generateFlashcardsFromText(rawText);
      await cacheWordsInDb(aiCards);
      return NextResponse.json({
        cards: aiCards,
        stats: {
          fromCache: 0,
          fromAi: aiCards.length,
        },
      });
    }

    if (mode === 'image') {
      const imageBase64 = String(body.imageBase64 || '').trim();
      const mimeType = String(body.mimeType || 'image/jpeg').trim();
      const hint = body.hint ? String(body.hint).trim() : undefined;

      if (!imageBase64) {
        return NextResponse.json({ error: 'لطفاً یک تصویر انتخاب کنید.' }, { status: 400 });
      }

      // 2-Stage Pipeline: Fast full-page Vision OCR (all columns, up to 150 words!)
      // -> Shared Neon cache lookup -> Parallel chunked enrichment (no 35-word cap or truncation!)
      const extractedWords = await extractWordListFromImage(imageBase64, mimeType, hint);
      if (extractedWords.length > 0) {
        const result = await resolveWordListWithCache(extractedWords);
        return NextResponse.json({
          cards: result.cards,
          stats: {
            fromCache: result.fromCache,
            fromAi: result.fromAi,
          },
        });
      }

      // Fallback to direct vision generation if OCR list came back empty
      const aiCards = await generateFlashcardsFromImage(imageBase64, mimeType, hint);
      await cacheWordsInDb(aiCards);

      return NextResponse.json({
        cards: aiCards,
        stats: {
          fromCache: 0,
          fromAi: aiCards.length,
        },
      });
    }

    return NextResponse.json({ error: 'حالت ورودی نامعتبر است.' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/ai/generate error:', err);
    return NextResponse.json(
      { error: 'سرویس هوش مصنوعی موقتاً شلوغ است یا خطایی رخ داد. لطفاً چند ثانیه بعد دوباره امتحان کنید.' },
      { status: 500 }
    );
  }
}
