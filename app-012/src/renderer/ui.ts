import type { Prescription, WeighResult, LevelRecord } from '../types';
import type { StorageStatus } from '../storage';
import { dayLabel, isToday, summarizeRecentDays, getWeakHerbs, compareWithPrevious } from '../records';
import type { DaySummary } from '../records';

export interface HistoryViewData {
  status: StorageStatus;
  records: LevelRecord[];
  selectedDate: string;
  /** 非 0 表示清除按钮正处在二次确认状态（到期时间戳） */
  clearConfirmUntil: number;
  now: number;
}

export class UIRenderer {
  prescriptionX: number = 20;
  prescriptionY: number = 60;
  prescriptionW: number = 260;
  buttonRects: Array<{ x: number; y: number; w: number; h: number; action: string }> = [];

  layout(canvasW: number, _canvasH: number): void {
    this.prescriptionX = 20;
    this.prescriptionY = 60;
    this.prescriptionW = Math.min(260, canvasW * 0.3);
  }

  drawPrescription(ctx: CanvasRenderingContext2D, prescription: Prescription, weighed: Set<string>, currentHerb: string | null): void {
    const x = this.prescriptionX;
    const y = this.prescriptionY;
    const w = this.prescriptionW;
    const lineH = 32;

    ctx.fillStyle = 'rgba(255, 252, 245, 0.95)';
    ctx.fillRect(x, y, w, prescription.items.length * lineH + 50);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, prescription.items.length * lineH + 50);

    ctx.fillStyle = '#8b4513';
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('处方', x + 10, y + 24);

