import { describe, it, expect, beforeEach } from 'vitest';
import {
  localDateKey,
  recentDateKeys,
  dayLabel,
  groupByDate,
  summarizeRecentDays,
  compareWithPrevious,
  getWeakHerbs,
} from '../src/records';
import type { LevelRecord } from '../src/types';

function record(partial: Partial<LevelRecord> & { ts: number; level: number }): LevelRecord {
  const date = partial.date ?? localDateKey(partial.ts);
  const score = partial.score ?? 100;
  return {
    id: `r-${partial.ts}-${partial.level}`,
    date,
    mode: partial.mode ?? 'campaign',
    score,
    totalScore: partial.totalScore ?? score,
    outcome: partial.outcome ?? 'passed',
    passed: partial.passed ?? (partial.outcome ? partial.outcome === 'passed' : true),
    reviewCorrect: partial.reviewCorrect ?? true,
    timeUsed: partial.timeUsed ?? 10,
    attempts: partial.attempts ?? [],
    ...partial,
  };
}

describe('localDateKey / recentDateKeys', () => {
  it('按本地日期归组，键格式为 YYYY-MM-DD', () => {
    // 2026-09-20 15:30 本地
    const ts = new Date(2026, 8, 20, 15, 30).getTime();
    expect(localDateKey(ts)).toBe('2026-09-20');
  });

  it('recentDateKeys 返回最近 n 天（含空白天）', () => {
    const ts = new Date(2026, 8, 20, 23, 59).getTime();
    const keys = recentDateKeys(7, ts);
    expect(keys).toEqual([
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ]);
  });

  it('跨月/跨年也能算对', () => {
    const ts = new Date(2026, 0, 1, 0, 0).getTime();
    expect(recentDateKeys(3, ts)).toEqual(['2025-12-30', '2025-12-31', '2026-01-01']);
  });

  it('dayLabel 含日期与星期', () => {
    expect(dayLabel('2026-09-20')).toContain('9/20');
    expect(dayLabel('2026-09-20')).toContain('周');
  });
});

describe('summarizeRecentDays', () => {
  const now = new Date(2026, 8, 20, 12, 0).getTime();

  it('空白天给出 count=0、avgScore=null（表示没打，不是存不了）', () => {
    const days = summarizeRecentDays([], 7, now);
    expect(days).toHaveLength(7);
    for (const d of days) {
      expect(d.count).toBe(0);
      expect(d.avgScore).toBeNull();
      expect(d.bestScore).toBeNull();
    }
  });

  it('按天统计打了几关、平均分、过关数、复核答错数', () => {
    const records = [
      record({ ts: new Date(2026, 8, 20, 10, 0).getTime(), level: 1, score: 100 }),
      record({ ts: new Date(2026, 8, 20, 11, 0).getTime(), level: 2, score: 200, reviewCorrect: false, passed: false, outcome: 'failed' }),
      record({ ts: new Date(2026, 8, 19, 9, 0).getTime(), level: 1, score: 300 }),
    ];
    const days = summarizeRecentDays(records, 7, now);
    const today = days.find(d => d.date === '2026-09-20')!;
    expect(today.count).toBe(2);
    expect(today.avgScore).toBe(150);
    expect(today.bestScore).toBe(200);
    expect(today.passedCount).toBe(1);
    expect(today.reviewWrongCount).toBe(1);
    expect(today.records).toHaveLength(2);

    const yesterday = days.find(d => d.date === '2026-09-19')!;
    expect(yesterday.count).toBe(1);
    expect(yesterday.avgScore).toBe(300);
  });
});

describe('groupByDate', () => {
  it('同一天的成绩归到一起且按时间排序', () => {
    const records = [
      record({ ts: new Date(2026, 8, 20, 11, 0).getTime(), level: 2 }),
      record({ ts: new Date(2026, 8, 20, 9, 0).getTime(), level: 1 }),
      record({ ts: new Date(2026, 8, 19, 9, 0).getTime(), level: 1 }),
    ];
    const grouped = groupByDate(records);
    expect(grouped.get('2026-09-20')!.map(r => r.level)).toEqual([1, 2]);
    expect(grouped.get('2026-09-19')).toHaveLength(1);
  });
});

describe('compareWithPrevious', () => {
  const mk = (level: number, ts: number, score: number, mode: 'campaign' | 'endless' = 'campaign') =>
    record({ level, ts, score, mode });

  it('头一回打同一关标记为 first', () => {
    const cur = mk(1, 2000, 100);
    expect(compareWithPrevious([], cur).trend).toBe('first');
  });

  it('比上一次分高标记 better 并给出分差', () => {
    const prev = mk(1, 1000, 100);
    const cur = mk(1, 2000, 130);
    const cmp = compareWithPrevious([prev], cur);
    expect(cmp.trend).toBe('better');
    expect(cmp.diff).toBe(30);
    expect(cmp.prev).toBe(prev);
  });

  it('比上一次差标记 worse', () => {
    const cmp = compareWithPrevious([mk(1, 1000, 200)], mk(1, 2000, 180));
    expect(cmp.trend).toBe('worse');
    expect(cmp.diff).toBe(-20);
  });

  it('持平标记 same', () => {
    expect(compareWithPrevious([mk(1, 1000, 200)], mk(1, 2000, 200)).trend).toBe('same');
  });

  it('优先与同模式的上一次比，没有再退回其它模式', () => {
    const olderCampaign = mk(1, 500, 90, 'campaign');
    const endlessPrev = mk(1, 1500, 500, 'endless');
    const cur = mk(1, 2000, 300, 'endless');
    expect(compareWithPrevious([olderCampaign, endlessPrev], cur).prev).toBe(endlessPrev);

    const curCampaign = mk(1, 2000, 300, 'campaign');
    expect(compareWithPrevious([olderCampaign, endlessPrev], curCampaign).prev).toBe(olderCampaign);
  });

  it('不会与自己或之后的记录比', () => {
    const cur = mk(1, 1000, 300);
    const future = mk(1, 2000, 500);
    expect(compareWithPrevious([cur, future], cur).trend).toBe('first');
  });
});

describe('getWeakHerbs', () => {
  const attempt = (herb: string, delta: number, ok: boolean) => ({
    herb,
    target: 10,
    actual: 10 + delta,
    deltaG: delta,
    ok,
    status: ok ? ('good' as const) : ('fail' as const),
  });

  it('按失准次数列出老是称不准的药', () => {
    const records = [
      record({
        ts: 1, level: 1,
        attempts: [
          attempt('白芍', 2, false),
          attempt('白芍', 0.2, true),
          attempt('熟地', 3, false),
          attempt('熟地', 1, true),
          attempt('熟地', 2.5, false),
          attempt('甘草', 0.1, true),
        ],
      }),
    ];
    const weak = getWeakHerbs(records);
    expect(weak.map(w => w.herb)).toEqual(['熟地', '白芍']);
    expect(weak[0]).toMatchObject({ badCount: 2, attempts: 3 });
    expect(weak[1]).toMatchObject({ badCount: 1, attempts: 2 });
  });

  it('完全没失准记录时返回空表', () => {
    const records = [record({ ts: 1, level: 1, attempts: [attempt('甘草', 0, true)] })];
    expect(getWeakHerbs(records)).toEqual([]);
  });
});
