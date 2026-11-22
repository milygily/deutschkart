import { NextResponse } from 'next/server';
import { db } from '@/db';
import { decks, deckCards } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; cardId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'وارد حساب کاربری شوید.' }, { status: 401 });
    }

    const { id, cardId } = await context.params;
    const deckId = Number(id);
    const deckCardId = Number(cardId);

    const deckRows = await db.select().from(decks).where(eq(decks.id, deckId)).limit(1);
    const deck = deckRows[0];
    if (!deck || deck.isSystem || deck.userId !== user.id) {
      return NextResponse.json({ error: 'امکان ویرایش کارت در این دسته وجود ندارد.' }, { status: 403 });
    }

    const body = await req.json();
    const updates: Partial<typeof deckCards.$inferInsert> = {};

    if (typeof body.word === 'string' && body.word.trim()) {
      updates.customWord = body.word.trim().replace(/^(der|die|das)\s+/i, '');
    }
    if ('article' in body) {
      updates.customArticle =
        body.article === 'der' || body.article === 'die' || body.article === 'das'
          ? body.article
          : 'NONE';
    }
    if (typeof body.plural === 'string') {
      updates.customPlural = body.plural.trim();
    }
    if (typeof body.verbForms === 'string') {
      updates.customVerbForms = body.verbForms.trim();
    }
    if (typeof body.persianMeaning === 'string' && body.persianMeaning.trim()) {
      updates.customPersianMeaning = body.persianMeaning.trim();
    }
    if (typeof body.englishMeaning === 'string') {
      updates.customEnglishMeaning = body.englishMeaning.trim();
    }
    if (typeof body.exampleDe === 'string') {
      updates.customExampleDe = body.exampleDe.trim();
    }
    if (typeof body.exampleFa === 'string') {
      updates.customExampleFa = body.exampleFa.trim();
    }

    const updated = await db
      .update(deckCards)
      .set(updates)
      .where(and(eq(deckCards.id, deckCardId), eq(deckCards.deckId, deckId)))
      .returning({ id: deckCards.id });

    if (updated.length === 0) {
      return NextResponse.json({ error: 'کارت پیدا نشد.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/decks/[id]/cards/[cardId] error:', err);
    return NextResponse.json({ error: 'خطا در ویرایش کارت' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; cardId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'وارد حساب کاربری شوید.' }, { status: 401 });
    }

    const { id, cardId } = await context.params;
    const deckId = Number(id);
    const deckCardId = Number(cardId);

    const deckRows = await db.select().from(decks).where(eq(decks.id, deckId)).limit(1);
    const deck = deckRows[0];
    if (!deck || deck.isSystem || deck.userId !== user.id) {
      return NextResponse.json({ error: 'امکان حذف کارت در این دسته وجود ندارد.' }, { status: 403 });
    }

    await db
      .delete(deckCards)
      .where(and(eq(deckCards.id, deckCardId), eq(deckCards.deckId, deckId)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/decks/[id]/cards/[cardId] error:', err);
    return NextResponse.json({ error: 'خطا در حذف کارت' }, { status: 500 });
  }
}
