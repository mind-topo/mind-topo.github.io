// Shared between the server render and the client scripts of the results
// section, so both always produce identical text and colors.
import { rowsFor, fmt, type Level } from './site';

/** Headline and note for the action-gap chart, written from the data for each level. */
export function gapHeadline(level: Level) {
  const rows = rowsFor(level).filter((r) => r.model.group !== 'reference');
  const below = rows.filter((r) => r.planning < r.reasoning);
  const byPlan = [...rows].sort((a, b) => b.planning - a.planning);
  const top = [...rows].sort((a, b) => b.reasoning - a.reasoning)[0];
  const human = rowsFor(level).find((r) => r.model.id === 'human');
  const exceptions = rows.filter((r) => r.planning >= r.reasoning).map((r) => r.model.short);

  if (level === 'easy' && human && exceptions.length) {
    const stay = exceptions.length === 1 ? 'it stays' : exceptions.length === 2 ? 'both stay' : 'all stay';
    return {
      title: `On Easy boards, ${below.length} of ${rows.length} models still plan worse than they reason`,
      note: `Only ${exceptions.join(' and ')} plan better here, and ${stay} below humans (${fmt(human.reasoning)}% reasoning, ${fmt(human.planning)}% planning).`,
    };
  }
  if (level === 'hard') {
    return {
      title: 'On Hard boards, planning collapses for every model',
      note: `${top.model.short} falls from ${fmt(top.reasoning)}% reasoning to ${fmt(top.planning)}% planning; every other model plans at ${fmt(byPlan[1].planning)}% or less.`,
    };
  }
  return {
    title: `${below.length} of ${rows.length} models plan worse than they reason`,
    note: `Averages over 8 reasoning and 5 planning tasks. ${top.model.short} drops from ${fmt(top.reasoning)}% to ${fmt(top.planning)}%; no open-weight model plans above ${fmt(Math.max(...rows.filter((r) => r.model.group === 'open-weight').map((r) => r.planning)))}%.`,
  };
}

// Sequential single-hue ramp (documented blue steps 100-600) for the leaderboard heatmap.
const RAMP: [number, [number, number, number]][] = [
  [0, [255, 255, 255]],
  [0.1, [235, 243, 253]],
  [0.25, [205, 226, 251]],
  [0.4, [158, 197, 244]],
  [0.55, [109, 167, 236]],
  [0.7, [57, 135, 229]],
  [0.85, [37, 106, 191]],
  [1, [24, 79, 149]],
];

/** Background and ink for a score in [0, 100]. */
export function heat(value: number) {
  const t = Math.max(0, Math.min(1, value / 100));
  let i = 1;
  while (i < RAMP.length - 1 && RAMP[i][0] < t) i++;
  const [t0, c0] = RAMP[i - 1];
  const [t1, c1] = RAMP[i];
  const k = (t - t0) / (t1 - t0 || 1);
  const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
  return { bg: `rgb(${c[0]}, ${c[1]}, ${c[2]})`, ink: t > 0.6 ? '#ffffff' : '#0f1d22' };
}

export const LB_COLUMNS = ['reasoning', 'planning'] as const;
