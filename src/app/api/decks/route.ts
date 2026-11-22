import { NextResponse } from 'next/server';
import { db } from '@/db';
import { decks, deckCards, globalWords, userCardProgress } from '@/db/schema';
import { eq, or, asc, inArray } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { normalizeGermanWord, type GeneratedWordCard } from '@/lib/gemini';
import { getStageFromBox, isCardDue } from '@/lib/leitner';

export async function GET() {
  try {
    const user = await getCurrentUser();

    const deckRows = await db
      .select()
      .from(decks)
      .where(
        user
          ? or(eq(decks.isSystem, true), eq(decks.userId, user.id))
          : eq(decks.isSystem, true)
      )
      .orderBy(asc(decks.id));

    if (deckRows.length === 0) {
      return NextResponse.json({ decks: [] });
    }

    const deckIds = deckRows.map((d) => d.id);
    const links = await db
      .select({
        deckId: deckCards.deckId,
        wordId: deckCards.wordId,
        article: globalWords.article,
      })
      .from(deckCards)
      .innerJoin(globalWords, eq(deckCards.wordId, globalWords.id))
      .where(inArray(deckCards.deckId, deckIds));

    const progMap = new Map<number, { leitnerBox: number; dueAt: Date; mastered: boolean }>();
    if (user) {
      const prog = await db
        .select({
          wordId: userCardProgress.wordId,
          leitnerBox: userCardProgress.leitnerBox,
          dueAt: userCardProgress.dueAt,
          mastered: userCardProgress.mastered,
        })
        .from(userCardProgress)
        .where(eq(userCardProgress.userId, user.id));
      for (const p of prog) {
        progMap.set(p.wordId, p);
      }
    }

    const summaries = deckRows.map((d) => {
      const cardsInDeck = links.filter((l) => l.deckId === d.id);
      const stageCounts = { new: 0, learning: 0, familiar: 0, learned: 0, mastered: 0 };
      let dueCount = 0;

      for (const c of cardsInDeck) {
        const p = progMap.get(c.wordId);
        const box = p?.leitnerBox ?? 0;
        const stage = getStageFromBox(box);
        stageCounts[stage]++;
        if (isCardDue(box, p?.dueAt)) {
          dueCount++;
        }
      }

      return {
        id: d.id,
        slug: d.slug,
        title: d.title,
        titleDe: d.titleDe,
        description: d.description,
        level: d.level,
        icon: d.icon,
        color: d.color,
        isSystem: d.isSystem,
        cardCount: cardsInDeck.length,
        nounCount: cardsInDeck.filter(
          (c) => c.article === 'der' || c.article === 'die' || c.article === 'das'
        ).length,
        masteredCount: stageCounts.learned + stageCounts.mastered,
        dueCount,
        stageCounts,
      };
    });

    return NextResponse.json({ decks: summaries });
  } catch (err) {
    console.error('GET /api/decks error:', err);
    return NextResponse.json({ error: 'خطا در دریافت دسته‌ها' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'برای ذخیره دسته شخصی ابتدا وارد حساب کاربری شوید.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const title = String(body.title || '').trim();
    const description = String(body.description || '').trim();
    const level = ['A1', 'A2', 'B1', 'B2', 'CUSTOM'].includes(body.level) ? body.level : 'CUSTOM';
    const icon = String(body.icon || '✨').slice(0, 4);
    const color = ['emerald', 'sky', 'violet', 'amber', 'rose'].includes(body.color)
      ? body.color
      : 'violet';
    const cards: GeneratedWordCard[] = Array.isArray(body.cards) ? body.cards : [];

    if (!title) {
      return NextResponse.json({ error: 'لطفاً یک عنوان برای دسته بنویسید.' }, { status: 400 });
    }
    if (cards.length === 0) {
      return NextResponse.json({ error: 'حداقل یک کلمه برای ساخت دسته لازم است.' }, { status: 400 });
    }

    const [createdDeck] = await db
      .insert(decks)
      .values({
        title,
        titleDe: body.titleDe ? String(body.titleDe).trim() : '',
        description,
        level,
        icon,
        color,
        isSystem: false,
        userId: user.id,
      })
      .returning();

    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (!c.word || !c.persianMeaning) continue;

      const normalized = normalizeGermanWord(c.word);
      if (!normalized) continue;

      const existing = await db
        .select({ id: globalWords.id })
        .from(globalWords)
        .where(eq(globalWords.normalizedWord, normalized))
        .limit(1);

      let wordId: number;
      if (existing.length > 0) {
        wordId = existing[0].id;
      } else {
        const [inserted] = await db
          .insert(globalWords)
          .values({
            normalizedWord: normalized,
            word: c.word.trim(),
            article: c.article ?? null,
            plural: c.plural ?? null,
            partOfSpeech: c.partOfSpeech || (c.article ? 'noun' : 'phrase'),
            verbForms: c.verbForms ?? null,
            persianMeaning: c.persianMeaning.trim(),
            englishMeaning: (c.englishMeaning || '').trim(),
            exampleDe: (c.exampleDe || '').trim(),
            exampleFa: (c.exampleFa || '').trim(),
            level: c.level ?? null,
          })
          .returning({ id: globalWords.id });
        wordId = inserted.id;
      }

      await db
        .insert(deckCards)
        .values({
          deckId: createdDeck.id,
          wordId,
          position: i,
        })
        .onConflictDoNothing();
    }

    return NextResponse.json({ deck: createdDeck }, { status: 201 });
  } catch (err) {
    console.error('POST /api/decks error:', err);
    return NextResponse.json({ error: 'خطا در ذخیره دسته' }, { status: 500 });
  }
}
