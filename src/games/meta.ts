// Copy for the five planning gyms, plus how humans and models did on each in the paper.
import { HUMAN, MODELS, taskIndex } from '../data/site';
import type { GameId } from './types';

export const GAMES: { id: GameId; task: string; property: string; goal: string; how: string; dark: boolean }[] = [
  { id: 'pipe', task: 'Pipe', property: 'Continuity', goal: 'Connect every pipe to the source.', how: 'Click a pipe to turn it 90°.', dark: true },
  { id: 'onestroke', task: 'One Stroke', property: 'Separation', goal: 'Draw one path from the green start to the red goal that leaves each color in its own region.', how: 'Arrow keys / WASD, or the pad.', dark: true },
  { id: 'swap', task: 'Swap', property: 'Order', goal: 'Rearrange the blocks to match the goal.', how: 'Click a block to swap it with the empty cell.', dark: false },
  { id: 'chatnoir', task: 'Chat Noir', property: 'Enclosure', goal: 'Trap the cat before it reaches the edge.', how: 'Click a cell to block it. The cat moves after you.', dark: false },
  { id: 'untangle', task: 'Untangle', property: 'Knots', goal: 'Leave no two ropes crossing.', how: 'Drag a rope end onto an empty peg.', dark: false },
];

/** Human (Easy level), best model on Easy and on Hard, from the paper's tables. */
export function scoresFor(task: string) {
  const i = taskIndex(task);
  const best = (level: 'easy' | 'hard') =>
    MODELS.reduce((a, m) => (m.scores[level]![i] > a.score ? { score: m.scores[level]![i], model: m.short } : a), { score: -1, model: '' });
  return { human: HUMAN.scores.easy![i], easy: best('easy'), hard: best('hard') };
}
