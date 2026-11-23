import { NextResponse } from 'next/server';
import { db } from '@/db';
import { globalWords } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { GoogleGenAI } from '@google/genai';
import { normalizeGermanWord } from '@/lib/gemini';

export const maxDuration = 30;

const FAST_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3-flash-preview',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
];

// Fast in-memory server cache (word::sentence -> result)
const lookupCache = new Map<
  string,
  { persianMeaning: string; baseForm: string | null; article: string | null }
>();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawWord = String(body.word || '').trim();
    const sentence = String(body.sentence || '').trim();

    const cleanWord = rawWord.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    if (!cleanWord) {
      return NextResponse.json({ error: 'کلمه نامعتبر است' }, { status: 400 });
    }

    const cacheKey = `${cleanWord.toLowerCase()}::${sentence.slice(0, 120)}`;
    const cached = lookupCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // 1. Check Neon global_words first for exact match (instant & free!)
    const normalized = normalizeGermanWord(cleanWord);
    const dbMatch = await db
      .select({
        word: globalWords.word,
        article: globalWords.article,
        persianMeaning: globalWords.persianMeaning,
      })
      .from(globalWords)
      .where(eq(globalWords.normalizedWord, normalized))
      .limit(1);

    if (dbMatch.length > 0) {
      const result = {
        persianMeaning: dbMatch[0].persianMeaning,
        baseForm: dbMatch[0].article
          ? `${dbMatch[0].article} ${dbMatch[0].word}`
          : dbMatch[0].word,
        article: dbMatch[0].article,
      };
      lookupCache.set(cacheKey, result);
      return NextResponse.json(result);
    }

    // 2. Fast contextual lookup via Gemini Flash (thinking disabled for ~0.5s response)
    const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '').trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY missing' }, { status: 500 });
    }
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Translate ONLY the single German word "${cleanWord}" as used in this sentence: "${sentence}" into concise natural Persian (Farsi).
Return ONLY valid JSON:
{"persianMeaning":"short Persian meaning (1-4 words)","baseForm":"dictionary form if conjugated/declined, e.g. 'der Chef' or 'warten' (or null if same)","article":"der"|"die"|"das"|null}`;

    let lastErr: unknown = null;
    for (const model of FAST_MODELS) {
      try {
        let response;
        try {
          response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.1,
              thinkingConfig: { thinkingBudget: 0 },
            },
          });
        } catch (innerErr) {
          const msg = innerErr instanceof Error ? innerErr.message : '';
          const status = (innerErr as { status?: number })?.status;
          if (status === 400 || /INVALID_ARGUMENT|thinking/i.test(msg)) {
            response = await ai.models.generateContent({
              model,
              contents: prompt,
              config: {
                responseMimeType: 'application/json',
                temperature: 0.1,
              },
            });
          } else {
            throw innerErr;
          }
        }

        const text = (response.text || '{}')
          .replace(/^```json\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();
        const parsed = JSON.parse(text);
        const result = {
          persianMeaning: String(parsed.persianMeaning || '').trim() || 'معنی یافت نشد',
          baseForm: parsed.baseForm ? String(parsed.baseForm).trim() : null,
          article:
            parsed.article === 'der' || parsed.article === 'die' || parsed.article === 'das'
              ? parsed.article
              : null,
        };
        lookupCache.set(cacheKey, result);
        return NextResponse.json(result);
      } catch (err) {
        lastErr = err;
      }
    }

    throw lastErr || new Error('Lookup failed');
  } catch (err) {
    console.error('POST /api/ai/word-lookup error:', err);
    return NextResponse.json({ error: 'خطا در ترجمه کلمه' }, { status: 500 });
  }
}
