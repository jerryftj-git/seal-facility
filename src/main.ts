import './ui/styles/base.css';
import { Game } from './core/Game';

const app = document.getElementById('app')!;
const game = new Game(app);
void game.init();

if (import.meta.env.DEV) {
  (window as unknown as { __game: Game }).__game = game;
}
