// @ts-nocheck
// Vendored from MLL-Lab/MindTopo @ 3e977584.
// Expert-only overpasses. Keep generation, search order and limits in sync
// with gym/pipe_expert.py. Every physical + is two independent channels.
export const EXPERT_PIPE_RULE = "overpass_v1";
export const MIXED_PIPE_RULE = "split_channels_v2";
export const isExpertPipeRule = rule => [EXPERT_PIPE_RULE, MIXED_PIPE_RULE].includes(rule);
export const CLASSIC_PIPE_RULE = "classic_v1";
const DIRS = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]];
const MAX_CANDIDATES = 200000;
const PROOF_NODE_LIMIT = 10000;
const ports = (mask) => DIRS.filter(([, , bit]) => mask & bit).length;

function neighbors(index, size) {
  const result = [];
  for (const [dx, dy, bit, opposite] of DIRS) {
    const x = index % size + dx, y = Math.floor(index / size) + dy;
    if (x >= 0 && x < size && y >= 0 && y < size) result.push([y * size + x, bit, opposite]);
  }
  return result;
}

function rotate(mask, ticks) {
  if (mask === 31 || mask === 47) return ticks % 2 ? 78 - mask : mask;
  for (let t = 0; t < ticks % 4; t += 1) mask = ((mask << 1) & 15) | (mask >> 3);
  return mask;
}

export function doubleBendState(pairing, rotation = 0) {
  // Low bits are visible ports; high bits encode NE/SW versus NW/SE.
  return (Number(pairing === 9) + rotation) % 2 === 0 ? 31 : 47;
}

export function expertChannelStates(masks, pairings = null, rotations = null) {
  return masks.map((mask, i) => rotate(pairings?.[i] ? doubleBendState(pairings[i]) : mask, rotations?.[i] ?? 0));
}

export function expertConnectivity(size, source, masks, bridges = null) {
  // Solver unions of ordinary pieces may be 15: pass the physical bridge set.
  bridges ??= new Set(masks.flatMap((mask, i) => mask === 15 ? [i] : []));
  const groups = masks.map((mask, i) => mask === 31 ? [3, 12] : mask === 47 ? [9, 6] : bridges.has(i) ? [5, 10] : [mask & 15]);
  const seen = new Set([2 * source]), queue = [2 * source];
  const powered = masks.map(() => 0);
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head], index = Math.floor(node / 2);
    const mask = groups[index][node % 2];
    powered[index] |= mask;
    for (const [other, bit, opposite] of neighbors(index, size)) {
      if ((mask & bit) && (masks[other] & opposite)) {
        const next = 2 * other + groups[other].findIndex(ports => ports & opposite);
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
  }
  return {
    connectedChannelMasks: powered,
    connectedChannelCount: seen.size,
    totalChannels: groups.reduce((sum, channels) => sum + channels.length, 0),
    connectedIndices: masks.flatMap((mask, i) => mask && powered[i] === (mask & 15) ? [i] : [])
  };
}

export function validateExpertTarget(size, source, masks, pairings = null, pipeRule = EXPERT_PIPE_RULE) {
  if (size !== 5 || masks.length !== 25 || masks.some(mask => !Number.isInteger(mask) || mask < 1 || mask > 15)) {
    throw new Error("Overpass Expert requires a full 5x5 board of valid pipe masks.");
  }
  if (!Number.isInteger(source) || source < 0 || source >= 25 || masks[source] === 15) {
    throw new Error("Overpass Expert requires the source on an ordinary pipe.");
  }
  if (pairings !== null && (!Array.isArray(pairings) || pairings.length !== 25 ||
      pairings.some((p, i) => !Number.isInteger(p) || ![0, 3, 9].includes(p) || (p && masks[i] !== 15)))) {
    throw new Error("doubleBendPairings must contain 25 values: 0, 3 (NE/SW), or 9 (NW/SE).");
  }
  const bends = pairings?.filter(Boolean).length ?? 0;
  if (pipeRule === MIXED_PIPE_RULE && (!bends || !masks.some((m, i) => m === 15 && !pairings[i]))) {
    throw new Error("Mixed Expert requires both overpasses and double bends, with saved doubleBendPairings.");
  }
  if (pipeRule !== MIXED_PIPE_RULE && bends) throw new Error("Double bends require pipeRule=split_channels_v2.");
  const bridges = masks.filter(mask => mask === 15).length;
  if (!bridges) throw new Error("Overpass Expert requires at least one + overpass.");
  if (masks.reduce((sum, mask) => sum + ports(mask), 0) !== 2 * (25 + bridges - 1)) {
    throw new Error("Overpass Expert target must be a tree of separate channels.");
  }
  if (expertConnectivity(size, source, expertChannelStates(masks, pairings)).connectedChannelCount !== 25 + bridges) {
    throw new Error("Overpass Expert target does not connect every channel.");
  }
}

