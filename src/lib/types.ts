export interface WordCard {
  id: number;
  deckCardId?: number;
  word: string;
  article: 'der' | 'die' | 'das' | null;
  plural: string | null;
  partOfSpeech: string;
  verbForms: string | null;
  persianMeaning: string;
  englishMeaning: string;
  exampleDe: string;
  exampleFa: string;
  level: string | null;
  starred?: boolean;
  progress?: {
    leitnerBox: number;
    reps: number;
    lapses: number;
    quizCorrect: number;
    quizWrong: number;
    mastered: boolean;
    dueAt: string;
  } | null;
}

export interface StageCounts {
  new: number;
  learning: number;
  familiar: number;
  learned: number;
  mastered: number;
}

export interface DeckSummary {
  id: number;
  slug: string | null;
  title: string;
  titleDe: string;
  description: string;
  level: string;
  icon: string;
  color: string;
  isSystem: boolean;
  cardCount: number;
  masteredCount: number;
  nounCount: number;
  dueCount: number;
  stageCounts: StageCounts;
}

export interface AppUser {
  id: number;
  email: string;
  name: string;
  showEnglish: boolean;
  streakCount: number;
  lastStudiedDate: string | null;
  totalXp: number;
  dailyXp: number;
  dailyXpDate: string | null;
  dailyGoal: number;
  streakFreezes: number;
}

export function getArticleStyle(article: string | null) {
  switch (article) {
    case 'der':
      return {
        label: 'der',
        badgeBg: 'bg-sky-500 text-white',
        softBg: 'bg-sky-50 border-sky-200',
        text: 'text-sky-600',
        ring: 'border-sky-400',
        bar: 'bg-sky-500',
      };
    case 'die':
      return {
        label: 'die',
        badgeBg: 'bg-rose-500 text-white',
        softBg: 'bg-rose-50 border-rose-200',
        text: 'text-rose-600',
        ring: 'border-rose-400',
        bar: 'bg-rose-500',
      };
    case 'das':
      return {
        label: 'das',
        badgeBg: 'bg-emerald-500 text-white',
        softBg: 'bg-emerald-50 border-emerald-200',
        text: 'text-emerald-600',
        ring: 'border-emerald-400',
        bar: 'bg-emerald-500',
      };
    default:
      return {
        label: '',
        badgeBg: 'bg-amber-500 text-white',
        softBg: 'bg-amber-50 border-amber-200',
        text: 'text-amber-600',
        ring: 'border-amber-300',
        bar: 'bg-amber-400',
      };
  }
}

export function formatGermanDisplay(card: Pick<WordCard, 'article' | 'word'>): string {
  return card.article ? `${card.article} ${card.word}` : card.word;
}
