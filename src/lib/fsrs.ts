import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs';

const scheduler = fsrs({
  request_retention: 0.9,
  enable_fuzz: true,
});

export function computeNextFsrs(
  existingState: unknown,
  outcome: 'know' | 'practice'
): {
  nextCard: Card;
  dueAt: Date;
  reps: number;
  lapses: number;
} {
  const now = new Date();
  let card: Card;

  if (existingState && typeof existingState === 'object' && 'due' in existingState) {
    const raw = existingState as Record<string, unknown>;
    card = {
      ...(raw as unknown as Card),
      due: new Date(raw.due as string),
      last_review: raw.last_review ? new Date(raw.last_review as string) : undefined,
    };
  } else {
    card = createEmptyCard(now);
  }

  const grade = outcome === 'know' ? Rating.Good : Rating.Again;
  const result = scheduler.next(card, now, grade);

  return {
    nextCard: result.card,
    dueAt: result.card.due,
    reps: result.card.reps,
    lapses: result.card.lapses,
  };
}

export function isCardMastered(reps: number, quizCorrect: number, stability?: number): boolean {
  if (reps >= 2 && quizCorrect >= 1) return true;
  if (reps >= 3) return true;
  if (typeof stability === 'number' && stability >= 6) return true;
  return false;
}
