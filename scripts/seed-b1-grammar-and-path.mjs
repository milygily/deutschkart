import { GoogleGenAI } from '@google/genai';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '').trim();
if (!apiKey) {
  console.error('❌ GEMINI_API_KEY missing in .env.local');
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey });

const FAST_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
];

const B1_GRAMMAR_TOPICS = [
  {
    slug: 'praeteritum',
    orderIndex: 1,
    category: 'verbs',
    categoryFa: 'افعال و زمان‌ها',
    titleDe: 'Präteritum',
    titleFa: 'گذشته ساده (Präteritum)',
    summaryFa: 'روایت داستان، اخبار و گذشته افعال کمکی و پرکاربرد مثل war, hatte, musste, konnte, ging',
    icon: '📜',
    color: 'emerald',
    focusHint: 'Regular (-te), irregular stem changes (ging, kam, sprach, schrieb, gab), modal verbs (konnte, musste, wollte, durfte, sollte), war & hatte.',
    externalRefs: [
      { label: 'DW Nicos Weg B1 — Präteritum', url: 'https://learngerman.dw.com/de/nicos-weg/c-36519718' },
      { label: 'Mein-Deutschbuch — Präteritum', url: 'https://mein-deutschbuch.de/praeteritum.html' },
    ],
  },
  {
    slug: 'plusquamperfekt',
    orderIndex: 2,
    category: 'verbs',
    categoryFa: 'افعال و زمان‌ها',
    titleDe: 'Plusquamperfekt',
    titleFa: 'ماضی بعید (hatte/war + Partizip II)',
    summaryFa: 'بیان اتفاقی که قبل از یک اتفاق دیگر در گذشته رخ داده — به‌خصوص همراه با nachdem و bevor',
    icon: '⏪',
    color: 'emerald',
    focusHint: 'hatte/war + Partizip II, sequence of past tenses with nachdem (Plusquamperfekt -> Präteritum/Perfekt) and bevor.',
    externalRefs: [
      { label: 'Mein-Deutschbuch — Plusquamperfekt', url: 'https://mein-deutschbuch.de/plusquamperfekt.html' },
      { label: 'Schubert Verlag — B1 Online-Aufgaben', url: 'https://www.schubert-verlag.de/aufgaben/uebungen_b1/b1_uebungen_index.htm' },
    ],
  },
  {
    slug: 'futur-1',
    orderIndex: 3,
    category: 'verbs',
    categoryFa: 'افعال و زمان‌ها',
    titleDe: 'Futur I (werden + Infinitiv)',
    titleFa: 'زمان آینده، وعده و حدس (Futur I)',
    summaryFa: 'ساخت جملات آینده، پیش‌بینی، قول دادن و حدس زدن درباره زمان حال با فعل werden',
    icon: '🔮',
    color: 'sky',
    focusHint: 'werden conjugation (werde, wirst, wird, werden, werdet) + Infinitiv at the end; Vermutung (wohl, sicher, bestimmt) vs. Versprechen/Plan.',
    externalRefs: [
      { label: 'Mein-Deutschbuch — Futur I', url: 'https://mein-deutschbuch.de/futur-1.html' },
      { label: 'DW Nicos Weg B1', url: 'https://learngerman.dw.com/de/nicos-weg/c-36519718' },
    ],
  },
  {
    slug: 'konjunktiv-2',
    orderIndex: 4,
    category: 'verbs',
    categoryFa: 'افعال و زمان‌ها',
    titleDe: 'Konjunktiv II',
    titleFa: 'وجه التزامی (درخواست مؤدبانه و شرطی غیرواقعی)',
    summaryFa: 'درخواست‌های مؤدبانه (Könnten Sie...?)، پیشنهاد (Ich würde...)، آرزو (Wenn ich Zeit hätte...) و شرطی غیرواقعی',
    icon: '✨',
    color: 'violet',
    focusHint: 'würde + Infinitiv, wäre, hätte, könnte, müsste, sollte, dürfte; Wenn-Sätze (irrealer Bedingungssatz), irreale Wünsche (Wenn ich doch nur...!).',
    externalRefs: [
      { label: 'Mein-Deutschbuch — Konjunktiv II', url: 'https://mein-deutschbuch.de/konjunktiv-2.html' },
      { label: 'Schubert Verlag — B1 Konjunktiv II', url: 'https://www.schubert-verlag.de/aufgaben/uebungen_b1/b1_uebungen_index.htm' },
    ],
  },
  {
    slug: 'verben-mit-praepositionen',
    orderIndex: 5,
    category: 'verbs',
    categoryFa: 'افعال و زمان‌ها',
    titleDe: 'Verben mit Präpositionen & da-/wo-',
    titleFa: 'افعال با حرف اضافه ثابت + darauf / worauf',
    summaryFa: 'افعال کلیدی B1 مثل warten auf, sich freuen auf/über, träumen von, denken an + پرسش و ارجاع با wo(r)- و da(r)-',
    icon: '🧲',
    color: 'amber',
    focusHint: 'Fixed verb+preposition+case (warten auf + Akk, sich interessieren für + Akk, sich freuen auf vs über, teilnehmen an + Dat, sprechen mit/über, abhängen von + Dat), Pronominaladverbien (darauf/worauf, darüber/worüber vs auf wen/mit wem for persons).',
    externalRefs: [
      { label: 'Mein-Deutschbuch — Verben mit Präpositionen', url: 'https://mein-deutschbuch.de/verben-mit-praepositionen.html' },
      { label: 'DW Nicos Weg B1', url: 'https://learngerman.dw.com/de/nicos-weg/c-36519718' },
    ],
  },
  {
    slug: 'reflexive-verben',
    orderIndex: 6,
    category: 'verbs',
    categoryFa: 'افعال و زمان‌ها',
    titleDe: 'Reflexive Verben (Akkusativ & Dativ)',
    titleFa: 'افعال انعکاسی (mich/dich vs mir/dir)',
    summaryFa: 'تفاوت ضمایر انعکاسی در آکوزاتیو و داتیو (مثلاً ich wasche mich در برابر ich wasche mir die Hände)',
    icon: '🪞',
    color: 'rose',
    focusHint: 'Reflexive pronouns Akk (mich, dich, sich, uns, euch, sich) vs Dat (mir, dir, sich, uns, euch, sich) when an extra Akkusativ object is present; sich beeilen, sich beschweren, sich merken, sich vorstellen, sich leisten.',
    externalRefs: [
      { label: 'Mein-Deutschbuch — Reflexive Verben', url: 'https://mein-deutschbuch.de/reflexive-verben.html' },
    ],
  },
  {
    slug: 'nebensaetze-kausal-konzessiv-final',
    orderIndex: 7,
    category: 'clauses',
    categoryFa: 'جملات پیرو و ساختار',
    titleDe: 'Nebensätze: weil, da, obwohl, damit, sodass',
    titleFa: 'جملات پیرو علت، تضاد و هدف (فعل آخر جمله!)',
    summaryFa: 'تسلط کامل بر ساختار فعل در انتهای جمله پیرو و تفاوت ظریف weil/denn، obwohl/trotzdem و damit/um...zu',
    icon: '🔗',
    color: 'emerald',
    focusHint: 'Verb-final word order in Nebensatz vs Hauptsatz; weil/da vs denn, obwohl vs trotzdem (Position 1 inversion), damit vs um...zu, sodass/deshalb.',
    externalRefs: [
      { label: 'Mein-Deutschbuch — Nebensätze', url: 'https://mein-deutschbuch.de/nebensaetze.html' },
      { label: 'Schubert Verlag — B1 Konjunktionen', url: 'https://www.schubert-verlag.de/aufgaben/uebungen_b1/b1_uebungen_index.htm' },
    ],
  },
  {
    slug: 'temporalsaetze',
    orderIndex: 8,
    category: 'clauses',
    categoryFa: 'جملات پیرو و ساختار',
    titleDe: 'Temporalsätze: als, wenn, während, bevor, nachdem, seit',
    titleFa: 'جملات پیرو زمانی (تفاوت als و wenn و زمان‌ها)',
    summaryFa: 'مهم‌ترین مبحث زمانی B1: کی از als استفاده کنیم و کی از wenn؟ همچنین während، bevor، nachdem، bis و seit(dem)',
    icon: '⏳',
    color: 'sky',
    focusHint: 'als (single past event) vs wenn (present/future OR repeated past event); während (simultaneous), bevor, nachdem (time shift), seit/seitdem, bis, sobald.',
    externalRefs: [
      { label: 'Mein-Deutschbuch — Temporalsätze', url: 'https://mein-deutschbuch.de/temporalsaetze.html' },
    ],
  },
  {
    slug: 'indirekte-fragen',
    orderIndex: 9,
    category: 'clauses',
    categoryFa: 'جملات پیرو و ساختار',
    titleDe: 'Indirekte Fragen: ob & W-Fragen',
    titleFa: 'پرسش‌های غیرمستقیم و مؤدبانه (ob و کلمات پرسشی)',
    summaryFa: 'تبدیل سوال مستقیم به سوال غیرمستقیم با Können Sie mir sagen, ob / wann / wo... (و رفتن فعل به آخر!)',
    icon: '❓',
    color: 'violet',
    focusHint: 'Ja/Nein questions -> ob + verb at end; W-questions -> wann/wo/wie/warum/wer + verb at end; polite openers (Könnten Sie mir sagen..., Ich möchte wissen..., Weißt du...).',
    externalRefs: [
      { label: 'Mein-Deutschbuch — Indirekte Fragesätze', url: 'https://mein-deutschbuch.de/indirekte-fragesaetze.html' },
    ],
  },
  {
    slug: 'infinitiv-mit-zu',
    orderIndex: 10,
    category: 'clauses',
    categoryFa: 'جملات پیرو و ساختار',
    titleDe: 'Infinitiv mit zu / um...zu / ohne...zu / statt...zu',
    titleFa: 'مصدر با zu و ساختارهای um...zu / ohne...zu / statt...zu',
    summaryFa: 'کی zu می‌گذاریم و کی نه؟ جایگاه zu در افعال جداشدنی (einzukaufen) و تفاوت um...zu با damit',
    icon: '🎯',
    color: 'amber',
    focusHint: 'Infinitiv mit zu after expressions/verbs (versuchen, hoffen, vorhaben, es ist wichtig, Zeit haben) vs without zu (Modalverben, gehen, bleiben, lassen, sehen, hören); separable verbs (anzurufen, einzukaufen); um...zu (same subject) vs damit (different subjects); ohne...zu & (an)statt...zu.',
    externalRefs: [
      { label: 'Mein-Deutschbuch — Infinitivsätze', url: 'https://mein-deutschbuch.de/infinitivsaetze.html' },
    ],
  },
  {
    slug: 'passiv',
    orderIndex: 11,
    category: 'passive',
    categoryFa: 'مجهول',
    titleDe: 'Vorgangspassiv & Passiv mit Modalverben',
    titleFa: 'جملات مجهول (حال، گذشته و با افعال کمکی)',
    summaryFa: 'ساخت جملات مجهول با werden + Partizip II، گذشته (wurde) و با افعال کمکی (muss gemacht werden) + تفاوت von و durch',
    icon: '⚙️',
    color: 'rose',
    focusHint: 'Passiv Präsens (wird + Partizip II), Passiv Präteritum (wurde + Partizip II), Passiv Perfekt (ist + Partizip II + worden), Passiv mit Modalverben (muss/kann/darf + Partizip II + werden); von + Dativ (person) vs durch + Akkusativ (cause/means).',
    externalRefs: [
      { label: 'Mein-Deutschbuch — Passiv', url: 'https://mein-deutschbuch.de/passiv.html' },
      { label: 'Schubert Verlag — B1 Passiv', url: 'https://www.schubert-verlag.de/aufgaben/uebungen_b1/b1_uebungen_index.htm' },
    ],
  },
  {
    slug: 'relativsaetze',
    orderIndex: 12,
    category: 'relative',
    categoryFa: 'جملات موصولی',
    titleDe: 'Relativsätze (Nom, Akk, Dat, Gen & Präpositionen)',
    titleFa: 'جملات موصولی (der/die/das/den/dem/denen/dessen/deren)',
    summaryFa: 'توصیف دقیق افراد و اشیا با ضمایر موصولی در تمام حالت‌ها و با حروف اضافه (mit dem, über die, in dem)',
    icon: '🧭',
    color: 'indigo',
    focusHint: 'Gender/number from Bezugswort, case from verb/preposition inside Relativsatz; special forms: denen (Dat Pl), dessen (Gen Mask/Neutr), deren (Gen Fem/Pl); Relativsatz mit Präposition (mit dem, für die, über das); verb at the end.',
    externalRefs: [
      { label: 'Mein-Deutschbuch — Relativsätze', url: 'https://mein-deutschbuch.de/relativsaetze.html' },
      { label: 'DW Nicos Weg B1 — Relativsätze', url: 'https://learngerman.dw.com/de/nicos-weg/c-36519718' },
    ],
  },
  {
    slug: 'genitiv',
    orderIndex: 13,
    category: 'cases',
    categoryFa: 'حالت‌ها و صرف صفت',
    titleDe: 'Genitiv & Genitiv-Präpositionen',
    titleFa: 'حالت اضافه (Genitiv) و حروف اضافه wegen / trotz / während',
    summaryFa: 'نشان دادن مالکیت و تسلط روی حروف اضافه مهم B1 مثل wegen, trotz, während, innerhalb, außerhalb, statt',
    icon: '👑',
    color: 'amber',
    focusHint: 'des/eines + -(e)s for Mask/Neutr, der/einer for Fem/Pl; Genitiv prepositions: wegen, trotz, während, (an)statt, innerhalb, außerhalb.',
    externalRefs: [
      { label: 'Mein-Deutschbuch — Genitiv', url: 'https://mein-deutschbuch.de/genitiv.html' },
    ],
  },
  {
    slug: 'adjektivdeklination',
    orderIndex: 14,
    category: 'cases',
    categoryFa: 'حالت‌ها و صرف صفت',
    titleDe: 'Adjektivdeklination (alle 3 Typen)',
    titleFa: 'صرف کامل صفت (با آرتیکل معین، نامعین و بدون آرتیکل)',
    summaryFa: 'نقشه ساده و ضد فراموشی برای پایان‌های -e / -en / -er / -es در تمام حالت‌های Nominativ, Akkusativ, Dativ و Genitiv',
    icon: '🎨',
    color: 'emerald',
    focusHint: 'Weak declension after der/die/das/dieser/jeder (-e in the 5-box, -en everywhere else), mixed after ein/kein/mein (shows gender signal in Nom Mask -er, Nom/Akk Neutr -es, Nom/Akk Fem -e, else -en), strong without article (takes der/die/das signal endings).',
    externalRefs: [
      { label: 'Mein-Deutschbuch — Adjektivdeklination', url: 'https://mein-deutschbuch.de/adjektivdeklination.html' },
      { label: 'Schubert Verlag — B1 Adjektivdeklination', url: 'https://www.schubert-verlag.de/aufgaben/uebungen_b1/b1_uebungen_index.htm' },
    ],
  },
  {
    slug: 'n-deklination',
    orderIndex: 15,
    category: 'cases',
    categoryFa: 'حالت‌ها و صرف صفت',
    titleDe: 'n-Deklination (schwache Nomen)',
    titleFa: 'اسم‌های مذکر ضعیف (n-Deklination)',
    summaryFa: 'چرا می‌گوییم «Ich frage den Kollegen» و «mit dem Studenten»؟ شناخت گروه‌های پرکاربرد n-Deklination در B1',
    icon: '🧩',
    color: 'sky',
    focusHint: 'Masculine nouns taking -(e)n in Akk/Dat/Gen Sg & Pl: ending in -e (Kollege, Kunde, Junge, Experte), -ent/-ant/-ist (Student, Praktikant, Tourist, Polizist), special ones (Herr -> Herrn, Mensch, Nachbar, Name -> Namens).',
    externalRefs: [
      { label: 'Mein-Deutschbuch — n-Deklination', url: 'https://mein-deutschbuch.de/n-deklination.html' },
    ],
  },
  {
    slug: 'doppelkonjunktionen',
    orderIndex: 16,
    category: 'connectors',
    categoryFa: 'ربط‌دهنده‌های دوتایی',
    titleDe: 'Doppelkonjunktionen & Vergleiche (je...desto, wie vs als)',
    titleFa: 'ربط‌دهنده‌های دوتایی و مقایسه (zwar...aber, je...desto)',
    summaryFa: 'ارتقای متن و مکالمه به سطح واقعی B1/B2 با zwar...aber، entweder...oder، sowohl...als auch، weder...noch و je...desto',
    icon: '⚡',
    color: 'violet',
    focusHint: 'zwar...aber, entweder...oder, sowohl...als auch, weder...noch, nicht nur...sondern auch, einerseits...andererseits, je + Komparativ ... desto/umso + Komparativ (word order!); Vergleich: genauso...wie vs Komparativ + als.',
    externalRefs: [
      { label: 'Mein-Deutschbuch — Zweiteilige Konjunktionen', url: 'https://mein-deutschbuch.de/konjunktionen.html' },
    ],
  },
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

function sanitizeExercises(rawItems, slug) {
  const out = [];
  if (!Array.isArray(rawItems)) return out;

  rawItems.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const type = String(item.type || '').trim();
    const id = `${slug}-ex-${idx + 1}`;
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
      if (req.length < 3) return;
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
      if (req.length < 3) return;
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
        explanationFa: explanationFa || 'عالی! با تکرار شفاهی ساختار گرامری در ذهن تثبیت می‌شود.',
      });
    }
  });

  return out;
}

