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

async function generateExtraExamples(topic, existingExamples) {
  const existingDe = existingExamples.map((e) => e.de).filter(Boolean);
  const prompt = `You are an expert German B1 grammar teacher writing for Persian (Farsi) speakers living in Germany.
Generate EXACTLY 7 FRESH, NON-DUPLICATE, practical B1 example sentences for this grammar topic:
- Topic: ${topic.title_de} (${topic.title_fa})
- Summary: ${topic.summary_fa}

Do NOT repeat any of these existing examples:
${existingDe.map((s) => `- ${s}`).join('\n')}

Make the 7 new examples cover diverse real-life situations in Germany (work/Büro, Arzt/Gesundheit, Behörden/Termin, Wohnung, Freunde, Einkaufen, Reisen, Alltag) and show DIFFERENT grammatical sub-cases, pronouns (ich, du, er/sie, wir, Sie), negative/question forms, and tenses relevant to this grammar point!

Return ONLY a valid JSON array (no markdown fences) of 7 objects with this exact schema:
[
  {
    "de": "Authentic, natural B1 German sentence.",
    "fa": "ترجمه روان و طبیعی به فارسی محاوره‌ای-استاندارد ایرانی",
    "highlight": "exact German grammar words inside de to highlight",
    "noteFa": "نکته گرامری خیلی کوتاه و شفاف به فارسی درباره این مثال"
  }
]`;

  let lastErr = null;
  for (const model of MODELS) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 35000);
    try {
      let res;
      try {
        res = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.45,
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
              temperature: 0.45,
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
      if (!Array.isArray(parsed) || parsed.length < 4) {
        throw new Error('Too few examples returned');
      }
      return parsed
        .filter((e) => e && typeof e.de === 'string' && typeof e.fa === 'string')
        .map((e) => ({
          de: e.de.trim(),
          fa: e.fa.trim(),
          highlight: typeof e.highlight === 'string' ? e.highlight.trim() : undefined,
          noteFa: typeof e.noteFa === 'string' ? e.noteFa.trim() : undefined,
        }));
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
    }
  }
  throw lastErr;
}

const topics = await sql`
  SELECT id, order_index, slug, title_de, title_fa, summary_fa, lesson_content
  FROM grammar_topics
  ORDER BY order_index ASC
`;

const toExpand = topics.filter((t) => {
  const ex = t.lesson_content?.examples;
  return !Array.isArray(ex) || ex.length < 10;
});

console.log(`📚 Expanding examples for ${toExpand.length}/${topics.length} B1 grammar topics...`);

const CONCURRENCY = 4;
for (let i = 0; i < toExpand.length; i += CONCURRENCY) {
  const batch = toExpand.slice(i, i + CONCURRENCY);
  await Promise.all(
    batch.map(async (topic) => {
      const lc = topic.lesson_content || {};
      const currentExamples = Array.isArray(lc.examples) ? lc.examples : [];
      const extra = await generateExtraExamples(topic, currentExamples);

      // Deduplicate by lowercase German sentence
      const seen = new Set(currentExamples.map((e) => String(e.de || '').toLowerCase().trim()));
      const merged = [...currentExamples];
      for (const item of extra) {
        const key = item.de.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(item);
        }
      }

      const updatedLc = { ...lc, examples: merged };
      await sql`
        UPDATE grammar_topics
        SET lesson_content = ${JSON.stringify(updatedLc)}::jsonb
        WHERE id = ${topic.id}
      `;
      console.log(`  ✅ [${topic.order_index}/16] ${topic.slug}: ${currentExamples.length} -> ${merged.length} examples`);
    })
  );
}

console.log('🎉 All 16 B1 grammar topics now have rich expanded examples!');
