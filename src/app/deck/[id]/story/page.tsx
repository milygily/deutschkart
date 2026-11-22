'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { StoryPodcastPlayer, type SavedStory } from '@/components/StoryPodcastPlayer';

export default function DeckStoryPage() {
  const params = useParams();
  const deckId = Number(params.id);

  const [deckTitle, setDeckTitle] = useState('');
  const [stories, setStories] = useState<SavedStory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!deckId) return;
    fetch(`/api/decks/${deckId}/story`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.deck) setDeckTitle(data.deck.title);
        if (Array.isArray(data.stories)) setStories(data.stories);
      })
      .finally(() => setLoading(false));
  }, [deckId]);

  return (
    <div className="min-h-screen">
      <Navbar />
      {loading ? (
        <div className="max-w-lg mx-auto px-4 pt-12">
          <div className="h-80 rounded-[2rem] bg-white border-2 border-slate-100 animate-pulse" />
        </div>
      ) : (
        <StoryPodcastPlayer
          deckId={deckId}
          deckTitle={deckTitle}
          initialStories={stories}
        />
      )}
    </div>
  );
}