async function generateTopicContent(topic) {
  const prompt = `You are a master German B1 grammar author (style of "Grammatik aktiv" + Goethe-Zertifikat B1) writing specifically for Iranian Persian (Farsi) speakers.

Create a complete, crystal-clear Persian lesson AND 20 gamified interactive exercises for this B1 topic:
- German title: ${topic.titleDe}
- Persian title: ${topic.titleFa}
- Scope to cover thoroughly: ${topic.focusHint}

Return ONLY a valid JSON object (no markdown fences) with this exact structure:
{
  "lessonContent": {
    "formulaDe": "Concise German formula, e.g. 'würde + ... + Infinitiv | hätte / wäre / könnte'",
    "formulaFa": "توضیح کوتاه و شفاف فرمول به فارسی",
    "introFa": "۲ تا ۳ جمله صمیمی و دقیق به فارسی درباره اینکه آلمانی‌ها کی و چرا در سطح B1 از این گرامر استفاده می‌کنند",
    "keyRulesFa": [
      "قانون طلایی ۱ به فارسی با مثال آلمانی کوتاه",
      "قانون طلایی ۲",
      "قانون طلایی ۳",
      "قانون طلایی ۴"
    ],
    "tables": [
      {
        "titleFa": "عنوان جدول به فارسی",
        "headers": ["ستون ۱", "ستون ۲", "ستون ۳"],
        "rows": [
          ["سلول", "سلول", "سلول"],
          ["سلول", "سلول", "سلول"]
        ]
      }
    ],
    "examples": [
      {
        "de": "Authentic B1 German sentence.",
        "fa": "ترجمه طبیعی فارسی",
        "highlight": "exact German grammar piece inside de",
        "noteFa": "نکته خیلی کوتاه فارسی درباره این مثال"
      }
    ],
    "persianPitfalls": [
      {
        "wrongDe": "Common mistake Persian speakers make in German",
        "rightDe": "Correct German version",
        "whyFa": "توضیح ساده چرا اشتباه است و چطور درست بگوییم"
      }
    ]
  },
  "exercises": [
    // EXACTLY 20 varied exercises in this mix:
    // - 10 "grammar-cloze" (4 options each, progressive difficulty from core rule to Goethe B1 Sprachbausteine)
    // - 4 "word-bank" (translate Persian -> German sentence using word chips + 2 realistic distractor chips)
    // - 3 "typing" (fill-in-the-blank typing with sentenceBefore & sentenceAfter, testing exact forms/endings)
    // - 2 "listening" (natural B1 sentence with this grammar, mode: "word-bank")
    // - 1 "speaking" (practical everyday B1 sentence using this grammar)
  ]
}

Exact exercise schemas:
1) grammar-cloze:
{"type":"grammar-cloze","instructionFa":"...","sentenceBefore":"... ","sentenceAfter":" ...","translationFa":"...","options":["a","b","c","d"],"answer":"a","fullSentenceDe":"...","explanationFa":"توضیح دقیق فارسی"}
2) word-bank:
{"type":"word-bank","promptFa":"جمله فارسی","hintDe":"راهنمای کوتاه","targetDe":"Complete German sentence.","tokens":["all","words","plus","2distractors"],"explanationFa":"توضیح فارسی"}
3) typing:
{"type":"typing","promptFa":"دستور فارسی کوتاه","sentenceBefore":"... ","sentenceAfter":" ...","answerDe":"missing word","acceptedAnswers":["missing word"],"hintDe":"راهنما مثل مصدر فعل","explanationFa":"توضیح فارسی"}
4) listening:
{"type":"listening","audioDe":"Natural B1 German sentence.","translationFa":"ترجمه فارسی","mode":"word-bank","tokens":["all","words","plus","2distractors"],"explanationFa":"توضیح فارسی"}
5) speaking:
{"type":"speaking","promptFa":"این جمله را با صدای بلند به آلمانی بخوان:","targetDe":"Natural B1 German sentence.","translationFa":"ترجمه فارسی","explanationFa":"نکته کوتاه فارسی"}

Requirements:
- tables: include 1 or 2 crisp, super useful tables (4-7 rows each).
- examples: 4 or 5 high-value daily-life/work-in-Germany B1 examples.
- persianPitfalls: 2 or 3 genuine mistakes Persian speakers make (e.g. translating literally from Persian).
- ALL 20 exercises must be 100% grammatically accurate German, zero typos, zero ambiguous answers!
- Every explanationFa must teach WHY the answer is right in clear Iranian Persian.`;

  let lastErr = null;
  for (const model of FAST_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      let response;
      try {
        response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.3,
            thinkingConfig: { thinkingBudget: 0 },
            abortSignal: controller.signal,
          },
        });
      } catch (innerErr) {
        const msg = innerErr instanceof Error ? innerErr.message : '';
        const status = innerErr?.status;
        if (status === 400 || /INVALID_ARGUMENT|thinking/i.test(msg)) {
          response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.3,
              abortSignal: controller.signal,
            },
          });
        } else {
          throw innerErr;
        }
      }
      clearTimeout(timer);
      const text = response.text?.trim() || '{}';
      const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      const exercises = sanitizeExercises(parsed.exercises || [], topic.slug);
      if (!parsed.lessonContent || exercises.length < 12) {
        throw new Error(`Model ${model} returned incomplete data (${exercises.length} exercises)`);
      }
      parsed.lessonContent.externalRefs = topic.externalRefs || [];
      return { lessonContent: parsed.lessonContent, exercises };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      console.warn(`  ⚠️ ${topic.slug} on ${model} failed: ${err?.message || err}`);
    }
  }
  throw lastErr;
}

