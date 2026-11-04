// Results section: one difficulty control drives the action-gap dumbbell and the
// leaderboard heatmap. Rows keep their DOM nodes, so values animate and rows
// glide (FLIP) to their new rank instead of being redrawn.

import { LEVELS, TASKS, rowsFor, fmt, type Level } from '../data/site';
import { gapHeadline, heat } from '../data/results';
import { bindRadioGroup, bindTooltip, flipReorder, onReveal, renderTable } from './viz';

type Row = ReturnType<typeof rowsFor>[number];

const isRef = (r: Row) => r.model.group === 'reference';
const signed = (d: number) => (d > 0 ? '+' : '−') + fmt(Math.abs(d));

function initDumbbell(getRows: () => Row[]) {
  const chart = document.getElementById('dumbbell')!;
  const list = document.getElementById('db-rows')!;
  const table = document.getElementById('gap-table') as HTMLTableElement;
  const title = document.getElementById('gap-title')!;
  const note = document.getElementById('gap-note')!;
  const nodes = new Map<string, HTMLElement>();
  list.querySelectorAll<HTMLElement>('.db-row').forEach((el) => nodes.set(el.dataset.id!, el));

  const template = list.querySelector<HTMLElement>('.db-row.reference') ?? list.firstElementChild as HTMLElement;
  const nodeFor = (r: Row) => {
    let el = nodes.get(r.model.id);
    if (!el) {
      // Human only exists on the Easy level: clone a reference row the first time it is needed.
      el = template.cloneNode(true) as HTMLElement;
      el.dataset.id = r.model.id;
      el.className = `db-row ${r.model.group}`;
      el.querySelector('.db-name')!.textContent = r.model.short;
      nodes.set(r.model.id, el);
    }
    return el;
  };

  const update = (level: Level) => {
    const rows = getRows();
    const ordered = rows.map((r) => {
      const el = nodeFor(r);
      el.style.setProperty('--r', String(r.reasoning));
      el.style.setProperty('--p', String(r.planning));
      el.classList.toggle('flip', r.planning > r.reasoning);
      el.querySelector('.db-delta')!.textContent = signed(r.planning - r.reasoning);
      el.setAttribute('aria-label', `${r.model.name}: reasoning ${fmt(r.reasoning)}%, planning ${fmt(r.planning)}%`);
      return el;
    });
    for (const [id, el] of nodes) if (!rows.some((r) => r.model.id === id)) el.remove();
    flipReorder(list, ordered);

    const h = gapHeadline(level);
    title.textContent = h.title;
    note.textContent = h.note;
    renderTable(table, ['Model', 'Reasoning avg (%)', 'Planning avg (%)', 'Plan − Reason'],
      rows.map((r) => [r.model.name, fmt(r.reasoning, 2), fmt(r.planning, 2), signed(r.planning - r.reasoning)]));
  };

  bindTooltip(chart, '.db-row', (el) => {
    const r = getRows().find((x) => x.model.id === el.dataset.id);
    if (!r) return null;
    return {
      title: r.model.name,
      rows: [
        { value: `${fmt(r.reasoning)}%`, label: 'reasoning avg', color: 'var(--reason)' },
        { value: `${fmt(r.planning)}%`, label: 'planning avg', color: 'var(--plan)' },
        { value: signed(r.planning - r.reasoning), label: 'points, plan − reason' },
      ],
    };
  });
  onReveal(chart, () => chart.classList.add('drawn'));
  return update;
}

