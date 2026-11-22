import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 30;

// In-memory LRU cache (keeps hot sentences instant on warm serverless instances)
const ttsCache = new Map<string, Uint8Array>();
const MAX_CACHE_ITEMS = 120;

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
        contents: `Lies genau diesen deutschen Text klar, natürlich und deutlich vor (ohne Zusätze): ${text}`,
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const text = (searchParams.get('text') || '').trim().slice(0, 260);
    if (!text) {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }

    const cacheKey = text.toLowerCase();
    let wav = ttsCache.get(cacheKey);
    if (!wav) {
      wav = await synthesizeGermanWav(text);
      if (ttsCache.size >= MAX_CACHE_ITEMS) {
        const firstKey = ttsCache.keys().next().value;
        if (firstKey) ttsCache.delete(firstKey);
      }
      ttsCache.set(cacheKey, wav);
    }

    return new NextResponse(Buffer.from(wav), {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(wav.byteLength),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=604800, immutable',
      },
    });
  } catch (err) {
    console.error('GET /api/tts error:', err);
    return NextResponse.json({ error: 'TTS unavailable' }, { status: 503 });
  }
}
