import { NextResponse } from 'next/server';
import { db } from '@/db';
import { grammarTopics, userGrammarProgress } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    const topics = await db
      .select({
        id: grammarTopics.id,
        slug: grammarTopics.slug,
        level: grammarTopics.level,
        category: grammarTopics.category,
        categoryFa: grammarTopics.categoryFa,
        orderIndex: grammarTopics.orderIndex,
        titleDe: grammarTopics.titleDe,
        titleFa: grammarTopics.titleFa,
        summaryFa: grammarTopics.summaryFa,
        icon: grammarTopics.icon,
        color: grammarTopics.color,
        exercises: grammarTopics.exercises,
      })
      .from(grammarTopics)
      .orderBy(asc(grammarTopics.orderIndex));

    const progressMap = new Map<
      number,
      { completedCount: number; correctCount: number; sessionsCompleted: number; masteryPct: number }
    >();

    if (user) {
      const progRows = await db
        .select()
        .from(userGrammarProgress)
        .where(eq(userGrammarProgress.userId, user.id));
      for (const p of progRows) {
        progressMap.set(p.topicId, {
          completedCount: p.completedCount,
          correctCount: p.correctCount,
          sessionsCompleted: p.sessionsCompleted,
          masteryPct: p.masteryPct,
        });
      }
    }

    const items = topics.map((t) => {
      const exList = Array.isArray(t.exercises) ? t.exercises : [];
      return {
        id: t.id,
        slug: t.slug,
        level: t.level,
        category: t.category,
        categoryFa: t.categoryFa,
        orderIndex: t.orderIndex,
        titleDe: t.titleDe,
        titleFa: t.titleFa,
        summaryFa: t.summaryFa,
        icon: t.icon,
        color: t.color,
        exerciseCount: exList.length,
        progress: progressMap.get(t.id) ?? {
          completedCount: 0,
          correctCount: 0,
          sessionsCompleted: 0,
          masteryPct: 0,
        },
      };
    });

    return NextResponse.json({ topics: items });
  } catch (err) {
    console.error('GET /api/grammar error:', err);
    return NextResponse.json({ error: 'خطا در دریافت لیست گرامرها' }, { status: 500 });
  }
}
