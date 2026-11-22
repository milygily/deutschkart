import { NextResponse } from 'next/server';
import { db } from '@/db';
import { deckStories } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;

interface StoryLine {
  speaker: 'Anna' | 'Lukas';
  de: string;
  fa: string;
}

function parseSampleRate(mimeType: string): number {
  const match = mimeType.match(/rate=(\d+)/i);
  return match ? Number(match[1]) : 24000;
}

/**
 * Extracts raw 16-bit mono PCM bytes from either a WAV buffer or raw PCM buffer.
 */
function extractPcmAndRate(raw: Buffer, mimeType: string): { pcm: Buffer; sampleRate: number } {
  if (raw.length > 44 && raw.toString('ascii', 0, 4) === 'RIFF' && raw.toString('ascii', 8, 12) === 'WAVE') {
    const sampleRate = raw.readUInt32LE(24) || 24000;
    // Find "data" chunk cleanly
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

/**
 * Clean linear-interpolation resampler to 16kHz 16-bit mono PCM.
 * Keeps crisp German voice clarity while cutting transfer size by 33%
 * so multi-minute podcast chunks stay safely under Vercel's 4.5MB response cap!
 */
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

function pcmToWavBuffer(pcmBuffer: Buffer, sampleRate = 16000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await context.params;
    const body = await req.json();
    const format = body.format === 'pcm' ? 'pcm' : 'wav';
    let lines: StoryLine[] = Array.isArray(body.lines) ? body.lines : [];

    if (lines.length === 0 && body.storyId) {
      const rows = await db
        .select({ lines: deckStories.lines })
        .from(deckStories)
        .where(eq(deckStories.id, Number(body.storyId)))
        .limit(1);
      if (rows[0] && Array.isArray(rows[0].lines)) {
        lines = rows[0].lines as StoryLine[];
      }
    }

    if (lines.length === 0) {
      return NextResponse.json({ error: 'متن پادکست پیدا نشد.' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '').trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'کلید هوش مصنوعی تنظیم نشده است.' }, { status: 500 });
    }
    const ai = new GoogleGenAI({ apiKey });

    // Add gentle pauses between turns so the dialogue breathes naturally instead of ping-ponging!
    const scriptText = lines.map((l) => `${l.speaker}: ${l.de}`).join('\n\n');

    let pcm16k: Buffer | null = null;
    let lastErr: unknown = null;

    // 1. Primary: Calm, relaxed, Easy-German-paced 2-Speaker Podcast (Anna = Kore, Lukas = Puck)
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 42000);
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: `Lies diesen deutschen Lernpodcast zwischen Anna und Lukas in einem ruhigen, entspannten, warmen und gut verständlichen Tempo vor (wie Easy German Podcast für B1-Lernende). Sprich nicht gehetzt, betone klar und mache kleine, natürliche Atempausen nach jedem Satz und beim Sprecherwechsel:\n\n${scriptText}`,
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                { speaker: 'Anna', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                { speaker: 'Lukas', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
              ],
            },
          },
          abortSignal: ac.signal,
        },
      });
      clearTimeout(timer);

      const inlineData = res.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (inlineData?.data) {
        const raw = Buffer.from(inlineData.data, 'base64');
        const { pcm, sampleRate } = extractPcmAndRate(raw, inlineData.mimeType || '');
        pcm16k = resamplePcm16Mono(pcm, sampleRate, 16000);
      }
    } catch (e) {
      lastErr = e;
    }

    // 2. Fallback: Ultra-fast Gemini 3.8 Flash Lite TTS
    if (!pcm16k) {
      try {
        const plainNarration = lines.map((l) => l.de).join(' ... ... ');
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 28000);
        const res = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: plainNarration,
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
          pcm16k = resamplePcm16Mono(pcm, sampleRate, 16000);
        }
      } catch (e) {
        lastErr = e;
      }
    }

    if (!pcm16k) {
      throw lastErr || new Error('TTS generation failed');
    }

    if (format === 'pcm') {
      return new NextResponse(new Uint8Array(pcm16k), {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(pcm16k.length),
          'X-Sample-Rate': '16000',
        },
      });
    }

    const wav = pcmToWavBuffer(pcm16k, 16000);
    return new NextResponse(new Uint8Array(wav), {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(wav.length),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (err) {
    console.error('POST /api/decks/[id]/story/audio error:', err);
    return NextResponse.json(
      { error: 'ساخت فایل صوتی پادکست موقتاً با خطا مواجه شد. لطفاً دوباره امتحان کنید.' },
      { status: 500 }
    );
  }
}
