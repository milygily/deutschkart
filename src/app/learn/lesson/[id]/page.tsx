'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LessonPlayer, type LessonCompletionPayload } from '@/components/LessonPlayer';
import type { Exercise } from '@/lib/exercises';

interface LessonData {
  id: number;
  titleFa: string;
  titleDe: string;
  lessonType: string;
  xpReward: number;
  grammarSlug: string | null;
  exercises: Exercise[];
  grammarPool?: Exercise[];
}

interface UnitMeta {
  id: number;
  titleFa: string;
  titleDe: string;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickFreshBatch(pool: Exercise[], storageKey: string, batchSize = 10): Exercise[] {
  if (pool.length <= batchSize) return shuffle(pool);
  let seen = new Set<string>();
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) seen = new Set(arr.map(String));
    }
  } catch {
    // ignore
  }

  const unseen = shuffle(pool.filter((ex) => !seen.has(ex.id)));
  const alreadySeen = shuffle(pool.filter((ex) => seen.has(ex.id)));

  if (unseen.length >= batchSize) {
    return unseen.slice(0, batchSize);
  }
  if (unseen.length === 0) {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    return alreadySeen.slice(0, batchSize);
  }
  return [...unseen, ...alreadySeen].slice(0, batchSize);
}

export default function LearnLessonPlayerPage() {
  const params = useParams();
  const router = useRouter();
  const lessonId = Number(params.id);

  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [unit, setUnit] = useState<UnitMeta | null>(null);
  const [sessionExercises, setSessionExercises] = useState<Exercise[]>([]);
  const [roundSeed, setRoundSeed] = useState(1);
  const [loading, setLoading] = useState(true);

  const selectExercisesForLesson = useCallback((les: LessonData) => {
    const pool =
      Array.isArray(les.grammarPool) && les.grammarPool.length >= 10
        ? les.grammarPool
        : les.exercises;
    const key = les.grammarSlug ? `dk_seen_grammar_${les.grammarSlug}` : `dk_seen_lesson_${les.id}`;
    const size = Math.min(10, pool.length);
    setSessionExercises(pickFreshBatch(pool, key, size));
  }, []);

  useEffect(() => {
    if (!lessonId) return;
    fetch(`/api/learn/lesson/${lessonId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.lesson) {
          setLesson(data.lesson);
          selectExercisesForLesson(data.lesson);
        }
        if (data.unit) setUnit(data.unit);
      })
      .finally(() => setLoading(false));
  }, [lessonId, selectExercisesForLesson]);

  const handleComplete = async (payload: LessonCompletionPayload) => {
    if (!lesson) return;
    // Mark solved exercises as seen so the next round serves brand-new ones
    const key = lesson.grammarSlug
      ? `dk_seen_grammar_${lesson.grammarSlug}`
      : `dk_seen_lesson_${lesson.id}`;
    try {
      const raw = localStorage.getItem(key);
      const prev = raw ? JSON.parse(raw) : [];
      const set = new Set<string>(Array.isArray(prev) ? prev.map(String) : []);
      for (const ex of sessionExercises) set.add(ex.id);
      localStorage.setItem(key, JSON.stringify(Array.from(set)));
    } catch {
      // ignore
    }

    try {
      const res = await fetch('/api/learn/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId: lesson.id,
          accuracy: payload.accuracy,
        }),
      });
      if (res.ok) return await res.json();
    } catch {
      // ignore
    }
  };

  const handleFreshRound = () => {
    if (!lesson) return;
    selectExercisesForLesson(lesson);
    setRoundSeed((s) => s + 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f8fb]">
        <div className="text-center space-y-3">
          <div className="text-4xl animate-bounce">🗺️</div>
          <p className="text-sm font-black text-slate-500">در حال آماده‌سازی درس...</p>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#f6f8fb]">
        <div className="text-center space-y-4">
          <div className="text-5xl">😕</div>
          <h2 className="text-xl font-black text-slate-800">این درس پیدا نشد</h2>
          <button
            onClick={() => router.push('/learn')}
            className="btn-3d rounded-2xl bg-emerald-500 border-b-4 border-emerald-700 text-white px-6 py-3 font-black"
          >
            بازگشت به مسیر B1
          </button>
        </div>
      </div>
    );
  }

  const hasBigPool = Boolean(lesson.grammarPool && lesson.grammarPool.length > 10);

  return (
    <LessonPlayer
      key={`lesson-${lesson.id}-r${roundSeed}`}
      title={lesson.titleFa}
      subtitle={unit ? `${unit.titleFa} · ${lesson.titleDe}` : lesson.titleDe}
      exercises={sessionExercises.length > 0 ? sessionExercises : lesson.exercises}
      xpReward={lesson.xpReward}
      onExit={() => router.push('/learn')}
      onComplete={handleComplete}
      secondaryActionLabel={
        hasBigPool
          ? 'شروع ۱۰ تمرین جدید و غیرتکراری دیگر از همین درس 🎲'
          : lesson.grammarSlug
            ? 'تمرین بیشتر روی همین گرامر در باشگاه گرامر 📐'
            : undefined
      }
      onSecondaryAction={
        hasBigPool
          ? handleFreshRound
          : lesson.grammarSlug
            ? () => router.push(`/grammar/${lesson.grammarSlug}`)
            : undefined
      }
    />
  );
}
