'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Star, Camera, Layers, ChevronLeft, BookOpen, Flame } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { useApp } from '@/components/AppProvider';
import { STAGE_META, STAGE_ORDER } from '@/lib/leitner';
import type { DeckSummary } from '@/lib/types';

const LEVEL_TABS = [
  { key: 'MINE', label: 'دسته‌های من ✨' },
  { key: 'ALL', label: 'همه سطوح' },
  { key: 'A1', label: 'A1 مقدماتی' },
  { key: 'A2', label: 'A2 پایه' },
  { key: 'B1', label: 'B1 میانی' },
  { key: 'B2', label: 'B2 پیشرفته' },
];

const COLOR_STYLES: Record<
  string,
  { card: string; badge: string; bar: string; iconBg: string }
> = {
  emerald: {
    card: 'border-emerald-200 hover:border-emerald-400',
    badge: 'bg-emerald-100 text-emerald-700',
    bar: 'bg-emerald-500',
    iconBg: 'bg-emerald-100',
  },
  sky: {
    card: 'border-sky-200 hover:border-sky-400',
    badge: 'bg-sky-100 text-sky-700',
    bar: 'bg-sky-500',
    iconBg: 'bg-sky-100',
  },
  violet: {
    card: 'border-violet-200 hover:border-violet-400',
    badge: 'bg-violet-100 text-violet-700',
    bar: 'bg-violet-500',
    iconBg: 'bg-violet-100',
  },
  amber: {
    card: 'border-amber-200 hover:border-amber-400',
    badge: 'bg-amber-100 text-amber-700',
    bar: 'bg-amber-500',
    iconBg: 'bg-amber-100',
  },
  rose: {
    card: 'border-rose-200 hover:border-rose-400',
    badge: 'bg-rose-100 text-rose-700',
    bar: 'bg-rose-500',
    iconBg: 'bg-rose-100',
  },
};