function allowsPiece(index, mask, size, bridges) {
  if (bridges.has(index)) return true;
  const x = index % size, y = Math.floor(index / size);
  const sides = Number(x === 0 || x === size - 1) + Number(y === 0 || y === size - 1);
  if (sides === 2) return ports(mask) <= 1;
  if (sides === 1) return ports(mask) <= 2 && mask !== 5 && mask !== 10;
  return mask !== 15;
}

function generateTarget(size, source, rng, minJunctions, pairings = null) {
  const interior = Array.from({length: size * size}, (_, i) => i).filter(i => i !== source &&
    i % size > 0 && i % size < size - 1 && Math.floor(i / size) > 0 && Math.floor(i / size) < size - 1);
  const maximum = Math.min(interior.length, (size - 2) ** 2 - minJunctions);
  const minimum = pairings ? 2 : 1;
  if (maximum < minimum) return null;
  const bridges = new Set(), count = rng.randIntInclusive(minimum, maximum);
  for (let k = 0; k < count; k += 1) bridges.add(interior.splice(rng.randBelow(interior.length), 1)[0]);
  if (pairings) {
    const available = [...bridges].sort((a, b) => a - b), bends = rng.randIntInclusive(1, bridges.size - 1);
    for (let k = 0; k < bends; k += 1) {
      const index = available.splice(rng.randBelow(available.length), 1)[0];
      pairings[index] = [3, 9][rng.randBelow(2)];
    }
  }
  const masks = new Array(size * size).fill(0);
  const parent = Array.from({length: 2 * size * size}, (_, i) => i);
  let components = size * size + bridges.size;
  const node = (i, bit) => 2 * i + Number(pairings?.[i] ? !(pairings[i] & bit) : bridges.has(i) && (bit === 2 || bit === 8));
  function find(i) {
    while (i !== parent[i]) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  }
  function legal([i, j, bit, opposite]) {
    return find(node(i, bit)) !== find(node(j, opposite)) &&
      allowsPiece(i, masks[i] | bit, size, bridges) && allowsPiece(j, masks[j] | opposite, size, bridges);
  }
  function add([i, j, bit, opposite]) {
    parent[find(node(j, opposite))] = find(node(i, bit));
    components -= 1; masks[i] |= bit; masks[j] |= opposite;
  }
  const edges = masks.flatMap((_, i) => neighbors(i, size).filter(([j]) => i < j).map(e => [i, ...e]));
  for (const edge of edges) {
    if (bridges.has(edge[0]) || bridges.has(edge[1])) {
      if (!legal(edge)) return null;
      add(edge);
    }
  }
  while (components > 1) {
    const candidates = edges.filter(legal);
    if (!candidates.length) return null;
    add(candidates[rng.randBelow(candidates.length)]);
  }
  return masks;
}

function propagate(domains, adjacent) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < domains.length; i += 1) {
      const kept = domains[i].filter(mask => adjacent[i].every(([j, bit, opposite]) =>
        domains[j].some(other => Boolean(mask & bit) === Boolean(other & opposite))));
      if (!kept.length) return false;
      if (kept.length !== domains[i].length) { domains[i] = kept; changed = true; }
    }
  }
  return true;
}

