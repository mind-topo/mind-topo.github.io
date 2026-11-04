// Radar geometry and human comparison for the "Against humans" section. Shared
// by the server render and the client script so both draw the same chart.
import { MODELS, HUMAN, TASKS, kindMean } from './site';

// The viewBox leaves ~100 units around the labels so they can be set large on phones.
export const RADAR = { size: 640, c: 320, r: 192, label: 216, rings: [25, 50, 75, 100] };

const angle = (i: number) => -Math.PI / 2 + (i / TASKS.length) * Math.PI * 2;

export function point(i: number, value: number) {
  const a = angle(i);
  const d = (value / 100) * RADAR.r;
  return { x: RADAR.c + d * Math.cos(a), y: RADAR.c + d * Math.sin(a) };
}

const toPoints = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

export const easyScores = (id: string) => (id === 'human' ? HUMAN : MODELS.find((m) => m.id === id)!).scores.easy!;

export function radarGeometry(modelId: string) {
  const human = easyScores('human');
  const model = easyScores(modelId);
  const humanPts = human.map((v, i) => point(i, v));
  const modelPts = model.map((v, i) => point(i, v));
  const axes = TASKS.map((_, i) => point(i, 100));
  const labels = TASKS.map((_, i) => {
    const a = angle(i);
    const cos = Math.cos(a);
    return {
      x: RADAR.c + RADAR.label * cos,
      y: RADAR.c + RADAR.label * Math.sin(a),
      anchor: Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end',
    };
  });
  return { human: toPoints(humanPts), model: toPoints(modelPts), humanPts, modelPts, axes, labels };
}

export { toPoints };

/** Averages, the four largest per-task gaps, and the tasks where the model reaches human level. */
export function humanComparison(modelId: string) {
  const human = easyScores('human');
  const model = easyScores(modelId);
  const short = MODELS.find((m) => m.id === modelId)!.short;
  const rows = TASKS.map((t, i) => ({ task: t.name, human: human[i], model: model[i], gap: human[i] - model[i] }));
  const gaps = [...rows].sort((a, b) => b.gap - a.gap).slice(0, 4);
  const matches = rows.filter((r) => r.model >= r.human - 1).map((r) => r.task);
  const matchText = matches.length
    ? `${short} reaches human level (within 1 point) on ${matches.join(', ')}.`
    : `${short} does not reach human level on any task.`;
  return {
    reasoning: { model: kindMean(model, 'reasoning'), human: kindMean(human, 'reasoning') },
    planning: { model: kindMean(model, 'planning'), human: kindMean(human, 'planning') },
    gaps,
    matchText,
    rows,
  };
}
