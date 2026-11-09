// @ts-nocheck
// Vendored from mll-lab-nu/MindTopo @ 3e977584.
// Mirrors gym/chat_noir_expert.py. BigInt preserves all 61 board bits.
export const EXPERT_BLOCK_RANGE = [10, 13];
const NODE_LIMIT = 200000;

function* bitIndices(mask) {
  while (mask) {
    const bit = mask & -mask;
    yield bit.toString(2).length - 1;
    mask ^= bit;
  }
}

function bitCount(mask) {
  let count = 0;
  while (mask) { mask &= mask - 1n; count += 1; }
  return count;
}

function compareScores(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

class SearchLimit extends Error {}
class TimeLimit extends SearchLimit {}

export class ExpertEngine {
  constructor(board) {
    this.size = board.cells.length;
    this.bits = board.cells.map((_, i) => 1n << BigInt(i));
    this.full = (1n << BigInt(this.size)) - 1n;
    this.boundary = this.mask(board.boundaryIndices);
    this.neighbors = board.cells.map(c => c.neighborIndices.slice());
    this.neighborMasks = this.neighbors.map(ns => this.mask(ns));
    this.graph = this.neighbors.map((ns, i) =>
      (this.bits[i] & this.boundary) ? [...ns, this.size] : ns.slice());
    this.graph.push(board.boundaryIndices.slice());
    this.analysisCache = new Map();
    this.riskCache = new Map();
    this.moveCache = new Map();
  }

  mask(indices) {
    let value = 0n;
    for (const i of indices) value |= this.bits[i];
    return value;
  }

  analyze(blocked) {
    if (this.analysisCache.has(blocked)) return this.analysisCache.get(blocked);
    const distances = new Array(this.size).fill(-1);
    const paths = new Array(this.size).fill(0);
    const queue = Array.from(bitIndices(this.boundary & ~blocked));
    for (const i of queue) { distances[i] = 0; paths[i] = 1; }
    for (let head = 0; head < queue.length; head += 1) {
      const i = queue[head];
      for (const j of this.neighbors[i]) {
        if (blocked & this.bits[j]) continue;
        if (distances[j] < 0) {
          distances[j] = distances[i] + 1;
          queue.push(j);
        }
        if (distances[j] === distances[i] + 1) paths[j] += paths[i];
      }
    }
    const seen = new Array(this.size + 1).fill(-1);
    const low = new Array(this.size + 1).fill(0);
    const cuts = new Array(this.size).fill(0n);
    let clock = 0;
    const visit = (i, parent) => {
      seen[i] = low[i] = clock++;
      let subtree = i < this.size ? this.bits[i] : 0n;
      for (const j of this.graph[i]) {
        if (j === parent || (j < this.size && (blocked & this.bits[j]))) continue;
        if (seen[j] < 0) {
          const child = visit(j, i);
          subtree |= child;
          low[i] = Math.min(low[i], low[j]);
          if (i < this.size && low[j] >= seen[i]) {
            for (const cat of bitIndices(child)) cuts[cat] |= this.bits[i];
          }
        } else low[i] = Math.min(low[i], seen[j]);
      }
      return subtree;
    };
    visit(this.size, -1);
    const result = { distances, paths, cuts };
    if (this.analysisCache.size >= 8192) this.analysisCache.clear();
    this.analysisCache.set(blocked, result);
    return result;
  }

  twoTurnRisk(cat, blocked) {
    return this.captureRisk(cat, blocked, 2);
  }

  threeTurnRisk(cat, blocked) {
    return this.captureRisk(cat, blocked, 3);
  }

  captureRisk(cat, blocked, turns) {
    const key = `${cat}:${blocked}:${turns}`;
    if (this.riskCache.has(key)) return this.riskCache.get(key);
    if (this.bits[cat] & this.boundary) return false;
    // Two adjacent exits guarantee escape; no full board analysis is needed.
    const exits = this.neighborMasks[cat] & this.boundary & ~blocked;
    if (exits & (exits - 1n)) return false;
    let actions = exits || (this.full & ~blocked & ~this.bits[cat]);
    for (const reply of bitIndices(this.neighborMasks[cat] & ~blocked)) {
      const replyExits = this.neighborMasks[reply] & this.boundary & ~blocked;
      if (replyExits & (replyExits - 1n)) {
        // Leave no reply that still has two immediate exits after this block.
        actions &= this.bits[reply] | (bitCount(replyExits) === 2 ? replyExits : 0n);
        if (!actions) return false;
      }
    }
    // A certified capture in fewer turns also fits this horizon.
    if (turns > 1 && this.riskCache.get(`${cat}:${blocked}:${turns - 1}`)) return true;
    const { distances, cuts } = this.analyze(blocked);
    if (distances[cat] < 0 || cuts[cat]) return true;
    if (turns <= 1) return false;
    let risk = false;
    for (const action of bitIndices(actions)) {
      const after = blocked | this.bits[action];
      // cuts[cat] already proves no single legal block can disconnect this cat.
      const replies = this.neighborMasks[cat] & ~after;
      if (replies & this.boundary) continue;
      if (Array.from(bitIndices(replies)).every(j => this.captureRisk(j, after, turns - 1))) {
        risk = true;
        break;
      }
    }
    if (this.riskCache.size >= 32768) this.riskCache.clear();
    this.riskCache.set(key, risk);
    return risk;
  }

  evaluate(cat, blocked) {
    const { distances, paths, cuts } = this.analyze(blocked);
    const entries = [];
    for (const move of this.neighbors[cat]) {
      if (blocked & this.bits[move]) continue;
      const distance = distances[move];
      const oneRisk = distance < 0 || Boolean(cuts[move]);
      const twoRisk = this.twoTurnRisk(move, blocked);
      const threeRisk = this.threeTurnRisk(move, blocked);
      const degree = bitCount(this.neighborMasks[move] & ~blocked);
      entries.push({ moveIndex: move, distance: distance < 0 ? null : distance,
        degree, shortestPathCount: paths[move], oneTurnCaptureRisk: oneRisk,
        twoTurnCaptureRisk: twoRisk,
        threeTurnCaptureRisk: threeRisk,
        scoreTuple: [distance === 0 ? 0 : 1, Number(oneRisk), Number(twoRisk), Number(threeRisk),
          distance < 0 ? Infinity : distance, -paths[move], -degree, move] });
    }
    entries.sort((a, b) => compareScores(a.scoreTuple, b.scoreTuple));
    return entries;
  }

  choose(cat, blocked) {
    const key = `${cat}:${blocked}`;
    if (!this.moveCache.has(key)) {
      const { distances, paths, cuts } = this.analyze(blocked);
      const score = i => [distances[i] === 0 ? 0 : 1,
        Number(distances[i] < 0 || Boolean(cuts[i])),
        distances[i] < 0 ? Infinity : distances[i], -paths[i],
        -bitCount(this.neighborMasks[i] & ~blocked), i];
      let moves = Array.from(bitIndices(this.neighborMasks[cat] & ~blocked));
      moves.sort((a, b) => compareScores(score(a), score(b)));
      let chosen = moves.length ? moves[0] : null;
      if (chosen !== null && score(chosen)[0] === 1 && score(chosen)[1] === 0) {
        moves = moves.filter(move => score(move)[0] === 1 && score(move)[1] === 0);
        // Three-turn safety implies two-turn safety. Preserve every tie-break.
        const safe = moves.find(move => !this.threeTurnRisk(move, blocked));
        chosen = safe ?? moves.find(move => !this.twoTurnRisk(move, blocked)) ?? chosen;
      }
      if (this.moveCache.size >= 8192) this.moveCache.clear();
      this.moveCache.set(key, chosen);
    }
    return this.moveCache.get(key);
  }

  // Counts are stopping thresholds for certified witnesses, not upper bounds.
  solve(cat, blocked, maxSteps, {
    winningFirstActionLimit = null, adjacentWinningFirstActionLimit = null, nodeLimit = NODE_LIMIT,
    rejectAdjacentWins = false, timeoutMs = null
  } = {}) {
    let nodes = 0;
    const memo = new Map();
    const witnesses = {};
    const deadline = timeoutMs === null ? null : performance.now() + timeoutMs;
    let adjacentPending = this.neighborMasks[cat] & ~blocked;
    const actionResult = (current, walls, action, remaining) => {
      if (deadline !== null && performance.now() >= deadline) throw new TimeLimit();
      if (++nodes > nodeLimit) throw new SearchLimit();
      const after = walls | this.bits[action];
      if (this.neighborMasks[current] & this.boundary & ~after) return null;
      if (this.analyze(after).distances[current] < 0) return [action];
      const nextCat = this.choose(current, after);
      if (nextCat === null) return [action];
      if (this.bits[nextCat] & this.boundary) return null;
      const suffix = canTrap(nextCat, after, remaining - 1);
      return suffix === null ? null : [action, ...suffix];
    };
    const canTrap = (current, walls, remaining) => {
      if (this.bits[current] & this.boundary) return null;
      const { distances, cuts } = this.analyze(walls);
      if (distances[current] < 0) return [];
      if (remaining <= 0) return null;
      if (cuts[current]) return [bitIndices(cuts[current]).next().value];
      const key = `${current}:${walls}:${remaining}`;
      if (memo.has(key)) return memo.get(key);
      const exits = this.neighborMasks[current] & this.boundary & ~walls;
      if (exits & (exits - 1n)) { memo.set(key, null); return null; }
      const actions = Array.from(bitIndices(exits || (this.full & ~walls & ~this.bits[current])));
      actions.sort((a, b) => Number(!(this.bits[a] & this.neighborMasks[current])) -
        Number(!(this.bits[b] & this.neighborMasks[current])) || a - b);
      for (const action of actions) {
        const result = actionResult(current, walls, action, remaining);
        if (result !== null) { memo.set(key, result); return result; }
      }
      memo.set(key, null);
      return null;
    };
    const winning = [], adjacent = [];
    let complete = true, hitLimit = false, hitTimeLimit = false;
    try {
      if (maxSteps > 0 && !(this.bits[cat] & this.boundary)) {
        const rootActions = Array.from(bitIndices(this.full & ~blocked & ~this.bits[cat]));
        rootActions.sort((a, b) => Number(!(this.bits[a] & this.neighborMasks[cat])) -
          Number(!(this.bits[b] & this.neighborMasks[cat])) || a - b);
        for (const action of rootActions) {
          const result = actionResult(cat, blocked, action, maxSteps);
          adjacentPending &= ~this.bits[action];
          if (result !== null) {
            winning.push(action);
            witnesses[String(action)] = result;
            if (this.bits[action] & this.neighborMasks[cat]) {
              adjacent.push(action);
              if (rejectAdjacentWins) { complete = false; break; }
            }
            if (winningFirstActionLimit !== null && winning.length >= winningFirstActionLimit &&
                (adjacentWinningFirstActionLimit === null || adjacent.length >= adjacentWinningFirstActionLimit)) {
              complete = false;
              break;
            }
          }
        }
      }
    } catch (error) {
      if (!(error instanceof SearchLimit)) throw error;
      complete = false;
      hitTimeLimit = error instanceof TimeLimit;
      hitLimit = !hitTimeLimit;
    }
    return { solvable: winning.length > 0, maxSteps, searchDepth: maxSteps,
      nodesSearched: nodes, hitNodeLimit: hitLimit, branchLimit: null,
      hitTimeLimit,
      searchComplete: complete, winningFirstActionCountExact: complete,
      firstAction: winning.length ? winning[0] : null,
      winningFirstActions: winning, winningFirstActionCount: winning.length,
      winningFirstActionSearchLimit: winningFirstActionLimit, adjacentWinningFirstActions: adjacent,
      adjacentWinningFirstActionCount: adjacent.length,
      adjacentWinningFirstActionCountExact: complete || adjacentPending === 0n,
      adjacentWinningFirstActionSearchLimit: adjacentWinningFirstActionLimit, winningActionSequences: witnesses };
  }

  certifyOpening(cat, blocked, maxSteps, {
    nodeLimit = NODE_LIMIT, timeoutMs = 30000, minWinningFirstActions = 1
  } = {}) {
    // Prove every adjacent start loses before accepting any distant witness.
    const result = this.solve(cat, blocked, maxSteps, {
      winningFirstActionLimit: minWinningFirstActions, rejectAdjacentWins: true, nodeLimit, timeoutMs
    });
    return { ...result, expertOpeningFilterPassed: result.adjacentWinningFirstActionCountExact &&
      result.winningFirstActionCount >= minWinningFirstActions &&
      result.adjacentWinningFirstActionCount === 0 };
  }
}
