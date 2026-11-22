'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  X,
  Volume2,
  Mic,
  MicOff,
  CheckCircle2,
  XCircle,
  Sparkles,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  Zap,
  Flame,
  Snowflake,
  Trophy,
  SkipForward,
  Eraser,
  BookOpen,
  Loader2,
  Square,
} from 'lucide-react';
import { speakGerman, stopGermanAudio } from '@/lib/speech';
import {
  checkGermanAnswer,
  computeSpeechSimilarity,
  tokenizeGermanSentence,
  type Exercise,
  type MatchPairsExercise,
} from '@/lib/exercises';
import { useApp } from './AppProvider';

const GERMAN_CHARS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'];

export interface LessonCompletionPayload {
  totalExercises: number;
  correctFirstTry: number;
  accuracy: number;
  xpEarned: number;
}

export interface XpFeedback {
  xpEarned?: number;
  dailyXp?: number;
  dailyGoal?: number;
  streakCount?: number;
  streakFreezes?: number;
  goalJustReached?: boolean;
  freezeUsed?: boolean;
  freezeEarned?: boolean;
}

interface LessonPlayerProps {
  title: string;
  subtitle?: string;
  exercises: Exercise[];
  xpReward?: number;
  onExit: () => void;
  onComplete?: (payload: LessonCompletionPayload) => Promise<XpFeedback | void> | XpFeedback | void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  guideHint?: string;
}

interface QueueItem {
  exercise: Exercise;
  isRetry: boolean;
  retryRound: number;
}

interface StepSnapshot {
  status: 'correct' | 'wrong' | 'skipped';
  minorTypoNote: boolean;
  selectedTokenIndices: number[];
  selectedOption: string | null;
  typedText: string;
  spokenText: string;
  matchedIds: string[];
  matchLeftOrder: Array<{ id: string; de: string }>;
  matchRightOrder: Array<{ id: string; fa: string }>;
}

interface DraftState {
  idx: number;
  selectedTokenIndices: number[];
  selectedOption: string | null;
  typedText: string;
  spokenText: string;
  matchedIds: string[];
  matchLeftOrder: Array<{ id: string; de: string }>;
  matchRightOrder: Array<{ id: string; fa: string }>;
  matchMistakeCount: number;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function isIOSBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  // IMPORTANT: Never use webkitSpeechRecognition on iOS/iPadOS — it freezes the WebKit/PWA UI thread!
  if (isIOSBrowser()) return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function supportsMediaRecorderMic(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  );
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface DraggableWordTrayProps {
  selectedTokenIndices: number[];
  activeTokens: string[];
  status: 'idle' | 'correct' | 'wrong' | 'skipped';
  placeholderFa: string;
  onChangeOrder: (updater: (prev: number[]) => number[]) => void;
}

/**
 * Mobile-first (iOS Touch + Desktop Mouse) drag-and-drop reorderable word tray.
 * - Quick tap (< 8px movement): removes the word back to the bank.
 * - Hold & drag (>= 8px): live-reorders across wrapped rows with floating ghost pill!
 */
function DraggableWordTray({
  selectedTokenIndices,
  activeTokens,
  status,
  placeholderFa,
  onChangeOrder,
}: DraggableWordTrayProps) {
  const dragRef = useRef<{
    active: boolean;
    dragging: boolean;
    pointerId: number;
    pos: number;
    tokenIdx: number;
    startX: number;
    startY: number;
  } | null>(null);

  const [draggingPos, setDraggingPos] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ text: string; x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>, pos: number, tokenIdx: number) => {
    if (status !== 'idle') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      dragging: false,
      pointerId: e.pointerId,
      pos,
      tokenIdx,
      startX: e.clientX,
      startY: e.clientY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = dragRef.current;
    if (!st || !st.active || st.pointerId !== e.pointerId) return;

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (!st.dragging && Math.hypot(dx, dy) >= 8) {
      st.dragging = true;
      setDraggingPos(st.pos);
    }

    if (st.dragging) {
      setGhost({ text: activeTokens[st.tokenIdx] || '', x: e.clientX, y: e.clientY });

      // Find which chip in the tray the finger/cursor is currently over (works across wrapped lines!)
      const els = document.elementsFromPoint(e.clientX, e.clientY);
      const hitEl = els.find(
        (el): el is HTMLElement => el instanceof HTMLElement && el.dataset.trayPos !== undefined
      );
      if (hitEl) {
        const targetPos = Number(hitEl.dataset.trayPos);
        if (!Number.isNaN(targetPos) && targetPos !== st.pos) {
          const fromPos = st.pos;
          st.pos = targetPos;
          setDraggingPos(targetPos);
          onChangeOrder((prev) => {
            if (fromPos < 0 || fromPos >= prev.length || targetPos < 0 || targetPos >= prev.length) {
              return prev;
            }
            const next = [...prev];
            const [moved] = next.splice(fromPos, 1);
            next.splice(targetPos, 0, moved);
            return next;
          });
        }
      }
    }
  };

  const finishPointer = (e: React.PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const st = dragRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    const wasDragging = st.dragging;
    const finalPos = st.pos;
    dragRef.current = null;
    setDraggingPos(null);
    setGhost(null);

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    // Quick tap (didn't drag) -> remove chip back to word bank
    if (!cancelled && !wasDragging && status === 'idle') {
      onChangeOrder((prev) => prev.filter((_, p) => p !== finalPos));
    }
  };

  return (
    <>
      <div
        dir="ltr"
        className={`min-h-[84px] rounded-3xl border-2 border-dashed p-3.5 flex flex-wrap items-center gap-2 transition ${
          status === 'correct'
            ? 'bg-emerald-50 border-emerald-400'
            : status === 'wrong'
              ? 'bg-rose-50 border-rose-400'
              : 'bg-white border-slate-300'
        }`}
      >
        {selectedTokenIndices.length === 0 ? (
          <span className="text-sm font-bold text-slate-400 w-full text-center" dir="rtl">
            {placeholderFa}
          </span>
        ) : (
          selectedTokenIndices.map((tokenIdx, pos) => {
            const isBeingDragged = draggingPos === pos;
            return (
              <motion.button
                key={`sel-${tokenIdx}`}
                layout
                transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                data-tray-pos={pos}
                type="button"
                disabled={status !== 'idle'}
                onPointerDown={(e) => handlePointerDown(e, pos, tokenIdx)}
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => finishPointer(e, false)}
                onPointerCancel={(e) => finishPointer(e, true)}
                className={`font-de rounded-2xl border-2 border-b-4 px-3.5 py-2 text-sm sm:text-base font-extrabold select-none touch-none transition ${
                  status === 'idle' ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'
                } ${
                  isBeingDragged
                    ? 'bg-sky-100/60 border-dashed border-sky-400 text-sky-400 scale-95'
                    : 'bg-sky-50 border-sky-300 text-sky-900 shadow-xs hover:bg-sky-100'
                }`}
              >
                {activeTokens[tokenIdx]}
              </motion.button>
            );
          })
        )}
      </div>

      {selectedTokenIndices.length >= 2 && status === 'idle' && (
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-[11px] sm:text-xs font-bold text-slate-400">
            ↔️ برای جابه‌جایی، کلمه را نگه دار و بکش · برای حذف، ضربه بزن
          </span>
          <button
            type="button"
            onClick={() => onChangeOrder(() => [])}
            className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-400 hover:text-rose-500 shrink-0"
          >
            <Eraser className="w-3.5 h-3.5" />
            پاک کردن همه
          </button>
        </div>
      )}

      {/* Floating ghost pill following the user's finger/cursor smoothly */}
      {ghost && (
        <div
          dir="ltr"
          style={{
            left: ghost.x,
            top: ghost.y - 26,
            transform: 'translate(-50%, -50%) scale(1.08)',
          }}
          className="pointer-events-none fixed z-50 font-de rounded-2xl bg-sky-500 border-2 border-sky-600 border-b-4 text-white px-4 py-2 text-base font-black shadow-2xl"
        >
          {ghost.text}
        </div>
      )}
    </>
  );
}

