import { NextResponse } from 'next/server';
import { db } from '@/db';
import { grammarTopics } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateMoreGrammarExercises } from '@/lib/grammar-ai';
import type { Exercise } from '@/lib/exercises';

export const maxDuration = 60;

export async function POST(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const [topic] = await db
      .select()
      .from(grammarTopics)
      .where(eq(grammarTopics.slug, slug))
      .limit(1);

    if (!topic) {
      return NextResponse.json({ error: 'مبحث گرامری یافت نشد.' }, { status: 404 });
    }

    const existingExercises: Exercise[] = Array.isArray(topic.exercises)
      ? (topic.exercises as Exercise[])
      : [];

    const existingSamples = existingExercises.map((ex) => {
      if (ex.type === 'grammar-cloze') return ex.fullSentenceDe || `${ex.sentenceBefore}${ex.answer}${ex.sentenceAfter}`;
      if (ex.type === 'word-bank') return ex.targetDe;
      if (ex.type === 'listening') return ex.audioDe;
      if (ex.type === 'typing') return `${ex.sentenceBefore || ''}${ex.answerDe}${ex.sentenceAfter || ''}`;
      if (ex.type === 'speaking') return ex.targetDe;
      return '';
    }).filter(Boolean);

    const freshExercises = await generateMoreGrammarExercises({
      slug: topic.slug,
      titleDe: topic.titleDe,
      titleFa: topic.titleFa,
      summaryFa: topic.summaryFa,
      existingSamples,
      count: 10,
    });

    // Cap stored pool at 300 exercises per topic so the bank can grow deeply without bloat
    const merged = [...existingExercises, ...freshExercises].slice(-300);

    await db
      .update(grammarTopics)
      .set({ exercises: merged })
      .where(eq(grammarTopics.id, topic.id));

    return NextResponse.json({
      newExercises: freshExercises,
      totalExercises: merged.length,
    });
  } catch (err) {
    console.error('POST /api/grammar/[slug]/more error:', err);
    return NextResponse.json(
      { error: 'سرویس هوش مصنوعی لحظه‌ای شلوغ بود. چند ثانیه دیگر دوباره امتحان کن.' },
      { status: 503 }
    );
  }
}
