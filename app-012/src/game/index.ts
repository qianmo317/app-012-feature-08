import { GameCanvas } from '../renderer/canvas';
import { CabinetRenderer } from '../renderer/cabinet';
import { ScaleRenderer } from '../renderer/scale';
import { UIRenderer } from '../renderer/ui';
import type { HistoryViewData } from '../renderer/ui';
import { GameManager } from './state';
import { getHerbByName } from '../herbs';
import { resumeAudio, playDrawerSound, playDropSound, playPointerSound, playErrorSound, playSuccessSound } from '../audio/synth';
import { loadSave, appendRecord, makeRecord, clearSave, getStorageStatus } from '../storage';
import type { StorageStatus } from '../storage';
import type { NewRecord } from '../records';
import { localDateKey, recentDateKeys } from '../records';
import type { GamePhase } from '../types';

const CLEAR_CONFIRM_MS = 3000;

export class ApothecaryGame {
  canvas: GameCanvas;
  cabinet: CabinetRenderer;
  scale: ScaleRenderer;
  ui: UIRenderer;
  game: GameManager;
  animId = 0;
  mouseX = 0;
  mouseY = 0;

  /** 最近一次写战绩的结果，结算弹窗据此提示 */
  private lastSaveStatus: StorageStatus | null = null;

  /** 从战绩页返回时回到哪个阶段 */
  private historyReturnPhase: GamePhase = 'menu';

  private historySelectedDate = localDateKey(Date.now());
  private clearConfirmUntil = 0;

  private get showHistory(): boolean {
    return this.game.phase === 'history';
  }

  constructor(canvasId: string) {
    this.canvas = new GameCanvas(canvasId);
    this.cabinet = new CabinetRenderer();
    this.scale = new ScaleRenderer();
    this.ui = new UIRenderer();
    this.game = new GameManager();
    this.game.onRecord = (record: NewRecord) => this.persistRecord(record);
    this.setupInput();
    this.resize();
    this.loop = this.loop.bind(this);
  }

  private persistRecord(record: NewRecord): void {
    const result = appendRecord(makeRecord(record));
    this.lastSaveStatus = result.status === 'ok' ? 'ok' : result.status;
  }

  resize(): void {
    this.canvas.resize();
    this.cabinet.layout(this.canvas.width, this.canvas.height);
    this.scale.layout(this.canvas.width, this.canvas.height);
    this.ui.layout(this.canvas.width, this.canvas.height);
  }

  start(): void {
    document.getElementById('loading')!.style.display = 'none';
    this.loop(performance.now());
  }

  loop(now: number): void {
    this.animId = requestAnimationFrame(this.loop);
    this.game.tick(now);
    this.scale.animate();
    this.render();
  }

