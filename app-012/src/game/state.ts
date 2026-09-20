import type { GameState, GamePhase, Prescription, WeighResult, LevelConfig, HerbAttempt, GameMode, RecordOutcome } from '../types';
import { getLevelConfig } from '../levels';
import { generatePrescription, generateReviewQuestion } from '../prescription';
import { judgeWeight, getWeightStatus } from '../weighing';
import { scoreRound } from '../scoring';
import { getRandomHerbs } from '../herbs';
import type { HerbMeta } from '../types';
import type { NewRecord } from '../records';

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
  mode: GameMode = 'campaign';
  prescription: Prescription | null = null;
  herbs: HerbMeta[] = [];
  currentWeight = 0;
  zeroOffset = 0;
  targetGrams = 0;
  currentHerb: string | null = null;
  weighed = new Set<string>();
  results: WeighResult[] = [];
  /** 本关每味药的所有称量尝试（含超差重来） */
  attempts: HerbAttempt[] = [];
  packages: Array<{ herb: string; grams: number; decoct: string }> = [];
  reviewQuestion: ReturnType<typeof generateReviewQuestion> = null;
  reviewSelected: number | null = null;
  reviewResult: boolean | null = null;
  reviewCorrect: boolean | null = null;
  levelConfig: LevelConfig = getLevelConfig(1);

  /** 进入本关时的总分，本关得分 = 当前总分 - 它 */
  private levelStartScore = 0;
  /** 防止一关产出多条战绩 */
  private recordEmitted = false;
  /** 本关最终是否通过（供结算界面决定显示"下一关"还是"重试"） */
  levelPassed = true;

  /** 每打完一关（通过/失败/超时）回调，由外层负责落盘 */
  onRecord: ((record: NewRecord) => void) | null = null;

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

  /** 新开一局：清零本局状态后进入第 1 关 */
  startNewGame(endless: boolean): void {
    this.state = { level: 1, score: 0, combo: 0, queue: 3, satisfaction: 100, expired: false };
    this.startLevel(1, endless);
  }

  startLevel(level: number, endless = false): void {
    this.endless = endless;
    this.mode = endless ? 'endless' : 'campaign';
    this.state.level = level;
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
    this.attempts = [];
    this.packages = [];
    this.reviewQuestion = null;
    this.reviewSelected = null;
    this.reviewResult = null;
    this.reviewCorrect = null;
    this.recordEmitted = false;
    this.levelPassed = true;
    this.levelStartScore = this.state.score;
    this.timeLeft = this.levelConfig.timeLimit;
    this.timeUsed = 0;
    this.lastTick = performance.now();
    this.drawerOpen = new Set();
    this.draggingHerb = null;
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

    // 无论合格与否都留痕，方便统计哪味药老称不准
    this.attempts.push({
      herb: result.herb,
      target: result.target,
      actual: result.actual,
      deltaG: result.deltaG,
      ok: result.ok,
      status: getWeightStatus(result, this.levelConfig.tolerance),
    });

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
    this.reviewCorrect = correct;
    if (!correct) {
      this.state.satisfaction -= 10;
      this.state.combo = 0;
    } else {
      this.state.satisfaction = Math.min(100, this.state.satisfaction + 5);
    }
    setTimeout(() => this.finishLevel(), 1500);
    return correct;
  }

  finishLevel(): void {
    if (this.recordEmitted) return;

    // 病人还没走光就算这一关过了；复核答错只扣满意度，不直接判死
    const passed = this.state.satisfaction > 0 && this.state.queue > 0;
    this.levelPassed = passed;
    if (passed) {
      this.state.queue = Math.min(10, this.state.queue + 1);
    } else {
      this.state.queue--;
      this.state.satisfaction = Math.max(0, this.state.satisfaction - 20);
    }

    const gameEnded = this.state.queue <= 0 || this.state.satisfaction <= 0;
    this.emitRecord(passed ? 'passed' : 'failed');
    this.phase = gameEnded ? 'gameover' : 'result';
  }

  nextLevel(): void {
    this.startLevel(this.state.level + 1, this.endless);
  }

  retryLevel(): void {
    this.startLevel(this.state.level, this.endless);
  }

  handleTimeout(): void {
    if (this.recordEmitted) return;
    this.state.queue--;
    this.state.satisfaction -= 15;
    this.state.combo = 0;
    const gameEnded = this.state.queue <= 0 || this.state.satisfaction <= 0;
    this.emitRecord('timeout');
    if (gameEnded) {
      this.phase = 'gameover';
    } else {
      this.startLevel(this.state.level, this.endless);
    }
  }

  private emitRecord(outcome: RecordOutcome): void {
    if (this.recordEmitted) return;
    this.recordEmitted = true;
    const passed = outcome === 'passed';
    // 只有过关才把这关的增量记为关卡得分；失败/超时记 0，
    // 已加进累计分的部分仍保留在 totalScore 里（原有计分语义）
    const levelScore = passed ? Math.max(0, this.state.score - this.levelStartScore) : 0;
    const record: NewRecord = {
      ts: Date.now(),
      mode: this.mode,
      level: this.state.level,
      score: levelScore,
      totalScore: this.state.score,
      outcome,
      passed,
      reviewCorrect: outcome === 'timeout' ? null : this.reviewCorrect,
      timeUsed: Math.round(this.timeUsed * 10) / 10,
      attempts: this.attempts.map(a => ({ ...a })),
    };
    this.onRecord?.(record);
  }

  getTimeLeft(): number | null {
    return this.timeLeft;
  }

  isDrawerOpen(herb: string): boolean {
    return this.drawerOpen.has(herb);
  }
}