export function LessonPlayer({
  title,
  subtitle,
  exercises,
  xpReward = 25,
  onExit,
  onComplete,
  secondaryActionLabel,
  onSecondaryAction,
  guideHint,
}: LessonPlayerProps) {
  const { user, openAuthModal, refreshUser } = useApp();

  // Queue with automatic Duolingo-style wrong-answer retry rounds until 100% mastered
  const [queue, setQueue] = useState<QueueItem[]>(() =>
    exercises.map((exercise) => ({ exercise, isRetry: false, retryRound: 0 }))
  );
  const [currentIdx, setCurrentIdx] = useState(0);
  const [furthestIdx, setFurthestIdx] = useState(0);
  const [historyByIdx, setHistoryByIdx] = useState<Record<number, StepSnapshot>>({});
  const historyRef = useRef<Record<number, StepSnapshot>>({});
  const draftRef = useRef<DraftState | null>(null);
  const completionRecordedRef = useRef(false);
  const [correctFirstTry, setCorrectFirstTry] = useState(0);
  const [answeredFirstTryIds, setAnsweredFirstTryIds] = useState<Set<string>>(() => new Set());
  const [masteredExerciseIds, setMasteredExerciseIds] = useState<Set<string>>(() => new Set());
  const [retryIntermission, setRetryIntermission] = useState<{
    nextIdx: number;
    round: number;
    count: number;
  } | null>(null);
  const [finished, setFinished] = useState(false);
  const [submittingFinish, setSubmittingFinish] = useState(false);
  const [xpResult, setXpResult] = useState<XpFeedback | null>(null);

  // Per-question state
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong' | 'skipped'>('idle');
  const [minorTypoNote, setMinorTypoNote] = useState(false);

  // Word-bank / Listening-bank state (index-based so duplicate words never collide)
  const [selectedTokenIndices, setSelectedTokenIndices] = useState<number[]>([]);

  // Grammar-cloze state
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  // Typing / Listening-type state
  const [typedText, setTypedText] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Speaking state (supports live SpeechRecognition on Desktop/Android + zero-freeze MediaRecorder on iOS/PWA!)
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [isEvaluatingSpeech, setIsEvaluatingSpeech] = useState(false);
  const [spokenText, setSpokenText] = useState('');
  const [speechFeedbackFa, setSpeechFeedbackFa] = useState('');
  const [micError, setMicError] = useState('');
  const [micMode, setMicMode] = useState<'webspeech' | 'recorder' | 'none'>('none');
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const micTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechAbortRef = useRef<AbortController | null>(null);

  // Match-pairs state
  const [matchLeftOrder, setMatchLeftOrder] = useState<Array<{ id: string; de: string }>>([]);
  const [matchRightOrder, setMatchRightOrder] = useState<Array<{ id: string; fa: string }>>([]);
  const [selectedLeftId, setSelectedLeftId] = useState<string | null>(null);
  const [selectedRightId, setSelectedRightId] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(() => new Set());
  const [wrongFlashPair, setWrongFlashPair] = useState<{ left: string; right: string } | null>(null);
  const [matchMistakeCount, setMatchMistakeCount] = useState(0);

  // Reset only when the actual exercise IDs change (not on incidental parent re-renders)
  const exercisesKey = useMemo(() => exercises.map((e) => e.id).join('|'), [exercises]);
  useEffect(() => {
    setQueue(exercises.map((exercise) => ({ exercise, isRetry: false, retryRound: 0 })));
    setCurrentIdx(0);
    setFurthestIdx(0);
    setHistoryByIdx({});
    historyRef.current = {};
    draftRef.current = null;
    completionRecordedRef.current = false;
    setCorrectFirstTry(0);
    setAnsweredFirstTryIds(new Set());
    setMasteredExerciseIds(new Set());
    setRetryIntermission(null);
    setFinished(false);
    setXpResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercisesKey]);

  useEffect(() => {
    if (getSpeechRecognitionCtor()) {
      setMicMode('webspeech');
    } else if (supportsMediaRecorderMic()) {
      setMicMode('recorder');
    } else {
      setMicMode('none');
    }
  }, []);

  const currentItem = queue[currentIdx];
  const current = currentItem?.exercise;

  const stopMic = useCallback(() => {
    if (micTimerRef.current) {
      clearTimeout(micTimerRef.current);
      micTimerRef.current = null;
    }
    if (speechAbortRef.current) {
      try {
        speechAbortRef.current.abort();
      } catch {
        // ignore
      }
      speechAbortRef.current = null;
    }
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      try {
        // Detach handlers first and use stop() instead of synchronous abort() to avoid WebKit deadlocks
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.stop();
      } catch {
        // ignore
      }
    }
    if (mediaRecorderRef.current) {
      const mr = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      try {
        mr.ondataavailable = null;
        mr.onstop = null;
        if (mr.state !== 'inactive') mr.stop();
      } catch {
        // ignore
      }
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      mediaStreamRef.current = null;
    }
    setIsListeningMic(false);
    setIsEvaluatingSpeech(false);
  }, []);

  // Deterministic snapshot saver called synchronously the moment a question is answered/skipped
  const commitStepResult = useCallback(
    (
      nextStatus: 'correct' | 'wrong' | 'skipped',
      overrides?: {
        minorTypoNote?: boolean;
        spokenText?: string;
        matchedIds?: string[];
      }
    ) => {
      const finalMinorTypo = overrides?.minorTypoNote ?? false;
      setMinorTypoNote(finalMinorTypo);
      setStatus(nextStatus);

      if (!historyRef.current[currentIdx]) {
        const snap: StepSnapshot = {
          status: nextStatus,
          minorTypoNote: finalMinorTypo,
          selectedTokenIndices: [...selectedTokenIndices],
          selectedOption,
          typedText,
          spokenText: overrides?.spokenText ?? spokenText,
          matchedIds: overrides?.matchedIds ?? Array.from(matchedIds),
          matchLeftOrder: [...matchLeftOrder],
          matchRightOrder: [...matchRightOrder],
        };
        historyRef.current = { ...historyRef.current, [currentIdx]: snap };
        setHistoryByIdx(historyRef.current);
      }
    },
    [
      currentIdx,
      matchLeftOrder,
      matchRightOrder,
      matchedIds,
      selectedOption,
      selectedTokenIndices,
      spokenText,
      typedText,
    ]
  );

  // Restore snapshot (for past questions), draft (when returning to active question), or reset fresh
  useEffect(() => {
    stopMic();
    setMicError('');
    setSpeechFeedbackFa('');
    setSelectedLeftId(null);
    setSelectedRightId(null);
    setWrongFlashPair(null);

    if (!current) return;

    const savedSnap = historyRef.current[currentIdx];
    if (savedSnap) {
      setStatus(savedSnap.status);
      setMinorTypoNote(savedSnap.minorTypoNote);
      setSelectedTokenIndices(savedSnap.selectedTokenIndices);
      setSelectedOption(savedSnap.selectedOption);
      setTypedText(savedSnap.typedText);
      setSpokenText(savedSnap.spokenText);
      setMatchedIds(new Set(savedSnap.matchedIds));
      if (savedSnap.matchLeftOrder.length > 0) setMatchLeftOrder(savedSnap.matchLeftOrder);
      if (savedSnap.matchRightOrder.length > 0) setMatchRightOrder(savedSnap.matchRightOrder);
      return;
    }

    const savedDraft = draftRef.current;
    if (savedDraft && savedDraft.idx === currentIdx) {
      setStatus('idle');
      setMinorTypoNote(false);
      setSelectedTokenIndices(savedDraft.selectedTokenIndices);
      setSelectedOption(savedDraft.selectedOption);
      setTypedText(savedDraft.typedText);
      setSpokenText(savedDraft.spokenText);
      setMatchedIds(new Set(savedDraft.matchedIds));
      setMatchMistakeCount(savedDraft.matchMistakeCount);
      if (savedDraft.matchLeftOrder.length > 0) setMatchLeftOrder(savedDraft.matchLeftOrder);
      if (savedDraft.matchRightOrder.length > 0) setMatchRightOrder(savedDraft.matchRightOrder);
      draftRef.current = null;
      return;
    }

    setStatus('idle');
    setMinorTypoNote(false);
    setSelectedTokenIndices([]);
    setSelectedOption(null);
    setTypedText('');
    setSpokenText('');
    setMatchedIds(new Set());
    setMatchMistakeCount(0);

    if (current.type === 'match-pairs') {
      setMatchLeftOrder(shuffleArray(current.pairs.map((p) => ({ id: p.id, de: p.de }))));
      setMatchRightOrder(shuffleArray(current.pairs.map((p) => ({ id: p.id, fa: p.fa }))));
    }

    // Auto-play audio gently for fresh listening exercises
    if (current.type === 'listening') {
      const t = setTimeout(() => {
        speakGerman(current.audioDe, 0.9);
      }, 280);
      return () => clearTimeout(t);
    }

    // Focus input on fresh typing exercises
    if (current.type === 'typing') {
      const t = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(t);
    }
  }, [currentIdx, current, stopMic]);

  const navigateToIdx = useCallback(
    (targetIdx: number) => {
      if (targetIdx < 0 || targetIdx > furthestIdx || targetIdx === currentIdx) return;
      // Preserve active unanswered draft when stepping back so nothing is lost
      if (currentIdx === furthestIdx && status === 'idle' && !historyRef.current[currentIdx]) {
        draftRef.current = {
          idx: currentIdx,
          selectedTokenIndices: [...selectedTokenIndices],
          selectedOption,
          typedText,
          spokenText,
          matchedIds: Array.from(matchedIds),
          matchLeftOrder: [...matchLeftOrder],
          matchRightOrder: [...matchRightOrder],
          matchMistakeCount,
        };
      }
      setCurrentIdx(targetIdx);
    },
    [
      currentIdx,
      furthestIdx,
      matchLeftOrder,
      matchMistakeCount,
      matchRightOrder,
      matchedIds,
      selectedOption,
      selectedTokenIndices,
      spokenText,
      status,
      typedText,
    ]
  );

  const isReviewingPast = currentIdx < furthestIdx || (completionRecordedRef.current && Boolean(historyByIdx[currentIdx]));

  // Stop mic on unmount
  useEffect(() => {
    return () => stopMic();
  }, [stopMic]);

  // Effective token list for word-bank or listening word-bank
  const activeTokens = useMemo(() => {
    if (!current) return [];
    if (current.type === 'word-bank') {
      return current.tokens?.length ? current.tokens : shuffleArray(tokenizeGermanSentence(current.targetDe));
    }
    if (current.type === 'listening' && current.mode === 'word-bank') {
      return current.tokens?.length ? current.tokens : shuffleArray(tokenizeGermanSentence(current.audioDe));
    }
    return [];
  }, [current]);

  const recordOutcome = useCallback(
    (isCorrect: boolean, isSkipped = false) => {
      if (!current || !currentItem) return;

      if (!currentItem.isRetry && !answeredFirstTryIds.has(current.id)) {
        setAnsweredFirstTryIds((prev) => new Set(prev).add(current.id));
        if (isCorrect || isSkipped) {
          setCorrectFirstTry((c) => c + 1);
        }
      }

      if (isCorrect || isSkipped) {
        setMasteredExerciseIds((prev) => {
          const next = new Set(prev);
          next.add(current.id);
          return next;
        });
      } else {
        // Duolingo-style infinite mistake loop: re-queue wrong answer into the NEXT retry round
        // so the lesson CANNOT finish until every single mistake is answered correctly!
        const nextRound = currentItem.retryRound + 1;
        setQueue((prev) => [
          ...prev,
          {
            exercise:
              current.type === 'grammar-cloze'
                ? { ...current, options: shuffleArray(current.options) }
                : current,
            isRetry: true,
            retryRound: nextRound,
          },
        ]);
      }
    },
    [answeredFirstTryIds, current, currentItem]
  );

  // Check Match Pairs interaction
  const handlePairSelect = useCallback(
    (side: 'left' | 'right', id: string) => {
      if (status !== 'idle' || matchedIds.has(id) || !current || current.type !== 'match-pairs') return;

      if (side === 'left') {
        const pairItem = (current as MatchPairsExercise).pairs.find((p) => p.id === id);
        if (pairItem) speakGerman(pairItem.de, 0.95);
      }

      const nextLeft = side === 'left' ? (selectedLeftId === id ? null : id) : selectedLeftId;
      const nextRight = side === 'right' ? (selectedRightId === id ? null : id) : selectedRightId;

      setSelectedLeftId(nextLeft);
      setSelectedRightId(nextRight);

      if (nextLeft && nextRight) {
        if (nextLeft === nextRight) {
          const nextMatched = new Set(matchedIds);
          nextMatched.add(nextLeft);
          setMatchedIds(nextMatched);
          setSelectedLeftId(null);
          setSelectedRightId(null);

          if (nextMatched.size === current.pairs.length) {
            commitStepResult('correct', { matchedIds: Array.from(nextMatched) });
            recordOutcome(matchMistakeCount <= 1);
          }
        } else {
          setMatchMistakeCount((m) => m + 1);
          setWrongFlashPair({ left: nextLeft, right: nextRight });
          setTimeout(() => {
            setWrongFlashPair(null);
            setSelectedLeftId(null);
            setSelectedRightId(null);
          }, 480);
        }
      }
    },
    [commitStepResult, current, matchMistakeCount, matchedIds, recordOutcome, selectedLeftId, selectedRightId, status]
  );

  // Start / Stop Microphone (safe MediaRecorder on iOS/PWA + hardened Web Speech on Desktop/Android)
  const toggleMicrophone = useCallback(async () => {
    if (!current || current.type !== 'speaking' || status !== 'idle' || isEvaluatingSpeech) return;

    // 1) MediaRecorder path (iOS Safari, iOS Home Screen PWA, Firefox, etc.) -> ZERO WebKit freeze!
    if (micMode === 'recorder') {
      if (isListeningMic && mediaRecorderRef.current) {
        // Finish recording and send to /api/speech-check!
        if (micTimerRef.current) {
          clearTimeout(micTimerRef.current);
          micTimerRef.current = null;
        }
        try {
          if (mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        } catch {
          stopMic();
        }
        return;
      }

      stopGermanAudio();
      setMicError('');
      setSpeechFeedbackFa('');
      setSpokenText('');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const mimeCandidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
        const chosenMime = mimeCandidates.find(
          (m) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(m)
        );
        const recorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream);
        const chunks: Blob[] = [];

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) chunks.push(ev.data);
        };

        recorder.onstop = async () => {
          mediaRecorderRef.current = null;
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((t) => t.stop());
            mediaStreamRef.current = null;
          }
          setIsListeningMic(false);

          const blob = new Blob(chunks, { type: chosenMime || recorder.mimeType || 'audio/mp4' });
          if (blob.size < 300) {
            setMicError('صدایی ضبط نشد؛ دوباره روی میکروفون بزن، جمله را بخوان و سپس دکمه توقف را بزن.');
            return;
          }

          setIsEvaluatingSpeech(true);
          const ac = new AbortController();
          speechAbortRef.current = ac;
          const reqTimeout = setTimeout(() => ac.abort(), 16000);

          try {
            const fd = new FormData();
            fd.append('audio', blob, 'speech.webm');
            fd.append('targetDe', current.targetDe);

            const res = await fetch('/api/speech-check', {
              method: 'POST',
              body: fd,
              signal: ac.signal,
            });
            clearTimeout(reqTimeout);
            speechAbortRef.current = null;
            const data = await res.json();

            if (!res.ok) {
              setMicError(data.error || 'خطا در بررسی صدا؛ دوباره امتحان کن یا رد کن.');
              return;
            }

            if (data.transcript) setSpokenText(data.transcript);
            if (data.feedbackFa) setSpeechFeedbackFa(data.feedbackFa);

            if (data.passed) {
              commitStepResult('correct', { spokenText: data.transcript || current.targetDe });
              recordOutcome(true);
            } else {
              setMicError(data.feedbackFa || 'کمی نامفهوم بود — دوباره امتحان کن یا رد کن.');
            }
          } catch (err) {
            clearTimeout(reqTimeout);
            speechAbortRef.current = null;
            if ((err as Error)?.name !== 'AbortError') {
              setMicError('ارتباط برای بررسی صدا قطع شد؛ می‌توانی دوباره بزنی یا رد کنی.');
            }
          } finally {
            setIsEvaluatingSpeech(false);
          }
        };

        mediaRecorderRef.current = recorder;
        setIsListeningMic(true);
        recorder.start();

        // Hard 9-second auto-stop so recording can never stay open forever
        micTimerRef.current = setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try {
              mediaRecorderRef.current.stop();
            } catch {
              stopMic();
            }
          }
        }, 9000);
      } catch {
        stopMic();
        setMicError('دسترسی میکروفون داده نشد. می‌توانی دسترسی بدهی یا گزینه «الان نمی‌تونم حرف بزنم» را بزنی.');
      }
      return;
    }

    // 2) Live Web Speech API path (Desktop Chrome / Android Chrome)
    if (isListeningMic) {
      stopMic();
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setMicMode('none');
      setMicError('مرورگر فعلی از ضبط صدا پشتیبانی نمی‌کند. می‌توانی با دکمه پایین این سوال را رد کنی.');
      return;
    }

    try {
      stopGermanAudio();
      setMicError('');
      setSpeechFeedbackFa('');
      setSpokenText('');
      const rec = new Ctor();
      rec.lang = 'de-DE';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 3;

      let latestTranscript = '';
      let passed = false;

      rec.onresult = (event) => {
        if (passed) return;
        let full = '';
        for (let i = 0; i < event.results.length; i++) {
          full += event.results[i][0].transcript + ' ';
        }
        latestTranscript = full.trim();
        setSpokenText(latestTranscript);

        const score = computeSpeechSimilarity(latestTranscript, current.targetDe);
        if (score >= 0.68) {
          passed = true;
          stopMic();
          commitStepResult('correct', { spokenText: latestTranscript });
          recordOutcome(true);
        }
      };

      rec.onerror = (ev) => {
        if (micTimerRef.current) {
          clearTimeout(micTimerRef.current);
          micTimerRef.current = null;
        }
        recognitionRef.current = null;
        setIsListeningMic(false);
        if (passed) return;
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          setMicError('دسترسی میکروفون داده نشد. می‌توانید دسترسی بدهید یا گزینه «الان نمی‌تونم حرف بزنم» را بزنید.');
        } else if (ev.error === 'no-speech') {
          setMicError('صدایی شنیده نشد؛ دوباره روی میکروفون بزنید و کمی بلندتر بخوانید.');
        } else {
          setMicError('خطای موقت میکروفون. دوباره امتحان کنید یا رد کنید.');
        }
      };

      rec.onend = () => {
        if (micTimerRef.current) {
          clearTimeout(micTimerRef.current);
          micTimerRef.current = null;
        }
        recognitionRef.current = null;
        setIsListeningMic(false);
        if (passed) return;
        if (latestTranscript) {
          const score = computeSpeechSimilarity(latestTranscript, current.targetDe);
          if (score >= 0.65) {
            passed = true;
            commitStepResult('correct', { spokenText: latestTranscript });
            recordOutcome(true);
          } else {
            setMicError('کمی نامفهوم بود — یک بار دیگر امتحان کن یا اگر الان شرایطش نیست رد کن.');
          }
        }
      };

      recognitionRef.current = rec;
      setIsListeningMic(true);
      rec.start();

      // Safety 10-second auto-stop so Web Speech can never get stuck!
      micTimerRef.current = setTimeout(() => {
        if (recognitionRef.current === rec) {
          stopMic();
        }
      }, 10000);
    } catch {
      stopMic();
      setMicError('امکان فعال‌سازی میکروفون نبود. از دکمه رد کردن استفاده کنید.');
    }
  }, [commitStepResult, current, isEvaluatingSpeech, isListeningMic, micMode, recordOutcome, status, stopMic]);

  const handleSkipSpeaking = useCallback(() => {
    stopMic();
    commitStepResult('skipped');
    recordOutcome(true, true);
  }, [commitStepResult, recordOutcome, stopMic]);

  // Insert special German char at cursor position
  const insertGermanChar = (ch: string) => {
    const el = inputRef.current;
    if (!el) {
      setTypedText((prev) => prev + ch);
      return;
    }
    const start = el.selectionStart ?? typedText.length;
    const end = el.selectionEnd ?? typedText.length;
    const next = typedText.slice(0, start) + ch + typedText.slice(end);
    setTypedText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + ch.length, start + ch.length);
    });
  };

  // Can submit?
  const canCheck = useMemo(() => {
    if (!current || status !== 'idle') return false;
    switch (current.type) {
      case 'word-bank':
        return selectedTokenIndices.length > 0;
      case 'grammar-cloze':
        return selectedOption !== null;
      case 'listening':
        return current.mode === 'word-bank'
          ? selectedTokenIndices.length > 0
          : typedText.trim().length > 0;
      case 'typing':
        return typedText.trim().length > 0;
      case 'speaking':
        return spokenText.trim().length > 0;
      case 'match-pairs':
        return false; // auto-completes when all matched
    }
  }, [current, selectedOption, selectedTokenIndices.length, spokenText, status, typedText]);

  const handleCheck = useCallback(() => {
    if (!current || status !== 'idle') return;

    if (current.type === 'word-bank') {
      const built = selectedTokenIndices.map((i) => activeTokens[i]).join(' ');
      const res = checkGermanAnswer(built, current.targetDe);
      commitStepResult(res.correct ? 'correct' : 'wrong', { minorTypoNote: Boolean(res.minorTypo) });
      recordOutcome(res.correct);
      speakGerman(current.targetDe, 0.92);
      return;
    }

    if (current.type === 'grammar-cloze') {
      const isCorrect = selectedOption === current.answer;
      commitStepResult(isCorrect ? 'correct' : 'wrong');
      recordOutcome(isCorrect);
      const audioText =
        current.fullSentenceDe ||
        `${current.sentenceBefore}${current.answer}${current.sentenceAfter}`.trim();
      if (audioText && /[a-zA-ZäöüßÄÖÜ]/.test(audioText)) {
        speakGerman(audioText, 0.92);
      }
      return;
    }

    if (current.type === 'listening') {
      const userVal =
        current.mode === 'word-bank'
          ? selectedTokenIndices.map((i) => activeTokens[i]).join(' ')
          : typedText;
      const res = checkGermanAnswer(userVal, current.audioDe);
      commitStepResult(res.correct ? 'correct' : 'wrong', { minorTypoNote: Boolean(res.minorTypo) });
      recordOutcome(res.correct);
      return;
    }

    if (current.type === 'typing') {
      const strictShort = current.answerDe.trim().length <= 5;
      const res = checkGermanAnswer(
        typedText,
        current.answerDe,
        current.acceptedAnswers || [],
        strictShort
      );
      commitStepResult(res.correct ? 'correct' : 'wrong', { minorTypoNote: Boolean(res.minorTypo) });
      recordOutcome(res.correct);
      const speakTarget =
        current.sentenceBefore || current.sentenceAfter
          ? `${current.sentenceBefore || ''}${current.answerDe}${current.sentenceAfter || ''}`
          : current.answerDe;
      speakGerman(speakTarget, 0.92);
      return;
    }

    if (current.type === 'speaking') {
      const score = computeSpeechSimilarity(spokenText, current.targetDe);
      const isCorrect = score >= 0.65;
      commitStepResult(isCorrect ? 'correct' : 'wrong');
      recordOutcome(isCorrect);
    }
  }, [activeTokens, commitStepResult, current, recordOutcome, selectedOption, selectedTokenIndices, spokenText, status, typedText]);

  const handleContinue = useCallback(async () => {
    if (currentIdx + 1 < queue.length) {
      const next = currentIdx + 1;
      const curItem = queue[currentIdx];
      const nextItem = queue[next];

      // Show Duolingo-style intermission screen when transitioning into a Mistake-Retry Round!
      if (curItem && nextItem && nextItem.retryRound > curItem.retryRound && next > furthestIdx) {
        const mistakesInNextRound = queue.filter((q) => q.retryRound === nextItem.retryRound).length;
        setRetryIntermission({
          nextIdx: next,
          round: nextItem.retryRound,
          count: mistakesInNextRound,
        });
        return;
      }

      setFurthestIdx((f) => Math.max(f, next));
      setCurrentIdx(next);
      return;
    }

    // Lesson finished! (Only reached once EVERY mistake has been answered correctly!)
    setFinished(true);
    if (completionRecordedRef.current) return;
    completionRecordedRef.current = true;

    confetti({
      particleCount: 95,
      spread: 75,
      origin: { y: 0.62 },
    });

    const totalOriginal = exercises.length || 1;
    const accuracy = Math.min(100, Math.round((correctFirstTry / totalOriginal) * 100));

    if (onComplete) {
      setSubmittingFinish(true);
      try {
        const res = await onComplete({
          totalExercises: totalOriginal,
          correctFirstTry,
          accuracy,
          xpEarned: xpReward,
        });
        if (res) setXpResult(res);
        await refreshUser();
      } finally {
        setSubmittingFinish(false);
      }
    }
  }, [correctFirstTry, currentIdx, exercises.length, furthestIdx, onComplete, queue, refreshUser, xpReward]);

  const startRetryRound = useCallback(() => {
    if (!retryIntermission) return;
    const { nextIdx } = retryIntermission;
    setRetryIntermission(null);
    setFurthestIdx((f) => Math.max(f, nextIdx));
    setCurrentIdx(nextIdx);
  }, [retryIntermission]);

  // Enter key shortcut for fast desktop practice
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (finished) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        if (retryIntermission) {
          e.preventDefault();
          startRetryRound();
        } else if (isReviewingPast) {
          e.preventDefault();
          if (currentIdx < furthestIdx) navigateToIdx(currentIdx + 1);
          else setFinished(true);
        } else if (status === 'idle' && canCheck) {
          e.preventDefault();
          handleCheck();
        } else if (status !== 'idle') {
          e.preventDefault();
          handleContinue();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canCheck, currentIdx, finished, furthestIdx, handleCheck, handleContinue, isReviewingPast, navigateToIdx, retryIntermission, startRetryRound, status]);

  // Correct answer display text for wrong banner
  const correctDisplay = useMemo(() => {
    if (!current) return '';
    switch (current.type) {
      case 'word-bank':
        return current.targetDe;
      case 'grammar-cloze':
        return current.fullSentenceDe || current.answer;
      case 'listening':
        return current.audioDe;
      case 'typing':
        return current.sentenceBefore || current.sentenceAfter
          ? `${current.sentenceBefore || ''}${current.answerDe}${current.sentenceAfter || ''}`
          : current.answerDe;
      case 'speaking':
        return current.targetDe;
      case 'match-pairs':
        return '';
    }
  }, [current]);

  // Duolingo-style Progress %: ONLY fills up as each exercise is actually MASTERED (answered correctly)!
  const progressPct =
    exercises.length > 0 ? Math.min(100, Math.round((masteredExerciseIds.size / exercises.length) * 100)) : 0;

  // Compute clean round-relative position (e.g. "سوال ۳ از ۱۰" or "اصلاح اشتباه ۲ از ۳")
  const roundPositionInfo = useMemo(() => {
    if (!currentItem) return { pos: 1, total: exercises.length || 1, round: 0 };
    const r = currentItem.retryRound;
    const roundItems = queue
      .map((item, idx) => ({ item, idx }))
      .filter((x) => x.item.retryRound === r);
    const pos = roundItems.findIndex((x) => x.idx === currentIdx) + 1;
    return { pos: Math.max(1, pos), total: Math.max(1, roundItems.length), round: r };
  }, [currentIdx, currentItem, exercises.length, queue]);

  if (!exercises.length) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="text-5xl">📭</div>
        <h2 className="text-xl font-black text-slate-800">هنوز تمرینی برای این بخش آماده نیست</h2>
        <button
          onClick={onExit}
          className="btn-3d rounded-2xl bg-emerald-500 border-b-4 border-emerald-700 text-white px-6 py-3 font-black"
        >
          بازگشت
        </button>
      </div>
    );
  }

  // Duolingo-style Intermission Screen before Mistake-Retry Round
  if (retryIntermission) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center px-4 py-8 bg-[#f6f8fb]">
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-md rounded-[2.2rem] bg-white border-2 border-amber-200 p-7 shadow-xl text-center space-y-6"
        >
          <div className="w-24 h-24 mx-auto rounded-[2rem] bg-gradient-to-br from-amber-400 to-orange-500 border-b-4 border-orange-600 flex items-center justify-center text-5xl shadow-md">
            🔄
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-3 py-1 text-xs font-black">
              {retryIntermission.round === 1
                ? 'مرور اشتباهات این درس'
                : `دور ${retryIntermission.round} اصلاح اشتباهات`}
            </span>
            <h2 className="text-2xl font-black text-slate-800">
              وقت جبران اشتباهاته! 💪
            </h2>
            <p className="text-sm sm:text-base font-bold text-slate-600 leading-relaxed">
              توی این دور <strong className="text-orange-600">{retryIntermission.count} سوال غلط</strong> داشتی. بیا دوباره بزنیمشون تا همه رو درست حل کنی و بعد درس کامل بشه!
            </p>
          </div>

          <button
            type="button"
            onClick={startRetryRound}
            className="btn-3d w-full rounded-2xl bg-gradient-to-l from-amber-500 to-orange-500 border-b-4 border-orange-700 text-white py-4 font-black text-base hover:brightness-105 flex items-center justify-center gap-2 shadow-md"
          >
            <RotateCcw className="w-5 h-5" />
            بزن بریم! (شروع اصلاح {retryIntermission.count} اشتباه)
          </button>
        </motion.div>
      </div>
    );
  }

  // Celebration Screen
  if (finished) {
    const totalOriginal = exercises.length || 1;
    const accuracy = Math.min(100, Math.round((correctFirstTry / totalOriginal) * 100));
    const earnedXp = xpResult?.xpEarned ?? xpReward;
    const dailyXp = xpResult?.dailyXp ?? (user ? user.dailyXp : earnedXp);
    const dailyGoal = xpResult?.dailyGoal ?? (user ? user.dailyGoal : 50);
    const goalPct = Math.min(100, Math.round((dailyXp / Math.max(1, dailyGoal)) * 100));

    return (
      <div className="min-h-[85vh] flex items-center justify-center px-4 py-8">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-md rounded-[2.2rem] bg-white border-2 border-slate-200 p-7 shadow-xl text-center space-y-6"
        >
          <div className="w-24 h-24 mx-auto rounded-[2rem] bg-gradient-to-br from-amber-300 to-yellow-500 border-b-4 border-amber-600 flex items-center justify-center text-5xl shadow-md">
            🏆
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-800">آفرین! جلسه کامل شد 🎉</h2>
            <p className="text-sm font-bold text-slate-500">{title}</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-3.5">
              <div className="flex items-center justify-center gap-1 text-amber-600 font-black text-xs mb-1">
                <Zap className="w-4 h-4 fill-amber-500" />
                امتیاز کسب‌شده
              </div>
              <div className="font-de text-2xl font-black text-amber-700">+{earnedXp} XP</div>
            </div>
            <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-200 p-3.5">
              <div className="flex items-center justify-center gap-1 text-emerald-600 font-black text-xs mb-1">
                <Trophy className="w-4 h-4" />
                دقت پاسخ‌ها
              </div>
              <div className="font-de text-2xl font-black text-emerald-700">{accuracy}%</div>
            </div>
          </div>

          {/* Daily Goal Bar */}
          {user && (
            <div className="rounded-2xl bg-slate-50 border-2 border-slate-100 p-4 space-y-2.5 text-right">
              <div className="flex items-center justify-between text-xs font-extrabold">
                <span className="text-slate-600 flex items-center gap-1">
                  <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
                  هدف روزانه ({xpResult?.streakCount ?? user.streakCount} روز پیوسته)
                </span>
                <span className="font-de text-emerald-700">
                  {dailyXp} / {dailyGoal} XP
                </span>
              </div>
              <div className="h-3.5 rounded-full bg-slate-200 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${goalPct}%` }}
                  transition={{ duration: 0.7 }}
                  className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-green-500"
                />
              </div>
              {xpResult?.goalJustReached && (
                <p className="text-xs font-black text-emerald-600">
                  🎯 هدف امروزت کامل شد! عالی پیش میری!
                </p>
              )}
              {xpResult?.freezeUsed && (
                <p className="text-xs font-bold text-sky-600 flex items-center gap-1">
                  <Snowflake className="w-3.5 h-3.5" />
                  یک محافظ زنجیره دیروز از Streak تو محافظت کرد!
                </p>
              )}
              {xpResult?.freezeEarned && (
                <p className="text-xs font-black text-sky-600 flex items-center gap-1">
                  <Snowflake className="w-3.5 h-3.5" />
                  جایزه ۷ روز پیوسته: +۱ محافظ زنجیره رایگان هدیه گرفتی!
                </p>
              )}
            </div>
          )}

          {!user && (
            <div className="rounded-2xl bg-sky-50 border-2 border-sky-200 p-3.5 text-xs font-bold text-sky-800 space-y-2">
              <p>برای ذخیره دائمی XP، درصد تسلط گرامر و Streak وارد حسابت شو:</p>
              <button
                onClick={() => openAuthModal('برای ذخیره XP و پیشرفتت وارد حسابت شو')}
                className="btn-3d rounded-xl bg-sky-500 border-b-2 border-sky-700 text-white px-4 py-1.5 font-black text-xs"
              >
                ورود / ثبت‌نام رایگان
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setFinished(false);
                setCurrentIdx(Math.max(0, queue.length - 1));
              }}
              className="btn-3d w-full rounded-2xl bg-indigo-50 border-2 border-indigo-200 border-b-4 text-indigo-700 py-3 font-black text-sm flex items-center justify-center gap-2 hover:bg-indigo-100"
            >
              <Eye className="w-4 h-4" />
              مرور سوال‌ها و توضیحات این جلسه
            </button>
            {onSecondaryAction && secondaryActionLabel && (
              <button
                onClick={onSecondaryAction}
                disabled={submittingFinish}
                className="btn-3d w-full rounded-2xl bg-violet-500 border-b-4 border-violet-700 text-white py-3.5 font-black text-sm flex items-center justify-center gap-2 hover:bg-violet-400 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {secondaryActionLabel}
              </button>
            )}
            <button
              onClick={onExit}
              disabled={submittingFinish}
              className="btn-3d w-full rounded-2xl bg-emerald-500 border-b-4 border-emerald-700 text-white py-3.5 font-black text-base hover:bg-emerald-400 disabled:opacity-50"
            >
              ادامه و بازگشت
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f6f8fb]">
      {/* Sticky Top Progress Header */}
      <header className="sticky top-0 z-30 pt-safe-header bg-white/95 backdrop-blur-md border-b-2 border-slate-100">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center gap-3">
          <button
            onClick={onExit}
            aria-label="خروج از تمرین"
            className="w-10 h-10 rounded-2xl border-2 border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 flex items-center justify-center shrink-0 transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex-1 space-y-1 min-w-0">
            <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-400">
              <span className="truncate max-w-[60%]">{title}</span>
              <span className={roundPositionInfo.round > 0 ? 'text-orange-600 font-black' : 'font-de'}>
                {roundPositionInfo.round > 0
                  ? `🔄 اصلاح اشتباه ${roundPositionInfo.pos} از ${roundPositionInfo.total}`
                  : `${roundPositionInfo.pos} / ${roundPositionInfo.total}`}
              </span>
            </div>
            <div className="h-3.5 rounded-full bg-slate-200 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${
                  roundPositionInfo.round > 0
                    ? 'bg-gradient-to-l from-amber-400 to-orange-500'
                    : 'bg-gradient-to-l from-emerald-400 to-green-500'
                }`}
                animate={{ width: `${Math.max(5, progressPct)}%` }}
                transition={{ duration: 0.35 }}
              />
            </div>
          </div>

          {/* Back / Forward Question History Controls */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={currentIdx === 0}
              onClick={() => navigateToIdx(currentIdx - 1)}
              title="مشاهده سوال قبلی"
              aria-label="سوال قبلی"
              className="w-9 h-9 rounded-xl border-2 border-slate-200 bg-white text-slate-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 flex items-center justify-center transition disabled:opacity-35 disabled:pointer-events-none"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              type="button"
              disabled={currentIdx >= furthestIdx}
              onClick={() => navigateToIdx(currentIdx + 1)}
              title="رفتن به سوال بعدی"
              aria-label="سوال بعدی"
              className="w-9 h-9 rounded-xl border-2 border-slate-200 bg-white text-slate-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 flex items-center justify-center transition disabled:opacity-35 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1 rounded-2xl bg-amber-50 border-2 border-amber-200 px-2.5 py-1 text-xs font-black text-amber-600 shrink-0">
            <Zap className="w-3.5 h-3.5 fill-amber-500" />
            <span className="font-de">+{xpReward}</span>
          </div>
        </div>
      </header>

      {/* Main Exercise Area */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 pt-5 pb-48">
        {isReviewingPast && (
          <div className="mb-4 rounded-2xl bg-indigo-50 border-2 border-indigo-200 px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-black text-indigo-800">
              <Eye className="w-4 h-4 text-indigo-600 shrink-0" />
              مرور سوال {currentIdx + 1} (فقط نمایش پاسخ و توضیح)
            </span>
            {currentIdx < furthestIdx ? (
              <button
                type="button"
                onClick={() => navigateToIdx(furthestIdx)}
                className="rounded-xl bg-indigo-600 text-white px-3 py-1 text-xs font-black hover:bg-indigo-500 transition"
              >
                برگشت به سوال فعلی ({furthestIdx + 1}) ←
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setFinished(true)}
                className="rounded-xl bg-emerald-600 text-white px-3 py-1 text-xs font-black hover:bg-emerald-500 transition"
              >
                بازگشت به نتیجه جلسه ←
              </button>
            )}
          </div>
        )}
        {currentItem.isRetry && (
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-2xl bg-orange-100 border border-orange-300 text-orange-900 px-3.5 py-1.5 text-xs sm:text-sm font-black">
            <RotateCcw className="w-4 h-4 text-orange-600" />
            <span>
              اشتباه قبلی ({currentItem.retryRound === 1 ? 'دور اصلاح' : `دور ${currentItem.retryRound}`}) — این بار درست جواب بده تا از لیست حذف بشه!
            </span>
          </div>
        )}

        {subtitle && !currentItem.isRetry && (
          <div className="mb-2 text-xs font-extrabold text-slate-400 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
            <span>{subtitle}</span>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={`${current.id}-${currentIdx}`}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            {/* 1. WORD BANK */}
            {current.type === 'word-bank' && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs font-black">
                    🧩 جمله‌سازی آلمانی
                  </span>
                  <h2 className="text-lg sm:text-xl font-black text-slate-800 leading-relaxed">
                    این جمله را به آلمانی بساز:
                  </h2>
                </div>

                <div className="rounded-3xl bg-white border-2 border-slate-200 p-5 shadow-xs space-y-2">
                  <p className="text-base sm:text-lg font-extrabold text-slate-800 leading-relaxed">
                    «{current.promptFa}»
                  </p>
                  {current.hintDe && (
                    <p className="text-xs font-bold text-slate-400">
                      راهنما:{' '}
                      <span className="font-de text-emerald-600" dir="ltr">
                        {current.hintDe}
                      </span>
                    </p>
                  )}
                </div>

                {/* Reorderable Answer Tray (Hold & Drag to reorder, Tap to remove) */}
                <DraggableWordTray
                  selectedTokenIndices={selectedTokenIndices}
                  activeTokens={activeTokens}
                  status={status}
                  placeholderFa="روی کلمات زیر بزن تا جمله آلمانی ساخته شود..."
                  onChangeOrder={setSelectedTokenIndices}
                />

                {/* Word Bank Chips (Speaks each German word on tap!) */}
                <div dir="ltr" className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  {activeTokens.map((tok, i) => {
                    const used = selectedTokenIndices.includes(i);
                    return (
                      <button
                        key={`bank-${i}`}
                        type="button"
                        disabled={used || status !== 'idle'}
                        onClick={() => {
                          speakGerman(tok, 0.98);
                          setSelectedTokenIndices((prev) => [...prev, i]);
                        }}
                        className={`btn-3d font-de rounded-2xl border-2 border-b-4 px-4 py-2.5 text-sm sm:text-base font-extrabold transition ${
                          used
                            ? 'bg-slate-200 border-slate-200 text-transparent select-none pointer-events-none'
                            : 'bg-white border-slate-200 border-b-slate-300 text-slate-800 hover:border-sky-300 hover:bg-sky-50/50'
                        }`}
                      >
                        {tok}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. GRAMMAR CLOZE */}
            {current.type === 'grammar-cloze' && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1 rounded-xl bg-violet-100 text-violet-700 px-2.5 py-1 text-xs font-black">
                    📐 جای خالی گرامری
                  </span>
                  <h2 className="text-lg sm:text-xl font-black text-slate-800">
                    {current.instructionFa}
                  </h2>
                </div>

                {(current.sentenceBefore || current.sentenceAfter) && (
                  <div className="rounded-3xl bg-white border-2 border-slate-200 p-5 sm:p-6 shadow-xs space-y-3">
                    <div
                      dir="ltr"
                      className="font-de text-xl sm:text-2xl font-black text-slate-900 leading-loose text-left"
                    >
                      <span>{current.sentenceBefore}</span>
                      <span
                        className={`inline-block min-w-[76px] text-center mx-1.5 px-3 py-0.5 rounded-xl border-2 align-baseline transition ${
                          status === 'correct'
                            ? 'bg-emerald-100 border-emerald-500 text-emerald-800'
                            : status === 'wrong'
                              ? 'bg-rose-100 border-rose-500 text-rose-800'
                              : selectedOption
                                ? 'bg-violet-100 border-violet-400 text-violet-900'
                                : 'bg-slate-100 border-dashed border-slate-400 text-slate-400'
                        }`}
                      >
                        {selectedOption || '_____'}
                      </span>
                      <span>{current.sentenceAfter}</span>
                    </div>

                    {current.translationFa && (
                      <p className="text-base font-bold text-slate-600 border-t border-slate-100 pt-3 leading-relaxed">
                        {current.translationFa}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {current.options.map((opt, idx) => {
                    const isSelected = selectedOption === opt;
                    const isAnswer = opt === current.answer;
                    let cls =
                      'bg-white border-slate-200 border-b-slate-300 text-slate-800 hover:border-violet-300 hover:bg-violet-50/40';
                    if (status !== 'idle') {
                      if (isAnswer) {
                        cls = 'bg-emerald-50 border-emerald-500 border-b-emerald-600 text-emerald-800';
                      } else if (isSelected && !isAnswer) {
                        cls = 'bg-rose-50 border-rose-500 border-b-rose-600 text-rose-800';
                      } else {
                        cls = 'bg-slate-50 border-slate-200 text-slate-400 opacity-70';
                      }
                    } else if (isSelected) {
                      cls = 'bg-violet-50 border-violet-500 border-b-violet-600 text-violet-900 ring-2 ring-violet-200';
                    }

                    const isGermanOpt = /[a-zA-ZäöüßÄÖÜ]/.test(opt);
                    return (
                      <button
                        key={`${opt}-${idx}`}
                        type="button"
                        disabled={status !== 'idle'}
                        onClick={() => {
                          setSelectedOption(opt);
                          if (isGermanOpt) speakGerman(opt, 0.98);
                        }}
                        dir={isGermanOpt ? 'ltr' : 'rtl'}
                        className={`btn-3d rounded-2xl border-2 border-b-4 px-4 py-4 text-base font-extrabold transition flex items-center justify-between gap-2 ${
                          isGermanOpt ? 'font-de text-left' : 'text-right'
                        } ${cls}`}
                      >
                        <span className="flex-1">{opt}</span>
                        <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-xs font-black flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. LISTENING */}
            {current.type === 'listening' && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1 rounded-xl bg-sky-100 text-sky-700 px-2.5 py-1 text-xs font-black">
                    🎧 تمرین شنیداری
                  </span>
                  <h2 className="text-lg sm:text-xl font-black text-slate-800">
                    گوش بده و چیزی که می‌شنوی را بساز:
                  </h2>
                </div>

                {/* Big Audio Controls: Normal + Turtle Slow */}
                <div className="flex items-center justify-center gap-4 py-3">
                  <button
                    type="button"
                    onClick={() => speakGerman(current.audioDe, 0.92)}
                    className="btn-3d w-24 h-24 rounded-3xl bg-sky-500 border-b-4 border-sky-700 text-white shadow-md flex flex-col items-center justify-center gap-1 hover:bg-sky-400"
                  >
                    <Volume2 className="w-9 h-9" />
                    <span className="text-xs font-black">پخش عادی</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => speakGerman(current.audioDe, 0.6)}
                    className="btn-3d w-20 h-20 rounded-3xl bg-teal-50 border-2 border-teal-300 border-b-4 text-teal-700 shadow-xs flex flex-col items-center justify-center gap-0.5 hover:bg-teal-100"
                  >
                    <span className="text-2xl">🐢</span>
                    <span className="text-[11px] font-black">آهسته</span>
                  </button>
                </div>

                {current.mode === 'word-bank' ? (
                  <>
                    <DraggableWordTray
                      selectedTokenIndices={selectedTokenIndices}
                      activeTokens={activeTokens}
                      status={status}
                      placeholderFa="کلمات شنیده‌شده را به ترتیب انتخاب کن..."
                      onChangeOrder={setSelectedTokenIndices}
                    />

                    <div dir="ltr" className="flex flex-wrap items-center justify-center gap-2.5">
                      {activeTokens.map((tok, i) => {
                        const used = selectedTokenIndices.includes(i);
                        return (
                          <button
                            key={`lbank-${i}`}
                            type="button"
                            disabled={used || status !== 'idle'}
                            onClick={() => {
                              speakGerman(tok, 0.98);
                              setSelectedTokenIndices((prev) => [...prev, i]);
                            }}
                            className={`btn-3d font-de rounded-2xl border-2 border-b-4 px-4 py-2.5 text-sm sm:text-base font-extrabold ${
                              used
                                ? 'bg-slate-200 border-slate-200 text-transparent select-none pointer-events-none'
                                : 'bg-white border-slate-200 border-b-slate-300 text-slate-800 hover:border-sky-300'
                            }`}
                          >
                            {tok}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <input
                      ref={inputRef}
                      type="text"
                      dir="ltr"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={status !== 'idle'}
                      value={typedText}
                      onChange={(e) => setTypedText(e.target.value)}
                      placeholder="جمله آلمانی شنیده‌شده را اینجا تایپ کن..."
                      className="font-de w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-4 text-base font-bold text-left focus:border-sky-500 focus:outline-none disabled:bg-slate-50"
                    />
                    <div dir="ltr" className="flex items-center justify-center gap-1.5 flex-wrap">
                      {GERMAN_CHARS.map((ch) => (
                        <button
                          key={ch}
                          type="button"
                          disabled={status !== 'idle'}
                          onClick={() => insertGermanChar(ch)}
                          className="btn-3d font-de w-10 h-10 rounded-xl bg-white border-2 border-slate-200 border-b-4 text-slate-700 font-black text-base hover:bg-sky-50 hover:border-sky-300"
                        >
                          {ch}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. TYPING */}
            {current.type === 'typing' && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1 rounded-xl bg-indigo-100 text-indigo-700 px-2.5 py-1 text-xs font-black">
                    ⌨️ تمرین نوشتاری
                  </span>
                  <h2 className="text-lg sm:text-xl font-black text-slate-800">
                    {current.promptFa}
                  </h2>
                </div>

                {(current.sentenceBefore || current.sentenceAfter) && (
                  <div
                    dir="ltr"
                    className="rounded-3xl bg-white border-2 border-slate-200 p-5 font-de text-lg font-extrabold text-slate-800 leading-loose text-left"
                  >
                    <span>{current.sentenceBefore}</span>
                    <span className="inline-block min-w-[70px] border-b-2 border-indigo-400 mx-1.5 text-center text-indigo-600">
                      {typedText || '____'}
                    </span>
                    <span>{current.sentenceAfter}</span>
                  </div>
                )}

                {current.hintDe && (
                  <div className="text-xs font-bold text-slate-500 bg-slate-100 rounded-xl px-3.5 py-2 inline-block">
                    💡 راهنما:{' '}
                    <span className="font-de text-indigo-700 font-extrabold" dir="ltr">
                      {current.hintDe}
                    </span>
                  </div>
                )}

                <div className="space-y-3">
                  <input
                    ref={inputRef}
                    type="text"
                    dir="ltr"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={status !== 'idle'}
                    value={typedText}
                    onChange={(e) => setTypedText(e.target.value)}
                    placeholder="پاسخ آلمانی را تایپ کن..."
                    className={`font-de w-full rounded-2xl border-2 px-4 py-4 text-base sm:text-lg font-bold text-left focus:outline-none transition ${
                      status === 'correct'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                        : status === 'wrong'
                          ? 'bg-rose-50 border-rose-500 text-rose-900'
                          : 'bg-white border-slate-300 focus:border-indigo-500'
                    }`}
                  />

                  {/* German Umlaut Helper Keyboard */}
                  <div dir="ltr" className="flex items-center justify-center gap-2 flex-wrap">
                    {GERMAN_CHARS.map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        disabled={status !== 'idle'}
                        onClick={() => insertGermanChar(ch)}
                        className="btn-3d font-de w-11 h-11 rounded-xl bg-white border-2 border-slate-200 border-b-4 text-slate-800 font-black text-base hover:bg-indigo-50 hover:border-indigo-300 disabled:opacity-50"
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 5. SPEAKING */}
            {current.type === 'speaking' && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1 rounded-xl bg-rose-100 text-rose-700 px-2.5 py-1 text-xs font-black">
                    🎤 تمرین مکالمه و تلفظ
                  </span>
                  <h2 className="text-lg sm:text-xl font-black text-slate-800">
                    {current.promptFa}
                  </h2>
                </div>

                <div className="rounded-3xl bg-white border-2 border-slate-200 p-5 sm:p-6 shadow-xs space-y-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => speakGerman(current.targetDe, 0.88)}
                      className="btn-3d w-12 h-12 rounded-2xl bg-sky-100 border-b-2 border-sky-300 text-sky-600 flex items-center justify-center shrink-0 hover:bg-sky-200"
                      title="گوش دادن به تلفظ نمونه"
                    >
                      <Volume2 className="w-6 h-6" />
                    </button>
                    <div className="flex-1 space-y-1.5">
                      <p
                        dir="ltr"
                        className="font-de text-lg sm:text-xl font-black text-slate-800 text-left leading-relaxed"
                      >
                        {current.targetDe}
                      </p>
                      <p className="text-sm font-bold text-slate-500">{current.translationFa}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-4 pt-2">
                  {micMode !== 'none' ? (
                    <button
                      type="button"
                      disabled={status !== 'idle' || isEvaluatingSpeech}
                      onClick={() => void toggleMicrophone()}
                      className={`btn-3d w-full max-w-xs rounded-3xl border-b-4 py-4 px-6 font-black text-base flex items-center justify-center gap-2.5 transition ${
                        isEvaluatingSpeech
                          ? 'bg-indigo-500 border-indigo-700 text-white'
                          : isListeningMic
                            ? 'bg-rose-500 border-rose-700 text-white animate-pulse'
                            : 'bg-sky-500 border-sky-700 text-white hover:bg-sky-400 disabled:opacity-50'
                      }`}
                    >
                      {isEvaluatingSpeech ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          در حال بررسی تلفظ تو...
                        </>
                      ) : isListeningMic ? (
                        micMode === 'recorder' ? (
                          <>
                            <Square className="w-4 h-4 fill-white" />
                            در حال ضبط... (تموم شد بزن)
                          </>
                        ) : (
                          <>
                            <MicOff className="w-5 h-5" />
                            در حال گوش دادن... (برای توقف بزن)
                          </>
                        )
                      ) : (
                        <>
                          <Mic className="w-5 h-5" />
                          بزن و به آلمانی بخوان
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-3.5 text-xs font-bold text-amber-800 text-center max-w-sm">
                      مرورگر فعلی دسترسی میکروفون ندارد. می‌توانی تلفظش را گوش کنی، با صدای بلند تکرار کنی و دکمه زیر را بزنی.
                    </div>
                  )}

                  {spokenText && (
                    <div className="rounded-2xl bg-white border-2 border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 max-w-sm text-center space-y-1">
                      <span className="text-xs text-slate-400 block">چیزی که شنیده شد:</span>
                      <span className="font-de text-slate-800 block" dir="ltr">
                        «{spokenText}»
                      </span>
                      {speechFeedbackFa && status === 'correct' && (
                        <span className="text-xs font-extrabold text-emerald-600 block">
                          {speechFeedbackFa}
                        </span>
                      )}
                    </div>
                  )}

                  {micError && (
                    <p className="text-xs font-bold text-rose-600 text-center max-w-sm">{micError}</p>
                  )}

                  {status === 'idle' && (
                    <button
                      type="button"
                      onClick={handleSkipSpeaking}
                      className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-400 hover:text-slate-700 py-2 px-3 rounded-xl hover:bg-slate-100 transition"
                    >
                      <SkipForward className="w-4 h-4" />
                      الان نمی‌تونم حرف بزنم (رد کردن بدون جریمه)
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 6. MATCH PAIRS */}
            {current.type === 'match-pairs' && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1 rounded-xl bg-amber-100 text-amber-800 px-2.5 py-1 text-xs font-black">
                    ⚡ تطبیق سریع جفت‌ها
                  </span>
                  <h2 className="text-lg sm:text-xl font-black text-slate-800">
                    {current.promptFa}
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Persian column (Right in RTL) */}
                  <div className="space-y-2.5">
                    {matchRightOrder.map((item) => {
                      const isMatched = matchedIds.has(item.id);
                      const isSelected = selectedRightId === item.id;
                      const isWrong = wrongFlashPair?.right === item.id;
                      return (
                        <button
                          key={`r-${item.id}`}
                          type="button"
                          disabled={isMatched || status !== 'idle'}
                          onClick={() => handlePairSelect('right', item.id)}
                          className={`btn-3d w-full min-h-[58px] rounded-2xl border-2 border-b-4 px-3 py-2.5 text-sm font-extrabold text-center transition ${
                            isMatched
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-400 opacity-50'
                              : isWrong
                                ? 'bg-rose-100 border-rose-500 text-rose-800'
                                : isSelected
                                  ? 'bg-sky-50 border-sky-500 text-sky-900 ring-2 ring-sky-200'
                                  : 'bg-white border-slate-200 border-b-slate-300 text-slate-800 hover:border-sky-300'
                          }`}
                        >
                          {item.fa}
                        </button>
                      );
                    })}
                  </div>

                  {/* German column (Left in RTL) */}
                  <div className="space-y-2.5" dir="ltr">
                    {matchLeftOrder.map((item) => {
                      const isMatched = matchedIds.has(item.id);
                      const isSelected = selectedLeftId === item.id;
                      const isWrong = wrongFlashPair?.left === item.id;
                      return (
                        <button
                          key={`l-${item.id}`}
                          type="button"
                          disabled={isMatched || status !== 'idle'}
                          onClick={() => handlePairSelect('left', item.id)}
                          className={`btn-3d font-de w-full min-h-[58px] rounded-2xl border-2 border-b-4 px-3 py-2.5 text-sm font-extrabold text-center transition ${
                            isMatched
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-400 opacity-50'
                              : isWrong
                                ? 'bg-rose-100 border-rose-500 text-rose-800'
                                : isSelected
                                  ? 'bg-sky-50 border-sky-500 text-sky-900 ring-2 ring-sky-200'
                                  : 'bg-white border-slate-200 border-b-slate-300 text-slate-800 hover:border-sky-300'
                          }`}
                        >
                          {item.de}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {guideHint && status === 'idle' && (
              <div className="rounded-2xl bg-slate-100/80 border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-500">
                💡 {guideHint}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Sticky Bottom Action & Feedback Bar */}
      <footer
        className={`fixed bottom-0 inset-x-0 z-30 border-t-2 transition-colors ${
          status === 'correct'
            ? 'bg-emerald-50 border-emerald-200'
            : status === 'wrong'
              ? 'bg-rose-50 border-rose-200'
              : status === 'skipped'
                ? 'bg-sky-50 border-sky-200'
                : 'bg-white border-slate-200'
        }`}
      >
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-safe-bar space-y-3">
          {status !== 'idle' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {status === 'correct' ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                  ) : status === 'skipped' ? (
                    <SkipForward className="w-6 h-6 text-sky-600 shrink-0" />
                  ) : (
                    <XCircle className="w-6 h-6 text-rose-600 shrink-0" />
                  )}
                  <span
                    className={`font-black text-base ${
                      status === 'correct'
                        ? 'text-emerald-800'
                        : status === 'skipped'
                          ? 'text-sky-800'
                          : 'text-rose-800'
                    }`}
                  >
                    {status === 'correct'
                      ? minorTypoNote
                        ? 'درسته! (حواست به اوملاوت/املا هم باشه 👍)'
                        : 'عالی! دقیقاً درسته 🎉'
                      : status === 'skipped'
                        ? 'رد شد — ادامه بده!'
                        : 'اشکالی نداره، یادش می‌گیری:'}
                  </span>
                </div>

                {correctDisplay && /[a-zA-ZäöüßÄÖÜ]/.test(correctDisplay) && (
                  <button
                    type="button"
                    onClick={() => speakGerman(correctDisplay, 0.9)}
                    className="inline-flex items-center gap-1 rounded-xl bg-white/80 border border-slate-200 px-2.5 py-1 text-xs font-extrabold text-slate-700 hover:bg-white shrink-0"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-sky-600" />
                    تلفظ
                  </button>
                )}
              </div>

              {status === 'wrong' && correctDisplay && (
                <div
                  dir="ltr"
                  className="font-de text-sm sm:text-base font-black text-rose-900 bg-white/75 rounded-xl px-3 py-1.5 text-left"
                >
                  {correctDisplay}
                </div>
              )}

              {current.explanationFa && (
                <p
                  className={`text-sm sm:text-base font-bold leading-relaxed ${
                    status === 'correct'
                      ? 'text-emerald-800'
                      : status === 'skipped'
                        ? 'text-sky-800'
                        : 'text-rose-800'
                  }`}
                >
                  💡 {current.explanationFa}
                </p>
              )}
              {status === 'wrong' && !isReviewingPast && (
                <p className="text-xs font-extrabold text-rose-700 flex items-center gap-1 pt-0.5">
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  این سوال آخر همین دور دوباره میاد تا درستش رو بزنی و کامل یاد بگیری!
                </p>
              )}
            </motion.div>
          )}

          {status === 'idle' ? (
            current.type !== 'match-pairs' ? (
              <button
                type="button"
                disabled={!canCheck}
                onClick={handleCheck}
                className="btn-3d w-full rounded-2xl bg-emerald-500 border-b-4 border-emerald-700 text-white py-3.5 font-black text-base hover:bg-emerald-400 disabled:bg-slate-200 disabled:border-slate-300 disabled:text-slate-400 transition"
              >
                بررسی پاسخ
              </button>
            ) : (
              <div className="text-center text-xs font-extrabold text-slate-400 py-2">
                تمام جفت‌ها را به هم وصل کن تا خودکار ثبت شود ⚡
              </div>
            )
          ) : isReviewingPast ? (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={currentIdx === 0}
                onClick={() => navigateToIdx(currentIdx - 1)}
                className="btn-3d rounded-2xl bg-white border-2 border-slate-300 border-b-4 text-slate-700 px-4 py-3.5 font-black text-sm flex items-center justify-center gap-1.5 hover:bg-slate-50 disabled:opacity-40"
              >
                <ArrowRight className="w-4 h-4" />
                <span>قبلی</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  currentIdx < furthestIdx ? navigateToIdx(currentIdx + 1) : setFinished(true)
                }
                className="btn-3d flex-1 rounded-2xl bg-indigo-600 border-b-4 border-indigo-800 text-white py-3.5 font-black text-base flex items-center justify-center gap-2 hover:bg-indigo-500"
              >
                <span>
                  {currentIdx + 1 === furthestIdx
                    ? `ادامه از سوال فعلی (${furthestIdx + 1})`
                    : currentIdx < furthestIdx
                      ? 'سوال بعدی'
                      : 'بازگشت به نتیجه جلسه'}
                </span>
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleContinue}
              className={`btn-3d w-full rounded-2xl border-b-4 text-white py-3.5 font-black text-base flex items-center justify-center gap-2 transition ${
                status === 'wrong'
                  ? 'bg-rose-500 border-rose-700 hover:bg-rose-400'
                  : status === 'skipped'
                    ? 'bg-sky-500 border-sky-700 hover:bg-sky-400'
                    : 'bg-emerald-500 border-emerald-700 hover:bg-emerald-400'
              }`}
            >
              <span>
                {currentIdx + 1 < queue.length
                  ? queue[currentIdx + 1]?.retryRound > currentItem.retryRound
                    ? 'شروع اصلاح اشتباهات 🔄'
                    : 'سوال بعدی'
                  : 'اتمام و دریافت XP'}
              </span>
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
