'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  type PanInfo,
} from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Volume2,
  Star,
  RotateCcw,
  Check,
  X,
  ArrowRight,
  Sparkles,
  Trophy,
  RefreshCw,
} from 'lucide-react';
import { formatGermanDisplay, getArticleStyle, type WordCard } from '@/lib/types';
import { speakGerman } from '@/lib/speech';
import { useApp } from './AppProvider';

interface SwipeDeckPlayerProps {
  deckId?: number;
  deckTitle: string;
  initialCards: WordCard[];
  backHref: string;
  quizHref?: string;
}

interface HistoryEntry {
  card: WordCard;
  outcome: 'know' | 'practice';
  prevQueue: WordCard[];
}

export function SwipeDeckPlayer({
  deckTitle,
  initialCards,
  backHref,
  quizHref,
}: SwipeDeckPlayerProps) {
  const { showEnglish, starredIds, toggleStar, recordSwipe } = useApp();

  const [queue, setQueue] = useState<WordCard[]>(initialCards);
  const [flipped, setFlipped] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [practiceCount, setPracticeCount] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  const isDraggingRef = useRef(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], [-14, 0, 14]);
  // Swipe LEFT (x < 0) = بلدم ✓ (Green)
  const knowOpacity = useTransform(x, [-130, -35, 0], [1, 0.4, 0]);
  // Swipe RIGHT (x > 0) = تمرین مجدد ↻ (Amber/Orange)
  const practiceOpacity = useTransform(x, [0, 35, 130], [0, 0.4, 1]);

  const currentCard = queue[0] ?? null;
  const nextCard = queue[1] ?? null;
  const totalUnique = initialCards.length;
  const isDone = queue.length === 0 && initialCards.length > 0;

  useEffect(() => {
    if (isDone) {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [isDone]);

  const commitSwipe = useCallback(
    async (outcome: 'know' | 'practice') => {
      if (!currentCard || isAnimatingOut) return;
      setIsAnimatingOut(true);

      // Left = Know (-460px), Right = Practice Again (+460px)
      const targetX = outcome === 'know' ? -460 : 460;
      await animate(x, targetX, { duration: 0.22, ease: 'easeOut' }).finished;

      const snapshotQueue = [...queue];
      setHistory((prev) => [...prev, { card: currentCard, outcome, prevQueue: snapshotQueue }]);

      if (outcome === 'know') {
        setKnownCount((c) => c + 1);
        setQueue((prev) => prev.slice(1));
      } else {
        setPracticeCount((c) => c + 1);
        setQueue((prev) => {
          const rest = prev.slice(1);
          const insertIdx = Math.min(2, rest.length);
          return [...rest.slice(0, insertIdx), currentCard, ...rest.slice(insertIdx)];
        });
      }

      recordSwipe(currentCard.id, outcome);

      setFlipped(false);
      x.set(0);
      setIsAnimatingOut(false);
    },
    [currentCard, isAnimatingOut, queue, recordSwipe, x]
  );

  const handleUndo = useCallback(() => {
    if (history.length === 0 || isAnimatingOut) return;
    const last = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setQueue(last.prevQueue);
    if (last.outcome === 'know') setKnownCount((c) => Math.max(0, c - 1));
    else setPracticeCount((c) => Math.max(0, c - 1));
    setFlipped(false);
    x.set(0);
  }, [history, isAnimatingOut, x]);

  const handleRestart = () => {
    setQueue(initialCards);
    setKnownCount(0);
    setPracticeCount(0);
    setHistory([]);
    setFlipped(false);
    x.set(0);
  };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!currentCard) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        commitSwipe('know');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        commitSwipe('practice');
      } else if (e.key.toLowerCase() === 'a') {
        speakGerman(formatGermanDisplay(currentCard));
      } else if (e.key.toLowerCase() === 's') {
        toggleStar(currentCard.id);
      } else if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey)) {
        handleUndo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commitSwipe, currentCard, handleUndo, toggleStar]);

  function handleDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 80);

    const swipeThreshold = 90;
    const velocityThreshold = 450;

    if (info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold) {
      commitSwipe('know');
    } else if (info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold) {
      commitSwipe('practice');
    } else {
      animate(x, 0, { type: 'spring', stiffness: 420, damping: 30 });
    }
  }

  if (initialCards.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-16 px-4">
        <div className="text-5xl mb-4">📭</div>
        <h2 className="text-xl font-extrabold text-slate-800 mb-2">هنوز کارتی در این بخش نیست</h2>
        <Link
          href={backHref}
          className="btn-3d inline-flex items-center gap-2 mt-4 rounded-2xl bg-emerald-500 border-b-4 border-emerald-700 text-white px-6 py-3 font-extrabold"
        >
          بازگشت
        </Link>
      </div>
    );
  }

  if (isDone) {
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        <div className="rounded-3xl bg-white border-2 border-slate-100 shadow-xl p-8 space-y-5">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-amber-300 to-amber-500 border-b-4 border-amber-600 flex items-center justify-center text-white shadow-lg">
            <Trophy className="w-10 h-10" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">فوق‌العاده بود! 🎉</h2>
            <p className="text-sm text-slate-500 mt-1">
              همه کلمات دسته «{deckTitle}» رو با موفقیت مرور کردی!
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-200 p-3">
              <div className="text-2xl font-black text-emerald-600">{knownCount}</div>
              <div className="text-xs font-bold text-emerald-700">کلمه بلدم ✓</div>
            </div>
            <div className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-3">
              <div className="text-2xl font-black text-amber-600">{practiceCount}</div>
              <div className="text-xs font-bold text-amber-700">تکرار و تمرین ↻</div>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            {quizHref && (
              <Link
                href={quizHref}
                className="btn-3d w-full flex items-center justify-center gap-2 rounded-2xl bg-sky-500 border-b-4 border-sky-700 text-white py-3.5 font-extrabold text-base"
              >
                <Sparkles className="w-5 h-5" />
                حالا آزمون بده و تثبیتش کن! 🎯
              </Link>
            )}
            <button
              onClick={handleRestart}
              className="btn-3d w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 border-b-4 border-emerald-700 text-white py-3 font-extrabold text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              مرور مجدد همین دسته
            </button>
            <Link
              href={backHref}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 py-3 font-bold text-sm"
            >
              بازگشت به صفحه دسته
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const progressPct = Math.min(100, Math.round((knownCount / totalUnique) * 100));
  const artStyle = getArticleStyle(currentCard.article);
  const isStarred = starredIds.has(currentCard.id);

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-24 flex flex-col min-h-[calc(100vh-5rem)]">
      {/* Top Bar */}
      <div className="flex items-center gap-3 mb-4">
        <Link
          href={backHref}
          className="rounded-2xl bg-white border-2 border-slate-200 p-2 text-slate-500 hover:text-slate-800"
          aria-label="بازگشت"
        >
          <ArrowRight className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs font-extrabold text-slate-500 mb-1">
            <span className="truncate max-w-[190px]">{deckTitle}</span>
            <span>
              {knownCount} / {totalUnique} بلدم
            </span>
          </div>
          <div className="h-3.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-green-500 transition-all duration-300"
              style={{ width: `${Math.max(progressPct, 6)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Swipe Direction Legend */}
      <div className="flex items-center justify-between text-[11px] font-extrabold px-2 mb-3">
        <span className="text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
          بکش به راست ➔ تمرین مجدد
        </span>
        <span className="text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
          بلدم ⬅ بکش به چپ
        </span>
      </div>

      {/* Card Stack Container */}
      <div className="relative flex-1 flex items-center justify-center min-h-[450px] select-none">
        {nextCard && (
          <div className="absolute w-full max-w-md h-[430px] rounded-[2rem] bg-white border-2 border-slate-200 scale-95 translate-y-3 opacity-60 pointer-events-none shadow-sm" />
        )}

        <motion.div
          key={currentCard.id + '-' + queue.length}
          style={{ x, rotate }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.85}
          onDragStart={() => {
            isDraggingRef.current = true;
          }}
          onDragEnd={handleDragEnd}
          onClick={(e) => {
            if (isDraggingRef.current || isAnimatingOut) return;
            const target = e.target as HTMLElement | null;
            if (target?.closest('button, [data-no-flip="true"]')) return;
            setFlipped((f) => !f);
          }}
          className="relative w-full max-w-md h-[440px] cursor-grab active:cursor-grabbing perspective-1200 touch-pan-y"
        >
          {/* Swipe Overlays */}
          <motion.div
            style={{ opacity: knowOpacity }}
            className="pointer-events-none absolute inset-0 z-30 rounded-[2rem] bg-emerald-500/15 border-4 border-emerald-500 flex items-start justify-end p-6"
          >
            <div className="rounded-2xl bg-emerald-500 text-white font-black text-lg px-4 py-1.5 shadow-lg -rotate-12">
              بلدم ✓
            </div>
          </motion.div>

          <motion.div
            style={{ opacity: practiceOpacity }}
            className="pointer-events-none absolute inset-0 z-30 rounded-[2rem] bg-amber-500/15 border-4 border-amber-500 flex items-start justify-start p-6"
          >
            <div className="rounded-2xl bg-amber-500 text-white font-black text-lg px-4 py-1.5 shadow-lg rotate-12">
              تمرین مجدد ↻
            </div>
          </motion.div>

          {/* 3D Flipping Inner Card */}
          <div
            className={`relative w-full h-full duration-500 preserve-3d transition-transform ${
              flipped ? 'rotate-y-180' : ''
            }`}
          >
            {/* ================= FRONT SIDE (GERMAN WORD + PLURAL + EXAMPLE) ================= */}
            <div
              className={`absolute inset-0 backface-hidden rounded-[2rem] bg-white border-2 ${artStyle.ring} shadow-xl flex flex-col justify-between overflow-hidden`}
            >
              <div className={`h-3 w-full ${artStyle.bar}`} />

              <div className="px-6 pt-4 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {currentCard.level && (
                    <span className="font-de text-xs font-extrabold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-xl">
                      {currentCard.level}
                    </span>
                  )}
                  <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2.5 py-1 rounded-xl">
                    {currentCard.partOfSpeech === 'noun'
                      ? 'اسم'
                      : currentCard.partOfSpeech === 'verb'
                        ? 'فعل'
                        : currentCard.partOfSpeech === 'adjective'
                          ? 'صفت'
                          : 'عبارت'}
                  </span>
                </div>

                <button
                  type="button"
                  data-no-flip="true"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    speakGerman(formatGermanDisplay(currentCard));
                  }}
                  className="btn-3d w-11 h-11 rounded-2xl bg-sky-100 border-b-4 border-sky-300 text-sky-600 hover:bg-sky-200 flex items-center justify-center"
                  aria-label="پخش تلفظ آلمانی"
                  title="پخش تلفظ"
                >
                  <Volume2 className="w-5 h-5" />
                </button>
              </div>

              <div
                className="px-6 text-center flex flex-col items-center justify-center gap-2"
                dir="ltr"
              >
                {currentCard.article && (
                  <span
                    className={`font-de text-sm font-extrabold px-3.5 py-0.5 rounded-xl shadow-xs ${artStyle.badgeBg}`}
                  >
                    {currentCard.article}
                  </span>
                )}
                <h1 className="font-de text-3xl sm:text-4xl font-extrabold text-slate-800 tracking-tight break-words max-w-full">
                  {currentCard.word}
                </h1>
                {currentCard.plural && (
                  <p className="font-de text-sm font-bold text-slate-400">
                    Pl: {currentCard.plural}
                  </p>
                )}
                {currentCard.verbForms && (
                  <p className="font-de text-xs font-bold text-violet-600 bg-violet-50 border border-violet-200 px-3 py-1 rounded-xl">
                    {currentCard.verbForms}
                  </p>
                )}
              </div>

              <div className="px-5 pb-4 space-y-2.5">
                {currentCard.exampleDe && (
                  <div
                    className="rounded-2xl bg-slate-50 border-2 border-slate-100 p-3.5 flex items-center justify-between gap-2.5"
                    dir="ltr"
                  >
                    <p className="font-de text-sm sm:text-base font-extrabold text-slate-700 leading-relaxed text-left">
                      {currentCard.exampleDe}
                    </p>
                    <button
                      type="button"
                      data-no-flip="true"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        speakGerman(currentCard.exampleDe);
                      }}
                      className="shrink-0 w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex items-center justify-center"
                      aria-label="پخش جمله مثال"
                      title="شنیدن جمله مثال"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="text-center text-[11px] font-bold text-slate-400">
                  برای دیدن معنی کلمه و مثال ضربه بزن 👆
                </div>
              </div>
            </div>

            {/* ================= BACK SIDE (PERSIAN MEANING OF WORD + EXAMPLE) ================= */}
            <div
              className={`absolute inset-0 backface-hidden rotate-y-180 rounded-[2rem] bg-gradient-to-b from-white to-slate-50 border-2 ${artStyle.ring} shadow-xl flex flex-col justify-between overflow-hidden`}
            >
              <div className={`h-3 w-full ${artStyle.bar}`} />

              <div className="px-6 pt-4 flex items-center justify-between" dir="ltr">
                <div className="flex items-center gap-2 min-w-0">
                  {currentCard.article && (
                    <span
                      className={`font-de text-xs font-extrabold px-2.5 py-0.5 rounded-lg shrink-0 ${artStyle.badgeBg}`}
                    >
                      {currentCard.article}
                    </span>
                  )}
                  <span className="font-de font-extrabold text-base text-slate-600 truncate">
                    {currentCard.word}
                  </span>
                </div>
                <button
                  type="button"
                  data-no-flip="true"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    speakGerman(formatGermanDisplay(currentCard));
                  }}
                  className="shrink-0 w-9 h-9 rounded-xl bg-sky-100 text-sky-600 hover:bg-sky-200 flex items-center justify-center"
                  aria-label="پخش تلفظ کلمه"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 text-center space-y-2.5">
                <div className="text-3xl sm:text-4xl font-black text-slate-800 leading-snug">
                  {currentCard.persianMeaning}
                </div>

                {showEnglish && currentCard.englishMeaning && (
                  <div
                    dir="ltr"
                    className="font-de text-sm font-bold text-slate-400 bg-slate-100 inline-block px-3 py-1 rounded-xl"
                  >
                    🇬🇧 {currentCard.englishMeaning}
                  </div>
                )}
              </div>

              <div className="px-5 pb-5">
                {(currentCard.exampleDe || currentCard.exampleFa) && (
                  <div className="rounded-2xl bg-white border-2 border-slate-100 p-3.5 space-y-2 shadow-xs">
                    {currentCard.exampleDe && (
                      <div className="flex items-start justify-between gap-2" dir="ltr">
                        <p className="font-de text-sm sm:text-base font-extrabold text-slate-800 leading-relaxed text-left">
                          {currentCard.exampleDe}
                        </p>
                        <button
                          type="button"
                          data-no-flip="true"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            speakGerman(currentCard.exampleDe);
                          }}
                          className="shrink-0 w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex items-center justify-center"
                          aria-label="پخش جمله مثال"
                          title="شنیدن جمله مثال"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {currentCard.exampleFa && (
                      <p className="text-sm sm:text-base font-bold text-slate-600 leading-relaxed text-right border-t border-slate-100 pt-2">
                        {currentCard.exampleFa}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Bottom Tactile Control Dock */}
      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          onClick={() => commitSwipe('practice')}
          className="btn-3d flex-1 max-w-[130px] flex items-center justify-center gap-1.5 rounded-2xl bg-amber-400 border-b-4 border-amber-600 text-white py-3.5 font-extrabold text-sm shadow-sm hover:bg-amber-300"
          title="تمرین مجدد (کلید راست)"
        >
          <X className="w-5 h-5 stroke-[3]" />
          تمرین مجدد
        </button>

        <button
          onClick={handleUndo}
          disabled={history.length === 0}
          className="btn-3d w-12 h-12 rounded-2xl bg-white border-2 border-b-4 border-slate-200 text-slate-500 hover:text-slate-800 disabled:opacity-40 flex items-center justify-center"
          title="بازگشت یک مرحله"
          aria-label="بازگشت"
        >
          <RotateCcw className="w-5 h-5" />
        </button>

        <button
          onClick={() => toggleStar(currentCard.id)}
          className={`btn-3d w-12 h-12 rounded-2xl border-2 border-b-4 flex items-center justify-center transition ${
            isStarred
              ? 'bg-amber-50 border-amber-400 text-amber-500'
              : 'bg-white border-slate-200 text-slate-400 hover:text-amber-500'
          }`}
          title={isStarred ? 'حذف از ستاره‌دارها' : 'افزودن به کلمات ستاره‌دار'}
          aria-label="ستاره‌دار کردن"
        >
          <Star className={`w-6 h-6 ${isStarred ? 'fill-amber-400 text-amber-500' : ''}`} />
        </button>

        <button
          onClick={() => commitSwipe('know')}
          className="btn-3d flex-1 max-w-[130px] flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-500 border-b-4 border-emerald-700 text-white py-3.5 font-extrabold text-sm shadow-sm hover:bg-emerald-400"
          title="بلدم (کلید چپ)"
        >
          <Check className="w-5 h-5 stroke-[3]" />
          بلدم
        </button>
      </div>
    </div>
  );
}
