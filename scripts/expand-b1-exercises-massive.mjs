import { GoogleGenAI } from '@google/genai';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '').trim();
if (!apiKey) {
  console.error('❌ GEMINI_API_KEY missing');
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey });

const MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
];

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function tokenizeGerman(sentence) {
  return String(sentence || '')
    .trim()
    .replace(/[.,!?;:„“"'«»]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

function exerciseFingerprint(ex) {
  const text =
    ex.type === 'grammar-cloze'
      ? ex.fullSentenceDe || `${ex.sentenceBefore || ''}${ex.answer || ''}${ex.sentenceAfter || ''}`
      : ex.type === 'word-bank'
        ? ex.targetDe
        : ex.type === 'listening'
          ? ex.audioDe
          : ex.type === 'typing'
            ? `${ex.sentenceBefore || ''}${ex.answerDe || ''}${ex.sentenceAfter || ''}`
            : ex.type === 'speaking'
              ? ex.targetDe
              : '';
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-zäöüß0-9]+/g, ' ')
    .trim();
}

function sanitizeExercises(rawItems, slug, waveTag) {
  const out = [];
  if (!Array.isArray(rawItems)) return out;

  rawItems.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const type = String(item.type || '').trim();
    const id = `${slug}-${waveTag}-${idx + 1}-${Math.random().toString(36).slice(2, 5)}`;
    const explanationFa = typeof item.explanationFa === 'string' ? item.explanationFa.trim() : '';

    if (type === 'grammar-cloze') {
      const answer = typeof item.answer === 'string' ? item.answer.trim() : '';
      const rawOpts = Array.isArray(item.options)
        ? item.options.map((o) => String(o).trim()).filter(Boolean)
        : [];
      if (!answer || rawOpts.length < 2) return;
      const uniqueOpts = Array.from(new Set(rawOpts));
      if (!uniqueOpts.includes(answer)) uniqueOpts[0] = answer;
      const before = typeof item.sentenceBefore === 'string' ? item.sentenceBefore : '';
      const after = typeof item.sentenceAfter === 'string' ? item.sentenceAfter : '';
      const fullSentenceDe =
        typeof item.fullSentenceDe === 'string' && item.fullSentenceDe.trim()
          ? item.fullSentenceDe.trim()
          : `${before}${answer}${after}`.replace(/\s+/g, ' ').trim();

      out.push({
        id,
        type: 'grammar-cloze',
        instructionFa:
          typeof item.instructionFa === 'string' && item.instructionFa.trim()
            ? item.instructionFa.trim()
            : 'گزینه درست را برای جای خالی انتخاب کن:',
        sentenceBefore: before,
        sentenceAfter: after,
        translationFa: typeof item.translationFa === 'string' ? item.translationFa.trim() : '',
        options: shuffle(uniqueOpts.slice(0, 4)),
        answer,
        fullSentenceDe,
        explanationFa: explanationFa || `پاسخ صحیح «${answer}» است.`,
      });
    } else if (type === 'word-bank') {
      const targetDe = typeof item.targetDe === 'string' ? item.targetDe.trim() : '';
      const promptFa = typeof item.promptFa === 'string' ? item.promptFa.trim() : '';
      if (!targetDe || !promptFa) return;
      const req = tokenizeGerman(targetDe);
      if (req.length < 3 || req.length > 14) return;
      const rawTokens = Array.isArray(item.tokens)
        ? item.tokens.map((t) => String(t).replace(/[.,!?;:„“"'«»]/g, '').trim()).filter(Boolean)
        : [];
      const reqCounts = new Map();
      for (const t of req) reqCounts.set(t.toLowerCase(), (reqCounts.get(t.toLowerCase()) || 0) + 1);
      const distractors = [];
      for (const t of rawTokens) {
        const low = t.toLowerCase();
        const c = reqCounts.get(low) || 0;
        if (c > 0) reqCounts.set(low, c - 1);
        else if (distractors.length < 2) distractors.push(t);
      }
      out.push({
        id,
        type: 'word-bank',
        promptFa,
        hintDe: typeof item.hintDe === 'string' ? item.hintDe.trim() : undefined,
        targetDe,
        tokens: shuffle([...req, ...distractors]),
        explanationFa: explanationFa || `جمله صحیح: ${targetDe}`,
      });
    } else if (type === 'typing') {
      const answerDe = typeof item.answerDe === 'string' ? item.answerDe.trim() : '';
      const promptFa = typeof item.promptFa === 'string' ? item.promptFa.trim() : '';
      if (!answerDe || !promptFa) return;
      const acceptedAnswers = Array.isArray(item.acceptedAnswers)
        ? item.acceptedAnswers.map((a) => String(a).trim()).filter(Boolean)
        : [];
      out.push({
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
    } else if (type === 'listening') {
      const audioDe = typeof item.audioDe === 'string' ? item.audioDe.trim() : '';
      if (!audioDe) return;
      const req = tokenizeGerman(audioDe);
      if (req.length < 3 || req.length > 14) return;
      const rawTokens = Array.isArray(item.tokens)
        ? item.tokens.map((t) => String(t).replace(/[.,!?;:„“"'«»]/g, '').trim()).filter(Boolean)
        : [];
      const distractors = rawTokens
        .filter((t) => !req.some((r) => r.toLowerCase() === t.toLowerCase()))
        .slice(0, 2);
      out.push({
        id,
        type: 'listening',
        audioDe,
        translationFa: typeof item.translationFa === 'string' ? item.translationFa.trim() : '',
        mode: 'word-bank',
        tokens: shuffle([...req, ...distractors]),
        explanationFa: explanationFa || (item.translationFa ? `معنی: ${item.translationFa}` : ''),
      });
    } else if (type === 'speaking') {
      const targetDe = typeof item.targetDe === 'string' ? item.targetDe.trim() : '';
      if (!targetDe) return;
      out.push({
        id,
        type: 'speaking',
        promptFa:
          typeof item.promptFa === 'string' && item.promptFa.trim()
            ? item.promptFa.trim()
            : 'این جمله را با صدای بلند به آلمانی بخوان:',
        targetDe,
        translationFa: typeof item.translationFa === 'string' ? item.translationFa.trim() : '',
        explanationFa: explanationFa || 'تلفظ با صدای بلند ساختار گرامری را در مکالمه تثبیت می‌کند.',
      });
    }
  });

  return out;
}

async function generateWave(topic, existingList, waveName, themeInstruction) {
  const existingSamples = existingList.slice(-30).map(exerciseFingerprint).filter(Boolean);

  const prompt = `You are a senior Goethe-Zertifikat B1, telc Deutsch B1 (Sprachbausteine), Schubert B-Grammatik & DeutschAkademie author creating rich interactive drills for Iranian Persian (Farsi) speakers living in Germany.

Generate EXACTLY 15 FRESH, NON-DUPLICATE, varied B1 exercises for:
- Grammar Topic: "${topic.title_de}" (${topic.title_fa})
- Topic Summary: ${topic.summary_fa}
- Special Theme Focus for this batch (${waveName}): ${themeInstruction}

Do NOT repeat any of these already-existing sentences:
${existingSamples.map((s) => `- ${s}`).join('\n')}

Exact distribution for the 15 exercises:
- 7 "grammar-cloze" (4 distinct options; realistic telc/Goethe B1 Sprachbausteine & daily Germany traps)
- 3 "word-bank" (Persian -> German sentence assembly, 5-11 words, plus 2 distractor chips)
- 3 "typing" (fill-in-the-blank typing with sentenceBefore & sentenceAfter testing exact verb form/ending/preposition/connector)
- 1 "listening" (natural B1 sentence with this grammar, mode: "word-bank")
- 1 "speaking" (practical everyday German B1 sentence using this grammar)

Return ONLY a valid JSON array (no markdown fences) matching these exact schemas:
1) grammar-cloze:
{"type":"grammar-cloze","instructionFa":"...","sentenceBefore":"... ","sentenceAfter":" ...","translationFa":"ترجمه فارسی","options":["a","b","c","d"],"answer":"a","fullSentenceDe":"...","explanationFa":"توضیح دقیق و ۱-۲ جمله‌ای به فارسی"}
2) word-bank:
{"type":"word-bank","promptFa":"جمله فارسی","hintDe":"راهنمای کوتاه آلمانی","targetDe":"Complete German sentence.","tokens":["all","words","plus","2distractors"],"explanationFa":"توضیح فارسی"}
3) typing:
{"type":"typing","promptFa":"دستور فارسی کوتاه","sentenceBefore":"... ","sentenceAfter":" ...","answerDe":"exact missing word/phrase","acceptedAnswers":["exact missing word/phrase"],"hintDe":"راهنما","explanationFa":"توضیح فارسی"}
4) listening:
{"type":"listening","audioDe":"Natural B1 German sentence.","translationFa":"ترجمه فارسی","mode":"word-bank","tokens":["all","words","plus","2distractors"],"explanationFa":"توضیح فارسی"}
5) speaking:
{"type":"speaking","promptFa":"این جمله را با صدای بلند به آلمانی بخوان:","targetDe":"Natural B1 German sentence.","translationFa":"ترجمه فارسی","explanationFa":"نکته فارسی"}

Use diverse German names, genders, professions, and real everyday contexts in Germany (Bewerbung, Arzttermin, Wohnungssuche, Ausländerbehörde, Supermarkt, Nachbarn, Schule, Bahn, Urlaub, Freunde). 100% accurate German grammar & natural Iranian Persian!`;

  let lastErr = null;
  for (const model of MODELS) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 50000);
    try {
      let res;
      try {
        res = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.55,
            thinkingConfig: { thinkingBudget: 0 },
            abortSignal: ac.signal,
          },
        });
      } catch (inner) {
        const msg = inner instanceof Error ? inner.message : '';
        if (inner?.status === 400 || /INVALID_ARGUMENT|thinking/i.test(msg)) {
          res = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.55,
              abortSignal: ac.signal,
            },
          });
        } else {
          throw inner;
        }
      }
      clearTimeout(timer);
      const raw = (res.text || '[]').trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(raw);
      const cleaned = sanitizeExercises(Array.isArray(parsed) ? parsed : [], topic.slug, waveName);
      if (cleaned.length >= 8) return cleaned;
      throw new Error(`Only ${cleaned.length} valid exercises returned`);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
    }
  }
  throw lastErr;
}