// Step 1: Seed all 16 B1 Grammar Topics in concurrent batches of 4
console.log('📚 Seeding 16 Official B1 Grammar Topics (~320+ exercises)...');
const existingTopics = await sql`SELECT slug, jsonb_array_length(exercises) AS cnt FROM grammar_topics`;
const existingMap = new Map(existingTopics.map((r) => [r.slug, Number(r.cnt || 0)]));

const toGenerate = B1_GRAMMAR_TOPICS.filter((t) => (existingMap.get(t.slug) || 0) < 15);
console.log(`   Already ready: ${B1_GRAMMAR_TOPICS.length - toGenerate.length}/16, To generate: ${toGenerate.length}`);

const CONCURRENCY = 4;
for (let i = 0; i < toGenerate.length; i += CONCURRENCY) {
  const batch = toGenerate.slice(i, i + CONCURRENCY);
  await Promise.all(
    batch.map(async (topic) => {
      console.log(`   ⏳ Generating [${topic.orderIndex}/16] ${topic.titleDe}...`);
      const { lessonContent, exercises } = await generateTopicContent(topic);
      await sql`
        INSERT INTO grammar_topics (
          slug, level, category, category_fa, order_index,
          title_de, title_fa, summary_fa, icon, color,
          lesson_content, exercises
        )
        VALUES (
          ${topic.slug}, 'B1', ${topic.category}, ${topic.categoryFa}, ${topic.orderIndex},
          ${topic.titleDe}, ${topic.titleFa}, ${topic.summaryFa}, ${topic.icon}, ${topic.color},
          ${JSON.stringify(lessonContent)}::jsonb, ${JSON.stringify(exercises)}::jsonb
        )
        ON CONFLICT (slug) DO UPDATE SET
          category = EXCLUDED.category,
          category_fa = EXCLUDED.category_fa,
          order_index = EXCLUDED.order_index,
          title_de = EXCLUDED.title_de,
          title_fa = EXCLUDED.title_fa,
          summary_fa = EXCLUDED.summary_fa,
          icon = EXCLUDED.icon,
          color = EXCLUDED.color,
          lesson_content = EXCLUDED.lesson_content,
          exercises = EXCLUDED.exercises
      `;
      console.log(`   ✅ Saved [${topic.orderIndex}/16] ${topic.titleDe} (${exercises.length} exercises)`);
    })
  );
}

