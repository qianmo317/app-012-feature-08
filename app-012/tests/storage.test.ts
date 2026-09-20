import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadSave,
  saveSave,
  appendRecord,
  makeRecord,
  clearSave,
  getStorageStatus,
  MAX_RECORDS,
  _resetStorageForTest,
} from '../src/storage';
import type { NewRecord } from '../src/records';

function fakeStorage(): Storage & { failOnSet?: boolean } {
  const map = new Map<string, string>();
  const s = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      if ((s as any).failOnSet) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: (_i: number) => null,
    length: 0,
  };
  return s as unknown as Storage & { failOnSet?: boolean };
}

function newRecord(ts: number, level: number, score: number, extra: Partial<NewRecord> = {}): NewRecord {
  return {
    ts,
    mode: extra.mode ?? 'campaign',
    level,
    score,
    totalScore: extra.totalScore ?? score,
    outcome: extra.outcome ?? 'passed',
    passed: extra.passed ?? true,
    reviewCorrect: 'reviewCorrect' in extra ? extra.reviewCorrect : true,
    timeUsed: extra.timeUsed ?? 10,
    attempts: extra.attempts ?? [],
  };
}

let storage: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  storage = fakeStorage();
  _resetStorageForTest(storage);
});

afterEach(() => {
  _resetStorageForTest(null);
});

describe('loadSave', () => {
  it('没有存档时返回空档且状态 ok（表示没打过，不是存不了）', () => {
    const { data, status } = loadSave();
    expect(status).toBe('ok');
    expect(data.records).toEqual([]);
    expect(data.highestScore).toBe(0);
  });

  it('能读回旧版只有最高分/最高关卡的存档', () => {
    storage.setItem('apothecary-weighing-v1', JSON.stringify({ highestScore: 888, highestLevel: 7, lastPlayed: 123 }));
    const { data, status } = loadSave();
    expect(status).toBe('ok');
    expect(data.highestScore).toBe(888);
    expect(data.highestLevel).toBe(7);
    expect(data.records).toEqual([]);
  });

  it('存档损坏时返回 corrupt 与空档，而不是崩掉', () => {
    storage.setItem('apothecary-weighing-v1', '{不是 JSON');
    const { data, status } = loadSave();
    expect(status).toBe('corrupt');
    expect(data.records).toEqual([]);
  });

  it('localStorage 不可用时返回 unavailable', () => {
    _resetStorageForTest(null);
    const { status } = loadSave();
    expect(status).toBe('unavailable');
    expect(getStorageStatus()).toBe('unavailable');
  });
});

describe('appendRecord', () => {
  it('每打完一关即追加一条，并更新最高分/最高关卡', () => {
    expect(appendRecord(makeRecord(newRecord(1000, 1, 150))).ok).toBe(true);
    expect(appendRecord(makeRecord(newRecord(2000, 2, 120, { totalScore: 270 }))).ok).toBe(true);

    const { data } = loadSave();
    expect(data.records).toHaveLength(2);
    expect(data.records[0].level).toBe(1);
    expect(data.records[1].score).toBe(120);
    expect(data.highestScore).toBe(270);
    expect(data.highestLevel).toBe(2);
    expect(data.lastPlayed).toBe(2000);
    // id/date 自动补全
    expect(data.records[0].id).toBeTruthy();
    expect(data.records[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('失败的关卡也记录，且不抬高最高关卡', () => {
    appendRecord(makeRecord(newRecord(1000, 3, 0, { passed: false, outcome: 'failed', reviewCorrect: false })));
    const { data } = loadSave();
    expect(data.records[0].passed).toBe(false);
    expect(data.records[0].reviewCorrect).toBe(false);
    expect(data.highestLevel).toBe(0);
  });

  it('超时关卡的复核对错记为 null', () => {
    appendRecord(makeRecord(newRecord(1000, 4, 60, { passed: false, outcome: 'timeout', reviewCorrect: null })));
    expect(loadSave().data.records[0].reviewCorrect).toBeNull();
  });

  it('超过上限时丢弃最旧的，保留最近的 MAX_RECORDS 条', () => {
    for (let i = 0; i < MAX_RECORDS + 10; i++) {
      appendRecord(makeRecord(newRecord(1000 + i, (i % 12) + 1, 100)));
    }
    const { data } = loadSave();
    expect(data.records).toHaveLength(MAX_RECORDS);
    expect(data.records[0].ts).toBe(1000 + 10);
    expect(data.records[data.records.length - 1].ts).toBe(1000 + MAX_RECORDS + 9);
  });

  it('写入被拒（配额/隐私模式）时返回失败状态，让界面能提示“存不了”', () => {
    storage.failOnSet = true;
    const result = appendRecord(makeRecord(newRecord(1000, 1, 100)));
    expect(result.ok).toBe(false);
    expect(['quota', 'unavailable']).toContain(result.status);
    // 读不到新记录，说明确实没存进去而不是悄悄成功
    expect(loadSave().data.records).toHaveLength(0);
  });
});

describe('saveSave / clearSave', () => {
  it('clearSave 清空全部成绩', () => {
    appendRecord(makeRecord(newRecord(1000, 1, 100)));
    expect(clearSave().ok).toBe(true);
    const { data } = loadSave();
    expect(data.records).toEqual([]);
    expect(data.highestScore).toBe(0);
  });

  it('存储不可用时 save/clear 都报失败', () => {
    _resetStorageForTest(null);
    expect(saveSave({ highestScore: 1, highestLevel: 1, lastPlayed: 1, records: [] }).ok).toBe(false);
    expect(clearSave().ok).toBe(false);
  });
});
