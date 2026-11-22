'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { BrowseDeckPlayer } from '@/components/BrowseDeckPlayer';
import { useApp } from '@/components/AppProvider';
import { getStageFromBox, STAGE_META, STAGE_ORDER, type MasteryStage } from '@/lib/leitner';
import type { WordCard } from '@/lib/types';

function BrowseContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const deckId = Number(params.id);
  const rawStage = searchParams.get('stage');
  const stageFilter: MasteryStage | null = STAGE_ORDER.includes(rawStage as MasteryStage)
    ? (rawStage as MasteryStage)
    : null;
  const { user, loadingUser, guestProgress } = useApp();

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
          !stageFilter && user
            ? fetch(`/api/decks/${deckId}/bookmark`, { cache: 'no-store' }).then((r) => r.json())
            : Promise.resolve({ lastIndex: 0, guest: true }),
        ]);

        if (!active) return;
        if (deckRes.deck) setTitle(deckRes.deck.title);
        if (Array.isArray(deckRes.cards)) {
          const allCards = deckRes.cards as WordCard[];
          if (stageFilter) {
            const matched = allCards.filter((c) => {
              const box = user ? c.progress?.leitnerBox ?? 0 : guestProgress[c.id]?.leitnerBox ?? 0;
              return getStageFromBox(box) === stageFilter;
            });
            setCards(matched);
            setInitialIndex(0);
          } else {
            setCards(allCards);
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
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, user, loadingUser, stageFilter]);

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 pt-12">
        <div className="h-[470px] rounded-[2rem] bg-white border-2 border-slate-100 animate-pulse" />
      </div>
    );
  }

  return (
    <BrowseDeckPlayer
      deckId={deckId}
      deckTitle={stageFilter ? `${title} · ${STAGE_META[stageFilter].label}` : title}
      cards={cards}
      initialIndex={initialIndex}
      backHref={`/deck/${deckId}`}
    />
  );
}

export default function DeckBrowsePage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <Suspense
        fallback={
          <div className="max-w-md mx-auto px-4 pt-12">
            <div className="h-[470px] rounded-[2rem] bg-white border-2 border-slate-100 animate-pulse" />
          </div>
        }
      >
        <BrowseContent />
      </Suspense>
    </div>
  );
}