function initLeaderboard(getRows: () => Row[]) {
  const table = document.getElementById('leaderboard')!;
  const body = document.getElementById('lb-body')!;
  const headers = Array.from(table.querySelectorAll<HTMLButtonElement>('.lb-sort'));
  let sortKey = 'reasoning';
  let desc = true;

  const value = (r: Row, key: string) =>
    key === 'name' ? r.model.short.toLowerCase() : key === 'reasoning' ? r.reasoning : key === 'planning' ? r.planning : r.scores[Number(key)];

  const nodes = new Map<string, HTMLTableRowElement>();
  body.querySelectorAll<HTMLTableRowElement>('tr').forEach((tr) => nodes.set(tr.dataset.id!, tr));

  const rowFor = (r: Row) => {
    let tr = nodes.get(r.model.id);
    if (!tr) {
      tr = document.createElement('tr');
      tr.dataset.id = r.model.id;
      tr.className = r.model.group;
      const th = document.createElement('th');
      th.scope = 'row';
      th.className = 'lb-model-col';
      th.title = r.model.name;
      th.textContent = r.model.short;
      tr.appendChild(th);
      for (let i = 0; i < TASKS.length + 2; i++) tr.appendChild(document.createElement('td'));
      nodes.set(r.model.id, tr);
    }
    return tr;
  };

  const render = () => {
    const rows = getRows();
    const evaluated = rows.filter((r) => !isRef(r));
    const best = ['reasoning', 'planning', ...TASKS.map((_, i) => String(i))].map((k) => Math.max(...evaluated.map((r) => value(r, k) as number)));
    const sorted = [...evaluated].sort((a, b) => {
      const va = value(a, sortKey);
      const vb = value(b, sortKey);
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return desc ? -cmp : cmp;
    });
    const refs = rows.filter(isRef);
    const ordered = [...sorted, ...refs].map((r) => {
      const tr = rowFor(r);
      const cells = tr.querySelectorAll('td');
      [r.reasoning, r.planning, ...r.scores].forEach((v, i) => {
        const td = cells[i];
        const h = heat(v);
        td.textContent = fmt(v);
        td.style.background = h.bg;
        td.style.color = h.ink;
        td.className = `${i < 2 ? 'avg' : ''} ${!isRef(r) && v === best[i] ? 'best' : ''}`.trim();
      });
      tr.classList.remove('ref-first');
      return tr;
    });
    if (refs.length) rowFor(refs[0]).classList.add('ref-first');
    for (const [id, tr] of nodes) if (!rows.some((r) => r.model.id === id)) tr.remove();
    flipReorder(body, ordered);

    headers.forEach((h) => {
      const th = h.closest('th')!;
      if (h.dataset.sort === sortKey) th.setAttribute('aria-sort', desc ? 'descending' : 'ascending');
      else th.removeAttribute('aria-sort');
    });
  };

  headers.forEach((h) =>
    h.addEventListener('click', () => {
      const key = h.dataset.sort!;
      if (key === sortKey) desc = !desc;
      else {
        sortKey = key;
        desc = key !== 'name';
      }
      render();
    }),
  );
  return render;
}

/** Show edge shadows (and a hint) only while part of the table is scrolled out of view. */
function initScrollCues() {
  const frame = document.getElementById('lb-frame');
  const scroller = document.getElementById('lb-scroll');
  if (!frame || !scroller) return;
  const update = () => {
    const max = scroller.scrollWidth - scroller.clientWidth;
    frame.classList.toggle('more-left', scroller.scrollLeft > 2);
    frame.classList.toggle('more-right', scroller.scrollLeft < max - 2);
  };
  scroller.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(scroller);
  update();
}

export function initResults() {
  if (!document.getElementById('dumbbell')) return;
  initScrollCues();
  let level: Level = 'all';
  const getRows = () =>
    rowsFor(level).sort((a, b) => Number(isRef(a)) - Number(isRef(b)) || b.reasoning - a.reasoning);

  const updateGap = initDumbbell(getRows);
  const renderBoard = initLeaderboard(getRows);
  const hint = document.getElementById('level-hint')!;

  updateGap(level);
  bindRadioGroup(document.getElementById('level-control')!, (v) => {
    level = v as Level;
    hint.textContent = LEVELS.find((l) => l.id === level)!.hint;
    updateGap(level);
    renderBoard();
  });
}
