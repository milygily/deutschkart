'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowRight,
  Volume2,
  Star,
  Layers,
  Target,
  Palette,
  Zap,
  Trash2,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { useApp } from '@/components/AppProvider';
import { formatGermanDisplay, getArticleStyle, type WordCard } from '@/lib/types';
import { speakGerman } from '@/lib/speech';

interface DeckDetail {
  id: number;
  title: string;
  titleDe: string;
  description: string;
  level: string;
  icon: string;
  color: string;
  isSystem: boolean;
}

export default function DeckDetailPage() {
  const params = useParams();
  const router = useRouter();
  const deckId = Number(params.id);
  const { user, showEnglish, starredIds, toggleStar, masteredIds } = useApp();

  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [cards, setCards] = useState<WordCard[]>([]);
  const [savedBrowseIndex, setSavedBrowseIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!deckId) return;
    Promise.all([
      fetch(`/api/decks/${deckId}`, { cache: 'no-store' }).then((r) => r.json()),
      user
        ? fetch(`/api/decks/${deckId}/bookmark`, { cache: 'no-store' }).then((r) => r.json())
        : Promise.resolve({ lastIndex: 0 }),
    ])
      .then(([data, bm]) => {
        if (data.deck) setDeck(data.deck);
        if (Array.isArray(data.cards)) setCards(data.cards);
        let idx = Number(bm?.lastIndex) || 0;
        try {
          const localVal = Number(localStorage.getItem(`dk_browse_pos_${deckId}`)) || 0;
          if (!user || localVal > idx) idx = Math.max(idx, localVal);
        } catch {
          // ignore
        }
        setSavedBrowseIndex(idx);
      })
      .finally(() => setLoading(false));
  }, [deckId, user]);

  async function handleDelete() {
    if (!deck || deck.isSystem) return;
    if (!confirm(`دسته «${deck.title}» حذف شود؟`)) return;
    setDeleting(true);
    const res = await fetch(`/api/decks/${deck.id}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/');
    } else {
      setDeleting(false);
    }
  }

  const nounCount = cards.filter(
    (c) => c.article === 'der' || c.article === 'die' || c.article === 'das'
  ).length;
  const masteredCount = cards.filter(
    (c) => c.progress?.mastered || masteredIds.has(c.id)
  ).length;

  return (
    <div className="min-h-screen pb-24">
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 pt-5 space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-500 hover:text-slate-800"
          >
            <ArrowRight className="w-4 h-4" />
            بازگشت به دسته‌ها
          </Link>

          {deck && !deck.isSystem && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 px-3 py-1.5 text-xs font-extrabold"
            >
              <Trash2 className="w-4 h-4" />
              حذف دسته
            </button>
          )}
        </div>

        {loading || !deck ? (
          <div className="h-64 rounded-3xl bg-white border-2 border-slate-100 animate-pulse" />
        ) : (
          <>
            {/* Header Card */}
            <section className="rounded-[2rem] bg-white border-2 border-slate-200 p-6 shadow-sm space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-3xl bg-emerald-100 flex items-center justify-center text-4xl shrink-0">
                  {deck.icon}
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-de text-xs font-black bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-xl">
                      {deck.level === 'CUSTOM' ? 'دسته شخصی ✨' : deck.level}
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                      {cards.length} کلمه · {masteredCount} حفظ‌شده
                    </span>
                  </div>
                  <h1 className="text-2xl font-black text-slate-800">{deck.title}</h1>
                  {deck.description && (
                    <p className="text-sm text-slate-500">{deck.description}</p>
                  )}
                </div>
              </div>

              {/* Action Modes */}
              <div className="space-y-3 pt-1">
                <Link
                  href={`/deck/${deck.id}/browse`}
                  className="btn-3d w-full rounded-2xl bg-teal-500 border-b-4 border-teal-700 text-white py-4 px-5 flex items-center justify-center gap-2.5 font-black text-base shadow-md hover:bg-teal-400 flex-wrap"
                >
                  <BookOpen className="w-5 h-5" />
                  <span>مرور آزاد کلمات (بدون امتیاز 📖)</span>
                  {savedBrowseIndex > 0 && cards.length > 0 && (
                    <span className="rounded-xl bg-white/25 px-2.5 py-0.5 text-xs font-extrabold">
                      ادامه از کارت {Math.min(savedBrowseIndex + 1, cards.length)} از {cards.length}
                    </span>
                  )}
                </Link>

                <Link
                  href={`/deck/${deck.id}/study`}
                  className="btn-3d w-full rounded-2xl bg-emerald-500 border-b-4 border-emerald-700 text-white py-4 px-5 flex items-center justify-center gap-2.5 font-black text-base shadow-md hover:bg-emerald-400"
                >
                  <Layers className="w-5 h-5" />
                  تمرین فلش‌کارت (سوایپ چپ و راست 🃏)
                </Link>

                {/* Meaning Quiz — 3 Direction Sub-Buttons */}
                <div className="rounded-2xl bg-sky-50 border-2 border-sky-200 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-sky-700 px-1">
                    <Target className="w-4 h-4" />
                    <span>آزمون معنی (جهت آزمون را انتخاب کن):</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Link
                      href={`/deck/${deck.id}/quiz?mode=meaning-de-fa`}
                      className="btn-3d rounded-xl bg-sky-500 border-b-4 border-sky-700 text-white py-2.5 px-2 text-center font-extrabold text-xs sm:text-sm hover:bg-sky-400"
                    >
                      آلمانی به فارسی
                    </Link>
                    <Link
                      href={`/deck/${deck.id}/quiz?mode=meaning-fa-de`}
                      className="btn-3d rounded-xl bg-sky-500 border-b-4 border-sky-700 text-white py-2.5 px-2 text-center font-extrabold text-xs sm:text-sm hover:bg-sky-400"
                    >
                      فارسی به آلمانی
                    </Link>
                    <Link
                      href={`/deck/${deck.id}/quiz?mode=meaning-mix`}
                      className="btn-3d rounded-xl bg-indigo-500 border-b-4 border-indigo-700 text-white py-2.5 px-2 text-center font-extrabold text-xs sm:text-sm hover:bg-indigo-400"
                    >
                      قاطی 🔀
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Link
                    href={`/deck/${deck.id}/quiz?mode=article`}
                    className={`btn-3d rounded-2xl border-b-4 py-3.5 px-4 flex items-center justify-center gap-2 font-extrabold text-sm ${
                      nounCount > 0
                        ? 'bg-violet-500 border-violet-700 text-white hover:bg-violet-400'
                        : 'bg-slate-200 border-slate-300 text-slate-400 pointer-events-none'
                    }`}
                  >
                    <Palette className="w-4 h-4" />
                    آزمون آرتیکل ({nounCount})
                  </Link>

                  <Link
                    href={`/deck/${deck.id}/quiz?mode=mix`}
                    className="btn-3d rounded-2xl bg-amber-400 border-b-4 border-amber-600 text-amber-950 py-3.5 px-4 flex items-center justify-center gap-2 font-extrabold text-sm hover:bg-amber-300"
                  >
                    <Zap className="w-4 h-4" />
                    آزمون ترکیبی (معنی + آرتیکل)
                  </Link>
                </div>
              </div>
            </section>

            {/* Word List */}
            <section className="space-y-3">
              <h2 className="text-base font-black text-slate-700 px-1">
                لیست کلمات این دسته ({cards.length})
              </h2>

              <div className="space-y-2.5">
                {cards.map((card) => {
                  const art = getArticleStyle(card.article);
                  const isStarred = starredIds.has(card.id);
                  const isMastered = card.progress?.mastered || masteredIds.has(card.id);

                  return (
                    <div
                      key={card.id}
                      className="rounded-2xl bg-white border-2 border-slate-100 hover:border-slate-200 p-4 flex items-center justify-between gap-3 shadow-xs transition"
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
                          {card.plural && (
                            <span className="font-de text-xs font-semibold text-slate-400">
                              ({card.plural})
                            </span>
                          )}
                          {isMastered && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          )}
                        </div>

                        <div className="text-sm font-bold text-slate-600">
                          {card.persianMeaning}
                          {showEnglish && card.englishMeaning && (
                            <span className="font-de text-xs text-slate-400 mr-2">
                              · {card.englishMeaning}
                            </span>
                          )}
                        </div>

                        {card.verbForms && (
                          <div dir="ltr" className="font-de text-[11px] font-semibold text-violet-500 text-right">
                            {card.verbForms}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => speakGerman(formatGermanDisplay(card))}
                          className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 hover:bg-sky-100 flex items-center justify-center"
                          aria-label="پخش تلفظ"
                        >
                          <Volume2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => toggleStar(card.id)}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
                            isStarred
                              ? 'bg-amber-50 text-amber-500'
                              : 'bg-slate-50 text-slate-300 hover:text-amber-400'
                          }`}
                          aria-label="ستاره‌دار"
                        >
                          <Star className={`w-5 h-5 ${isStarred ? 'fill-amber-400' : ''}`} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
