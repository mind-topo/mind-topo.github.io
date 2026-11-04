// Visual imagination: planner switch for the image-interleaving probe, tooltips,
// and draw-on-reveal for the verifier bars.

import { PROBING, fmt } from '../data/site';
import { bindRadioGroup, bindTooltip, onReveal, renderTable } from './viz';

const IMAGE = '+ GPT-Image-2 (image)';
const signed = (d: number) => `${d >= 0 ? '+' : '−'}${fmt(Math.abs(d))}`;

export function initImagination() {
  const chart = document.getElementById('probe-chart');
  if (!chart) return;
  const rows = Array.from(chart.querySelectorAll<HTMLElement>('.probe-row'));
  const table = document.getElementById('probe-table') as HTMLTableElement;
  let planner = 'GPT-5.6-Luna';

  const value = (condition: string, task: string) =>
    PROBING.find((p) => p.planner === planner && p.condition === condition && p.task === task)?.success ?? 0;

  const update = () => {
    rows.forEach((row) => {
      const task = row.dataset.task!;
      const a = value('Planner only', task);
      const b = value(IMAGE, task);
      row.style.setProperty('--a', String(a));
      row.style.setProperty('--b', String(b));
      row.querySelector('.pr-delta')!.textContent = signed(b - a);
      row.setAttribute('aria-label', `${task}: ${fmt(a)}% planner only, ${fmt(b)}% with generated frames`);
    });
    renderTable(table, ['Task', 'Planner only (%)', '+ GPT-Image-2 (%)', 'Change (pts)'],
      rows.map((r) => {
        const t = r.dataset.task!;
        return [t, fmt(value('Planner only', t), 2), fmt(value(IMAGE, t), 2), signed(value(IMAGE, t) - value('Planner only', t))];
      }));
  };

  bindRadioGroup(document.getElementById('planner-control')!, (p) => {
    planner = p;
    update();
  });
  bindTooltip(chart, '.probe-row', (row) => {
    const t = row.dataset.task!;
    return {
      title: `${t} · ${planner}`,
      rows: [
        { value: `${fmt(value('Planner only', t))}%`, label: 'planner only', color: 'var(--ink-3)' },
        { value: `${fmt(value(IMAGE, t))}%`, label: '+ GPT-Image-2', color: 'var(--model)' },
      ],
    };
  });
  update();
  onReveal(chart, () => chart.classList.add('drawn'));

  const verifier = document.querySelector<HTMLElement>('.verifier');
  if (verifier) onReveal(verifier, () => verifier.classList.add('drawn'));
}
