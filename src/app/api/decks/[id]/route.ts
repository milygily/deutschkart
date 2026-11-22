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
        deckCardId: deckCards.id,
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
        customWord: deckCards.customWord,
        customArticle: deckCards.customArticle,
        customPlural: deckCards.customPlural,
        customVerbForms: deckCards.customVerbForms,
        customPersianMeaning: deckCards.customPersianMeaning,
        customEnglishMeaning: deckCards.customEnglishMeaning,
        customExampleDe: deckCards.customExampleDe,
        customExampleFa: deckCards.customExampleFa,
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

    const cards = rows.map((r) => {
      const resolvedArticle =
        r.customArticle === 'NONE'
          ? null
          : r.customArticle ?? r.article;
      return {
        id: r.id,
        deckCardId: r.deckCardId,
        word: r.customWord ?? r.word,
        article: resolvedArticle,
        plural: r.customPlural !== null ? (r.customPlural || null) : r.plural,
        partOfSpeech: r.partOfSpeech,
        verbForms: r.customVerbForms !== null ? (r.customVerbForms || null) : r.verbForms,
        persianMeaning: r.customPersianMeaning ?? r.persianMeaning,
        englishMeaning: r.customEnglishMeaning ?? r.englishMeaning,
        exampleDe: r.customExampleDe ?? r.exampleDe,
        exampleFa: r.customExampleFa ?? r.exampleFa,
        level: r.level,
        starred: starredSet.has(r.id),
        progress: progressMap.get(r.id) ?? null,
      };
    });

    return NextResponse.json({ deck, cards });
  } catch (err) {
    console.error('GET /api/decks/[id] error:', err);
    return NextResponse.json({ error: 'خطا در بارگذاری دسته' }, { status: 500 });
  }
}

export async function PATCH(
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
      return NextResponse.json({ error: 'امکان ویرایش این دسته وجود ندارد.' }, { status: 403 });
    }

    const body = await req.json();
    const updates: Partial<typeof decks.$inferInsert> = {};

    if (typeof body.title === 'string' && body.title.trim()) {
      updates.title = body.title.trim();
    }
    if (typeof body.description === 'string') {
      updates.description = body.description.trim();
    }
    if (['A1', 'A2', 'B1', 'B2', 'CUSTOM'].includes(body.level)) {
      updates.level = body.level;
    }
    if (typeof body.icon === 'string' && body.icon.trim()) {
      updates.icon = body.icon.trim().slice(0, 4);
    }
    if (['emerald', 'sky', 'violet', 'amber', 'rose'].includes(body.color)) {
      updates.color = body.color;
    }

    const [updated] = await db
      .update(decks)
      .set(updates)
      .where(eq(decks.id, deckId))
      .returning();

    return NextResponse.json({ deck: updated });
  } catch (err) {
    console.error('PATCH /api/decks/[id] error:', err);
    return NextResponse.json({ error: 'خطا در ویرایش دسته' }, { status: 500 });
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
