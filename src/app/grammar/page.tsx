'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BookOpenCheck,
  Search,
  Sparkles,
  CheckCircle2,
  ArrowLeft,
  Target,
  Dumbbell,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';

interface GrammarTopicSummary {
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
  exerciseCount: number;
  progress: {
    completedCount: number;
    correctCount: number;
    sessionsCompleted: number;
    masteryPct: number;
  };
}

const CATEGORIES = [
  { key: 'ALL', label: 'همه مباحث (۱۶)' },
  { key: 'verbs', label: 'افعال و زمان‌ها' },
  { key: 'clauses', label: 'جملات پیرو' },
  { key: 'passive', label: 'مجهول' },
  { key: 'relative', label: 'جملات موصولی' },
  { key: 'cases', label: 'حالت‌ها و صرف صفت' },
  { key: 'connectors', label: 'ربط‌دهنده‌های دوتایی' },
];

const COLOR_STYLES: Record<string, { badge: string; bar: string; iconBg: string; border: string }> = {
  emerald: {
    badge: 'bg-emerald-100 text-emerald-700',
    bar: 'bg-emerald-500',
    iconBg: 'bg-emerald-100',
    border: 'hover:border-emerald-300',
  },
  sky: {
    badge: 'bg-sky-100 text-sky-700',
    bar: 'bg-sky-500',
    iconBg: 'bg-sky-100',
    border: 'hover:border-sky-300',
  },
  violet: {
    badge: 'bg-violet-100 text-violet-700',
    bar: 'bg-violet-500',
    iconBg: 'bg-violet-100',
    border: 'hover:border-violet-300',
  },
  amber: {
    badge: 'bg-amber-100 text-amber-800',
    bar: 'bg-amber-500',
    iconBg: 'bg-amber-100',
    border: 'hover:border-amber-300',
  },
  rose: {
    badge: 'bg-rose-100 text-rose-700',
    bar: 'bg-rose-500',
    iconBg: 'bg-rose-100',
    border: 'hover:border-rose-300',
  },
  indigo: {
    badge: 'bg-indigo-100 text-indigo-700',
    bar: 'bg-indigo-500',
    iconBg: 'bg-indigo-100',
    border: 'hover:border-indigo-300',
  },
};

