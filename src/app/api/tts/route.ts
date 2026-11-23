import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { ttsAudioCache } from '@/db/schema';

export const maxDuration = 30;

// Warm in-memory map: textHash -> permanent jsDelivr Frankfurt CDN URL (0ms on warm instances)
const cdnUrlCache = new Map<string, string>();
const MAX_URL_CACHE = 5000;

// In-flight deduplication so simultaneous taps on the exact same sentence only call Gemini ONCE
const inflightSynthesis = new Map<string, Promise<Uint8Array>>();

function isHealthyAudioUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  // Ignore paused Vercel Blob URLs so we never return 403
  if (url.includes('blob.vercel-storage.com')) return false;
  return url.startsWith('https://');
}

function canonicalizeText(rawText: string): string {
  return rawText
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 260)
    .toLowerCase()
    .replace(/^[.,!?;:„“"'«»()[\]]+|[.,!?;:„“"'«»()[\]]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashText(normalizedText: string): string {
  // v3: Human Neural German voices (Seraphina + Conrad) stored as MP3 on jsDelivr Frankfurt CDN
  const canonical = canonicalizeText(normalizedText);
  return crypto.createHash('sha256').update(`v3:${canonical}`).digest('hex').slice(0, 32);
}

function rememberCdnUrl(hash: string, url: string) {
  if (cdnUrlCache.size >= MAX_URL_CACHE) {
    const first = cdnUrlCache.keys().next().value;
    if (first) cdnUrlCache.delete(first);
  }
  cdnUrlCache.set(hash, url);
}

function parseSampleRate(mimeType: string): number {
  const m = mimeType.match(/rate=(\d+)/i);
  return m ? Number(m[1]) : 24000;
}

function extractPcmAndRate(raw: Buffer, mimeType: string): { pcm: Buffer; sampleRate: number } {
  if (raw.length > 44 && raw.toString('ascii', 0, 4) === 'RIFF' && raw.toString('ascii', 8, 12) === 'WAVE') {
    const sampleRate = raw.readUInt32LE(24) || 24000;
    let offset = 12;
    while (offset + 8 < raw.length) {
      const id = raw.toString('ascii', offset, offset + 4);
      const size = raw.readUInt32LE(offset + 4);
      if (id === 'data') {
        return { pcm: raw.subarray(offset + 8, offset + 8 + size), sampleRate };
      }
      offset += 8 + size;
    }
    return { pcm: raw.subarray(44), sampleRate };
  }
  return { pcm: raw, sampleRate: parseSampleRate(mimeType) };
}

function resamplePcm16Mono(pcm: Buffer, fromRate: number, toRate = 16000): Buffer {
  if (fromRate === toRate) return pcm;
  const inSamples = Math.floor(pcm.length / 2);
  if (inSamples < 2) return pcm;
  const ratio = fromRate / toRate;
  const outSamples = Math.floor(inSamples / ratio);
  const out = Buffer.alloc(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = pcm.readInt16LE(idx * 2);
    const s1 = idx + 1 < inSamples ? pcm.readInt16LE((idx + 1) * 2) : s0;
    const val = Math.max(-32768, Math.min(32767, Math.round(s0 + (s1 - s0) * frac)));
    out.writeInt16LE(val, i * 2);
  }
  return out;
}

function pcmToWav(pcm: Buffer, sampleRate = 16000): Uint8Array {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return new Uint8Array(Buffer.concat([header, pcm]));
}

async function synthesizeGermanWav(text: string): Promise<Uint8Array> {
  const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');
  const ai = new GoogleGenAI({ apiKey });

  const models = ['gemini-3.8-flash-lite-tts', 'gemini-2.5-flash-preview-tts'];
  let lastErr: unknown = null;

  for (const model of models) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 16000);
    try {
      const res = await ai.models.generateContent({
        model,
        // Pure TTS models read `contents` verbatim — never add instruction prefixes!
        contents: text,
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          abortSignal: ac.signal,
        },
      });
      clearTimeout(timer);
      const inlineData = res.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (inlineData?.data) {
        const raw = Buffer.from(inlineData.data, 'base64');
        const { pcm, sampleRate } = extractPcmAndRate(raw, inlineData.mimeType || '');
        const pcm16k = resamplePcm16Mono(pcm, sampleRate, 16000);
        return pcmToWav(pcm16k, 16000);
      }
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
    }
  }
  throw lastErr || new Error('TTS failed');
}

