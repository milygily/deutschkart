'use client';

import React, { useEffect, useState } from 'react';
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
}

interface UnitMeta {
  id: number;
  titleFa: string;
  titleDe: string;
}

export default function LearnLessonPlayerPage() {
  const params = useParams();
  const router = useRouter();
  const lessonId = Number(params.id);

  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [unit, setUnit] = useState<UnitMeta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!lessonId) return;
    fetch(`/api/learn/lesson/${lessonId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.lesson) setLesson(data.lesson);
        if (data.unit) setUnit(data.unit);
      })
      .finally(() => setLoading(false));
  }, [lessonId]);

  const handleComplete = async (payload: LessonCompletionPayload) => {
    if (!lesson) return;
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

  return (
    <LessonPlayer
      title={lesson.titleFa}
      subtitle={unit ? `${unit.titleFa} · ${lesson.titleDe}` : lesson.titleDe}
      exercises={lesson.exercises}
      xpReward={lesson.xpReward}
      onExit={() => router.push('/learn')}
      onComplete={handleComplete}
      secondaryActionLabel={
        lesson.grammarSlug ? 'تمرین بیشتر روی همین گرامر در باشگاه گرامر 📐' : undefined
      }
      onSecondaryAction={
        lesson.grammarSlug ? () => router.push(`/grammar/${lesson.grammarSlug}`) : undefined
      }
    />
  );
}
