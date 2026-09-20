export type DecoctType = 'normal' | 'first' | 'last';

export interface PrescriptionItem {
  herb: string;
  grams: number;
  decoct: DecoctType;
}

export interface Prescription {
  id: string;
  items: PrescriptionItem[];
}

export interface WeighResult {
  herb: string;
  target: number;
  actual: number;
  ok: boolean;
  deltaG: number;
}

export interface HerbAttempt {
  herb: string;
  target: number;
  actual: number;
  tolerance: number;
  ok: boolean;
}

export interface LevelFinishSummary {
  timestamp: number;
  level: number;
  mode: 'normal' | 'endless';
  passed: boolean;
  timeout: boolean;
  /** 本关新增得分 */
  scoreGained: number;
  /** 通关后本局累计总分 */
  totalScore: number;
  durationMs: number;
  review: { herb: string; correct: boolean } | null;
  attempts: HerbAttempt[];
}

export interface GameState {
  level: number;
  score: number;
  combo: number;
  queue: number;
  satisfaction: number;
  expired: boolean;
}

export interface LevelConfig {
  level: number;
  herbCount: number;
  tolerance: number;
  timeLimit: number | null;
  hasSimilarHerbs: boolean;
  requireTare: boolean;
  requireOrganize: boolean;
  enableDecoctSplit: boolean;
}

export interface ScoreBreakdown {
  base: number;
  precisionBonus: number;
  comboBonus: number;
  timePenalty: number;
  total: number;
}

export type GamePhase = 'menu' | 'history' | 'playing' | 'weighing' | 'review' | 'result' | 'gameover';

export interface HerbMeta {
  name: string;
  color: string;
  similar?: string[];
}
