import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { computeSpeechSimilarity } from '@/lib/exercises';

export const maxDuration = 30;

const AUDIO_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3-flash-preview',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
];

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('audio');
    const targetDe = String(formData.get('targetDe') || '').trim();

    if (!(file instanceof Blob) || file.size < 200 || !targetDe) {
      return NextResponse.json(
        { error: 'صدایی ضبط نشد؛ کمی بلندتر و واضح‌تر دوباره امتحان کن.' },
        { status: 400 }
      );
    }

    if (file.size > 2_500_000) {
      return NextResponse.json(
        { error: 'فایل صوتی خیلی طولانی است. لطفاً جمله را کوتاه‌تر ضبط کن.' },
        { status: 413 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '').trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY missing' }, { status: 500 });
    }

    const arrayBuf = await file.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuf).toString('base64');
    // Normalize mime type cleanly for Gemini (iOS uses audio/mp4, Chrome uses audio/webm)
    const rawMime = (file.type || 'audio/webm').split(';')[0].trim();
    const mimeType = rawMime.startsWith('audio/') ? rawMime : 'audio/webm';

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are a friendly German pronunciation coach for Persian speakers.
Listen to this short German audio recording. The learner was trying to say:
"${targetDe}"

Return ONLY a valid JSON object (no markdown fences):
{
  "transcript": "Exact German words you actually heard (empty string if silent/unintelligible)",
  "passed": true or false (true if the learner said the sentence understandably, even with a slight accent or 1 minor slip),
  "feedbackFa": "One short, encouraging Persian sentence (if passed: praise them; if false: gently say which word to pronounce clearer)"
}`;

    let lastErr: unknown = null;
    for (const model of AUDIO_MODELS) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 16000);
      try {
        let res;
        try {
          res = await ai.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType, data: base64Audio } },
                ],
              },
            ],
            config: {
              responseMimeType: 'application/json',
              temperature: 0.1,
              thinkingConfig: { thinkingBudget: 0 },
              abortSignal: ac.signal,
            },
          });
        } catch (innerErr) {
          const msg = innerErr instanceof Error ? innerErr.message : '';
          const status = (innerErr as { status?: number })?.status;
          if (status === 400 || /INVALID_ARGUMENT|thinking/i.test(msg)) {
            res = await ai.models.generateContent({
              model,
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: prompt },
                    { inlineData: { mimeType, data: base64Audio } },
                  ],
                },
              ],
              config: {
                responseMimeType: 'application/json',
                temperature: 0.1,
                abortSignal: ac.signal,
              },
            });
          } else {
            throw innerErr;
          }
        }
        clearTimeout(timer);
        const text = (res.text || '{}').trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(text);
        const transcript = typeof parsed.transcript === 'string' ? parsed.transcript.trim() : '';
        const sim = computeSpeechSimilarity(transcript, targetDe);
        const passed = Boolean(parsed.passed) || sim >= 0.65;
        const feedbackFa =
          typeof parsed.feedbackFa === 'string' && parsed.feedbackFa.trim()
            ? parsed.feedbackFa.trim()
            : passed
              ? 'آفرین! تلفظت کاملاً قابل فهم و عالی بود 👏'
              : 'کمی نامفهوم بود؛ یک بار دیگر واضح‌تر بخوان یا رد کن.';

        return NextResponse.json({ transcript, passed, feedbackFa, similarity: sim });
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
      }
    }

    throw lastErr || new Error('Speech evaluation failed');
  } catch (err) {
    console.error('POST /api/speech-check error:', err);
    return NextResponse.json(
      { error: 'بررسی صدا موقتاً شلوغ بود؛ می‌توانی دوباره امتحان کنی یا رد کنی.' },
      { status: 503 }
    );
  }
}
