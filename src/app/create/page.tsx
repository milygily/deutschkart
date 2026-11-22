'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkles,
  FileText,
  Camera,
  Trash2,
  Check,
  Loader2,
  ArrowRight,
  Upload,
  Volume2,
  Plus,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { useApp } from '@/components/AppProvider';
import { getArticleStyle } from '@/lib/types';
import { speakGerman } from '@/lib/speech';
import type { GeneratedWordCard } from '@/lib/gemini';

const EMOJI_CHOICES = ['📘', '✨', '🇩🇪', '📝', '🎯', '🩺', '💼', '✈️', '🏡', '🍽️'];
const COLOR_CHOICES = [
  { key: 'violet', cls: 'bg-violet-500' },
  { key: 'emerald', cls: 'bg-emerald-500' },
  { key: 'sky', cls: 'bg-sky-500' },
  { key: 'amber', cls: 'bg-amber-400' },
  { key: 'rose', cls: 'bg-rose-500' },
];

async function compressImageToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('خواندن فایل ناموفق بود'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('فرمت تصویر پشتیبانی نمی‌شود'));
      img.onload = () => {
        const maxDim = 1600;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas error'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType: 'image/jpeg' });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function CreateDeckPage() {
  const router = useRouter();
  const { user, openAuthModal } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<'text' | 'image'>('text');
  const [rawText, setRawText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imagePayload, setImagePayload] = useState<{ base64: string; mimeType: string } | null>(
    null
  );
  const [imageHint, setImageHint] = useState('');

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [genStats, setGenStats] = useState<{ fromCache: number; fromAi: number } | null>(null);

  // Preview & Save state
  const [cards, setCards] = useState<GeneratedWordCard[]>([]);
  const [deckTitle, setDeckTitle] = useState('');
  const [deckLevel, setDeckLevel] = useState<'A1' | 'A2' | 'B1' | 'B2' | 'CUSTOM'>('CUSTOM');
  const [deckIcon, setDeckIcon] = useState('📘');
  const [deckColor, setDeckColor] = useState('violet');
  const [saving, setSaving] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const compressed = await compressImageToBase64(file);
      setImagePayload(compressed);
      setImagePreview(`data:${compressed.mimeType};base64,${compressed.base64}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در پردازش عکس');
    }
  }

  async function handleGenerate() {
    setError('');
    setGenerating(true);
    setGenStats(null);
    try {
      const payload =
        tab === 'text'
          ? { mode: 'text', text: rawText }
          : {
              mode: 'image',
              imageBase64: imagePayload?.base64,
              mimeType: imagePayload?.mimeType,
              hint: imageHint,
            };

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'خطا در تولید فلش‌کارت');
      } else if (!Array.isArray(data.cards) || data.cards.length === 0) {
        setError('کلمه آلمانی مشخصی پیدا نشد. لطفاً متن یا عکس واضح‌تری بفرستید.');
      } else {
        setCards(data.cards);
        if (data.stats) setGenStats(data.stats);
        if (!deckTitle) {
          setDeckTitle(`درس جدید (${new Date().toLocaleDateString('fa-IR')})`);
        }
      }
    } catch {
      setError('ارتباط با سرور هوش مصنوعی برقرار نشد.');
    } finally {
      setGenerating(false);
    }
  }

  function updateCard(idx: number, patch: Partial<GeneratedWordCard>) {
    setCards((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function removeCard(idx: number) {
    setCards((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSaveDeck() {
    if (!user) {
      openAuthModal('برای ذخیره این دسته فلش‌کارت در حسابت، در ۱۰ ثانیه وارد شو (کارت‌هایی که ساختی حفظ میشن!)');
      return;
    }
    if (!deckTitle.trim()) {
      setError('لطفاً یک اسم برای این دسته بنویس.');
      return;
    }
    if (cards.length === 0) {
      setError('هیچ کارتی برای ذخیره باقی نمانده.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: deckTitle.trim(),
          level: deckLevel,
          icon: deckIcon,
          color: deckColor,
          cards,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'خطا در ذخیره دسته');
        setSaving(false);
      } else {
        router.push(`/deck/${data.deck.id}`);
      }
    } catch {
      setError('خطا در ذخیره دسته');
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen pb-28">
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-500 hover:text-slate-800"
        >
          <ArrowRight className="w-4 h-4" />
          بازگشت به دسته‌ها
        </Link>

        {/* Header */}
        <section className="rounded-[2rem] bg-gradient-to-l from-violet-600 to-indigo-600 border-b-4 border-indigo-800 p-6 text-white shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black">ساخت جادویی فلش‌کارت با هوش مصنوعی ✨</h1>
              <p className="text-sm text-violet-100 mt-0.5">
                فقط لیست کلمات آلمانی یا <strong>عکس صفحه کتابت</strong> رو بده؛ معنی فارسی، آرتیکل رنگی و مثال رو خودم می‌سازم!
              </p>
            </div>
          </div>
        </section>

        {/* Input Section */}
        <section className="rounded-3xl bg-white border-2 border-slate-200 p-5 shadow-sm space-y-4">
          {/* Tabs */}
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
            <button
              type="button"
              onClick={() => setTab('text')}
              className={`rounded-xl py-3 text-sm font-extrabold flex items-center justify-center gap-2 transition ${
                tab === 'text'
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              متن / لیست کلمات
            </button>
            <button
              type="button"
              onClick={() => setTab('image')}
              className={`rounded-xl py-3 text-sm font-extrabold flex items-center justify-center gap-2 transition ${
                tab === 'image'
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Camera className="w-4 h-4" />
              عکس کتاب یا دفتر 📷
            </button>
          </div>

          {tab === 'text' ? (
            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-slate-600">
                کلمات آلمانی رو هرجور دوست داری اینجا بنویس یا پیست کن (حتی بدون آرتیکل):
              </label>
              <textarea
                rows={5}
                dir="ltr"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={`مثال:\nKühlschrank\naufhören\nErfahrung, pünktlich, sich freuen\nVorstellungsgespräch`}
                className="font-de w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-left focus:border-violet-400 focus:bg-white focus:outline-none"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {imagePreview ? (
                <div className="relative rounded-2xl overflow-hidden border-2 border-violet-200 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview}
                    alt="پیش‌نمایش عکس"
                    className="w-full max-h-72 object-contain mx-auto"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-3 left-3 rounded-xl bg-white/95 shadow-md px-3 py-1.5 text-xs font-extrabold text-violet-700 hover:bg-white"
                  >
                    تعویض عکس
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/50 hover:bg-violet-50 p-10 flex flex-col items-center justify-center gap-2 text-violet-700 transition"
                >
                  <Upload className="w-9 h-9 text-violet-500" />
                  <span className="font-extrabold text-sm">
                    برای انتخاب عکس یا گرفتن عکس با دوربین کلیک کن
                  </span>
                  <span className="text-xs text-violet-500">
                    صفحه کتاب درسی (Menschen / Netzwerk)، جزوه یا حتی دست‌نویس!
                  </span>
                </button>
              )}

              <input
                type="text"
                value={imageHint}
                onChange={(e) => setImageHint(e.target.value)}
                placeholder="توضیح اختیاری (مثلاً: فقط کلمات هایلایت‌شده یا افعال این صفحه)"
                className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold focus:border-violet-400 focus:bg-white focus:outline-none"
              />
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-rose-50 border-2 border-rose-200 px-4 py-3 text-xs font-extrabold text-rose-600">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={
              generating || (tab === 'text' ? !rawText.trim() : !imagePayload)
            }
            className="btn-3d w-full rounded-2xl bg-violet-600 border-b-4 border-violet-800 text-white py-4 font-black text-base flex items-center justify-center gap-2 hover:bg-violet-500 disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                هوش مصنوعی در حال ساخت فلش‌کارت‌هاست...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                تبدیل به فلش‌کارت آلمانی↔فارسی ✨
              </>
            )}
          </button>
        </section>

        {/* Preview & Edit Generated Cards */}
        {cards.length > 0 && (
          <section className="space-y-4">
            <div className="rounded-3xl bg-white border-2 border-emerald-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-black text-slate-800">
                  پیش‌نمایش و ذخیره دسته ({cards.length} کارت آماده 🎉)
                </h2>
                {genStats && (
                  <span className="text-[11px] font-extrabold bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full">
                    {genStats.fromCache > 0 && `${genStats.fromCache} از حافظه فوری · `}
                    {genStats.fromAi} تولید هوشمند AI
                  </span>
                )}
              </div>

              {/* Deck Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold text-slate-500 mb-1">
                    نام دسته
                  </label>
                  <input
                    type="text"
                    value={deckTitle}
                    onChange={(e) => setDeckTitle(e.target.value)}
                    placeholder="مثلاً: درس ۴ کتاب Menschen"
                    className="w-full rounded-2xl border-2 border-slate-200 px-4 py-2.5 text-sm font-bold focus:border-emerald-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-500 mb-1">
                    سطح (اختیاری)
                  </label>
                  <select
                    value={deckLevel}
                    onChange={(e) =>
                      setDeckLevel(e.target.value as 'A1' | 'A2' | 'B1' | 'B2' | 'CUSTOM')
                    }
                    className="w-full rounded-2xl border-2 border-slate-200 px-4 py-2.5 text-sm font-bold bg-white focus:border-emerald-400 focus:outline-none"
                  >
                    <option value="CUSTOM">دسته شخصی</option>
                    <option value="A1">A1</option>
                    <option value="A2">A2</option>
                    <option value="B1">B1</option>
                    <option value="B2">B2</option>
                  </select>
                </div>
              </div>

              {/* Emoji & Color Pickers */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {EMOJI_CHOICES.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setDeckIcon(em)}
                      className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition ${
                        deckIcon === em
                          ? 'bg-emerald-100 ring-2 ring-emerald-500 scale-110'
                          : 'bg-slate-50 hover:bg-slate-100'
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
                      onClick={() => setDeckColor(c.key)}
                      className={`w-7 h-7 rounded-full ${c.cls} transition ${
                        deckColor === c.key ? 'ring-4 ring-slate-300 scale-110' : 'opacity-70'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleSaveDeck}
                disabled={saving}
                className="btn-3d w-full rounded-2xl bg-emerald-500 border-b-4 border-emerald-700 text-white py-4 font-black text-base flex items-center justify-center gap-2 hover:bg-emerald-400 disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    در حال ذخیره در دیتابیس...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5 stroke-[3]" />
                    ذخیره دسته و شروع مرور! 🚀
                  </>
                )}
              </button>
            </div>

            {/* Editable Cards List */}
            <div className="space-y-3">
              {cards.map((card, idx) => {
                const art = getArticleStyle(card.article);
                return (
                  <div
                    key={idx}
                    className={`rounded-2xl bg-white border-2 ${art.ring} p-4 space-y-3 shadow-xs`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1" dir="ltr">
                        <select
                          value={card.article || ''}
                          onChange={(e) =>
                            updateCard(idx, {
                              article:
                                e.target.value === 'der' ||
                                e.target.value === 'die' ||
                                e.target.value === 'das'
                                  ? e.target.value
                                  : null,
                            })
                          }
                          className={`font-de text-xs font-extrabold rounded-xl px-2 py-1.5 border ${
                            card.article ? art.badgeBg : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <option value="" className="text-slate-700 bg-white">
                            بدون آرتیکل
                          </option>
                          <option value="der" className="text-slate-700 bg-white">
                            der
                          </option>
                          <option value="die" className="text-slate-700 bg-white">
                            die
                          </option>
                          <option value="das" className="text-slate-700 bg-white">
                            das
                          </option>
                        </select>

                        <input
                          type="text"
                          value={card.word}
                          onChange={(e) => updateCard(idx, { word: e.target.value })}
                          className="font-de font-extrabold text-base text-slate-800 bg-slate-50 rounded-xl px-3 py-1 flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-violet-300"
                        />
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            speakGerman(card.article ? `${card.article} ${card.word}` : card.word)
                          }
                          className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 hover:bg-sky-100 flex items-center justify-center"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCard(idx)}
                          className="w-9 h-9 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 flex items-center justify-center"
                          title="حذف این کارت"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={card.persianMeaning}
                        onChange={(e) => updateCard(idx, { persianMeaning: e.target.value })}
                        placeholder="معنی فارسی"
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold focus:bg-white focus:border-violet-400 focus:outline-none"
                      />
                      <input
                        type="text"
                        dir="ltr"
                        value={card.englishMeaning}
                        onChange={(e) => updateCard(idx, { englishMeaning: e.target.value })}
                        placeholder="English meaning"
                        className="font-de rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-left focus:bg-white focus:border-violet-400 focus:outline-none"
                      />
                    </div>

                    {card.exampleDe && (
                      <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs space-y-0.5">
                        <div dir="ltr" className="font-de font-bold text-slate-600 text-left">
                          {card.exampleDe}
                        </div>
                        <div className="text-slate-500">{card.exampleFa}</div>
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() =>
                  setCards((prev) => [
                    ...prev,
                    {
                      word: '',
                      article: null,
                      plural: null,
                      partOfSpeech: 'noun',
                      verbForms: null,
                      persianMeaning: '',
                      englishMeaning: '',
                      exampleDe: '',
                      exampleFa: '',
                      level: null,
                    },
                  ])
                }
                className="w-full rounded-2xl border-2 border-dashed border-slate-300 py-3 text-xs font-extrabold text-slate-500 hover:border-violet-400 hover:text-violet-600 flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                افزودن یک کارت دستی دیگر
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
