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

function pcmToWavBuffer(pcmBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

function parseSampleRate(mimeType: string): number {
  const match = mimeType.match(/rate=(\d+)/i);
  return match ? Number(match[1]) : 24000;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await context.params;
    const body = await req.json();
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

    const scriptText = lines.map((l) => `${l.speaker}: ${l.de}`).join('\n');

    let audioBytes: Buffer | null = null;
    let lastErr: unknown = null;

    // 1. Primary: Studio 2-Speaker German Podcast (Anna = Kore, Lukas = Puck)
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 38000);
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: `Lies diesen deutschen Podcast-Dialog zwischen Anna und Lukas natürlich, klar und freundlich vor:\n${scriptText}`,
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
        const mime = inlineData.mimeType || '';
        if (mime.includes('wav')) {
          audioBytes = raw;
        } else {
          audioBytes = pcmToWavBuffer(raw, parseSampleRate(mime));
        }
      }
    } catch (e) {
      lastErr = e;
    }

    // 2. Fallback: Ultra-fast single-voice Gemini 3.8 Flash Lite TTS
    if (!audioBytes) {
      try {
        const plainNarration = lines.map((l) => l.de).join(' ... ');
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 25000);
        const res = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: `Lies diese deutsche Geschichte klar und natürlich vor:\n${plainNarration}`,
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
          const mime = inlineData.mimeType || '';
          audioBytes = mime.includes('wav')
            ? raw
            : pcmToWavBuffer(raw, parseSampleRate(mime));
        }
      } catch (e) {
        lastErr = e;
      }
    }

    if (!audioBytes) {
      throw lastErr || new Error('TTS generation failed');
    }

    return new NextResponse(new Uint8Array(audioBytes), {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(audioBytes.length),
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
