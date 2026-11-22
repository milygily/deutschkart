'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Flame,
  Zap,
  Snowflake,
  BookOpen,
  Headphones,
  Check,
  Play,
  Trophy,
  X,
  Volume2,
  BookOpenCheck,
  Sparkles,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { useApp } from '@/components/AppProvider';
import { speakGerman } from '@/lib/speech';

interface PathLesson {
  id: number;
  slug: string;
  orderIndex: number;
  lessonType: string;
  titleFa: string;
  titleDe: string;
  xpReward: number;
  grammarSlug: string | null;
  exerciseCount: number;
  completed: boolean;
  completedCount: number;
  bestAccuracy: number;
  isCurrent: boolean;
}

interface PathUnit {
  id: number;
  slug: string;
  level: string;
  orderIndex: number;
  titleDe: string;
  titleFa: string;
  descriptionFa: string;
  icon: string;
  color: string;
  linkedDeckId: number | null;
  linkedGrammars: Array<{
    slug: string;
    titleDe: string;
    titleFa: string;
    icon: string;
  }>;
  guidebookFa: {
    summaryFa: string;
    keyPhrases?: Array<{ de: string; fa: string }>;
  };
  lessons: PathLesson[];
}

const UNIT_THEMES: Record<string, { headerBg: string; nodeBg: string; nodeBorder: string; ring: string }> = {
  emerald: {
    headerBg: 'from-emerald-500 to-green-600 border-green-700',
    nodeBg: 'bg-emerald-500',
    nodeBorder: 'border-emerald-700',
    ring: 'ring-emerald-300',
  },
  sky: {
    headerBg: 'from-sky-500 to-blue-600 border-blue-700',
    nodeBg: 'bg-sky-500',
    nodeBorder: 'border-sky-700',
    ring: 'ring-sky-300',
  },
  amber: {
    headerBg: 'from-amber-500 to-orange-500 border-orange-700',
    nodeBg: 'bg-amber-500',
    nodeBorder: 'border-amber-700',
    ring: 'ring-amber-300',
  },
  violet: {
    headerBg: 'from-violet-500 to-purple-600 border-purple-700',
    nodeBg: 'bg-violet-500',
    nodeBorder: 'border-violet-700',
    ring: 'ring-violet-300',
  },
  rose: {
    headerBg: 'from-rose-500 to-pink-600 border-rose-700',
    nodeBg: 'bg-rose-500',
    nodeBorder: 'border-rose-700',
    ring: 'ring-rose-300',
  },
};

const LESSON_TYPE_ICON: Record<string, string> = {
  vocab: '🧩',
  grammar: '📐',
  listening: '🎧',
  review: '🏆',
};

// Duolingo-style winding offset pattern (in px)
const WINDING_OFFSETS = [0, 46, -42, 18];

