import { ApothecaryGame } from './game';
import { store } from './storage';

const game = new ApothecaryGame('game-canvas');

// 每打完一关立刻落盘（不再等到关页面）
game.game.onLevelFinish = (summary) => {
  store.addRecord(summary);
};

game.start();