// Step 2: Seed 8-Unit B1 Learning Path linked to grammar_topics and system decks
console.log('\n🗺️ Building 8-Unit B1 Learning Path (32 progressive lessons)...');

const allGrammarRows = await sql`SELECT slug, title_de, title_fa, summary_fa, exercises FROM grammar_topics`;
const grammarBySlug = new Map(allGrammarRows.map((r) => [r.slug, r]));

const allDecks = await sql`SELECT id, slug, title FROM decks WHERE is_system = true`;
const deckBySlug = new Map(allDecks.map((d) => [d.slug, d]));

async function getDeckCards(deckSlug) {
  const deck = deckBySlug.get(deckSlug);
  if (!deck) return [];
  return await sql`
    SELECT
      gw.id,
      COALESCE(dc.custom_word, gw.word) AS word,
      COALESCE(dc.custom_article, gw.article) AS article,
      COALESCE(dc.custom_plural, gw.plural) AS plural,
      COALESCE(dc.custom_persian_meaning, gw.persian_meaning) AS persian_meaning,
      COALESCE(dc.custom_example_de, gw.example_de) AS example_de,
      COALESCE(dc.custom_example_fa, gw.example_fa) AS example_fa
    FROM deck_cards dc
    JOIN global_words gw ON gw.id = dc.word_id
    WHERE dc.deck_id = ${deck.id}
    ORDER BY dc.position ASC, dc.id ASC
  `;
}

