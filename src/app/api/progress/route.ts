import { NextResponse } from 'next/server';
import { db } from '@/db';
import { userCardProgress } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getCurrentUser, touchUserStreak } from '@/lib/auth';
import { advanceLeitner } from '@/lib/leitner';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: true, guest: true });
    }

    const body = await req.json();
    const wordId = Number(body.wordId);
    const kind = body.kind as 'swipe' | 'quiz';

    if (!wordId || Number.isNaN(wordId)) {
      return NextResponse.json({ error: 'wordId نامعتبر است.' }, { status: 400 });
    }

    const existingRows = await db
      .select()
      .from(userCardProgress)
      .where(and(eq(userCardProgress.userId, user.id), eq(userCardProgress.wordId, wordId)))
      .limit(1);

    const existing = existingRows[0];
    const currentBox = existing?.leitnerBox ?? 0;
    const currentDueAt = existing?.dueAt ?? null;

    if (kind === 'swipe') {
      const correct = body.outcome === 'know';
      const { nextBox, nextDueAt, mastered } = advanceLeitner(currentBox, currentDueAt, correct);
      const reps = (existing?.reps ?? 0) + (correct ? 1 : 0);
      const lapses = (existing?.lapses ?? 0) + (correct ? 0 : 1);

      if (existing) {
        await db
          .update(userCardProgress)
          .set({
            leitnerBox: nextBox,
            dueAt: nextDueAt,
            reps,
            lapses,
            mastered,
            updatedAt: new Date(),
          })
          .where(eq(userCardProgress.id, existing.id));
      } else {
        await db.insert(userCardProgress).values({
          userId: user.id,
          wordId,
          fsrsState: null,
          leitnerBox: nextBox,
          dueAt: nextDueAt,
          reps,
          lapses,
          quizCorrect: 0,
          quizWrong: 0,
          mastered,
        });
      }

      await touchUserStreak(user.id);
      return NextResponse.json({
        ok: true,
        leitnerBox: nextBox,
        mastered,
        dueAt: nextDueAt.toISOString(),
        reps,
      });
    }

    if (kind === 'quiz') {
      const correct = Boolean(body.correct);
      const { nextBox, nextDueAt, mastered } = advanceLeitner(currentBox, currentDueAt, correct);
      const reps = (existing?.reps ?? 0) + (correct ? 1 : 0);
      const lapses = (existing?.lapses ?? 0) + (correct ? 0 : 1);
      const quizCorrect = (existing?.quizCorrect ?? 0) + (correct ? 1 : 0);
      const quizWrong = (existing?.quizWrong ?? 0) + (correct ? 0 : 1);

      if (existing) {
        await db
          .update(userCardProgress)
          .set({
            leitnerBox: nextBox,
            dueAt: nextDueAt,
            reps,
            lapses,
            quizCorrect,
            quizWrong,
            mastered,
            updatedAt: new Date(),
          })
          .where(eq(userCardProgress.id, existing.id));
      } else {
        await db.insert(userCardProgress).values({
          userId: user.id,
          wordId,
          fsrsState: null,
          leitnerBox: nextBox,
          dueAt: nextDueAt,
          reps,
          lapses,
          quizCorrect,
          quizWrong,
          mastered,
        });
      }

      await touchUserStreak(user.id);
      return NextResponse.json({
        ok: true,
        leitnerBox: nextBox,
        mastered,
        dueAt: nextDueAt.toISOString(),
        quizCorrect,
        quizWrong,
      });
    }

    return NextResponse.json({ error: 'نوع عملیات نامعتبر است.' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/progress error:', err);
    return NextResponse.json({ error: 'خطا در ثبت پیشرفت' }, { status: 500 });
  }
}
