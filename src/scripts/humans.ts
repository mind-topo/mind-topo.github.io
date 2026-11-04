// "Against humans": picking a model morphs its radar polygon and refreshes the
// side panel. Axis hover/focus shows both scores for that task.

import { MODELS, TASKS, fmt } from '../data/site';
import { easyScores, humanComparison, point, toPoints } from '../data/humans';
import { bindRadioGroup, bindTooltip, renderTable, tween } from './viz';

export function initHumans() {
  const svg = document.getElementById('radar');
  if (!svg) return;
  const poly = document.getElementById('radar-model')!;
  const dots = Array.from(svg.querySelectorAll<SVGCircleElement>('.vx.model'));
  const labels = Array.from(svg.querySelectorAll<SVGTextElement>('.axis-label'));
  const nameEl = document.getElementById('radar-model-name')!;
  const gapList = document.getElementById('gap-list')!;
  const matchNote = document.getElementById('match-note')!;
  const table = document.getElementById('radar-table') as HTMLTableElement;

  let current = MODELS[0].id;
  let shown = easyScores(current).slice();

  const draw = (values: number[]) => {
    const pts = values.map((v, i) => point(i, v));
    poly.setAttribute('points', toPoints(pts));
    dots.forEach((d, i) => {
      d.setAttribute('cx', pts[i].x.toFixed(1));
      d.setAttribute('cy', pts[i].y.toFixed(1));
    });
  };

  const renderSide = () => {
    const c = humanComparison(current);
    const model = MODELS.find((m) => m.id === current)!;
    nameEl.textContent = model.short;
    for (const k of ['reasoning', 'planning'] as const) {
      document.querySelector(`[data-avg="${k}"]`)!.textContent = fmt(c[k].model);
      document.querySelector(`[data-avg-gap="${k}"]`)!.textContent = fmt(c[k].model - c[k].human);
    }
    gapList.replaceChildren(
      ...c.gaps.map((g) => {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.className = 'gl-name';
        name.textContent = g.task;
        const bars = document.createElement('span');
        bars.className = 'gl-bars';
        const h = document.createElement('span');
        h.className = 'gl-human';
        h.style.width = `${g.human}%`;
        const m = document.createElement('span');
        m.className = 'gl-model';
        m.style.width = `${g.model}%`;
        bars.append(h, m);
        const gap = document.createElement('span');
        gap.className = 'gl-gap tabular';
        gap.textContent = `−${fmt(g.gap)}`;
        li.append(name, bars, gap);
        return li;
      }),
    );
    matchNote.textContent = c.matchText;
    renderTable(table, ['Task', 'Human (%)', `${model.name} (%)`, 'Gap (pts)'],
      c.rows.map((r) => [r.task, fmt(r.human, 2), fmt(r.model, 2), fmt(r.human - r.model, 2)]));
  };

  bindRadioGroup(document.getElementById('radar-control')!, (id) => {
    if (id === current) return;
    current = id;
    const from = shown.slice();
    const to = easyScores(id);
    tween(600, (t) => {
      shown = from.map((v, i) => v + (to[i] - v) * t);
      draw(shown);
    });
    renderSide();
  });

  const human = easyScores('human');
  bindTooltip(svg as unknown as HTMLElement, '.hit, .vx.model', (el) => {
    const i = Number(el.dataset.i);
    const model = MODELS.find((m) => m.id === current)!;
    labels.forEach((l, k) => l.classList.toggle('on', k === i));
    return {
      title: `${TASKS[i].name} · ${TASKS[i].kind}`,
      rows: [
        { value: `${fmt(human[i])}%`, label: 'Human', color: 'var(--human)' },
        { value: `${fmt(easyScores(current)[i])}%`, label: model.short, color: 'var(--model)' },
      ],
    };
  });
  svg.addEventListener('pointerleave', () => labels.forEach((l) => l.classList.remove('on')));
  renderSide();
}
