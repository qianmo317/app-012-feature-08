import { describe, it, expect, vi } from 'vitest';
import { UIRenderer } from '../src/renderer/ui';
import { createHistoryStore, groupRecentDays, compareWithPrevious, getWeakHerbs, formatDateLabel, localDateKey, type StorageBackend } from '../src/storage';
import type { LevelFinishSummary } from '../src/types';

/** 最小可用的 CanvasRenderingContext2D mock：所有方法 no-op */
function makeCtx(): CanvasRenderingContext2D {
  return new Proxy({ canvas: {} } as unknown as CanvasRenderingContext2D, {
    get(target, prop) {
      if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
      return typeof prop === 'string' ? () => {} : undefined;
    },
    set(target, prop, value) {
      (target as Record<string | symbol, unknown>)[prop] = value;
      return true;
    },
  });
}

function makeMemory(): StorageBackend {
  const map = new Map<string, string>();
  return {
    getItem: k => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: k => void map.delete(k),
  };
}

function seed(store: ReturnType<typeof createHistoryStore>, n: number): void {
  for (let i = 0; i < n; i++) {
    const summary: LevelFinishSummary = {
      timestamp: Date.now() - i * 3600_000,
      level: (i % 3) + 1,
      mode: i % 2 === 0 ? 'normal' : 'endless',
      passed: i % 4 !== 0,
      timeout: i % 7 === 0,
      scoreGained: 100 + i * 10,
      totalScore: 100 + i * 10,
      durationMs: 4000,
      review: i % 3 === 0 ? { herb: '甘草', correct: i % 6 !== 0 } : null,
      attempts: [
        { herb: '白芍', target: 10, actual: i % 2 === 0 ? 10 : 12, tolerance: 0.5, ok: i % 2 === 0 },
        { herb: '甘草', target: 8, actual: 8, tolerance: 0.5, ok: true },
      ],
    };
    store.addRecord(summary);
  }
}

describe('UI 渲染冒烟测试', () => {
  const sizes = [
    { w: 1280, h: 720 },
    { w: 375, h: 667 }, // 小屏手机
    { w: 768, h: 400 }, // 矮屏
  ];

  for (const { w, h } of sizes) {
    it(`drawMenu 在 ${w}x${h} 各状态下不报错`, () => {
      const ui = new UIRenderer();
      ui.layout(w, h);
      for (const status of ['ok', 'denied', 'quota', 'corrupt'] as const) {
        ui.drawMenu(makeCtx(), w, h, 999, 7, status);
      }
      expect(ui.buttonRects.map(b => b.action)).toContain('history');
    });

    it(`drawHistory 有数据时在 ${w}x${h} 不报错`, () => {
      const store = createHistoryStore(makeMemory());
      seed(store, 20);
      const data = store.getData();
      const ui = new UIRenderer();
      ui.layout(w, h);
      ui.drawHistory(
        makeCtx(), w, h,
        groupRecentDays(data.records, 7),
        getWeakHerbs(data.records),
        'ok', false,
        key => formatDateLabel(key),
        data.records,
        compareWithPrevious,
      );
      const actions = ui.buttonRects.map(b => b.action);
      expect(actions).toContain('back-menu');
      expect(actions).toContain('clear-records');
    });

    it(`drawHistory 清除确认态在 ${w}x${h} 显示确认/取消`, () => {
      const store = createHistoryStore(makeMemory());
      const ui = new UIRenderer();
      ui.layout(w, h);
      ui.drawHistory(
        makeCtx(), w, h,
        groupRecentDays([], 7),
        [],
        'denied', true,
        key => formatDateLabel(key),
        [],
        compareWithPrevious,
      );
      const actions = ui.buttonRects.map(b => b.action);
      expect(actions).toContain('clear-confirm');
      expect(actions).toContain('clear-cancel');
      expect(actions).not.toContain('clear-records');
    });

    it(`drawResult/drawGameOver 在 ${w}x${h} 不报错`, () => {
      const ui = new UIRenderer();
      ui.layout(w, h);
      const results = [
        { herb: '白芍', target: 10, actual: 10.5, ok: true, deltaG: 0.5 },
        { herb: '甘草', target: 8, actual: 7, ok: false, deltaG: -1 },
      ];
      ui.drawResult(makeCtx(), w, h, 320, 2, results, false, 150, 'up', 'quota');
      expect(ui.buttonRects.map(b => b.action)).toContain('retry');
      ui.drawGameOver(makeCtx(), w, h, 320, 2, 'ok');
      expect(ui.buttonRects.map(b => b.action)).toContain('menu');
    });

    it(`drawResult 8 味药在 ${w}x${h} 按钮不超出屏幕`, () => {
      const ui = new UIRenderer();
      ui.layout(w, h);
      const herbs = ['白芍', '赤芍', '生地', '熟地', '黄芪', '当归', '川芎', '白术'];
      const results = herbs.map(name => ({ herb: name, target: 10, actual: 10.2, ok: true, deltaG: 0.2 }));
      ui.drawResult(makeCtx(), w, h, 800, 11, results, true, 600, 'same', 'ok');
      const btn = ui.buttonRects.find(b => b.action === 'next')!;
      expect(btn.y + btn.h).toBeLessThanOrEqual(h);
      expect(btn.y).toBeGreaterThanOrEqual(0);
    });
  }

  it('空数据历史页正确渲染 7 个空日分组', () => {
    const ui = new UIRenderer();
    const fillText = vi.fn();
    const ctx = makeCtx();
    ctx.fillText = fillText;
    ui.layout(1280, 720);
    ui.drawHistory(
      ctx, 1280, 720,
      groupRecentDays([], 7),
      [],
      'ok', false,
      key => formatDateLabel(key),
      [],
      compareWithPrevious,
    );
    const joined = fillText.mock.calls.map(c => String(c[0])).join('|');
    expect(joined.split('无记录').length - 1).toBe(7);
    expect(joined).toContain('暂无称错记录');
    // 防止以后有人误改 localDateKey
    expect(localDateKey(new Date(2026, 0, 5).getTime())).toBe('2026-01-05');
  });
});