  render(): void {
    const ctx = this.canvas.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (this.showHistory) {
      this.renderHistory(ctx, w, h);
      return;
    }

    if (this.game.phase === 'menu') {
      this.renderMenu(ctx, w, h);
      return;
    }

    ctx.fillStyle = '#2d2418';
    ctx.fillRect(0, 0, w, h);

    this.cabinet.draw(ctx);
    this.scale.draw(ctx, this.game.currentWeight, this.game.zeroOffset);

    if (this.game.prescription) {
      this.ui.drawPrescription(ctx, this.game.prescription, this.game.weighed, this.game.currentHerb);
    }

    this.ui.drawStatus(ctx, this.game.state.level, this.game.state.score, this.game.state.combo, this.game.state.queue, this.game.state.satisfaction, this.game.getTimeLeft());
    this.ui.drawStorageWarning(ctx, w, getStorageStatus());
    this.ui.drawPackageArea(ctx, w, h, this.game.packages);
    this.ui.drawInstructions(ctx, w, h);

    if (this.game.levelConfig.requireTare) {
      this.ui.drawTareButton(ctx, this.scale.x + this.scale.w - 60, this.scale.y + this.scale.h + 10, false);
    }

    if (this.game.currentHerb) {
      const herbMeta = getHerbByName(this.game.currentHerb);
      if (herbMeta) {
        this.drawHerbPile(ctx, this.scale.x + this.scale.w / 2 - 20, this.scale.y + this.scale.h - 40, herbMeta.color, Math.min(40, this.game.currentWeight * 2));
      }
    }

    if (this.game.draggingHerb) {
      const herbMeta = getHerbByName(this.game.draggingHerb);
      if (herbMeta) {
        ctx.globalAlpha = 0.8;
        this.drawHerbPile(ctx, this.mouseX - 20, this.mouseY - 20, herbMeta.color, 30);
        ctx.globalAlpha = 1;
      }
    }

    if (this.game.flashingDrawer) {
      const drawer = this.cabinet.drawers.find(d => d.herb === this.game.flashingDrawer);
      if (drawer) {
        ctx.fillStyle = `rgba(255, 0, 0, ${0.3 + Math.sin(performance.now() / 50) * 0.2})`;
        ctx.fillRect(drawer.x, drawer.y, drawer.w, drawer.h);
      }
    }

    if (this.game.phase === 'review') {
      if (this.game.reviewQuestion) {
        this.ui.drawReview(ctx, w, h, this.game.reviewQuestion.herb, this.game.reviewQuestion.options, this.game.reviewSelected, this.game.reviewResult);
      }
    } else if (this.game.phase === 'result') {
      this.ui.drawResult(ctx, w, h, this.game.state.score, this.game.state.level, this.game.results, this.game.levelPassed, this.lastSaveStatus);
    } else if (this.game.phase === 'gameover') {
      this.ui.drawGameOver(ctx, w, h, this.game.state.score, this.game.state.level, this.lastSaveStatus);
    }
  }

  renderMenu(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const { data, status } = loadSave();
    this.ui.drawMenu(ctx, w, h, data.highestScore, data.highestLevel, status === 'ok' ? 'ok' : status);
  }

  private renderHistory(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const { data, status } = loadSave();
    // 当前选中日若不在最近七天范围内（跨天停留），落到七天内最近有记录的一天
    const keys = recentDateKeys(7);
    if (!keys.includes(this.historySelectedDate)) {
      this.historySelectedDate = this.defaultSelectedDate(data.records, keys);
    }
    const view: HistoryViewData = {
      status,
      records: data.records,
      selectedDate: this.historySelectedDate,
      clearConfirmUntil: this.clearConfirmUntil,
      now: Date.now(),
    };
    this.ui.drawHistory(ctx, w, h, view);
  }

  private defaultSelectedDate(records: ReturnType<typeof loadSave>['data']['records'], keys: string[]): string {
    const have = new Set(records.map(r => r.date));
    for (let i = keys.length - 1; i >= 0; i--) {
      if (have.has(keys[i])) return keys[i];
    }
    return keys[keys.length - 1];
  }

  private openHistory(): void {
    const { data } = loadSave();
    this.clearConfirmUntil = 0;
    this.historySelectedDate = this.defaultSelectedDate(data.records, recentDateKeys(7));
    this.historyReturnPhase = this.game.phase;
    this.game.phase = 'history';
  }

  private closeHistory(): void {
    this.game.phase = this.historyReturnPhase === 'history' ? 'menu' : this.historyReturnPhase;
    this.clearConfirmUntil = 0;
  }

  private handleHistoryClick(action: string): void {
    if (action.startsWith('day-')) {
      this.historySelectedDate = action.slice(4);
      return;
    }
    if (action === 'back-menu') {
      this.closeHistory();
      return;
    }
    if (action === 'clear-ask') {
      // 第一下只进入待确认状态，3 秒内再点才真清
      this.clearConfirmUntil = Date.now() + CLEAR_CONFIRM_MS;
      return;
    }
    if (action === 'clear-confirm') {
      clearSave();
      this.clearConfirmUntil = 0;
      this.historySelectedDate = recentDateKeys(7)[6];
    }
  }

