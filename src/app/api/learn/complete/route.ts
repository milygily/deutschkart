import { NextResponse } from 'next/server';
import { db } from '@/db';
import { courseLessons, userLessonProgress } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { awardUserXp, getCurrentUser } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const lessonId = Number(body?.lessonId);
    const accuracy = Math.max(0, Math.min(100, Number(body?.accuracy) || 0));

    if (!lessonId || Number.isNaN(lessonId)) {
      return NextResponse.json({ error: 'شناسه درس نامعتبر است.' }, { status: 400 });
    }

    const [lesson] = await db
      .select({ id: courseLessons.id, xpReward: courseLessons.xpReward })
      .from(courseLessons)
      .where(eq(courseLessons.id, lessonId))
      .limit(1);

    if (!lesson) {
      return NextResponse.json({ error: 'درس یافت نشد.' }, { status: 404 });
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ guest: true, xpEarned: lesson.xpReward, accuracy });
    }

    const existing = await db
      .select()
      .from(userLessonProgress)
      .where(
        and(
          eq(userLessonProgress.userId, user.id),
          eq(userLessonProgress.lessonId, lesson.id)
        )
      )
      .limit(1);

    const prev = existing[0];
    if (prev) {
      await db
        .update(userLessonProgress)
        .set({
          completedCount: prev.completedCount + 1,
          bestAccuracy: Math.max(prev.bestAccuracy, accuracy),
          completedAt: new Date(),
        })
        .where(eq(userLessonProgress.id, prev.id));
    } else {
      await db.insert(userLessonProgress).values({
        userId: user.id,
        lessonId: lesson.id,
        completedCount: 1,
        bestAccuracy: accuracy,
      });
    }

    const xpResult = await awardUserXp(user.id, lesson.xpReward);
    return NextResponse.json(xpResult || { xpEarned: lesson.xpReward });
  } catch (err) {
    console.error('POST /api/learn/complete error:', err);
    return NextResponse.json({ error: 'خطا در ثبت تکمیل درس' }, { status: 500 });
  }
}
