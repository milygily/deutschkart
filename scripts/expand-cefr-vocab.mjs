import { neon } from '@neondatabase/serverless';
import { GoogleGenAI } from '@google/genai';

const sql = neon(process.env.DATABASE_URL);
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY.trim().replace(/^["']|["']$/g, ''),
});

const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];

const DECK_TARGETS = [
  // ================= B1 (HEAVY FOCUS: 6 RICH DECKS, ~180 WORDS!) =================
  {
    slug: 'b1-meinung-entscheidungen',
    title: 'نظردهی، تصمیم‌گیری و جامعه',
    titleDe: 'Meinung & Entscheidungen',
    description: 'لغات کلیدی آزمون Goethe B1 برای بیان نظر، استدلال، موافقت و مخالفت',
    level: 'B1',
    icon: '🧠',
    color: 'violet',
    targetCount: 30,
    topicPrompt:
      'Goethe-Zertifikat B1 vocabulary for expressing opinions, arguments, decisions, agreeing/disagreeing, society, pros & cons (e.g. Nachteil, Kompromiss, behaupten, zustimmen, ablehnen, begründen, widersprechen, Bedeutung, Lösung, Zusammenhang, usw.)',
  },
  {
    slug: 'b1-alltag-behoerden',
    title: 'ادارات، قراردادها و زندگی در آلمان',
    titleDe: 'Behörden, Verträge & Alltag',
    description: 'لغات پرتکرار نامه‌های اداری، بیمه، اجاره‌خانه و زندگی روزمره در آلمان (B1)',
    level: 'B1',
    icon: '🏛️',
    color: 'sky',
    targetCount: 30,
    topicPrompt:
      'Goethe B1 German vocabulary for living in Germany: bureaucracy, Amt, contracts, renting, bank, insurance, formal letters (e.g. Kündigung, Kaution, Nebenkosten, Genehmigung, Aufenthaltserlaubnis, überweisen, unterschreiben, kündigen, verlängern, Gebühr, Nachweis, usw.)',
  },
  {
    slug: 'b1-arbeit-bewerbung',
    title: 'کار، مصاحبه و آموزش حرفه‌ای',
    titleDe: 'Arbeit, Bewerbung & Ausbildung',
    description: 'واژگان ضروری B1 برای رزومه‌نویسی، مصاحبه کاری و محیط کار در آلمان',
    level: 'B1',
    icon: '💼',
    color: 'emerald',
    targetCount: 30,
    topicPrompt:
      'Goethe B1 German vocabulary for job applications, workplace, career, vocational training, university (e.g. Bewerbung, Lebenslauf, Vorstellungsgespräch, Abteilung, Überstunden, Weiterbildung, Zeugnis, Arbeitgeber, sich bewerben, kündigen, vereinbaren, pünktlich, selbstständig, usw.)',
  },
  {
    slug: 'b1-gesundheit-lebensstil',
    title: 'سلامت، ورزش و سبک زندگی',
    titleDe: 'Gesundheit, Sport & Ernährung',
    description: 'لغات سطح B1 درباره تغذیه، ورزش، استرس، پزشک و سبک زندگی سالم',
    level: 'B1',
    icon: '🏃‍♀️',
    color: 'rose',
    targetCount: 30,
    topicPrompt:
      'Goethe B1 German vocabulary for health, nutrition, sports, stress, medical visits, habits (e.g. Ernährung, Bewegung, Gewohnheit, Entspannung, Behandlung, Nebenwirkung, sich erholen, abnehmen, verzichten, vorbeugen, regelmäßig, ausgewogen, erschöpft, usw.)',
  },
  {
    slug: 'b1-medien-umwelt',
    title: 'رسانه، تکنولوژی و محیط زیست',
    titleDe: 'Medien, Technik & Umwelt',
    description: 'موضوعات پرتکرار آزمون شفاهی و کتبی B1 درباره اینترنت، اخبار و حفاظت از طبیعت',
    level: 'B1',
    icon: '🌍',
    color: 'amber',
    targetCount: 30,
    topicPrompt:
      'Goethe B1 German vocabulary for media, internet, smartphones, climate, recycling, nature (e.g. Klimawandel, Energie, Mülltrennung, Verbrauch, Nachricht, Werbung, Suchmaschine, Beitrag, veröffentlichen, verschmutzen, sparen, nutzen, umweltfreundlich, digital, usw.)',
  },
  {
    slug: 'b1-verben-konnektoren',
    title: 'افعال و ربط‌دهنده‌های طلایی B1',
    titleDe: 'Verben & Konnektoren (B1)',
    description: 'ربط‌دهنده‌های کلیدی جمله‌سازی و افعال با حروف اضافه برای نمره عالی در B1',
    level: 'B1',
    icon: '⚡',
    color: 'violet',
    targetCount: 30,
    topicPrompt:
      'Essential Goethe B1 German connectors, adverbs, and high-frequency verbs with prepositions (e.g. obwohl, trotzdem, deshalb, allerdings, außerdem, stattdessen, inzwischen, wenigstens, sich interessieren für, achten auf, abhängen von, sich kümmern um, sich gewöhnen an, sich entscheiden für, teilnehmen an, usw.)',
  },

  // ================= A1 (3 DECKS, ~84 WORDS) =================
  {
    slug: 'a1-alltag-basics',
    title: 'زندگی روزمره و خانه',
    titleDe: 'Alltag & Zuhause',
    description: 'لغات ضروری و پایه‌ای سطح A1 برای شروع مکالمه روزمره در آلمان',
    level: 'A1',
    icon: '🏡',
    color: 'emerald',
    targetCount: 28,
    topicPrompt:
      'Goethe A1 essential German vocabulary for home, furniture, daily routine, days & time (e.g. Zimmer, Bett, Lampe, Spiegel, Dusche, aufräumen, aufstehen, schlafen, kochen, waschen, sauber, müde, usw.)',
  },
  {
    slug: 'a1-unterwegs-stadt',
    title: 'شهر، خرید و رفت‌وآمد',
    titleDe: 'Stadt & Unterwegs',
    description: 'کلمات کاربردی در خیابان، قطار، خرید و آدرس پرسیدن (A1)',
    level: 'A1',
    icon: '🚆',
    color: 'sky',
    targetCount: 28,
    topicPrompt:
      'Goethe A1 German vocabulary for city places, shopping, directions, public transport (e.g. Flughafen, Ampel, Brücke, Bäckerei, Kasse, Preis, abfahren, ankommen, warten, suchen, links, geradeaus, teuer, usw.)',
  },
  {
    slug: 'a1-essen-familie',
    title: 'خوراک، خانواده و روابط',
    titleDe: 'Essen & Familie',
    description: 'لغات پایه‌ای A1 برای رستوران، مواد غذایی، اعضای خانواده و معرفی خود',
    level: 'A1',
    icon: '🍽️',
    color: 'amber',
    targetCount: 28,
    topicPrompt:
      'Goethe A1 German vocabulary for food, drinks, restaurant, family members, hobbies (e.g. Gemüse, Obst, Fleisch, Brot, Käse, Kellner, Speisekarte, Eltern, Geschwister, Großeltern, bestellen, schmecken, lecker, hungrig, usw.)',
  },

  // ================= A2 (3 DECKS, ~84 WORDS) =================
  {
    slug: 'a2-arbeit-gesundheit',
    title: 'سلامت، دکتر و کار روزانه',
    titleDe: 'Gesundheit & Beruf',
    description: 'واژگان کلیدی سطح A2 برای مراجعه به پزشک، اداره و محیط کار',
    level: 'A2',
    icon: '🩺',
    color: 'rose',
    targetCount: 28,
    topicPrompt:
      'Goethe A2 German vocabulary for doctor visits, body, pharmacy, office, work tasks (e.g. Fieber, Husten, Erkältung, Medikament, Terminvereinbarung, Kollege, Besprechung, Aufgabe, sich erkälten, vereinbaren, verschieben, krankgeschrieben, usw.)',
  },
  {
    slug: 'a2-freizeit-beziehungen',
    title: 'احساسات، سفر و اوقات فراغت',
    titleDe: 'Freizeit & Gefühle',
    description: 'بیان احساسات، برنامه‌ریزی سفر و گفتگو با دوستان (A2)',
    level: 'A2',
    icon: '✈️',
    color: 'amber',
    targetCount: 28,
    topicPrompt:
      'Goethe A2 German vocabulary for emotions, travel, hotels, friendships, celebrations (e.g. Unterkunft, Gepäck, Sehenswürdigkeit, Verspätung, Freundschaft, Streit, sich ärgern, sich entschuldigen, empfehlen, buchen, begeistert, nervös, traurig, usw.)',
  },
  {
    slug: 'a2-wohnen-einkaufen',
    title: 'مسکن، خرید و پوشاک',
    titleDe: 'Wohnen & Einkaufen',
    description: 'لغات کاربردی A2 برای اجاره خانه، اسباب‌کشی، فروشگاه و لباس',
    level: 'A2',
    icon: '🛍️',
    color: 'sky',
    targetCount: 28,
    topicPrompt:
      'Goethe A2 German vocabulary for housing, moving, rent, clothing, online shopping, returns (e.g. Miete, Vermieter, Umzug, Heizung, Erdgeschoss, Größe, Rabatt, Quittung, umziehen, anprobieren, umtauschen, liefern, bequem, gemütlich, usw.)',
  },

  // ================= B2 (2 DECKS, ~60 WORDS) =================
  {
    slug: 'b2-beruf-diskussion',
    title: 'کار، استدلال و بحث‌های تخصصی',
    titleDe: 'Beruf & Diskussion (B2)',
    description: 'واژگان حرفه‌ای سطح B2 برای مصاحبه کاری، مقاله و آزمون Goethe/Telc B2',
    level: 'B2',
    icon: '🚀',
    color: 'emerald',
    targetCount: 30,
    topicPrompt:
      'Goethe/Telc B2 German vocabulary for professional discussions, essays, management, negotiation (e.g. Maßnahme, Schwerpunkt, Auswirkung, Standpunkt, Zusammenarbeit, Leistungsdruck, durchsetzen, einschätzen, vertreten, hervorheben, angemessen, umfassend, usw.)',
  },
  {
    slug: 'b2-gesellschaft-kultur',
    title: 'جامعه، اقتصاد و فرهنگ پیشرفته',
    titleDe: 'Gesellschaft & Kultur (B2)',
    description: 'لغات سطح بالای B2 درباره تحولات اجتماعی، علم، اقتصاد و مسائل روز دنیا',
    level: 'B2',
    icon: '🎭',
    color: 'violet',
    targetCount: 30,
    topicPrompt:
      'Goethe/Telc B2 German vocabulary for society, economy, integration, science, research, ethics (e.g. Vielfalt, Vorurteil, Wohlstand, Forschung, Fortschritt, Ungleichheit, Gerechtigkeit, prägen, fördern, hinterfragen, gewährleisten, vielfältig, umstritten, usw.)',
  },
];

