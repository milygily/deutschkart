'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import {
  ArrowRight,
  Headphones,
  BookOpen,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Sparkles,
  Loader2,
  Volume2,
  Languages,
  CheckCircle2,
  XCircle,
  Download,
} from 'lucide-react';
import { InteractiveSentence } from './InteractiveSentence';
import { speakGerman } from '@/lib/speech';

export interface StoryLine {
  speaker: 'Anna' | 'Lukas';
  de: string;
  fa: string;
}

export interface StoryQuestion {
  questionDe: string;
  questionFa: string;
  options: string[];
  correctIndex: number;
}

export interface SavedStory {
  id: number;
  deckId: number;
  titleDe: string;
  titleFa: string;
  level: string;
  lines: StoryLine[];
  questions: StoryQuestion[];
  usedWords: string[];
  createdAt: string;
}

interface StoryPodcastPlayerProps {
  deckId: number;
  deckTitle: string;
  initialStories: SavedStory[];
}

const SPEED_OPTIONS = [0.75, 0.9, 1, 1.25, 1.5] as const;
const PODCAST_CACHE_NAME = 'deutschkart-podcasts-v2';
const SAMPLE_RATE = 16000;
const CHUNK_LINES = 5; // ~45-70s per chunk -> stays well under Vercel 4.5MB response cap!
const CHUNK_PAUSE_SEC = 0.65; // natural breathing pause between chunks

interface LineTiming {
  start: number;
  end: number;
}

function buildWavFromPcmChunks(
  pcmChunks: Uint8Array[],
  sampleRate = SAMPLE_RATE,
  pauseSec = CHUNK_PAUSE_SEC
): { blob: Blob; chunkRanges: { startSec: number; endSec: number }[] } {
  const bytesPerSec = sampleRate * 2; // 16-bit mono
  const pauseBytes = Math.floor(pauseSec * sampleRate) * 2;
  const pauseBuf = new Uint8Array(pauseBytes); // zeros = clean silence

  let totalPcmBytes = 0;
  for (let i = 0; i < pcmChunks.length; i++) {
    totalPcmBytes += pcmChunks[i].byteLength;
    if (i < pcmChunks.length - 1) totalPcmBytes += pauseBytes;
  }

  const wavBytes = new Uint8Array(44 + totalPcmBytes);
  const view = new DataView(wavBytes.buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + totalPcmBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, bytesPerSec, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, totalPcmBytes, true);

  const chunkRanges: { startSec: number; endSec: number }[] = [];
  let offset = 44;
  let cursorSec = 0;

  for (let i = 0; i < pcmChunks.length; i++) {
    const chunk = pcmChunks[i];
    wavBytes.set(chunk, offset);
    offset += chunk.byteLength;
    const durSec = chunk.byteLength / bytesPerSec;
    chunkRanges.push({ startSec: cursorSec, endSec: cursorSec + durSec });
    cursorSec += durSec;

    if (i < pcmChunks.length - 1) {
      wavBytes.set(pauseBuf, offset);
      offset += pauseBytes;
      cursorSec += pauseBytes / bytesPerSec;
    }
  }

  return { blob: new Blob([wavBytes], { type: 'audio/wav' }), chunkRanges };
}

