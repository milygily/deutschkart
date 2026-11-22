'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import {
  ArrowRight,
  Volume2,
  CheckCircle2,
  XCircle,
  Trophy,
  RefreshCw,
  Star,
} from 'lucide-react';
import { formatGermanDisplay, type WordCard } from '@/lib/types';
import { speakGerman } from '@/lib/speech';
import { useApp } from './AppProvider';
import { InteractiveSentence } from './InteractiveSentence';

export type QuizMode =
  | 'meaning'
  | 'meaning-de-fa'
  | 'meaning-fa-de'
  | 'meaning-mix'
  | 'article'
  | 'mix';

interface QuizQuestion {
  id: string;
  type: 'meaning-de-fa' | 'meaning-fa-de' | 'article';
  card: WordCard;
  options: string[];
  correctAnswer: string;
}

interface QuizPlayerProps {
  deckTitle: string;
  cards: WordCard[];
  mode: QuizMode;
  backHref: string;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildQuestions(cards: WordCard[], mode: QuizMode): QuizQuestion[] {
  const pool = shuffle(cards);
  const questions: QuizQuestion[] = [];

  for (let idx = 0; idx < pool.length; idx++) {
    const card = pool[idx];
    const isNounWithArticle =
      card.article === 'der' || card.article === 'die' || card.article === 'das';

    if (mode === 'article') {
      if (!isNounWithArticle) continue;
      questions.push({
        id: `art-${card.id}`,
        type: 'article',
        card,
        options: ['der', 'die', 'das'],
        correctAnswer: card.article!,
      });
      continue;
    }

    // Determine meaning direction
    const askFaToDe =
      mode === 'meaning-fa-de'
        ? true
        : mode === 'meaning-mix'
          ? idx % 2 === 1
          : false;

    const others = shuffle(cards.filter((c) => c.id !== card.id));
    if (!askFaToDe) {
      const distractors = others
        .map((o) => o.persianMeaning)
        .filter((m) => m !== card.persianMeaning)
        .slice(0, 3);
      questions.push({
        id: `m-${card.id}`,
        type: 'meaning-de-fa',
        card,
        options: shuffle([card.persianMeaning, ...distractors]),
        correctAnswer: card.persianMeaning,
      });
    } else {
      const correctDe = formatGermanDisplay(card);
      const distractors = others
        .map((o) => formatGermanDisplay(o))
        .filter((d) => d !== correctDe)
        .slice(0, 3);
      questions.push({
        id: `mrev-${card.id}`,
        type: 'meaning-fa-de',
        card,
        options: shuffle([correctDe, ...distractors]),
        correctAnswer: correctDe,
      });
    }

    // In Smart Mix mode, also test the article for nouns!
    if (mode === 'mix' && isNounWithArticle) {
      questions.push({
        id: `mix-art-${card.id}`,
        type: 'article',
        card,
        options: ['der', 'die', 'das'],
        correctAnswer: card.article!,
      });
    }
  }

  return mode === 'mix' || mode === 'meaning-mix' ? shuffle(questions) : questions;
}

export function QuizPlayer({ deckTitle, cards, mode, backHref }: QuizPlayerProps) {
  const { recordQuiz, starredIds, toggleStar } = useApp();
  const [sourceCards, setSourceCards] = useState<WordCard[]>(cards);
  const [seedKey, setSeedKey] = useState(0);

  const questions = useMemo(
    () => buildQuestions(sourceCards, mode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceCards, mode, seedKey]
  );

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCards, setWrongCards] = useState<WordCard[]>([]);

  const current = questions[index] ?? null;
  const isFinished = questions.length > 0 && index >= questions.length;

  useEffect(() => {
    if (isFinished) {
      confetti({
        particleCount: 75,
        spread: 65,
        origin: { y: 0.6 },
      });
    }
  }, [isFinished]);

