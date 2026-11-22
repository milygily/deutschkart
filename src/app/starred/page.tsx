'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Star, Volume2, Layers, Target, Palette, ArrowRight } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { SwipeDeckPlayer } from '@/components/SwipeDeckPlayer';
import { QuizPlayer, type QuizMode } from '@/components/QuizPlayer';
import { useApp } from '@/components/AppProvider';
import { formatGermanDisplay, getArticleStyle, type WordCard } from '@/lib/types';
import { speakGerman } from '@/lib/speech';

function StarredContent() {
  const searchParams = useSearchParams();
  const view = searchParams.get('view'); // null | 'study' | 'quiz'
  const rawMode = searchParams.get('mode');
  const quizMode: QuizMode =
    rawMode === 'article' || rawMode === 'mix' ? rawMode : 'meaning';

  const { user, loadingUser, starredIds, toggleStar, showEnglish } = useApp();
  const [cards, setCards] = useState<WordCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (loadingUser) return;
    let active = true;
    setLoading(true);

    if (user) {
      fetch('/api/starred', { cache: 'no-store' })
        .then((r) => r.json())
        .then((data) => {
          if (active && Array.isArray(data.cards)) setCards(data.cards);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      const ids = Array.from(starredIds);
      if (ids.length === 0) {
        setCards([]);
        setLoading(false);
        return;
      }
      fetch('/api/words/by-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (active && Array.isArray(data.cards)) setCards(data.cards);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
    };
  }, [user, loadingUser, starredIds.size]);

  const visibleCards = cards.filter((c) => starredIds.has(c.id));
  const nounCount = visibleCards.filter(
    (c) => c.article === 'der' || c.article === 'die' || c.article === 'das'
  ).length;

  if (view === 'study') {
    return (
      <SwipeDeckPlayer
        deckTitle="کلمات ستاره‌دار ⭐"
        initialCards={visibleCards}
        backHref="/starred"
        quizHref="/starred?view=quiz&mode=mix"
      />
    );
  }

  if (view === 'quiz') {
    return (
      <QuizPlayer
        deckTitle="کلمات ستاره‌دار ⭐"
        cards={visibleCards}
        mode={quizMode}
        backHref="/starred"
      />
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6 pb-24 space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-500 hover:text-slate-800"
      >
        <ArrowRight className="w-4 h-4" />
        بازگشت به دسته‌ها
      </Link>

      {/* Starred Header */}
      <section className="rounded-[2rem] bg-gradient-to-l from-amber-400 to-yellow-400 border-b-4 border-amber-600 p-6 text-amber-950 shadow-lg space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-white/40 flex items-center justify-center text-3xl">
            ⭐
          </div>
          <div>
            <h1 className="text-2xl font-black">فولدر کلمات ستاره‌دار</h1>
            <p className="text-sm font-bold text-amber-900/80">
              {visibleCards.length} کلمه برگزیده و سخت برای مرور اختصاصی
            </p>
          </div>
        </div>

        {visibleCards.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <Link
              href="/starred?view=study"
              className="btn-3d rounded-2xl bg-white text-emerald-700 border-b-4 border-amber-600/30 py-3 px-4 font-black text-sm flex items-center justify-center gap-2"
            >
              <Layers className="w-4 h-4" />
              مرور سوایپ 🃏
            </Link>
            <Link
              href="/starred?view=quiz&mode=meaning"
              className={`btn-3d rounded-2xl bg-amber-950 text-white border-b-4 border-black/40 py-3 px-4 font-extrabold text-sm flex items-center justify-center gap-2 ${
                visibleCards.length < 2 ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <Target className="w-4 h-4" />
              آزمون معنی
            </Link>
            <Link
              href="/starred?view=quiz&mode=article"
              className={`btn-3d rounded-2xl bg-violet-600 text-white border-b-4 border-violet-800 py-3 px-4 font-extrabold text-sm flex items-center justify-center gap-2 ${
                nounCount === 0 ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <Palette className="w-4 h-4" />
              آزمون آرتیکل ({nounCount})
            </Link>
          </div>
        )}
      </section>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-20 rounded-2xl bg-white animate-pulse" />
          ))}
        </div>
      ) : visibleCards.length === 0 ? (
        <div className="rounded-3xl bg-white border-2 border-dashed border-amber-200 p-12 text-center space-y-3">
          <div className="text-5xl">⭐</div>
          <h2 className="text-lg font-extrabold text-slate-700">
            هنوز هیچ کلمه‌ای رو ستاره‌دار نکردی!
          </h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            موقع مرور فلش‌کارت‌ها یا آزمون، روی آیکون ستاره پایین کارت بزن تا کلمات مهم و سختت اینجا جمع بشن.
          </p>
          <Link
            href="/"
            className="btn-3d inline-flex items-center gap-2 rounded-2xl bg-emerald-500 border-b-4 border-emerald-700 text-white px-6 py-3 text-sm font-extrabold"
          >
            رفتن به دسته‌های لغت
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleCards.map((card) => {
            const art = getArticleStyle(card.article);
            return (
              <div
                key={card.id}
                className="rounded-2xl bg-white border-2 border-slate-100 p-4 flex items-center justify-between gap-3 shadow-xs"
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap" dir="ltr">
                    {card.article && (
                      <span
                        className={`font-de text-xs font-extrabold px-2 py-0.5 rounded-lg ${art.badgeBg}`}
                      >
                        {card.article}
                      </span>
                    )}
                    <span className="font-de text-lg font-extrabold text-slate-800">
                      {card.word}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-600">
                    {card.persianMeaning}
                    {showEnglish && card.englishMeaning && (
                      <span className="font-de text-xs text-slate-400 mr-2">
                        · {card.englishMeaning}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => speakGerman(formatGermanDisplay(card))}
                    className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 hover:bg-sky-100 flex items-center justify-center"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => toggleStar(card.id)}
                    className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center"
                    title="حذف از ستاره‌دارها"
                  >
                    <Star className="w-5 h-5 fill-amber-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

export default function StarredPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <Suspense
        fallback={
          <div className="max-w-3xl mx-auto px-4 pt-12">
            <div className="h-48 rounded-3xl bg-white animate-pulse" />
          </div>
        }
      >
        <StarredContent />
      </Suspense>
    </div>
  );
}
