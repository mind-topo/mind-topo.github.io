// Knots · Untangle. Drag a rope end to an empty peg; finish with no two ropes crossing.
//
// The board only ever changes through the engine's step({src, tgt}), the benchmark's action
// space, with no physics in between, so a list of moves reproduces any game exactly. While you
// drag, a throwaway copy of the board runs live physics so the rope follows the pointer; on
// release the copy is dropped and the real move plays as the frames step() itself simulates.
import { UntangleGame } from './vendor/untangle/untangle';
import { UntangleRenderer } from './vendor/untangle/render';
import { Budget, wait, type Game, type GameFactory, type Instance } from './types';

interface Action {
  src_row: number;
  src_col: number;
  tgt_row: number;
  tgt_col: number;
}

export const create: GameFactory = async (root, onChange) => {
  root.classList.add('g-untangle');
  const stage = document.createElement('div');
  stage.className = 'g-stage';
  root.replaceChildren(stage);

  const budget = new Budget();
  let instance: Instance | null = null;
  let locked = false;
  let moving = false;
  let destroyed = false;
  let history: Action[] = [];

  const game: any = new UntangleGame({ skipInitialReset: true });
  const preview: any = new UntangleGame({ skipInitialReset: true });
  const renderer: any = new UntangleRenderer(stage);
  renderer.setAnimationEnabled(false);
  const solved = () => game.crossings() === 0;
  const config = () => ({ ...instance!.config, animate: true });

  // Boards are generated offline by this engine (scripts/build-untangle-solutions.ts); restoring
  // the snapshot avoids a 1-2.5 s generation freeze.
  const restore = () => {
    if (instance!.snapshot) game.restoreSnapshot(config(), instance!.snapshot);
    else game.reset(config());
    renderer.setup(game);
  };

  // ---- A move: step() with the frames it simulates (lift, carry, lower, settle) captured, then shown.
  const capture = () =>
    game.ropes.map((r: any) => [r.particles[0].pos.clone(), r.particles[r.particles.length - 1].pos.clone(), ...r.visualPositions.map((v: any) => v.clone())]);
  const show = (frame: any[][]) =>
    game.ropes.forEach((r: any, i: number) => {
      const [start, end, ...visual] = frame[i];
      r.particles[0].pos.copy(start);
      r.particles[r.particles.length - 1].pos.copy(end);
      visual.forEach((v, k) => r.visualPositions[k].copy(v));
    });
  const nextFrame = (signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) =>
      requestAnimationFrame(() => (signal?.aborted ? reject(new DOMException('aborted', 'AbortError')) : resolve())),
    );
  const move = async (action: Action, signal?: AbortSignal) => {
    const frames: any[][][] = [];
    const tick = game.tickPhysics;
    game.tickPhysics = (dt: number) => {
      tick.call(game, dt);
      frames.push(capture());
    };
    let legal: boolean;
    try {
      legal = !game.step(action).info?.illegal;
    } finally {
      game.tickPhysics = tick;
    }
    if (!legal) {
      renderer.syncState();
      return;
    }
    budget.spend();
    history.push(action);
    moving = true;
    const final = capture();
    const lift = Math.max(3, game.config.liftAndPlaceFrames);
    try {
      // The lift-and-place frames at full speed, the settling after it at double speed.
      for (let i = 0; i < frames.length; i += i < lift ? 1 : 2) {
        show(frames[i]);
        renderer.syncState();
        await nextFrame(signal);
        if (destroyed) return;
      }
    } finally {
      moving = false;
      if (!destroyed) {
        show(final);
        renderer.syncState();
        onChange();
      }
    }
  };

  // ---- Drag preview on the copy, as in the repo's frontend/src/main.ts.
  let drag: any = null;
  let raf = 0;
  const canvas: HTMLCanvasElement = renderer.renderer.domElement;
  canvas.style.touchAction = 'none';
  const ended = () => locked || moving || solved() || budget.exhausted;
  const endpointParticle = (rope: any, start: boolean) => (start ? rope.particles[0] : rope.particles[rope.particles.length - 1]);
  const placeEndpoint = (point: any) => {
    const p = endpointParticle(drag.rope, drag.isStartEnd);
    p.pos.copy(point);
    p.oldPos.copy(point);
    drag.rope.visualPositions[drag.isStartEnd ? 0 : drag.rope.visualPositions.length - 1].copy(point);
  };
  const previewLoop = () => {
    raf = requestAnimationFrame(previewLoop);
    preview.tickPhysics(1 / 60);
    renderer.syncState();
  };
  const nearestDropHole = (point: any, sourceHole: any) => {
    const snap = Number.isFinite(game.config.snapDistance) ? game.config.snapDistance : game.config.holeSpacing * 0.48;
    let best = sourceHole;
    let bestDistance = snap;
    for (const hole of preview.holes) {
      if (hole.occupied && hole.id !== sourceHole.id) continue;
      const d = Math.hypot(hole.pos.x - point.x, hole.pos.z - point.z);
      if (d < bestDistance) {
        best = hole;
        bestDistance = d;
      }
    }
    return best;
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (ended() || drag) return;
    const endpoint = renderer.pickEndpoint(e.clientX, e.clientY);
    if (!endpoint || !game.ropes[endpoint.ropeIdx]) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    preview.restoreSnapshot(config(), game.exportSnapshot());
    renderer.setup(preview);
    const rope = preview.ropes[endpoint.ropeIdx];
    drag = {
      pointerId: e.pointerId,
      rope,
      isStartEnd: endpoint.isStartEnd,
      sourceHole: endpoint.isStartEnd ? rope.startHole : rope.endHole,
      liftY: preview._liftPlaneY(),
    };
    drag.sourceHole.occupied = false;
    preview.setDragState(rope, true);
    canvas.style.cursor = 'grabbing';
    const point = renderer.projectPointerToPlane(e.clientX, e.clientY, drag.liftY);
    if (point) placeEndpoint(point);
    previewLoop();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) {
      canvas.style.cursor = !ended() && renderer.pickEndpoint(e.clientX, e.clientY) ? 'grab' : 'default';
      return;
    }
    if (e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    const point = renderer.projectPointerToPlane(e.clientX, e.clientY, drag.liftY);
    if (point) placeEndpoint(point);
  });
  const finishDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    cancelAnimationFrame(raf);
    const point = renderer.projectPointerToPlane(e.clientX, e.clientY, drag.liftY);
    const source = drag.sourceHole;
    const target = point ? nearestDropHole(point, source) : source;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = 'default';
    drag = null;
    renderer.setup(game);
    if (target.id !== source.id) move({ src_row: source.row, src_col: source.col, tgt_row: target.row, tgt_col: target.col });
  };
  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);

  const resize = new ResizeObserver(() => renderer.resize());
  resize.observe(stage);

  const load = async (inst: Instance) => {
    instance = inst;
    budget.reset(inst.budget);
    history = [];
    restore();
    onChange();
  };

  const self: Game = {
    load,
    restart: () => load(instance!),
    async undo() {
      if (!history.length || moving) return;
      const keep = history.slice(0, -1);
      restore();
      for (const action of keep) game.step(action);
      renderer.syncState();
      history = keep;
      onChange();
    },
    canUndo: () => history.length > 0 && !solved(),
    moves: () => history.slice(),
    status() {
      const c = game.crossings();
      return {
        moves: budget.moves,
        budget: budget.budget,
        solved: solved(),
        failed: budget.exhausted && !solved(),
        reason: 'Out of moves.',
        progress: c === 1 ? '1 crossing left' : `${c} crossings left`,
      };
    },
    async playSolution(signal) {
      await load(instance!);
      const n = game.gridSize;
      for (const [src, tgt] of (instance!.solution ?? []) as [number, number][]) {
        await wait(350, signal);
        await move({ src_row: Math.floor(src / n), src_col: src % n, tgt_row: Math.floor(tgt / n), tgt_col: tgt % n }, signal);
      }
      return solved();
    },
    setLocked(on) {
      locked = on;
      root.classList.toggle('is-locked', on);
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      renderer.dispose();
      renderer.renderer.forceContextLoss?.();
      root.replaceChildren();
      root.classList.remove('g-untangle', 'is-locked');
    },
  };
  return self;
};
