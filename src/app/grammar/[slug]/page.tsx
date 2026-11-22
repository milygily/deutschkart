'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowRight,
  BookOpen,
  Dumbbell,
  Volume2,
  AlertTriangle,
  Sparkles,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Play,
  Shuffle,
  Trophy,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { InteractiveSentence } from '@/components/InteractiveSentence';
import { LessonPlayer, type LessonCompletionPayload } from '@/components/LessonPlayer';
import { preloadGermanAudio, speakGerman, type SpeechPlayState } from '@/lib/speech';
import type { Exercise, GrammarLessonContent } from '@/lib/exercises';

interface GrammarTopicFull {
  id: number;
  slug: string;
  level: string;
  category: string;
  categoryFa: string;
  orderIndex: number;
  titleDe: string;
  titleFa: string;
  summaryFa: string;
  icon: string;
  color: string;
  lessonContent: GrammarLessonContent;
  exercises: Exercise[];
}

interface GrammarProgress {
  completedCount: number;
  correctCount: number;
  sessionsCompleted: number;
  masteryPct: number;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function GrammarTopicDetailPage() {
  const params = useParams();
  const slug = String(params.slug || '');

  const [topic, setTopic] = useState<GrammarTopicFull | null>(null);
  const [progress, setProgress] = useState<GrammarProgress>({
    completedCount: 0,
    correctCount: 0,
    sessionsCompleted: 0,
    masteryPct: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'lesson' | 'practice'>('lesson');

  // Drill player state + Smart unseen-first tracker (prevents seeing repeats!)
  const [activeExercises, setActiveExercises] = useState<Exercise[] | null>(null);
  const [sessionSeed, setSessionSeed] = useState(1);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());

  // Load previously seen exercise IDs for this topic from localStorage
  useEffect(() => {
    if (!slug) return;
    try {
      const raw = localStorage.getItem(`dk_seen_grammar_${slug}`);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setSeenIds(new Set(arr.map(String)));
      }
    } catch {
      // ignore storage errors
    }
  }, [slug]);

  const markExercisesSeen = useCallback(
    (played: Exercise[]) => {
      if (!slug || !played.length) return;
      setSeenIds((prev) => {
        const next = new Set(prev);
        for (const ex of played) next.add(ex.id);
        try {
          localStorage.setItem(`dk_seen_grammar_${slug}`, JSON.stringify(Array.from(next)));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [slug]
  );

  // Audio button feedback state per example
  const [speakingExIdx, setSpeakingExIdx] = useState<number | null>(null);
  const [speakingState, setSpeakingState] = useState<SpeechPlayState>('idle');

  // AI "+10 fresh exercises" generator state
  const [generatingMore, setGeneratingMore] = useState(false);
  const [moreMessage, setMoreMessage] = useState('');
  const [moreError, setMoreError] = useState('');

  const loadTopic = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/grammar/${slug}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.topic) setTopic(data.topic);
      if (data.progress) setProgress(data.progress);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadTopic();
  }, [loadTopic]);

  // Preload grammar example sentences as soon as the topic opens so tapping plays in 0ms
  useEffect(() => {
    if (!topic?.lessonContent?.examples?.length) return;
    const ac = new AbortController();
    void preloadGermanAudio(
      topic.lessonContent.examples.map((ex) => ex.de).filter(Boolean),
      { signal: ac.signal }
    );
    return () => ac.abort();
  }, [topic]);

  const startDrillSession = (mode: 'random10' | 'latest10' | 'all20', customSet?: Exercise[]) => {
    if (!topic) return;
    let picked: Exercise[] = [];
    if (customSet && customSet.length > 0) {
      picked = customSet;
    } else if (mode === 'latest10') {
      picked = topic.exercises.slice(-10);
    } else {
      const targetSize = mode === 'all20' ? Math.min(20, topic.exercises.length) : Math.min(10, topic.exercises.length);
      // Prioritize UNSEEN exercises first so every session feels completely fresh!
      const unseen = shuffle(topic.exercises.filter((ex) => !seenIds.has(ex.id)));
      const alreadySeen = shuffle(topic.exercises.filter((ex) => seenIds.has(ex.id)));

      if (unseen.length >= targetSize) {
        picked = unseen.slice(0, targetSize);
      } else {
        picked = [...unseen, ...alreadySeen].slice(0, targetSize);
        // Once the whole bank has been cycled through, reset seen memory cleanly
        if (unseen.length === 0 && slug) {
          try {
            localStorage.removeItem(`dk_seen_grammar_${slug}`);
          } catch {
            // ignore
          }
          setSeenIds(new Set());
        }
      }
    }
    setSessionSeed((s) => s + 1);
    setActiveExercises(picked);
  };

  const handleGenerateMore = async (autoPlay = false) => {
    if (!topic || generatingMore) return;
    setGeneratingMore(true);
    setMoreMessage('');
    setMoreError('');
    try {
      const res = await fetch(`/api/grammar/${topic.slug}/more`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.newExercises)) {
        setMoreError(data.error || 'خطا در تولید تمرین‌های جدید.');
        return;
      }
      setTopic((prev) =>
        prev
          ? {
              ...prev,
              exercises: [...prev.exercises, ...data.newExercises],
            }
          : prev
      );
      setMoreMessage(
        `✨ ${data.newExercises.length} تمرین کاملاً تازه و غیرتکراری ساخته و به بانک تمرین اضافه شد! (مجموع: ${data.totalExercises} تمرین)`
      );
      if (autoPlay && data.newExercises.length > 0) {
        startDrillSession('latest10', data.newExercises);
      }
    } catch {
      setMoreError('خطا در ارتباط با سرور. دوباره امتحان کن.');
    } finally {
      setGeneratingMore(false);
    }
  };

  const handleDrillComplete = async (payload: LessonCompletionPayload) => {
    if (!topic) return;
    if (activeExercises) {
      markExercisesSeen(activeExercises);
    }
    try {
      const res = await fetch(`/api/grammar/${topic.slug}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.progress) setProgress(data.progress);
      return data;
    } catch {
      return undefined;
    }
  };

  const unseenCount = topic ? topic.exercises.filter((ex) => !seenIds.has(ex.id)).length : 0;

  // Full-screen interactive drill mode
  if (activeExercises && topic) {
    return (
      <LessonPlayer
        key={`grammar-${topic.slug}-${sessionSeed}`}
        title={topic.titleFa}
        subtitle={`باشگاه گرامر B1 · ${topic.titleDe}`}
        exercises={activeExercises}
        xpReward={25}
        guideHint={topic.lessonContent?.formulaDe}
        onExit={() => {
          setActiveExercises(null);
          setActiveTab('practice');
        }}
        onComplete={handleDrillComplete}
        secondaryActionLabel="شروع ۱۰ تمرین جدید دیگر از همین گرامر 🎲"
        onSecondaryAction={() => startDrillSession('random10')}
      />
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 pt-5 space-y-6">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/grammar"
            className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-500 hover:text-slate-800"
          >
            <ArrowRight className="w-4 h-4" />
            بازگشت به باشگاه گرامر B1
          </Link>

          {topic && (
            <span className="font-de text-xs font-black bg-indigo-100 text-indigo-700 px-3 py-1 rounded-xl">
              B1 · #{topic.orderIndex}
            </span>
          )}
        </div>

        {loading || !topic ? (
          <div className="h-72 rounded-3xl bg-white border-2 border-slate-100 animate-pulse" />
        ) : (
          <>
            {/* Topic Header */}
            <section className="rounded-[2rem] bg-white border-2 border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-3xl bg-indigo-100 flex items-center justify-center text-3xl sm:text-4xl shrink-0">
                    {topic.icon}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-xl">
                        {topic.categoryFa}
                      </span>
                      <span className="text-xs font-black bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-xl">
                        {topic.exercises.length} تمرین آماده
                      </span>
                      {unseenCount > 0 && (
                        <span className="text-xs font-black bg-sky-100 text-sky-700 px-2.5 py-0.5 rounded-xl">
                          {unseenCount} تمرین جدید ندیده 🆕
                        </span>
                      )}
                    </div>
                    <h1 dir="ltr" className="font-de text-2xl sm:text-3xl font-black text-slate-800 text-left">
                      {topic.titleDe}
                    </h1>
                    <p className="text-base sm:text-lg font-extrabold text-indigo-700">
                      {topic.titleFa}
                    </p>
                  </div>
                </div>

                {/* Mastery pill + quick start */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-1.5 rounded-2xl bg-emerald-50 border-2 border-emerald-200 px-3 py-1.5 text-xs font-black text-emerald-700">
                    <Trophy className="w-4 h-4" />
                    <span>تسلط: {progress.masteryPct}%</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => startDrillSession('random10')}
                    className="btn-3d rounded-2xl bg-emerald-500 border-b-4 border-emerald-700 text-white px-5 py-2.5 text-xs sm:text-sm font-black flex items-center gap-1.5 hover:bg-emerald-400"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    شروع فوری تمرین
                  </button>
                </div>
              </div>

              {/* Tab Switcher */}
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('lesson')}
                  className={`rounded-xl py-2.5 text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition ${
                    activeTab === 'lesson'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  درسنامه کامل فارسی و جدول‌ها
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('practice')}
                  className={`rounded-xl py-2.5 text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition ${
                    activeTab === 'practice'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Dumbbell className="w-4 h-4" />
                  بانک تمرین گیمیفای‌شده ({topic.exercises.length})
                </button>
              </div>
            </section>

            {/* TAB 1: PERSIAN GRAMMAR GUIDEBOOK */}
            {activeTab === 'lesson' && topic.lessonContent && (
              <div className="space-y-5">
                {/* Golden Formula Card */}
                <section className="rounded-3xl bg-gradient-to-l from-indigo-600 to-violet-600 text-white p-6 sm:p-7 shadow-md space-y-3">
                  <div className="text-sm font-extrabold text-indigo-100">⚡ فرمول طلایی ساختار:</div>
                  <div
                    dir="ltr"
                    className="font-de text-xl sm:text-2xl font-black bg-white/15 rounded-2xl px-4 py-3.5 text-left leading-relaxed"
                  >
                    {topic.lessonContent.formulaDe}
                  </div>
                  <p className="text-base sm:text-[17px] font-bold text-indigo-50 leading-loose">
                    {topic.lessonContent.formulaFa}
                  </p>
                </section>

                {/* Intro + Golden Rules */}
                <section className="rounded-3xl bg-white border-2 border-slate-200 p-6 sm:p-7 space-y-5">
                  <div className="space-y-2.5">
                    <h2 className="text-lg sm:text-xl font-black text-slate-800">
                      کی و چرا از این گرامر استفاده می‌کنیم؟
                    </h2>
                    <p className="text-base sm:text-[17px] font-medium text-slate-700 leading-[2.1]">
                      {topic.lessonContent.introFa}
                    </p>
                  </div>

                  {Array.isArray(topic.lessonContent.keyRulesFa) &&
                    topic.lessonContent.keyRulesFa.length > 0 && (
                      <div className="space-y-3 pt-3 border-t border-slate-100">
                        <h3 className="text-base sm:text-lg font-black text-indigo-700">📌 نکات کلیدی و قوانین مهم:</h3>
                        <ul className="space-y-2.5">
                          {topic.lessonContent.keyRulesFa.map((rule, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-3 text-[15px] sm:text-base font-bold text-slate-800 leading-[1.9] bg-slate-50 rounded-2xl px-4 py-3"
                            >
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-1" />
                              <span>{rule}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </section>

                {/* Grammar Tables */}
                {Array.isArray(topic.lessonContent.tables) &&
                  topic.lessonContent.tables.map((tbl, tIdx) => (
                    <section
                      key={tIdx}
                      className="rounded-3xl bg-white border-2 border-slate-200 p-5 sm:p-6 space-y-3.5"
                    >
                      <h3 className="text-lg font-black text-slate-800">📊 {tbl.titleFa}</h3>
                      <div className="overflow-x-auto rounded-2xl border border-slate-200">
                        <table className="w-full text-[15px] sm:text-base border-collapse min-w-[440px]">
                          <thead>
                            <tr className="bg-indigo-50 text-indigo-900">
                              {tbl.headers.map((h, hIdx) => (
                                <th
                                  key={hIdx}
                                  className="px-4 py-3 font-black text-right border-b border-indigo-100"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {tbl.rows.map((row, rIdx) => (
                              <tr
                                key={rIdx}
                                className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}
                              >
                                {row.map((cell, cIdx) => {
                                  const isDe = /[a-zA-ZäöüßÄÖÜ]/.test(cell) && !/[\u0600-\u06FF]/.test(cell);
                                  return (
                                    <td
                                      key={cIdx}
                                      dir={isDe ? 'ltr' : 'rtl'}
                                      className={`px-4 py-3 border-b border-slate-100 font-bold text-slate-800 ${
                                        isDe ? 'font-de text-left text-indigo-950' : 'text-right'
                                      }`}
                                    >
                                      {cell}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))}

                {/* Interactive Audio Examples */}
                {Array.isArray(topic.lessonContent.examples) &&
                  topic.lessonContent.examples.length > 0 && (
                    <section className="rounded-3xl bg-white border-2 border-slate-200 p-5 sm:p-7 space-y-4 overflow-visible">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h3 className="text-lg sm:text-xl font-black text-slate-800">
                          🗣️ مثال‌های واقعی سطح B1
                        </h3>
                        <span className="rounded-xl bg-sky-100 text-sky-800 px-3 py-1 text-xs sm:text-sm font-black">
                          {topic.lessonContent.examples.length} مثال کاربردی · روی هر کلمه بزن تا معنیش بیاد
                        </span>
                      </div>
                      <div className="space-y-3.5">
                        {topic.lessonContent.examples.map((ex, eIdx) => (
                          <div
                            key={eIdx}
                            className="rounded-2xl bg-slate-50 border-2 border-slate-100 p-4 sm:p-5 space-y-2 overflow-visible"
                          >
                            <div className="flex items-start gap-3.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSpeakingExIdx(eIdx);
                                  speakGerman(ex.de, 0.9, (st) => {
                                    setSpeakingState(st);
                                    if (st === 'idle') setSpeakingExIdx(null);
                                  });
                                }}
                                className={`btn-3d w-12 h-12 rounded-2xl border-b-2 flex items-center justify-center shrink-0 transition ${
                                  speakingExIdx === eIdx && speakingState === 'playing'
                                    ? 'bg-sky-500 border-sky-700 text-white scale-105'
                                    : speakingExIdx === eIdx && speakingState === 'loading'
                                      ? 'bg-sky-200 border-sky-400 text-sky-700'
                                      : 'bg-sky-100 border-sky-300 text-sky-600 hover:bg-sky-200'
                                }`}
                                title="پخش تلفظ آلمانی"
                                aria-label="پخش تلفظ آلمانی"
                              >
                                {speakingExIdx === eIdx && speakingState === 'loading' ? (
                                  <Loader2 className="w-6 h-6 animate-spin" />
                                ) : (
                                  <Volume2 className="w-6 h-6" />
                                )}
                              </button>
                              <div className="flex-1 space-y-1.5">
                                <InteractiveSentence
                                  sentence={ex.de}
                                  highlightWords={ex.highlight ? ex.highlight.split(/\s+/) : undefined}
                                  className="font-de text-lg sm:text-[21px] font-black text-slate-900 leading-relaxed text-left"
                                />
                                <p className="text-base sm:text-[17px] font-bold text-slate-700 leading-relaxed">
                                  {ex.fa}
                                </p>
                                {ex.noteFa && (
                                  <p className="text-sm sm:text-[15px] font-extrabold text-indigo-700 leading-relaxed pt-0.5">
                                    💡 {ex.noteFa}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                {/* Common Persian-Speaker Pitfalls */}
                {Array.isArray(topic.lessonContent.persianPitfalls) &&
                  topic.lessonContent.persianPitfalls.length > 0 && (
                    <section className="rounded-3xl bg-amber-50 border-2 border-amber-200 p-5 sm:p-6 space-y-4">
                      <h3 className="text-lg font-black text-amber-950 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                        اشتباهات رایج فارسی‌زبانان در این گرامر
                      </h3>
                      <div className="space-y-3.5">
                        {topic.lessonContent.persianPitfalls.map((pit, pIdx) => (
                          <div
                            key={pIdx}
                            className="rounded-2xl bg-white border border-amber-200 p-4 sm:p-5 space-y-2.5"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" dir="ltr">
                              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-sm sm:text-base font-de font-bold text-rose-700 line-through">
                                ❌ {pit.wrongDe}
                              </div>
                              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-sm sm:text-base font-de font-extrabold text-emerald-800">
                                ✅ {pit.rightDe}
                              </div>
                            </div>
                            <p className="text-sm sm:text-base font-bold text-slate-700 leading-relaxed">
                              {pit.whyFa}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                {/* Free Official External References */}
                {Array.isArray(topic.lessonContent.externalRefs) &&
                  topic.lessonContent.externalRefs.length > 0 && (
                    <section className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-500">
                        منابع رایگان مرجع آلمانی برای مطالعه بیشتر:
                      </span>
                      {topic.lessonContent.externalRefs.map((ref, idx) => (
                        <a
                          key={idx}
                          href={ref.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-xl bg-white border border-slate-200 px-3 py-1 text-xs font-bold text-sky-700 hover:bg-sky-50"
                        >
                          <span dir="ltr" className="font-de">
                            {ref.label}
                          </span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ))}
                    </section>
                  )}

                {/* Bottom Big CTA to Drills */}
                <button
                  type="button"
                  onClick={() => startDrillSession('random10')}
                  className="btn-3d w-full rounded-2xl bg-emerald-500 border-b-4 border-emerald-700 text-white py-4 px-6 font-black text-base flex items-center justify-center gap-2 shadow-md hover:bg-emerald-400"
                >
                  <Dumbbell className="w-5 h-5" />
                  آماده‌ای؟ شروع ۱۰ تمرین تخصصی این گرامر (+25 XP) 🎯
                </button>
              </div>
            )}

            {/* TAB 2: DEDICATED GAMIFIED DRILLS + INFINITE AI GENERATOR */}
            {activeTab === 'practice' && (
              <div className="space-y-5">
                {/* Progress Summary */}
                <section className="rounded-3xl bg-white border-2 border-slate-200 p-6 space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3">
                      <div className="font-de text-2xl font-black text-emerald-700">
                        {progress.masteryPct}%
                      </div>
                      <div className="text-[11px] font-extrabold text-emerald-800">درصد تسلط</div>
                    </div>
                    <div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-3">
                      <div className="font-de text-2xl font-black text-indigo-700">
                        {topic.exercises.length}
                      </div>
                      <div className="text-[11px] font-extrabold text-indigo-800">کل تمرین‌های بانک</div>
                    </div>
                    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3">
                      <div className="font-de text-2xl font-black text-amber-700">
                        {progress.sessionsCompleted}
                      </div>
                      <div className="text-[11px] font-extrabold text-amber-800">جلسه تمرین‌شده</div>
                    </div>
                  </div>

                  {/* Drill Launchers */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => startDrillSession('random10')}
                      className="btn-3d rounded-2xl bg-emerald-500 border-b-4 border-emerald-700 text-white p-4 text-right space-y-1 hover:bg-emerald-400"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-base">🎯 جلسه ۱۰ تمرینی هوشمند</span>
                        <Shuffle className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-bold text-emerald-50">
                        ترکیبی از جای خالی، جمله‌سازی، تایپ، شنیداری و مکالمه (+25 XP)
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => startDrillSession('all20')}
                      className="btn-3d rounded-2xl bg-sky-500 border-b-4 border-sky-700 text-white p-4 text-right space-y-1 hover:bg-sky-400"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-base">🔥 ماراتن ۲۰ تمرینی عمیق</span>
                        <Dumbbell className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-bold text-sky-50">
                        تمرین فشرده برای تسلط کامل روی تمام ریزه‌کاری‌های این گرامر
                      </p>
                    </button>
                  </div>
                </section>

                {/* Infinite AI Drill Generator Card */}
                <section className="rounded-3xl bg-gradient-to-l from-violet-50 to-indigo-50 border-2 border-violet-200 p-6 space-y-4">
                  <div className="space-y-1.5">
                    <div className="inline-flex items-center gap-1.5 rounded-xl bg-violet-100 text-violet-700 px-3 py-1 text-xs font-black">
                      <Sparkles className="w-4 h-4" />
                      بانک تمرین بی‌نهایت با هوش مصنوعی
                    </div>
                    <h3 className="text-lg font-black text-slate-800">
                      تمرین‌های این گرامر را کامل حل کردی و باز هم تمرین می‌خواهی؟
                    </h3>
                    <p className="text-xs sm:text-sm font-bold text-slate-600 leading-relaxed">
                      با یک کلیک، هوش مصنوعی ۱۰ تمرین کاملاً جدید و غیرتکراری (جای خالی، جمله‌سازی، نوشتاری و شنیداری) دقیقاً برای «{topic.titleDe}» می‌سازد، به بانک ذخیره می‌کند و بلافاصله برای تمرین باز می‌کند!
                    </p>
                  </div>

                  {moreMessage && (
                    <div className="rounded-2xl bg-emerald-100 border border-emerald-300 px-4 py-2.5 text-xs font-extrabold text-emerald-800">
                      {moreMessage}
                    </div>
                  )}
                  {moreError && (
                    <div className="rounded-2xl bg-rose-100 border border-rose-300 px-4 py-2.5 text-xs font-extrabold text-rose-700">
                      {moreError}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={generatingMore}
                      onClick={() => handleGenerateMore(true)}
                      className="btn-3d rounded-2xl bg-violet-600 border-b-4 border-violet-800 text-white px-5 py-3.5 text-sm font-black flex items-center gap-2 hover:bg-violet-500 disabled:opacity-60"
                    >
                      {generatingMore ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          در حال ساخت ۱۰ تمرین تازه...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          ساخت ۱۰ تمرین تازه و شروع فوری ✨
                        </>
                      )}
                    </button>

                    {topic.exercises.length > 20 && (
                      <button
                        type="button"
                        onClick={() => startDrillSession('latest10')}
                        className="rounded-2xl bg-white border-2 border-violet-200 text-violet-700 px-4 py-3 text-xs font-black hover:bg-violet-50"
                      >
                        مرور ۱۰ تمرین آخر اضافه‌شده
                      </button>
                    )}
                  </div>
                </section>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
