import { NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { db } from '@/db';
import { germanIdioms } from '@/db/schema';

export async function GET() {
  try {
    const items = await db
      .select()
      .from(germanIdioms)
      .orderBy(asc(germanIdioms.orderIndex), asc(germanIdioms.id));
    return NextResponse.json({ idioms: items });
  } catch (err) {
    console.error('GET /api/idioms error:', err);
    return NextResponse.json({ error: 'خطا در دریافت اصطلاحات' }, { status: 500 });
  }
}