function redirectToCdn(audioUrl: string, cacheSource: string) {
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: audioUrl,
      'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      'X-TTS-Cache': cacheSource,
    },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const normalizedText = (searchParams.get('text') || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 260);
    if (!normalizedText) {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }

    const textHash = hashText(normalizedText);

    // 1. Instant warm-memory hit -> 302 to permanent Frankfurt jsDelivr CDN!
    const memUrl = cdnUrlCache.get(textHash);
    if (isHealthyAudioUrl(memUrl)) {
      return redirectToCdn(memUrl, 'HIT-MEM-CDN');
    }

    // 2. Global shared DB lookup (hits pre-warmed Human Neural MP3s on jsDelivr Frankfurt CDN!)
    try {
      const existing = await db
        .select({ blobUrl: ttsAudioCache.blobUrl })
        .from(ttsAudioCache)
        .where(eq(ttsAudioCache.textHash, textHash))
        .limit(1);

      if (isHealthyAudioUrl(existing[0]?.blobUrl)) {
        rememberCdnUrl(textHash, existing[0].blobUrl);
        return redirectToCdn(existing[0].blobUrl, 'HIT-DB-CDN');
      }
    } catch (dbErr) {
      console.error('tts_audio_cache lookup warning:', dbErr);
    }

    // 3. Brand-new unseen text -> synthesize directly (cached on Vercel Edge CDN + browser CacheStorage; zero Vercel Blob writes!)
    let pending = inflightSynthesis.get(textHash);
    if (!pending) {
      pending = synthesizeGermanWav(normalizedText).finally(() => {
        inflightSynthesis.delete(textHash);
      });
      inflightSynthesis.set(textHash, pending);
    }

    const wav = await pending;

    return new NextResponse(Buffer.from(wav), {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(wav.byteLength),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
        'X-TTS-Cache': 'MISS-EDGE-DIRECT',
      },
    });
  } catch (err) {
    console.error('GET /api/tts error:', err);
    return NextResponse.json({ error: 'TTS unavailable' }, { status: 503 });
  }
}

/**
 * Batch lookup for instant lesson audio preloading:
 * Accepts { texts: string[] } (up to 250 items), resolves all existing jsDelivr Frankfurt
 * CDN URLs in ONE single DB query (zero Gemini synthesis), and returns { urls: Record<canonicalKey, cdnUrl> }.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { texts?: unknown } | null;
    if (!body || !Array.isArray(body.texts)) {
      return NextResponse.json({ error: 'texts array required' }, { status: 400 });
    }

    const hashToCanonical = new Map<string, string>();
    const urls: Record<string, string> = {};
    const missingHashes: string[] = [];

    for (const raw of body.texts.slice(0, 250)) {
      if (typeof raw !== 'string') continue;
      const canonical = canonicalizeText(raw);
      if (!canonical) continue;
      const hash = hashText(canonical);
      if (hashToCanonical.has(hash)) continue;
      hashToCanonical.set(hash, canonical);

      const memUrl = cdnUrlCache.get(hash);
      if (isHealthyAudioUrl(memUrl)) {
        urls[canonical] = memUrl;
      } else {
        missingHashes.push(hash);
      }
    }

    if (missingHashes.length > 0) {
      const rows = await db
        .select({ textHash: ttsAudioCache.textHash, blobUrl: ttsAudioCache.blobUrl })
        .from(ttsAudioCache)
        .where(inArray(ttsAudioCache.textHash, missingHashes));

      for (const row of rows) {
        if (!isHealthyAudioUrl(row.blobUrl)) continue;
        rememberCdnUrl(row.textHash, row.blobUrl);
        const canonical = hashToCanonical.get(row.textHash);
        if (canonical) {
          urls[canonical] = row.blobUrl;
        }
      }
    }

    return NextResponse.json(
      { urls },
      {
        headers: {
          'Cache-Control': 'private, max-age=300',
        },
      }
    );
  } catch (err) {
    console.error('POST /api/tts batch error:', err);
    return NextResponse.json({ urls: {} }, { status: 200 });
  }
}
