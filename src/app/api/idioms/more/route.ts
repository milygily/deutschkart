import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { db } from '@/db';
import { germanIdioms } from '@/db/schema';

export const maxDuration = 45;

const MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.5-flash'];

const CATEGORY_MAP: Record<string, string> = {
  sprichwoerter: 'ضرب‌المثل‌های طلایی',
  tiere_essen: 'حیوانات و خوراکی‌ها 🐱🥨',
  alltag: 'اصطلاحات روزمره و فان',
  arbeit: 'محیط کار و حرفه‌ای 💼',
  gefuehle: 'احساسات و واکنش‌ها 🎭',
};

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const requestedCategory =
      typeof body?.category === 'string' && CATEGORY_MAP[body.category] ? body.category : null;

    const existing = await db
      .select({ expressionDe: germanIdioms.expressionDe, orderIndex: germanIdioms.orderIndex })
      .from(germanIdioms);

    const existingSet = new Set(existing.map((e) => e.expressionDe.toLowerCase().trim()));
    const maxOrder = existing.reduce((m, e) => Math.max(m, e.orderIndex), 0);

    const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '').trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY missing' }, { status: 500 });
    }
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are a witty German-to-Persian coach adding 8 MORE authentic, genuinely used German proverbs (Sprichwörter) and everyday idioms (Redewendungen / Ausdrücke) for Persian speakers in Germany.
${requestedCategory ? `Focus specifically on category "${requestedCategory}" (${CATEGORY_MAP[requestedCategory]}).` : 'Mix across categories: sprichwoerter, tiere_essen, alltag, arbeit, gefuehle.'}

Do NOT repeat any of these existing expressions:
${existing.slice(-60).map((e) => `- ${e.expressionDe}`).join('\n')}

Return ONLY a valid JSON array (no markdown fences) of 8 objects:
[
  {
    "category": "sprichwoerter" | "tiere_essen" | "alltag" | "arbeit" | "gefuehle",
    "level": "B1" | "B2",
    "icon": "1 fun emoji",
    "expressionDe": "Authentic German idiom or proverb",
    "literalFa": "ترجمه تحت‌اللفظی بامزه و دقیق به فارسی",
    "persianEquivalent": "معادل ضرب‌المثل یا اصطلاح کاملاً طبیعی فارسی",
    "meaningFa": "توضیح روان و شفاف فارسی",
    "whenToUseFa": "نکته کاربردی (رسمی یا محاوره‌ای و کجا استفاده کنی)",
    "exampleDe": "Natural everyday German sentence using this expression",
    "exampleFa": "ترجمه فارسی طبیعی مثال"
  }
]`;

    let parsed: unknown[] | null = null;
    let lastErr: unknown = null;

    for (const model of MODELS) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 32000);
      try {
        let res;
        try {
          res = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.6,
              thinkingConfig: { thinkingBudget: 0 },
              abortSignal: ac.signal,
            },
          });
        } catch (inner) {
          const msg = inner instanceof Error ? inner.message : '';
          const status = (inner as { status?: number })?.status;
          if (status === 400 || /INVALID_ARGUMENT|thinking/i.test(msg)) {
            res = await ai.models.generateContent({
              model,
              contents: prompt,
              config: {
                responseMimeType: 'application/json',
                temperature: 0.6,
                abortSignal: ac.signal,
              },
            });
          } else {
            throw inner;
          }
        }
        clearTimeout(timer);
        const raw = (res.text || '[]').trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length >= 3) {
          parsed = arr;
          break;
        }
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
      }
    }

    if (!parsed) {
      throw lastErr || new Error('Failed to generate idioms');
    }

    const inserted = [];
    let offset = 1;
    for (const rawItem of parsed) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const it = rawItem as any;
      const expr = String(it.expressionDe || '').trim();
      const eqFa = String(it.persianEquivalent || '').trim();
      if (!expr || !eqFa || existingSet.has(expr.toLowerCase())) continue;

      const slug = slugify(expr);
      if (!slug) continue;
      existingSet.add(expr.toLowerCase());

      const catKey =
        requestedCategory ||
        (typeof it.category === 'string' && CATEGORY_MAP[it.category] ? it.category : 'alltag');

      const [row] = await db
        .insert(germanIdioms)
        .values({
          slug,
          category: catKey,
          categoryFa: CATEGORY_MAP[catKey],
          level: it.level === 'B2' ? 'B2' : 'B1',
          icon: String(it.icon || '✨').slice(0, 4),
          expressionDe: expr,
          literalFa: String(it.literalFa || '').trim(),
          persianEquivalent: eqFa,
          meaningFa: String(it.meaningFa || '').trim(),
          whenToUseFa: String(it.whenToUseFa || '').trim(),
          exampleDe: String(it.exampleDe || '').trim(),
          exampleFa: String(it.exampleFa || '').trim(),
          orderIndex: maxOrder + offset++,
        })
        .onConflictDoNothing()
        .returning();

      if (row) inserted.push(row);
    }

    return NextResponse.json({ newIdioms: inserted, count: inserted.length });
  } catch (err) {
    console.error('POST /api/idioms/more error:', err);
    return NextResponse.json(
      { error: 'سرویس هوش مصنوعی لحظه‌ای شلوغ بود؛ چند ثانیه دیگر دوباره بزن.' },
      { status: 503 }
    );
  }
}
