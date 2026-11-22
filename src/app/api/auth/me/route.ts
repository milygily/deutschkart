import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'ابتدا وارد حساب کاربری شوید.' }, { status: 401 });
  }

  const body = await req.json();
  const updates: { showEnglish?: boolean; name?: string } = {};

  if (typeof body.showEnglish === 'boolean') {
    updates.showEnglish = body.showEnglish;
  }
  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim();
  }

  if (Object.keys(updates).length > 0) {
    await db.update(users).set(updates).where(eq(users.id, user.id));
  }

  const fresh = await getCurrentUser();
  return NextResponse.json({ user: fresh });
}