async function generateBatch(deck, neededCount, existingWords) {
  const prompt = `You are a master Goethe-Institut German teacher for Persian (Farsi) speakers.
Generate EXACTLY ${neededCount} distinct, high-frequency, practical German vocabulary items for CEFR level ${deck.level} on the topic:
${deck.topicPrompt}

DO NOT include any of these already-existing words: ${existingWords.join(', ')}

Return ONLY a valid JSON array (no markdown fences). Each object MUST have:
{
  "word": "German word WITHOUT article (proper capitalization for nouns, lowercase for verbs/adjectives)",
  "article": "der" | "die" | "das" | null (ONLY for singular nouns; null for verbs/adjectives/adverbs/connectors/phrases),
  "plural": "plural with 'die', e.g. 'die Anträge' (ONLY for countable nouns; otherwise null)",
  "partOfSpeech": "noun" | "verb" | "adjective" | "adverb" | "phrase",
  "verbForms": "for verbs: '3rd sg · Perfekt with hat/ist', e.g. 'nimmt teil · hat teilgenommen' (null for non-verbs)",
  "persianMeaning": "natural, concise Iranian Persian meaning (1 to 2 clear meanings)",
  "englishMeaning": "concise English meaning",
  "exampleDe": "natural practical German sentence at ${deck.level} level using the word",
  "exampleFa": "natural Persian translation of exampleDe",
  "level": "${deck.level}"
}`;

  let lastErr;
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
            temperature: 0.3,
            thinkingConfig: { thinkingBudget: 0 },
            abortSignal: ac.signal,
          },
        });
      } catch (e) {
        if (e?.status === 400 || /INVALID_ARGUMENT|thinking/i.test(e?.message || '')) {
          res = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.3,
              abortSignal: ac.signal,
            },
          });
        } else {
          throw e;
        }
      }
      clearTimeout(timer);
      const cleaned = (res.text || '[]')
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
    }
  }
  throw lastErr || new Error(`Failed to generate for ${deck.slug}`);
}

