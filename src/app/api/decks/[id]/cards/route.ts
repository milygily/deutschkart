import { NextResponse } from 'next/server';
import { db } from '@/db';
import { decks, deckCards, globalWords } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { normalizeGermanWord, type GeneratedWordCard } from '@/lib/gemini';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'وارد حساب کاربری شوید.' }, { status: 401 });
    }

    const { id } = await context.params;
    const deckId = Number(id);
    const deckRows = await db.select().from(decks).where(eq(decks.id, deckId)).limit(1);
    const deck = deckRows[0];

    if (!deck || deck.isSystem || deck.userId !== user.id) {
      return NextResponse.json({ error: 'امکان افزودن کلمه به این دسته وجود ندارد.' }, { status: 403 });
    }

    const body = await req.json();
    const cardsInput: GeneratedWordCard[] = Array.isArray(body.cards)
      ? body.cards
      : body.word
        ? [body]
        : [];

    if (cardsInput.length === 0) {
      return NextResponse.json({ error: 'لطفاً حداقل یک کلمه معتبر وارد کنید.' }, { status: 400 });
    }

    const [{ maxPos }] = await db
      .select({ maxPos: sql<number>`coalesce(max(${deckCards.position}), -1)` })
      .from(deckCards)
      .where(eq(deckCards.deckId, deckId));

    let nextPos = Number(maxPos) + 1;
    let addedCount = 0;

    for (const raw of cardsInput) {
      const cleanWord = String(raw.word || '').trim().replace(/^(der|die|das)\s+/i, '');
      const cleanMeaning = String(raw.persianMeaning || '').trim();
      if (!cleanWord || !cleanMeaning) continue;

      const normalized = normalizeGermanWord(cleanWord);
      if (!normalized) continue;

      const articleVal =
        raw.article === 'der' || raw.article === 'die' || raw.article === 'das'
          ? raw.article
          : null;

      const existingWord = await db
        .select({ id: globalWords.id })
        .from(globalWords)
        .where(eq(globalWords.normalizedWord, normalized))
        .limit(1);

      let wordId: number;
      if (existingWord.length > 0) {
        wordId = existingWord[0].id;
      } else {
        const [inserted] = await db
          .insert(globalWords)
          .values({
            normalizedWord: normalized,
            word: cleanWord,
            article: articleVal,
            plural: raw.plural ? String(raw.plural).trim() : null,
            partOfSpeech: raw.partOfSpeech || (articleVal ? 'noun' : 'phrase'),
            verbForms: raw.verbForms ? String(raw.verbForms).trim() : null,
            persianMeaning: cleanMeaning,
            englishMeaning: raw.englishMeaning ? String(raw.englishMeaning).trim() : '',
            exampleDe: raw.exampleDe ? String(raw.exampleDe).trim() : '',
            exampleFa: raw.exampleFa ? String(raw.exampleFa).trim() : '',
            level: raw.level ?? null,
          })
          .returning({ id: globalWords.id });
        wordId = inserted.id;
      }

      // If the user explicitly typed a custom meaning/example for a word that already existed globally,
      // save it as per-deck custom override so their chosen meaning appears!
      const insertedLink = await db
        .insert(deckCards)
        .values({
          deckId,
          wordId,
          position: nextPos++,
          customWord: cleanWord,
          customArticle: articleVal ?? 'NONE',
          customPlural: raw.plural ? String(raw.plural).trim() : null,
          customVerbForms: raw.verbForms ? String(raw.verbForms).trim() : null,
          customPersianMeaning: cleanMeaning,
          customEnglishMeaning: raw.englishMeaning ? String(raw.englishMeaning).trim() : null,
          customExampleDe: raw.exampleDe ? String(raw.exampleDe).trim() : null,
          customExampleFa: raw.exampleFa ? String(raw.exampleFa).trim() : null,
        })
        .onConflictDoNothing()
        .returning({ id: deckCards.id });

      if (insertedLink.length > 0) addedCount++;
    }

    return NextResponse.json({ ok: true, addedCount }, { status: 201 });
  } catch (err) {
    console.error('POST /api/decks/[id]/cards error:', err);
    return NextResponse.json({ error: 'خطا در افزودن کلمه' }, { status: 500 });
  }
}
