import type { LevelFinishSummary } from './types';

export const STORAGE_KEY = 'apothecary-weighing-v2';
export const LEGACY_STORAGE_KEY = 'apothecary-weighing-v1';

/** 单关成绩记录（持久化形态） */
export interface LevelRecord {
  id: number;
  date: string; // YYYY-MM-DD，按本地时区
  timestamp: number;
  level: number;
  mode: 'normal' | 'endless';
  passed: boolean;
  timeout: boolean;
  scoreGained: number;
  totalScore: number;
  durationMs: number;
  review: { herb: string; correct: boolean } | null;
  attempts: Array<{ herb: string; target: number; actual: number; tolerance: number; ok: boolean }>;
}

export interface SaveData {
  highestScore: number;
  highestLevel: number;
  lastPlayed: number;
  records: LevelRecord[];
  nextId: number;
}

/**
 * ok: 存储可用
 * denied: localStorage 不可用（隐私模式 / 被浏览器策略禁用）
 * quota: 写入失败（配额满等）
 * corrupt: 已有的存档内容损坏
 */
export type SaveStatus = 'ok' | 'denied' | 'quota' | 'corrupt';

const MAX_RECORDS = 500;
const RETAIN_DAYS = 100;

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memoryFallback: Record<string, string> = {};

export const memoryBackend: StorageBackend = {
  getItem: (key) => (key in memoryFallback ? memoryFallback[key] : null),
  setItem: (key, value) => {
    memoryFallback[key] = value;
  },
  removeItem: (key) => {
    delete memoryFallback[key];
  },
};

export const localStorageBackend: StorageBackend = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};

export interface BackendResult {
  backend: StorageBackend;
  /** true 表示 localStorage 不可用、退化为内存暂存（刷新即丢） */
  volatile: boolean;
}

export function createDefaultBackend(): BackendResult {
  try {
    const testKey = '__apothecary_probe__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return { backend: localStorageBackend, volatile: false };
  } catch {
    return { backend: memoryBackend, volatile: true };
  }
}

export interface HistoryStore {
  getData(): SaveData;
  addRecord(summary: LevelFinishSummary): LevelRecord;
  clear(): void;
  getStatus(): SaveStatus;
}

function emptyData(): SaveData {
  return { highestScore: 0, highestLevel: 0, lastPlayed: 0, records: [], nextId: 1 };
}

export function createHistoryStore(backend: StorageBackend, volatile = false): HistoryStore {
  let data = emptyData();
  let status: SaveStatus = volatile ? 'denied' : 'ok';
  let loaded = false;
  let probed = false;

  /** 把 v1 旧档（只有最高分/最高关卡）迁到 v2；迁移成功后删掉旧档 */
  function migrateLegacy(current: SaveData): SaveData {
    try {
      const raw = backend.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return current;
      const old = JSON.parse(raw) as { highestScore?: number; highestLevel?: number; lastPlayed?: number };
      const migrated: SaveData = {
        highestScore: Math.max(current.highestScore, old.highestScore ?? 0),
        highestLevel: Math.max(current.highestLevel, old.highestLevel ?? 0),
        lastPlayed: Math.max(current.lastPlayed, old.lastPlayed ?? 0),
        records: current.records,
        nextId: current.nextId,
      };
      backend.setItem(STORAGE_KEY, JSON.stringify(migrated));
      backend.removeItem(LEGACY_STORAGE_KEY);
      return migrated;
    } catch {
      return current;
    }
  }

  function load(): SaveData {
    if (loaded) return data;
    loaded = true;
    try {
      const raw = backend.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SaveData>;
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.records)) {
          status = 'corrupt';
          return data;
        }
        data = {
          highestScore: parsed.highestScore ?? 0,
          highestLevel: parsed.highestLevel ?? 0,
          lastPlayed: parsed.lastPlayed ?? 0,
          records: parsed.records as LevelRecord[],
          nextId: typeof parsed.nextId === 'number' ? parsed.nextId : (parsed.records as LevelRecord[]).length + 1,
        };
      } else {
        data = migrateLegacy(data);
      }
    } catch {
      // JSON.parse 抛错：存档损坏
      status = 'corrupt';
    }
    return data;
  }

  function persist(): boolean {
    try {
      backend.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      status = isQuotaError(err) ? 'quota' : 'denied';
      return false;
    }
  }

  return {
    getData() {
      return load();
    },

    addRecord(summary) {
      load();
      const record: LevelRecord = {
        id: data.nextId++,
        date: localDateKey(summary.timestamp),
        timestamp: summary.timestamp,
        level: summary.level,
        mode: summary.mode,
        passed: summary.passed,
        timeout: summary.timeout,
        scoreGained: summary.scoreGained,
        totalScore: summary.totalScore,
        durationMs: summary.durationMs,
        review: summary.review,
        attempts: summary.attempts,
      };

      data.records.push(record);
      pruneRecords(data.records);

      if (summary.passed) {
        data.highestLevel = Math.max(data.highestLevel, summary.level);
      }
      data.highestScore = Math.max(data.highestScore, summary.totalScore);
      data.lastPlayed = summary.timestamp;

      if (!persist()) {
        // 写入失败：内存里仍保留本条，但明确告知调用方没有真正存下来
      }
      return record;
    },

    clear() {
      data = emptyData();
      try {
        backend.removeItem(STORAGE_KEY);
        if (!volatile) status = 'ok';
      } catch {
        status = 'denied';
      }
    },

    getStatus() {
      load();
      if (status !== 'ok') return status;
      if (probed) return status;
      probed = true;
      // 主动探测一次：浏览器可能随时收回存储权限。
      // 用独立探针键，绝不能覆盖已有的损坏存档（用户可能想手动抢救）。
      try {
        backend.setItem('__apothecary_probe__', '1');
        return 'ok';
      } catch (err) {
        status = isQuotaError(err) ? 'quota' : 'denied';
        return status;
      }
    },
  };
}

