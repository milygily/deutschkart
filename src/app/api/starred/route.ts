import { NextResponse } from 'next/server';
import { db } from '@/db';
import { globalWords, starredWords, userCardProgress } from '@/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ cards: [], guest: true });
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
      .from(starredWords)
      .innerJoin(globalWords, eq(starredWords.wordId, globalWords.id))
      .where(eq(starredWords.userId, user.id))
      .orderBy(desc(starredWords.createdAt));

    const wordIds = rows.map((r) => r.id);
    const progressMap = new Map<number, {
      reps: number;
      lapses: number;
      quizCorrect: number;
      quizWrong: number;
      mastered: boolean;
      dueAt: string;
    }>();

    if (wordIds.length > 0) {
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

    return NextResponse.json({
      cards: rows.map((r) => ({
        ...r,
        starred: true,
        progress: progressMap.get(r.id) ?? null,
      })),
    });
  } catch (err) {
    console.error('GET /api/starred error:', err);
    return NextResponse.json({ error: 'خطا در دریافت ستاره‌دارها' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: true, guest: true });
    }

    const body = await req.json();
    const wordId = Number(body.wordId);
    if (!wordId || Number.isNaN(wordId)) {
      return NextResponse.json({ error: 'wordId نامعتبر است.' }, { status: 400 });
    }

    const existing = await db
      .select({ id: starredWords.id })
      .from(starredWords)
      .where(and(eq(starredWords.userId, user.id), eq(starredWords.wordId, wordId)))
      .limit(1);

    if (existing.length > 0) {
      await db.delete(starredWords).where(eq(starredWords.id, existing[0].id));
      return NextResponse.json({ ok: true, starred: false });
    }

    await db.insert(starredWords).values({ userId: user.id, wordId }).onConflictDoNothing();
    return NextResponse.json({ ok: true, starred: true });
  } catch (err) {
    console.error('POST /api/starred error:', err);
    return NextResponse.json({ error: 'خطا در تغییر وضعیت ستاره' }, { status: 500 });
  }
}
