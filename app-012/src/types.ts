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

export type WeighStatus = 'perfect' | 'good' | 'warning' | 'fail';

/** 单味药的一次称量尝试（含超差重试，用于统计老称不准的药） */
export interface HerbAttempt {
  herb: string;
  target: number;
  actual: number;
  deltaG: number;
  ok: boolean;
  status: WeighStatus;
}

export type GameMode = 'campaign' | 'endless';

/** 一关的结局：通过 / 复核后结算失败 / 超时 */
export type RecordOutcome = 'passed' | 'failed' | 'timeout';

/** 每打完一关留下的一条成绩 */
export interface LevelRecord {
  id: string;
  /** 完成时刻的毫秒时间戳 */
  ts: number;
  /** 本地日期 YYYY-MM-DD，按天归组用 */
  date: string;
  mode: GameMode;
  level: number;
  /** 本关得分 */
  score: number;
  /** 到本关结束时的本局总分 */
  totalScore: number;
  outcome: RecordOutcome;
  passed: boolean;
  /** 复核是否答对；超时未进入复核时为 null */
  reviewCorrect: boolean | null;
  /** 本关耗时（秒，复核停留不计入） */
  timeUsed: number;
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

export type GamePhase = 'menu' | 'playing' | 'weighing' | 'review' | 'result' | 'gameover' | 'history';

export interface HerbMeta {
  name: string;
  color: string;
  similar?: string[];
}