export function certifyExpertLayout(masks, size = 5, unresolvedRange = [14, 25], probeRange = [6, 25], pairings = null) {
  masks = expertChannelStates(masks, pairings);
  const adjacent = masks.map((_, i) => neighbors(i, size));
  const domains = masks.map((mask, i) => [...new Set([0, 1, 2, 3].map(t => rotate(mask, t)))]
    .sort((a, b) => a - b).filter(v => (v & adjacent[i].reduce((sum, [, bit]) => sum + bit, 0)) === (v & 15)));
  if (!propagate(domains, adjacent)) return false;
  const local = domains.filter(d => d.length > 1).length;
  if (local < unresolvedRange[0] || local > unresolvedRange[1]) return false;
  const bridges = new Set(masks.flatMap((mask, i) => mask === 15 ? [i] : []));
  const source = masks.findIndex(mask => (mask & 15) !== 15);
  if (source < 0) return false;
  function possible(options) {
    const unions = options.map(values => values.reduce((mask, value) => mask | value, 0));
    // Union 63 joins the ports of both double-bend possibilities optimistically.
    return expertConnectivity(size, source, unions, bridges).connectedIndices.length === masks.length;
  }
  let visited = 0;
  function count(options) {
    visited += 1;
    if (visited > PROOF_NODE_LIMIT) return null;
    if (!propagate(options, adjacent) || !possible(options)) return 0;
    const undecided = options.flatMap((values, i) => values.length > 1 ? [i] : []);
    if (!undecided.length) return 1;
    undecided.sort((a, b) => options[a].length - options[b].length || a - b);
    const index = undecided[0]; let total = 0;
    for (const candidate of options[index]) {
      const branch = options.map(values => values.slice()); branch[index] = [candidate];
      const found = count(branch);
      if (found === null) return null;
      total += found; if (total >= 2) return 2;
    }
    return total;
  }
  if (count(domains.map(values => values.slice())) !== 1) return false;
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < domains.length; i += 1) {
      if (domains[i].length <= 1) continue;
      const kept = domains[i].filter(candidate => {
        const trial = domains.map(values => values.slice()); trial[i] = [candidate];
        return propagate(trial, adjacent) && possible(trial);
      });
      if (!kept.length) return false;
      if (kept.length !== domains[i].length) {
        domains[i] = kept; changed = true;
        if (!propagate(domains, adjacent)) return false;
      }
    }
  }
  const remaining = domains.filter(values => values.length > 1).length;
  return remaining >= probeRange[0] && remaining <= probeRange[1];
}

