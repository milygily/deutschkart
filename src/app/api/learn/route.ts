import { NextResponse } from 'next/server';
import { db } from '@/db';
import {
  courseUnits,
  courseLessons,
  userLessonProgress,
  decks,
  grammarTopics,
} from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();

    const [units, lessons, systemDecks, gTopics] = await Promise.all([
      db.select().from(courseUnits).orderBy(asc(courseUnits.orderIndex)),
      db.select().from(courseLessons).orderBy(asc(courseLessons.orderIndex)),
      db.select({ id: decks.id, slug: decks.slug, title: decks.title }).from(decks).where(eq(decks.isSystem, true)),
      db
        .select({
          slug: grammarTopics.slug,
          titleDe: grammarTopics.titleDe,
          titleFa: grammarTopics.titleFa,
          icon: grammarTopics.icon,
        })
        .from(grammarTopics),
    ]);

    const deckIdBySlug = new Map(systemDecks.filter((d) => d.slug).map((d) => [d.slug!, d.id]));
    const grammarMetaBySlug = new Map(gTopics.map((g) => [g.slug, g]));

    const lessonProgressMap = new Map<number, { completedCount: number; bestAccuracy: number }>();
    if (user) {
      const progRows = await db
        .select()
        .from(userLessonProgress)
        .where(eq(userLessonProgress.userId, user.id));
      for (const p of progRows) {
        lessonProgressMap.set(p.lessonId, {
          completedCount: p.completedCount,
          bestAccuracy: p.bestAccuracy,
        });
      }
    }

    const lessonsByUnit = new Map<number, typeof lessons>();
    for (const les of lessons) {
      const arr = lessonsByUnit.get(les.unitId) || [];
      arr.push(les);
      lessonsByUnit.set(les.unitId, arr);
    }

    let firstIncompleteFound = false;
    let totalLessons = 0;
    let completedLessons = 0;

    const formattedUnits = units.map((u) => {
      const unitLessons = (lessonsByUnit.get(u.id) || []).map((les) => {
        const prog = lessonProgressMap.get(les.id);
        const isCompleted = Boolean(prog && prog.completedCount > 0);
        totalLessons += 1;
        if (isCompleted) completedLessons += 1;

        let isCurrent = false;
        if (!isCompleted && !firstIncompleteFound) {
          isCurrent = true;
          firstIncompleteFound = true;
        }

        const exCount = Array.isArray(les.exercises) ? les.exercises.length : 0;

        return {
          id: les.id,
          slug: les.slug,
          orderIndex: les.orderIndex,
          lessonType: les.lessonType,
          titleFa: les.titleFa,
          titleDe: les.titleDe,
          xpReward: les.xpReward,
          grammarSlug: les.grammarSlug,
          exerciseCount: exCount,
          completed: isCompleted,
          completedCount: prog?.completedCount ?? 0,
          bestAccuracy: prog?.bestAccuracy ?? 0,
          isCurrent,
        };
      });

      const gSlugs = Array.isArray(u.grammarSlugs) ? (u.grammarSlugs as string[]) : [];
      const linkedGrammars = gSlugs
        .map((s) => grammarMetaBySlug.get(s))
        .filter((g): g is NonNullable<typeof g> => Boolean(g));

      return {
        id: u.id,
        slug: u.slug,
        level: u.level,
        orderIndex: u.orderIndex,
        titleDe: u.titleDe,
        titleFa: u.titleFa,
        descriptionFa: u.descriptionFa,
        icon: u.icon,
        color: u.color,
        linkedDeckId: u.linkedDeckSlug ? deckIdBySlug.get(u.linkedDeckSlug) ?? null : null,
        linkedGrammars,
        guidebookFa: u.guidebookFa,
        lessons: unitLessons,
      };
    });

    return NextResponse.json({
      units: formattedUnits,
      summary: { totalLessons, completedLessons },
    });
  } catch (err) {
    console.error('GET /api/learn error:', err);
    return NextResponse.json({ error: 'خطا در دریافت مسیر یادگیری' }, { status: 500 });
  }
}
