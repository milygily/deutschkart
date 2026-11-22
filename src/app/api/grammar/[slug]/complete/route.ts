import { NextResponse } from 'next/server';
import { db } from '@/db';
import { grammarTopics, userGrammarProgress } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { awardUserXp, getCurrentUser } from '@/lib/auth';

export async function POST(
  req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const body = await req.json();
    const totalExercises = Math.max(1, Number(body?.totalExercises) || 10);
    const correctFirstTry = Math.max(0, Math.min(totalExercises, Number(body?.correctFirstTry) || 0));
    const accuracy = Math.max(0, Math.min(100, Number(body?.accuracy) || Math.round((correctFirstTry / totalExercises) * 100)));
    const xpReward = 25;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ guest: true, xpEarned: xpReward, accuracy });
    }

    const [topic] = await db
      .select({ id: grammarTopics.id })
      .from(grammarTopics)
      .where(eq(grammarTopics.slug, slug))
      .limit(1);

    if (!topic) {
      return NextResponse.json({ error: 'مبحث گرامری یافت نشد.' }, { status: 404 });
    }

    const existing = await db
      .select()
      .from(userGrammarProgress)
      .where(
        and(
          eq(userGrammarProgress.userId, user.id),
          eq(userGrammarProgress.topicId, topic.id)
        )
      )
      .limit(1);

    const prev = existing[0];
    const nextCompleted = (prev?.completedCount ?? 0) + totalExercises;
    const nextCorrect = (prev?.correctCount ?? 0) + correctFirstTry;
    const nextSessions = (prev?.sessionsCompleted ?? 0) + 1;

    // Mastery ramps naturally: 1 session at 100% -> 60%, 2 strong sessions -> 100%
    const sessionFactor = Math.min(1, nextSessions / 2);
    const lifetimeAcc = nextCompleted > 0 ? Math.round((nextCorrect / nextCompleted) * 100) : accuracy;
    const computedMastery = Math.min(100, Math.round(lifetimeAcc * (0.6 + 0.4 * sessionFactor)));
    const nextMastery = Math.max(prev?.masteryPct ?? 0, computedMastery);

    if (prev) {
      await db
        .update(userGrammarProgress)
        .set({
          completedCount: nextCompleted,
          correctCount: nextCorrect,
          sessionsCompleted: nextSessions,
          masteryPct: nextMastery,
          lastPracticedAt: new Date(),
        })
        .where(eq(userGrammarProgress.id, prev.id));
    } else {
      await db.insert(userGrammarProgress).values({
        userId: user.id,
        topicId: topic.id,
        completedCount: nextCompleted,
        correctCount: nextCorrect,
        sessionsCompleted: nextSessions,
        masteryPct: nextMastery,
      });
    }

    const xpResult = await awardUserXp(user.id, xpReward);

    return NextResponse.json({
      ...(xpResult || { xpEarned: xpReward }),
      progress: {
        completedCount: nextCompleted,
        correctCount: nextCorrect,
        sessionsCompleted: nextSessions,
        masteryPct: nextMastery,
      },
    });
  } catch (err) {
    console.error('POST /api/grammar/[slug]/complete error:', err);
    return NextResponse.json({ error: 'خطا در ثبت پیشرفت گرامر' }, { status: 500 });
  }
}
