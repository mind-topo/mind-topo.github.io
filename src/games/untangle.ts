// Knots · Untangle. Drag a rope end to an empty peg; finish with no two ropes crossing.
import { UntangleGame } from './vendor/untangle/untangle';
import { UntangleRenderer } from './vendor/untangle/render';
import { Budget, wait, type Game, type GameFactory, type Instance } from './types';

export const create: GameFactory = async (root, onChange) => {
  root.classList.add('g-untangle');
  const stage = document.createElement('div');
  stage.className = 'g-stage';
  root.replaceChildren(stage);

  const budget = new Budget();
  let instance: Instance | null = null;
  let locked = false;
  let history: any[] = [];

  const game: any = new UntangleGame({ skipInitialReset: true });
  const renderer: any = new UntangleRenderer(stage);
  const solved = () => game.crossings() === 0;

  const act = (action: any) => {
    const result = game.step(action);
    renderer.syncState();
    if (!result.info?.illegal) {
      budget.spend();
      history.push(action);
    }
    onChange();
    return result;
  };

  // ---- Drag and drop, as in the repo's frontend/src/main.ts.
  let drag: any = null;
  const canvas: HTMLCanvasElement = renderer.renderer.domElement;
  canvas.style.touchAction = 'none';
  const endpointParticle = (rope: any, start: boolean) => (start ? rope.particles[0] : rope.particles[rope.particles.length - 1]);
  const visualIndex = (rope: any, start: boolean) => (start ? 0 : rope.visualPositions.length - 1);
  const placeEndpoint = (point: any) => {
    const p = endpointParticle(drag.rope, drag.isStartEnd);
    p.pos.copy(point);
    p.oldPos.copy(point);
    drag.rope.visualPositions[visualIndex(drag.rope, drag.isStartEnd)].copy(point);
    renderer.syncState();
  };
  const nearestDropHole = (point: any, sourceHole: any) => {
    const snap = Number.isFinite(game.config.snapDistance) ? game.config.snapDistance : game.config.holeSpacing * 0.48;
    let best = sourceHole;
    let bestDistance = snap;
    for (const hole of game.holes) {
      if (hole.occupied && hole.id !== sourceHole.id) continue;
      const d = Math.hypot(hole.pos.x - point.x, hole.pos.z - point.z);
      if (d < bestDistance) {
        best = hole;
        bestDistance = d;
      }
    }
    return best;
  };
  const ended = () => locked || solved() || budget.exhausted;

  canvas.addEventListener('pointerdown', (e) => {
    if (ended()) return;
    const endpoint = renderer.pickEndpoint(e.clientX, e.clientY);
    const rope = endpoint && game.ropes[endpoint.ropeIdx];
    if (!rope) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drag = {
      pointerId: e.pointerId,
      rope,
      isStartEnd: endpoint.isStartEnd,
      sourceHole: endpoint.isStartEnd ? rope.startHole : rope.endHole,
      liftY: game._liftPlaneY(),
    };
    drag.sourceHole.occupied = false;
    game.setDragState(rope, true);
    canvas.style.cursor = 'grabbing';
    const point = renderer.projectPointerToPlane(e.clientX, e.clientY, drag.liftY);
    if (point) placeEndpoint(point);
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
    const point = renderer.projectPointerToPlane(e.clientX, e.clientY, drag.liftY);
    const target = point ? nearestDropHole(point, drag.sourceHole) : drag.sourceHole;
    const source = drag.sourceHole;
    // Snap the endpoint back to its hole, then let the engine perform the real move.
    const p = endpointParticle(drag.rope, drag.isStartEnd);
    const home = game._holeSurfacePosition(source);
    p.pos.copy(home);
    p.oldPos.copy(home);
    drag.rope.visualPositions[visualIndex(drag.rope, drag.isStartEnd)].copy(home);
    source.occupied = true;
    game.setDragState(drag.rope, false);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = 'default';
    drag = null;
    if (target.id !== source.id) act({ src_row: source.row, src_col: source.col, tgt_row: target.row, tgt_col: target.col });
    else renderer.syncState();
  };
  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);

  const resize = new ResizeObserver(() => renderer.resize());
  resize.observe(stage);

  // Boards are generated offline by this engine (scripts/build-untangle-solutions.ts); restoring
  // the snapshot avoids a 1-2.5 s generation freeze. animate=false matches the benchmark harness:
  // the ropes settle only inside each step, never between steps.
  const reset = () => {
    if (instance!.snapshot) game.restoreSnapshot({ ...instance!.config, animate: false }, instance!.snapshot);
    else game.reset({ ...instance!.config, animate: false });
    renderer.setAnimationEnabled(false);
    renderer.setup(game);
  };

  const load = async (inst: Instance) => {
    instance = inst;
    budget.reset(inst.budget);
    history = [];
    reset();
    onChange();
  };

  const self: Game = {
    load,
    restart: () => load(instance!),
    async undo() {
      if (!history.length) return;
      const keep = history.slice(0, -1);
      const spent = budget.moves;
      reset();
      for (const action of keep) game.step(action);
      renderer.syncState();
      history = keep;
      budget.moves = spent;
      onChange();
    },
    canUndo: () => history.length > 0 && !solved(),
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
        await wait(800, signal);
        act({ src_row: Math.floor(src / n), src_col: src % n, tgt_row: Math.floor(tgt / n), tgt_col: tgt % n });
      }
      return solved();
    },
    setLocked(on) {
      locked = on;
      root.classList.toggle('is-locked', on);
    },
    destroy() {
      resize.disconnect();
      renderer.dispose();
      renderer.renderer.forceContextLoss?.();
      root.replaceChildren();
      root.classList.remove('g-untangle', 'is-locked');
    },
  };
  return self;
};
