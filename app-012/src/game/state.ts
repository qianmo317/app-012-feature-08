import type { GameState, GamePhase, Prescription, WeighResult, LevelConfig, LevelFinishSummary } from '../types';
import { getLevelConfig } from '../levels';
import { generatePrescription, generateReviewQuestion } from '../prescription';
import { judgeWeight, getWeightStatus } from '../weighing';
import { scoreRound } from '../scoring';
import { getRandomHerbs } from '../herbs';
import type { HerbMeta } from '../types';

export class GameManager {
  state: GameState = {
    level: 1,
    score: 0,
    combo: 0,
    queue: 3,
    satisfaction: 100,
    expired: false,
  };

  phase: GamePhase = 'menu';
  endless = false;
  prescription: Prescription | null = null;
  herbs: HerbMeta[] = [];
  currentWeight = 0;
  zeroOffset = 0;
  targetGrams = 0;
  currentHerb: string | null = null;
  weighed = new Set<string>();
  results: WeighResult[] = [];
  packages: Array<{ herb: string; grams: number; decoct: string }> = [];
  reviewQuestion: ReturnType<typeof generateReviewQuestion> = null;
  reviewSelected: number | null = null;
  reviewResult: boolean | null = null;
  levelConfig: LevelConfig = getLevelConfig(1);

  timeLeft: number | null = null;
  timeUsed = 0;
  lastTick = 0;

  drawerOpen = new Set<string>();
  draggingHerb: string | null = null;
  dragX = 0;
  dragY = 0;
  onScale = false;
  flashingDrawer: string | null = null;
  flashTime = 0;

  /** 本关开始时的累计分，用于算本关新得的分 */
  levelStartScore = 0;
  private levelStartTime = 0;
  /** 防止 setTimeout 与超时路径重复结算同一关 */
  private levelFinalized = false;
  /** 本关复核答案 */
  private reviewAnswer: { herb: string; correct: boolean } | null = null;
  /** 每关结算（通过/失败/超时）时回调，main 负责落盘 */
  onLevelFinish: ((summary: LevelFinishSummary) => void) | null = null;

  startLevel(level: number, endless = false, resetScore = false): void {
    this.endless = endless;
    this.state.level = level;
    if (resetScore) {
      this.state.score = 0;
      this.state.combo = 0;
      this.state.queue = 3;
      this.state.satisfaction = 100;
    }
    this.state.expired = false;
    this.levelConfig = getLevelConfig(level);
    this.prescription = generatePrescription(this.levelConfig);
    this.herbs = getRandomHerbs(this.levelConfig.herbCount + (this.levelConfig.hasSimilarHerbs ? 2 : 0), this.levelConfig.hasSimilarHerbs);
    this.currentWeight = 0;
    this.zeroOffset = 0;
    this.targetGrams = 0;
    this.currentHerb = null;
    this.weighed = new Set();
    this.results = [];
    this.packages = [];
    this.reviewQuestion = null;
    this.reviewSelected = null;
    this.reviewResult = null;
    this.timeLeft = this.levelConfig.timeLimit;
    this.timeUsed = 0;
    this.lastTick = performance.now();
    this.drawerOpen = new Set();
    this.draggingHerb = null;
    this.levelStartScore = this.state.score;
    this.levelStartTime = Date.now();
    this.levelFinalized = false;
    this.reviewAnswer = null;
    this.phase = 'playing';
  }

