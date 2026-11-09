// Order · Swap. Click a block to move it into the empty slot; match the goal grid.
import { OrderSwap2DPuzzleGame, shortestActionSequence } from './vendor/swap/swap_2d_puzzle';
import { Budget, wait, type Game, type GameFactory, type Instance } from './types';

export const create: GameFactory = async (root, onChange) => {
  root.classList.add('g-swap');
  root.innerHTML = `
    <div class="g-swap-current"></div>
    <div class="g-swap-goal"><span class="g-swap-goal-label">Goal</span><div class="g-swap-goal-board"></div></div>`;
  const currentRoot = root.querySelector<HTMLElement>('.g-swap-current')!;
  const goalRoot = root.querySelector<HTMLElement>('.g-swap-goal-board')!;

  const budget = new Budget();
  let instance: Instance | null = null;
  let locked = false;
  let busy = false;

  const game = new OrderSwap2DPuzzleGame({ currentRoot, goalRoot });
  const solved = () => game.getDebugState().status === 'success';

  currentRoot.addEventListener('click', async (e) => {
    if (locked || busy || solved() || budget.exhausted) return;
    const cell = (e.target as Element).closest<HTMLElement>('[data-cell-index]');
    if (!cell) return;
    const index = Number(cell.dataset.cellIndex);
    if (game.getDebugState().currentArrangement[index] === '_') return;
    busy = true;
    try {
      const result = await game.step(index);
      if (!result.info?.illegal) budget.spend();
    } finally {
      busy = false;
    }
    onChange();
  });

  const load = async (inst: Instance) => {
    instance = inst;
    budget.reset(inst.budget);
    game.reset({ ...inst.config, animate: true, stepBudget: Math.max(inst.budget, 999) });
    root.style.setProperty('--cols', String(inst.config.gridCols));
    root.style.setProperty('--rows', String(inst.config.gridRows));
    onChange();
  };

  const self: Game = {
    load,
    restart: () => load(instance!),
    async undo() {
      if (!game.getDebugState().canUndo) return;
      game.undo();
      onChange();
    },
    canUndo: () => Boolean(game.getDebugState().canUndo) && !solved(),
    status() {
      const s = game.getDebugState();
      const inPlace = s.currentArrangement.filter((t: string, i: number) => t !== '_' && t === s.goalArrangement[i]).length;
      return {
        moves: budget.moves,
        budget: budget.budget,
        solved: solved(),
        failed: budget.exhausted && !solved(),
        reason: 'Out of moves.',
        progress: `${inPlace} / ${s.goalArrangement.length - 1} blocks in place`,
      };
    },
    async playSolution(signal) {
      await load(instance!);
      const plan: number[] = instance!.config.moveRule === 'row_column_v1'
        ? instance!.config.referenceActions ?? []
        : shortestActionSequence(instance!.config.initialArrangement, instance!.config.goalArrangement);
      for (const index of plan) {
        await wait(420, signal);
        await game.step(index);
        budget.spend();
        onChange();
      }
      return solved();
    },
    setLocked(on) {
      locked = on;
      root.classList.toggle('is-locked', on);
    },
    destroy() {
      root.replaceChildren();
      root.classList.remove('g-swap', 'is-locked');
    },
  };
  return self;
};
