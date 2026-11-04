// Training section: switching method animates each task's bar against the base marker.

import { TRAINING, fmt } from '../data/site';
import { bindRadioGroup, bindTooltip, onReveal, renderTable } from './viz';

const signed = (d: number) => `${d >= 0 ? '+' : '−'}${fmt(Math.abs(d))}`;

export function initTraining() {
  const chart = document.getElementById('training-chart');
  if (!chart) return;
  const rows = Array.from(chart.querySelectorAll<HTMLElement>('.train-row'));
  const table = document.getElementById('training-table') as HTMLTableElement;
  const base = TRAINING.rows.Base as number[];
  let method = 'SFT + RL';

  const update = () => {
    const values = TRAINING.rows[method];
    rows.forEach((row) => {
      const i = Number(row.dataset.i);
      const v = values[i];
      row.classList.toggle('na', v === null);
      row.style.setProperty('--v', String(v ?? 0));
      row.querySelector('.tr-value')!.textContent = v === null ? '—' : fmt(v);
      row.querySelector('.tr-delta')!.textContent = v === null ? '' : signed(v - base[i]);
    });
    for (const kind of ['reasoning', 'planning'] as const) {
      const has = values.some((v, i) => v !== null && TRAINING.kinds[i] === kind);
      const now = has ? TRAINING.mean(method, kind) : null;
      const b = TRAINING.mean('Base', kind);
      document.querySelector(`[data-tile="${kind}"]`)!.textContent = now === null ? 'n/a' : `${fmt(now)}%`;
      document.querySelector(`[data-tile-delta="${kind}"]`)!.textContent = now === null ? 'not evaluated for this method' : `${signed(now - b)} pts`;
    }
    renderTable(table, ['Task', 'Type', 'Base (%)', `${method} (%)`, 'Change (pts)'],
      TRAINING.tasks.map((t, i) => [t, TRAINING.kinds[i], fmt(base[i], 2), values[i] === null ? '—' : fmt(values[i]!, 2), values[i] === null ? '—' : signed(values[i]! - base[i])]));
  };

  bindRadioGroup(document.getElementById('method-control')!, (m) => {
    method = m;
    update();
  });
  bindTooltip(chart, '.train-row', (el) => {
    const i = Number(el.dataset.i);
    const v = TRAINING.rows[method][i];
    return {
      title: TRAINING.tasks[i],
      rows: [
        { value: v === null ? 'n/a' : `${fmt(v)}%`, label: method, color: TRAINING.kinds[i] === 'reasoning' ? 'var(--reason)' : 'var(--plan)' },
        { value: `${fmt(base[i])}%`, label: 'base model', color: 'var(--ink)' },
      ],
    };
  });
  update();
  onReveal(chart, () => chart.classList.add('drawn'));
}
