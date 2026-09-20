import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameManager } from '../src/game/state';
import type { NewRecord } from '../src/records';

function seedLevel(manager: GameManager, level = 1): void {
  manager.startLevel(level, false);
}

describe('GameManager 关卡战绩', () => {
  let manager: GameManager;
  let emitted: NewRecord[];

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new GameManager();
    emitted = [];
    manager.onRecord = r => emitted.push(r);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('每味药的每次称量（含超差重来）都留在 attempts 里', () => {
    seedLevel(manager);
    const herb = manager.prescription!.items[0].herb;
    manager.selectDrawer(herb);
    // 故意称飞（大概率超差），确认一次
    manager.currentWeight = 999;
    manager.confirmWeight();
    // 没进 weighed，重新选同一味，称准
    manager.selectDrawer(herb);
    manager.currentWeight = manager.targetGrams;
    manager.confirmWeight();

    const herbAttempts = manager.attempts.filter(a => a.herb === herb);
    expect(herbAttempts.length).toBe(2);
    expect(herbAttempts[0].ok).toBe(false);
    expect(herbAttempts[1].ok).toBe(true);
  });

  it('复核答对后产出 passed 战绩，记录本关得分与复核结果', () => {
    seedLevel(manager);
    for (const item of manager.prescription!.items) {
      manager.selectDrawer(item.herb);
      manager.currentWeight = item.grams;
      manager.confirmWeight();
    }
    const q = manager.reviewQuestion!;
    manager.answerReview(q.correct);
    vi.advanceTimersByTime(1500);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].outcome).toBe('passed');
    expect(emitted[0].passed).toBe(true);
    expect(emitted[0].reviewCorrect).toBe(true);
    expect(emitted[0].level).toBe(1);
    expect(emitted[0].mode).toBe('campaign');
    expect(emitted[0].score).toBeGreaterThan(0);
    expect(emitted[0].attempts.length).toBe(manager.prescription!.items.length);
  });

  it('复核答错且满意度归零产出 failed 战绩', () => {
    seedLevel(manager);
    manager.state.satisfaction = 10;
    for (const item of manager.prescription!.items) {
      manager.selectDrawer(item.herb);
      manager.currentWeight = item.grams;
      manager.confirmWeight();
    }
    const q = manager.reviewQuestion!;
    const wrong = q.options.find(o => o !== q.correct)!;
    manager.answerReview(wrong);
    vi.advanceTimersByTime(1500);

    expect(emitted[0].reviewCorrect).toBe(false);
    expect(emitted[0].outcome).toBe('failed');
    expect(emitted[0].score).toBe(0);
    expect(emitted[0].totalScore).toBeGreaterThanOrEqual(0);
  });

  it('超时立即产出 timeout 战绩，reviewCorrect 为 null，且同一关不会重复记录', () => {
    seedLevel(manager);
    manager.state.queue = 1;
    manager.handleTimeout();
    manager.handleTimeout();
    expect(manager.phase).toBe('gameover');
    expect(emitted).toHaveLength(1);
    expect(emitted[0].outcome).toBe('timeout');
    expect(emitted[0].reviewCorrect).toBeNull();
    expect(emitted[0].passed).toBe(false);
    expect(emitted[0].score).toBe(0);
  });

  it('同一关重试不会串味：attempts 只属于当前这次', () => {
    seedLevel(manager);
    manager.selectDrawer(manager.prescription!.items[0].herb);
    manager.currentWeight = 999;
    manager.confirmWeight();
    expect(manager.attempts.length).toBe(1);
    manager.retryLevel();
    expect(manager.attempts.length).toBe(0);
  });
});
