'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Volume2, Loader2 } from 'lucide-react';
import { speakGerman } from '@/lib/speech';
import { getArticleStyle } from '@/lib/types';

interface LookupResult {
  persianMeaning: string;
  baseForm: string | null;
  article: string | null;
}

// Instant 0ms dictionary for ultra-common German function words
const COMMON_WORDS: Record<string, LookupResult> = {
  ich: { persianMeaning: 'من', baseForm: null, article: null },
  du: { persianMeaning: 'تو', baseForm: null, article: null },
  er: { persianMeaning: 'او (مذکر)', baseForm: null, article: null },
  sie: { persianMeaning: 'او (مؤنث) / آن‌ها / شما', baseForm: null, article: null },
  es: { persianMeaning: 'آن / این', baseForm: null, article: null },
  wir: { persianMeaning: 'ما', baseForm: null, article: null },
  ihr: { persianMeaning: 'شماها', baseForm: null, article: null },
  mich: { persianMeaning: 'مرا', baseForm: 'ich (Akk)', article: null },
  mir: { persianMeaning: 'به من', baseForm: 'ich (Dat)', article: null },
  dich: { persianMeaning: 'تو را', baseForm: 'du (Akk)', article: null },
  dir: { persianMeaning: 'به تو', baseForm: 'du (Dat)', article: null },
  uns: { persianMeaning: 'ما را / به ما', baseForm: 'wir', article: null },
  mein: { persianMeaning: 'مالِ من', baseForm: null, article: null },
  meine: { persianMeaning: 'مالِ من', baseForm: null, article: null },
  meinem: { persianMeaning: 'مالِ من (داتیو)', baseForm: 'mein', article: null },
  meinen: { persianMeaning: 'مالِ من (آکوزاتیو)', baseForm: 'mein', article: null },
  dein: { persianMeaning: 'مالِ تو', baseForm: null, article: null },
  deine: { persianMeaning: 'مالِ تو', baseForm: null, article: null },
  sein: { persianMeaning: 'بودن / مالِ او', baseForm: null, article: null },
  unser: { persianMeaning: 'مالِ ما', baseForm: null, article: null },
  unsere: { persianMeaning: 'مالِ ما', baseForm: null, article: null },
  der: { persianMeaning: 'حرف تعریف (مذکر)', baseForm: null, article: 'der' },
  die: { persianMeaning: 'حرف تعریف (مؤنث/جمع)', baseForm: null, article: 'die' },
  das: { persianMeaning: 'حرف تعریف (خنثی) / آن', baseForm: null, article: 'das' },
  den: { persianMeaning: 'حرف تعریف (آکوزاتیو)', baseForm: 'der', article: 'der' },
  dem: { persianMeaning: 'حرف تعریف (داتیو)', baseForm: 'der / das', article: null },
  des: { persianMeaning: 'حرف تعریف (گنیتیو)', baseForm: null, article: null },
  ein: { persianMeaning: 'یک', baseForm: null, article: null },
  eine: { persianMeaning: 'یک', baseForm: null, article: null },
  einen: { persianMeaning: 'یک (آکوزاتیو)', baseForm: 'ein', article: null },
  einem: { persianMeaning: 'یک (داتیو)', baseForm: 'ein', article: null },
  einer: { persianMeaning: 'یک (داتیو مؤنث)', baseForm: 'eine', article: null },
  und: { persianMeaning: 'و', baseForm: null, article: null },
  oder: { persianMeaning: 'یا', baseForm: null, article: null },
  aber: { persianMeaning: 'اما، ولی', baseForm: null, article: null },
  nicht: { persianMeaning: 'نه / نیست (منفی‌ساز)', baseForm: null, article: null },
  kein: { persianMeaning: 'هیچ (منفی‌ساز اسم)', baseForm: null, article: null },
  keine: { persianMeaning: 'هیچ (منفی‌ساز اسم)', baseForm: null, article: null },
  in: { persianMeaning: 'در، داخلِ', baseForm: null, article: null },
  im: { persianMeaning: 'درِ (in + dem)', baseForm: 'in dem', article: null },
  am: { persianMeaning: 'درِ / کنارِ (an + dem)', baseForm: 'an dem', article: null },
  auf: { persianMeaning: 'رویِ / به / منتظرِ', baseForm: null, article: null },
  an: { persianMeaning: 'کنارِ / به / در', baseForm: null, article: null },
  mit: { persianMeaning: 'با', baseForm: null, article: null },
  von: { persianMeaning: 'از (طرفِ)', baseForm: null, article: null },
  für: { persianMeaning: 'برایِ', baseForm: null, article: null },
  zu: { persianMeaning: 'به / بیش از حد', baseForm: null, article: null },
  zum: { persianMeaning: 'به سویِ / برایِ (zu + dem)', baseForm: 'zu dem', article: null },
  zur: { persianMeaning: 'به سویِ / برایِ (zu + der)', baseForm: 'zu der', article: null },
  bei: { persianMeaning: 'پیشِ / نزدِ / هنگامِ', baseForm: null, article: null },
  beim: { persianMeaning: 'پیشِ / هنگامِ (bei + dem)', baseForm: 'bei dem', article: null },
  aus: { persianMeaning: 'از (درونِ)', baseForm: null, article: null },
  nach: { persianMeaning: 'به سمتِ / بعد از', baseForm: null, article: null },
  vor: { persianMeaning: 'قبل از / جلویِ', baseForm: null, article: null },
  über: { persianMeaning: 'درباره / بالایِ', baseForm: null, article: null },
  sehr: { persianMeaning: 'خیلی، بسیار', baseForm: null, article: null },
  noch: { persianMeaning: 'هنوز / باز هم', baseForm: null, article: null },
  schon: { persianMeaning: 'قبلاً / همین الان هم', baseForm: null, article: null },
  auch: { persianMeaning: 'همچنین، هم', baseForm: null, article: null },
  nur: { persianMeaning: 'فقط، تنها', baseForm: null, article: null },
  immer: { persianMeaning: 'همیشه', baseForm: null, article: null },
  oft: { persianMeaning: 'اغلب، زیاد', baseForm: null, article: null },
  hier: { persianMeaning: 'اینجا', baseForm: null, article: null },
  heute: { persianMeaning: 'امروز', baseForm: null, article: null },
  morgen: { persianMeaning: 'فردا', baseForm: null, article: null },
  gestern: { persianMeaning: 'دیروز', baseForm: null, article: null },
  bitte: { persianMeaning: 'لطفاً', baseForm: null, article: null },
  ist: { persianMeaning: 'است', baseForm: 'sein', article: null },
  sind: { persianMeaning: 'هستند / هستیم', baseForm: 'sein', article: null },
  bin: { persianMeaning: 'هستم', baseForm: 'sein', article: null },
  bist: { persianMeaning: 'هستی', baseForm: 'sein', article: null },
  war: { persianMeaning: 'بود / بودم', baseForm: 'sein', article: null },
  habe: { persianMeaning: 'دارم', baseForm: 'haben', article: null },
  hat: { persianMeaning: 'دارد', baseForm: 'haben', article: null },
  haben: { persianMeaning: 'داشتن / داریم', baseForm: 'haben', article: null },
  kann: { persianMeaning: 'می‌تواند / می‌توانم', baseForm: 'können', article: null },
  muss: { persianMeaning: 'باید', baseForm: 'müssen', article: null },
  man: { persianMeaning: 'آدم، فرد (فاعل نامعین)', baseForm: null, article: null },
  viel: { persianMeaning: 'زیاد', baseForm: null, article: null },
  viele: { persianMeaning: 'زیادی، بسیاری', baseForm: 'viel', article: null },
  alle: { persianMeaning: 'همه', baseForm: null, article: null },
  dieser: { persianMeaning: 'این', baseForm: 'dieser', article: null },
  diese: { persianMeaning: 'این', baseForm: 'dieser', article: null },
  dieses: { persianMeaning: 'این', baseForm: 'dieser', article: null },
  diesem: { persianMeaning: 'این (داتیو)', baseForm: 'dieser', article: null },
};

