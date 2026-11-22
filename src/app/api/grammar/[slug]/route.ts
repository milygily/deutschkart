import { NextResponse } from 'next/server';
import { db } from '@/db';
import { grammarTopics, userGrammarProgress } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const rows = await db
      .select()
      .from(grammarTopics)
      .where(eq(grammarTopics.slug, slug))
      .limit(1);

    const topic = rows[0];
    if (!topic) {
      return NextResponse.json({ error: 'مبحث گرامری یافت نشد.' }, { status: 404 });
    }

    const user = await getCurrentUser();
    let progress = {
      completedCount: 0,
      correctCount: 0,
      sessionsCompleted: 0,
      masteryPct: 0,
    };

    if (user) {
      const progRows = await db
        .select()
        .from(userGrammarProgress)
        .where(
          and(
            eq(userGrammarProgress.userId, user.id),
            eq(userGrammarProgress.topicId, topic.id)
          )
        )
        .limit(1);
      if (progRows[0]) {
        progress = {
          completedCount: progRows[0].completedCount,
          correctCount: progRows[0].correctCount,
          sessionsCompleted: progRows[0].sessionsCompleted,
          masteryPct: progRows[0].masteryPct,
        };
      }
    }

    return NextResponse.json({
      topic: {
        id: topic.id,
        slug: topic.slug,
        level: topic.level,
        category: topic.category,
        categoryFa: topic.categoryFa,
        orderIndex: topic.orderIndex,
        titleDe: topic.titleDe,
        titleFa: topic.titleFa,
        summaryFa: topic.summaryFa,
        icon: topic.icon,
        color: topic.color,
        lessonContent: topic.lessonContent,
        exercises: Array.isArray(topic.exercises) ? topic.exercises : [],
      },
      progress,
    });
  } catch (err) {
    console.error('GET /api/grammar/[slug] error:', err);
    return NextResponse.json({ error: 'خطا در دریافت مبحث گرامری' }, { status: 500 });
  }
}