  function handleSelect(option: string) {
    if (!current || selected !== null) return;
    setSelected(option);
    const isCorrect = option === current.correctAnswer;

    if (isCorrect) {
      setCorrectCount((c) => c + 1);
    } else {
      setWrongCards((prev) =>
        prev.some((w) => w.id === current.card.id) ? prev : [...prev, current.card]
      );
    }

    recordQuiz(current.card.id, isCorrect);
  }

  function handleNext() {
    setSelected(null);
    setIndex((i) => i + 1);
  }

  function restart(subset?: WordCard[]) {
    setSourceCards(subset && subset.length > 0 ? subset : cards);
    setIndex(0);
    setSelected(null);
    setCorrectCount(0);
    setWrongCards([]);
    setSeedKey((k) => k + 1);
  }

  if (questions.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-16 px-4">
        <div className="text-5xl mb-4">🧐</div>
        <h2 className="text-xl font-extrabold text-slate-800 mb-2">
          {mode === 'article'
            ? 'در این دسته اسمی با آرتیکل der/die/das وجود ندارد!'
            : 'تعداد کلمات این دسته برای ساخت آزمون کافی نیست.'}
        </h2>
        <Link
          href={backHref}
          className="btn-3d inline-flex items-center gap-2 mt-4 rounded-2xl bg-sky-500 border-b-4 border-sky-700 text-white px-6 py-3 font-extrabold"
        >
          بازگشت به دسته
        </Link>
      </div>
    );
  }

  if (isFinished) {
    const pct = Math.round((correctCount / questions.length) * 100);
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        <div className="rounded-3xl bg-white border-2 border-slate-100 shadow-xl p-8 space-y-5">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-emerald-400 to-green-600 border-b-4 border-green-700 flex items-center justify-center text-white shadow-lg">
            <Trophy className="w-10 h-10" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">
              {pct >= 80 ? 'دمت گرم! فوق‌العاده بود 🏆' : pct >= 50 ? 'خیلی خوب بود! 👏' : 'عالی برای شروع! 💪'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              آزمون دسته «{deckTitle}» به پایان رسید
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-200 p-3">
              <div className="text-3xl font-black text-emerald-600">{pct}%</div>
              <div className="text-xs font-bold text-emerald-700">دقت پاسخ‌ها</div>
            </div>
            <div className="rounded-2xl bg-sky-50 border-2 border-sky-200 p-3">
              <div className="text-3xl font-black text-sky-600">
                {correctCount}/{questions.length}
              </div>
              <div className="text-xs font-bold text-sky-700">پاسخ درست</div>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            {wrongCards.length > 0 && (
              <button
                onClick={() => restart(wrongCards)}
                className="btn-3d w-full rounded-2xl bg-amber-400 border-b-4 border-amber-600 text-white py-3.5 font-extrabold text-sm flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                تمرین فقط {wrongCards.length} کلمه غلط این آزمون
              </button>
            )}
            <button
              onClick={() => restart(cards)}
              className="btn-3d w-full rounded-2xl bg-emerald-500 border-b-4 border-emerald-700 text-white py-3 font-extrabold text-sm"
            >
              آزمون دوباره کل دسته
            </button>
            <Link
              href={backHref}
              className="w-full block rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 py-3 font-bold text-sm"
            >
              بازگشت به صفحه دسته
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isCorrectSelected = selected !== null && selected === current.correctAnswer;
  const progressPct = Math.round(((index + (selected ? 1 : 0)) / questions.length) * 100);
  const isStarred = starredIds.has(current.card.id);

  const articleButtonStyles: Record<string, string> = {
    der: 'bg-sky-500 border-sky-700 hover:bg-sky-400 text-white',
    die: 'bg-rose-500 border-rose-700 hover:bg-rose-400 text-white',
    das: 'bg-emerald-500 border-emerald-700 hover:bg-emerald-400 text-white',
  };

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-36 flex flex-col min-h-[calc(100vh-5rem)]">
      {/* Top Progress Bar */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href={backHref}
          className="rounded-2xl bg-white border-2 border-slate-200 p-2 text-slate-500 hover:text-slate-800"
        >
          <ArrowRight className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs font-extrabold text-slate-500 mb-1">
            <span>
              {mode === 'article'
                ? 'آزمون آرتیکل (der / die / das)'
                : mode === 'mix'
                  ? 'آزمون ترکیبی (معنی + آرتیکل)'
                  : mode === 'meaning-fa-de'
                    ? 'آزمون معنی (فارسی به آلمانی)'
                    : mode === 'meaning-mix'
                      ? 'آزمون معنی (قاطی 🔀)'
                      : 'آزمون معنی (آلمانی به فارسی)'}
            </span>
            <span>
              {index + 1} از {questions.length}
            </span>
          </div>
          <div className="h-3.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-l from-sky-400 to-indigo-500 transition-all duration-300"
              style={{ width: `${Math.max(progressPct, 5)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Question Card */}
      <div className="rounded-3xl bg-white border-2 border-slate-200 shadow-lg p-6 text-center space-y-4 mb-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold rounded-xl px-3 py-1 bg-violet-50 text-violet-600">
            {current.type === 'article'
              ? 'آرتیکل درست این اسم کدام است؟'
              : current.type === 'meaning-de-fa'
                ? 'معنی فارسی این کلمه چیست؟'
                : 'معادل آلمانی این کلمه چیست؟'}
          </span>
          <button
            onClick={() => toggleStar(current.card.id)}
            className="p-1.5 rounded-xl hover:bg-amber-50"
            aria-label="ستاره‌دار"
          >
            <Star
              className={`w-5 h-5 ${
                isStarred ? 'fill-amber-400 text-amber-500' : 'text-slate-300'
              }`}
            />
          </button>
        </div>

        {current.type === 'article' && (
          <div className="py-3 space-y-2">
            <div dir="ltr" className="font-de text-3xl sm:text-4xl font-black text-slate-800 flex items-center justify-center gap-3">
              <span className="inline-block min-w-[68px] border-b-4 border-dashed border-violet-400 text-violet-600 pb-0.5">
                {selected ? current.correctAnswer : '___'}
              </span>
              <span>{current.card.word}</span>
            </div>
            <p className="text-sm font-bold text-slate-400">({current.card.persianMeaning})</p>
            <button
              onClick={() => speakGerman(current.card.word)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 text-sky-600 px-3 py-1.5 text-xs font-extrabold hover:bg-sky-100"
            >
              <Volume2 className="w-4 h-4" />
              شنیدن تلفظ
            </button>
          </div>
        )}

        {current.type === 'meaning-de-fa' && (
          <div className="py-3 space-y-3">
            <div dir="ltr" className="font-de text-3xl sm:text-4xl font-black text-slate-800">
              {formatGermanDisplay(current.card)}
            </div>
            <button
              onClick={() => speakGerman(formatGermanDisplay(current.card))}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 text-sky-600 px-3.5 py-1.5 text-xs font-extrabold hover:bg-sky-100"
            >
              <Volume2 className="w-4 h-4" />
              شنیدن تلفظ آلمانی
            </button>
          </div>
        )}

        {current.type === 'meaning-fa-de' && (
          <div className="py-4">
            <div className="text-3xl sm:text-4xl font-black text-slate-800">
              {current.card.persianMeaning}
            </div>
          </div>
        )}
      </div>

      {/* Answer Options */}
      {current.type === 'article' ? (
        <div className="grid grid-cols-3 gap-3" dir="ltr">
          {(['der', 'die', 'das'] as const).map((art) => {
            const isChosen = selected === art;
            const isRight = art === current.correctAnswer;
            let stateClass = articleButtonStyles[art];
            if (selected !== null) {
              if (isRight) {
                stateClass =
                  'bg-emerald-500 border-emerald-700 text-white ring-4 ring-emerald-200 scale-105';
              } else if (isChosen && !isRight) {
                stateClass = 'bg-rose-500 border-rose-700 text-white opacity-90';
              } else {
                stateClass = 'bg-slate-200 border-slate-300 text-slate-400 opacity-60';
              }
            }
            return (
              <button
                key={art}
                onClick={() => handleSelect(art)}
                disabled={selected !== null}
                className={`btn-3d rounded-3xl border-b-4 py-6 font-de text-2xl font-black transition ${stateClass}`}
              >
                {art}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {current.options.map((opt, idx) => {
            const isChosen = selected === opt;
            const isRight = opt === current.correctAnswer;
            let cls =
              'bg-white border-2 border-b-4 border-slate-200 text-slate-700 hover:border-sky-300 hover:bg-sky-50/40';
            if (selected !== null) {
              if (isRight) {
                cls = 'bg-emerald-50 border-2 border-b-4 border-emerald-500 text-emerald-800';
              } else if (isChosen && !isRight) {
                cls = 'bg-rose-50 border-2 border-b-4 border-rose-500 text-rose-800';
              } else {
                cls = 'bg-slate-50 border-2 border-slate-200 text-slate-400 opacity-60';
              }
            }

            return (
              <button
                key={idx}
                onClick={() => handleSelect(opt)}
                disabled={selected !== null}
                dir={current.type === 'meaning-fa-de' ? 'ltr' : 'rtl'}
                className={`btn-3d w-full rounded-2xl px-5 py-4 font-extrabold text-base flex items-center justify-between transition ${cls} ${
                  current.type === 'meaning-fa-de' ? 'font-de text-left' : 'text-right'
                }`}
              >
                <span>{opt}</span>
                {selected !== null && isRight && (
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                )}
                {selected !== null && isChosen && !isRight && (
                  <XCircle className="w-6 h-6 text-rose-500 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Duolingo-style Bottom Feedback Banner */}
      {selected !== null && (
        <div
          className={`fixed bottom-0 inset-x-0 z-50 p-4 border-t-4 shadow-2xl ${
            isCorrectSelected
              ? 'bg-emerald-50 border-emerald-400'
              : 'bg-rose-50 border-rose-400'
          }`}
        >
          <div className="max-w-lg mx-auto space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {isCorrectSelected ? (
                  <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-7 h-7 text-rose-600 shrink-0" />
                )}
                <div>
                  <div
                    className={`font-black text-base ${
                      isCorrectSelected ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {isCorrectSelected ? 'آفرین! کاملاً درست بود 🎉' : 'اشکال نداره! یادت میمونه 💪'}
                  </div>
                  {!isCorrectSelected && (
                    <div className="text-xs font-bold text-rose-600">
                      پاسخ درست:{' '}
                      <span className="underline">
                        {current.type === 'article'
                          ? `${current.correctAnswer} ${current.card.word}`
                          : current.correctAnswer}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() =>
                  speakGerman(
                    current.card.exampleDe || formatGermanDisplay(current.card)
                  )
                }
                title="شنیدن جمله مثال"
                aria-label="شنیدن جمله مثال"
                className="btn-3d inline-flex items-center gap-1.5 rounded-2xl bg-white border-b-2 border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50 text-xs font-extrabold shadow-xs"
              >
                <Volume2 className="w-5 h-5 text-sky-600" />
                <span>شنیدن مثال</span>
              </button>
            </div>

            {current.card.exampleDe && (
              <div className="rounded-2xl bg-white/95 border border-slate-200/70 px-4 py-3 space-y-1.5 shadow-xs">
                <InteractiveSentence
                  sentence={current.card.exampleDe}
                  targetCard={current.card}
                  className="font-de text-base sm:text-lg font-extrabold text-slate-800 text-left leading-relaxed"
                />
                <div className="text-sm sm:text-base text-slate-600 font-bold leading-relaxed">
                  {current.card.exampleFa}
                </div>
              </div>
            )}

            <button
              onClick={handleNext}
              className={`btn-3d w-full rounded-2xl border-b-4 py-3.5 font-extrabold text-white text-base ${
                isCorrectSelected
                  ? 'bg-emerald-500 border-emerald-700 hover:bg-emerald-400'
                  : 'bg-rose-500 border-rose-700 hover:bg-rose-400'
              }`}
            >
              {index + 1 >= questions.length ? 'دیدن نتیجه آزمون 🏆' : 'سوال بعدی ⬅'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
