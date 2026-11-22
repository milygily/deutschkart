import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createSession, hashPassword } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim() || email.split('@')[0];

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'لطفاً یک ایمیل معتبر وارد کنید.' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' }, { status: 400 });
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ error: 'این ایمیل قبلاً ثبت‌نام شده است.' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const [created] = await db
      .insert(users)
      .values({ email, passwordHash, name })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        showEnglish: users.showEnglish,
        streakCount: users.streakCount,
        lastStudiedDate: users.lastStudiedDate,
      });

    await createSession(created.id);
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (err) {
    console.error('Register error:', err);
    return NextResponse.json({ error: 'خطا در ثبت‌نام. دوباره تلاش کنید.' }, { status: 500 });
  }
}
