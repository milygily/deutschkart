'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useMotionValue, animate, type PanInfo } from 'framer-motion';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Volume2,
  Star,
  RotateCcw,
  BookmarkCheck,
} from 'lucide-react';
import { formatGermanDisplay, getArticleStyle, type WordCard } from '@/lib/types';
import { speakGerman } from '@/lib/speech';
import { useApp } from './AppProvider';
import { InteractiveSentence } from './InteractiveSentence';

interface BrowseDeckPlayerProps {
  deckId: number;
  deckTitle: string;
  cards: WordCard[];
  initialIndex: number;
  backHref: string;
}

export function BrowseDeckPlayer({
  deckId,
  deckTitle,
  cards,
  initialIndex,
  backHref,
}: BrowseDeckPlayerProps) {
  const { user, showEnglish, starredIds, toggleStar } = useApp();

  const safeStart = Math.max(0, Math.min(initialIndex, Math.max(0, cards.length - 1)));
  const [index, setIndex] = useState(safeStart);
  const [flipped, setFlipped] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [containerWidth, setContainerWidth] = useState(440);

  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragX = useMotionValue(0);

  // Measure viewport width so side wagons always peek cleanly on any screen
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth || 440);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sync initialIndex if loaded asynchronously from DB/localStorage
  useEffect(() => {
    const clamped = Math.max(0, Math.min(initialIndex, Math.max(0, cards.length - 1)));
    setIndex(clamped);
  }, [initialIndex, cards.length]);

  const persistIndex = useCallback(
    (nextIdx: number) => {
      try {
        localStorage.setItem(`dk_browse_pos_${deckId}`, String(nextIdx));
      } catch {
        // ignore storage errors
      }
      if (user) {
        fetch(`/api/decks/${deckId}/bookmark`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastIndex: nextIdx }),
        }).catch(() => {});
      }
      setSavedIndicator(true);
      setTimeout(() => setSavedIndicator(false), 1200);
    },
    [deckId, user]
  );

  const goTo = useCallback(
    (nextIdx: number) => {
      const clamped = Math.max(0, Math.min(nextIdx, cards.length - 1));
      setIndex(clamped);
      setFlipped(false);
      animate(dragX, 0, { type: 'spring', stiffness: 360, damping: 34 });
      persistIndex(clamped);
    },
    [cards.length, dragX, persistIndex]
  );

  const goNext = useCallback(() => {
    if (index < cards.length - 1) goTo(index + 1);
  }, [cards.length, goTo, index]);

  const goPrev = useCallback(() => {
    if (index > 0) goTo(index - 1);
  }, [goTo, index]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const card = cards[index];
      if (!card) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key.toLowerCase() === 'a') {
        speakGerman(formatGermanDisplay(card));
      } else if (e.key.toLowerCase() === 's') {
        toggleStar(card.id);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cards, goNext, goPrev, index, toggleStar]);

  function handleDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 90);

    // Physical train carousel (LTR track):
    // Next card peeks on the RIGHT -> drag LEFT (offset.x < 0) pulls next card into center!
    // Prev card peeks on the LEFT  -> drag RIGHT (offset.x > 0) pulls prev card into center!
    if ((info.offset.x < -65 || info.velocity.x < -360) && index < cards.length - 1) {
      goNext();
    } else if ((info.offset.x > 65 || info.velocity.x > 360) && index > 0) {
      goPrev();
    } else {
      animate(dragX, 0, { type: 'spring', stiffness: 420, damping: 32 });
    }
  }

  if (cards.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-16 px-4">
        <div className="text-5xl mb-4">📭</div>
        <h2 className="text-xl font-extrabold text-slate-800 mb-2">هنوز کارتی در این دسته نیست</h2>
        <Link
          href={backHref}
          className="btn-3d inline-flex items-center gap-2 mt-4 rounded-2xl bg-teal-500 border-b-4 border-teal-700 text-white px-6 py-3 font-extrabold"
        >
          بازگشت
        </Link>
      </div>
    );
  }

  const currentCard = cards[index];
  const isStarred = starredIds.has(currentCard.id);
  const progressPct = Math.round(((index + 1) / cards.length) * 100);

  // Carousel sizing: card takes ~78% width (max 390px) so neighbors clearly peek on left & right
  const cardWidth = Math.min(390, Math.max(260, Math.round(containerWidth * 0.78)));
  const cardGap = 16;
  const stepWidth = cardWidth + cardGap;

  // Render a 5-wagon window around current index for smooth entry/exit transitions
  const windowIndices: number[] = [];
  for (let i = Math.max(0, index - 2); i <= Math.min(cards.length - 1, index + 2); i++) {
    windowIndices.push(i);
  }

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-4 pb-24 flex flex-col min-h-[calc(100vh-5rem)]">
      {/* Top Progress Bar */}
      <div className="max-w-lg w-full mx-auto flex items-center gap-3 mb-3">
        <Link
          href={backHref}
          className="rounded-2xl bg-white border-2 border-slate-200 p-2 text-slate-500 hover:text-slate-800"
          aria-label="بازگشت"
        >
          <ArrowRight className="w-5 h-5" />
        </Link>

        <div className="flex-1">
          <div className="flex items-center justify-between text-xs font-extrabold text-slate-500 mb-1">
            <span className="truncate max-w-[180px]">{deckTitle}</span>
            <span className="text-teal-600">
              کارت {index + 1} از {cards.length}
            </span>
          </div>
          <div className="h-3.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-l from-teal-400 to-cyan-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <button
          onClick={() => goTo(0)}
          disabled={index === 0}
          title="شروع مجدد از کارت ۱"
          className="rounded-2xl bg-white border-2 border-slate-200 p-2 text-slate-500 hover:text-teal-600 disabled:opacity-40"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>

      {/* Info Pill */}
      <div className="max-w-lg w-full mx-auto flex items-center justify-between text-[11px] font-extrabold px-2 mb-3">
        <span className="text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-3 py-0.5">
          📖 مرور آزاد (بدون امتیازدهی)
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 transition ${
            savedIndicator
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'text-slate-400'
          }`}
        >
          <BookmarkCheck className="w-3.5 h-3.5" />
          موقعیتت خودکار ذخیره میشه
        </span>
      </div>

      {/* Train-Style Horizontal Peek Carousel */}
      <div
        ref={trackRef}
        dir="ltr"
        className="relative flex-1 w-full overflow-hidden flex items-center justify-center min-h-[455px] select-none"
      >
        <motion.div
          style={{ x: dragX }}
          drag="x"
          dragConstraints={{
            left: index >= cards.length - 1 ? 0 : -stepWidth * 0.9,
            right: index <= 0 ? 0 : stepWidth * 0.9,
          }}
          dragElastic={0.2}
          onDragStart={() => {
            isDraggingRef.current = true;
          }}
          onDragEnd={handleDragEnd}
          className="relative w-full h-[445px] cursor-grab active:cursor-grabbing touch-pan-y"
        >
          {windowIndices.map((i) => {
            const card = cards[i];
            const offset = i - index;
            const isCenter = offset === 0;
            const artStyle = getArticleStyle(card.article);

            return (
              <motion.div
                key={`${card.id}-${i}`}
                initial={false}
                animate={{
                  x: offset * stepWidth,
                  scale: isCenter ? 1 : 0.9,
                  opacity: isCenter ? 1 : Math.abs(offset) === 1 ? 0.58 : 0,
                }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                style={{
                  width: cardWidth,
                  left: '50%',
                  marginLeft: -cardWidth / 2,
                  zIndex: isCenter ? 20 : 10,
                }}
                onClick={(e) => {
                  if (isDraggingRef.current) return;
                  const target = e.target as HTMLElement | null;
                  // NEVER flip when clicking any button (audio, etc.)
                  if (target?.closest('button, [data-no-flip="true"]')) return;

                  if (!isCenter) {
                    goTo(i);
                  } else {
                    setFlipped((f) => !f);
                  }
                }}
                className="absolute top-0 h-[440px] perspective-1200"
              >
                <div
                  className={`relative w-full h-full duration-500 preserve-3d transition-transform ${
                    isCenter && flipped ? 'rotate-y-180' : ''
                  }`}
                >
                  {/* ================= FRONT SIDE (ALL GERMAN: WORD + PLURAL + EXAMPLE) ================= */}
                  <div
                    className={`absolute inset-0 backface-hidden rounded-[2rem] bg-white border-2 ${artStyle.ring} ${
                      isCenter ? 'shadow-xl' : 'shadow-md'
                    } flex flex-col justify-between overflow-visible`}
                  >
                    <div className={`h-3 w-full rounded-t-[1.85rem] ${artStyle.bar}`} />

                    {/* Header Badges + Word Audio */}
                    <div className="px-5 pt-4 flex items-center justify-between" dir="rtl">
                      <div className="flex items-center gap-1.5">
                        {card.level && (
                          <span className="font-de text-xs font-extrabold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-xl">
                            {card.level}
                          </span>
                        )}
                        <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2.5 py-1 rounded-xl">
                          {card.partOfSpeech === 'noun'
                            ? 'اسم'
                            : card.partOfSpeech === 'verb'
                              ? 'فعل'
                              : card.partOfSpeech === 'adjective'
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
                          speakGerman(formatGermanDisplay(card));
                        }}
                        className="btn-3d w-11 h-11 rounded-2xl bg-sky-100 border-b-4 border-sky-300 text-sky-600 hover:bg-sky-200 flex items-center justify-center"
                        aria-label="پخش تلفظ کلمه"
                        title="شنیدن تلفظ کلمه"
                      >
                        <Volume2 className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Center German Word + Plural / Verb Forms */}
                    <div
                      className="px-5 text-center flex flex-col items-center justify-center gap-2"
                      dir="ltr"
                    >
                      {card.article && (
                        <span
                          className={`font-de text-sm font-extrabold px-3.5 py-0.5 rounded-xl shadow-xs ${artStyle.badgeBg}`}
                        >
                          {card.article}
                        </span>
                      )}
                      <h1 className="font-de text-3xl sm:text-4xl font-extrabold text-slate-800 tracking-tight break-words max-w-full">
                        {card.word}
                      </h1>
                      {card.plural && (
                        <p className="font-de text-sm font-bold text-slate-400">
                          Pl: {card.plural}
                        </p>
                      )}
                      {card.verbForms && (
                        <p className="font-de text-xs font-bold text-violet-600 bg-violet-50 border border-violet-200 px-3 py-1 rounded-xl">
                          {card.verbForms}
                        </p>
                      )}
                    </div>

                    {/* German Example Sentence right on FRONT */}
                    <div className="px-5 pb-4 space-y-2.5">
                      {card.exampleDe && (
                        <div className="rounded-2xl bg-slate-50 border-2 border-slate-100 p-3.5 flex items-center justify-between gap-2.5" dir="ltr">
                          <InteractiveSentence
                            sentence={card.exampleDe}
                            targetCard={card}
                            className="font-de text-sm sm:text-base font-extrabold text-slate-700 leading-relaxed text-left flex-1"
                          />
                          <button
                            type="button"
                            data-no-flip="true"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              speakGerman(card.exampleDe);
                            }}
                            className="shrink-0 w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex items-center justify-center"
                            aria-label="پخش جمله مثال"
                            title="شنیدن جمله مثال"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      <div className="text-center text-[11px] font-bold text-slate-400" dir="rtl">
                        برای دیدن معنی ضربه بزن 👆 · روی هر کلمه مثال بزنی معنیش میاد!
                      </div>
                    </div>
                  </div>

                  {/* ================= BACK SIDE (PERSIAN MEANING OF WORD + EXAMPLE) ================= */}
                  <div
                    className={`absolute inset-0 backface-hidden rotate-y-180 rounded-[2rem] bg-gradient-to-b from-white to-slate-50 border-2 ${artStyle.ring} shadow-xl flex flex-col justify-between overflow-visible`}
                  >
                    <div className={`h-3 w-full rounded-t-[1.85rem] ${artStyle.bar}`} />

                    {/* Small German Reminder Header + Audio */}
                    <div className="px-5 pt-4 flex items-center justify-between" dir="ltr">
                      <div className="flex items-center gap-2 min-w-0">
                        {card.article && (
                          <span
                            className={`font-de text-xs font-extrabold px-2.5 py-0.5 rounded-lg shrink-0 ${artStyle.badgeBg}`}
                          >
                            {card.article}
                          </span>
                        )}
                        <span className="font-de font-extrabold text-base text-slate-600 truncate">
                          {card.word}
                        </span>
                      </div>
                      <button
                        type="button"
                        data-no-flip="true"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          speakGerman(formatGermanDisplay(card));
                        }}
                        className="shrink-0 w-9 h-9 rounded-xl bg-sky-100 text-sky-600 hover:bg-sky-200 flex items-center justify-center"
                        aria-label="پخش تلفظ کلمه"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Persian Word Meaning + Optional English */}
                    <div className="px-5 text-center space-y-2.5" dir="rtl">
                      <div className="text-3xl sm:text-4xl font-black text-slate-800 leading-snug">
                        {card.persianMeaning}
                      </div>

                      {showEnglish && card.englishMeaning && (
                        <div
                          dir="ltr"
                          className="font-de text-sm font-bold text-slate-400 bg-slate-100 inline-block px-3 py-1 rounded-xl"
                        >
                          🇬🇧 {card.englishMeaning}
                        </div>
                      )}
                    </div>

                    {/* Both German Example & Persian Translation side-by-side on BACK */}
                    <div className="px-5 pb-5 space-y-2" dir="rtl">
                      {(card.exampleDe || card.exampleFa) && (
                        <div className="rounded-2xl bg-white border-2 border-slate-100 p-3.5 space-y-2 shadow-xs">
                          {card.exampleDe && (
                            <div className="flex items-start justify-between gap-2" dir="ltr">
                              <InteractiveSentence
                                sentence={card.exampleDe}
                                targetCard={card}
                                className="font-de text-sm sm:text-base font-extrabold text-slate-800 leading-relaxed text-left flex-1"
                              />
                              <button
                                type="button"
                                data-no-flip="true"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  speakGerman(card.exampleDe);
                                }}
                                className="shrink-0 w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex items-center justify-center"
                                aria-label="پخش جمله مثال"
                                title="شنیدن جمله مثال"
                              >
                                <Volume2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                          {card.exampleFa && (
                            <p className="text-sm sm:text-base font-bold text-slate-600 leading-relaxed text-right border-t border-slate-100 pt-2">
                              {card.exampleFa}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* Bottom Navigation Dock (aligned visually with Left=Prev, Right=Next train!) */}
      <div className="max-w-lg w-full mx-auto mt-4 flex items-center justify-center gap-3" dir="ltr">
        {/* Left button = Previous wagon on the left */}
        <button
          onClick={goPrev}
          disabled={index === 0}
          className="btn-3d flex-1 max-w-[145px] flex items-center justify-center gap-1.5 rounded-2xl bg-white border-2 border-b-4 border-slate-200 text-slate-700 py-3.5 font-extrabold text-sm hover:border-teal-300 disabled:opacity-40"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>قبلی</span>
        </button>

        {/* Star */}
        <button
          onClick={() => toggleStar(currentCard.id)}
          className={`btn-3d w-13 h-13 rounded-2xl border-2 border-b-4 flex items-center justify-center transition ${
            isStarred
              ? 'bg-amber-50 border-amber-400 text-amber-500'
              : 'bg-white border-slate-200 text-slate-400 hover:text-amber-500'
          }`}
          title={isStarred ? 'حذف از ستاره‌دارها' : 'افزودن به ستاره‌دارها'}
        >
          <Star className={`w-6 h-6 ${isStarred ? 'fill-amber-400 text-amber-500' : ''}`} />
        </button>

        {/* Right button = Next wagon on the right */}
        <button
          onClick={goNext}
          disabled={index >= cards.length - 1}
          className="btn-3d flex-1 max-w-[145px] flex items-center justify-center gap-1.5 rounded-2xl bg-teal-500 border-b-4 border-teal-700 text-white py-3.5 font-extrabold text-sm hover:bg-teal-400 disabled:opacity-40"
        >
          <span>بعدی</span>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
