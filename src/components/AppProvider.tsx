'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AppUser } from '@/lib/types';
import { AuthModal } from './AuthModal';

interface AppContextValue {
  user: AppUser | null;
  loadingUser: boolean;
  showEnglish: boolean;
  setShowEnglish: (val: boolean) => Promise<void>;
  starredIds: Set<number>;
  toggleStar: (wordId: number) => Promise<boolean>;
  masteredIds: Set<number>;
  recordSwipe: (wordId: number, outcome: 'know' | 'practice') => Promise<void>;
  recordQuiz: (wordId: number, correct: boolean) => Promise<void>;
  refreshUser: () => Promise<void>;
  openAuthModal: (reason?: string) => void;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const LS_SHOW_EN = 'dk_show_english';
const LS_STARRED = 'dk_guest_starred';
const LS_MASTERED = 'dk_guest_mastered';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [showEnglish, setShowEnglishState] = useState(false);
  const [starredIds, setStarredIds] = useState<Set<number>>(new Set());
  const [masteredIds, setMasteredIds] = useState<Set<number>>(new Set());
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalReason, setAuthModalReason] = useState<string | undefined>();

  const loadGuestData = useCallback(() => {
    try {
      const savedEn = localStorage.getItem(LS_SHOW_EN);
      if (savedEn !== null) setShowEnglishState(savedEn === 'true');

      const savedStars = JSON.parse(localStorage.getItem(LS_STARRED) || '[]');
      if (Array.isArray(savedStars)) setStarredIds(new Set(savedStars.map(Number)));

      const savedMastered = JSON.parse(localStorage.getItem(LS_MASTERED) || '[]');
      if (Array.isArray(savedMastered)) setMasteredIds(new Set(savedMastered.map(Number)));
    } catch {
      // ignore storage errors
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        setShowEnglishState(Boolean(data.user.showEnglish));
        const starRes = await fetch('/api/starred', { cache: 'no-store' });
        const starData = await starRes.json();
        if (Array.isArray(starData.cards)) {
          setStarredIds(new Set(starData.cards.map((c: { id: number }) => c.id)));
        }
      } else {
        setUser(null);
        loadGuestData();
      }
    } catch {
      setUser(null);
      loadGuestData();
    } finally {
      setLoadingUser(false);
    }
  }, [loadGuestData]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const setShowEnglish = useCallback(
    async (val: boolean) => {
      setShowEnglishState(val);
      if (user) {
        await fetch('/api/auth/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ showEnglish: val }),
        });
        setUser((prev) => (prev ? { ...prev, showEnglish: val } : prev));
      } else {
        try {
          localStorage.setItem(LS_SHOW_EN, String(val));
        } catch {
          // ignore
        }
      }
    },
    [user]
  );

  const toggleStar = useCallback(
    async (wordId: number): Promise<boolean> => {
      let nextStarred = false;
      setStarredIds((prev) => {
        const next = new Set(prev);
        if (next.has(wordId)) {
          next.delete(wordId);
          nextStarred = false;
        } else {
          next.add(wordId);
          nextStarred = true;
        }
        if (!user) {
          try {
            localStorage.setItem(LS_STARRED, JSON.stringify(Array.from(next)));
          } catch {
            // ignore
          }
        }
        return next;
      });

      if (user) {
        await fetch('/api/starred', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wordId }),
        });
      }
      return nextStarred;
    },
    [user]
  );

  const recordSwipe = useCallback(
    async (wordId: number, outcome: 'know' | 'practice') => {
      if (user) {
        const res = await fetch('/api/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wordId, kind: 'swipe', outcome }),
        });
        const data = await res.json();
        if (typeof data.mastered === 'boolean') {
          setMasteredIds((prev) => {
            const next = new Set(prev);
            if (data.mastered) next.add(wordId);
            else next.delete(wordId);
            return next;
          });
        }
      } else {
        setMasteredIds((prev) => {
          const next = new Set(prev);
          if (outcome === 'know') next.add(wordId);
          else next.delete(wordId);
          try {
            localStorage.setItem(LS_MASTERED, JSON.stringify(Array.from(next)));
          } catch {
            // ignore
          }
          return next;
        });
      }
    },
    [user]
  );

  const recordQuiz = useCallback(
    async (wordId: number, correct: boolean) => {
      if (user) {
        const res = await fetch('/api/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wordId, kind: 'quiz', correct }),
        });
        const data = await res.json();
        if (typeof data.mastered === 'boolean') {
          setMasteredIds((prev) => {
            const next = new Set(prev);
            if (data.mastered) next.add(wordId);
            else next.delete(wordId);
            return next;
          });
        }
      } else if (correct) {
        setMasteredIds((prev) => {
          const next = new Set(prev);
          next.add(wordId);
          try {
            localStorage.setItem(LS_MASTERED, JSON.stringify(Array.from(next)));
          } catch {
            // ignore
          }
          return next;
        });
      }
    },
    [user]
  );

  const openAuthModal = useCallback((reason?: string) => {
    setAuthModalReason(reason);
    setAuthModalOpen(true);
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    loadGuestData();
  }, [loadGuestData]);

  return (
    <AppContext.Provider
      value={{
        user,
        loadingUser,
        showEnglish,
        setShowEnglish,
        starredIds,
        toggleStar,
        masteredIds,
        recordSwipe,
        recordQuiz,
        refreshUser,
        openAuthModal,
        logout,
      }}
    >
      {children}
      <AuthModal
        open={authModalOpen}
        reason={authModalReason}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={async () => {
          setAuthModalOpen(false);
          await refreshUser();
        }}
      />
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
