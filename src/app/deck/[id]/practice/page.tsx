'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LessonPlayer, type LessonCompletionPayload } from '@/components/LessonPlayer';
import { buildExercisesFromCards, type Exercise } from '@/lib/exercises';
import type { WordCard } from '@/lib/types';

export default function DeckDuolingoPracticePage() {
  const params = useParams();
  const router = useRouter();
  const deckId = Number(params.id);

  const [deckTitle, setDeckTitle] = useState('تمرین دولینگویی');
  const [cards, setCards] = useState<WordCard[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState(1);

  const loadDeck = useCallback(async () => {
    if (!deckId) return;
    try {
      const res = await fetch(`/api/decks/${deckId}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.deck?.title) setDeckTitle(data.deck.title);
      if (Array.isArray(data.cards)) {
        setCards(data.cards);
        setExercises(buildExercisesFromCards(data.cards, 10));
      }
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  useEffect(() => {
    loadDeck();
  }, [loadDeck]);

  const handleComplete = async (payload: LessonCompletionPayload) => {
    try {
      const res = await fetch('/api/xp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xp: payload.xpEarned }),
      });
      if (res.ok) return await res.json();
    } catch {
      // ignore
    }
  };

  const handleNewRound = () => {
    setRound((r) => r + 1);
    setExercises(buildExercisesFromCards(cards, 10));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f8fb]">
        <div className="text-center space-y-3">
          <div className="text-4xl animate-bounce">🎮</div>
          <p className="text-sm font-black text-slate-500">در حال ساخت تمرین‌های تعاملی این دسته...</p>
        </div>
      </div>
    );
  }

  return (
    <LessonPlayer
      key={`deck-practice-${deckId}-${round}`}
      title={deckTitle}
      subtitle="تمرین ترکیبی دولینگویی از لغات همین دسته"
      exercises={exercises}
      xpReward={25}
      onExit={() => router.push(`/deck/${deckId}`)}
      onComplete={handleComplete}
      secondaryActionLabel="شروع یک دور تازه با سوال‌های جدید 🎲"
      onSecondaryAction={handleNewRound}
    />
  );
}
