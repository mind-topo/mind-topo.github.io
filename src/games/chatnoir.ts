// Enclosure · Chat Noir. Click an open cell to block it; trap the cat before it reaches the edge.
import { EnclosureChatNoirGame, solverHint } from './vendor/chatnoir/chat_noir';
import { Budget, wait, type Game, type GameFactory, type Instance } from './types';

export const create: GameFactory = async (root, onChange) => {
  root.classList.add('g-chatnoir');
  const stage = document.createElement('div');
  stage.className = 'g-stage';
  root.replaceChildren(stage);

  const budget = new Budget();
  let instance: Instance | null = null;
  let locked = false;
  let busy = false;
  let history: number[] = [];

  const game: any = new EnclosureChatNoirGame(stage);
  const renderer = game.renderer;
  const terminal = () => game.terminal as { success: boolean; reason: string } | null;

  // The engine places a DOM label at every cell's screen position; the nearest one is the cell clicked.
  const cellAt = (x: number, y: number) => {
    let best: number | null = null;
    let bestDist = Infinity;
    for (const [index, label] of renderer.labels.indexLabels as Map<number, HTMLElement>) {
      const r = label.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
      if (d < bestDist) {
        bestDist = d;
        best = index;
      }
    }
    return best !== null && bestDist < 34 ? best : null;
  };

  const act = async (index: number) => {
    busy = true;
    try {
      const result = await game.step(index);
      if (!result.info?.illegal) {
        budget.spend();
        history.push(index);
      }
    } finally {
      busy = false;
    }
    onChange();
  };

  stage.addEventListener('click', (e) => {
    if (locked || busy || terminal() || budget.exhausted) return;
    const index = cellAt(e.clientX, e.clientY);
    if (index !== null && game.isLegalMove(index)) act(index);
  });
  stage.addEventListener('pointermove', (e) => {
    const index = locked || terminal() ? null : cellAt(e.clientX, e.clientY);
    stage.style.cursor = index !== null && game.isLegalMove(index) ? 'pointer' : 'default';
  });

  const resize = new ResizeObserver(() => renderer.resize());
  resize.observe(stage);

  const load = async (inst: Instance) => {
    instance = inst;
    budget.reset(inst.budget);
    history = [];
    game.reset({ ...inst.config });
    onChange();
  };

  const self: Game = {
    load,
    restart: () => load(instance!),
    async undo() {
      if (!history.length) return;
      // The cat's policy is deterministic for a seeded board, so undo = replay all but the last block.
      const keep = history.slice(0, -1);
      const spent = budget.moves;
      game.reset({ ...instance!.config });
      for (const index of keep) await game.step(index);
      history = keep;
      budget.moves = spent;
      onChange();
    },
    canUndo: () => history.length > 0 && !terminal()?.success,
    status() {
      const t = terminal();
      return {
        moves: budget.moves,
        budget: budget.budget,
        solved: Boolean(t?.success),
        failed: (t !== null && !t.success) || (budget.exhausted && !t?.success),
        reason: t?.reason === 'cat_escaped' ? 'The cat escaped.' : 'Out of moves.',
        progress: `${history.length} blocks placed`,
      };
    },
    async playSolution(signal) {
      await load(instance!);
      while (!terminal() && !budget.exhausted) {
        await wait(520, signal);
        const index = solverHint(game, budget.budget - budget.moves);
        if (index === null) break;
        await act(index);
      }
      return Boolean(terminal()?.success);
    },
    setLocked(on) {
      locked = on;
      root.classList.toggle('is-locked', on);
    },
    destroy() {
      resize.disconnect();
      window.removeEventListener('resize', renderer._boundResize);
      renderer.renderer.dispose();
      renderer.renderer.forceContextLoss?.();
      root.replaceChildren();
      root.classList.remove('g-chatnoir', 'is-locked');
    },
  };
  return self;
};
