import { GoogleGenAI } from '@google/genai';
import { tokenizeGermanSentence, type Exercise } from './exercises';

const FAST_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
];

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  return new GoogleGenAI({ apiKey });
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Strictly validates and repairs AI-generated exercises so every single question is 100% solvable.
 */
export function sanitizeExercises(rawItems: unknown[], prefix: string): Exercise[] {
  const result: Exercise[] = [];
  if (!Array.isArray(rawItems)) return result;

  rawItems.forEach((raw, idx) => {
    if (!raw || typeof raw !== 'object') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = raw as any;
    const type = String(item.type || '').trim();
    const id = `${prefix}-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
    const explanationFa = typeof item.explanationFa === 'string' ? item.explanationFa.trim() : '';

    if (type === 'grammar-cloze') {
      const answer = typeof item.answer === 'string' ? item.answer.trim() : '';
      const rawOpts: string[] = Array.isArray(item.options)
        ? item.options.map((o: unknown) => String(o).trim()).filter(Boolean)
        : [];
      if (!answer || rawOpts.length < 2) return;
      const uniqueOpts: string[] = Array.from(new Set<string>(rawOpts));
      if (!uniqueOpts.includes(answer)) uniqueOpts[0] = answer;
      const sentenceBefore = typeof item.sentenceBefore === 'string' ? item.sentenceBefore : '';
      const sentenceAfter = typeof item.sentenceAfter === 'string' ? item.sentenceAfter : '';
      const fullSentenceDe =
        typeof item.fullSentenceDe === 'string' && item.fullSentenceDe.trim()
          ? item.fullSentenceDe.trim()
          : `${sentenceBefore}${answer}${sentenceAfter}`.replace(/\s+/g, ' ').trim();

      result.push({
        id,
        type: 'grammar-cloze',
        instructionFa:
          typeof item.instructionFa === 'string' && item.instructionFa.trim()
            ? item.instructionFa.trim()
            : 'گزینه درست را برای تکمیل جمله انتخاب کن:',
        sentenceBefore,
        sentenceAfter,
        translationFa: typeof item.translationFa === 'string' ? item.translationFa.trim() : '',
        options: shuffle(uniqueOpts.slice(0, 4)),
        answer,
        fullSentenceDe,
        explanationFa: explanationFa || `پاسخ درست «${answer}» است.`,
      });
      return;
    }

    if (type === 'word-bank') {
      const targetDe = typeof item.targetDe === 'string' ? item.targetDe.trim() : '';
      const promptFa = typeof item.promptFa === 'string' ? item.promptFa.trim() : '';
      if (!targetDe || !promptFa) return;
      const requiredTokens = tokenizeGermanSentence(targetDe);
      if (requiredTokens.length < 3) return;
      const rawTokens: string[] = Array.isArray(item.tokens)
        ? item.tokens.map((t: unknown) => String(t).trim()).filter(Boolean)
        : [];
      // Keep distractors from rawTokens that aren't already counted in requiredTokens
      const reqCounts = new Map<string, number>();
      for (const t of requiredTokens) {
        reqCounts.set(t.toLowerCase(), (reqCounts.get(t.toLowerCase()) || 0) + 1);
      }
      const distractors: string[] = [];
      for (const t of rawTokens) {
        const clean = t.replace(/[.,!?;:„“"'«»]/g, '').trim();
        if (!clean) continue;
        const low = clean.toLowerCase();
        const cnt = reqCounts.get(low) || 0;
        if (cnt > 0) {
          reqCounts.set(low, cnt - 1);
        } else if (distractors.length < 2) {
          distractors.push(clean);
        }
      }
      result.push({
        id,
        type: 'word-bank',
        promptFa,
        hintDe: typeof item.hintDe === 'string' ? item.hintDe.trim() : undefined,
        targetDe,
        tokens: shuffle([...requiredTokens, ...distractors]),
        explanationFa: explanationFa || `جمله صحیح: ${targetDe}`,
      });
      return;
    }

    if (type === 'typing') {
      const answerDe = typeof item.answerDe === 'string' ? item.answerDe.trim() : '';
      const promptFa = typeof item.promptFa === 'string' ? item.promptFa.trim() : '';
      if (!answerDe || !promptFa) return;
      const acceptedAnswers = Array.isArray(item.acceptedAnswers)
        ? item.acceptedAnswers.map((a: unknown) => String(a).trim()).filter(Boolean)
        : [];
      result.push({
        id,
        type: 'typing',
        promptFa,
        sentenceBefore: typeof item.sentenceBefore === 'string' ? item.sentenceBefore : undefined,
        sentenceAfter: typeof item.sentenceAfter === 'string' ? item.sentenceAfter : undefined,
        answerDe,
        acceptedAnswers,
        hintDe: typeof item.hintDe === 'string' ? item.hintDe.trim() : undefined,
        explanationFa: explanationFa || `پاسخ صحیح: ${answerDe}`,
      });
      return;
    }

    if (type === 'listening') {
      const audioDe = typeof item.audioDe === 'string' ? item.audioDe.trim() : '';
      if (!audioDe) return;
      const requiredTokens = tokenizeGermanSentence(audioDe);
      if (requiredTokens.length < 3) return;
      const rawTokens: string[] = Array.isArray(item.tokens)
        ? item.tokens.map((t: unknown) => String(t).trim()).filter(Boolean)
        : [];
      const distractors = rawTokens
        .map((t: string) => t.replace(/[.,!?;:„“"'«»]/g, '').trim())
        .filter((t: string) => t && !requiredTokens.some((rt) => rt.toLowerCase() === t.toLowerCase()))
        .slice(0, 2);

      result.push({
        id,
        type: 'listening',
        audioDe,
        translationFa: typeof item.translationFa === 'string' ? item.translationFa.trim() : '',
        mode: 'word-bank',
        tokens: shuffle([...requiredTokens, ...distractors]),
        explanationFa: explanationFa || (item.translationFa ? `معنی: ${item.translationFa}` : ''),
      });
      return;
    }

    if (type === 'speaking') {
      const targetDe = typeof item.targetDe === 'string' ? item.targetDe.trim() : '';
      if (!targetDe) return;
      result.push({
        id,
        type: 'speaking',
        promptFa:
          typeof item.promptFa === 'string' && item.promptFa.trim()
            ? item.promptFa.trim()
            : 'این جمله را با صدای بلند به آلمانی بخوان:',
        targetDe,
        translationFa: typeof item.translationFa === 'string' ? item.translationFa.trim() : '',
        explanationFa: explanationFa || 'عالی! تمرین تلفظ جملات گرامری کمک می‌کند در مکالمه سریع‌تر فکر کنی.',
      });
    }
  });

  return result;
}

export async function generateMoreGrammarExercises(params: {
  slug: string;
  titleDe: string;
  titleFa: string;
  summaryFa: string;
  existingSamples: string[];
  count?: number;
}): Promise<Exercise[]> {
  const ai = getAiClient();
  const count = params.count ?? 10;

  const prompt = `You are a Goethe-Zertifikat B1 / Grammatik aktiv German grammar expert teaching Persian (Farsi) speakers.
Generate EXACTLY ${count} FRESH, NON-DUPLICATE, gamified German B1 exercises strictly focused on:
Topic: "${params.titleDe}" (${params.titleFa})
Summary: ${params.summaryFa}

Do NOT repeat any of these existing sentences/prompts:
${params.existingSamples.slice(-25).map((s) => `- ${s}`).join('\n')}

Distribution for the ${count} exercises:
- 5 "grammar-cloze" (4 distinct, tricky-but-fair options; realistic B1 daily life / work / Germany contexts)
- 2 "word-bank" (translate Persian sentence to German by arranging word chips; include 2 realistic distractor words in tokens)
- 2 "typing" (fill-in-the-blank typing with sentenceBefore & sentenceAfter, testing exact grammar endings/conjugations/prepositions)
- 1 "listening" (natural B1 sentence using this exact grammar point, mode: "word-bank")

Return ONLY a valid JSON array (no markdown fences) where each object matches one of these exact schemas:
1) grammar-cloze:
{
  "type": "grammar-cloze",
  "instructionFa": "کوتاه به فارسی",
  "sentenceBefore": "text before blank ending with space if needed ",
  "sentenceAfter": " text after blank starting with space if needed.",
  "translationFa": "ترجمه طبیعی فارسی جمله کامل",
  "options": ["opt1", "opt2", "opt3", "opt4"],
  "answer": "exact matching option",
  "fullSentenceDe": "Full completed German sentence.",
  "explanationFa": "توضیح کوتاه و دقیق گرامری به فارسی (۱ تا ۲ جمله)"
}
2) word-bank:
{
  "type": "word-bank",
  "promptFa": "جمله فارسی برای ترجمه به آلمانی",
  "hintDe": "نکته خیلی کوتاه آلمانی مثلاً نام گرامر یا فعل",
  "targetDe": "Correct complete German sentence.",
  "tokens": ["all", "words", "of", "targetDe", "plus", "twoDistractors"],
  "explanationFa": "توضیح کوتاه گرامری به فارسی"
}
3) typing:
{
  "type": "typing",
  "promptFa": "دستور فارسی کوتاه (مثلاً: فعل داخل پرانتز را در حالت صحیح بنویس)",
  "sentenceBefore": "German part before blank ",
  "sentenceAfter": " German part after blank.",
  "answerDe": "exact missing word or short phrase",
  "acceptedAnswers": ["exact missing word or short phrase"],
  "hintDe": "مثلاً (gehen) یا راهنمای کوتاه",
  "explanationFa": "توضیح کوتاه گرامری به فارسی"
}
4) listening:
{
  "type": "listening",
  "audioDe": "Natural German B1 sentence using this grammar.",
  "translationFa": "ترجمه فارسی جمله",
  "mode": "word-bank",
  "tokens": ["all", "words", "plus", "twoDistractors"],
  "explanationFa": "توضیح کوتاه گرامری به فارسی"
}

Ensure 100% grammatical accuracy in German and natural Iranian Persian in explanations!`;

  let lastErr: unknown = null;
  for (const model of FAST_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 32000);
    try {
      let response;
      try {
        response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.45,
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
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.45,
              abortSignal: controller.signal,
            },
          });
        } else {
          throw innerErr;
        }
      }
      clearTimeout(timer);
      const rawText = response.text?.trim() || '[]';
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      const sanitized = sanitizeExercises(Array.isArray(parsed) ? parsed : [], params.slug);
      if (sanitized.length >= 4) {
        return sanitized;
      }
      throw new Error('Too few valid exercises returned');
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Failed to generate exercises');
}
