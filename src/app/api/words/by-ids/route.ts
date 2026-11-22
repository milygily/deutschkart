import { NextResponse } from 'next/server';
import { db } from '@/db';
import { globalWords } from '@/db/schema';
import { inArray } from 'drizzle-orm';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ids: number[] = Array.isArray(body.ids)
      ? body.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ cards: [] });
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
      .from(globalWords)
      .where(inArray(globalWords.id, ids.slice(0, 200)));

    return NextResponse.json({
      cards: rows.map((r) => ({ ...r, starred: true, progress: null })),
    });
  } catch (err) {
    console.error('POST /api/words/by-ids error:', err);
    return NextResponse.json({ error: 'خطا در دریافت کلمات' }, { status: 500 });
  }
}
