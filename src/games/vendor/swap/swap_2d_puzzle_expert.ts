// @ts-nocheck
// Vendored from mll-lab-nu/MindTopo @ 3e977584.
// Expert only; mirrors gym/swap_2d_puzzle_expert.py.
export const EXPERT_MOVE_RULE = "row_column_v1";
export const EXPERT_STEP_RANGE = [40, 44];
export const EXPERT_STEP_BUDGET = 75;
const EXPERT_BEAM_WIDTH = 1200;

export function expertLegalActions(blank, rows, cols) {
  return Array.from({ length: rows * cols }, (_, i) => i).filter(
    i => i !== blank && (Math.floor(i / cols) === Math.floor(blank / cols) || i % cols === blank % cols)
  );
}

const EXPERT_NEIGHBORS = Array.from({ length: 25 }, (_, i) => expertLegalActions(i, 5, 5));

function tileCost(position, target, cols) {
  return Number(Math.floor(position / cols) !== Math.floor(target / cols)) + Number(position % cols !== target % cols);
}

export function solveExpert(initial, goal, rows, cols, referenceActions = null, nodeLimit = 250000) {
  if (rows < 2 || cols < 2 || initial.length !== rows * cols || goal.length !== initial.length ||
      new Set(goal).size !== goal.length || new Set(initial).size !== initial.length ||
      !goal.includes("_") || initial.some(tile => !goal.includes(tile))) {
    throw new Error("Expert arrangements require the same unique tiles and one blank on the given grid.");
  }
  const state = initial.map(tile => goal.indexOf(tile));
  const blankTarget = goal.indexOf("_");
  const lowerBound = state.reduce((h, tile, i) => h + (tile === blankTarget ? 0 : tileCost(i, tile, cols)), 0);
  if (referenceActions !== null) {
    const check = initial.slice();
    for (const action of referenceActions) {
      const blank = check.indexOf("_");
      if (!Number.isInteger(action) || !expertLegalActions(blank, rows, cols).includes(action)) {
        throw new Error("Expert reference contains an illegal row/column swap.");
      }
      [check[blank], check[action]] = [check[action], check[blank]];
    }
    if (check.some((tile, i) => tile !== goal[i]) || referenceActions.length !== lowerBound) {
      throw new Error("Expert reference must solve the board and match the coordinate lower bound.");
    }
    return referenceActions.slice();
  }
  const neighbors = state.map((_, i) => expertLegalActions(i, rows, cols));
  const path = [];
  let nodes = 0;
  let bound = lowerBound;

  function search(blank, previous, cost, heuristic, seen) {
    if (++nodes > nodeLimit) {
      throw new Error("Expert exact search exceeded its node limit; no approximate distance was returned.");
    }
    if (cost + heuristic > bound) return cost + heuristic;
    if (heuristic === 0) return -1;
    const signature = state.join(",");
    if ((seen.get(signature) ?? Infinity) <= cost) return Infinity;
    seen.set(signature, cost);
    const candidates = neighbors[blank].filter(action => action !== previous).map(action => [
      heuristic + tileCost(blank, state[action], cols) - tileCost(action, state[action], cols), action
    ]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let threshold = Infinity;
    for (const [nextH, action] of candidates) {
      [state[blank], state[action]] = [state[action], state[blank]];
      path.push(action);
      const result = search(action, blank, cost + 1, nextH, seen);
      [state[blank], state[action]] = [state[action], state[blank]];
      if (result === -1) return -1;
      path.pop();
      threshold = Math.min(threshold, result);
    }
    return threshold;
  }

  while (true) {
    const result = search(state.indexOf(blankTarget), -1, 0, lowerBound, new Map());
    if (result === -1) return path.slice();
    if (result === Infinity) throw new Error("Expert board has no row/column solution.");
    bound = result;
  }
}

function boundedPlan(initial, blankTarget, target) {
  // Beam pruning can reject a solvable board; only a bound-matching witness
  // is accepted. Python uses the same numeric-state lexicographic tie break.
  const costs = Array.from({ length: 25 }, (_, p) => Array.from({ length: 25 }, (_, t) =>
    t === blankTarget ? 0 : tileCost(p, t, 5)));
  const key = state => String.fromCharCode(...state);
  const initialKey = key(initial);
  let beam = [{ h: target, state: initial.slice(), blank: initial.indexOf(blankTarget), previous: -1, path: [], key: initialKey }];
  const seen = new Set([initialKey]);
  for (let depth = 1; depth <= target; depth += 1) {
    const next = new Map();
    for (const node of beam) {
      for (const action of EXPERT_NEIGHBORS[node.blank]) {
        if (action === node.previous) continue;
        const nextH = node.h + costs[node.blank][node.state[action]] - costs[action][node.state[action]];
        if (depth + nextH > target) continue;
        const after = node.state.slice();
        [after[node.blank], after[action]] = [after[action], after[node.blank]];
        const afterKey = key(after);
        if (seen.has(afterKey) || next.has(afterKey)) continue;
        if (nextH === 0) return [...node.path, action];
        next.set(afterKey, { h: nextH, state: after, blank: action, previous: node.blank, path: [...node.path, action], key: afterKey });
      }
    }
    beam = [...next.values()].sort((a, b) => a.h - b.h || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).slice(0, EXPERT_BEAM_WIDTH);
    for (const node of beam) seen.add(node.key);
    if (!beam.length) break;
  }
  return null;
}

export function sampleExpert(goal, rng, minSteps = 1) {
  if (goal.length !== 25) throw new Error("Expert requires a 5x5 grid.");
  if (new Set(goal).size !== 25 || !goal.includes("_")) {
    throw new Error("Expert arrangements require unique tiles and one blank.");
  }
  const low = Math.max(EXPERT_STEP_RANGE[0], minSteps), high = EXPERT_STEP_RANGE[1];
  if (low > high) throw new Error(`Expert supports certified shortest distances from ${EXPERT_STEP_RANGE[0]} through ${high}.`);
  const draw = stop => rng ? rng.nextInt(stop) : Math.floor(Math.random() * stop);
  const targetSteps = low + draw(high - low + 1);
  const blankTarget = goal.indexOf("_");
  const positions = Array.from({ length: 25 }, (_, i) => i).filter(i => i !== blankTarget);
  function shuffled(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = draw(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  // Construct the requested lower bound directly. Match a proven-optimal
  // reference before accepting; no correctly placed colored tiles at reset.
  for (let attempt = 0; attempt < 512; attempt += 1) {
    const single = new Set(shuffled(positions).slice(0, 48 - targetSteps));
    const allowed = new Map(positions.map(p => [p, shuffled(positions.filter(t =>
      tileCost(p, t, 5) === (single.has(p) ? 1 : 2)))]));
    const match = new Map();
    function assign(position, seen) {
      for (const tile of allowed.get(position)) {
        if (seen.has(tile)) continue;
        seen.add(tile);
        if (!match.has(tile) || assign(match.get(tile), seen)) {
          match.set(tile, position);
          return true;
        }
      }
      return false;
    }
    if (!shuffled(positions).every(p => assign(p, new Set()))) continue;
    const encoded = Array(25).fill(blankTarget);
    for (const [tile, position] of match) encoded[position] = tile;
    let parity = 0;
    for (let i = 0; i < 25; i += 1) {
      for (let j = i + 1; j < 25; j += 1) parity ^= Number(encoded[i] > encoded[j]);
    }
    if (parity !== targetSteps % 2) continue;
    const referenceActions = boundedPlan(encoded, blankTarget, targetSteps);
    if (referenceActions === null) continue;
    const initialArrangement = encoded.map(tile => goal[tile]);
    solveExpert(initialArrangement, goal, 5, 5, referenceActions);
    return { initialArrangement, theoreticalMinSteps: targetSteps, referenceActions };
  }
  throw new Error(`Unable to construct a certified ${EXPERT_STEP_RANGE[0]}-${high}-step Expert board within the generation limit.`);
}
