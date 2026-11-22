'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { QuizPlayer, type QuizMode } from '@/components/QuizPlayer';
import { useApp } from '@/components/AppProvider';
import { getStageFromBox, STAGE_META, STAGE_ORDER, type MasteryStage } from '@/lib/leitner';
import type { WordCard } from '@/lib/types';

function QuizContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const deckId = Number(params.id);
  const rawMode = searchParams.get('mode');
  const validModes: QuizMode[] = [
    'meaning',
    'meaning-de-fa',
    'meaning-fa-de',
    'meaning-mix',
    'article',
    'mix',
  ];
  const mode: QuizMode = validModes.includes(rawMode as QuizMode)
    ? (rawMode as QuizMode)
    : 'meaning-de-fa';
  const rawStage = searchParams.get('stage');
  const stageFilter: MasteryStage | null = STAGE_ORDER.includes(rawStage as MasteryStage)
    ? (rawStage as MasteryStage)
    : null;
  const { user, guestProgress } = useApp();

  const [title, setTitle] = useState('');
  const [cards, setCards] = useState<WordCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!deckId) return;
    fetch(`/api/decks/${deckId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.deck) setTitle(data.deck.title);
        if (Array.isArray(data.cards)) {
          const allCards = data.cards as WordCard[];
          if (stageFilter) {
            const matched = allCards.filter((c) => {
              const box = user ? c.progress?.leitnerBox ?? 0 : guestProgress[c.id]?.leitnerBox ?? 0;
              return getStageFromBox(box) === stageFilter;
            });
            setCards(matched);
          } else {
            setCards(allCards);
          }
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, stageFilter, user]);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-12">
        <div className="h-64 rounded-3xl bg-white border-2 border-slate-100 animate-pulse" />
      </div>
    );
  }

  return (
    <QuizPlayer
      deckTitle={stageFilter ? `${title} · ${STAGE_META[stageFilter].label}` : title}
      cards={cards}
      mode={mode}
      backHref={`/deck/${deckId}`}
    />
  );
}

export default function DeckQuizPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <Suspense
        fallback={
          <div className="max-w-lg mx-auto px-4 pt-12">
            <div className="h-64 rounded-3xl bg-white border-2 border-slate-100 animate-pulse" />
          </div>
        }
      >
        <QuizContent />
      </Suspense>
    </div>
  );
}
