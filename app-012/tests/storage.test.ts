import { describe, it, expect, beforeEach } from 'vitest';
import {
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  createHistoryStore,
  localDateKey,
  formatDateLabel,
  groupRecentDays,
  compareWithPrevious,
  getWeakHerbs,
  type StorageBackend,
  type LevelRecord,
} from '../src/storage';
import type { LevelFinishSummary } from '../src/types';

function makeMemory(): StorageBackend {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function makeSummary(over: Partial<LevelFinishSummary> = {}): LevelFinishSummary {
  return {
    timestamp: Date.now(),
    level: 1,
    mode: 'normal',
    passed: true,
    timeout: false,
    scoreGained: 150,
    totalScore: 150,
    durationMs: 5000,
    review: null,
    attempts: [{ herb: '白芍', target: 10, actual: 10, tolerance: 1, ok: true }],
    ...over,
  };
}

describe('HistoryStore.addRecord', () => {
  it('persists each finished level immediately', () => {
    const backend = makeMemory();
    const store = createHistoryStore(backend);
    store.addRecord(makeSummary({ level: 1, totalScore: 150 }));
    store.addRecord(makeSummary({ level: 2, totalScore: 320 }));

    const raw = backend.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[0].level).toBe(1);
    expect(parsed.records[1].level).toBe(2);
  });

  it('updates highest level only when level passed', () => {
    const backend = makeMemory();
    const store = createHistoryStore(backend);
    store.addRecord(makeSummary({ level: 5, passed: false }));
    expect(store.getData().highestLevel).toBe(0);
    store.addRecord(makeSummary({ level: 5, passed: true }));
    expect(store.getData().highestLevel).toBe(5);
  });

  it('updates highest score from cumulative total score', () => {
    const backend = makeMemory();
    const store = createHistoryStore(backend);
    store.addRecord(makeSummary({ scoreGained: 100, totalScore: 100 }));
    store.addRecord(makeSummary({ scoreGained: 80, totalScore: 180 }));
    expect(store.getData().highestScore).toBe(180);
  });

  it('survives reload from the same backend', () => {
    const backend = makeMemory();
    createHistoryStore(backend).addRecord(makeSummary({ level: 3 }));
    const reloaded = createHistoryStore(backend).getData();
    expect(reloaded.records).toHaveLength(1);
    expect(reloaded.records[0].level).toBe(3);
  });

  it('records failed review and timeout on the level record', () => {
    const backend = makeMemory();
    const store = createHistoryStore(backend);
    store.addRecord(makeSummary({
      passed: false,
      timeout: true,
      review: { herb: '甘草', correct: false },
    }));
    const r = store.getData().records[0];
    expect(r.timeout).toBe(true);
    expect(r.passed).toBe(false);
    expect(r.review).toEqual({ herb: '甘草', correct: false });
  });
});

describe('HistoryStore migration', () => {
  it('migrates v1 save (highest score/level only) into v2', () => {
    const backend = makeMemory();
    backend.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ highestScore: 999, highestLevel: 7, lastPlayed: 123 }));
    const store = createHistoryStore(backend);
    const data = store.getData();
    expect(data.highestScore).toBe(999);
    expect(data.highestLevel).toBe(7);
    expect(data.records).toEqual([]);
    // 迁移成功后旧档删除
    expect(backend.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });
});

