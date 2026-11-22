import { GoogleGenAI } from '@google/genai';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '').trim();
if (!apiKey) {
  console.error('❌ GEMINI_API_KEY missing');
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey });

const MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.5-flash'];

const CATEGORY_BATCHES = [
  {
    category: 'sprichwoerter',
    categoryFa: 'ضرب‌المثل‌های طلایی',
    startIndex: 1,
    mustInclude: [
      'Wenn die Katze aus dem Haus ist, tanzen die Mäuse auf dem Tisch.',
      'Wasser predigen und Wein trinken.',
      'Morgenstund hat Gold im Mund.',
      'Übung macht den Meister.',
      'Aller Anfang ist schwer.',
      'Wer zuerst kommt, mahlt zuerst.',
      'Wer A sagt, muss auch B sagen.',
      'Lügen haben kurze Beine.',
      'Der Apfel fällt nicht weit vom Stamm.',
      'Viele Köche verderben den Brei.',
      'Not macht erfinderisch.',
      'Besser spät als nie.',
    ],
  },
  {
    category: 'tiere_essen',
    categoryFa: 'حیوانات و خوراکی‌ها 🐱🥨',
    startIndex: 13,
    mustInclude: [
      'Aus einer Mücke einen Elefanten machen',
      'Zwei Fliegen mit einer Klappe schlagen',
      'Tomaten auf den Augen haben',
      'Alles hat ein Ende, nur die Wurst hat zwei.',
      'Das ist nicht mein Bier.',
      'Um den heißen Brei reden',
      'Schwein haben',
      'Eine Extrawurst verlangen',
      'In den sauren Apfel beißen',
      'Da liegt der Hund begraben.',
      'Jemandem einen Bären aufbinden',
    ],
  },
  {
    category: 'alltag',
    categoryFa: 'اصطلاحات روزمره و فان',
    startIndex: 24,
    mustInclude: [
      'Ich verstehe nur Bahnhof.',
      'Die Daumen drücken',
      'Auf dem Schlauch stehen',
      'Die Kirche im Dorf lassen',
      'Das kommt mir spanisch vor.',
      'Ins kalte Wasser springen',
      'Jemandem unter die Arme greifen',
      'Einen Korb bekommen',
      'Hals- und Beinbruch!',
      'Das Eis brechen',
      'Etwas auf die lange Bank schieben',
    ],
  },
  {
    category: 'arbeit',
    categoryFa: 'محیط کار و حرفه‌ای 💼',
    startIndex: 35,
    mustInclude: [
      'Den Nagel auf den Kopf treffen',
      'Kein Blatt vor den Mund nehmen',
      'Grünes Licht geben',
      'Das A und O sein',
      'Einen kühlen Kopf bewahren',
      'Auf eigenen Beinen stehen',
      'Etwas unter Dach und Fach bringen',
      'Am Ball bleiben',
      'Auf der sicheren Seite sein',
      'Das ist ein Tropfen auf den heißen Stein.',
      'An einem Strang ziehen',
    ],
  },
  {
    category: 'gefuehle',
    categoryFa: 'احساسات و واکنش‌ها 🎭',
    startIndex: 46,
    mustInclude: [
      'Die Nase voll haben',
      'Auf Wolke sieben schweben',
      'Schmetterlinge im Bauch haben',
      'Aus dem Häuschen sein',
      'Die Nerven verlieren',
      'Sich etwas hinter die Ohren schreiben',
      'Ein Stein fällt mir vom Herzen',
      'Jemandem auf den Geist gehen',
      'Aus allen Wolken fallen',
      'Jemandem die kalte Schulter zeigen',
    ],
  },
];

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

