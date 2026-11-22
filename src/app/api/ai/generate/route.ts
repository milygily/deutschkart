import { NextResponse } from 'next/server';
import { db } from '@/db';
import { globalWords } from '@/db/schema';
import { inArray } from 'drizzle-orm';
import {
  generateFlashcardsFromImage,
  generateFlashcardsFromText,
  normalizeGermanWord,
  type GeneratedWordCard,
} from '@/lib/gemini';

export const maxDuration = 60;

async function cacheWordsInDb(cards: GeneratedWordCard[]) {
  for (const c of cards) {
    const normalized = normalizeGermanWord(c.word);
    if (!normalized || !c.persianMeaning) continue;
    await db
      .insert(globalWords)
      .values({
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
      })
      .onConflictDoNothing();
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mode = body.mode as 'text' | 'image';

    if (mode === 'text') {
      const rawText = String(body.text || '').trim();
      if (!rawText) {
        return NextResponse.json({ error: 'لطفاً متن یا لیست کلمات را وارد کنید.' }, { status: 400 });
      }

      // Smart Cache Check: if input looks like a clean list of words/phrases separated by newlines or commas
      const tokens = rawText
        .split(/[\n,،;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.split(/\s+/).length <= 3);

      const looksLikeWordList =
        tokens.length > 0 && tokens.length <= 40 && rawText.split('\n').every((l) => l.trim().length <= 50);

      const cachedCards: GeneratedWordCard[] = [];
      let uncachedText = rawText;

      if (looksLikeWordList) {
        const normalizedList = Array.from(
          new Set(tokens.map((t) => normalizeGermanWord(t)).filter(Boolean))
        );

        if (normalizedList.length > 0) {
          const found = await db
            .select()
            .from(globalWords)
            .where(inArray(globalWords.normalizedWord, normalizedList));

          const foundSet = new Set(found.map((f) => f.normalizedWord));
          for (const f of found) {
            cachedCards.push({
              word: f.word,
              article:
                f.article === 'der' || f.article === 'die' || f.article === 'das'
                  ? f.article
                  : null,
              plural: f.plural,
              partOfSpeech:
                (f.partOfSpeech as GeneratedWordCard['partOfSpeech']) || 'noun',
              verbForms: f.verbForms,
              persianMeaning: f.persianMeaning,
              englishMeaning: f.englishMeaning,
              exampleDe: f.exampleDe,
              exampleFa: f.exampleFa,
              level: (f.level as GeneratedWordCard['level']) || null,
            });
          }

          const missingTokens = tokens.filter((t) => !foundSet.has(normalizeGermanWord(t)));
          uncachedText = missingTokens.join('\n');
        }
      }

      let aiCards: GeneratedWordCard[] = [];
      if (uncachedText.trim().length > 0) {
        aiCards = await generateFlashcardsFromText(uncachedText);
        await cacheWordsInDb(aiCards);
      }

      // Deduplicate combined results
      const seen = new Set<string>();
      const combined: GeneratedWordCard[] = [];
      for (const c of [...cachedCards, ...aiCards]) {
        const key = normalizeGermanWord(c.word);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        combined.push(c);
      }

      return NextResponse.json({
        cards: combined,
        stats: {
          fromCache: cachedCards.length,
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