  tick(now: number): void {
    if (this.phase !== 'playing' && this.phase !== 'weighing') return;
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    this.timeUsed += dt;

    if (this.timeLeft !== null) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.handleTimeout();
      }
    }

    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) this.flashingDrawer = null;
    }
  }

  selectDrawer(herb: string): boolean {
    if (!this.prescription) return false;
    const needed = this.prescription.items.find(i => i.herb === herb && !this.weighed.has(i.herb));
    if (!needed) {
      this.flashingDrawer = herb;
      this.flashTime = 0.5;
      return false;
    }
    this.drawerOpen.add(herb);
    this.currentHerb = herb;
    this.targetGrams = needed.grams;
    this.currentWeight = 0;
    this.phase = 'weighing';
    return true;
  }

  setWeight(w: number): void {
    this.currentWeight = Math.max(0, w);
  }

  addWeight(delta: number): void {
    this.currentWeight = Math.max(0, parseFloat((this.currentWeight + delta).toFixed(1)));
  }

  tare(): void {
    this.zeroOffset = this.currentWeight;
  }

  confirmWeight(): WeighResult | null {
    if (!this.currentHerb || !this.prescription) return null;
    const result = judgeWeight(this.currentWeight, this.targetGrams, this.levelConfig.tolerance);
    result.herb = this.currentHerb;
    this.results.push(result);

    const status = getWeightStatus(result, this.levelConfig.tolerance);
    const timeLimit = this.levelConfig.timeLimit;
    const breakdown = scoreRound(result, this.levelConfig.tolerance, this.state.combo, this.timeUsed, timeLimit);

    if (status === 'fail') {
      this.state.combo = 0;
    } else {
      this.state.combo++;
      this.state.score += breakdown.total;
      this.weighed.add(this.currentHerb);
      const item = this.prescription.items.find(i => i.herb === this.currentHerb);
      if (item) {
        this.packages.push({ herb: item.herb, grams: this.currentWeight, decoct: item.decoct });
      }
    }

    this.drawerOpen.delete(this.currentHerb);
    this.currentHerb = null;
    this.currentWeight = 0;
    this.zeroOffset = 0;

    if (this.weighed.size >= this.prescription.items.length) {
      this.startReview();
    } else {
      this.phase = 'playing';
    }

    return result;
  }

  startReview(): void {
    if (!this.prescription) return;
    this.reviewQuestion = generateReviewQuestion(this.prescription);
    this.reviewSelected = null;
    this.reviewResult = null;
    this.phase = 'review';
  }

  answerReview(answer: number): boolean {
    if (!this.reviewQuestion || this.reviewSelected !== null) return false;
    this.reviewSelected = answer;
    const correct = answer === this.reviewQuestion.correct;
    this.reviewResult = correct;
    this.reviewAnswer = { herb: this.reviewQuestion.herb, correct };
    if (!correct) {
      this.state.satisfaction -= 10;
      this.state.combo = 0;
    } else {
      this.state.satisfaction = Math.min(100, this.state.satisfaction + 5);
    }
    setTimeout(() => this.finishLevel(false), 1500);
    return correct;
  }

  finishLevel(timeout = false): void {
    if (this.levelFinalized) return;
    this.levelFinalized = true;

    const passed = this.results.every(r => r.ok) && this.state.satisfaction > 0;
    if (passed) {
      this.state.queue = Math.min(10, this.state.queue + 1);
    } else {
      this.state.queue--;
      this.state.satisfaction = Math.max(0, this.state.satisfaction - 20);
    }

    this.emitFinish(passed, timeout);

    if (this.state.queue <= 0 || this.state.satisfaction <= 0) {
      this.phase = 'gameover';
    } else {
      this.phase = 'result';
    }
  }

  private emitFinish(passed: boolean, timeout: boolean): void {
    if (!this.onLevelFinish) return;
    const tolerance = this.levelConfig.tolerance;
    this.onLevelFinish({
      timestamp: Date.now(),
      level: this.state.level,
      mode: this.endless ? 'endless' : 'normal',
      passed,
      timeout,
      scoreGained: this.state.score - this.levelStartScore,
      totalScore: this.state.score,
      durationMs: Date.now() - this.levelStartTime,
      review: this.reviewAnswer,
      attempts: this.results.map(r => ({
        herb: r.herb,
        target: r.target,
        actual: r.actual,
        tolerance,
        ok: r.ok,
      })),
    });
  }

  nextLevel(): void {
    this.startLevel(this.state.level + 1, this.endless);
  }

  retryLevel(): void {
    this.startLevel(this.state.level, this.endless);
  }

  handleTimeout(): void {
    if (this.levelFinalized) return;
    this.levelFinalized = true;
    this.state.queue--;
    this.state.satisfaction = Math.max(0, this.state.satisfaction - 15);
    this.state.combo = 0;
    this.emitFinish(false, true);
    if (this.state.queue <= 0 || this.state.satisfaction <= 0) {
      this.phase = 'gameover';
    } else {
      this.startLevel(this.state.level, this.endless);
    }
  }

  getTimeLeft(): number | null {
    return this.timeLeft;
  }

  isDrawerOpen(herb: string): boolean {
    return this.drawerOpen.has(herb);
  }
}