describe('HistoryStore status', () => {
  it('reports ok for a working backend', () => {
    const store = createHistoryStore(makeMemory());
    expect(store.getStatus()).toBe('ok');
  });

  it('reports denied when storage writes throw', () => {
    const store = createHistoryStore({
      getItem: () => null,
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    expect(store.getStatus()).toBe('denied');
  });

  it('reports corrupt when saved JSON is broken', () => {
    const backend = makeMemory();
    backend.setItem(STORAGE_KEY, '{不是合法JSON');
    expect(createHistoryStore(backend).getStatus()).toBe('corrupt');
  });

  it('reports corrupt when records field is missing', () => {
    const backend = makeMemory();
    backend.setItem(STORAGE_KEY, JSON.stringify({ highestScore: 1 }));
    expect(createHistoryStore(backend).getStatus()).toBe('corrupt');
  });

  it('reports quota when adding a record cannot be written', () => {
    let writes = 0;
    const store = createHistoryStore({
      getItem: () => null,
      setItem: () => {
        writes++;
        const err = new Error('quota exceeded');
        (err as Error & { name: string }).name = 'QuotaExceededError';
        throw err;
      },
      removeItem: () => {},
    });
    store.addRecord(makeSummary());
    expect(store.getStatus()).toBe('quota');
    expect(writes).toBeGreaterThan(0);
  });

  it('reports denied for non-quota write errors', () => {
    const store = createHistoryStore({
      getItem: () => null,
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {},
    });
    expect(store.getStatus()).toBe('denied');
  });
});

describe('HistoryStore.clear', () => {
  it('removes records after two-step confirm flow', () => {
    const backend = makeMemory();
    const store = createHistoryStore(backend);
    store.addRecord(makeSummary());
    // 第一次点击只进入确认态（由 UI 控制），真正清除调 clear()
    store.clear();
    expect(store.getData().records).toHaveLength(0);
    expect(store.getData().highestScore).toBe(0);
    expect(backend.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('date helpers', () => {
  it('localDateKey uses local YYYY-MM-DD format', () => {
    const key = localDateKey(new Date(2026, 8, 20, 23, 59).getTime());
    expect(key).toBe('2026-09-20');
  });

  it('formats today and yesterday labels', () => {
    const key = localDateKey(Date.now());
    expect(formatDateLabel(key, key)).toContain('今天');
    const yesterday = localDateKey(Date.now() - 86400000);
    expect(formatDateLabel(yesterday, key)).toContain('昨天');
    const old = localDateKey(Date.now() - 3 * 86400000);
    expect(formatDateLabel(old, key)).not.toContain('今天');
  });
});

function makeRecord(over: Partial<LevelRecord> = {}): LevelRecord {
  return {
    id: Math.floor(Math.random() * 1e9),
    date: localDateKey(Date.now()),
    timestamp: Date.now(),
    level: 1,
    mode: 'normal',
    passed: true,
    timeout: false,
    scoreGained: 100,
    totalScore: 100,
    durationMs: 1000,
    review: null,
    attempts: [],
    ...over,
  };
}

describe('groupRecentDays', () => {
  it('returns 7 groups in reverse-chronological order, including empty days', () => {
    const groups = groupRecentDays([], 7);
    expect(groups).toHaveLength(7);
    expect(groups[0].date).toBe(localDateKey(Date.now()));
    expect(groups.every(g => g.records.length === 0)).toBe(true);
  });

  it('buckets records by local date and keeps chronological order within a day', () => {
    const now = Date.now();
    const records = [
      makeRecord({ id: 2, timestamp: now - 1000, date: localDateKey(now) }),
      makeRecord({ id: 1, timestamp: now - 200000, date: localDateKey(now) }),
    ];
    const groups = groupRecentDays(records, 7, now);
    expect(groups[0].records.map(r => r.id)).toEqual([1, 2]);
  });
});

describe('compareWithPrevious', () => {
  it('returns first when the level has never been played', () => {
    const cur = makeRecord({ id: 1, level: 2 });
    expect(compareWithPrevious([cur], cur)).toBe('first');
  });

  it('compares with the latest prior attempt of same level and mode', () => {
    const r1 = makeRecord({ id: 1, level: 3, mode: 'normal', scoreGained: 100 });
    const r2 = makeRecord({ id: 2, level: 3, mode: 'normal', scoreGained: 140 });
    const r3 = makeRecord({ id: 3, level: 3, mode: 'normal', scoreGained: 120 });
    expect(compareWithPrevious([r1, r2, r3], r3)).toBe('down');
    expect(compareWithPrevious([r1, r2], r2)).toBe('up');
    const same = makeRecord({ id: 4, level: 3, mode: 'normal', scoreGained: 120 });
    expect(compareWithPrevious([r1, r2, r3, same], same)).toBe('same');
  });

  it('does not compare across modes', () => {
    const normal = makeRecord({ id: 1, level: 3, mode: 'normal', scoreGained: 100 });
    const endless = makeRecord({ id: 2, level: 3, mode: 'endless', scoreGained: 120 });
    expect(compareWithPrevious([normal, endless], endless)).toBe('first');
  });
});

describe('getWeakHerbs', () => {
  it('ranks herbs by miss count then average absolute delta', () => {
    const records: LevelRecord[] = [
      makeRecord({
        attempts: [
          { herb: '白芍', target: 10, actual: 12, tolerance: 0.5, ok: false },
          { herb: '白芍', target: 10, actual: 10.2, tolerance: 0.5, ok: true },
          { herb: '甘草', target: 6, actual: 9, tolerance: 0.5, ok: false },
        ],
      }),
      makeRecord({
        attempts: [
          { herb: '白芍', target: 10, actual: 11.5, tolerance: 0.5, ok: false },
        ],
      }),
    ];
    const weak = getWeakHerbs(records, 5);
    expect(weak[0].herb).toBe('白芍');
    expect(weak[0].attempts).toBe(3);
    expect(weak[0].misses).toBe(2);
    // (2 + 0.2 + 1.5) / 3 = 1.233...
    expect(weak[0].avgAbsDelta).toBeCloseTo((2 + 0.2 + 1.5) / 3, 5);
    expect(weak[1].herb).toBe('甘草');
  });

  it('ignores herbs that were never missed', () => {
    const records = [
      makeRecord({
        attempts: [{ herb: '茯苓', target: 8, actual: 8, tolerance: 1, ok: true }],
      }),
    ];
    expect(getWeakHerbs(records)).toEqual([]);
  });
});
