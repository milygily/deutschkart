import { NextResponse } from 'next/server';
import { db } from '@/db';
import { decks, deckCards, globalWords, starredWords, userCardProgress } from '@/db/schema';
import { eq, asc, and, inArray } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

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

    const user = await getCurrentUser();
    const deckRows = await db.select().from(decks).where(eq(decks.id, deckId)).limit(1);
    const deck = deckRows[0];

    if (!deck) {
      return NextResponse.json({ error: 'دسته پیدا نشد.' }, { status: 404 });
    }
    if (!deck.isSystem && (!user || deck.userId !== user.id)) {
      return NextResponse.json({ error: 'دسترسی مجاز نیست.' }, { status: 403 });
    }

    const rows = await db
      .select({
        id: globalWords.id,
        word: globalWords.word,
        article: globalWords.article,
        plural: globalWords.plural,
        partOfSpeech: globalWords.partOfSpeech,
        verbForms: globalWords.verbForms,
        persianMeaning: globalWords.persianMeaning,
        englishMeaning: globalWords.englishMeaning,
        exampleDe: globalWords.exampleDe,
        exampleFa: globalWords.exampleFa,
        level: globalWords.level,
      })
      .from(deckCards)
      .innerJoin(globalWords, eq(deckCards.wordId, globalWords.id))
      .where(eq(deckCards.deckId, deckId))
      .orderBy(asc(deckCards.position), asc(deckCards.id));

    const wordIds = rows.map((r) => r.id);
    let starredSet = new Set<number>();
    const progressMap = new Map<
      number,
      {
        reps: number;
        lapses: number;
        quizCorrect: number;
        quizWrong: number;
        mastered: boolean;
        dueAt: string;
      }
    >();

    if (user && wordIds.length > 0) {
      const stars = await db
        .select({ wordId: starredWords.wordId })
        .from(starredWords)
        .where(and(eq(starredWords.userId, user.id), inArray(starredWords.wordId, wordIds)));
      starredSet = new Set(stars.map((s) => s.wordId));

      const progs = await db
        .select()
        .from(userCardProgress)
        .where(
          and(eq(userCardProgress.userId, user.id), inArray(userCardProgress.wordId, wordIds))
        );
      for (const p of progs) {
        progressMap.set(p.wordId, {
          reps: p.reps,
          lapses: p.lapses,
          quizCorrect: p.quizCorrect,
          quizWrong: p.quizWrong,
          mastered: p.mastered,
          dueAt: p.dueAt.toISOString(),
        });
      }
    }

    const cards = rows.map((r) => ({
      ...r,
      starred: starredSet.has(r.id),
      progress: progressMap.get(r.id) ?? null,
    }));

    return NextResponse.json({ deck, cards });
  } catch (err) {
    console.error('GET /api/decks/[id] error:', err);
    return NextResponse.json({ error: 'خطا در بارگذاری دسته' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'وارد حساب کاربری شوید.' }, { status: 401 });
  }

  const { id } = await context.params;
  const deckId = Number(id);

  const deckRows = await db.select().from(decks).where(eq(decks.id, deckId)).limit(1);
  const deck = deckRows[0];
  if (!deck || deck.isSystem || deck.userId !== user.id) {
    return NextResponse.json({ error: 'امکان حذف این دسته وجود ندارد.' }, { status: 403 });
  }

  await db.delete(decks).where(eq(decks.id, deckId));
  return NextResponse.json({ ok: true });
}