export default function HomePage() {
  const { user, starredIds } = useApp();
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const [didAutoSelectTab, setDidAutoSelectTab] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch('/api/decks', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (active && Array.isArray(data.decks)) {
          // Put personal decks first (newest first), then system decks
          const sorted = [...data.decks].sort((a, b) => {
            if (a.isSystem !== b.isSystem) return a.isSystem ? 1 : -1;
            if (!a.isSystem && !b.isSystem) return b.id - a.id;
            return a.id - b.id;
          });
          setDecks(sorted);
          const hasMine = sorted.some((d) => !d.isSystem);
          if (!didAutoSelectTab) {
            setActiveTab(hasMine ? 'MINE' : 'ALL');
            setDidAutoSelectTab(true);
          } else if (hasMine && activeTab === 'ALL') {
            setActiveTab('MINE');
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filteredDecks = decks.filter((d) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'MINE') return !d.isSystem;
    return d.level === activeTab;
  });

  return (
    <div className="min-h-screen pb-24">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 pt-6 space-y-7">
        {/* Playful Hero Banner */}
        <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-l from-emerald-500 via-green-500 to-teal-500 p-6 sm:p-8 text-white shadow-xl shadow-emerald-200/60 border-b-4 border-green-700">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-xs font-extrabold">
                <span>🇩🇪</span>
                <span>فلش‌کارت هوشمند و بازی‌گونه زبان آلمانی</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black leading-snug">
                {user ? `سلام ${user.name}! آماده‌ای لغت‌های امروز رو قورت بدی؟ 🔥` : 'لغات آلمانی رو با سوایپ و بازی حفظ کن! 🚀'}
              </h1>
              <p className="text-sm text-emerald-50 font-medium leading-relaxed">
                از دسته‌های آماده <strong>A1 تا B2</strong> شروع کن، یا لیست لغات و{' '}
                <strong>عکس صفحه کتابت</strong> رو بده تا هوش مصنوعی برات فلش‌کارت تر و تمیز بسازه!
              </p>
            </div>

            <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 shrink-0">
              <Link
                href="/create"
                className="btn-3d inline-flex items-center justify-center gap-2 rounded-2xl bg-white text-violet-700 border-b-4 border-violet-200 px-5 py-3.5 font-black text-sm shadow-md hover:bg-violet-50"
              >
                <Sparkles className="w-5 h-5 text-violet-500" />
                ساخت دسته با هوش مصنوعی
                <Camera className="w-4 h-4 text-violet-400" />
              </Link>
              <Link
                href="/starred"
                className="btn-3d inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-400 text-amber-950 border-b-4 border-amber-600 px-5 py-3 font-extrabold text-sm hover:bg-amber-300"
              >
                <Star className="w-4 h-4 fill-amber-950" />
                کلمات ستاره‌دار من ({starredIds.size})
              </Link>
            </div>
          </div>

          {/* Decorative circles */}
          <div className="pointer-events-none absolute -left-10 -bottom-10 w-44 h-44 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute right-1/3 -top-12 w-32 h-32 rounded-full bg-white/10" />
        </section>

        {/* Article Color Quick Cheat-Sheet Pill */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white border-2 border-slate-100 px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-extrabold text-slate-600">
            <BookOpen className="w-4 h-4 text-emerald-500" />
            <span>راهنمای رنگ آرتیکل‌ها روی کارت‌ها:</span>
          </div>
          <div className="flex items-center gap-2 font-de text-xs font-extrabold" dir="ltr">
            <span className="rounded-xl bg-sky-500 text-white px-3 py-1">der (مذکر)</span>
            <span className="rounded-xl bg-rose-500 text-white px-3 py-1">die (مؤنث)</span>
            <span className="rounded-xl bg-emerald-500 text-white px-3 py-1">das (خنثی)</span>
          </div>
        </div>

        {/* CEFR Level Filter Pills */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {LEVEL_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`btn-3d shrink-0 rounded-2xl px-4 py-2.5 text-sm font-extrabold border-2 border-b-4 transition ${
                  activeTab === tab.key
                    ? 'bg-emerald-500 border-emerald-700 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Decks Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div
                  key={n}
                  className="h-48 rounded-3xl bg-white border-2 border-slate-100 animate-pulse p-5"
                />
              ))}
            </div>
          ) : filteredDecks.length === 0 ? (
            <div className="rounded-3xl bg-white border-2 border-dashed border-slate-200 p-10 text-center space-y-3">
              <div className="text-5xl">✨</div>
              <h3 className="text-lg font-extrabold text-slate-700">
                {activeTab === 'MINE'
                  ? 'هنوز دسته شخصی نساختی!'
                  : 'توی این سطح دسته‌ای پیدا نشد.'}
              </h3>
              <p className="text-sm text-slate-500">
                کافیه لیست کلمات درست رو پیست کنی یا از کتابت عکس بگیری تا هوش مصنوعی برات دسته بسازه!
              </p>
              <Link
                href="/create"
                className="btn-3d inline-flex items-center gap-2 rounded-2xl bg-violet-500 border-b-4 border-violet-700 text-white px-6 py-3 text-sm font-extrabold"
              >
                <Sparkles className="w-4 h-4" />
                ساخت اولین دسته با هوش مصنوعی
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDecks.map((deck) => {
                const style = COLOR_STYLES[deck.color] || COLOR_STYLES.emerald;
                const sc = deck.stageCounts || {
                  new: deck.cardCount,
                  learning: 0,
                  familiar: 0,
                  learned: 0,
                  mastered: 0,
                };

                return (
                  <Link
                    key={deck.id}
                    href={`/deck/${deck.id}`}
                    className={`btn-3d group rounded-3xl bg-white border-2 border-b-4 ${style.card} p-5 flex flex-col justify-between gap-4 shadow-sm hover:shadow-md transition`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className={`w-13 h-13 rounded-2xl ${style.iconBg} flex items-center justify-center text-3xl group-hover:scale-110 transition`}
                        >
                          {deck.icon}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {deck.dueCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-black bg-orange-100 text-orange-700 px-2 py-1 rounded-xl">
                              <Flame className="w-3.5 h-3.5 fill-orange-500 text-orange-500" />
                              {deck.dueCount} امروز
                            </span>
                          )}
                          <span
                            className={`font-de text-xs font-black px-2.5 py-1 rounded-xl ${style.badge}`}
                          >
                            {deck.level === 'CUSTOM' ? 'شخصی ✨' : deck.level}
                          </span>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-lg font-black text-slate-800 group-hover:text-emerald-600 transition">
                          {deck.title}
                        </h3>
                        {deck.titleDe && (
                          <div dir="ltr" className="font-de text-xs font-bold text-slate-400 text-right">
                            {deck.titleDe}
                          </div>
                        )}
                        {deck.description && (
                          <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
                            {deck.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between text-xs font-extrabold text-slate-500">
                        <span className="flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5" />
                          {deck.cardCount} لغت
                        </span>
                        <span className="flex items-center gap-0.5 text-emerald-600">
                          شروع
                          <ChevronLeft className="w-4 h-4" />
                        </span>
                      </div>
                      {/* 5-Stage Segmented Mastery Bar */}
                      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
                        {deck.cardCount > 0 &&
                          STAGE_ORDER.map((stage) => {
                            const count = sc[stage] || 0;
                            if (count === 0) return null;
                            const pct = (count / deck.cardCount) * 100;
                            return (
                              <div
                                key={stage}
                                className={`h-full ${STAGE_META[stage].barClass}`}
                                style={{ width: `${pct}%` }}
                                title={`${STAGE_META[stage].label}: ${count}`}
                              />
                            );
                          })}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
