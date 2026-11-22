export type MasteryStage = 'new' | 'learning' | 'familiar' | 'learned' | 'mastered';

// Leitner box intervals in days:
// Box 0: New (not started)
// Box 1: Still learning -> review in 1 day
// Box 2: Still learning -> review in 2 days
// Box 3: Familiar       -> review in 4 days
// Box 4: Learned        -> review in 7 days
// Box 5: Mastered       -> review in 14 days
// Box 6: Mastered+      -> review in 30 days
export const LEITNER_INTERVAL_DAYS = [0, 1, 2, 4, 7, 14, 30] as const;

export interface StageMeta {
  key: MasteryStage;
  label: string;
  shortLabel: string;
  barClass: string;
  pillClass: string;
  dotClass: string;
  textClass: string;
}

export const STAGE_META: Record<MasteryStage, StageMeta> = {
  new: {
    key: 'new',
    label: 'جدید',
    shortLabel: 'جدید',
    barClass: 'bg-slate-200',
    pillClass: 'bg-slate-100 text-slate-600 border-slate-200',
    dotClass: 'bg-slate-400',
    textClass: 'text-slate-500',
  },
  learning: {
    key: 'learning',
    label: 'در حال یادگیری',
    shortLabel: 'در حال یادگیری',
    barClass: 'bg-amber-400',
    pillClass: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-600',
  },
  familiar: {
    key: 'familiar',
    label: 'آشنا',
    shortLabel: 'آشنا',
    barClass: 'bg-sky-400',
    pillClass: 'bg-sky-50 text-sky-700 border-sky-200',
    dotClass: 'bg-sky-500',
    textClass: 'text-sky-600',
  },
  learned: {
    key: 'learned',
    label: 'حفظ‌شده',
    shortLabel: 'حفظ‌شده',
    barClass: 'bg-emerald-500',
    pillClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-600',
  },
  mastered: {
    key: 'mastered',
    label: 'مسلط 🏆',
    shortLabel: 'مسلط',
    barClass: 'bg-violet-500',
    pillClass: 'bg-violet-50 text-violet-700 border-violet-200',
    dotClass: 'bg-violet-500',
    textClass: 'text-violet-600',
  },
};

export const STAGE_ORDER: MasteryStage[] = [
  'new',
  'learning',
  'familiar',
  'learned',
  'mastered',
];

export function getStageFromBox(box: number | null | undefined): MasteryStage {
  const b = Math.max(0, Math.floor(box || 0));
  if (b === 0) return 'new';
  if (b <= 2) return 'learning';
  if (b === 3) return 'familiar';
  if (b === 4) return 'learned';
  return 'mastered';
}

export function isCardDue(box: number | null | undefined, dueAt: string | Date | null | undefined): boolean {
  const b = Math.max(0, Math.floor(box || 0));
  if (b === 0 || !dueAt) return false;
  const dueTime = dueAt instanceof Date ? dueAt.getTime() : new Date(dueAt).getTime();
  if (Number.isNaN(dueTime)) return false;
  return dueTime <= Date.now();
}

export function advanceLeitner(
  currentBox: number,
  currentDueAt: Date | null,
  correct: boolean,
  now: Date = new Date()
): {
  nextBox: number;
  nextDueAt: Date;
  promoted: boolean;
  mastered: boolean;
} {
  const box = Math.max(0, Math.min(6, Math.floor(currentBox || 0)));
  const DAY_MS = 24 * 60 * 60 * 1000;

  if (!correct) {
    // Gentle Leitner demotion: move back 1 box (minimum box 1 = Still Learning), review tomorrow
    const nextBox = box <= 1 ? 1 : box - 1;
    const nextDueAt = new Date(now.getTime() + 1 * DAY_MS);
    return {
      nextBox,
      nextDueAt,
      promoted: false,
      mastered: nextBox >= 5,
    };
  }

  // Correct answer:
  // Promote if New (box === 0) OR card's review date has arrived (dueAt <= now)
  const isDueNow = box === 0 || !currentDueAt || currentDueAt.getTime() <= now.getTime();
  if (isDueNow) {
    const nextBox = Math.min(6, box + 1);
    const intervalDays = LEITNER_INTERVAL_DAYS[nextBox] ?? 14;
    const nextDueAt = new Date(now.getTime() + intervalDays * DAY_MS);
    return {
      nextBox,
      nextDueAt,
      promoted: true,
      mastered: nextBox >= 5,
    };
  }

  // Practiced ahead of schedule on the same day -> keep current box & due date (prevents gaming)
  return {
    nextBox: box,
    nextDueAt: currentDueAt,
    promoted: false,
    mastered: box >= 5,
  };
}

export function formatNextReviewFa(
  box: number | null | undefined,
  dueAt: string | Date | null | undefined
): string | null {
  const b = Math.max(0, Math.floor(box || 0));
  if (b === 0 || !dueAt) return null;
  const dueMs = dueAt instanceof Date ? dueAt.getTime() : new Date(dueAt).getTime();
  if (Number.isNaN(dueMs)) return null;

  const diffMs = dueMs - Date.now();
  if (diffMs <= 0) return 'امروز نوبت مروره 🔥';

  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 1) return 'مرور بعدی: فردا';
  return `مرور بعدی: ${days} روز دیگر`;
}