  drawHerbPile(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size: number): void {
    const particles = Math.max(5, Math.floor(size / 3));
    for (let i = 0; i < particles; i++) {
      const px = x + Math.random() * size - size / 2;
      const py = y + Math.random() * size / 2;
      const r = 2 + Math.random() * 3;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7 + Math.random() * 0.3;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  setupInput(): void {
    const c = this.canvas.canvas;

    c.addEventListener('mousedown', e => {
      resumeAudio();
      const pos = this.canvas.getMousePos(e);
      this.handlePointerDown(pos.x, pos.y);
    });

    c.addEventListener('mousemove', e => {
      const pos = this.canvas.getMousePos(e);
      this.mouseX = pos.x;
      this.mouseY = pos.y;
      this.handlePointerMove(pos.x, pos.y);
    });

    c.addEventListener('mouseup', () => {
      this.handlePointerUp();
    });

    c.addEventListener('wheel', e => {
      e.preventDefault();
      if (this.game.phase === 'weighing') {
        const dir = e.deltaY > 0 ? 1 : -1;
        this.game.addWeight(dir * 0.5);
        playPointerSound();
      }
    }, { passive: false });

    c.addEventListener('touchstart', e => {
      resumeAudio();
      e.preventDefault();
      if (e.touches.length > 0) {
        const pos = this.canvas.getMousePos(e.touches[0]);
        this.handlePointerDown(pos.x, pos.y);
      }
    }, { passive: false });

    c.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length > 0) {
        const pos = this.canvas.getMousePos(e.touches[0]);
        this.mouseX = pos.x;
        this.mouseY = pos.y;
        this.handlePointerMove(pos.x, pos.y);
      }
    }, { passive: false });

    c.addEventListener('touchend', () => {
      this.handlePointerUp();
    });