async function run() {
  console.log('🚀 Expanding DeutschKart CEFR vocabulary (heavy B1 focus)...\n');
  let totalAdded = 0;

  for (const d of DECK_TARGETS) {
    // 1. Ensure deck exists
    let rows = await sql`SELECT id FROM decks WHERE slug = ${d.slug} LIMIT 1`;
    let deckId;
    if (rows.length > 0) {
      deckId = rows[0].id;
    } else {
      const inserted = await sql`
        INSERT INTO decks (slug, title, title_de, description, level, icon, color, is_system, user_id)
        VALUES (${d.slug}, ${d.title}, ${d.titleDe}, ${d.description}, ${d.level}, ${d.icon}, ${d.color}, true, NULL)
        RETURNING id
      `;
      deckId = inserted[0].id;
    }

    // 2. Count existing words in this deck
    const existingInDeck = await sql`
      SELECT gw.word, gw.normalized_word
      FROM deck_cards dc
      JOIN global_words gw ON gw.id = dc.word_id
      WHERE dc.deck_id = ${deckId}
    `;
    const currentCount = existingInDeck.length;
    const needed = d.targetCount - currentCount;

    if (needed <= 0) {
      console.log(`   ⏭️  ${d.level} · ${d.title} already has ${currentCount} words`);
      continue;
    }

    const existingWordsList = existingInDeck.map((r) => r.word);
    console.log(`   ⏳ ${d.level} · ${d.title}: has ${currentCount}, generating ${needed} more...`);

    const generated = await generateBatch(d, needed, existingWordsList);
    let pos = currentCount;
    let addedHere = 0;

    for (const item of generated) {
      if (!item?.word || !item?.persianMeaning) continue;
      const cleanWord = String(item.word).trim().replace(/^(der|die|das)\s+/i, '');
      const normalized = cleanWord.toLowerCase();
      if (!normalized) continue;

      const article =
        item.article === 'der' || item.article === 'die' || item.article === 'das'
          ? item.article
          : null;
      const posTag = ['noun', 'verb', 'adjective', 'adverb', 'phrase'].includes(item.partOfSpeech)
        ? item.partOfSpeech
        : article
          ? 'noun'
          : 'phrase';

      let wordRows = await sql`SELECT id FROM global_words WHERE normalized_word = ${normalized} LIMIT 1`;
      let wordId;
      if (wordRows.length > 0) {
        wordId = wordRows[0].id;
      } else {
        const ins = await sql`
          INSERT INTO global_words (
            normalized_word, word, article, plural, part_of_speech, verb_forms,
            persian_meaning, english_meaning, example_de, example_fa, level
          ) VALUES (
            ${normalized},
            ${cleanWord},
            ${article},
            ${item.plural ? String(item.plural).trim() : null},
            ${posTag},
            ${item.verbForms ? String(item.verbForms).trim() : null},
            ${String(item.persianMeaning).trim()},
            ${item.englishMeaning ? String(item.englishMeaning).trim() : ''},
            ${item.exampleDe ? String(item.exampleDe).trim() : ''},
            ${item.exampleFa ? String(item.exampleFa).trim() : ''},
            ${d.level}
          )
          ON CONFLICT (normalized_word) DO NOTHING
          RETURNING id
        `;
        if (ins.length > 0) {
          wordId = ins[0].id;
        } else {
          const fallback = await sql`SELECT id FROM global_words WHERE normalized_word = ${normalized} LIMIT 1`;
          wordId = fallback[0].id;
        }
      }

      const linked = await sql`
        INSERT INTO deck_cards (deck_id, word_id, position)
        VALUES (${deckId}, ${wordId}, ${pos++})
        ON CONFLICT (deck_id, word_id) DO NOTHING
        RETURNING id
      `;
      if (linked.length > 0) {
        addedHere++;
        totalAdded++;
      }
    }

    console.log(`   ✅ ${d.level} · ${d.title}: +${addedHere} words (total: ${currentCount + addedHere})`);
  }

  console.log(`\n🎉 Done! Added ${totalAdded} brand-new curated words to Neon!`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Expansion failed:', err);
    process.exit(1);
  });
