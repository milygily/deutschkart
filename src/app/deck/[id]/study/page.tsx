'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { SwipeDeckPlayer } from '@/components/SwipeDeckPlayer';
import { useApp } from '@/components/AppProvider';
import { isCardDue } from '@/lib/leitner';
import type { WordCard } from '@/lib/types';

function StudyContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const deckId = Number(params.id);
  const onlyDue = searchParams.get('onlyDue') === '1';
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
          if (onlyDue) {
            const dueOnly = (data.cards as WordCard[]).filter((c) => {
              const box = user ? c.progress?.leitnerBox ?? 0 : guestProgress[c.id]?.leitnerBox ?? 0;
              const dueAt = user ? c.progress?.dueAt : guestProgress[c.id]?.dueAt;
              return isCardDue(box, dueAt);
            });
            setCards(dueOnly.length > 0 ? dueOnly : data.cards);
          } else {
            setCards(data.cards);
          }
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, onlyDue, user]);

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 pt-12">
        <div className="h-[400px] rounded-[2rem] bg-white border-2 border-slate-100 animate-pulse" />
      </div>
    );
  }

  return (
    <SwipeDeckPlayer
      deckId={deckId}
      deckTitle={onlyDue ? `${title} · مرور امروز 🔥` : title}
      initialCards={cards}
      backHref={`/deck/${deckId}`}
      quizHref={`/deck/${deckId}/quiz?mode=mix`}
    />
  );
}

export default function DeckStudyPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <Suspense
        fallback={
          <div className="max-w-md mx-auto px-4 pt-12">
            <div className="h-[400px] rounded-[2rem] bg-white border-2 border-slate-100 animate-pulse" />
          </div>
        }
      >
        <StudyContent />
      </Suspense>
    </div>
  );
}