/** 配额满 / 隐私模式抛的错名不同，按 DOMException 规范与常见浏览器行为判断 */
function isQuotaError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'name' in err) {
    const name = (err as { name?: string }).name;
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  }
  return err instanceof DOMException && (err.code === 22 || err.code === 1014);
}

/** 删除超过保留天数的旧记录，并兜底限制总条数 */
function pruneRecords(records: LevelRecord[]): void {
  const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
  while (records.length > 0 && (records[0].timestamp < cutoff || records.length > MAX_RECORDS)) {
    records.shift();
  }
}

// ---- 纯函数：日期 / 分组 / 统计，方便单测 ----

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function localDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDateLabel(dateKey: string, todayKey = localDateKey(Date.now())): string {
  const [, m, d] = dateKey.split('-');
  const date = new Date(`${dateKey}T00:00:00`);
  const label = `${parseInt(m)}月${parseInt(d)}日 周${WEEKDAYS[date.getDay()]}`;
  if (dateKey === todayKey) return `今天 ${label}`;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateKey === localDateKey(yesterday.getTime())) return `昨天 ${label}`;
  return label;
}

export interface DayGroup {
  date: string;
  records: LevelRecord[];
}

/** 取最近 n 天（含今天，按时间倒序），没有成绩的日子也保留并标空 */
export function groupRecentDays(records: LevelRecord[], days = 7, now = Date.now()): DayGroup[] {
  const groups: DayGroup[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const key = localDateKey(d.getTime());
    groups.push({
      date: key,
      records: records
        .filter(r => r.date === key)
        .sort((a, b) => a.timestamp - b.timestamp),
    });
  }
  return groups;
}

export type TrendDirection = 'up' | 'down' | 'same' | 'first';

/** 和上一次同模式、同关卡的本关得分相比 */
export function compareWithPrevious(records: LevelRecord[], current: LevelRecord): TrendDirection {
  let prev: LevelRecord | null = null;
  for (const r of records) {
    if (r.id === current.id) break;
    if (r.mode === current.mode && r.level === current.level) prev = r;
  }
  if (!prev) return 'first';
  if (current.scoreGained > prev.scoreGained) return 'up';
  if (current.scoreGained < prev.scoreGained) return 'down';
  return 'same';
}

export interface HerbWeakness {
  herb: string;
  attempts: number;
  misses: number;
  avgAbsDelta: number;
}

/** 老是称不准的药：按称错次数降序，其次按平均绝对误差降序 */
export function getWeakHerbs(records: LevelRecord[], limit = 5): HerbWeakness[] {
  const map = new Map<string, { attempts: number; misses: number; deltaSum: number }>();
  for (const r of records) {
    for (const a of r.attempts) {
      const stat = map.get(a.herb) ?? { attempts: 0, misses: 0, deltaSum: 0 };
      stat.attempts++;
      stat.deltaSum += Math.abs(a.actual - a.target);
      if (Math.abs(a.actual - a.target) > a.tolerance) stat.misses++;
      map.set(a.herb, stat);
    }
  }
  return Array.from(map.entries())
    .map(([herb, s]) => ({
      herb,
      attempts: s.attempts,
      misses: s.misses,
      avgAbsDelta: s.attempts > 0 ? s.deltaSum / s.attempts : 0,
    }))
    .filter(h => h.misses > 0)
    .sort((a, b) => b.misses - a.misses || b.avgAbsDelta - a.avgAbsDelta)
    .slice(0, limit);
}

/** 应用启动时使用的默认单例（localStorage，不可用时退化为内存） */
const defaultBackend = createDefaultBackend();
export const store: HistoryStore = createHistoryStore(defaultBackend.backend, defaultBackend.volatile);
