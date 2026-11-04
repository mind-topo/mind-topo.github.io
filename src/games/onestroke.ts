// Separation · One Stroke. Draw one corner-to-corner path that splits the colors into their own regions.
import { Game as OneStrokeGame } from './vendor/onestroke/game';
import { Renderer } from './vendor/onestroke/renderer';
import { Budget, wait, type Game, type GameFactory, type Instance } from './types';

type Dir = 'U' | 'D' | 'L' | 'R';
const KEYS: Record<string, Dir> = {
  ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R',
};

export const create: GameFactory = async (root, onChange) => {
  root.classList.add('g-onestroke');
  root.innerHTML = `
    <div class="g-stage" tabindex="0" aria-label="One Stroke board. Use the arrow keys to draw."></div>
    <div class="g-dpad" aria-label="Draw">
      <button data-dir="U" aria-label="Up">↑</button>
      <button data-dir="L" aria-label="Left">←</button>
      <button data-dir="D" aria-label="Down">↓</button>
      <button data-dir="R" aria-label="Right">→</button>
    </div>`;
  const stage = root.querySelector<HTMLElement>('.g-stage')!;

  // The renderer sizes its WebGL buffer from the container; wait for layout so it is not 0×0.
  await new Promise<void>((resolve) => {
    const ready = () => (stage.clientWidth && stage.clientHeight ? resolve() : requestAnimationFrame(ready));
    ready();
  });

  const budget = new Budget();
  let instance: Instance | null = null;
  let locked = false;
  let shownEnd = false;

  const game = new OneStrokeGame();
  const renderer = new Renderer(stage);
  const sync = () => {
    const s = game.getState();
    renderer.updateStroke(s.stroke, s.currentPos);
    if (s.done && !shownEnd) {
      shownEnd = true;
      s.success ? renderer.showSuccess() : renderer.showFailure();
    }
    onChange();
  };

  const step = (dir: Dir) => {
    if (locked || game.getState().done || budget.exhausted) return;
    const result = game.stepDir(dir);
    if (!result.ok) {
      stage.classList.remove('bump');
      void stage.offsetWidth;
      stage.classList.add('bump');
      return;
    }
    budget.spend();
    sync();
  };

  stage.addEventListener('keydown', (e) => {
    const dir = KEYS[e.key];
    if (dir) {
      e.preventDefault();
      step(dir);
    } else if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      self.undo();
    }
  });
  stage.addEventListener('pointerdown', () => stage.focus({ preventScroll: true }));
  root.querySelectorAll<HTMLButtonElement>('.g-dpad button').forEach((b) =>
    b.addEventListener('click', () => step(b.dataset.dir as Dir)),
  );

  const resize = new ResizeObserver(() => (renderer as any).onResize?.());
  resize.observe(stage);

  const load = async (inst: Instance) => {
    instance = inst;
    budget.reset(inst.budget);
    shownEnd = false;
    game.loadLevel(inst.config.levelJson);
    renderer.initBoard(inst.config.levelJson);
    sync();
  };

  const self: Game = {
    load,
    restart: () => load(instance!),
    async undo() {
      if (game.undo()) {
        shownEnd = false;
        renderer.initBoard(instance!.config.levelJson);
        sync();
      }
    },
    canUndo: () => game.getState().stroke.length > 1 && !game.getState().success,
    status() {
      const s = game.getState();
      const evaluation = s.done && !s.success ? game.evaluate() : null;
      return {
        moves: budget.moves,
        budget: budget.budget,
        solved: s.success,
        failed: (s.done && !s.success) || (budget.exhausted && !s.success),
        reason: evaluation?.reason ?? 'Out of moves.',
        progress: `Path length ${s.stroke.length - 1}`,
      };
    },
    async playSolution(signal) {
      await load(instance!);
      const solution: (Dir | { x: number; y: number })[] = instance!.config.levelJson.solution ?? [];
      for (const move of solution) {
        await wait(300, signal);
        const result = typeof move === 'string' ? game.stepDir(move) : game.stepTo(move.x, move.y);
        if (!result.ok) break;
        budget.spend();
        sync();
      }
      return game.getState().success;
    },
    setLocked(on) {
      locked = on;
      root.classList.toggle('is-locked', on);
    },
    destroy() {
      resize.disconnect();
      renderer.dispose();
      (renderer as any).renderer?.forceContextLoss?.();
      root.replaceChildren();
      root.classList.remove('g-onestroke', 'is-locked');
    },
  };
  return self;
};
