// Failure modes: the model switch re-proportions both stacks; hovering or focusing
// a legend key, a segment or a gallery card highlights that category everywhere.

import { ERROR_CATEGORIES, ERRORS, fmt, type ErrorModel } from '../data/site';
import { bindRadioGroup, bindTooltip, onReveal, renderTable } from './viz';

export function initErrors() {
  const chart = document.getElementById('err-chart');
  const gallery = document.getElementById('err-gallery');
  if (!chart || !gallery) return;
  const table = document.getElementById('err-table') as HTMLTableElement;
  let model: ErrorModel = 'Combined';

  const shares = (split: 'reasoning' | 'planning') => {
    const counts = ERROR_CATEGORIES.map((c) => ERRORS[split][c.key][model]);
    const total = counts.reduce((a, b) => a + b, 0);
    return { counts, total, pct: counts.map((n) => (100 * n) / total) };
  };

  // Inline labels only where they fit; otherwise the legend, tooltip and table carry the value.
  const fitLabels = () => {
    chart.querySelectorAll<HTMLElement>('.err-seg').forEach((seg) => {
      const label = seg.querySelector<HTMLElement>('.seg-label')!;
      seg.classList.toggle('tight', label.scrollWidth + 12 > seg.getBoundingClientRect().width);
    });
  };

  const update = () => {
    const rows: (string | number)[][] = ERROR_CATEGORIES.map((c) => [c.key]);
    chart.querySelectorAll<HTMLElement>('.err-row').forEach((row) => {
      const split = row.dataset.split as 'reasoning' | 'planning';
      const s = shares(split);
      row.querySelector('[data-n]')!.textContent = String(s.total);
      row.querySelectorAll<HTMLElement>('.err-seg').forEach((seg, i) => {
        seg.style.flexBasis = `${s.pct[i]}%`;
        seg.classList.toggle('empty', s.counts[i] === 0);
        seg.querySelector('.seg-label')!.textContent = `${fmt(s.pct[i])}%`;
        seg.setAttribute('aria-label', `${split}, ${ERROR_CATEGORIES[i].key}: ${fmt(s.pct[i])}% (${s.counts[i]} of ${s.total})`);
        rows[i].push(`${fmt(s.pct[i])}% (${s.counts[i]})`);
      });
    });
    renderTable(table, ['Category', 'Reasoning', 'Planning'], rows);
    window.setTimeout(fitLabels, 720);
  };

  const highlight = (cat: string | null) => {
    chart.classList.toggle('err-chart-dim', !!cat);
    gallery.classList.toggle('dim', !!cat);
    document.querySelectorAll<HTMLElement>('#errors [data-cat]').forEach((el) => el.classList.toggle('on', el.dataset.cat === cat));
  };
  document.querySelectorAll<HTMLElement>('#errors [data-cat]').forEach((el) => {
    el.addEventListener('pointerenter', () => highlight(el.dataset.cat!));
    el.addEventListener('pointerleave', () => highlight(null));
    el.addEventListener('focus', () => highlight(el.dataset.cat!));
    el.addEventListener('blur', () => highlight(null));
  });

  bindTooltip(chart, '.err-seg', (seg) => {
    const split = seg.closest<HTMLElement>('.err-row')!.dataset.split as 'reasoning' | 'planning';
    const i = ERROR_CATEGORIES.findIndex((c) => c.id === seg.dataset.cat);
    const s = shares(split);
    return {
      title: `${ERROR_CATEGORIES[i].key} · ${split}`,
      rows: [
        { value: `${fmt(s.pct[i])}%`, label: 'of labeled failures', color: ERROR_CATEGORIES[i].color },
        { value: `${s.counts[i]} / ${s.total}`, label: 'failures' },
      ],
    };
  });

  bindRadioGroup(document.getElementById('err-control')!, (m) => {
    model = m as ErrorModel;
    update();
  });
  window.addEventListener('resize', fitLabels);
  update();
  onReveal(chart, () => {
    chart.classList.add('drawn');
    window.setTimeout(fitLabels, 720);
  });
}
