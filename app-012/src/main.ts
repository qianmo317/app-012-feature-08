import { ApothecaryGame } from './game';
import { loadSave, saveSave } from './storage';

const game = new ApothecaryGame('game-canvas');
game.start();

// 成绩已在每关结束时即时写入；这里只更新“最近游玩时间”摘要，写失败也无所谓
window.addEventListener('beforeunload', () => {
  const { data } = loadSave();
  saveSave({ ...data, lastPlayed: Date.now() });
});
