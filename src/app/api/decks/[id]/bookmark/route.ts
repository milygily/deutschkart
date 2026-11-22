import { NextResponse } from 'next/server';
import { db } from '@/db';
import { userDeckBookmarks } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const deckId = Number(id);
    if (!deckId || Number.isNaN(deckId)) {
      return NextResponse.json({ lastIndex: 0 });
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ lastIndex: 0, guest: true });
    }

    const rows = await db
      .select({ lastIndex: userDeckBookmarks.lastIndex })
      .from(userDeckBookmarks)
      .where(and(eq(userDeckBookmarks.userId, user.id), eq(userDeckBookmarks.deckId, deckId)))
      .limit(1);

    return NextResponse.json({ lastIndex: rows[0]?.lastIndex ?? 0 });
  } catch (err) {
    console.error('GET bookmark error:', err);
    return NextResponse.json({ lastIndex: 0 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const deckId = Number(id);
    const body = await req.json();
    const lastIndex = Math.max(0, Math.floor(Number(body.lastIndex) || 0));

    if (!deckId || Number.isNaN(deckId)) {
      return NextResponse.json({ error: 'deckId نامعتبر است.' }, { status: 400 });
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: true, guest: true, lastIndex });
    }

    const existing = await db
      .select({ id: userDeckBookmarks.id })
      .from(userDeckBookmarks)
      .where(and(eq(userDeckBookmarks.userId, user.id), eq(userDeckBookmarks.deckId, deckId)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(userDeckBookmarks)
        .set({ lastIndex, updatedAt: new Date() })
        .where(eq(userDeckBookmarks.id, existing[0].id));
    } else {
      await db.insert(userDeckBookmarks).values({
        userId: user.id,
        deckId,
        lastIndex,
      });
    }

    return NextResponse.json({ ok: true, lastIndex });
  } catch (err) {
    console.error('POST bookmark error:', err);
    return NextResponse.json({ error: 'خطا در ذخیره موقعیت مرور' }, { status: 500 });
  }
}