    prescription.items.forEach((item, i) => {
      const iy = y + 44 + i * lineH;
      const isWeighed = weighed.has(item.herb);
      const isCurrent = currentHerb === item.herb;

      if (isCurrent) {
        ctx.fillStyle = 'rgba(212, 165, 116, 0.3)';
        ctx.fillRect(x + 4, iy - 18, w - 8, lineH - 2);
      }

      ctx.fillStyle = isWeighed ? '#999' : '#333';
      ctx.font = `${isWeighed ? '' : 'bold '}15px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'left';
      let text = `${item.herb} ${item.grams}g`;
      if (item.decoct === 'first') text += ' [先煎]';
      if (item.decoct === 'last') text += ' [后下]';
      ctx.fillText(text, x + 12, iy);

      if (isWeighed) {
        ctx.beginPath();
        ctx.moveTo(x + 12, iy - 4);
        ctx.lineTo(x + w - 12, iy - 4);
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  }

  drawStatus(ctx: CanvasRenderingContext2D, level: number, score: number, combo: number, queue: number, satisfaction: number, timeLeft: number | null): void {
    const x = 20;
    const y = 10;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, 600, 48);

    ctx.fillStyle = '#f5e6d3';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    let text = `第${level}关  分数:${score}  连击:${combo}  排队:${queue}  满意度:${satisfaction}`;
    if (timeLeft !== null) {
      const color = timeLeft < 10 ? '#ff4444' : '#f5e6d3';
      ctx.fillStyle = color;
      text += `  时间:${Math.ceil(timeLeft)}s`;
    }
    ctx.fillText(text, x, y + 24);
  }

  drawPackageArea(ctx: CanvasRenderingContext2D, _canvasW: number, canvasH: number, packages: Array<{ herb: string; grams: number; decoct: string }>): void {
    const x = 20;
    const y = canvasH - 120;
    const w = 400;
    const h = 100;

    ctx.fillStyle = 'rgba(245, 230, 211, 0.9)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#8b4513';
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('已分包', x + 10, y + 20);

    packages.forEach((pkg, i) => {
      const px = x + 10 + (i % 4) * 95;
      const py = y + 36 + Math.floor(i / 4) * 28;
      ctx.fillStyle = '#fff8f0';
      ctx.fillRect(px, py, 88, 24);
      ctx.strokeStyle = '#d4a574';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, 88, 24);
      ctx.fillStyle = '#333';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let label = `${pkg.herb}`;
      if (pkg.decoct !== 'normal') label += '*';
      ctx.fillText(label, px + 44, py + 12);
    });
  }

  drawButtons(_ctx: CanvasRenderingContext2D): void {
    this.buttonRects = [];
  }

  drawMenu(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, highestScore: number, highestLevel: number, storageStatus: StorageStatus = 'ok'): void {
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    ctx.fillStyle = '#d4a574';
    ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('中药柜抓药', cx, cy - 150);
    ctx.font = '20px "Microsoft YaHei", sans-serif';
    ctx.fillText('戥子称重模拟', cx, cy - 110);

    const buttons = [
      { label: '开始游戏', action: 'start' },
      { label: '无尽模式', action: 'endless' },
      { label: '战绩记录', action: 'history' },
    ];

    this.buttonRects = [];
    buttons.forEach((btn, i) => {
      const bx = cx - 80;
      const by = cy - 50 + i * 60;
      const bw = 160;
      const bh = 44;

      ctx.fillStyle = '#6b4e23';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#d4a574';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);

      ctx.fillStyle = '#f5e6d3';
      ctx.font = '18px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, cx, by + bh / 2);

      this.buttonRects.push({ x: bx, y: by, w: bw, h: bh, action: btn.action });
    });

    ctx.fillStyle = '#888';
    ctx.font = '14px sans-serif';
    ctx.fillText(`最高分: ${highestScore}  最高关卡: ${highestLevel}`, cx, cy + 150);

    if (storageStatus !== 'ok') {
      ctx.fillStyle = '#ffb347';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.fillText(this.storageHint(storageStatus), cx, cy + 178);
    }
  }

  private storageHint(status: StorageStatus): string {
    if (status === 'unavailable') return '⚠ 浏览器禁用了本地存储，本次成绩将无法保存';
    if (status === 'quota') return '⚠ 存储空间已满，新的成绩可能存不进去';
    return '⚠ 旧的存档已损坏，历史成绩无法读取';
  }

  /** 游戏内顶部细条：存不了时一眼能看出来，而不是误以为自己没打过 */
  drawStorageWarning(ctx: CanvasRenderingContext2D, canvasW: number, status: StorageStatus): void {
    if (status === 'ok') return;
    ctx.fillStyle = 'rgba(120, 60, 0, 0.85)';
    ctx.fillRect(canvasW - 320, 54, 310, 26);
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 1;
    ctx.strokeRect(canvasW - 320, 54, 310, 26);
    ctx.fillStyle = '#ffd9a0';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.storageHint(status), canvasW - 165, 67);
  }

  drawHistory(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, data: HistoryViewData): void {
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const pad = 24;
    ctx.fillStyle = '#d4a574';
    ctx.font = 'bold 24px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('战绩记录 · 最近七天', pad, 36);

    const days = summarizeRecentDays(data.records, 7, data.now);
    const status = data.status;

    // 状态行：区分「没打过」和「存不了」
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    if (status !== 'ok') {
      ctx.fillStyle = '#ffb347';
      ctx.fillText(this.storageHint(status), pad, 64);
    } else if (data.records.length === 0) {
      ctx.fillStyle = '#999';
      ctx.fillText('还没有打过任何一关，成绩会在每关结束时自动记下。', pad, 64);
    } else {
      ctx.fillStyle = '#999';
      ctx.fillText(`共 ${data.records.length} 条成绩（超过上限会自动丢弃最旧的）`, pad, 64);
    }

    const colsTop = 86;
    const gap = 6;
    const colW = Math.min(150, Math.max(30, (canvasW - pad * 2 - gap * 6) / 7));
    const colsH = Math.max(132, Math.min(168, canvasH * 0.25));
    this.buttonRects = [];

    days.forEach((day, i) => {
      const x = pad + i * (colW + gap);
      const selected = day.date === data.selectedDate;
      ctx.fillStyle = selected ? 'rgba(212,165,116,0.35)' : 'rgba(255,252,245,0.07)';
      ctx.fillRect(x, colsTop, colW, colsH);
      ctx.strokeStyle = selected ? '#d4a574' : 'rgba(212,165,116,0.35)';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(x, colsTop, colW, colsH);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isToday(day.date, data.now) ? '#f0c674' : '#d8c4a8';
      ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
      const label = dayLabel(day.date);
      ctx.fillText(colW < 80 ? label.replace(' 周', '\n周').split('\n')[0] : label, x + 6, colsTop + 12);
      if (colW < 80) {
        ctx.fillText(label.slice(label.indexOf('周')), x + 6, colsTop + 25);
      }

      if (day.count === 0) {
        ctx.fillStyle = '#777';
        ctx.font = '12px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(status === 'ok' ? '未游玩' : '—', x + colW / 2, colsTop + colsH / 2 + 8);
      } else {
        const narrow = colW < 80;
        const lines = [
          `${day.count}关`,
          narrow ? `均${day.avgScore}` : `均分 ${day.avgScore}`,
          narrow ? `高${day.bestScore}` : `最高 ${day.bestScore}`,
          `过${day.passedCount}/${day.count}`,
        ];
        if (day.reviewWrongCount > 0) lines.push(narrow ? `错${day.reviewWrongCount}` : `复核错 ${day.reviewWrongCount}`);
        ctx.font = narrow ? '11px sans-serif' : '12px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'left';
        lines.forEach((line, li) => {
          ctx.fillStyle = li === 1 ? '#e8dcc8' : '#b8a88f';
          ctx.fillText(line, x + 6, colsTop + 34 + li * 18);
        });
      }

      this.buttonRects.push({ x, y: colsTop, w: colW, h: colsH, action: `day-${day.date}` });
    });

    const bodyTop = colsTop + colsH + 16;
    const bodyH = canvasH - bodyTop - 70;
    const panelW = canvasW - pad * 2;
    // 窄屏放两行布局，宽屏左右两栏
    const stacked = panelW < 600;
    const leftW = stacked ? panelW : Math.round(panelW * 0.62) - 6;
    const rightW = stacked ? panelW : panelW - leftW - 12;

    // 左下：选中当天的逐关明细，标明比上次同关好还是差
    const selected: DaySummary = days.find(d => d.date === data.selectedDate) ?? days[days.length - 1];
    const leftBox = { x: pad, y: bodyTop, w: leftW, h: stacked ? Math.floor(bodyH * 0.56) - 6 : bodyH };
    ctx.fillStyle = 'rgba(255,252,245,0.06)';
    ctx.fillRect(leftBox.x, leftBox.y, leftBox.w, leftBox.h);
    ctx.strokeStyle = 'rgba(212,165,116,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(leftBox.x, leftBox.y, leftBox.w, leftBox.h);

    ctx.fillStyle = '#d4a574';
    ctx.font = 'bold 15px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${dayLabel(selected.date)} 逐关成绩`, leftBox.x + 12, leftBox.y + 18);

    if (selected.records.length === 0) {
      ctx.fillStyle = '#888';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.fillText(status === 'ok' ? '这天没有游玩记录。' : '存储不可用，读不到这天的成绩。', leftBox.x + 12, leftBox.y + 48);
    } else {
      const listTop = leftBox.y + 46;
      const narrowText = leftBox.w < 300;
      const rowH = narrowText ? 40 : 28;
      const maxShown = Math.max(1, Math.min(selected.records.length, Math.floor((leftBox.h - 48) / rowH)));
      const shown = selected.records.slice(0, maxShown);
      shown.forEach((r, i) => {
        const cmp = compareWithPrevious(data.records, r);
        const ry = listTop + i * rowH;
        const time = new Date(r.ts);
        const hm = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;

        ctx.fillStyle = '#cbb89a';
        ctx.font = '13px sans-serif';
        ctx.fillText(hm, leftBox.x + 12, ry);

        ctx.fillStyle = r.passed ? '#90ee90' : r.outcome === 'timeout' ? '#ffb347' : '#ff8080';
        ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
        const mark = r.passed ? '✓' : r.outcome === 'timeout' ? '时' : '败';
        ctx.fillText(mark, leftBox.x + 62, ry);

        ctx.fillStyle = '#e8dcc8';
        ctx.font = '13px "Microsoft YaHei", sans-serif';
        ctx.fillText(`第${r.level}关 ${r.score}分`, leftBox.x + 82, ry);

        let suffix = '';
        if (cmp.trend === 'first') suffix = '首次';
        else if (cmp.trend === 'better') suffix = `▲ 比上次 +${cmp.diff}`;
        else if (cmp.trend === 'worse') suffix = `▼ 比上次 ${cmp.diff}`;
        else suffix = '＝ 与上次持平';

        if (r.reviewCorrect === false) suffix += '  ⚠复核答错';

        ctx.fillStyle = cmp.trend === 'better' ? '#90ee90' : cmp.trend === 'worse' ? '#ff8080' : '#a99676';
        ctx.font = '12px "Microsoft YaHei", sans-serif';
        if (narrowText) {
          ctx.fillText(suffix, leftBox.x + 82, ry + 16);
        } else {
          ctx.fillText(suffix, leftBox.x + 180, ry);
        }
      });
      const hidden = selected.records.length - maxShown;
      if (hidden > 0) {
        ctx.fillStyle = '#888';
        ctx.font = '12px "Microsoft YaHei", sans-serif';
        ctx.fillText(`还有 ${hidden} 条更早的未列出`, leftBox.x + 12, listTop + maxShown * rowH + 6);
      }
    }

    // 右下/下方：老是称不准的药（基于全部历史）
    const rightBox = stacked
      ? { x: pad, y: leftBox.y + leftBox.h + 12, w: rightW, h: bodyH - leftBox.h - 12 }
      : { x: pad + leftW + 12, y: bodyTop, w: rightW, h: bodyH };
    ctx.fillStyle = 'rgba(255,252,245,0.06)';
    ctx.fillRect(rightBox.x, rightBox.y, rightBox.w, rightBox.h);
    ctx.strokeStyle = 'rgba(212,165,116,0.3)';
    ctx.strokeRect(rightBox.x, rightBox.y, rightBox.w, rightBox.h);

    ctx.fillStyle = '#d4a574';
    ctx.font = 'bold 15px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('称不准的药（全部历史）', rightBox.x + 12, rightBox.y + 18);

    const weak = getWeakHerbs(data.records, 5);
    if (weak.length === 0) {
      ctx.fillStyle = '#888';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.fillText(status === 'ok' ? '暂时没有失准记录，秤握得很稳。' : '存储不可用，无法统计。', rightBox.x + 12, rightBox.y + 48);
    } else {
      const maxWeak = Math.max(1, Math.min(weak.length, Math.floor((rightBox.h - 40) / 30)));
      weak.slice(0, maxWeak).forEach((s, i) => {
        const wy = rightBox.y + 48 + i * 30;
        ctx.fillStyle = '#e8dcc8';
        ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
        ctx.fillText(`${i + 1}. ${s.herb}`, rightBox.x + 12, wy);
        ctx.fillStyle = '#b8a88f';
        ctx.font = '12px "Microsoft YaHei", sans-serif';
        ctx.fillText(`失准 ${s.badCount}/${s.attempts} 次 · 平均偏差 ${s.avgAbsDelta.toFixed(1)}g`, rightBox.x + 12, wy + 16);
      });
    }

    // 底部按钮：返回 + 清除（点两下确认，防手滑）
    const confirming = data.now < data.clearConfirmUntil;
    const back = { x: pad, y: canvasH - 52, w: 120, h: 36 };
    this.drawPillButton(ctx, back.x, back.y, back.w, back.h, '返回菜单');
    this.buttonRects.push({ ...back, action: 'back-menu' });

    const clear = { x: canvasW - pad - 170, y: canvasH - 52, w: 170, h: 36 };
    const canClear = status === 'ok';
    this.drawPillButton(ctx, clear.x, clear.y, clear.w, clear.h, confirming ? '再点一次确认清空' : '清空全部成绩', confirming, canClear);
    if (canClear) {
      this.buttonRects.push({ ...clear, action: confirming ? 'clear-confirm' : 'clear-ask' });
    }

    if (status !== 'ok') {
      ctx.fillStyle = '#ffb347';
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('当前存储不可用，没有成绩可以清空', clear.x - 12, canvasH - 34);
    }
  }

