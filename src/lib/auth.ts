import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

const COOKIE_NAME = 'deutschkart_session';

function getJwtSecret(): Uint8Array {
  const raw =
    process.env.AUTH_SECRET ||
    crypto
      .createHash('sha256')
      .update(`deutschkart-jwt-${process.env.DATABASE_URL || 'local-dev'}`)
      .digest('hex');
  return new TextEncoder().encode(raw);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: number) {
  const token = await new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getJwtSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getJwtSecret());
    const userId = Number(payload.sub);
    if (!userId || Number.isNaN(userId)) return null;

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        showEnglish: users.showEnglish,
        streakCount: users.streakCount,
        lastStudiedDate: users.lastStudiedDate,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function touchUserStreak(userId: number) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      streakCount: users.streakCount,
      lastStudiedDate: users.lastStudiedDate,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = rows[0];
  if (!user) return;
  if (user.lastStudiedDate === today) return;

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const nextStreak = user.lastStudiedDate === yesterday ? user.streakCount + 1 : 1;

  await db
    .update(users)
    .set({
      streakCount: nextStreak,
      lastStudiedDate: today,
    })
    .where(eq(users.id, userId));
}
