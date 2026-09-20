import type { LevelRecord } from './types';
import { localDateKey } from './records';

const STORAGE_KEY = 'apothecary-weighing-v1';

/** 最多保留多少条战绩，防止 localStorage 被撑爆 */
export const MAX_RECORDS = 1000;

export interface SaveData {
  highestScore: number;
  highestLevel: number;
  lastPlayed: number;
  records: LevelRecord[];
}

/**
 * 存储状态：
 * - 'ok'           读写正常
 * - 'unavailable'  浏览器禁用/不支持 localStorage（存不了，不是没打）
 * - 'quota'        写满或被策略拦截，写入失败
 * - 'corrupt'      旧存档内容损坏，无法解析
 */
export type StorageStatus = 'ok' | 'unavailable' | 'quota' | 'corrupt';

interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let status: StorageStatus = 'ok';
let backend: StorageBackend | null = null;

function getBackend(): StorageBackend | null {
  if (backend !== null) return backend;
  try {
    const ls = globalThis.localStorage;
    // 有些浏览器（隐私模式）对象在，但一写就抛异常，探一下
    ls.setItem(STORAGE_KEY + '-probe', '1');
    ls.removeItem(STORAGE_KEY + '-probe');
    backend = ls;
  } catch {
    backend = null;
    status = 'unavailable';
  }
  return backend;
}

export function getStorageStatus(): StorageStatus {
  getBackend();
  return status;
}

/** 供单元测试重置内部缓存 */
export function _resetStorageForTest(forced: StorageBackend | null): void {
  backend = forced;
  status = forced ? 'ok' : 'unavailable';
}

const EMPTY: SaveData = { highestScore: 0, highestLevel: 0, lastPlayed: 0, records: [] };

function normalize(raw: unknown): SaveData {
  if (typeof raw !== 'object' || raw === null) return { ...EMPTY };
  const d = raw as Record<string, unknown>;
  const records = Array.isArray(d.records) ? (d.records as LevelRecord[]) : [];
  return {
    highestScore: typeof d.highestScore === 'number' ? d.highestScore : 0,
    highestLevel: typeof d.highestLevel === 'number' ? d.highestLevel : 0,
    lastPlayed: typeof d.lastPlayed === 'number' ? d.lastPlayed : 0,
    records: records.filter(r => r && typeof r.ts === 'number' && typeof r.level === 'number'),
  };
}

/**
 * 读存档。
 * @returns data 永远有效（损坏/不可用时为空档）；status 说明真实情况，
 *          'ok' 且 records 为空才是真的没打过。
 */
export function loadSave(): { data: SaveData; status: StorageStatus } {
  const ls = getBackend();
  if (!ls) return { data: { ...EMPTY }, status: 'unavailable' };
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (raw === null) {
      status = 'ok';
      return { data: { ...EMPTY }, status: 'ok' };
    }
    return { data: normalize(JSON.parse(raw)), status: 'ok' };
  } catch {
    status = 'corrupt';
    return { data: { ...EMPTY }, status: 'corrupt' };
  }
}

export interface SaveResult {
  ok: boolean;
  status: StorageStatus;
}

function persist(data: SaveData): SaveResult {
  const ls = getBackend();
  if (!ls) return { ok: false, status: 'unavailable' };
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(data));
    status = 'ok';
    return { ok: true, status: 'ok' };
  } catch {
    // QuotaExceededError 或隐私模式写入被拒
    status = 'quota';
    return { ok: false, status: 'quota' };
  }
}

export function saveSave(data: SaveData): SaveResult {
  return persist(data);
}

/**
 * 追加一条打完的关卡成绩，同时更新最高分/最高关卡。
 * 存档超限时从最旧的开始裁剪到 MAX_RECORDS 条后重试一次。
 */
export function appendRecord(record: LevelRecord): SaveResult {
  const { data } = loadSave();
  let records = [...data.records, record];
  if (records.length > MAX_RECORDS) records = records.slice(records.length - MAX_RECORDS);

  const next: SaveData = {
    highestScore: Math.max(data.highestScore, record.totalScore),
    highestLevel: Math.max(data.highestLevel, record.passed ? record.level : 0),
    lastPlayed: record.ts,
    records,
  };

  const result = persist(next);
  if (!result.ok && next.records.length > 1) {
    // 写满了：再丢一半最旧的战绩重试一次，摘要字段（最高分等）不受影响
    next.records = next.records.slice(Math.floor(next.records.length / 2));
    return persist(next);
  }
  return result;
}

export function makeRecord(init: Omit<LevelRecord, 'id' | 'date'> & { id?: string; date?: string }): LevelRecord {
  return {
    ts: init.ts,
    id: init.id ?? `r-${init.ts}-${Math.random().toString(36).slice(2, 8)}`,
    date: init.date ?? localDateKey(init.ts),
    mode: init.mode,
    level: init.level,
    score: init.score,
    totalScore: init.totalScore,
    outcome: init.outcome,
    passed: init.passed,
    reviewCorrect: init.reviewCorrect,
    timeUsed: init.timeUsed,
    attempts: init.attempts,
  };
}

export function clearSave(): SaveResult {
  const ls = getBackend();
  if (!ls) return { ok: false, status: 'unavailable' };
  try {
    ls.removeItem(STORAGE_KEY);
    status = 'ok';
    return { ok: true, status: 'ok' };
  } catch {
    status = 'quota';
    return { ok: false, status: 'quota' };
  }
}