// Client-side cache shared across all components in the session
const clientLookupCache = new Map<string, LookupResult>();

interface InteractiveSentenceProps {
  sentence: string;
  targetCard?: {
    word: string;
    article: string | null;
    persianMeaning: string;
  };
  className?: string;
}

export function InteractiveSentence({
  sentence,
  targetCard,
  className = 'font-de text-sm sm:text-base font-extrabold text-slate-800 leading-relaxed text-left',
}: InteractiveSentenceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [activeWord, setActiveWord] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);

  // Reset popover when sentence changes
  useEffect(() => {
    setActiveIdx(null);
    setResult(null);
  }, [sentence]);

  // Close popover when clicking outside
  useEffect(() => {
    if (activeIdx === null) return;
    function onDocPointerDown(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveIdx(null);
      }
    }
    document.addEventListener('mousedown', onDocPointerDown);
    document.addEventListener('touchstart', onDocPointerDown);
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown);
      document.removeEventListener('touchstart', onDocPointerDown);
    };
  }, [activeIdx]);

  // Tokenize into alternating German words and spaces/punctuation
  const tokens = sentence.split(/([\p{L}äöüÄÖÜß-]+)/u).filter((t) => t.length > 0);

  async function handleWordClick(idx: number, rawToken: string, e: React.MouseEvent) {
    e.stopPropagation();
    const clean = rawToken.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    if (!clean) return;

    if (activeIdx === idx) {
      setActiveIdx(null);
      return;
    }

    setActiveIdx(idx);
    setActiveWord(clean);

    // 1. Instant match against the current flashcard's own word!
    if (
      targetCard &&
      clean.toLowerCase() === targetCard.word.trim().toLowerCase()
    ) {
      setLoading(false);
      setResult({
        persianMeaning: targetCard.persianMeaning,
        baseForm: targetCard.article
          ? `${targetCard.article} ${targetCard.word}`
          : targetCard.word,
        article: targetCard.article,
      });
      return;
    }

    // 2. Instant match against common function words
    const lower = clean.toLowerCase();
    if (COMMON_WORDS[lower]) {
      setLoading(false);
      setResult(COMMON_WORDS[lower]);
      return;
    }

    // 3. Check client session cache
    const cacheKey = `${lower}::${sentence}`;
    const cached = clientLookupCache.get(cacheKey);
    if (cached) {
      setLoading(false);
      setResult(cached);
      return;
    }

    // 4. Live lookup from Neon global_words / fast Gemini Flash
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/ai/word-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: clean, sentence }),
      });
      const data = await res.json();
      if (res.ok && data.persianMeaning) {
        const found: LookupResult = {
          persianMeaning: data.persianMeaning,
          baseForm: data.baseForm || null,
          article: data.article || null,
        };
        clientLookupCache.set(cacheKey, found);
        setResult(found);
      } else {
        setResult({ persianMeaning: 'معنی پیدا نشد', baseForm: null, article: null });
      }
    } catch {
      setResult({ persianMeaning: 'خطا در دریافت معنی', baseForm: null, article: null });
    } finally {
      setLoading(false);
    }
  }

  const artStyle = result?.article ? getArticleStyle(result.article) : null;

  return (
    <div ref={containerRef} dir="ltr" className={`relative ${className}`}>
      {tokens.map((tok, idx) => {
        const isWord = /^[\p{L}äöüÄÖÜß-]+$/u.test(tok);
        if (!isWord) {
          return <span key={idx}>{tok}</span>;
        }
        const isSelected = activeIdx === idx;
        return (
          <span key={idx} className="relative inline-block">
            <button
              type="button"
              data-no-flip="true"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => handleWordClick(idx, tok, e)}
              className={`rounded-md px-0.5 transition cursor-pointer underline decoration-dotted underline-offset-4 ${
                isSelected
                  ? 'bg-emerald-100 text-emerald-800 decoration-emerald-500'
                  : 'decoration-slate-300 hover:bg-emerald-50 hover:text-emerald-700 hover:decoration-emerald-400'
              }`}
            >
              {tok}
            </button>

            {/* Floating Translation Bubble directly above the tapped word */}
            {isSelected && (
              <div
                data-no-flip="true"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                dir="rtl"
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 min-w-[140px] max-w-[230px] rounded-2xl bg-slate-900 text-white px-3 py-2 shadow-xl text-center pointer-events-auto"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-1.5 py-0.5 text-xs font-bold text-slate-300">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    <span>در حال ترجمه...</span>
                  </div>
                ) : result ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-black text-white leading-snug">
                        {result.persianMeaning}
                      </span>
                      <button
                        type="button"
                        data-no-flip="true"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          speakGerman(result.baseForm || activeWord);
                        }}
                        className="shrink-0 w-6 h-6 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center text-sky-300"
                        aria-label="تلفظ کلمه"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {result.baseForm && (
                      <div
                        dir="ltr"
                        className="font-de text-[11px] font-bold text-slate-300 flex items-center justify-center gap-1"
                      >
                        {artStyle && (
                          <span className={`px-1.5 py-0.2 rounded text-[10px] ${artStyle.badgeBg}`}>
                            {result.article}
                          </span>
                        )}
                        <span>
                          {result.article
                            ? result.baseForm.replace(/^(der|die|das)\s+/i, '')
                            : result.baseForm}
                        </span>
                      </div>
                    )}
                  </div>
                ) : null}
                {/* Little downward arrow */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-slate-900" />
              </div>
            )}
          </span>
        );
      })}
    </div>
  );
}