function buildVocabExercisesFromRows(rows, unitSlug, sliceStart = 0, count = 8) {
  if (!rows.length) return [];
  const slice = rows.slice(sliceStart, sliceStart + 12);
  const pool = slice.length >= 4 ? slice : rows.slice(0, 12);
  const out = [];
  let n = 1;

  // Match pairs warm-up
  if (pool.length >= 4) {
    out.push({
      id: `${unitSlug}-v-${n++}`,
      type: 'match-pairs',
      promptFa: 'کلمات کلیدی این فصل را به معنی فارسی وصل کن:',
      pairs: pool.slice(0, 5).map((r) => ({
        id: String(r.id),
        de: r.article ? `${r.article} ${r.word}` : r.word,
        fa: String(r.persian_meaning).split('،')[0].trim(),
      })),
      explanationFa: 'مرور سریع واژگان اصلی این فصل.',
    });
  }

  // Cloze from examples
  for (const r of pool.slice(0, 3)) {
    if (out.length >= count) break;
    const exDe = String(r.example_de || '').trim();
    const exFa = String(r.example_fa || '').trim();
    const escaped = String(r.word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = exDe.match(new RegExp(`\\b(${escaped}[a-zäöüß]*)\\b`, 'i'));
    if (m && m.index !== undefined) {
      const form = m[1];
      const before = exDe.slice(0, m.index);
      const after = exDe.slice(m.index + form.length);
      const dist = shuffle(
        rows.filter((o) => o.id !== r.id && o.word.toLowerCase() !== r.word.toLowerCase()).map((o) => o.word)
      ).slice(0, 3);
      if (dist.length >= 2) {
        out.push({
          id: `${unitSlug}-v-${n++}`,
          type: 'grammar-cloze',
          instructionFa: 'واژه درست را در جای خالی بگذار:',
          sentenceBefore: before,
          sentenceAfter: after,
          translationFa: exFa,
          options: shuffle([form, ...dist]),
          answer: form,
          fullSentenceDe: exDe,
          explanationFa: `«${r.article ? `${r.article} ` : ''}${r.word}» یعنی «${r.persian_meaning}».`,
          wordId: r.id,
        });
      }
    }
  }

  // Word bank from examples
  for (const r of pool.slice(3, 5)) {
    if (out.length >= count) break;
    const exDe = String(r.example_de || '').trim();
    const exFa = String(r.example_fa || '').trim();
    const toks = tokenizeGerman(exDe);
    if (toks.length >= 3 && toks.length <= 12 && exFa) {
      const extra = ['aber', 'immer', 'heute', 'nicht'].filter(
        (d) => !toks.some((t) => t.toLowerCase() === d)
      ).slice(0, 2);
      out.push({
        id: `${unitSlug}-v-${n++}`,
        type: 'word-bank',
        promptFa: exFa,
        hintDe: r.article ? `${r.article} ${r.word}` : r.word,
        targetDe: exDe,
        tokens: shuffle([...toks, ...extra]),
        explanationFa: `جمله صحیح: ${exDe}`,
        wordId: r.id,
      });
    }
  }

  // Listening
  const listenRow = pool.find((r, i) => i >= 5 && r.example_de && tokenizeGerman(r.example_de).length >= 3) || pool[0];
  if (listenRow && listenRow.example_de && out.length < count) {
    const toks = tokenizeGerman(listenRow.example_de);
    const extra = ['schon', 'sehr', 'mit'].filter((d) => !toks.some((t) => t.toLowerCase() === d)).slice(0, 2);
    out.push({
      id: `${unitSlug}-v-${n++}`,
      type: 'listening',
      audioDe: listenRow.example_de,
      translationFa: listenRow.example_fa || listenRow.persian_meaning,
      mode: 'word-bank',
      tokens: shuffle([...toks, ...extra]),
      explanationFa: `معنی: ${listenRow.example_fa || listenRow.persian_meaning}`,
      wordId: listenRow.id,
    });
  }

  // Speaking
  const speakRow = pool[6] || pool[1];
  if (speakRow && speakRow.example_de && out.length < count) {
    out.push({
      id: `${unitSlug}-v-${n++}`,
      type: 'speaking',
      promptFa: 'این جمله کاربردی را با صدای بلند بخوان:',
      targetDe: speakRow.example_de,
      translationFa: speakRow.example_fa || speakRow.persian_meaning,
      explanationFa: 'تلفظ روان جملات کلیدی، اعتمادبه‌نفس مکالمه B1 را بالا می‌برد.',
      wordId: speakRow.id,
    });
  }

  return out.slice(0, count);
}

const B1_UNITS = [
  {
    slug: 'b1-unit-1',
    orderIndex: 1,
    titleDe: 'Meinung, Gründe & höfliche Fragen',
    titleFa: 'فصل ۱: نظردهی، دلیل آوردن و سوال مؤدبانه',
    descriptionFa: 'بیان عقیده، ساخت جملات پیرو با weil / obwohl / damit و پرسیدن سوالات غیرمستقیم با ob',
    icon: '🧠',
    color: 'emerald',
    linkedDeckSlug: 'b1-meinung-entscheidungen',
    grammarSlugs: ['nebensaetze-kausal-konzessiv-final', 'indirekte-fragen'],
    guidebookFa: {
      summaryFa: 'در این فصل یاد می‌گیری مثل یک آلمانی‌زبان واقعی نظرت را بگویی، دلیل و تضاد را با جملات پیرو بیان کنی و در اداره یا خیابان مؤدبانه سوال بپرسی.',
      keyPhrases: [
        { de: 'Meiner Meinung nach ist das sinnvoll, weil ...', fa: 'به نظر من این منطقی است، چون...' },
        { de: 'Obwohl es schwierig ist, versuche ich es.', fa: 'با اینکه سخت است، امتحانش می‌کنم.' },
        { de: 'Könnten Sie mir sagen, ob der Zug pünktlich kommt?', fa: 'می‌توانید به من بگویید آیا قطار به موقع می‌آید؟' },
      ],
    },
  },
  {
    slug: 'b1-unit-2',
    orderIndex: 2,
    titleDe: 'Vergangenheit & Geschichten erzählen',
    titleFa: 'فصل ۲: روایت گذشته و خاطره‌ها',
    descriptionFa: 'تسلط بر گذشته ساده (Präteritum) و ماضی بعید (Plusquamperfekt) برای تعریف اتفاقات پشت‌سرهم',
    icon: '📜',
    color: 'sky',
    linkedDeckSlug: 'a2-freizeit-beziehungen',
    grammarSlugs: ['praeteritum', 'plusquamperfekt'],
    guidebookFa: {
      summaryFa: 'برای خواندن خبرها، نوشتن نامه و تعریف کردن داستان‌ها و تجربه‌های سفر در سطح B1، ترکیب Präteritum و Plusquamperfekt ضروری است.',
      keyPhrases: [
        { de: 'Früher hatte ich weniger Zeit, aber ich war oft unterwegs.', fa: 'قبلاً وقت کمتری داشتم، ولی زیاد در سفر بودم.' },
        { de: 'Nachdem ich gefrühstückt hatte, ging ich zur Arbeit.', fa: 'بعد از اینکه صبحانه خورده بودم، به سر کار رفتم.' },
      ],
    },
  },
  {
    slug: 'b1-unit-3',
    orderIndex: 3,
    titleDe: 'Zeit, Pläne & Zukunft',
    titleFa: 'فصل ۳: زمان‌بندی، برنامه‌ریزی و آینده',
    descriptionFa: 'تفاوت طلایی als و wenn، ربط‌دهنده‌های زمانی (während, bevor, nachdem, seit) و ساخت آینده با Futur I',
    icon: '⏳',
    color: 'amber',
    linkedDeckSlug: 'b1-verben-konnektoren',
    grammarSlugs: ['temporalsaetze', 'futur-1'],
    guidebookFa: {
      summaryFa: 'یکی از پرتکرارترین سوالات آزمون Goethe و telc B1 تفاوت als و wenn و همچنین بیان برنامه‌ها و حدس‌های آینده با werden است.',
      keyPhrases: [
        { de: 'Als ich nach Deutschland kam, sprach ich kaum Deutsch.', fa: 'وقتی به آلمان آمدم (یک بار در گذشته)، به سختی آلمانی حرف می‌زدم.' },
        { de: 'Immer wenn ich Zeit habe, lerne ich neue Wörter.', fa: 'هر وقت وقت دارم، کلمات جدید یاد می‌گیرم.' },
        { de: 'Nächstes Jahr werde ich die B1-Prüfung bestehen.', fa: 'سال آینده در آزمون B1 قبول خواهم شد.' },
      ],
    },
  },
  {
    slug: 'b1-unit-4',
    orderIndex: 4,
    titleDe: 'Höflichkeit, Wünsche & Alltag in Deutschland',
    titleFa: 'فصل ۴: مؤدبانه حرف زدن، آرزوها و زندگی در آلمان',
    descriptionFa: 'درخواست مؤدبانه و شرطی غیرواقعی (Konjunktiv II) و ساختارهای مصدری (um...zu / ohne...zu / statt...zu)',
    icon: '🏛️',
    color: 'violet',
    linkedDeckSlug: 'b1-alltag-behoerden',
    grammarSlugs: ['konjunktiv-2', 'infinitiv-mit-zu'],
    guidebookFa: {
      summaryFa: 'در ادارات، مطب پزشک و مکاتبات روزمره آلمان، Konjunktiv II کلید مؤدب بودن است و Infinitiv mit zu جملاتت را بسیار طبیعی و کوتاه می‌کند.',
      keyPhrases: [
        { de: 'Hätten Sie nächste Woche einen Termin frei?', fa: 'آیا هفته آینده یک وقت خالی دارید؟ (بسیار مؤدبانه)' },
        { de: 'Ich lerne jeden Tag, um mein Deutsch zu verbessern.', fa: 'هر روز تمرین می‌کنم تا آلمانی‌ام را بهتر کنم.' },
      ],
    },
  },
  {
    slug: 'b1-unit-5',
    orderIndex: 5,
    titleDe: 'Beruf, Bewerbung & Kommunikation',
    titleFa: 'فصل ۵: کار، مصاحبه و ارتباط حرفه‌ای',
    descriptionFa: 'افعال پرکاربرد با حروف اضافه ثابت (warten auf, sich bewerben um) + ضمایر darauf/worauf و افعال انعکاسی',
    icon: '💼',
    color: 'rose',
    linkedDeckSlug: 'b1-arbeit-bewerbung',
    grammarSlugs: ['verben-mit-praepositionen', 'reflexive-verben'],
    guidebookFa: {
      summaryFa: 'افعال با حرف اضافه قلب مکالمه و ایمیل‌نویسی کاری در آلمان هستند؛ در این فصل یاد می‌گیری چه زمانی از darauf/worauf و چه زمانی از mir/mich استفاده کنی.',
      keyPhrases: [
        { de: 'Ich interessiere mich sehr für diese Stelle.', fa: 'من به این موقعیت شغلی بسیار علاقه‌مندم.' },
        { de: 'Ich freue mich schon darauf, Sie kennenzulernen.', fa: 'از الان خوشحالم از اینکه با شما آشنا شوم.' },
      ],
    },
  },
  {
    slug: 'b1-unit-6',
    orderIndex: 6,
    titleDe: 'Medien, Umwelt & genaue Beschreibungen',
    titleFa: 'فصل ۶: رسانه، محیط زیست و توصیف دقیق',
    descriptionFa: 'جملات مجهول (Passiv حال، گذشته و با افعال کمکی) و جملات موصولی (Relativsätze) برای توصیف حرفه‌ای',
    icon: '🌍',
    color: 'emerald',
    linkedDeckSlug: 'b1-medien-umwelt',
    grammarSlugs: ['passiv', 'relativsaetze'],
    guidebookFa: {
      summaryFa: 'در خبرها، دستورالعمل‌ها و بحث‌های محیط‌زیستی مدام با مجهول (wird recycelt) و جملات موصولی (das Projekt, über das wir sprechen) روبه‌رو می‌شوی.',
      keyPhrases: [
        { de: 'In Deutschland wird der Müll sorgfältig getrennt.', fa: 'در آلمان زباله با دقت تفکیک می‌شود.' },
        { de: 'Das ist der Artikel, den ich gestern gelesen habe.', fa: 'این همان مقاله‌ای است که دیروز خواندم.' },
      ],
    },
  },
  {
    slug: 'b1-unit-7',
    orderIndex: 7,
    titleDe: 'Gesundheit, Lebensstil & feine Grammatik',
    titleFa: 'فصل ۷: سلامت، سبک زندگی و ظرافت‌های گرامری',
    descriptionFa: 'حالت اضافه و حروف اضافه Genitiv (wegen, trotz, während) به‌همراه نقشه کامل صرف صفت (Adjektivdeklination)',
    icon: '🏃‍♀️',
    color: 'sky',
    linkedDeckSlug: 'b1-gesundheit-lebensstil',
    grammarSlugs: ['genitiv', 'adjektivdeklination'],
    guidebookFa: {
      summaryFa: 'دو ابزار قدرتمند برای شیک و دقیق حرف زدن در سطح B1: استفاده درست از wegen/trotz با Genitiv و گذاشتن پایان درست برای صفت‌ها.',
      keyPhrases: [
        { de: 'Trotz des schlechten Wetters gehe ich joggen.', fa: 'با وجود هوای بد، می‌روم بدوم.' },
        { de: 'Eine gesunde Ernährung gibt mir neue Energie.', fa: 'یک تغذیه سالم به من انرژی تازه می‌دهد.' },
      ],
    },
  },
  {
    slug: 'b1-unit-8',
    orderIndex: 8,
    titleDe: 'Stark argumentieren & B1-Prüfungsfit',
    titleFa: 'فصل ۸: استدلال حرفه‌ای و آمادگی کامل آزمون B1',
    descriptionFa: 'اسم‌های مذکر ضعیف (n-Deklination) و ربط‌دهنده‌های دوتایی (zwar...aber, je...desto, sowohl...als auch)',
    icon: '🏆',
    color: 'violet',
    linkedDeckSlug: 'b1-verben-konnektoren',
    grammarSlugs: ['n-deklination', 'doppelkonjunktionen'],
    guidebookFa: {
      summaryFa: 'فصل پایانی مسیر B1! با ربط‌دهنده‌های دوتایی (مثل je...desto و zwar...aber) نمره Schreiben و Sprechen آزمون B1 تو جهش بزرگی می‌کند.',
      keyPhrases: [
        { de: 'Je mehr man übt, desto sicherer spricht man Deutsch.', fa: 'هرچه بیشتر تمرین کنی، مطمئن‌تر آلمانی صحبت می‌کنی.' },
        { de: 'Ich habe gestern mit dem neuen Kollegen gesprochen.', fa: 'دیروز با همکار جدید صحبت کردم.' },
      ],
    },
  },
];

for (const unit of B1_UNITS) {
  const [savedUnit] = await sql`
    INSERT INTO course_units (
      slug, level, order_index, title_de, title_fa, description_fa,
      icon, color, grammar_slugs, linked_deck_slug, guidebook_fa
    )
    VALUES (
      ${unit.slug}, 'B1', ${unit.orderIndex}, ${unit.titleDe}, ${unit.titleFa}, ${unit.descriptionFa},
      ${unit.icon}, ${unit.color}, ${JSON.stringify(unit.grammarSlugs)}::jsonb,
      ${unit.linkedDeckSlug}, ${JSON.stringify(unit.guidebookFa)}::jsonb
    )
    ON CONFLICT (slug) DO UPDATE SET
      order_index = EXCLUDED.order_index,
      title_de = EXCLUDED.title_de,
      title_fa = EXCLUDED.title_fa,
      description_fa = EXCLUDED.description_fa,
      icon = EXCLUDED.icon,
      color = EXCLUDED.color,
      grammar_slugs = EXCLUDED.grammar_slugs,
      linked_deck_slug = EXCLUDED.linked_deck_slug,
      guidebook_fa = EXCLUDED.guidebook_fa
    RETURNING id
  `;

  const deckRows = await getDeckCards(unit.linkedDeckSlug);
  const g1 = grammarBySlug.get(unit.grammarSlugs[0]);
  const g2 = grammarBySlug.get(unit.grammarSlugs[1]);
  const g1Ex = Array.isArray(g1?.exercises) ? g1.exercises : [];
  const g2Ex = Array.isArray(g2?.exercises) ? g2.exercises : [];

  const vocabExercises = buildVocabExercisesFromRows(deckRows, unit.slug, unit.orderIndex === 8 ? 12 : 0, 8);
  const g1LessonEx = g1Ex.slice(0, 8);
  const g2LessonEx = g2Ex.slice(0, 8);
  const reviewEx = [
    ...g1Ex.slice(8, 11),
    ...g2Ex.slice(8, 11),
    ...vocabExercises.slice(0, 2),
  ].slice(0, 8);

  const lessons = [
    {
      slug: `${unit.slug}-l1-vocab`,
      orderIndex: 1,
      lessonType: 'vocab',
      titleFa: 'واژگان و جمله‌سازی فصل',
      titleDe: 'Wortschatz & Sätze',
      xpReward: 20,
      grammarSlug: null,
      exercises: vocabExercises.length ? vocabExercises : g1Ex.slice(10, 16),
    },
    {
      slug: `${unit.slug}-l2-grammar1`,
      orderIndex: 2,
      lessonType: 'grammar',
      titleFa: `گرامر اول: ${g1?.title_fa || unit.grammarSlugs[0]}`,
      titleDe: g1?.title_de || unit.grammarSlugs[0],
      xpReward: 25,
      grammarSlug: unit.grammarSlugs[0],
      exercises: g1LessonEx,
    },
    {
      slug: `${unit.slug}-l3-grammar2`,
      orderIndex: 3,
      lessonType: 'grammar',
      titleFa: `گرامر دوم: ${g2?.title_fa || unit.grammarSlugs[1]}`,
      titleDe: g2?.title_de || unit.grammarSlugs[1],
      xpReward: 25,
      grammarSlug: unit.grammarSlugs[1],
      exercises: g2LessonEx,
    },
    {
      slug: `${unit.slug}-l4-review`,
      orderIndex: 4,
      lessonType: 'review',
      titleFa: 'چالش نهایی فصل (ترکیبی)',
      titleDe: 'Kapitel-Check 🏆',
      xpReward: 35,
      grammarSlug: null,
      exercises: reviewEx,
    },
  ];

  for (const les of lessons) {
    await sql`
      INSERT INTO course_lessons (
        unit_id, slug, order_index, lesson_type, title_fa, title_de,
        xp_reward, grammar_slug, exercises
      )
      VALUES (
        ${savedUnit.id}, ${les.slug}, ${les.orderIndex}, ${les.lessonType},
        ${les.titleFa}, ${les.titleDe}, ${les.xpReward}, ${les.grammarSlug},
        ${JSON.stringify(les.exercises)}::jsonb
      )
      ON CONFLICT (slug) DO UPDATE SET
        unit_id = EXCLUDED.unit_id,
        order_index = EXCLUDED.order_index,
        lesson_type = EXCLUDED.lesson_type,
        title_fa = EXCLUDED.title_fa,
        title_de = EXCLUDED.title_de,
        xp_reward = EXCLUDED.xp_reward,
        grammar_slug = EXCLUDED.grammar_slug,
        exercises = EXCLUDED.exercises
    `;
  }
  console.log(`   ✅ Unit ${unit.orderIndex}: ${unit.titleFa} (4 lessons ready)`);
}

// Final Summary
const [gSummary] = await sql`
  SELECT COUNT(*)::int AS topics, COALESCE(SUM(jsonb_array_length(exercises)), 0)::int AS total_exercises
  FROM grammar_topics
`;
const [cSummary] = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM course_units) AS units,
    (SELECT COUNT(*)::int FROM course_lessons) AS lessons
`;
console.log(`\n🎉 DONE! Seeded ${gSummary.topics} B1 Grammar Topics (${gSummary.total_exercises} exercises) + ${cSummary.units} B1 Units (${cSummary.lessons} lessons)!`);