export function sampleExpertPipe(size, rng, {sourceIndex = null, minTicks = 40, maxTicks = 48,
  minJunctions = 5, maxJunctions = 7, unresolvedRange = [14, 25], probeRange = [6, 25],
  connectedRange = [1, 3], misorientedRange = [20, 25], pipeRule = MIXED_PIPE_RULE} = {}) {
  if (!isExpertPipeRule(pipeRule)) throw new Error(`Unsupported Expert Pipe rule: ${pipeRule}`);
  const mixed = pipeRule === MIXED_PIPE_RULE;
  if (size !== 5 || minJunctions > (size - 2) ** 2 - (mixed ? 2 : 1)) {
    throw new Error("Overpass Expert requires 5x5 with room for branches and at least one overpass.");
  }
  for (let attempt = 0; attempt < MAX_CANDIDATES; attempt += 1) {
    const source = Number.isInteger(sourceIndex) ? sourceIndex : rng.randBelow(size * size);
    const pairings = mixed ? new Array(size * size).fill(0) : null;
    const masks = generateTarget(size, source, rng, minJunctions, pairings);
    if (!masks) continue;
    const junctions = masks.filter(mask => ports(mask) === 3).length;
    if (junctions < minJunctions || junctions > maxJunctions || !certifyExpertLayout(masks, size, unresolvedRange, probeRange, pairings)) continue;
    const ordinary = masks.flatMap((mask, i) => mask !== 15 || pairings?.[i] ? [i] : []);
    const capacities = masks.map((mask, i) => [5, 10].includes(mask) || pairings?.[i] ? 1 : 3);
    const low = misorientedRange[0], high = Math.min(misorientedRange[1], ordinary.length);
    if (low > high) continue;
    for (let attempt = 0; attempt < 512; attempt += 1) {
      const available = ordinary.slice(), chosen = [], count = rng.randIntInclusive(low, high);
      for (let k = 0; k < count; k += 1) chosen.push(available.splice(rng.randBelow(available.length), 1)[0]);
      if (mixed && !chosen.some(i => pairings[i])) continue;
      const ticks = masks.map((_, i) => Number(chosen.includes(i)));
      const capacity = chosen.reduce((sum, i) => sum + capacities[i], 0);
      const upper = Math.min(maxTicks, capacity), lower = Math.max(minTicks, chosen.length);
      if (upper < lower) continue;
      const total = rng.randIntInclusive(lower, upper);
      for (let k = 0; k < total - chosen.length; k += 1) {
        const options = chosen.filter(i => ticks[i] < capacities[i]);
        ticks[options[rng.randBelow(options.length)]] += 1;
      }
      const rotations = masks.map((mask, i) => mask === 15 && !pairings?.[i] ? rng.randBelow(4) : (4 - ticks[i]) % 4);
      const current = expertChannelStates(masks, pairings, rotations);
      const connected = expertConnectivity(size, source, current).connectedChannelCount;
      if (connected < connectedRange[0] || connected > connectedRange[1]) continue;
      return {sourceIndex: source, solvedMasks: masks, rotations, solutionTicks: total,
        difficulty: "expert", junctionCount: junctions, pipeRule,
        ...(mixed ? {doubleBendPairings: pairings} : {})};
    }
  }
  throw new Error("Unable to generate Overpass Expert within the candidate limit; no difficulty filters were relaxed.");
}

export function drawOverpass(svg, rotation, poweredMask) {
  const ns = "http://www.w3.org/2000/svg";
  const horizontalOnTop = rotation % 2 === 0;
  const color = mask => (poweredMask & mask) === mask ? "#19d955" : "#0aa2ff";
  const group = document.createElementNS(ns, "g");
  // Rotate the whole drawing so the arch follows every clockwise quarter-turn.
  group.setAttribute("transform", `rotate(${rotation * 90} 50 50)`);
  svg.appendChild(group);
  function path(d, stroke, width, extra = {}) {
    const element = document.createElementNS(ns, "path");
    for (const [key, value] of Object.entries({d, fill: "none", stroke, "stroke-width": width, "stroke-linecap": "round", ...extra})) {
      element.setAttribute(key, String(value));
    }
    group.appendChild(element);
    return element;
  }
  const bottom = "M50 10 V90";
  const top = "M10 50 H32 C36 50 38 30 50 30 S64 50 68 50 H90";
  path(bottom, color(horizontalOnTop ? 5 : 10), 15);
  // A dark clearance around the raised pipe visibly separates the two channels.
  path(top, "#102331", 23);
  path(top, color(horizontalOnTop ? 10 : 5), 15);
  path(top, "#ffffff", 3, {opacity: "0.5", transform: "translate(0 -3)"});
  svg.dataset.pipeType = "overpass";
}

export function drawDoubleBend(svg, pairing, rotation, poweredMask) {
  const ns = "http://www.w3.org/2000/svg";
  const turns = rotation + Number(pairing === 9);
  const group = document.createElementNS(ns, "g");
  group.setAttribute("transform", `rotate(${turns * 90} 50 50)`);
  svg.appendChild(group);
  for (const [pathData, ports] of [["M50 10 Q50 50 90 50", 3], ["M50 90 Q50 50 10 50", 12]]) {
    const currentPorts = rotate(ports, turns);
    const path = document.createElementNS(ns, "path");
    for (const [key, value] of Object.entries({d: pathData, fill: "none", "stroke-width": 15,
      "stroke-linecap": "round", stroke: (poweredMask & currentPorts) === currentPorts ? "#19d955" : "#0aa2ff"})) {
      path.setAttribute(key, String(value));
    }
    group.appendChild(path);
  }
  svg.dataset.pipeType = "double-bend";
}
