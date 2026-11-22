import { GoogleGenAI } from '@google/genai';

export interface GeneratedWordCard {
  word: string;
  article: 'der' | 'die' | 'das' | null;
  plural: string | null;
  partOfSpeech: 'noun' | 'verb' | 'adjective' | 'adverb' | 'phrase';
  verbForms: string | null;
  persianMeaning: string;
  englishMeaning: string;
  exampleDe: string;
  exampleFa: string;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | null;
}

// Ordered by fastest response & highest availability on Free Tier
const CANDIDATE_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
];

export function normalizeGermanWord(raw: string): string {
  return raw
    .trim()
    .replace(/^(der|die|das)\s+/i, '')
    .replace(/[.,!?;:()[\]"'«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  return new GoogleGenAI({ apiKey });
}

const SYSTEM_SCHEMA_INSTRUCTIONS = `You are an expert German-to-Persian (Farsi) language teacher creating clean flashcards for Persian speakers learning German.
Return ONLY a valid JSON array (no markdown fences, no commentary). Each element must follow this exact schema:
{
  "word": "German word WITHOUT article (capitalize nouns properly, e.g. 'Entscheidung', lowercase verbs e.g. 'aufhören')",
  "article": "der" | "die" | "das" | null (ONLY for singular nouns; null for verbs/adjectives/adverbs/phrases/plural-only nouns),
  "plural": "plural form with 'die', e.g. 'die Entscheidungen' (ONLY for countable nouns; otherwise null)",
  "partOfSpeech": "noun" | "verb" | "adjective" | "adverb" | "phrase",
  "verbForms": "for verbs: 'Präsens 3rd sg (if irregular) · Perfekt with hat/ist', e.g. 'fängt an · hat angefangen' or 'hat gemacht' (null for non-verbs)",
  "persianMeaning": "natural, concise Persian meaning (1 to 3 common meanings separated by '، ')",
  "englishMeaning": "concise English meaning",
  "exampleDe": "a natural, practical German example sentence using the word",
  "exampleFa": "natural Persian translation of exampleDe",
  "level": "A1" | "A2" | "B1" | "B2" | "C1"
}
Rules:
- Fix minor spelling typos in German input words.
- Deduplicate repeated words.
- Max 35 words per request.
- Ensure Persian translations are natural, idiomatic, and accurate for Iranian Persian speakers.`;

async function callGeminiWithFallback(contents: unknown, timeoutMs = 18000): Promise<GeneratedWordCard[]> {
  const ai = getClient();
  let lastErr: unknown = null;

  for (const model of CANDIDATE_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response;
      try {
        response = await ai.models.generateContent({
          model,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          contents: contents as any,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
            // Disable deep thinking for structured vocab extraction -> 2x-4x faster responses!
            thinkingConfig: { thinkingBudget: 0 },
            abortSignal: controller.signal,
          },
        });
      } catch (innerErr) {
        const msg = innerErr instanceof Error ? innerErr.message : '';
        const status = (innerErr as { status?: number })?.status;
        if (status === 400 || /INVALID_ARGUMENT|thinking/i.test(msg)) {
          response = await ai.models.generateContent({
            model,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            contents: contents as any,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.2,
              abortSignal: controller.signal,
            },
          });
        } else {
          throw innerErr;
        }
      }
      clearTimeout(timer);
      const text = response.text?.trim() || '[]';
      const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) {
        throw new Error('Gemini returned non-array JSON');
      }
      return parsed
        .filter((item) => item && typeof item.word === 'string' && typeof item.persianMeaning === 'string')
        .map((item) => ({
          word: String(item.word).trim().replace(/^(der|die|das)\s+/i, ''),
          article:
            item.article === 'der' || item.article === 'die' || item.article === 'das'
              ? item.article
              : null,
          plural: item.plural ? String(item.plural).trim() : null,
          partOfSpeech: ['noun', 'verb', 'adjective', 'adverb', 'phrase'].includes(item.partOfSpeech)
            ? item.partOfSpeech
            : item.article
              ? 'noun'
              : 'phrase',
          verbForms: item.verbForms ? String(item.verbForms).trim() : null,
          persianMeaning: String(item.persianMeaning).trim(),
          englishMeaning: item.englishMeaning ? String(item.englishMeaning).trim() : '',
          exampleDe: item.exampleDe ? String(item.exampleDe).trim() : '',
          exampleFa: item.exampleFa ? String(item.exampleFa).trim() : '',
          level: ['A1', 'A2', 'B1', 'B2', 'C1'].includes(item.level) ? item.level : null,
        }));
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('All Gemini models failed');
}

export async function generateFlashcardsFromText(rawText: string): Promise<GeneratedWordCard[]> {
  const prompt = `${SYSTEM_SCHEMA_INSTRUCTIONS}

Extract all useful German vocabulary words/phrases from the following user input and convert them into structured flashcards:
"""
${rawText.slice(0, 4000)}
"""`;

  return callGeminiWithFallback(prompt);
}

export async function generateFlashcardsFromImage(
  base64Data: string,
  mimeType: string,
  extraHint?: string
): Promise<GeneratedWordCard[]> {
  const prompt = `${SYSTEM_SCHEMA_INSTRUCTIONS}

Look closely at this image (which may be a German textbook page, vocabulary list, worksheet, whiteboard, or handwritten notes).
Extract the German vocabulary words/phrases visible in the image and turn each one into a structured German-to-Persian flashcard.
${extraHint ? `Additional user note: ${extraHint}` : ''}`;

  return callGeminiWithFallback([
    {
      role: 'user',
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
      ],
    },
  ]);
}
