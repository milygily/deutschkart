'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { QuizPlayer, type QuizMode } from '@/components/QuizPlayer';
import type { WordCard } from '@/lib/types';

function QuizContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const deckId = Number(params.id);
  const rawMode = searchParams.get('mode');
  const mode: QuizMode =
    rawMode === 'article' || rawMode === 'mix' ? rawMode : 'meaning';

  const [title, setTitle] = useState('');
  const [cards, setCards] = useState<WordCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!deckId) return;
    fetch(`/api/decks/${deckId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.deck) setTitle(data.deck.title);
        if (Array.isArray(data.cards)) setCards(data.cards);
      })
      .finally(() => setLoading(false));
  }, [deckId]);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-12">
        <div className="h-64 rounded-3xl bg-white border-2 border-slate-100 animate-pulse" />
      </div>
    );
  }

  return (
    <QuizPlayer
      deckTitle={title}
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
