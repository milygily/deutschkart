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
        totalXp: users.totalXp,
        dailyXp: users.dailyXp,
        dailyXpDate: users.dailyXpDate,
        dailyGoal: users.dailyGoal,
        streakFreezes: users.streakFreezes,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const today = getTodayDateStr();
    const effectiveDailyXp = row.dailyXpDate === today ? row.dailyXp : 0;

    return {
      ...row,
      dailyXp: effectiveDailyXp,
    };
  } catch {
    return null;
  }
}

export function getTodayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDaysDiff(prevDateStr: string | null, todayStr: string): number | null {
  if (!prevDateStr) return null;
  const prevMs = Date.parse(`${prevDateStr}T00:00:00Z`);
  const todayMs = Date.parse(`${todayStr}T00:00:00Z`);
  if (Number.isNaN(prevMs) || Number.isNaN(todayMs)) return null;
  return Math.round((todayMs - prevMs) / 86400000);
}

export interface XpAwardResult {
  totalXp: number;
  dailyXp: number;
  dailyGoal: number;
  streakCount: number;
  streakFreezes: number;
  xpEarned: number;
  goalJustReached: boolean;
  freezeUsed: boolean;
  freezeEarned: boolean;
}

export async function awardUserXp(userId: number, xpAmount: number): Promise<XpAwardResult | null> {
  const safeXp = Math.max(0, Math.min(200, Math.round(xpAmount)));
  const today = getTodayDateStr();

  const rows = await db
    .select({
      streakCount: users.streakCount,
      lastStudiedDate: users.lastStudiedDate,
      totalXp: users.totalXp,
      dailyXp: users.dailyXp,
      dailyXpDate: users.dailyXpDate,
      dailyGoal: users.dailyGoal,
      streakFreezes: users.streakFreezes,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = rows[0];
  if (!user) return null;

  const prevDailyXp = user.dailyXpDate === today ? user.dailyXp : 0;
  const nextDailyXp = prevDailyXp + safeXp;
  const nextTotalXp = user.totalXp + safeXp;
  const goalJustReached = prevDailyXp < user.dailyGoal && nextDailyXp >= user.dailyGoal;

  let nextStreak = user.streakCount;
  let nextFreezes = user.streakFreezes;
  let freezeUsed = false;
  let freezeEarned = false;

  const diff = getDaysDiff(user.lastStudiedDate, today);
  if (diff === null) {
    nextStreak = 1;
  } else if (diff === 0) {
    nextStreak = Math.max(1, user.streakCount);
  } else if (diff === 1) {
    nextStreak = user.streakCount + 1;
  } else if (diff === 2 && user.streakFreezes > 0) {
    // Auto-use 1 Streak Freeze to protect a 1-day miss!
    nextFreezes = user.streakFreezes - 1;
    nextStreak = user.streakCount + 1;
    freezeUsed = true;
  } else if (diff > 1) {
    nextStreak = 1;
  }

  // Reward 1 free Streak Freeze every 7 consecutive days (cap at 5)
  if (diff !== 0 && nextStreak > 0 && nextStreak % 7 === 0 && nextFreezes < 5) {
    nextFreezes += 1;
    freezeEarned = true;
  }

  await db
    .update(users)
    .set({
      totalXp: nextTotalXp,
      dailyXp: nextDailyXp,
      dailyXpDate: today,
      streakCount: nextStreak,
      lastStudiedDate: today,
      streakFreezes: nextFreezes,
    })
    .where(eq(users.id, userId));

  return {
    totalXp: nextTotalXp,
    dailyXp: nextDailyXp,
    dailyGoal: user.dailyGoal,
    streakCount: nextStreak,
    streakFreezes: nextFreezes,
    xpEarned: safeXp,
    goalJustReached,
    freezeUsed,
    freezeEarned,
  };
}

export async function touchUserStreak(userId: number) {
  await awardUserXp(userId, 2);
}