const WAVES = [
  {
    name: 'telc-alltag',
    instruction:
      'telc Deutsch B1 & Goethe-Zertifikat B1 Sprachbausteine style: formal emails (Bewerbung, Vermieter, Behörde, Arzttermin, Reklamation) and everyday conversations in Germany with diverse subjects (ich, du, Frau/Herr, wir, ihr, Sie), questions, and negations.',
  },
  {
    name: 'schubert-traps',
    instruction:
      'Schubert B-Grammatik & DeutschAkademie tricky B1 contrast drills: test classic exam traps, verb-final word order, Dativ vs Akkusativ vs Genitiv case shifts, separable verbs, modal verbs, and contrasting similar structures side-by-side.',
  },
];

const topics = await sql`
  SELECT id, order_index, slug, title_de, title_fa, summary_fa, exercises
  FROM grammar_topics
  ORDER BY order_index ASC
`;

const TARGET_MIN = 48;
const toExpand = topics.filter((t) => (Array.isArray(t.exercises) ? t.exercises.length : 0) < TARGET_MIN);
console.log(`🚀 Expanding ${toExpand.length}/${topics.length} B1 grammar topics to ~50 exercises each (~800+ total)...`);

const CONCURRENCY = 4;
for (let i = 0; i < toExpand.length; i += CONCURRENCY) {
  const batch = toExpand.slice(i, i + CONCURRENCY);
  await Promise.all(
    batch.map(async (topic) => {
      let merged = Array.isArray(topic.exercises) ? [...topic.exercises] : [];
      const seen = new Set(merged.map(exerciseFingerprint));

      for (const wave of WAVES) {
        if (merged.length >= TARGET_MIN) break;
        try {
          const fresh = await generateWave(topic, merged, wave.name, wave.instruction);
          for (const ex of fresh) {
            const fp = exerciseFingerprint(ex);
            if (fp && !seen.has(fp)) {
              seen.add(fp);
              merged.push(ex);
            }
          }
        } catch (err) {
          console.warn(`  ⚠️ ${topic.slug} (${wave.name}) warning: ${err?.message || err}`);
        }
      }

      await sql`
        UPDATE grammar_topics
        SET exercises = ${JSON.stringify(merged)}::jsonb
        WHERE id = ${topic.id}
      `;
      console.log(`  ✅ [${topic.order_index}/16] ${topic.slug}: now ${merged.length} verified exercises!`);
    })
  );
}

const [summary] = await sql`
  SELECT COUNT(*)::int AS topics, COALESCE(SUM(jsonb_array_length(exercises)), 0)::int AS total_exercises
  FROM grammar_topics
`;
console.log(`\n🎉 MASSIVE EXPANSION COMPLETE: ${summary.topics} topics with ${summary.total_exercises} total B1 exercises in Neon!`);