    window.addEventListener('keydown', e => {
      this.handleKey(e.key);
    });
  }

  handlePointerDown(x: number, y: number): void {
    if (this.showHistory) {
      const btn = this.ui.buttonRects.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (btn) this.handleHistoryClick(btn.action);
      return;
    }

    if (this.game.phase === 'menu') {
      const btn = this.ui.buttonRects.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (btn) {
        if (btn.action === 'start') {
          this.lastSaveStatus = null;
          this.game.startNewGame(false);
          this.cabinet.setHerbs(this.game.herbs);
        } else if (btn.action === 'endless') {
          this.lastSaveStatus = null;
          this.game.startNewGame(true);
          this.cabinet.setHerbs(this.game.herbs);
        } else if (btn.action === 'history') {
          this.openHistory();
        }
      }
      return;
    }

    if (this.game.phase === 'review') {
      const btn = this.ui.buttonRects.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (btn && btn.action.startsWith('review-')) {
        const val = parseInt(btn.action.replace('review-', ''));
        const correct = this.game.answerReview(val);
        if (correct) playSuccessSound();
        else playErrorSound();
      }
      return;
    }

    if (this.game.phase === 'result' || this.game.phase === 'gameover') {
      const btn = this.ui.buttonRects.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (btn) {
        if (btn.action === 'next') {
          this.lastSaveStatus = null;
          this.game.nextLevel();
          this.cabinet.setHerbs(this.game.herbs);
        } else if (btn.action === 'retry') {
          this.lastSaveStatus = null;
          this.game.retryLevel();
          this.cabinet.setHerbs(this.game.herbs);
        } else if (btn.action === 'history') {
          this.openHistory();
        } else if (btn.action === 'menu') {
          this.game.phase = 'menu';
        }
      }
      return;
    }

    if (this.game.phase === 'playing') {
      const drawer = this.cabinet.getDrawerAt(x, y);
      if (drawer && drawer.herb) {
        const ok = this.game.selectDrawer(drawer.herb);
        if (ok) {
          playDrawerSound();
          this.cabinet.openDrawer(drawer.herb);
        } else {
          playErrorSound();
        }
      }
      return;
    }

    if (this.game.phase === 'weighing') {
      const sx = this.scale.x;
      const sy = this.scale.y + this.scale.h + 10;
      if (x >= sx && x <= sx + 40 && y >= sy && y <= sy + 32) {
        this.game.addWeight(1);
        playPointerSound();
        return;
      }
      if (x >= sx + 50 && x <= sx + 90 && y >= sy && y <= sy + 32) {
        this.game.addWeight(-1);
        playPointerSound();
        return;
      }
      if (x >= sx + 100 && x <= sx + 160 && y >= sy && y <= sy + 32) {
        this.game.tare();
        playPointerSound();
        return;
      }

      const scaleArea = { x: this.scale.x, y: this.scale.y, w: this.scale.w, h: this.scale.h };
      if (x >= scaleArea.x && x <= scaleArea.x + scaleArea.w && y >= scaleArea.y && y <= scaleArea.y + scaleArea.h) {
        this.game.draggingHerb = this.game.currentHerb;
      }
      return;
    }
  }

  handlePointerMove(x: number, y: number): void {
    this.cabinet.updateHover(x, y);
    if (this.game.phase === 'weighing' && this.game.draggingHerb) {
      const scaleArea = { x: this.scale.x, y: this.scale.y, w: this.scale.w, h: this.scale.h };
      this.game.onScale = x >= scaleArea.x && x <= scaleArea.x + scaleArea.w && y >= scaleArea.y && y <= scaleArea.y + scaleArea.h;
    }
  }

  handlePointerUp(): void {
    if (this.game.phase === 'weighing' && this.game.draggingHerb) {
      if (this.game.onScale) {
        this.game.currentWeight = Math.min(50, this.game.currentWeight + 5);
        playDropSound();
      }
      this.game.draggingHerb = null;
      this.game.onScale = false;
    }
  }

  handleKey(key: string): void {
    if (this.showHistory) {
      if (key === 'Escape' || key === 'Backspace') this.closeHistory();
      return;
    }

    if (this.game.phase === 'menu') {
      if (key === 'Enter' || key === ' ') {
        this.lastSaveStatus = null;
        this.game.startNewGame(false);
        this.cabinet.setHerbs(this.game.herbs);
      }
      return;
    }

    if (this.game.phase === 'playing') {
      const idx = parseInt(key);
      if (!isNaN(idx) && idx >= 1 && idx <= 9) {
        const drawers = this.cabinet.drawers.filter(d => d.herb);
        if (idx <= drawers.length) {
          const ok = this.game.selectDrawer(drawers[idx - 1].herb);
          if (ok) {
            playDrawerSound();
            this.cabinet.openDrawer(drawers[idx - 1].herb);
          } else {
            playErrorSound();
          }
        }
      }
      return;
    }

    if (this.game.phase === 'weighing') {
      if (key === ' ' || key === 'Enter') {
        const result = this.game.confirmWeight();
        if (result) {
          if (result.ok) {
            playSuccessSound();
          } else {
            playErrorSound();
          }
        }
      } else if (key === 'z' || key === 'Z') {
        this.game.tare();
        playPointerSound();
      } else if (key === 'ArrowUp' || key === 'ArrowRight') {
        this.game.addWeight(0.5);
        playPointerSound();
      } else if (key === 'ArrowDown' || key === 'ArrowLeft') {
        this.game.addWeight(-0.5);
        playPointerSound();
      }
      return;
    }

    if (this.game.phase === 'result') {
      if (key === 'Enter' || key === ' ') {
        this.lastSaveStatus = null;
        if (this.game.levelPassed) {
          this.game.nextLevel();
        } else {
          this.game.retryLevel();
        }
        this.cabinet.setHerbs(this.game.herbs);
      }
      return;
    }

    if (this.game.phase === 'gameover') {
      if (key === 'Enter' || key === ' ') {
        this.game.phase = 'menu';
      }
      return;
    }
  }
}
