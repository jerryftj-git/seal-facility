import './ui/styles/base.css';
import { Game } from './core/Game';

// iPad Safari 會忽略 user-scalable=no：擋掉雙指縮放與雙擊放大，避免操作時畫面跑掉
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

const app = document.getElementById('app')!;
const game = new Game(app);
void game.init();

if (import.meta.env.DEV) {
  (window as unknown as { __game: Game }).__game = game;
}
