import { NextResponse } from 'next/server';
import { db } from '@/db';
import { courseLessons, courseUnits, grammarTopics } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const lessonId = Number(id);
    if (!lessonId || Number.isNaN(lessonId)) {
      return NextResponse.json({ error: 'شناسه درس معتبر نیست.' }, { status: 400 });
    }

    const [lesson] = await db
      .select()
      .from(courseLessons)
      .where(eq(courseLessons.id, lessonId))
      .limit(1);

    if (!lesson) {
      return NextResponse.json({ error: 'درس یافت نشد.' }, { status: 404 });
    }

    const [unit] = await db
      .select({
        id: courseUnits.id,
        slug: courseUnits.slug,
        titleFa: courseUnits.titleFa,
        titleDe: courseUnits.titleDe,
        icon: courseUnits.icon,
        color: courseUnits.color,
      })
      .from(courseUnits)
      .where(eq(courseUnits.id, lesson.unitId))
      .limit(1);

    // If this path lesson is tied to a B1 grammar topic, also send its full 50+ exercise pool
    // so every replay gives fresh non-repeating exercises!
    let grammarPool: unknown[] = [];
    if (lesson.grammarSlug) {
      const [topic] = await db
        .select({ exercises: grammarTopics.exercises })
        .from(grammarTopics)
        .where(eq(grammarTopics.slug, lesson.grammarSlug))
        .limit(1);
      if (topic && Array.isArray(topic.exercises)) {
        grammarPool = topic.exercises;
      }
    }

    return NextResponse.json({
      lesson: {
        id: lesson.id,
        slug: lesson.slug,
        orderIndex: lesson.orderIndex,
        lessonType: lesson.lessonType,
        titleFa: lesson.titleFa,
        titleDe: lesson.titleDe,
        xpReward: lesson.xpReward,
        grammarSlug: lesson.grammarSlug,
        exercises: Array.isArray(lesson.exercises) ? lesson.exercises : [],
        grammarPool,
      },
      unit: unit ?? null,
    });
  } catch (err) {
    console.error('GET /api/learn/lesson/[id] error:', err);
    return NextResponse.json({ error: 'خطا در بارگذاری درس' }, { status: 500 });
  }
}