  private drawPillButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, danger = false, enabled = true): void {
    ctx.fillStyle = enabled ? danger ? '#7a2323' : '#6b4e23' : '#44403c';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = enabled ? danger ? '#ff8080' : '#d4a574' : '#666';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = enabled ? '#f5e6d3' : '#999';
    ctx.font = '15px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
  }

  drawReview(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, herb: string, options: number[], selected: number | null, result: boolean | null): void {
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const w = 360;
    const h = 240;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = '#fff8f0';
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);

    ctx.fillStyle = '#8b4513';
    ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`复核：刚才 ${herb} 抓了多少克？`, cx, cy - 70);

    this.buttonRects = [];
    options.forEach((opt, i) => {
      const bx = cx - 140 + i * 100;
      const by = cy - 20;
      const bw = 80;
      const bh = 44;

      ctx.fillStyle = selected === opt && result === false ? '#ff6b6b' : selected === opt && result === true ? '#90ee90' : '#f5e6d3';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#8b6914';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);

      ctx.fillStyle = '#333';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${opt}g`, bx + bw / 2, by + bh / 2);

      this.buttonRects.push({ x: bx, y: by, w: bw, h: bh, action: `review-${opt}` });
    });

    if (result !== null) {
      ctx.fillStyle = result ? '#228b22' : '#dc143c';
      ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
      ctx.fillText(result ? '回答正确！' : '回答错误！', cx, cy + 50);
    }
  }

  drawResult(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, score: number, level: number, results: WeighResult[], passed: boolean, lastSaveStatus: StorageStatus | null = null): void {
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = '#fff8f0';
    ctx.fillRect(cx - 200, cy - 180, 400, 360);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - 200, cy - 180, 400, 360);

    ctx.fillStyle = passed ? '#228b22' : '#dc143c';
    ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(passed ? '关卡通过！' : '关卡失败', cx, cy - 140);

    ctx.fillStyle = '#333';
    ctx.font = '18px sans-serif';
    ctx.fillText(`第${level}关  得分: ${score}`, cx, cy - 100);

    results.forEach((r, i) => {
      const ry = cy - 60 + i * 28;
      const color = r.ok ? '#228b22' : '#dc143c';
      ctx.fillStyle = color;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${r.herb}: 目标${r.target}g 实际${r.actual.toFixed(1)}g 差${r.deltaG > 0 ? '+' : ''}${r.deltaG.toFixed(1)}g`, cx - 160, ry);
    });

    // 本关成绩是否落盘：存不下要让玩家看出来，而不是以为系统记了
    // 弹窗外（药味列表可能占满弹窗），放底部留白处
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    if (lastSaveStatus === 'ok') {
      ctx.fillStyle = '#9aa87c';
      ctx.fillText('本关成绩已记入战绩', cx, cy + 205);
    } else if (lastSaveStatus !== null) {
      ctx.fillStyle = '#ffb347';
      ctx.fillText('⚠ 本关成绩未能保存（本地存储不可用）', cx, cy + 205);
    }

    this.buttonRects = [];
    const btnLabel = passed ? '下一关' : '重试';
    const bx = cx - 60;
    const by = cy + 140;
    const bw = 120;
    const bh = 40;

    ctx.fillStyle = '#6b4e23';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = '#f5e6d3';
    ctx.font = '18px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btnLabel, cx, by + bh / 2);

    this.buttonRects.push({ x: bx, y: by, w: bw, h: bh, action: passed ? 'next' : 'retry' });
  }

  drawGameOver(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, score: number, level: number, lastSaveStatus: StorageStatus | null = null): void {
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = '#dc143c';
    ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('病人都走光了', cx, cy - 60);

    ctx.fillStyle = '#f5e6d3';
    ctx.font = '20px sans-serif';
    ctx.fillText(`最终得分: ${score}  通过关卡: ${level}`, cx, cy);

    ctx.font = '13px "Microsoft YaHei", sans-serif';
    if (lastSaveStatus === 'ok') {
      ctx.fillStyle = '#7fae6e';
      ctx.fillText('本局各关成绩已记入战绩', cx, cy + 32);
    } else if (lastSaveStatus !== null) {
      ctx.fillStyle = '#ffb347';
      ctx.fillText('⚠ 成绩未能保存（本地存储不可用）', cx, cy + 32);
    }

    this.buttonRects = [];
    const bw = 120;
    const bh = 40;
    const by = cy + 50;
    const bxMenu = cx + 10;
    const bxHistory = cx - bw - 10;

    this.drawPillButton(ctx, bxHistory, by, bw, bh, '战绩记录');
    this.buttonRects.push({ x: bxHistory, y: by, w: bw, h: bh, action: 'history' });

    this.drawPillButton(ctx, bxMenu, by, bw, bh, '返回菜单');
    this.buttonRects.push({ x: bxMenu, y: by, w: bw, h: bh, action: 'menu' });
  }

  drawInstructions(ctx: CanvasRenderingContext2D, _canvasW: number, canvasH: number): void {
    const x = 20;
    const y = canvasH - 80;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y, 500, 70);
    ctx.fillStyle = '#ccc';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('操作: 1-9选抽屉 / 拖拽药材到秤盘 / 滚轮微调 / 空格确认 / Z归零', x + 10, y + 10);
    ctx.fillText('目标: 按处方抓药，误差在允许范围内', x + 10, y + 30);
    ctx.fillText('注意: 先煎/后下药要单独分包', x + 10, y + 48);
  }

  drawTareButton(ctx: CanvasRenderingContext2D, x: number, y: number, active: boolean): void {
    ctx.fillStyle = active ? '#d4a574' : '#f5e6d3';
    ctx.fillRect(x, y, 60, 32);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 60, 32);
    ctx.fillStyle = '#333';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('归零', x + 30, y + 16);
  }
}
