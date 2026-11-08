// Typed access to the paper's numbers plus the copy and media that go with them.
// Every score comes from paper.json, which scripts/sync-paper-data.py regenerates
// from the paper's LaTeX tables; nothing numeric is typed in by hand here.
import paper from './paper.json';

export type Level = 'all' | 'easy' | 'hard';
export type Kind = 'reasoning' | 'planning';
export type PropertyId = 'continuity' | 'separation' | 'order' | 'enclosure' | 'knots';

export const LEVELS: { id: Level; label: string; hint: string }[] = [
  { id: 'all', label: 'All', hint: '300 instances per task' },
  { id: 'easy', label: 'Easy', hint: '150 per task · human-evaluated' },
  { id: 'hard', label: 'Hard', hint: '150 per task' },
];

export const PROPERTIES: { id: PropertyId; name: string; question: string }[] = [
  { id: 'continuity', name: 'Continuity', question: 'Is there an unbroken path?' },
  { id: 'separation', name: 'Separation', question: 'One whole, or distinct parts?' },
  { id: 'order', name: 'Order', question: 'What comes before what?' },
  { id: 'enclosure', name: 'Enclosure', question: 'Inside, or outside?' },
  { id: 'knots', name: 'Knots', question: 'Truly knotted, or just tangled?' },
];

export interface Task {
  name: string;
  property: PropertyId;
  kind: Kind;
}

const TASK_META: Record<string, Omit<Task, 'name'>> = {
  '2D Maze': { property: 'continuity', kind: 'reasoning' },
  '3D Maze': { property: 'continuity', kind: 'reasoning' },
  Pipe: { property: 'continuity', kind: 'planning' },
  Assembly: { property: 'separation', kind: 'reasoning' },
  'One Stroke': { property: 'separation', kind: 'planning' },
  Bead: { property: 'order', kind: 'reasoning' },
  'Origami Point': { property: 'order', kind: 'reasoning' },
  Swap: { property: 'order', kind: 'planning' },
  Sheep: { property: 'enclosure', kind: 'reasoning' },
  Hole: { property: 'enclosure', kind: 'reasoning' },
  'Chat Noir': { property: 'enclosure', kind: 'planning' },
  Knots: { property: 'knots', kind: 'reasoning' },
  Untangle: { property: 'knots', kind: 'planning' },
};

export const TASKS: Task[] = paper.tasks.map((name) => {
  const meta = TASK_META[name];
  if (!meta) throw new Error(`site.ts has no metadata for task "${name}"`);
  return { name, ...meta };
});

export const taskIndex = (name: string) => TASKS.findIndex((t) => t.name === name);

// Short labels keep chart rows on one line; the full name stays in tooltips and tables.
const SHORT_NAMES: Record<string, string> = {
  'Nemotron-Nano-12B-VL-v2': 'Nemotron-Nano-12B',
  'Qwen3.5-397B-A17B': 'Qwen3.5-397B',
  'Llama-4-Maverick-17B-128E': 'Llama-4-Maverick',
  'Ministral-3-14B-Instruct-2512': 'Ministral-3-14B',
  'Gemma-4-31B-IT': 'Gemma-4-31B',
};

