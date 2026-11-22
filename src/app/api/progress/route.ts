import { NextResponse } from 'next/server';
import { db } from '@/db';
import { userCardProgress } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getCurrentUser, touchUserStreak } from '@/lib/auth';
import { computeNextFsrs, isCardMastered } from '@/lib/fsrs';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      // Guest mode handles progress locally in browser without failing
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

    if (kind === 'swipe') {
      const outcome = body.outcome === 'know' ? 'know' : 'practice';
      const { nextCard, dueAt, reps, lapses } = computeNextFsrs(existing?.fsrsState, outcome);
      const quizCorrect = existing?.quizCorrect ?? 0;
      const quizWrong = existing?.quizWrong ?? 0;
      const mastered =
        outcome === 'practice'
          ? false
          : isCardMastered(reps, quizCorrect, nextCard.stability);

      if (existing) {
        await db
          .update(userCardProgress)
          .set({
            fsrsState: nextCard,
            dueAt,
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
          fsrsState: nextCard,
          dueAt,
          reps,
          lapses,
          quizCorrect,
          quizWrong,
          mastered,
        });
      }

      await touchUserStreak(user.id);
      return NextResponse.json({ ok: true, mastered, dueAt: dueAt.toISOString(), reps });
    }

    if (kind === 'quiz') {
      const correct = Boolean(body.correct);
      const reps = existing?.reps ?? 0;
      const lapses = existing?.lapses ?? 0;
      const quizCorrect = (existing?.quizCorrect ?? 0) + (correct ? 1 : 0);
      const quizWrong = (existing?.quizWrong ?? 0) + (correct ? 0 : 1);
      const mastered = correct ? isCardMastered(Math.max(reps, 1), quizCorrect) : false;

      if (existing) {
        await db
          .update(userCardProgress)
          .set({
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
          dueAt: new Date(),
          reps: correct ? 1 : 0,
          lapses: correct ? 0 : 1,
          quizCorrect,
          quizWrong,
          mastered,
        });
      }

      await touchUserStreak(user.id);
      return NextResponse.json({ ok: true, mastered, quizCorrect, quizWrong });
    }

    return NextResponse.json({ error: 'نوع عملیات نامعتبر است.' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/progress error:', err);
    return NextResponse.json({ error: 'خطا در ثبت پیشرفت' }, { status: 500 });
  }
}
