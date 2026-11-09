// Validate every exported non-physics Core planning board against the vendored browser engines.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ContinuityPipeGame } from '../src/games/vendor/pipe/pipe.js';
import { Game as OneStrokeGame } from '../src/games/vendor/onestroke/game';
import { OrderSwap2DPuzzleGame, shortestActionSequence } from '../src/games/vendor/swap/swap_2d_puzzle';
import { EnclosureChatNoirGame } from '../src/games/vendor/chatnoir/chat_noir';

const read = (game: string) => JSON.parse(readFileSync(resolve(`public/games/${game}.json`), 'utf8')).instances;
const checkLevels = (game: string, rows: any[]) => {
  if (rows.length !== 80) throw new Error(`${game}: expected 80 Core demo boards`);
  for (const level of ['easy', 'hard']) {
    if (rows.filter((x) => x.difficulty === level).length !== 40) throw new Error(`${game}: expected 40 Core ${level}`);
  }
};

for (const row of read('pipe')) {
  const game: any = new ContinuityPipeGame(null);
  game.reset(row.config);
  const initial = game.getDebugState();
  const plan = initial.cells.flatMap((cell: any) => Array(cell.targetRotationTicks).fill(cell.index));
  if (plan.length !== row.optimal || plan.length > row.budget) throw new Error(`Pipe/${row.id}: bad solution length`);
  for (const action of plan) game.step(action);
  if (!game.getDebugState().terminal?.success) throw new Error(`Pipe/${row.id}: browser oracle did not solve board`);
}
checkLevels('pipe', read('pipe'));

for (const row of read('onestroke')) {
  const game = new OneStrokeGame();
  game.loadLevel(row.config.levelJson);
  for (const action of row.config.levelJson.solution) game.stepDir(action);
  if (!game.getState().success || row.config.levelJson.solution.length > row.budget) {
    throw new Error(`OneStroke/${row.id}: browser oracle did not solve board within budget`);
  }
}
checkLevels('onestroke', read('onestroke'));

for (const row of read('swap')) {
  const game: any = new OrderSwap2DPuzzleGame(null);
  game.reset(row.config);
  const plan = row.config.moveRule === 'row_column_v1'
    ? row.config.referenceActions
    : shortestActionSequence(row.config.initialArrangement, row.config.goalArrangement);
  for (const action of plan) await game.step(action);
  if (game.getDebugState().status !== 'success' || plan.length > row.budget) {
    throw new Error(`Swap/${row.id}: browser oracle did not solve board within budget`);
  }
}
checkLevels('swap', read('swap'));

for (const row of read('chatnoir')) {
  const game: any = new EnclosureChatNoirGame(null);
  game.reset(row.config);
  const state = game.getDebugState();
  const expected = row.difficulty === 'hard' ? 'expert' : 'hard';
  if (state.catPolicy.name !== expected || state.stepCount !== 0 || state.terminal) {
    throw new Error(`ChatNoir/${row.id}: browser reset does not match Core policy`);
  }
}
checkLevels('chatnoir', read('chatnoir'));

console.log('Validated all 320 exported Pipe, One Stroke, Swap, and Chat Noir Core boards.');
