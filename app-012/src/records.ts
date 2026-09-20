import type { LevelRecord } from './types';

/** GameManager 刚产出、还没落盘补 id/date 的战绩 */
export type NewRecord = Omit<LevelRecord, 'id' | 'date'>;

/** 时间戳转本地日期键 YYYY-MM-DD（按天归组，不走 UTC） */
export function localDateKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 以 refTs 当天为最后一天，往前取 days 天的日期键（含空白天） */
export function recentDateKeys(days: number, refTs: number = Date.now()): string[] {
  const keys: string[] = [];
  const base = new Date(refTs);
  base.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    keys.push(localDateKey(d.getTime()));
  }
  return keys;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 展示用短标签：9/20 周六 */
export function dayLabel(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number);
  const dt = parseLocalDate(dateKey);
  return `${m}/${d} 周${WEEKDAYS[dt.getDay()]}`;
}

// 直接 new Date('YYYY-MM-DD') 会按 UTC 解析，这里老老实实按本地拼
function parseLocalDate(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 判断日期键是不是今天 */
export function isToday(dateKey: string, now: number = Date.now()): boolean {
  return dateKey === localDateKey(now);
}

export interface DaySummary {
  date: string;
  /** 当天打了几关（含失败/超时） */
  count: number;
  passedCount: number;
  reviewWrongCount: number;
  /** 平均每关得分；当天没打为 null */
  avgScore: number | null;
  bestScore: number | null;
  /** 当天的战绩，按时间先后排列 */
  records: LevelRecord[];
}

/** 把战绩按天归组；返回顺序按日期先后 */
export function groupByDate(records: LevelRecord[]): Map<string, LevelRecord[]> {
  const map = new Map<string, LevelRecord[]>();
  for (const r of [...records].sort((a, b) => a.ts - b.ts)) {
    const list = map.get(r.date);
    if (list) list.push(r);
    else map.set(r.date, [r]);
  }
  return map;
}

/** 最近 days 天每天一摊：打了几关、平均分、过了几关、复核错几关 */
export function summarizeRecentDays(records: LevelRecord[], days: number = 7, now: number = Date.now()): DaySummary[] {
  const grouped = groupByDate(records);
  return recentDateKeys(days, now).map(date => {
    const dayRecords = grouped.get(date) ?? [];
    const count = dayRecords.length;
    let sum = 0;
    let best: number | null = null;
    let passedCount = 0;
    let reviewWrongCount = 0;
    for (const r of dayRecords) {
      sum += r.score;
      best = best === null ? r.score : Math.max(best, r.score);
      if (r.passed) passedCount++;
      if (r.reviewCorrect === false) reviewWrongCount++;
    }
    return {
      date,
      count,
      passedCount,
      reviewWrongCount,
      avgScore: count > 0 ? Math.round(sum / count) : null,
      bestScore: best,
      records: dayRecords,
    };
  });
}

export type Trend = 'better' | 'worse' | 'same' | 'first';

export interface LevelComparison {
  prev: LevelRecord | null;
  trend: Trend;
  /** 本关得分 - 上一次同关得分 */
  diff: number;
}

/**
 * 与上一次打同一关的成绩比好坏。
 * 优先同模式的历史；没有则退回任意模式；都没有就是头一回。
 */
export function compareWithPrevious(records: LevelRecord[], current: LevelRecord): LevelComparison {
  const earlier = records
    .filter(r => r.level === current.level && r.ts < current.ts)
    .sort((a, b) => b.ts - a.ts);
  const prev = earlier.find(r => r.mode === current.mode) ?? earlier[0] ?? null;
  if (!prev) return { prev: null, trend: 'first', diff: 0 };
  const diff = current.score - prev.score;
  return { prev, diff, trend: diff > 0 ? 'better' : diff < 0 ? 'worse' : 'same' };
}

export interface HerbWeakStat {
  herb: string;
  /** 称量尝试次数（含超差重来） */
  attempts: number;
  /** 没称准（警告/失败）的次数 */
  badCount: number;
  /** 平均绝对误差（克），越大越没准头 */
  avgAbsDelta: number;
}

/**
 * 统计老是称不准的药：按没称准次数排序，其次按平均误差。
 * 只列出至少称失准过一次的药。
 */
export function getWeakHerbs(records: LevelRecord[], limit: number = 5): HerbWeakStat[] {
  const agg = new Map<string, { attempts: number; bad: number; deltaSum: number }>();
  for (const r of records) {
    for (const a of r.attempts) {
      let s = agg.get(a.herb);
      if (!s) {
        s = { attempts: 0, bad: 0, deltaSum: 0 };
        agg.set(a.herb, s);
      }
      s.attempts++;
      s.deltaSum += Math.abs(a.deltaG);
      if (!a.ok) s.bad++;
    }
  }
  return [...agg.entries()]
    .map(([herb, s]) => ({
      herb,
      attempts: s.attempts,
      badCount: s.bad,
      avgAbsDelta: Math.round((s.deltaSum / s.attempts) * 10) / 10,
    }))
    .filter(s => s.badCount > 0)
    .sort((a, b) => b.badCount - a.badCount || b.avgAbsDelta - a.avgAbsDelta)
    .slice(0, limit);
}