export default function GrammarHubPage() {
  const [topics, setTopics] = useState<GrammarTopicSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetch('/api/grammar', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.topics)) setTopics(data.topics);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalExercises = useMemo(
    () => topics.reduce((sum, t) => sum + t.exerciseCount, 0),
    [topics]
  );

  const avgMastery = useMemo(() => {
    if (!topics.length) return 0;
    return Math.round(topics.reduce((s, t) => s + t.progress.masteryPct, 0) / topics.length);
  }, [topics]);

  const masteredTopics = useMemo(
    () => topics.filter((t) => t.progress.masteryPct >= 80).length,
    [topics]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return topics.filter((t) => {
      if (activeCategory !== 'ALL' && t.category !== activeCategory) return false;
      if (!q) return true;
      return (
        t.titleDe.toLowerCase().includes(q) ||
        t.titleFa.toLowerCase().includes(q) ||
        t.summaryFa.toLowerCase().includes(q) ||
        t.categoryFa.toLowerCase().includes(q)
      );
    });
  }, [activeCategory, searchQuery, topics]);

  return (
    <div className="min-h-screen pb-24">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 pt-5 space-y-6">
        {/* Hero Banner */}
        <section className="rounded-[2rem] bg-gradient-to-l from-indigo-600 via-violet-600 to-purple-600 text-white p-6 sm:p-7 shadow-lg relative overflow-hidden">
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-xs px-3 py-1 text-xs font-extrabold">
                <BookOpenCheck className="w-4 h-4" />
                <span>سرفصل کامل رسمی Goethe / telc / Grammatik aktiv B1</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black leading-tight">
                باشگاه تخصصی گرامر B1 📐
              </h1>
              <p className="text-sm text-indigo-100 font-medium leading-relaxed">
                هر گرامری را که در آن ضعف داری مستقیماً انتخاب کن؛ درسنامه شفاف فارسی و اشتباهات رایج فارسی‌زبانان را بخوان و با تمرین‌های گیمیفای‌شده (و تولید بی‌نهایت تمرین با AI) رویش مسلط شو!
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-1 gap-2.5 shrink-0 min-w-[170px]">
              <div className="rounded-2xl bg-white/15 backdrop-blur-xs px-4 py-2.5 text-center">
                <div className="font-de text-2xl font-black">{totalExercises || 320}+</div>
                <div className="text-[11px] font-bold text-indigo-100">تمرین تخصصی آماده</div>
              </div>
              <div className="rounded-2xl bg-white/15 backdrop-blur-xs px-4 py-2.5 text-center">
                <div className="font-de text-2xl font-black">{avgMastery}%</div>
                <div className="text-[11px] font-bold text-indigo-100">
                  تسلط کل ({masteredTopics}/{topics.length || 16})
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Search & Category Filters */}
        <section className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجوی گرامر... (مثلاً Konjunktiv, Passiv, als, Genitiv, مجهول، موصولی)"
              className="w-full rounded-2xl border-2 border-slate-200 bg-white pr-11 pl-4 py-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none shadow-xs"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => {
              const active = activeCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setActiveCategory(cat.key)}
                  className={`shrink-0 rounded-2xl px-3.5 py-2 text-xs font-black border-2 transition ${
                    active
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/40'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Grammar Topics Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-44 rounded-3xl bg-white border-2 border-slate-100 animate-pulse"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl bg-white border-2 border-slate-200 p-10 text-center space-y-2">
            <div className="text-4xl">🔍</div>
            <p className="font-black text-slate-700">مبحثی با این عبارت پیدا نشد</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('ALL');
              }}
              className="text-xs font-extrabold text-indigo-600 hover:underline"
            >
              نمایش همه ۱۶ مبحث گرامر B1
            </button>
          </div>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((topic) => {
              const st = COLOR_STYLES[topic.color] || COLOR_STYLES.emerald;
              const mastered = topic.progress.masteryPct >= 80;
              return (
                <Link
                  key={topic.slug}
                  href={`/grammar/${topic.slug}`}
                  className={`group rounded-3xl bg-white border-2 border-slate-200 ${st.border} p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between gap-4`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-12 h-12 rounded-2xl ${st.iconBg} flex items-center justify-center text-2xl shrink-0 group-hover:scale-105 transition`}
                        >
                          {topic.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${st.badge}`}>
                              #{topic.orderIndex} · {topic.categoryFa}
                            </span>
                            {mastered && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg">
                                <CheckCircle2 className="w-3 h-3" />
                                مسلط
                              </span>
                            )}
                          </div>
                          <h2
                            dir="ltr"
                            className="font-de text-base sm:text-lg font-black text-slate-800 text-left truncate"
                          >
                            {topic.titleDe}
                          </h2>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-sm font-black text-slate-700">{topic.titleFa}</div>
                      <p className="text-xs font-medium text-slate-500 leading-relaxed line-clamp-2">
                        {topic.summaryFa}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-1 border-t border-slate-100">
                    {/* Mastery Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-extrabold">
                        <span className="text-slate-500 flex items-center gap-1">
                          <Dumbbell className="w-3.5 h-3.5 text-indigo-500" />
                          {topic.exerciseCount} تمرین آماده (+ تولید AI ✨)
                        </span>
                        <span className="font-de text-slate-700">{topic.progress.masteryPct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${st.bar}`}
                          style={{ width: `${Math.max(topic.progress.masteryPct, 0)}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs font-black text-indigo-600 group-hover:text-indigo-700">
                      <span className="inline-flex items-center gap-1">
                        <Target className="w-3.5 h-3.5" />
                        درسنامه فارسی + تمرین تخصصی
                      </span>
                      <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        )}

        {/* Tip Footer */}
        <section className="rounded-3xl bg-amber-50 border-2 border-amber-200 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-black text-amber-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-600" />
              می‌خواهی همین گرامرها را همراه با لغات در یک نقشه گام‌به‌گام جلو ببری؟
            </div>
            <p className="text-xs font-bold text-amber-800/80">
              مسیر یادگیری B1 تمام این ۱۶ گرامر را در ۸ فصل منظم همراه با لغات و پادکست ترکیب کرده است.
            </p>
          </div>
          <Link
            href="/learn"
            className="btn-3d shrink-0 rounded-2xl bg-amber-400 border-b-4 border-amber-600 text-amber-950 px-5 py-2.5 text-xs font-black hover:bg-amber-300"
          >
            رفتن به مسیر B1 🗺️
          </Link>
        </section>
      </main>
    </div>
  );
}
