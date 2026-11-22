'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  Search,
  Volume2,
  Star,
  Loader2,
  Gamepad2,
  Quote,
  Lightbulb,
  MessageCircle,
  Flame,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { InteractiveSentence } from '@/components/InteractiveSentence';
import { LessonPlayer, type LessonCompletionPayload } from '@/components/LessonPlayer';
import { speakGerman, type SpeechPlayState } from '@/lib/speech';
import type { Exercise } from '@/lib/exercises';

interface GermanIdiom {
  id: number;
  slug: string;
  category: string;
  categoryFa: string;
  level: string;
  icon: string;
  expressionDe: string;
  literalFa: string;
  persianEquivalent: string;
  meaningFa: string;
  whenToUseFa: string;
  exampleDe: string;
  exampleFa: string;
  orderIndex: number;
}

const CATEGORIES = [
  { key: 'ALL', label: 'همه اصطلاحات ✨' },
  { key: 'sprichwoerter', label: 'ضرب‌المثل‌های طلایی' },
  { key: 'tiere_essen', label: 'حیوانات و غذا 🐱🥨' },
  { key: 'alltag', label: 'روزمره و فان' },
  { key: 'arbeit', label: 'محیط کار و حرفه‌ای 💼' },
  { key: 'gefuehle', label: 'احساسات و واکنش‌ها 🎭' },
  { key: 'FAV', label: 'نشان‌شده‌های من ⭐' },
];

const LS_FAV_IDIOMS = 'dk_fav_idioms_v1';

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildIdiomGameExercises(pool: GermanIdiom[], allIdioms: GermanIdiom[]): Exercise[] {
  const source = pool.length >= 4 ? shuffle(pool) : shuffle(allIdioms);
  if (source.length < 4) return [];

  const exercises: Exercise[] = [];
  let n = 1;

  // 1. Match Pairs (German idiom -> Persian proverb/equivalent)
  exercises.push({
    id: `idiom-match-${Date.now()}-${n++}`,
    type: 'match-pairs',
    promptFa: 'هر اصطلاح/ضرب‌المثل آلمانی را به معادل فارسی آن وصل کن:',
    pairs: source.slice(0, 5).map((item) => ({
      id: String(item.id),
      de: item.expressionDe,
      fa: item.persianEquivalent,
    })),
    explanationFa: 'عالی! با تطبیق ضرب‌المثل‌های آلمانی و فارسی خیلی سریع توی ذهن می‌مانند.',
  });

  // 2. Cloze Meaning Match (4 choices: which Persian equivalent matches this German idiom?)
  for (const item of source.slice(0, 4)) {
    const distractors = shuffle(
      allIdioms
        .filter((o) => o.id !== item.id && o.persianEquivalent !== item.persianEquivalent)
        .map((o) => o.persianEquivalent)
    ).slice(0, 3);
    if (distractors.length >= 2) {
      exercises.push({
        id: `idiom-meaning-${item.id}-${n++}`,
        type: 'grammar-cloze',
        instructionFa: 'معادل فارسی این اصطلاح/ضرب‌المثل آلمانی کدام است؟',
        sentenceBefore: `${item.expressionDe} `,
        sentenceAfter: '',
        translationFa: `تحت‌اللفظی: «${item.literalFa}»`,
        options: shuffle([item.persianEquivalent, ...distractors]),
        answer: item.persianEquivalent,
        fullSentenceDe: item.expressionDe,
        explanationFa: `${item.meaningFa} — مثال: ${item.exampleDe} (${item.exampleFa})`,
      });
    }
  }

  // 3. Reverse Match (Persian equivalent -> pick the German idiom!)
  for (const item of source.slice(4, 7)) {
    const distractors = shuffle(
      allIdioms
        .filter((o) => o.id !== item.id)
        .map((o) => o.expressionDe)
    ).slice(0, 3);
    if (distractors.length >= 2) {
      exercises.push({
        id: `idiom-rev-${item.id}-${n++}`,
        type: 'grammar-cloze',
        instructionFa: `کدام اصطلاح آلمانی معادل «${item.persianEquivalent}» است؟`,
        sentenceBefore: '',
        sentenceAfter: '',
        translationFa: item.meaningFa,
        options: shuffle([item.expressionDe, ...distractors]),
        answer: item.expressionDe,
        fullSentenceDe: item.expressionDe,
        explanationFa: `تحت‌اللفظی: «${item.literalFa}» · ${item.whenToUseFa}`,
      });
    }
  }

  // 4. Speaking challenge (say an iconic proverb aloud!)
  const speakItem = source[7] || source[0];
  if (speakItem) {
    exercises.push({
      id: `idiom-speak-${speakItem.id}-${n++}`,
      type: 'speaking',
      promptFa: 'این اصطلاح خفن آلمانی را با صدای بلند و با اعتمادبه‌نفس بگو:',
      targetDe: speakItem.expressionDe,
      translationFa: `${speakItem.persianEquivalent} (${speakItem.literalFa})`,
      explanationFa: speakItem.whenToUseFa,
    });
  }

  return exercises.slice(0, 9);
}