export interface Model {
  id: string;
  name: string;
  short: string;
  group: 'proprietary' | 'open-weight' | 'reference';
  scores: Partial<Record<Level, number[]>>;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const MODELS: Model[] = paper.models.map((m) => ({
  id: slug(m.name),
  name: m.name,
  short: SHORT_NAMES[m.name] ?? m.name,
  group: m.group as Model['group'],
  scores: { all: m.all, easy: m.easy, hard: m.hard },
}));

// Humans were evaluated on the Easy level only; random chance is reported on the full set.
export const HUMAN: Model = {
  id: 'human', name: 'Human', short: 'Human', group: 'reference', scores: { easy: paper.humanEasy },
};
export const RANDOM: Model = {
  id: 'random', name: 'Random chance', short: 'Random chance', group: 'reference', scores: { all: paper.random },
};

export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function kindMean(scores: number[], kind: Kind) {
  return mean(scores.filter((_, i) => TASKS[i].kind === kind));
}

export function propertyMean(scores: number[], property: PropertyId) {
  return mean(scores.filter((_, i) => TASKS[i].property === property));
}

/** Rows for one difficulty level: every model plus whichever references have data there. */
export function rowsFor(level: Level) {
  return [...MODELS, HUMAN, RANDOM]
    .filter((m) => m.scores[level])
    .map((m) => {
      const scores = m.scores[level]!;
      return { model: m, scores, reasoning: kindMean(scores, 'reasoning'), planning: kindMean(scores, 'planning') };
    });
}

export const fmt = (n: number, digits = 1) => n.toFixed(digits);

// ---------------------------------------------------------------- headline facts

const allRows = rowsFor('all').filter((r) => r.model.group !== 'reference');
const easyRows = rowsFor('easy');
const best = (rows: typeof allRows, key: 'reasoning' | 'planning') =>
  rows.reduce((a, b) => (b[key] > a[key] ? b : a));

const humanEasy = easyRows.find((r) => r.model.id === 'human')!;
const bestEasy = best(easyRows.filter((r) => r.model.group !== 'reference'), 'reasoning');
const openWeight = allRows.filter((r) => r.model.group === 'open-weight');
const randomAll = rowsFor('all').find((r) => r.model.id === 'random')!;

const trainingRows = paper.training.rows as Record<string, (number | null)[]>;
const trainingKinds = paper.training.tasks.map((t) => TASKS[taskIndex(t)].kind);
const trainingMean = (row: string, kind: Kind) =>
  mean(trainingRows[row].filter((v, i): v is number => trainingKinds[i] === kind && v !== null));

const verifier = paper.videoVerifier as Record<string, Record<string, { finalStateSuccess: number; processValid: number }>>;
const verifierCells = Object.values(verifier).flatMap((byGen) => Object.values(byGen));

export const FACTS = {
  instances: paper.release.core,
  extendedInstances: paper.release.extended,
  reasoningQuestions: 2400,
  planningEpisodes: 1500,
  perTask: 300,
  perLevel: 150,
  models: MODELS.length,
  videoModels: 7,
  tasks: TASKS.length,
  properties: PROPERTIES.length,
  planBelowReason: allRows.filter((r) => r.planning < r.reasoning).length,
  bestReasoning: best(allRows, 'reasoning'),
  bestPlanning: best(allRows, 'planning'),
  humanEasy,
  bestEasy,
  openWeightMaxPlan: Math.max(...openWeight.map((r) => r.planning)),
  randomPlan: randomAll.planning,
  training: {
    baseReasoning: trainingMean('Base', 'reasoning'),
    basePlanning: trainingMean('Base', 'planning'),
    bestReasoning: trainingMean('SFT + RL', 'reasoning'),
    bestPlanning: trainingMean('SFT + RL', 'planning'),
  },
  video: {
    rollouts: verifierCells.length * 105,
    bestEndpoint: Math.max(...verifierCells.map((c) => c.finalStateSuccess)),
    bestProcessValid: Math.max(...verifierCells.map((c) => c.processValid)),
    generators: Object.keys(Object.values(verifier)[0]).length,
  },
};

// ---------------------------------------------------------------- task explorer

export interface TaskDetail {
  prompt: string;
  /** Reasoning tasks: the reference answer. */
  answer?: string;
  /** Multiple-choice reasoning tasks: options, with the correct one marked. */
  options?: { label: string; image?: string; correct?: boolean }[];
  /** The scene; Origami lists its fold states in order. */
  media: { src: string; label?: string; width: number; height: number }[];
}

const img = (src: string, width: number, height: number, label?: string) => ({
  src: `/media/tasks/${src}.webp`, width, height, label,
});

export const TASK_DETAILS: Record<string, TaskDetail> = {
  '2D Maze': {
    prompt: 'Which points are connected to point A?',
    answer: '[E]',
    media: [img('maze2d', 541, 541)],
  },
  '3D Maze': {
    prompt: 'Which points are connected to point E?',
    answer: '[C, F]',
    media: [img('maze3d', 300, 546)],
  },
  Assembly: {
    prompt: 'Which option shows a correct subassembly of this shelf?',
    media: [img('assembly', 336, 336)],
    options: [
      { label: 'A', image: '/media/tasks/assembly-a.webp' },
      { label: 'B', image: '/media/tasks/assembly-b.webp' },
      { label: 'C', image: '/media/tasks/assembly-c.webp', correct: true },
      { label: 'D', image: '/media/tasks/assembly-d.webp' },
    ],
  },
  Bead: {
    prompt: 'List the bead colours in order along the string.',
    answer: '[Yellow, Red, …]',
    media: [img('bead', 547, 547)],
  },
  'Origami Point': {
    prompt: 'Track the marked point from state 1 to state 14 of the fold.',
    answer: '[F]',
    media: [img('origami-1', 607, 488, 'State 1'), img('origami-14', 609, 490, 'State 14')],
  },
  Sheep: {
    prompt: 'How many sheep cannot escape to the outside?',
    answer: '3',
    media: [img('sheep', 547, 547)],
  },
  Hole: {
    prompt: 'How many holes are visible in the top board?',
    answer: '13',
    media: [img('hole', 544, 546)],
  },
  Knots: {
    prompt: 'Which type is this scene?',
    media: [img('knot', 450, 284)],
    options: [
      { label: 'Simple ring' },
      { label: 'Knot', correct: true },
      { label: 'Open rope' },
      { label: 'Link' },
      { label: 'Unlinked ropes' },
    ],
  },
};

// ---------------------------------------------------------------- training

export const TRAINING = {
  tasks: paper.training.tasks,
  kinds: trainingKinds,
  methods: ['SFT', 'RL', 'SFT + RL', 'Leave-one-task-out RL'] as const,
  rows: trainingRows,
  mean: trainingMean,
};

// ---------------------------------------------------------------- error analysis

// Fixed categorical order = the paper's causal priority order (validated palette, slots 1-7).
export const ERROR_CATEGORIES = [
  { key: 'Instruction following', id: 'instruction', color: '#2a78d6', ink: '#fff' },
  { key: 'Task understanding', id: 'task', color: '#eb6834', ink: '#fff' },
  { key: 'Perception grounding', id: 'perception', color: '#1baf7a', ink: '#fff' },
  { key: 'Topological invariance', id: 'invariance', color: '#eda100', ink: '#0b0b0b' },
  { key: 'Feature state prediction', id: 'feature', color: '#e87ba4', ink: '#fff' },
  { key: 'Dynamic violation', id: 'dynamic', color: '#008300', ink: '#fff' },
  { key: 'Action planning', id: 'action', color: '#6250d6', ink: '#fff' },
] as const;

export const ERROR_MODELS = ['Combined', 'Gemini-3.1-Pro', 'InternVL3.5-241B'] as const;
export type ErrorModel = (typeof ERROR_MODELS)[number];

type ErrorCounts = Record<string, Record<ErrorModel, number>>;
export const ERRORS = paper.errors as { reasoning: ErrorCounts; planning: ErrorCounts };

/** One labeled failure per category (figure 5 of the paper). */
export const ERROR_EXAMPLES: Record<string, { task: string; quote: string; verdict: string; wide?: boolean }> = {
  instruction: { task: 'Sheep', quote: '“my final answer is that four sheep are trapped”', verdict: 'Output cut off; answers “unclear” (GT 4).' },
  task: { task: 'Assembly', quote: '“…the top shelf floating. Invalid. The subassemblies must be connected.”', verdict: 'Adds an unstated connectivity rule; rejects split A, answers C.', wide: true },
  perception: { task: 'Hole', quote: '“a cylindrical object inside, … Total is 8.”', verdict: 'That bar makes two holes; answers 8 (GT 9).' },
  invariance: { task: 'Knots', quote: '“… sequence indicates they are linked.”', verdict: 'Three free rings; answers C (GT A).' },
  feature: { task: '2D Maze', quote: '“the green bar appears to be the critical one”', verdict: 'Orange and blue also work; answers [green].' },
  dynamic: { task: 'Chat Noir', quote: '{"answer": 20} ×3', verdict: 'Three turns on the same cell; illegal, the cat escapes.' },
  action: { task: 'Pipe', quote: '“I’ve been rotating (1,0) in a cycle.”', verdict: 'Spins (1,0) a full turn; budget spent.' },
};

// ---------------------------------------------------------------- probing

export interface ProbeCell { condition: string; planner: string; task: string; success: number }
export const PROBING = paper.probing as ProbeCell[];
export const VIDEO_VERIFIER = verifier;
export const GENERATION_AUDIT = paper.generationAudit;
export const PAPER_SOURCE = paper.source;
