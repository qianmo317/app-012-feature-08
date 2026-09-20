import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameManager } from '../src/game/state';
import type { LevelFinishSummary } from '../src/types';

/** 把当前关卡推进到「全部称准、等待复核」的状态 */
function weighEverythingAccurately(game: GameManager): void {
  const items = game.prescription!.items;
  for (const item of items) {
    expect(game.selectDrawer(item.herb)).toBe(true);
    game.currentWeight = item.grams;
    const r = game.confirmWeight();
    expect(r?.ok).toBe(true);
  }
}

describe('GameManager level finish callback', () => {
  beforeEach(() => vi.useFakeTimers());

  it('emits one summary with attempts and review answer when review is answered', () => {
    const game = new GameManager();
    const finishes: LevelFinishSummary[] = [];
    game.onLevelFinish = (s) => finishes.push(s);
    game.startLevel(1, false, true);

    weighEverythingAccurately(game);
    expect(game.phase).toBe('review');

    const q = game.reviewQuestion!;
    game.answerReview(q.correct);
    vi.advanceTimersByTime(1500);

    expect(finishes).toHaveLength(1);
    const s = finishes[0];
    expect(s.level).toBe(1);
    expect(s.passed).toBe(true);
    expect(s.timeout).toBe(false);
    expect(s.attempts).toHaveLength(game.prescription!.items.length);
    expect(s.review?.correct).toBe(true);
    expect(s.scoreGained).toBeGreaterThan(0);
    expect(s.totalScore).toBeGreaterThanOrEqual(s.scoreGained);
  });

  it('records a wrong review answer on the summary', () => {
    const game = new GameManager();
    const finishes: LevelFinishSummary[] = [];
    game.onLevelFinish = (s) => finishes.push(s);
    game.startLevel(1, false, true);
    weighEverythingAccurately(game);

    const wrong = game.reviewQuestion!.options.find(o => o !== game.reviewQuestion!.correct)!;
    game.answerReview(wrong);
    vi.advanceTimersByTime(1500);

    expect(finishes[0].review).toEqual({ herb: game.reviewQuestion!.herb, correct: false });
  });

  it('does not emit twice if finishLevel called again after timeout', () => {
    const game = new GameManager();
    const finishes: LevelFinishSummary[] = [];
    game.onLevelFinish = (s) => finishes.push(s);
    game.startLevel(1, false, true);
    weighEverythingAccurately(game);
    game.answerReview(game.reviewQuestion!.correct);
    vi.advanceTimersByTime(1500);

    game.finishLevel(false); // 手动再调一次
    expect(finishes).toHaveLength(1);
  });

  it('emits a timeout summary and restarts the same level', () => {
    const game = new GameManager();
    const finishes: LevelFinishSummary[] = [];
    game.onLevelFinish = (s) => finishes.push(s);
    game.startLevel(4, false, true); // 第4关有 120s 时限

    game.handleTimeout();

    expect(finishes).toHaveLength(1);
    expect(finishes[0].timeout).toBe(true);
    expect(finishes[0].passed).toBe(false);
    // 病人还够，同关重开
    expect(game.phase).toBe('playing');
    expect(game.state.level).toBe(4);
  });

  it('scoreGained resets per level while total score accumulates', () => {
    const game = new GameManager();
    const finishes: LevelFinishSummary[] = [];
    game.onLevelFinish = (s) => finishes.push(s);
    game.startLevel(1, false, true);
    weighEverythingAccurately(game);
    game.answerReview(game.reviewQuestion!.correct);
    vi.advanceTimersByTime(1500);

    const firstGain = finishes[0].scoreGained;
    expect(firstGain).toBeGreaterThan(0);

    game.nextLevel();
    expect(game.levelStartScore).toBe(finishes[0].totalScore);
    weighEverythingAccurately(game);
    game.answerReview(game.reviewQuestion!.correct);
    vi.advanceTimersByTime(1500);

    expect(finishes[1].level).toBe(2);
    expect(finishes[1].scoreGained).toBeGreaterThan(0);
    expect(finishes[1].totalScore).toBe(firstGain + finishes[1].scoreGained);
  });
});
