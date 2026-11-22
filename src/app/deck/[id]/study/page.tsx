'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { SwipeDeckPlayer } from '@/components/SwipeDeckPlayer';
import type { WordCard } from '@/lib/types';

export default function DeckStudyPage() {
  const params = useParams();
  const deckId = Number(params.id);
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

  return (
    <div className="min-h-screen">
      <Navbar />
      {loading ? (
        <div className="max-w-md mx-auto px-4 pt-12">
          <div className="h-[400px] rounded-[2rem] bg-white border-2 border-slate-100 animate-pulse" />
        </div>
      ) : (
        <SwipeDeckPlayer
          deckId={deckId}
          deckTitle={title}
          initialCards={cards}
          backHref={`/deck/${deckId}`}
          quizHref={`/deck/${deckId}/quiz?mode=mix`}
        />
      )}
    </div>
  );
}