export default function LearnPathPage() {
  const { user, openAuthModal } = useApp();
  const [units, setUnits] = useState<PathUnit[]>([]);
  const [summary, setSummary] = useState({ totalLessons: 0, completedLessons: 0 });
  const [loading, setLoading] = useState(true);
  const [activeGuideUnit, setActiveGuideUnit] = useState<PathUnit | null>(null);

  useEffect(() => {
    fetch('/api/learn', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.units)) setUnits(data.units);
        if (data.summary) setSummary(data.summary);
      })
      .finally(() => setLoading(false));
  }, [user]);

  const dailyXp = user?.dailyXp ?? 0;
  const dailyGoal = user?.dailyGoal ?? 50;
  const dailyPct = Math.min(100, Math.round((dailyXp / Math.max(1, dailyGoal)) * 100));

  return (
    <div className="min-h-screen pb-28">
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 pt-5 space-y-6">
        {/* Daily Goal + Path Progress Header */}
        <section className="rounded-[2rem] bg-white border-2 border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1 rounded-xl bg-sky-100 text-sky-700 px-2.5 py-0.5 text-xs font-black mb-1">
                🗺️ مسیر جامع B1 فارسی‌زبانان
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-800">
                نقشه یادگیری گام‌به‌گام آلمانی B1
              </h1>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="rounded-2xl bg-amber-50 border-2 border-amber-200 px-3 py-1.5 flex items-center gap-1 text-xs font-black text-amber-700">
                <Flame className="w-4 h-4 fill-amber-500 text-amber-500" />
                <span>{user?.streakCount ?? 0} روز</span>
              </div>
              <div className="rounded-2xl bg-sky-50 border-2 border-sky-200 px-3 py-1.5 flex items-center gap-1 text-xs font-black text-sky-700">
                <Snowflake className="w-4 h-4 text-sky-500" />
                <span>{user?.streakFreezes ?? 2} محافظ</span>
              </div>
              <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-200 px-3 py-1.5 flex items-center gap-1 text-xs font-black text-emerald-700">
                <Trophy className="w-4 h-4" />
                <span>
                  {summary.completedLessons}/{summary.totalLessons || 32} درس
                </span>
              </div>
            </div>
          </div>

          {/* Daily XP Bar */}
          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-extrabold">
              <span className="text-slate-600 flex items-center gap-1">
                <Zap className="w-4 h-4 fill-amber-400 text-amber-500" />
                هدف XP امروز
              </span>
              <span className="font-de font-black text-emerald-700">
                {dailyXp} / {dailyGoal} XP ({dailyPct}%)
              </span>
            </div>
            <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-green-500 transition-all duration-500"
                style={{ width: `${dailyPct}%` }}
              />
            </div>
            {!user && (
              <div className="flex items-center justify-between gap-2 pt-1 text-[11px] font-bold text-slate-500">
                <span>مهمان هستی؛ برای ذخیره دائمی XP و تیک درس‌ها وارد شو.</span>
                <button
                  type="button"
                  onClick={() => openAuthModal('برای ذخیره پیشرفت مسیر B1 وارد حسابت شو')}
                  className="text-emerald-600 font-black hover:underline shrink-0"
                >
                  ورود رایگان
                </button>
              </div>
            )}
          </div>
        </section>

        {/* 8 Winding Units */}
        {loading ? (
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-64 rounded-3xl bg-white border-2 border-slate-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-10">
            {units.map((unit) => {
              const theme = UNIT_THEMES[unit.color] || UNIT_THEMES.emerald;
              const unitDoneCount = unit.lessons.filter((l) => l.completed).length;

              return (
                <section key={unit.slug} className="space-y-6">
                  {/* Colorful Unit Banner */}
                  <div
                    className={`rounded-[2rem] bg-gradient-to-l ${theme.headerBg} border-b-4 text-white p-5 sm:p-6 shadow-md space-y-4`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-2xl">{unit.icon}</span>
                          <span className="font-de text-xs font-black bg-white/20 px-2.5 py-0.5 rounded-full">
                            Unit {unit.orderIndex} · {unitDoneCount}/{unit.lessons.length}
                          </span>
                        </div>
                        <h2 className="text-lg sm:text-xl font-black">{unit.titleFa}</h2>
                        <p dir="ltr" className="font-de text-xs font-bold text-white/85 text-left">
                          {unit.titleDe}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveGuideUnit(unit)}
                        className="btn-3d shrink-0 rounded-2xl bg-white/20 hover:bg-white/30 border-b-2 border-black/15 px-3.5 py-2 text-xs font-black flex items-center gap-1.5 backdrop-blur-xs"
                      >
                        <BookOpen className="w-4 h-4" />
                        درسنامه فصل
                      </button>
                    </div>

                    <p className="text-xs sm:text-sm font-medium text-white/90 leading-relaxed">
                      {unit.descriptionFa}
                    </p>

                    {/* Direct links to Unit's Specialized Grammar Topics + Podcast/Story */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {unit.linkedGrammars.map((g) => (
                        <Link
                          key={g.slug}
                          href={`/grammar/${g.slug}`}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-white/20 hover:bg-white/30 px-3 py-1.5 text-xs font-extrabold transition"
                        >
                          <BookOpenCheck className="w-3.5 h-3.5" />
                          <span dir="ltr" className="font-de">
                            {g.titleDe}
                          </span>
                        </Link>
                      ))}

                      {unit.linkedDeckId && (
                        <Link
                          href={`/deck/${unit.linkedDeckId}/story`}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900/25 hover:bg-slate-900/35 px-3 py-1.5 text-xs font-extrabold transition"
                        >
                          <Headphones className="w-3.5 h-3.5" />
                          <span>پادکست و داستان فصل 🎧</span>
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Winding Stepping-Stone Lesson Path */}
                  <div className="flex flex-col items-center gap-6 py-2 relative">
                    {unit.lessons.map((lesson, idx) => {
                      const offset = WINDING_OFFSETS[idx % WINDING_OFFSETS.length];
                      const icon = LESSON_TYPE_ICON[lesson.lessonType] || '📘';

                      return (
                        <div
                          key={lesson.id}
                          style={{ transform: `translateX(${offset}px)` }}
                          className="relative flex flex-col items-center gap-2"
                        >
                          {/* Floating "شروع کن!" bubble for active lesson */}
                          {lesson.isCurrent && (
                            <div className="animate-bounce mb-1 rounded-2xl bg-white border-2 border-emerald-400 text-emerald-700 px-3.5 py-1 text-xs font-black shadow-md relative">
                              شروع کن! 🚀
                              <span className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-emerald-400" />
                            </div>
                          )}

                          <Link
                            href={`/learn/lesson/${lesson.id}`}
                            className={`btn-3d group relative w-20 h-20 rounded-full border-b-[6px] flex items-center justify-center text-3xl shadow-md transition ${
                              lesson.completed
                                ? 'bg-amber-400 border-amber-600 text-white hover:brightness-105'
                                : lesson.isCurrent
                                  ? `${theme.nodeBg} ${theme.nodeBorder} text-white ring-8 ${theme.ring}`
                                  : 'bg-white border-2 border-slate-200 border-b-slate-300 text-slate-700 hover:border-sky-300 hover:bg-sky-50/40'
                            }`}
                          >
                            {lesson.completed ? (
                              <Check className="w-9 h-9 stroke-[3.2]" />
                            ) : (
                              <span>{icon}</span>
                            )}

                            {/* Small XP pill on badge */}
                            <span className="absolute -bottom-2 bg-slate-800 text-white font-de text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs">
                              +{lesson.xpReward} XP
                            </span>
                          </Link>

                          <div className="text-center max-w-[210px] pt-1">
                            <div className="text-xs sm:text-sm font-black text-slate-800 leading-snug">
                              {lesson.titleFa}
                            </div>
                            <div className="text-[11px] font-bold text-slate-400 flex items-center justify-center gap-1.5 mt-0.5">
                              <span>{lesson.exerciseCount} تمرین</span>
                              {lesson.completed && (
                                <span className="text-emerald-600 font-black">
                                  · بهترین دقت {lesson.bestAccuracy}%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      {/* Unit Guidebook Modal */}
      {activeGuideUnit && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-3"
          onClick={() => setActiveGuideUnit(null)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-[2rem] bg-white border-2 border-slate-200 p-6 shadow-2xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-black text-indigo-600">
                  📖 درسنامه فصل {activeGuideUnit.orderIndex}
                </span>
                <h3 className="text-lg font-black text-slate-800">{activeGuideUnit.titleFa}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveGuideUnit(null)}
                className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm font-bold text-slate-600 leading-loose">
              {activeGuideUnit.guidebookFa?.summaryFa}
            </p>

            {Array.isArray(activeGuideUnit.guidebookFa?.keyPhrases) &&
              activeGuideUnit.guidebookFa.keyPhrases.length > 0 && (
                <div className="space-y-2.5">
                  <div className="text-xs font-black text-slate-500">💬 جملات طلایی این فصل:</div>
                  {activeGuideUnit.guidebookFa.keyPhrases.map((p, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5 flex items-start gap-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => speakGerman(p.de, 0.9)}
                        className="w-9 h-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center shrink-0 hover:bg-sky-200"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                      <div className="flex-1 space-y-0.5">
                        <div dir="ltr" className="font-de text-sm font-black text-slate-800 text-left">
                          {p.de}
                        </div>
                        <div className="text-xs font-bold text-slate-500">{p.fa}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            {activeGuideUnit.linkedGrammars.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="text-xs font-black text-indigo-700 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  تمرین عمیق گرامرهای این فصل در باشگاه گرامر:
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {activeGuideUnit.linkedGrammars.map((g) => (
                    <Link
                      key={g.slug}
                      href={`/grammar/${g.slug}`}
                      className="rounded-2xl bg-indigo-50 border border-indigo-200 px-4 py-3 flex items-center justify-between hover:bg-indigo-100 transition"
                    >
                      <div>
                        <div dir="ltr" className="font-de text-sm font-black text-indigo-900 text-left">
                          {g.icon} {g.titleDe}
                        </div>
                        <div className="text-xs font-bold text-indigo-700">{g.titleFa}</div>
                      </div>
                      <Play className="w-4 h-4 text-indigo-600 shrink-0" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