function computeChunkCalibratedTimings(
  lines: StoryLine[],
  chunkRanges: { startSec: number; endSec: number }[] | null,
  totalDuration: number
): LineTiming[] {
  if (!lines.length) return [];

  if (chunkRanges && chunkRanges.length > 0) {
    const timings: LineTiming[] = [];
    for (let c = 0; c < chunkRanges.length; c++) {
      const slice = lines.slice(c * CHUNK_LINES, (c + 1) * CHUNK_LINES);
      const range = chunkRanges[c];
      const segDur = Math.max(0.1, range.endSec - range.startSec);
      const weights = slice.map((l) => {
        const chars = l.de.replace(/\s+/g, ' ').trim().length;
        const punct = (l.de.match(/[.!?،,;]/g) || []).length * 7;
        return Math.max(14, chars + punct + 12);
      });
      const sumW = weights.reduce((a, b) => a + b, 0);
      let cur = range.startSec;
      for (const w of weights) {
        const d = (w / sumW) * segDur;
        timings.push({ start: cur, end: cur + d });
        cur += d;
      }
    }
    return timings;
  }

  if (!totalDuration || !Number.isFinite(totalDuration)) {
    return lines.map(() => ({ start: 0, end: 0 }));
  }
  const weights = lines.map((l) => {
    const chars = l.de.replace(/\s+/g, ' ').trim().length;
    const punct = (l.de.match(/[.!?،,;]/g) || []).length * 7;
    return Math.max(14, chars + punct + 12);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return weights.map((w) => {
    const seg = (w / totalWeight) * totalDuration;
    const item = { start: cursor, end: cursor + seg };
    cursor += seg;
    return item;
  });
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function StoryPodcastPlayer({
  deckId,
  deckTitle,
  initialStories,
}: StoryPodcastPlayerProps) {
  const [stories, setStories] = useState<SavedStory[]>(initialStories);
  const [activeStoryId, setActiveStoryId] = useState<number | null>(
    initialStories[0]?.id ?? null
  );
  const [tab, setTab] = useState<'podcast' | 'story'>('podcast');

  const [generatingStory, setGeneratingStory] = useState(false);
  const [storyError, setStoryError] = useState('');

  // Podcast Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [chunkRanges, setChunkRanges] = useState<{ startSec: number; endSec: number }[] | null>(
    null
  );
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [audioProgressText, setAudioProgressText] = useState('');
  const [audioError, setAudioError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [showFaInPodcast, setShowFaInPodcast] = useState(true);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

  // Duolingo Story interactive state
  const [revealedFaLines, setRevealedFaLines] = useState<Set<number>>(new Set());
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const activeStory = useMemo(
    () => stories.find((s) => s.id === activeStoryId) ?? stories[0] ?? null,
    [stories, activeStoryId]
  );

  const lineTimings = useMemo(
    () =>
      activeStory
        ? computeChunkCalibratedTimings(activeStory.lines, chunkRanges, duration)
        : [],
    [activeStory, chunkRanges, duration]
  );

  const activeLineIndex = useMemo(() => {
    if (!lineTimings.length || duration <= 0) return 0;
    const idx = lineTimings.findIndex(
      (t, i) =>
        currentTime >= t.start &&
        (currentTime < t.end || i === lineTimings.length - 1)
    );
    return idx >= 0 ? idx : 0;
  }, [currentTime, duration, lineTimings]);

  // Auto-scroll active lyric smoothly to center of viewport (Apple Music style!)
  useEffect(() => {
    if (tab !== 'podcast' || !isPlaying || !autoScrollEnabled) return;
    const el = lineRefs.current[activeLineIndex];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeLineIndex, isPlaying, tab, autoScrollEnabled]);

  // Reset audio when switching between stories
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioError('');
    setRevealedFaLines(new Set());
    setAnswers({});

    let revokedUrl: string | null = null;
    let cancelled = false;

    async function checkCachedAudio() {
      if (!activeStory) {
        setAudioUrl(null);
        setChunkRanges(null);
        return;
      }
      setAudioUrl(null);
      setChunkRanges(null);
      try {
        const savedRanges = localStorage.getItem(`dk_podcast_ranges_${activeStory.id}`);
        if (savedRanges && !cancelled) {
          setChunkRanges(JSON.parse(savedRanges));
        }
        if ('caches' in window) {
          const cache = await caches.open(PODCAST_CACHE_NAME);
          const cached = await cache.match(`/podcast-audio/story-${activeStory.id}.wav`);
          if (cached && !cancelled) {
            const blob = await cached.blob();
            revokedUrl = URL.createObjectURL(blob);
            setAudioUrl(revokedUrl);
          }
        }
      } catch {
        // ignore cache read errors
      }
    }

    checkCachedAudio();
    return () => {
      cancelled = true;
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [activeStory?.id]);

  // Keep playback speed synced to <audio> element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed, audioUrl]);

  const seekBy = useCallback((deltaSec: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    const next = Math.max(0, Math.min(audio.duration, audio.currentTime + deltaSec));
    audio.currentTime = next;
    setCurrentTime(next);
  }, []);

  const seekTo = useCallback((targetSec: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    const clamped = Math.max(0, Math.min(audio.duration, targetSec));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  }, []);

  // MediaSession API: enables native iPhone / Android Lock Screen controls & pocket background playback!
  useEffect(() => {
    if (!activeStory || !audioUrl || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: activeStory.titleDe,
        artist: `DeutschKart · Anna & Lukas (${activeStory.level})`,
        album: deckTitle,
        artwork: [{ src: '/icon.svg', sizes: '128x128', type: 'image/svg+xml' }],
      });

      navigator.mediaSession.setActionHandler('play', () => {
        audioRef.current?.play().catch(() => {});
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audioRef.current?.pause();
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        seekBy(-(details.seekOffset || 10));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        seekBy(details.seekOffset || 10);
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number') {
          seekTo(details.seekTime);
        }
      });
    } catch {
      // ignore unsupported mediaSession actions on older browsers
    }
  }, [activeStory, audioUrl, deckTitle, seekBy, seekTo]);

  async function handleGenerateStory() {
    setStoryError('');
    setGeneratingStory(true);
    try {
      const res = await fetch(`/api/decks/${deckId}/story`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partIndex: stories.length }),
      });
      const data = await res.json();
      if (!res.ok || !data.story) {
        setStoryError(data.error || 'خطا در ساخت داستان');
      } else {
        setStories((prev) => [data.story, ...prev]);
        setActiveStoryId(data.story.id);
      }
    } catch {
      setStoryError('ارتباط با سرور برقرار نشد.');
    } finally {
      setGeneratingStory(false);
    }
  }

  async function handleGenerateOrPlayAudio() {
    if (!activeStory) return;

    if (audioUrl && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.playbackRate = speed;
        audioRef.current.play().catch(() => {});
      }
      return;
    }

    setAudioError('');
    setLoadingAudio(true);
    setAudioProgressText('');
    try {
      // Split dialogue into chunks of CHUNK_LINES so multi-minute podcasts stay under Vercel's 4.5MB response cap
      const lineChunks: StoryLine[][] = [];
      for (let i = 0; i < activeStory.lines.length; i += CHUNK_LINES) {
        lineChunks.push(activeStory.lines.slice(i, i + CHUNK_LINES));
      }

      const pcmResults: Uint8Array[] = new Array(lineChunks.length);
      let completed = 0;
      setAudioProgressText(`در حال ضبط بخش ۱ از ${lineChunks.length}...`);

      const fetchChunk = async (idx: number) => {
        const res = await fetch(`/api/decks/${deckId}/story/audio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines: lineChunks[idx], format: 'pcm' }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'خطا در تولید بخش صوتی پادکست');
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        pcmResults[idx] = buf;
        completed++;
        setAudioProgressText(
          completed < lineChunks.length
            ? `در حال ضبط بخش ${completed + 1} از ${lineChunks.length}...`
            : 'در حال آماده‌سازی فایل نهایی پادکست...'
        );
      };

      // Run 2 chunks at a time in parallel (fast ~12-16s for a full 4-min episode, gentle on rate limits)
      for (let i = 0; i < lineChunks.length; i += 2) {
        const batch = [fetchChunk(i)];
        if (i + 1 < lineChunks.length) batch.push(fetchChunk(i + 1));
        await Promise.all(batch);
      }

      // Assemble ONE seamless WAV Blob with natural 650ms breathing pauses between chunks!
      const { blob, chunkRanges: measuredRanges } = buildWavFromPcmChunks(
        pcmResults,
        SAMPLE_RATE,
        CHUNK_PAUSE_SEC
      );
      setChunkRanges(measuredRanges);

      try {
        localStorage.setItem(
          `dk_podcast_ranges_${activeStory.id}`,
          JSON.stringify(measuredRanges)
        );
        if ('caches' in window) {
          const cache = await caches.open(PODCAST_CACHE_NAME);
          await cache.put(
            `/podcast-audio/story-${activeStory.id}.wav`,
            new Response(blob, { headers: { 'Content-Type': 'audio/wav' } })
          );
        }
      } catch {
        // ignore quota errors
      }

      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.playbackRate = speed;
          audioRef.current.play().catch(() => {});
        }
      }, 140);
    } catch (err) {
      setAudioError(
        err instanceof Error ? err.message : 'ارتباط با سرور صوتی برقرار نشد.'
      );
    } finally {
      setLoadingAudio(false);
      setAudioProgressText('');
    }
  }

  function handleSelectAnswer(qIdx: number, optIdx: number) {
    if (answers[qIdx] !== undefined) return;
    const next = { ...answers, [qIdx]: optIdx };
    setAnswers(next);

    if (
      activeStory &&
      Object.keys(next).length === activeStory.questions.length &&
      activeStory.questions.every((q, i) => next[i] === q.correctIndex)
    ) {
      confetti({ particleCount: 70, spread: 65, origin: { y: 0.7 } });
    }
  }

  // Empty state: No story generated for this deck yet
  if (!activeStory) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-8 pb-24 space-y-6">
        <Link
          href={`/deck/${deckId}`}
          className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-500 hover:text-slate-800"
        >
          <ArrowRight className="w-4 h-4" />
          بازگشت به دسته «{deckTitle}»
        </Link>

        <div className="rounded-[2rem] bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950 p-8 text-center text-white shadow-2xl space-y-5 border border-white/10">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-rose-500 to-violet-600 flex items-center justify-center shadow-lg shadow-rose-500/30">
            <Headphones className="w-10 h-10 text-white" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black">داستان و پادکست اختصاصی 🎧</h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              هوش مصنوعی با استفاده از کلمات دسته <strong>«{deckTitle}»</strong> یک مکالمه طبیعی
              آلمانی بین <strong>Anna</strong> و <strong>Lukas</strong> می‌سازه تا هم مثل{' '}
              <strong>Duolingo Story</strong> بخونی و هم مثل <strong>پلیر اپل موزیک</strong> با متن
              درشت و پخش در جیب گوش بدی!
            </p>
          </div>

          {storyError && (
            <div className="rounded-2xl bg-rose-500/20 border border-rose-400/40 px-4 py-3 text-xs font-bold text-rose-200">
              {storyError}
            </div>
          )}

          <button
            onClick={handleGenerateStory}
            disabled={generatingStory}
            className="btn-3d w-full rounded-2xl bg-gradient-to-l from-rose-500 to-pink-500 border-b-4 border-rose-700 text-white py-4 font-black text-base flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-60"
          >
            {generatingStory ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                در حال نوشتن داستان با کلمات این دسته...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                ساخت اولین داستان و پادکست ✨
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-[calc(100vh-4rem)] transition-colors ${
        tab === 'podcast'
          ? 'bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-950 text-white pb-64'
          : 'bg-[#f6f8fb] text-slate-800 pb-28'
      }`}
    >
      {/* Hidden Real HTML5 Audio Element (powers native iPhone/Android Lock Screen background playback!) */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          playsInline
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            setDuration(el.duration || 0);
            el.playbackRate = speed;
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-5">
        {/* Top Bar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Link
            href={`/deck/${deckId}`}
            className={`inline-flex items-center gap-1.5 text-sm font-extrabold transition ${
              tab === 'podcast'
                ? 'text-slate-300 hover:text-white'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ArrowRight className="w-4 h-4" />
            بازگشت به «{deckTitle}»
          </Link>

          <button
            onClick={handleGenerateStory}
            disabled={generatingStory}
            className={`btn-3d inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition disabled:opacity-50 ${
              tab === 'podcast'
                ? 'bg-white/10 hover:bg-white/20 text-white border border-white/15'
                : 'bg-violet-100 hover:bg-violet-200 text-violet-700'
            }`}
          >
            {generatingStory ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            ساخت اپیزود جدید
          </button>
        </div>

        {/* Episode Switcher if multiple stories exist */}
        {stories.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {stories.map((st, idx) => (
              <button
                key={st.id}
                onClick={() => setActiveStoryId(st.id)}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-extrabold transition ${
                  st.id === activeStory.id
                    ? 'bg-rose-500 text-white'
                    : tab === 'podcast'
                      ? 'bg-white/10 text-slate-300 hover:bg-white/20'
                      : 'bg-white border border-slate-200 text-slate-600'
                }`}
              >
                اپیزود {stories.length - idx}: {st.titleFa}
              </button>
            ))}
          </div>
        )}

        {/* Episode Title Header */}
        <div className="space-y-1.5 text-center">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-extrabold bg-rose-500/15 text-rose-400 border border-rose-500/25">
            <span>🎙️ Anna & Lukas</span>
            <span>·</span>
            <span className="font-de">{activeStory.level}</span>
          </div>
          <h1
            dir="ltr"
            className={`font-de text-2xl sm:text-3xl font-black tracking-tight ${
              tab === 'podcast' ? 'text-white' : 'text-slate-800'
            }`}
          >
            {activeStory.titleDe}
          </h1>
          <p className={`text-sm font-bold ${tab === 'podcast' ? 'text-slate-300' : 'text-slate-500'}`}>
            {activeStory.titleFa}
          </p>
        </div>

        {/* Mode Switch Tabs: Podcast (Apple Music Lyrics) vs Duolingo Story */}
        <div
          className={`grid grid-cols-2 gap-2 rounded-2xl p-1.5 ${
            tab === 'podcast' ? 'bg-white/10' : 'bg-slate-200/70'
          }`}
        >
          <button
            onClick={() => setTab('podcast')}
            className={`rounded-xl py-3 text-sm font-black flex items-center justify-center gap-2 transition ${
              tab === 'podcast'
                ? 'bg-rose-500 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Headphones className="w-4 h-4" />
            پادکست (متن درشت اپل)
          </button>
          <button
            onClick={() => setTab('story')}
            className={`rounded-xl py-3 text-sm font-black flex items-center justify-center gap-2 transition ${
              tab === 'story'
                ? 'bg-white text-emerald-700 shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            داستان تعاملی + سوال
          </button>
        </div>

        {storyError && (
          <div className="rounded-2xl bg-rose-500/20 border border-rose-400/40 px-4 py-3 text-xs font-bold text-rose-200">
            {storyError}
          </div>
        )}

        {/* ================= TAB 1: APPLE MUSIC–STYLE PODCAST LYRICS ================= */}
        {tab === 'podcast' && (
          <div className="space-y-5">
            {/* Utility Bar */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs font-bold text-slate-300">
                💡 روی هر کلمه آلمانی بزنی معنیش میاد (حتی وسط پخش!)
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFaInPodcast((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold border transition ${
                    showFaInPodcast
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                      : 'bg-white/10 border-white/15 text-slate-300'
                  }`}
                >
                  <Languages className="w-3.5 h-3.5" />
                  {showFaInPodcast ? 'ترجمه فارسی روشن' : 'ترجمه فارسی خاموش'}
                </button>
                <button
                  onClick={() => setAutoScrollEnabled((v) => !v)}
                  className={`rounded-xl px-2.5 py-1.5 text-xs font-extrabold border transition ${
                    autoScrollEnabled
                      ? 'bg-sky-500/20 border-sky-400/50 text-sky-300'
                      : 'bg-white/10 border-white/15 text-slate-400'
                  }`}
                >
                  اسکرول خودکار {autoScrollEnabled ? '✓' : '✕'}
                </button>
              </div>
            </div>

            {/* Generate Audio CTA Banner (only if audio isn't loaded yet) */}
            {!audioUrl && (
              <div className="rounded-3xl bg-white/10 border border-white/15 p-5 text-center space-y-3">
                <p className="text-sm font-bold text-slate-200">
                  صدای استودیویی آرام و روان دونفره <strong>Anna & Lukas</strong> (با مکث‌های طبیعی بین جملات) آماده ضبطه و بعد روی گوشیت ذخیره میشه!
                </p>
                {audioError && (
                  <div className="rounded-xl bg-rose-500/25 border border-rose-400/40 px-3 py-2 text-xs font-bold text-rose-200">
                    {audioError}
                  </div>
                )}
                <button
                  onClick={handleGenerateOrPlayAudio}
                  disabled={loadingAudio}
                  className="btn-3d inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-500 border-b-4 border-emerald-700 text-white px-7 py-3.5 font-black text-sm hover:brightness-110 disabled:opacity-60"
                >
                  {loadingAudio ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {audioProgressText || 'در حال ضبط صدای Anna و Lukas...'}
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-white" />
                      ساخت و پخش پادکست صوتی 🎙️
                    </>
                  )}
                </button>
              </div>
            )}

            {/* BIG APPLE MUSIC–STYLE SYNCED LYRICS LIST */}
            <div className="space-y-6 pt-2 pb-10">
              {activeStory.lines.map((line, idx) => {
                const isActive = audioUrl ? idx === activeLineIndex : true;
                const isPast = audioUrl ? idx < activeLineIndex : false;
                const timing = lineTimings[idx];

                return (
                  <div
                    key={idx}
                    ref={(el) => {
                      lineRefs.current[idx] = el;
                    }}
                    onClick={(e) => {
                      const target = e.target as HTMLElement | null;
                      if (target?.closest('button, [data-no-flip="true"]')) return;
                      if (audioUrl && timing) {
                        seekTo(timing.start);
                        if (!isPlaying) {
                          audioRef.current?.play().catch(() => {});
                        }
                      }
                    }}
                    className={`rounded-3xl p-5 sm:p-6 transition-all duration-300 cursor-pointer ${
                      isActive
                        ? 'bg-white/12 border-2 border-white/25 shadow-2xl scale-[1.01] opacity-100'
                        : isPast
                          ? 'bg-white/[0.03] border border-transparent opacity-45 hover:opacity-80'
                          : 'bg-white/[0.04] border border-transparent opacity-60 hover:opacity-90'
                    }`}
                  >
                    {/* Speaker Pill */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-black ${
                          line.speaker === 'Anna'
                            ? 'bg-rose-500/25 text-rose-200'
                            : 'bg-sky-500/25 text-sky-200'
                        }`}
                      >
                        <span>{line.speaker === 'Anna' ? '👩🏼' : '👨🏻'}</span>
                        <span className="font-de">{line.speaker}</span>
                      </span>

                      <button
                        type="button"
                        data-no-flip="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          speakGerman(line.de, Math.min(1.2, speed));
                        }}
                        title="خواندن فقط همین خط"
                        className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 flex items-center justify-center"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* HUGE Apple-Music-Style German Lyrics (Tap any word to translate!) */}
                    <InteractiveSentence
                      sentence={line.de}
                      highlightWords={activeStory.usedWords}
                      theme="dark"
                      className={`font-de text-left leading-snug tracking-tight transition-all ${
                        isActive
                          ? 'text-2xl sm:text-3xl font-black text-white'
                          : 'text-xl sm:text-2xl font-extrabold text-slate-200'
                      }`}
                    />

                    {/* Optional Persian Translation */}
                    {showFaInPodcast && (
                      <p
                        className={`mt-3 text-right leading-relaxed font-bold transition-all ${
                          isActive
                            ? 'text-base sm:text-lg text-slate-200'
                            : 'text-sm sm:text-base text-slate-400'
                        }`}
                      >
                        {line.fa}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 2: DUOLINGO INTERACTIVE STORY + QUIZ ================= */}
        {tab === 'story' && (
          <div className="space-y-6">
            {/* Target Words Used Pill Cloud */}
            {activeStory.usedWords?.length > 0 && (
              <div className="rounded-2xl bg-white border-2 border-emerald-100 p-4 space-y-2">
                <div className="text-xs font-black text-emerald-700">
                  🎯 کلمات این دسته که توی داستان استفاده شدن (با رنگ سبز هایلایت شدن):
                </div>
                <div className="flex flex-wrap gap-1.5" dir="ltr">
                  {activeStory.usedWords.map((w, i) => (
                    <span
                      key={i}
                      className="font-de text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-xl"
                    >
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Chat Bubbles */}
            <div className="space-y-3.5">
              {activeStory.lines.map((line, idx) => {
                const isAnna = line.speaker === 'Anna';
                const faVisible = revealedFaLines.has(idx);
                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 ${isAnna ? 'flex-row' : 'flex-row-reverse'}`}
                  >
                    <div
                      className={`w-11 h-11 rounded-2xl shrink-0 flex items-center justify-center text-2xl shadow-xs ${
                        isAnna ? 'bg-rose-100' : 'bg-sky-100'
                      }`}
                    >
                      {isAnna ? '👩🏼' : '👨🏻'}
                    </div>
                    <div
                      className={`flex-1 rounded-3xl bg-white border-2 p-4 space-y-2 shadow-xs ${
                        isAnna ? 'border-rose-100' : 'border-sky-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`font-de text-xs font-black ${
                            isAnna ? 'text-rose-600' : 'text-sky-600'
                          }`}
                        >
                          {line.speaker}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => speakGerman(line.de)}
                            className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 hover:bg-sky-100 flex items-center justify-center"
                            title="شنیدن جمله"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() =>
                              setRevealedFaLines((prev) => {
                                const next = new Set(prev);
                                if (next.has(idx)) next.delete(idx);
                                else next.add(idx);
                                return next;
                              })
                            }
                            className="rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1 text-[11px] font-extrabold"
                          >
                            {faVisible ? 'مخفی کردن ترجمه' : 'دیدن ترجمه'}
                          </button>
                        </div>
                      </div>

                      <InteractiveSentence
                        sentence={line.de}
                        highlightWords={activeStory.usedWords}
                        className="font-de text-base sm:text-lg font-extrabold text-slate-800 leading-relaxed text-left"
                      />

                      {faVisible && (
                        <p className="text-sm sm:text-base font-bold text-slate-600 pt-2 border-t border-slate-100 leading-relaxed">
                          {line.fa}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Comprehension Questions (Duolingo Story Check!) */}
            {activeStory.questions?.length > 0 && (
              <section className="rounded-3xl bg-white border-2 border-violet-200 p-5 space-y-4 shadow-sm">
                <h2 className="text-lg font-black text-violet-800 flex items-center gap-2">
                  <span>🧩</span>
                  <span>سوال‌های درک مطلب داستان</span>
                </h2>

                <div className="space-y-4">
                  {activeStory.questions.map((q, qIdx) => {
                    const chosen = answers[qIdx];
                    return (
                      <div
                        key={qIdx}
                        className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3"
                      >
                        <div className="space-y-1">
                          <div dir="ltr" className="font-de text-base font-extrabold text-slate-800 text-left">
                            {qIdx + 1}. {q.questionDe}
                          </div>
                          <div className="text-xs font-bold text-slate-500">{q.questionFa}</div>
                        </div>

                        <div className="space-y-2">
                          {q.options.map((opt, optIdx) => {
                            const isSelected = chosen === optIdx;
                            const isRight = optIdx === q.correctIndex;
                            let cls =
                              'bg-white border-2 border-slate-200 text-slate-700 hover:border-violet-300';
                            if (chosen !== undefined) {
                              if (isRight) {
                                cls = 'bg-emerald-50 border-2 border-emerald-500 text-emerald-800';
                              } else if (isSelected && !isRight) {
                                cls = 'bg-rose-50 border-2 border-rose-500 text-rose-800';
                              } else {
                                cls = 'bg-slate-100 border-2 border-slate-200 text-slate-400';
                              }
                            }
                            return (
                              <button
                                key={optIdx}
                                onClick={() => handleSelectAnswer(qIdx, optIdx)}
                                disabled={chosen !== undefined}
                                className={`w-full rounded-xl px-4 py-2.5 text-sm font-extrabold text-right flex items-center justify-between transition ${cls}`}
                              >
                                <span>{opt}</span>
                                {chosen !== undefined && isRight && (
                                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                                )}
                                {chosen !== undefined && isSelected && !isRight && (
                                  <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* ================= STICKY APPLE-STYLE PODCAST PLAYER BAR ================= */}
      {tab === 'podcast' && (
        <div className="fixed bottom-0 inset-x-0 z-50 bg-slate-900/95 backdrop-blur-xl border-t border-white/15 px-4 pt-3 pb-5 shadow-2xl">
          <div className="max-w-2xl mx-auto space-y-3">
            {/* Scrubber Timeline Slider */}
            <div className="space-y-1" dir="ltr">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                disabled={!audioUrl || duration <= 0}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="w-full h-2 rounded-full accent-rose-500 bg-white/20 cursor-pointer disabled:opacity-40"
              />
              <div className="flex items-center justify-between text-[11px] font-de font-bold text-slate-400">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Playback Controls: -10s | Play/Pause | +10s + Download */}
            <div className="flex items-center justify-between gap-3">
              {/* Speed Selector */}
              <div className="flex items-center gap-1 flex-wrap" dir="ltr">
                {SPEED_OPTIONS.map((sp) => (
                  <button
                    key={sp}
                    onClick={() => setSpeed(sp)}
                    className={`rounded-lg px-2 py-1 font-de text-[11px] font-black transition ${
                      speed === sp
                        ? 'bg-rose-500 text-white'
                        : 'bg-white/10 text-slate-300 hover:bg-white/20'
                    }`}
                  >
                    {sp}x
                  </button>
                ))}
              </div>

              {/* Center Ergonomic Transport Controls */}
              <div className="flex items-center gap-2 sm:gap-3" dir="ltr">
                <button
                  onClick={() => seekBy(-10)}
                  disabled={!audioUrl}
                  title="۱۰ ثانیه به عقب"
                  className="btn-3d w-11 h-11 rounded-2xl bg-white/10 hover:bg-white/20 text-white flex flex-col items-center justify-center disabled:opacity-35"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="font-de text-[9px] font-black -mt-0.5">10s</span>
                </button>

                <button
                  onClick={handleGenerateOrPlayAudio}
                  disabled={loadingAudio}
                  aria-label={isPlaying ? 'توقف' : 'پخش'}
                  className="btn-3d w-14 h-14 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 border-b-4 border-rose-700 text-white flex items-center justify-center shadow-lg shadow-rose-500/40 hover:brightness-110 disabled:opacity-60"
                >
                  {loadingAudio ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="w-7 h-7 fill-white" />
                  ) : (
                    <Play className="w-7 h-7 fill-white ml-0.5" />
                  )}
                </button>

                <button
                  onClick={() => seekBy(10)}
                  disabled={!audioUrl}
                  title="۱۰ ثانیه به جلو"
                  className="btn-3d w-11 h-11 rounded-2xl bg-white/10 hover:bg-white/20 text-white flex flex-col items-center justify-center disabled:opacity-35"
                >
                  <RotateCw className="w-4 h-4" />
                  <span className="font-de text-[9px] font-black -mt-0.5">10s</span>
                </button>
              </div>

              {/* Download Audio Button (optional offline save) */}
              {audioUrl ? (
                <a
                  href={audioUrl}
                  download={`DeutschKart-${activeStory.titleDe.replace(/\s+/g, '-')}.wav`}
                  title="دانلود فایل صوتی پادکست"
                  className="hidden sm:flex w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 items-center justify-center"
                >
                  <Download className="w-4 h-4" />
                </a>
              ) : (
                <div className="hidden sm:block w-10" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
