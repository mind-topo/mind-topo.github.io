// Continuity · Pipe. Click a pipe to rotate it 90°; connect every pipe to the source.
import { ContinuityPipeGame } from './vendor/pipe/pipe.js';
import { Budget, wait, type Game, type GameFactory, type Instance } from './types';

export const create: GameFactory = async (root, onChange) => {
  root.classList.add('g-pipe');
  const board = document.createElement('div');
  board.className = 'g-pipe-board';
  root.replaceChildren(board);

  const budget = new Budget();
  let instance: Instance | null = null;
  let locked = false;
  let failed = false;

  const game: any = new (ContinuityPipeGame as any)(board, (event: any) => {
    if (event?.result?.info?.illegal) return;
    budget.spend();
    if (budget.exhausted && !game.getDebugState().terminal?.success) failed = true;
    onChange();
  });

  // The engine wires its own click handler on each cell; stop clicks before they reach it while locked.
  board.addEventListener('click', (e) => {
    if (locked || failed || game.getDebugState().terminal) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  const load = async (inst: Instance) => {
    instance = inst;
    budget.reset(inst.budget);
    failed = false;
    game.reset({ ...inst.config, maxSteps: Math.max(inst.budget, inst.config.maxSteps ?? 0) });
    onChange();
  };

  const self: Game = {
    load,
    restart: () => load(instance!),
    async undo() {
      if (!game.getDebugState().canUndo) return;
      game.undo();
      failed = budget.exhausted;
      onChange();
    },
    canUndo: () => game.getDebugState().canUndo && !game.getDebugState().terminal?.success,
    status() {
      const s = game.getDebugState();
      return {
        moves: budget.moves,
        budget: budget.budget,
        solved: Boolean(s.terminal?.success),
        failed: failed && !s.terminal?.success,
        reason: 'Out of moves.',
        progress: `${s.connectedCount} / ${s.totalPipes} pipes connected`,
      };
    },
    async playSolution(signal) {
      await load(instance!);
      // Each pipe needs targetRotationTicks clockwise turns to reach its solved orientation.
      const plan: number[] = [];
      for (const cell of game.getDebugState().cells) {
        for (let k = 0; k < cell.targetRotationTicks; k++) plan.push(cell.index);
      }
      for (const index of plan) {
        await wait(320, signal);
        game.step(index);
        budget.spend();
        onChange();
      }
      return Boolean(game.getDebugState().terminal?.success);
    },
    setLocked(on) {
      locked = on;
      root.classList.toggle('is-locked', on);
    },
    destroy() {
      root.replaceChildren();
      root.classList.remove('g-pipe', 'is-locked');
    },
  };
  return self;
};