async function generateBatch(batch) {
  const prompt = `You are a witty, charismatic German-to-Persian language coach creating a fun "Polish your German! (Ausdrücke & Sprichwörter)" collection for Persian (Farsi) speakers in Germany (B1/B2 level).

Create rich, memorable Persian explanations for EVERY ONE of these ${batch.mustInclude.length} authentic German expressions:
${batch.mustInclude.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Return ONLY a valid JSON array (no markdown fences) with ${batch.mustInclude.length} objects in this exact order:
[
  {
    "expressionDe": "exact German proverb or idiom",
    "level": "B1" or "B2",
    "icon": "1 fun relevant emoji",
    "literalFa": "ترجمه تحت‌اللفظی بامزه و دقیق به فارسی (مثلاً: «آب موعظه کردن و شراب نوشیدن!»)",
    "persianEquivalent": "معادل ضرب‌المثل یا اصطلاح کاملاً طبیعی فارسی (مثلاً: «خودش رطب خورده، منع رطب می‌کنه!» یا اگر معادل دقیق ندارد، نزدیک‌ترین اصطلاح روزمره ایرانی)",
    "meaningFa": "توضیح شفاف، صمیمی و دقیق به فارسی (۱ تا ۲ جمله)",
    "whenToUseFa": "نکته کاربردی: رسمی یا دوستانه است؟ کجا بگویی تا آلمانی‌ات طبیعی و حرفه‌ای به نظر برسد؟",
    "exampleDe": "A natural, modern everyday German conversation example sentence using this exact expression.",
    "exampleFa": "ترجمه طبیعی و روان فارسی مثال"
  }
]

Make the Persian equivalents authentic, witty, and natural for Iranian Persian speakers!`;

  let lastErr = null;
  for (const model of MODELS) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 45000);
    try {
      let res;
      try {
        res = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.4,
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
              temperature: 0.4,
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
      if (!Array.isArray(parsed) || parsed.length < 5) throw new Error('Too few idioms returned');
      return parsed;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
    }
  }
  throw lastErr;
}

console.log('✨ Seeding 55 iconic German Ausdrücke, Redewendungen & Sprichwörter...');

await Promise.all(
  CATEGORY_BATCHES.map(async (batch) => {
    const items = await generateBatch(batch);
    let saved = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it?.expressionDe || !it?.persianEquivalent) continue;
      const slug = slugify(it.expressionDe);
      if (!slug) continue;
      await sql`
        INSERT INTO german_idioms (
          slug, category, category_fa, level, icon,
          expression_de, literal_fa, persian_equivalent,
          meaning_fa, when_to_use_fa, example_de, example_fa, order_index
        )
        VALUES (
          ${slug}, ${batch.category}, ${batch.categoryFa},
          ${it.level === 'B2' ? 'B2' : 'B1'}, ${String(it.icon || '✨').slice(0, 4)},
          ${String(it.expressionDe).trim()},
          ${String(it.literalFa || '').trim()},
          ${String(it.persianEquivalent).trim()},
          ${String(it.meaningFa || '').trim()},
          ${String(it.whenToUseFa || '').trim()},
          ${String(it.exampleDe || '').trim()},
          ${String(it.exampleFa || '').trim()},
          ${batch.startIndex + i}
        )
        ON CONFLICT (slug) DO UPDATE SET
          category = EXCLUDED.category,
          category_fa = EXCLUDED.category_fa,
          level = EXCLUDED.level,
          icon = EXCLUDED.icon,
          expression_de = EXCLUDED.expression_de,
          literal_fa = EXCLUDED.literal_fa,
          persian_equivalent = EXCLUDED.persian_equivalent,
          meaning_fa = EXCLUDED.meaning_fa,
          when_to_use_fa = EXCLUDED.when_to_use_fa,
          example_de = EXCLUDED.example_de,
          example_fa = EXCLUDED.example_fa,
          order_index = EXCLUDED.order_index
      `;
      saved++;
    }
    console.log(`  ✅ ${batch.categoryFa}: saved ${saved} expressions`);
  })
);

const [cnt] = await sql`SELECT COUNT(*)::int AS total FROM german_idioms`;
console.log(`🎉 DONE! Total German idioms & proverbs in Neon: ${cnt.total}`);
