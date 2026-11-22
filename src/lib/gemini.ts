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

// Ordered by fastest response & highest Free Tier daily quota
const CANDIDATE_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
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
  "word": "German word/phrase WITHOUT leading der/die/das article (capitalize nouns properly, e.g. 'Entscheidung', lowercase verbs e.g. 'aufhören' or 'sich entschließen' or 'Sport treiben')",
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
- Convert EVERY SINGLE word in the input list — do NOT skip, summarize, or truncate ANY word!
- Fix minor spelling typos in German input words.
- Deduplicate exact duplicates only (keep distinct masculine/feminine noun pairs like Bürgermeister and Bürgermeisterin as separate cards!).
- Ensure Persian translations are natural, idiomatic, and accurate for Iranian Persian speakers.`;

async function callGeminiJsonRaw(contents: unknown, timeoutMs = 28000): Promise<unknown> {
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
      return JSON.parse(cleaned);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('All Gemini models failed');
}

function parseGeneratedCards(parsed: unknown): GeneratedWordCard[] {
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
}

/**
 * Step 1 for Photo OCR: ultra-fast vision extraction of EVERY single German word/phrase
 * across ALL columns (left + right) & sections (Nomen, Verben, Adjektive, Andere Wörter)
 * with NO 35-word cap!
 */
export async function extractWordListFromImage(
  base64Data: string,
  mimeType: string,
  extraHint?: string
): Promise<string[]> {
  const prompt = `Look very carefully at this German vocabulary image (textbook page, two-column "Ihr Wortschatz" list, worksheet, or notes).
Read EVERY SINGLE German vocabulary entry from ALL columns (left column AND right column, top to bottom) and ALL sections (Nomen, Verben, Adjektive, Andere Wörter, etc.).

Rules:
- Return ONLY a JSON array of strings, e.g. ["der Anbieter", "die Aufmerksamkeit", "abrechnen", "(sich) entschließen", "zunächst"].
- Do NOT skip or stop early! Extract ALL entries on the entire page (even if there are 60, 80, or 120 words!).
- Include articles (der/die/das) for nouns, keep both masculine and feminine pairs (e.g. "der Bürgermeister" AND "die Bürgermeisterin"), and keep short verb context if printed (e.g. "drehen (einen Film)", "(Sport) treiben").
- Ignore section headings ("Ihr Wortschatz", "Nomen", "Verben", "Adjektive", "Andere Wörter"), page numbers, plural suffixes like "-en" / "-n" / "(Sg.)", and dotted blank lines.
${extraHint ? `- User note: ${extraHint}` : ''}`;

  const parsed = await callGeminiJsonRaw(
    [
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
    ],
    28000
  );

  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const words: string[] = [];
  for (const item of parsed) {
    if (typeof item !== 'string') continue;
    const cleaned = item
      .trim()
      .replace(/,\s*(-\w*|\(Sg\.\)|\(Pl\.\))\s*$/i, '')
      .replace(/\s*\(Sg\.\)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned || cleaned.length > 65) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(cleaned);
  }
  return words.slice(0, 150);
}

/**
 * Generates flashcards for an arbitrary list of German words in fast parallel chunks (22 words/chunk)
 * so 60-120 words finish completely in ~6 seconds with zero truncation!
 */
export async function generateFlashcardsInChunks(
  wordList: string[],
  chunkSize = 22
): Promise<GeneratedWordCard[]> {
  if (!wordList.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < wordList.length; i += chunkSize) {
    chunks.push(wordList.slice(i, i + chunkSize));
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const prompt = `${SYSTEM_SCHEMA_INSTRUCTIONS}

Convert ALL ${chunk.length} German vocabulary items below into structured German-to-Persian flashcards (return exactly ${chunk.length} items, do not omit any):
${chunk.map((w, idx) => `${idx + 1}. ${w}`).join('\n')}`;
      const parsed = await callGeminiJsonRaw(prompt, 32000);
      return parseGeneratedCards(parsed);
    })
  );

  return results.flat();
}

export async function generateFlashcardsFromText(rawText: string): Promise<GeneratedWordCard[]> {
  const prompt = `${SYSTEM_SCHEMA_INSTRUCTIONS}

Extract ALL useful German vocabulary words/phrases from the following user input (do NOT cap at 35; include every single one) and convert them into structured flashcards:
"""
${rawText.slice(0, 8000)}
"""`;

  const parsed = await callGeminiJsonRaw(prompt, 35000);
  return parseGeneratedCards(parsed);
}

export async function generateFlashcardsFromImage(
  base64Data: string,
  mimeType: string,
  extraHint?: string
): Promise<GeneratedWordCard[]> {
  const prompt = `${SYSTEM_SCHEMA_INSTRUCTIONS}

Look closely at this image (which may be a German textbook page, 2-column vocabulary list, worksheet, whiteboard, or handwritten notes).
Extract EVERY SINGLE German vocabulary word/phrase visible in ALL columns of the image and turn each one into a structured German-to-Persian flashcard. Do NOT skip any word.
${extraHint ? `Additional user note: ${extraHint}` : ''}`;

  const parsed = await callGeminiJsonRaw(
    [
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
    ],
    35000
  );
  return parseGeneratedCards(parsed);
}
