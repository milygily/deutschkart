'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { BrowseDeckPlayer } from '@/components/BrowseDeckPlayer';
import { useApp } from '@/components/AppProvider';
import type { WordCard } from '@/lib/types';

export default function DeckBrowsePage() {
  const params = useParams();
  const deckId = Number(params.id);
  const { user, loadingUser } = useApp();

  const [title, setTitle] = useState('');
  const [cards, setCards] = useState<WordCard[]>([]);
  const [initialIndex, setInitialIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!deckId || loadingUser) return;
    let active = true;

    async function load() {
      try {
        const [deckRes, bmRes] = await Promise.all([
          fetch(`/api/decks/${deckId}`, { cache: 'no-store' }).then((r) => r.json()),
          user
            ? fetch(`/api/decks/${deckId}/bookmark`, { cache: 'no-store' }).then((r) => r.json())
            : Promise.resolve({ lastIndex: 0, guest: true }),
        ]);

        if (!active) return;
        if (deckRes.deck) setTitle(deckRes.deck.title);
        if (Array.isArray(deckRes.cards)) setCards(deckRes.cards);

        let savedIdx = Number(bmRes?.lastIndex) || 0;
        if (!user || savedIdx === 0) {
          try {
            const localVal = Number(localStorage.getItem(`dk_browse_pos_${deckId}`)) || 0;
            if (localVal > savedIdx) savedIdx = localVal;
          } catch {
            // ignore
          }
        }
        setInitialIndex(savedIdx);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [deckId, user, loadingUser]);

  return (
    <div className="min-h-screen">
      <Navbar />
      {loading ? (
        <div className="max-w-md mx-auto px-4 pt-12">
          <div className="h-[410px] rounded-[2rem] bg-white border-2 border-slate-100 animate-pulse" />
        </div>
      ) : (
        <BrowseDeckPlayer
          deckId={deckId}
          deckTitle={title}
          cards={cards}
          initialIndex={initialIndex}
          backHref={`/deck/${deckId}`}
        />
      )}
    </div>
  );
}
