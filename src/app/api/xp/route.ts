import { NextResponse } from 'next/server';
import { awardUserXp, getCurrentUser } from '@/lib/auth';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ guest: true, xpEarned: 0 });
  }

  try {
    const body = await req.json();
    const xp = Number(body?.xp);
    if (!Number.isFinite(xp) || xp <= 0) {
      return NextResponse.json({ error: 'مقدار XP معتبر نیست.' }, { status: 400 });
    }

    const result = await awardUserXp(user.id, xp);
    if (!result) {
      return NextResponse.json({ error: 'کاربر یافت نشد.' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'خطا در ثبت امتیاز.' }, { status: 500 });
  }
}
