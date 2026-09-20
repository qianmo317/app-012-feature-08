import type { Prescription, WeighResult } from '../types';
import type { DayGroup, HerbWeakness, SaveStatus } from '../storage';

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

  drawMenu(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, highestScore: number, highestLevel: number, status: SaveStatus = 'ok'): void {
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    ctx.fillStyle = '#d4a574';
    ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('中药柜抓药', cx, cy - 120);
    ctx.font = '20px "Microsoft YaHei", sans-serif';
    ctx.fillText('戥子称重模拟', cx, cy - 80);

    const buttons = [
      { label: '开始游戏', action: 'start' },
      { label: '无尽模式', action: 'endless' },
      { label: '最近七天成绩', action: 'history' },
    ];

    this.buttonRects = [];
    buttons.forEach((btn, i) => {
      const bx = cx - 80;
      const by = cy - 20 + i * 60;
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
    ctx.fillText(`最高分: ${highestScore}  最高关卡: ${highestLevel}`, cx, cy + 172);

    this.drawStorageWarning(ctx, canvasW, canvasH, status);
  }

  /** 存不了成绩时的醒目提示，和「还没打过」明确区分开 */
  drawStorageWarning(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, status: SaveStatus): void {
    if (status === 'ok') return;
    const messages: Record<Exclude<SaveStatus, 'ok'>, string> = {
      denied: '⚠ 浏览器禁用了本地存储，本次成绩无法保存！换个浏览器或开启存储权限',
      quota: '⚠ 存储空间已满，新成绩没有存下来！请清理浏览器数据',
      corrupt: '⚠ 旧的成绩存档已损坏，无法读取；新成绩可以正常保存',
    };
    ctx.save();
    ctx.fillStyle = 'rgba(120, 20, 20, 0.92)';
    const bw = Math.min(620, canvasW - 24);
    const bh = 38;
    const bx = (canvasW - bw) / 2;
    const by = canvasH - bh - 14;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#ff8888';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#ffe0e0';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(messages[status], canvasW / 2, by + bh / 2, canvasW - 36);
    ctx.restore();
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

  drawResult(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, score: number, level: number, results: WeighResult[], passed: boolean, levelStartScore: number = score, trend: 'up' | 'down' | 'same' | 'first' = 'first', status: SaveStatus = 'ok'): void {
    const cx = canvasW / 2;
    const lineH = 22;
    const panelW = 400;
    const panelH = Math.min(canvasH - 20, 250 + results.length * lineH);
    const top = Math.max(10, (canvasH - panelH) / 2);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = '#fff8f0';
    ctx.fillRect(cx - panelW / 2, top, panelW, panelH);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - panelW / 2, top, panelW, panelH);

    let ry = top + 34;
    ctx.fillStyle = passed ? '#228b22' : '#dc143c';
    ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(passed ? '关卡通过！' : '关卡失败', cx, ry);
    ry += 32;

    const gained = score - levelStartScore;
    const trendMark = { up: ' ▲比上次好', down: ' ▼比上次差', same: ' ＝与上次持平', first: ' 首次挑战' }[trend];
    const trendColor = { up: '#228b22', down: '#dc143c', same: '#888', first: '#888' }[trend];
    ctx.fillStyle = '#333';
    ctx.font = '17px sans-serif';
    ctx.fillText(`第${level}关  本关得分: ${gained}  累计: ${score}`, cx, ry);
    ry += 22;
    ctx.fillStyle = trendColor;
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillText(trendMark, cx, ry);
    ry += 26;

    results.forEach((r) => {
      const color = r.ok ? '#228b22' : '#dc143c';
      ctx.fillStyle = color;
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${r.herb}: 目标${r.target}g 实际${r.actual.toFixed(1)}g 差${r.deltaG > 0 ? '+' : ''}${r.deltaG.toFixed(1)}g`, cx - panelW / 2 + 18, ry);
      ry += lineH;
    });

    this.buttonRects = [];
    const btnLabel = passed ? '下一关' : '重试';
    const bx = cx - 60;
    const by = Math.min(top + panelH - 48, canvasH - 56);
    const bw = 120;
    const bh = 38;

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

    if (status !== 'ok') {
      this.drawStorageWarning(ctx, canvasW, canvasH, status);
    }
  }

  drawGameOver(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, score: number, level: number, status: SaveStatus = 'ok'): void {
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

    this.buttonRects = [];
    const bx = cx - 60;
    const by = cy + 50;
    const bw = 120;
    const bh = 40;

    ctx.fillStyle = '#6b4e23';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = '#f5e6d3';
    ctx.font = '18px "Microsoft YaHei", sans-serif';
    ctx.fillText('返回菜单', cx, by + bh / 2);

    this.buttonRects.push({ x: bx, y: by, w: bw, h: bh, action: 'menu' });

    if (status !== 'ok') {
      this.drawStorageWarning(ctx, canvasW, canvasH, status);
    }
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

  drawHistory(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    days: DayGroup[],
    weakHerbs: HerbWeakness[],
    status: SaveStatus,
    confirmClear: boolean,
    formatDateLabel: (dateKey: string) => string,
    allRecords: import('../storage').LevelRecord[],
    compareWithPrevious: (records: import('../storage').LevelRecord[], current: import('../storage').LevelRecord) => 'up' | 'down' | 'same' | 'first',
  ): void {
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const margin = Math.max(12, Math.min(28, canvasW * 0.04));
    const contentW = canvasW - margin * 2;

    ctx.fillStyle = '#d4a574';
    ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('最近七天成绩', margin, 12);

    this.buttonRects = [];

    let y = 44;
    const chipH = 44;
    const chipGap = 5;

    days.forEach(day => {
      const passedCount = day.records.filter(r => r.passed).length;
      const scoreSum = day.records.reduce((s, r) => s + r.scoreGained, 0);
      ctx.fillStyle = '#c9a36a';
      ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
      const head = day.records.length > 0
        ? `${formatDateLabel(day.date)}  ${day.records.length}关 · 过${passedCount}关 · 本关得分合计${scoreSum}`
        : `${formatDateLabel(day.date)}  没有打`;
      ctx.fillText(head, margin, y);
      y += 18;

      if (day.records.length === 0) {
        ctx.fillStyle = '#6b5d48';
        ctx.font = '12px "Microsoft YaHei", sans-serif';
        ctx.fillText('— 无记录 —', margin + 8, y);
        y += 19;
        return;
      }

      // 流式排布的成绩小卡片，宽度自适应：大屏 3~4 列，小屏至少 2 列
      const chipW = Math.max(120, Math.min(150, Math.floor((contentW - 3 * chipGap) / 4)));
      let x = margin;
      const renderChips = day.records.slice(0, 12);
      const hidden = day.records.length - renderChips.length;
      for (const r of renderChips) {
        if (x + chipW > margin + contentW) {
          x = margin;
          y += chipH + chipGap;
        }
        this.drawRecordChip(ctx, x, y, chipW, chipH, r, allRecords, compareWithPrevious);
        x += chipW + chipGap;
      }
      if (hidden > 0) {
        const labelW = 52;
        if (x + labelW > margin + contentW) {
          x = margin;
          y += chipH + chipGap;
        }
        ctx.fillStyle = '#6b5d48';
        ctx.font = '12px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`+${hidden}关`, x + 4, y + chipH / 2);
      }
      y += chipH + 6;
    });

    // 薄弱药材
    y += 1;
    ctx.fillStyle = '#c9a36a';
    ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('老是称不准的药', margin, y);
    y += 18;
    ctx.fillStyle = '#888';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    if (weakHerbs.length === 0) {
      ctx.fillText('暂无称错记录，手感不错', margin + 8, y);
    } else {
      weakHerbs.forEach((h, i) => {
        const text = `${i + 1}. ${h.herb}  称${h.attempts}次错${h.misses}次  平均偏差${h.avgAbsDelta.toFixed(1)}g`;
        if (i > 0) y += 16;
        ctx.fillStyle = i < 3 ? '#e0a080' : '#888';
        ctx.fillText(text, margin + 8, y);
      });
    }

    // 底部按钮
    const btnH = 38;
    let btnY = canvasH - btnH - 14;
    if (confirmClear) btnY -= 44;

    const backBtn = { x: margin, y: btnY, w: 90, h: btnH, action: 'back-menu', label: '返回菜单' };
    this.drawHistoryButton(ctx, backBtn);

    if (!confirmClear) {
      const clearBtn = { x: canvasW - margin - 120, y: btnY, w: 120, h: btnH, action: 'clear-records', label: '清除全部成绩' };
      this.drawHistoryButton(ctx, clearBtn, true);
    } else {
      // 第二下确认：红底按钮 + 取消
      ctx.fillStyle = '#ffd0d0';
      ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('再点一次「确认清除」将永久删除全部成绩（5秒后自动取消）', canvasW / 2, btnY - 22);

      const confirmBtn = { x: canvasW - margin - 250, y: btnY, w: 120, h: btnH, action: 'clear-confirm', label: '确认清除' };
      const cancelBtn = { x: canvasW - margin - 120, y: btnY, w: 120, h: btnH, action: 'clear-cancel', label: '取消' };
      this.drawHistoryButton(ctx, confirmBtn, false, true);
      this.drawHistoryButton(ctx, cancelBtn);
    }

    if (status !== 'ok') {
      this.drawStorageWarning(ctx, canvasW, canvasH, status);
    }
  }

  private drawHistoryButton(ctx: CanvasRenderingContext2D, btn: { x: number; y: number; w: number; h: number; action: string; label: string }, danger = false, dangerConfirm = false): void {
    ctx.fillStyle = dangerConfirm ? '#8b2020' : danger ? '#6b3a2a' : '#6b4e23';
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.strokeStyle = dangerConfirm ? '#ff8888' : '#d4a574';
    ctx.lineWidth = 2;
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
    ctx.fillStyle = '#f5e6d3';
    ctx.font = '15px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
    this.buttonRects.push({ x: btn.x, y: btn.y, w: btn.w, h: btn.h, action: btn.action });
  }

  private drawRecordChip(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    record: import('../storage').LevelRecord,
    allRecords: import('../storage').LevelRecord[],
    compareWithPrevious: (records: import('../storage').LevelRecord[], current: import('../storage').LevelRecord) => 'up' | 'down' | 'same' | 'first',
  ): void {
    const time = new Date(record.timestamp);
    const hm = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
    const trend = compareWithPrevious(allRecords, record);

    ctx.fillStyle = record.passed ? 'rgba(40, 80, 40, 0.55)' : 'rgba(110, 35, 35, 0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = record.passed ? '#3a7a3a' : '#9a4040';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f0e4d0';
    ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    let title = `${hm} 第${record.level}关${record.mode === 'endless' ? '·无尽' : ''}`;
    if (record.timeout) title += ' 超时';
    ctx.fillText(title, x + 7, y + 4);

    // 比上一次同关卡好还是差
    const trendMark: Record<string, string> = { up: '▲', down: '▼', same: '＝', first: '·' };
    const trendColor: Record<string, string> = { up: '#7bd47b', down: '#ff8080', same: '#aaa', first: '#aaa' };
    ctx.fillStyle = trendColor[trend];
    ctx.textAlign = 'right';
    ctx.fillText(trendMark[trend], x + w - 6, y + 4);

    ctx.fillStyle = record.passed ? '#9ad49a' : '#ff9a9a';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${record.passed ? '过' : '败'} ${record.scoreGained}分`, x + 7, y + 20);

    if (record.review && !record.review.correct) {
      ctx.fillStyle = '#ffb0b0';
      ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.fillText(`复核答错:${record.review.herb}`, x + 7, y + 33, w - 14);
    }
  }
}