export default function IdiomsPage() {
  const [idioms, setIdioms] = useState<GermanIdiom[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [favIds, setFavIds] = useState<Set<number>>(() => new Set());

  // Audio feedback state
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [speakingState, setSpeakingState] = useState<SpeechPlayState>('idle');

  // Fun Game Player state
  const [gameExercises, setGameExercises] = useState<Exercise[] | null>(null);
  const [gameSeed, setGameSeed] = useState(1);

  // AI "+8 new idioms" state
  const [generatingMore, setGeneratingMore] = useState(false);
  const [moreMsg, setMoreMsg] = useState('');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_FAV_IDIOMS) || '[]');
      if (Array.isArray(saved)) setFavIds(new Set(saved.map(Number)));
    } catch {
      // ignore
    }

    fetch('/api/idioms', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.idioms)) setIdioms(data.idioms);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleFav = (id: number) => {
    setFavIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(LS_FAV_IDIOMS, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const playAudio = (key: string, text: string) => {
    setSpeakingKey(key);
    speakGerman(text, 0.9, (st) => {
      setSpeakingState(st);
      if (st === 'idle') setSpeakingKey(null);
    });
  };

  // Idiom of the day (deterministic per calendar day!)
  const idiomOfTheDay = useMemo(() => {
    if (!idioms.length) return null;
    const dayNumber = Math.floor(Date.now() / 86400000);
    return idioms[dayNumber % idioms.length];
  }, [idioms]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return idioms.filter((it) => {
      if (activeCat === 'FAV' && !favIds.has(it.id)) return false;
      if (activeCat !== 'ALL' && activeCat !== 'FAV' && it.category !== activeCat) return false;
      if (!q) return true;
      return (
        it.expressionDe.toLowerCase().includes(q) ||
        it.persianEquivalent.toLowerCase().includes(q) ||
        it.literalFa.toLowerCase().includes(q) ||
        it.meaningFa.toLowerCase().includes(q)
      );
    });
  }, [activeCat, favIds, idioms, searchQuery]);

  const startGame = () => {
    const exs = buildIdiomGameExercises(filtered, idioms);
    if (exs.length > 0) {
      setGameSeed((s) => s + 1);
      setGameExercises(exs);
    }
  };

  const handleGameComplete = async (payload: LessonCompletionPayload) => {
    try {
      const res = await fetch('/api/xp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xp: payload.xpEarned }),
      });
      if (res.ok) return await res.json();
    } catch {
      // ignore
    }
  };

  const handleGenerateMore = async () => {
    if (generatingMore) return;
    setGeneratingMore(true);
    setMoreMsg('');
    try {
      const cat = activeCat !== 'ALL' && activeCat !== 'FAV' ? activeCat : undefined;
      const res = await fetch('/api/idioms/more', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.newIdioms) && data.newIdioms.length > 0) {
        setIdioms((prev) => [...data.newIdioms, ...prev]);
        setMoreMsg(`✨ ${data.newIdioms.length} اصطلاح و ضرب‌المثل جذاب جدید ساخته و به بالای لیست اضافه شد!`);
      } else {
        setMoreMsg(data.error || 'خطا در تولید اصطلاح جدید. دوباره امتحان کن.');
      }
    } catch {
      setMoreMsg('خطا در ارتباط با سرور.');
    } finally {
      setGeneratingMore(false);
    }
  };

  if (gameExercises) {
    return (
      <LessonPlayer
        key={`idiom-game-${gameSeed}`}
        title="بازی اصطلاحات و ضرب‌المثل‌های آلمانی ✨"
        subtitle="آلمانی‌ت رو پولیش کن! (Ausdrücke & Sprichwörter)"
        exercises={gameExercises}
        xpReward={25}
        onExit={() => setGameExercises(null)}
        onComplete={handleGameComplete}
        secondaryActionLabel="شروع یک دور تازه با اصطلاحات جدید 🎲"
        onSecondaryAction={startGame}
      />
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 pt-5 space-y-6">
        {/* Hero Banner */}
        <section className="rounded-[2rem] bg-gradient-to-l from-amber-500 via-orange-500 to-rose-500 text-white p-6 sm:p-7 shadow-lg border-b-4 border-rose-700 relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-xs px-3 py-1 text-xs font-extrabold">
                <Sparkles className="w-4 h-4" />
                <span>Redewendungen & Sprichwörter · بخش فان و حرفه‌ای</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black leading-tight">
                آلمانی‌ت رو پولیش کن! ✨
              </h1>
              <p className="text-sm sm:text-base text-amber-50 font-medium leading-relaxed">
                ضرب‌المثل‌ها و اصطلاحات واقعی که آلمانی‌ها هر روز می‌گویند (همراه با ترجمه تحت‌اللفظی بامزه، معادل شیرین فارسی و مثال صوتی) تا آلمانی‌ات طبیعی و متفاوت به نظر برسد!
              </p>
            </div>

            <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 shrink-0">
              <button
                type="button"
                disabled={idioms.length < 4}
                onClick={startGame}
                className="btn-3d rounded-2xl bg-white text-rose-600 border-b-4 border-rose-200 px-5 py-3.5 font-black text-sm flex items-center justify-center gap-2 shadow-md hover:bg-rose-50 disabled:opacity-50"
              >
                <Gamepad2 className="w-5 h-5" />
                بازی و تمرین اصطلاحات (+25 XP)
              </button>
              <div className="rounded-2xl bg-white/15 backdrop-blur-xs px-4 py-2 text-center text-xs font-black">
                {idioms.length} اصطلاح و ضرب‌المثل آماده (+ تولید AI ✨)
              </div>
            </div>
          </div>
        </section>

        {/* Idiom of the Day Spotlight */}
        {idiomOfTheDay && !searchQuery && activeCat === 'ALL' && (
          <section className="rounded-[2rem] bg-gradient-to-l from-amber-50 to-orange-50 border-2 border-amber-300 p-5 sm:p-6 shadow-xs space-y-3 overflow-visible">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 text-amber-950 px-3 py-1 text-xs font-black">
                <Flame className="w-4 h-4 fill-amber-950" />
                پیشنهاد جذاب امروز 🌟
              </span>
              <span className="text-xs font-extrabold text-amber-800">{idiomOfTheDay.categoryFa}</span>
            </div>

            <div className="flex items-start gap-3.5">
              <button
                type="button"
                onClick={() => playAudio(`daily-${idiomOfTheDay.id}`, idiomOfTheDay.expressionDe)}
                className={`btn-3d w-12 h-12 rounded-2xl border-b-2 flex items-center justify-center shrink-0 transition ${
                  speakingKey === `daily-${idiomOfTheDay.id}` && speakingState === 'playing'
                    ? 'bg-orange-500 border-orange-700 text-white'
                    : 'bg-white border-amber-300 text-orange-600 hover:bg-amber-100'
                }`}
                aria-label="پخش تلفظ"
              >
                {speakingKey === `daily-${idiomOfTheDay.id}` && speakingState === 'loading' ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Volume2 className="w-6 h-6" />
                )}
              </button>

              <div className="flex-1 space-y-1.5">
                <h2 dir="ltr" className="font-de text-xl sm:text-2xl font-black text-slate-900 text-left leading-relaxed">
                  {idiomOfTheDay.icon} {idiomOfTheDay.expressionDe}
                </h2>
                <p className="text-base sm:text-lg font-black text-emerald-700">
                  🇮🇷 {idiomOfTheDay.persianEquivalent}
                </p>
                <p className="text-sm font-bold text-slate-600">
                  🎭 تحت‌اللفظی: «{idiomOfTheDay.literalFa}»
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Search & Category Pills */}
        <section className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو به آلمانی یا فارسی... (مثلاً Katze, Wein, Bahnhof, موش، گربه، کار)"
              className="w-full rounded-2xl border-2 border-slate-200 bg-white pr-11 pl-4 py-3 text-sm sm:text-base font-bold text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none shadow-xs"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => {
              const active = activeCat === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setActiveCat(cat.key)}
                  className={`shrink-0 rounded-2xl px-3.5 py-2 text-xs sm:text-sm font-black border-2 transition ${
                    active
                      ? 'bg-orange-500 border-orange-500 text-white shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300 hover:bg-amber-50/40'
                  }`}
                >
                  {cat.label}
                  {cat.key === 'FAV' && favIds.size > 0 && ` (${favIds.size})`}
                </button>
              );
            })}
          </div>
        </section>

        {moreMsg && (
          <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-200 px-4 py-3 text-sm font-extrabold text-emerald-800">
            {moreMsg}
          </div>
        )}

        {/* Idioms Cards List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-64 rounded-3xl bg-white border-2 border-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl bg-white border-2 border-slate-200 p-10 text-center space-y-2">
            <div className="text-4xl">🧐</div>
            <p className="font-black text-slate-700">
              {activeCat === 'FAV'
                ? 'هنوز هیچ اصطلاحی را ستاره‌دار نکردی! روی ستاره هر کارت بزن تا اینجا جمع بشن.'
                : 'اصطلاحی با این عبارت پیدا نشد'}
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setActiveCat('ALL');
              }}
              className="text-sm font-extrabold text-orange-600 hover:underline"
            >
              نمایش همه اصطلاحات
            </button>
          </div>
        ) : (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {filtered.map((item) => {
              const isFav = favIds.has(item.id);
              const exprKey = `expr-${item.id}`;
              const exKey = `ex-${item.id}`;

              return (
                <article
                  key={item.id}
                  className="rounded-[2rem] bg-white border-2 border-slate-200 hover:border-amber-300 p-5 sm:p-6 shadow-xs hover:shadow-md transition flex flex-col justify-between gap-4 overflow-visible"
                >
                  <div className="space-y-4">
                    {/* Top Row: Category + Level + Favorite */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-2xl">{item.icon}</span>
                        <span className="text-xs font-black bg-amber-100 text-amber-800 px-2.5 py-1 rounded-xl">
                          {item.categoryFa}
                        </span>
                        <span className="font-de text-xs font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">
                          {item.level}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleFav(item.id)}
                        className="p-2 rounded-xl hover:bg-amber-50 transition"
                        aria-label="نشان کردن اصطلاح"
                      >
                        <Star
                          className={`w-5 h-5 ${
                            isFav ? 'fill-amber-400 text-amber-500' : 'text-slate-300'
                          }`}
                        />
                      </button>
                    </div>

                    {/* German Expression + Audio */}
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => playAudio(exprKey, item.expressionDe)}
                        className={`btn-3d w-11 h-11 rounded-2xl border-b-2 flex items-center justify-center shrink-0 transition ${
                          speakingKey === exprKey && speakingState === 'playing'
                            ? 'bg-sky-500 border-sky-700 text-white'
                            : 'bg-sky-100 border-sky-300 text-sky-600 hover:bg-sky-200'
                        }`}
                        title="شنیدن تلفظ آلمانی"
                      >
                        {speakingKey === exprKey && speakingState === 'loading' ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Volume2 className="w-5 h-5" />
                        )}
                      </button>
                      <h2
                        dir="ltr"
                        className="font-de text-xl sm:text-[22px] font-black text-slate-900 text-left leading-snug flex-1"
                      >
                        {item.expressionDe}
                      </h2>
                    </div>

                    {/* Persian Equivalent Highlight */}
                    <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-200 px-4 py-3 space-y-1">
                      <div className="text-[11px] font-extrabold text-emerald-700 flex items-center gap-1">
                        <Quote className="w-3.5 h-3.5" />
                        معادل فارسی:
                      </div>
                      <p className="text-base sm:text-lg font-black text-emerald-950 leading-relaxed">
                        {item.persianEquivalent}
                      </p>
                    </div>

                    {/* Funny Literal Translation + Meaning */}
                    <div className="space-y-2 text-sm sm:text-base">
                      <p className="font-bold text-amber-800 bg-amber-50/70 rounded-xl px-3.5 py-2 leading-relaxed">
                        🎭 تحت‌اللفظی: «{item.literalFa}»
                      </p>
                      <p className="font-medium text-slate-700 leading-relaxed">
                        {item.meaningFa}
                      </p>
                      <p className="text-xs sm:text-sm font-bold text-indigo-700 flex items-start gap-1.5 leading-relaxed">
                        <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
                        <span>{item.whenToUseFa}</span>
                      </p>
                    </div>
                  </div>

                  {/* Interactive Audio Example */}
                  {item.exampleDe && (
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-1.5 overflow-visible">
                      <div className="flex items-start gap-2.5">
                        <button
                          type="button"
                          onClick={() => playAudio(exKey, item.exampleDe)}
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition ${
                            speakingKey === exKey && speakingState === 'playing'
                              ? 'bg-sky-500 text-white'
                              : 'bg-white border border-slate-200 text-sky-600 hover:bg-sky-50'
                          }`}
                          title="پخش تلفظ مثال"
                        >
                          {speakingKey === exKey && speakingState === 'loading' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Volume2 className="w-4 h-4" />
                          )}
                        </button>
                        <div className="flex-1 space-y-1">
                          <div className="text-[11px] font-extrabold text-slate-400 flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" />
                            مثال در مکالمه (روی کلمات بزن تا معنیش بیاد):
                          </div>
                          <InteractiveSentence
                            sentence={item.exampleDe}
                            className="font-de text-base sm:text-[17px] font-extrabold text-slate-800 leading-relaxed text-left"
                          />
                          <p className="text-sm font-bold text-slate-600 leading-relaxed">
                            {item.exampleFa}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}

        {/* Infinite AI Expansion Footer */}
        <section className="rounded-3xl bg-gradient-to-l from-violet-50 to-amber-50 border-2 border-amber-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-black text-slate-800">
              اصطلاحات و ضرب‌المثل‌های بیشتری می‌خواهی؟ ✨
            </h3>
            <p className="text-xs sm:text-sm font-bold text-slate-600">
              با یک کلیک، هوش مصنوعی ۸ اصطلاح جدید و غیرتکراری دیگر با معادل فارسی و مثال واقعی به مجموعه اضافه می‌کند!
            </p>
          </div>
          <button
            type="button"
            disabled={generatingMore}
            onClick={handleGenerateMore}
            className="btn-3d shrink-0 rounded-2xl bg-violet-600 border-b-4 border-violet-800 text-white px-5 py-3.5 text-sm font-black flex items-center gap-2 hover:bg-violet-500 disabled:opacity-60"
          >
            {generatingMore ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                در حال ساخت ۸ اصطلاح تازه...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                ساخت ۸ اصطلاح جدید دیگر ✨
              </>
            )}
          </button>
        </section>
      </main>
    </div>
  );
}
