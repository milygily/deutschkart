'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  BookOpen,
  Pencil,
  Plus,
  Check,
  X,
  Sparkles,
  Loader2,
  Flame,
  Headphones,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { useApp } from '@/components/AppProvider';
import { formatGermanDisplay, getArticleStyle, type WordCard } from '@/lib/types';
import {
  formatNextReviewFa,
  getStageFromBox,
  isCardDue,
  STAGE_META,
  STAGE_ORDER,
  type MasteryStage,
} from '@/lib/leitner';
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

const EMOJI_CHOICES = ['📘', '✨', '🇩🇪', '📝', '🎯', '🩺', '💼', '✈️', '🏡', '🍽️'];
const COLOR_CHOICES = [
  { key: 'violet', cls: 'bg-violet-500' },
  { key: 'emerald', cls: 'bg-emerald-500' },
  { key: 'sky', cls: 'bg-sky-500' },
  { key: 'amber', cls: 'bg-amber-400' },
  { key: 'rose', cls: 'bg-rose-500' },
];

export default function DeckDetailPage() {
  const params = useParams();
  const router = useRouter();
  const deckId = Number(params.id);
  const { user, showEnglish, starredIds, toggleStar, guestProgress } = useApp();

  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [cards, setCards] = useState<WordCard[]>([]);
  const [savedBrowseIndex, setSavedBrowseIndex] = useState(0);
  const [stageFilter, setStageFilter] = useState<MasteryStage | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const wordListRef = useRef<HTMLElement>(null);

  // Deck edit state
  const [editingDeck, setEditingDeck] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIcon, setEditIcon] = useState('📘');
  const [editColor, setEditColor] = useState('violet');
  const [editLevel, setEditLevel] = useState('CUSTOM');
  const [savingDeck, setSavingDeck] = useState(false);

  // Add card panel state
  const [addingOpen, setAddingOpen] = useState(false);
  const [addMode, setAddMode] = useState<'ai' | 'manual'>('ai');
  const [aiWordsText, setAiWordsText] = useState('');
  const [manualArticle, setManualArticle] = useState('');
  const [manualWord, setManualWord] = useState('');
  const [manualPlural, setManualPlural] = useState('');
  const [manualMeaningFa, setManualMeaningFa] = useState('');
  const [manualMeaningEn, setManualMeaningEn] = useState('');
  const [manualExampleDe, setManualExampleDe] = useState('');
  const [manualExampleFa, setManualExampleFa] = useState('');
  const [addingBusy, setAddingBusy] = useState(false);
  const [addError, setAddError] = useState('');

  // Inline card edit state
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [cardForm, setCardForm] = useState({
    article: '',
    word: '',
    plural: '',
    persianMeaning: '',
    englishMeaning: '',
    exampleDe: '',
    exampleFa: '',
  });
  const [savingCard, setSavingCard] = useState(false);

  const loadDeck = useCallback(async () => {
    if (!deckId) return;
    try {
      const [data, bm] = await Promise.all([
        fetch(`/api/decks/${deckId}`, { cache: 'no-store' }).then((r) => r.json()),
        user
          ? fetch(`/api/decks/${deckId}/bookmark`, { cache: 'no-store' }).then((r) => r.json())
          : Promise.resolve({ lastIndex: 0 }),
      ]);
      if (data.deck) {
        setDeck(data.deck);
        setEditTitle(data.deck.title);
        setEditDescription(data.deck.description || '');
        setEditIcon(data.deck.icon || '📘');
        setEditColor(data.deck.color || 'violet');
        setEditLevel(data.deck.level || 'CUSTOM');
      }
      if (Array.isArray(data.cards)) setCards(data.cards);

      let idx = Number(bm?.lastIndex) || 0;
      try {
        const localVal = Number(localStorage.getItem(`dk_browse_pos_${deckId}`)) || 0;
        if (!user || localVal > idx) idx = Math.max(idx, localVal);
      } catch {
        // ignore
      }
      setSavedBrowseIndex(idx);
    } finally {
      setLoading(false);
    }
  }, [deckId, user]);

  useEffect(() => {
    loadDeck();
  }, [loadDeck]);

  async function handleSaveDeck() {
    if (!deck || !editTitle.trim()) return;
    setSavingDeck(true);
    try {
      const res = await fetch(`/api/decks/${deck.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim(),
          icon: editIcon,
          color: editColor,
          level: editLevel,
        }),
      });
      const data = await res.json();
      if (res.ok && data.deck) {
        setDeck(data.deck);
        setEditingDeck(false);
      }
    } finally {
      setSavingDeck(false);
    }
  }

  async function handleDeleteDeck() {
    if (!deck || deck.isSystem) return;
    if (!confirm(`دسته «${deck.title}» به‌طور کامل حذف شود؟`)) return;
    setDeleting(true);
    const res = await fetch(`/api/decks/${deck.id}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/');
    } else {
      setDeleting(false);
    }
  }

  function startEditCard(card: WordCard) {
    if (!card.deckCardId) return;
    setEditingCardId(card.deckCardId);
    setCardForm({
      article: card.article || '',
      word: card.word,
      plural: card.plural || '',
      persianMeaning: card.persianMeaning,
      englishMeaning: card.englishMeaning || '',
      exampleDe: card.exampleDe || '',
      exampleFa: card.exampleFa || '',
    });
  }

  async function handleSaveCard(deckCardId: number) {
    if (!deck || !cardForm.word.trim() || !cardForm.persianMeaning.trim()) return;
    setSavingCard(true);
    try {
      const res = await fetch(`/api/decks/${deck.id}/cards/${deckCardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article: cardForm.article || null,
          word: cardForm.word.trim(),
          plural: cardForm.plural.trim(),
          persianMeaning: cardForm.persianMeaning.trim(),
          englishMeaning: cardForm.englishMeaning.trim(),
          exampleDe: cardForm.exampleDe.trim(),
          exampleFa: cardForm.exampleFa.trim(),
        }),
      });
      if (res.ok) {
        setEditingCardId(null);
        await loadDeck();
      }
    } finally {
      setSavingCard(false);
    }
  }

  async function handleDeleteCard(card: WordCard) {
    if (!deck || !card.deckCardId) return;
    if (!confirm(`کلمه «${formatGermanDisplay(card)}» از این دسته حذف شود؟`)) return;
    const res = await fetch(`/api/decks/${deck.id}/cards/${card.deckCardId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setCards((prev) => prev.filter((c) => c.deckCardId !== card.deckCardId));
    }
  }

  async function handleAddWordSubmit() {
    if (!deck) return;
    setAddError('');
    setAddingBusy(true);

    try {
      if (addMode === 'ai') {
        if (!aiWordsText.trim()) {
          setAddError('لطفاً حداقل یک کلمه آلمانی بنویسید.');
          setAddingBusy(false);
          return;
        }
        const genRes = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'text', text: aiWordsText.trim() }),
        });
        const genData = await genRes.json();
        if (!genRes.ok || !Array.isArray(genData.cards) || genData.cards.length === 0) {
          setAddError(genData.error || 'کلمه‌ای شناسایی نشد. دوباره تلاش کنید.');
          setAddingBusy(false);
          return;
        }

        const saveRes = await fetch(`/api/decks/${deck.id}/cards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cards: genData.cards }),
        });
        if (!saveRes.ok) {
          setAddError('خطا در ذخیره کلمات جدید.');
          setAddingBusy(false);
          return;
        }
        setAiWordsText('');
        setAddingOpen(false);
        await loadDeck();
      } else {
        if (!manualWord.trim() || !manualMeaningFa.trim()) {
          setAddError('کلمه آلمانی و معنی فارسی هر دو الزامی هستند.');
          setAddingBusy(false);
          return;
        }
        const saveRes = await fetch(`/api/decks/${deck.id}/cards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            article: manualArticle || null,
            word: manualWord.trim(),
            plural: manualPlural.trim() || null,
            persianMeaning: manualMeaningFa.trim(),
            englishMeaning: manualMeaningEn.trim(),
            exampleDe: manualExampleDe.trim(),
            exampleFa: manualExampleFa.trim(),
          }),
        });
        if (!saveRes.ok) {
          setAddError('خطا در افزودن کلمه.');
          setAddingBusy(false);
          return;
        }
        setManualArticle('');
        setManualWord('');
        setManualPlural('');
        setManualMeaningFa('');
        setManualMeaningEn('');
        setManualExampleDe('');
        setManualExampleFa('');
        setAddingOpen(false);
        await loadDeck();
      }
    } catch {
      setAddError('خطا در ارتباط با سرور.');
    } finally {
      setAddingBusy(false);
    }
  }

  const canEdit = Boolean(deck && !deck.isSystem);
  const nounCount = cards.filter(
    (c) => c.article === 'der' || c.article === 'die' || c.article === 'das'
  ).length;

  const stageCounts = { new: 0, learning: 0, familiar: 0, learned: 0, mastered: 0 };
  let dueCount = 0;

  const getEffectiveBoxAndDue = (card: WordCard) => {
    const box = user
      ? card.progress?.leitnerBox ?? 0
      : guestProgress[card.id]?.leitnerBox ?? 0;
    const dueAt = user ? card.progress?.dueAt ?? null : guestProgress[card.id]?.dueAt ?? null;
    return { box, dueAt };
  };

  for (const c of cards) {
    const { box, dueAt } = getEffectiveBoxAndDue(c);
    const stage = getStageFromBox(box);
    stageCounts[stage]++;
    if (isCardDue(box, dueAt)) dueCount++;
  }

  const filteredCards = stageFilter
    ? cards.filter((c) => getStageFromBox(getEffectiveBoxAndDue(c).box) === stageFilter)
    : cards;

  function handleToggleStageFilter(stage: MasteryStage) {
    if (stageFilter === stage) {
      setStageFilter(null);
      return;
    }
    setStageFilter(stage);
    setTimeout(() => {
      wordListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  return (
    <div className="min-h-screen pb-24">
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 pt-5 space-y-6">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-500 hover:text-slate-800"
          >
            <ArrowRight className="w-4 h-4" />
            بازگشت به دسته‌ها
          </Link>

          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditingDeck((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 px-3 py-1.5 text-xs font-extrabold"
              >
                <Pencil className="w-3.5 h-3.5" />
                {editingDeck ? 'بستن ویرایش' : 'ویرایش دسته'}
              </button>
              <button
                onClick={handleDeleteDeck}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 px-3 py-1.5 text-xs font-extrabold"
              >
                <Trash2 className="w-3.5 h-3.5" />
                حذف دسته
              </button>
            </div>
          )}
        </div>

        {loading || !deck ? (
          <div className="h-64 rounded-3xl bg-white border-2 border-slate-100 animate-pulse" />
        ) : (
          <>
            {/* Header Card */}
            <section className="rounded-[2rem] bg-white border-2 border-slate-200 p-6 shadow-sm space-y-5">
              {editingDeck && canEdit ? (
                <div className="space-y-4 rounded-2xl bg-violet-50/60 border-2 border-violet-200 p-4">
                  <div className="text-sm font-black text-violet-800">
                    ✏️ ویرایش مشخصات دسته
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-600 mb-1">
                        نام دسته
                      </label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3.5 py-2 text-sm font-bold focus:border-violet-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-extrabold text-slate-600 mb-1">
                        سطح
                      </label>
                      <select
                        value={editLevel}
                        onChange={(e) => setEditLevel(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3.5 py-2 text-sm font-bold focus:border-violet-400 focus:outline-none"
                      >
                        <option value="CUSTOM">دسته شخصی</option>
                        <option value="A1">A1</option>
                        <option value="A2">A2</option>
                        <option value="B1">B1</option>
                        <option value="B2">B2</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-600 mb-1">
                      توضیح کوتاه (اختیاری)
                    </label>
                    <input
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="مثلاً: لغات درس ۴ کتاب Menschen"
                      className="w-full rounded-xl border-2 border-slate-200 bg-white px-3.5 py-2 text-sm font-bold focus:border-violet-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      {EMOJI_CHOICES.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setEditIcon(em)}
                          className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center ${
                            editIcon === em
                              ? 'bg-violet-200 ring-2 ring-violet-500'
                              : 'bg-white hover:bg-slate-100'
                          }`}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      {COLOR_CHOICES.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => setEditColor(c.key)}
                          className={`w-6 h-6 rounded-full ${c.cls} ${
                            editColor === c.key ? 'ring-4 ring-violet-300 scale-110' : 'opacity-70'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveDeck}
                      disabled={savingDeck || !editTitle.trim()}
                      className="btn-3d rounded-xl bg-emerald-500 border-b-4 border-emerald-700 text-white px-5 py-2 text-xs font-black flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      {savingDeck ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
                    </button>
                    <button
                      onClick={() => setEditingDeck(false)}
                      className="rounded-xl bg-white border border-slate-200 text-slate-600 px-4 py-2 text-xs font-extrabold"
                    >
                      انصراف
                    </button>
                  </div>
                </div>
              ) : (
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
                        {cards.length} کلمه
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-2xl font-black text-slate-800">{deck.title}</h1>
                      {canEdit && (
                        <button
                          onClick={() => setEditingDeck(true)}
                          title="ویرایش نام دسته"
                          className="p-1.5 rounded-xl text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {deck.description && (
                      <p className="text-sm text-slate-500">{deck.description}</p>
                    )}
                  </div>
                </div>
              )}

              {/* 5-Stage Leitner Mastery Breakdown (Interactive Filters) */}
              {cards.length > 0 && (
                <div className="rounded-2xl bg-slate-50 border-2 border-slate-100 p-4 space-y-3">
                  {/* Segmented Colorful Bar */}
                  <div className="h-3.5 rounded-full bg-slate-200 overflow-hidden flex">
                    {STAGE_ORDER.map((stage) => {
                      const count = stageCounts[stage];
                      if (count === 0) return null;
                      const pct = (count / cards.length) * 100;
                      return (
                        <button
                          key={stage}
                          type="button"
                          onClick={() => handleToggleStageFilter(stage)}
                          className={`h-full transition-all duration-300 cursor-pointer hover:brightness-95 ${STAGE_META[stage].barClass}`}
                          style={{ width: `${pct}%` }}
                          title={`نمایش کلمات «${STAGE_META[stage].label}» (${count})`}
                        />
                      );
                    })}
                  </div>

                  {/* Clickable Stage Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {STAGE_ORDER.map((stage) => {
                      const meta = STAGE_META[stage];
                      const count = stageCounts[stage];
                      const isActive = stageFilter === stage;
                      return (
                        <button
                          key={stage}
                          type="button"
                          onClick={() => handleToggleStageFilter(stage)}
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-extrabold transition cursor-pointer ${meta.pillClass} ${
                            isActive
                              ? 'ring-2 ring-offset-1 ring-slate-700 scale-105 shadow-xs'
                              : count === 0
                                ? 'opacity-50 hover:opacity-80'
                                : 'hover:scale-105 hover:shadow-xs'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
                          <span>{count}</span>
                          <span>{meta.label}</span>
                        </button>
                      );
                    })}
                    {stageFilter && (
                      <button
                        type="button"
                        onClick={() => setStageFilter(null)}
                        className="inline-flex items-center gap-1 rounded-xl bg-slate-800 text-white px-2.5 py-1 text-xs font-extrabold hover:bg-slate-700"
                      >
                        <X className="w-3.5 h-3.5" />
                        نمایش همه
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Action Modes */}
              <div className="space-y-3 pt-1">
                {dueCount > 0 && (
                  <Link
                    href={`/deck/${deck.id}/study?onlyDue=1`}
                    className="btn-3d w-full rounded-2xl bg-gradient-to-l from-orange-500 to-amber-500 border-b-4 border-orange-700 text-white py-4 px-5 flex items-center justify-center gap-2 font-black text-base shadow-md hover:brightness-105"
                  >
                    <Flame className="w-5 h-5 fill-white" />
                    <span>مرور کلمات امروز ({dueCount} کارت نوبت مرورشونه 🔥)</span>
                  </Link>
                )}
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

                <Link
                  href={`/deck/${deck.id}/practice`}
                  className="btn-3d w-full rounded-2xl bg-gradient-to-l from-indigo-500 to-violet-600 border-b-4 border-indigo-800 text-white py-4 px-5 flex items-center justify-center gap-2.5 font-black text-base shadow-md hover:brightness-105"
                >
                  <Sparkles className="w-5 h-5" />
                  تمرین کامل دولینگویی (جمله‌سازی + شنیداری + مکالمه 🎮)
                </Link>

                <Link
                  href={`/deck/${deck.id}/story`}
                  className="btn-3d w-full rounded-2xl bg-gradient-to-l from-rose-500 to-pink-500 border-b-4 border-rose-700 text-white py-4 px-5 flex items-center justify-center gap-2.5 font-black text-base shadow-md hover:brightness-105"
                >
                  <Headphones className="w-5 h-5" />
                  داستان تعاملی و پادکست صوتی 🎧
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

            {/* Word List + Add Word Section */}
            <section ref={wordListRef} className="space-y-3 scroll-mt-20">
              <div className="flex items-center justify-between gap-2 px-1 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-black text-slate-700">
                    {stageFilter
                      ? `کلمات «${STAGE_META[stageFilter].label}» (${filteredCards.length} از ${cards.length})`
                      : `لیست کلمات این دسته (${cards.length})`}
                  </h2>
                  {stageFilter && (
                    <button
                      type="button"
                      onClick={() => setStageFilter(null)}
                      className="inline-flex items-center gap-1 rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 px-2.5 py-1 text-xs font-extrabold"
                    >
                      <X className="w-3.5 h-3.5" />
                      پاک کردن فیلتر
                    </button>
                  )}
                </div>

                {canEdit && (
                  <button
                    onClick={() => {
                      setAddingOpen((o) => !o);
                      setAddError('');
                    }}
                    className="btn-3d inline-flex items-center gap-1.5 rounded-2xl bg-emerald-500 border-b-4 border-emerald-700 text-white px-4 py-2 text-xs font-black hover:bg-emerald-400"
                  >
                    {addingOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {addingOpen ? 'بستن' : 'افزودن کلمه جدید'}
                  </button>
                )}
              </div>

              {/* Quick Actions for the Active Stage Filter */}
              {stageFilter && filteredCards.length > 0 && (
                <div className="rounded-2xl bg-white border-2 border-slate-200 p-3 flex flex-wrap items-center gap-2 shadow-xs">
                  <span className="text-xs font-extrabold text-slate-500 ml-auto">
                    تمرین فقط همین {filteredCards.length} کلمه:
                  </span>
                  <Link
                    href={`/deck/${deck.id}/browse?stage=${stageFilter}`}
                    className="btn-3d rounded-xl bg-teal-500 border-b-2 border-teal-700 text-white px-3 py-1.5 text-xs font-extrabold"
                  >
                    📖 مرور آزاد
                  </Link>
                  <Link
                    href={`/deck/${deck.id}/study?stage=${stageFilter}`}
                    className="btn-3d rounded-xl bg-emerald-500 border-b-2 border-emerald-700 text-white px-3 py-1.5 text-xs font-extrabold"
                  >
                    🃏 سوایپ
                  </Link>
                  {filteredCards.length >= 2 && (
                    <Link
                      href={`/deck/${deck.id}/quiz?mode=meaning-mix&stage=${stageFilter}`}
                      className="btn-3d rounded-xl bg-sky-500 border-b-2 border-sky-700 text-white px-3 py-1.5 text-xs font-extrabold"
                    >
                      🎯 آزمون
                    </Link>
                  )}
                </div>
              )}

              {/* Add New Word(s) Collapsible Panel */}
              {canEdit && addingOpen && (
                <div className="rounded-3xl bg-white border-2 border-emerald-300 p-5 shadow-md space-y-4">
                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAddMode('ai');
                        setAddError('');
                      }}
                      className={`rounded-xl py-2.5 text-xs font-black flex items-center justify-center gap-1.5 transition ${
                        addMode === 'ai'
                          ? 'bg-white text-violet-700 shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      <Sparkles className="w-4 h-4" />
                      افزودن سریع با هوش مصنوعی
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddMode('manual');
                        setAddError('');
                      }}
                      className={`rounded-xl py-2.5 text-xs font-black flex items-center justify-center gap-1.5 transition ${
                        addMode === 'manual'
                          ? 'bg-white text-emerald-700 shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      <Pencil className="w-4 h-4" />
                      افزودن دستی با معنی دلخواه
                    </button>
                  </div>

                  {addMode === 'ai' ? (
                    <div className="space-y-2">
                      <label className="block text-xs font-extrabold text-slate-600">
                        یک یا چند کلمه آلمانی بنویس تا هوش مصنوعی آرتیکل، معنی فارسی و مثالش رو خودش بسازه و اضافه کنه:
                      </label>
                      <textarea
                        rows={3}
                        dir="ltr"
                        value={aiWordsText}
                        onChange={(e) => setAiWordsText(e.target.value)}
                        placeholder="مثلاً: Kühlschrank, pünktlich, aufhören"
                        className="font-de w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-left focus:bg-white focus:border-violet-400 focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2" dir="ltr">
                        <select
                          value={manualArticle}
                          onChange={(e) => setManualArticle(e.target.value)}
                          className="font-de rounded-xl border-2 border-slate-200 bg-white px-2.5 py-2 text-xs font-extrabold"
                        >
                          <option value="">بدون آرتیکل</option>
                          <option value="der">der</option>
                          <option value="die">die</option>
                          <option value="das">das</option>
                        </select>
                        <input
                          type="text"
                          value={manualWord}
                          onChange={(e) => setManualWord(e.target.value)}
                          placeholder="کلمه آلمانی (مثلاً Tisch)"
                          className="font-de flex-1 rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold focus:bg-white focus:border-emerald-400 focus:outline-none"
                        />
                        <input
                          type="text"
                          value={manualPlural}
                          onChange={(e) => setManualPlural(e.target.value)}
                          placeholder="جمع (اختیاری)"
                          className="font-de w-32 rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold focus:bg-white focus:border-emerald-400 focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={manualMeaningFa}
                          onChange={(e) => setManualMeaningFa(e.target.value)}
                          placeholder="معنی فارسی (الزامی)"
                          className="rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold focus:bg-white focus:border-emerald-400 focus:outline-none"
                        />
                        <input
                          type="text"
                          dir="ltr"
                          value={manualMeaningEn}
                          onChange={(e) => setManualMeaningEn(e.target.value)}
                          placeholder="English meaning (optional)"
                          className="font-de rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-left focus:bg-white focus:border-emerald-400 focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          dir="ltr"
                          value={manualExampleDe}
                          onChange={(e) => setManualExampleDe(e.target.value)}
                          placeholder="جمله مثال آلمانی (اختیاری)"
                          className="font-de rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-left focus:bg-white focus:border-emerald-400 focus:outline-none"
                        />
                        <input
                          type="text"
                          value={manualExampleFa}
                          onChange={(e) => setManualExampleFa(e.target.value)}
                          placeholder="ترجمه فارسی مثال (اختیاری)"
                          className="rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold focus:bg-white focus:border-emerald-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {addError && (
                    <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-extrabold text-rose-600">
                      {addError}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleAddWordSubmit}
                    disabled={addingBusy}
                    className={`btn-3d w-full rounded-2xl border-b-4 py-3 text-sm font-black text-white flex items-center justify-center gap-2 disabled:opacity-50 ${
                      addMode === 'ai'
                        ? 'bg-violet-600 border-violet-800 hover:bg-violet-500'
                        : 'bg-emerald-500 border-emerald-700 hover:bg-emerald-400'
                    }`}
                  >
                    {addingBusy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        در حال پردازش و ذخیره...
                      </>
                    ) : addMode === 'ai' ? (
                      <>
                        <Sparkles className="w-4 h-4" />
                        ساخت با AI و اضافه کردن به این دسته
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        اضافه کردن به دسته
                      </>
                    )}
                  </button>
                </div>
              )}

              <div className="space-y-2.5">
                {filteredCards.length === 0 && stageFilter ? (
                  <div className="rounded-2xl bg-white border-2 border-dashed border-slate-200 p-8 text-center space-y-2">
                    <p className="text-sm font-extrabold text-slate-500">
                      فعلاً هیچ کلمه‌ای در مرحله «{STAGE_META[stageFilter].label}» نیست.
                    </p>
                    <button
                      type="button"
                      onClick={() => setStageFilter(null)}
                      className="text-xs font-black text-emerald-600 hover:underline"
                    >
                      نمایش همه کلمات دسته
                    </button>
                  </div>
                ) : null}
                {filteredCards.map((card) => {
                  const art = getArticleStyle(card.article);
                  const isStarred = starredIds.has(card.id);
                  const { box, dueAt } = getEffectiveBoxAndDue(card);
                  const stage = getStageFromBox(box);
                  const stageMeta = STAGE_META[stage];
                  const nextReviewText = formatNextReviewFa(box, dueAt);
                  const isEditingThis = Boolean(
                    canEdit && card.deckCardId && editingCardId === card.deckCardId
                  );

                  if (isEditingThis && card.deckCardId) {
                    return (
                      <div
                        key={card.deckCardId}
                        className="rounded-2xl bg-violet-50/70 border-2 border-violet-300 p-4 space-y-3 shadow-sm"
                      >
                        <div className="flex items-center gap-2" dir="ltr">
                          <select
                            value={cardForm.article}
                            onChange={(e) =>
                              setCardForm((f) => ({ ...f, article: e.target.value }))
                            }
                            className="font-de rounded-xl border-2 border-slate-200 bg-white px-2.5 py-1.5 text-xs font-extrabold"
                          >
                            <option value="">بدون آرتیکل</option>
                            <option value="der">der</option>
                            <option value="die">die</option>
                            <option value="das">das</option>
                          </select>
                          <input
                            type="text"
                            value={cardForm.word}
                            onChange={(e) =>
                              setCardForm((f) => ({ ...f, word: e.target.value }))
                            }
                            className="font-de flex-1 rounded-xl border-2 border-slate-200 bg-white px-3 py-1.5 text-sm font-extrabold"
                          />
                          <input
                            type="text"
                            value={cardForm.plural}
                            onChange={(e) =>
                              setCardForm((f) => ({ ...f, plural: e.target.value }))
                            }
                            placeholder="جمع"
                            className="font-de w-28 sm:w-36 rounded-xl border-2 border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={cardForm.persianMeaning}
                            onChange={(e) =>
                              setCardForm((f) => ({ ...f, persianMeaning: e.target.value }))
                            }
                            placeholder="معنی فارسی"
                            className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-bold"
                          />
                          <input
                            type="text"
                            dir="ltr"
                            value={cardForm.englishMeaning}
                            onChange={(e) =>
                              setCardForm((f) => ({ ...f, englishMeaning: e.target.value }))
                            }
                            placeholder="معنی انگلیسی"
                            className="font-de rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-left"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            dir="ltr"
                            value={cardForm.exampleDe}
                            onChange={(e) =>
                              setCardForm((f) => ({ ...f, exampleDe: e.target.value }))
                            }
                            placeholder="جمله مثال آلمانی"
                            className="font-de rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-left"
                          />
                          <input
                            type="text"
                            value={cardForm.exampleFa}
                            onChange={(e) =>
                              setCardForm((f) => ({ ...f, exampleFa: e.target.value }))
                            }
                            placeholder="ترجمه فارسی مثال"
                            className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-semibold"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSaveCard(card.deckCardId!)}
                            disabled={savingCard}
                            className="btn-3d rounded-xl bg-emerald-500 border-b-4 border-emerald-700 text-white px-4 py-2 text-xs font-black flex items-center gap-1.5"
                          >
                            <Check className="w-4 h-4" />
                            {savingCard ? 'ذخیره...' : 'ذخیره کارت'}
                          </button>
                          <button
                            onClick={() => setEditingCardId(null)}
                            className="rounded-xl bg-white border border-slate-200 text-slate-600 px-3.5 py-2 text-xs font-extrabold"
                          >
                            انصراف
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={card.deckCardId ?? card.id}
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
                        </div>

                        <div className="text-sm font-bold text-slate-600">
                          {card.persianMeaning}
                          {showEnglish && card.englishMeaning && (
                            <span className="font-de text-xs text-slate-400 mr-2">
                              · {card.englishMeaning}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap pt-0.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-extrabold ${stageMeta.pillClass}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${stageMeta.dotClass}`} />
                            {stageMeta.label}
                          </span>
                          {nextReviewText && (
                            <span className="text-[11px] font-bold text-slate-400">
                              {nextReviewText}
                            </span>
                          )}
                          {card.verbForms && (
                            <span
                              dir="ltr"
                              className="font-de text-[11px] font-semibold text-violet-500"
                            >
                              · {card.verbForms}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => speakGerman(formatGermanDisplay(card))}
                          className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 hover:bg-sky-100 flex items-center justify-center"
                          aria-label="پخش تلفظ"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleStar(card.id)}
                          className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                            isStarred
                              ? 'bg-amber-50 text-amber-500'
                              : 'bg-slate-50 text-slate-300 hover:text-amber-400'
                          }`}
                          aria-label="ستاره‌دار"
                        >
                          <Star className={`w-4 h-4 ${isStarred ? 'fill-amber-400' : ''}`} />
                        </button>
                        {canEdit && card.deckCardId && (
                          <>
                            <button
                              onClick={() => startEditCard(card)}
                              className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 hover:bg-violet-100 flex items-center justify-center"
                              title="ویرایش کلمه و معنی"
                              aria-label="ویرایش کلمه"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteCard(card)}
                              className="w-9 h-9 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 flex items-center justify-center"
                              title="حذف از این دسته"
                              aria-label="حذف کلمه"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
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
