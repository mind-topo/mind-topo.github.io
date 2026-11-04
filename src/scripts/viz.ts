// Small shared toolkit for the hand-built charts: one tooltip, segmented
// controls, a tween helper and table views. No chart library: every chart is
// plain HTML/SVG so text stays crisp, selectable and readable without hovering.

import { prefersReducedMotion } from './site';

export interface TipRow {
  value: string;
  label: string;
  color?: string;
}

let tipEl: HTMLDivElement | null = null;

function tip() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'viz-tip';
    tipEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

/** Fill the tooltip with textContent only: labels come from data files. */
function renderTip(title: string, rows: TipRow[]) {
  const el = tip();
  el.replaceChildren();
  const t = document.createElement('div');
  t.className = 'tip-title';
  t.textContent = title;
  el.appendChild(t);
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'tip-row';
    if (r.color) {
      const key = document.createElement('span');
      key.className = 'tip-key';
      key.style.background = r.color;
      row.appendChild(key);
    }
    const v = document.createElement('span');
    v.className = 'tip-value';
    v.textContent = r.value;
    const l = document.createElement('span');
    l.className = 'tip-label';
    l.textContent = r.label;
    row.append(v, l);
    el.appendChild(row);
  }
}

function place(x: number, y: number) {
  const el = tip();
  const { width, height } = el.getBoundingClientRect();
  const pad = 14;
  let left = x + pad;
  let top = y - height - pad;
  if (left + width > window.innerWidth - 8) left = x - width - pad;
  if (top < 8) top = y + pad;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${top}px`;
}

export function hideTip() {
  tipEl?.classList.remove('show');
}

/**
 * Attach a tooltip to every element matching `selector` inside `root`. The
 * content callback reads the element's current data, so it stays right after
 * the chart re-renders. Keyboard focus shows the same tooltip as hover.
 */
export function bindTooltip(root: HTMLElement, selector: string, content: (el: HTMLElement) => { title: string; rows: TipRow[] } | null) {
  const show = (el: HTMLElement, x: number, y: number) => {
    const c = content(el);
    if (!c) return hideTip();
    renderTip(c.title, c.rows);
    tip().classList.add('show');
    place(x, y);
  };
  root.addEventListener('pointermove', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(selector);
    if (!el || !root.contains(el) || e.pointerType === 'touch') return;
    show(el, e.clientX, e.clientY);
  });
  root.addEventListener('pointerover', (e) => {
    if (!(e.target as HTMLElement).closest(selector)) hideTip();
  });
  root.addEventListener('pointerleave', hideTip);
  root.addEventListener('focusin', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(selector);
    if (!el) return;
    const r = el.getBoundingClientRect();
    show(el, r.left + r.width / 2, r.top);
  });
  root.addEventListener('focusout', hideTip);
  // Touch: a tap shows the tooltip at the mark; tapping elsewhere hides it.
  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(selector);
    if (!el) return;
    const r = el.getBoundingClientRect();
    show(el, r.left + r.width / 2, r.top);
  });
  window.addEventListener('scroll', hideTip, { passive: true });
}

/**
 * Wire a .segmented or .chip-row radiogroup: click or arrow keys select, and
 * `onChange` receives the chosen data-value. Returns a setter for programmatic use.
 */
export function bindRadioGroup(group: HTMLElement, onChange: (value: string) => void) {
  const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  const select = (btn: HTMLButtonElement, focus = false) => {
    for (const b of buttons) {
      const on = b === btn;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    if (focus) btn.focus();
    onChange(btn.dataset.value!);
  };
  buttons.forEach((b, i) => {
    b.addEventListener('click', () => select(b));
    b.addEventListener('keydown', (e) => {
      const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!delta) return;
      e.preventDefault();
      select(buttons[(i + delta + buttons.length) % buttons.length], true);
    });
  });
  return (value: string) => {
    const b = buttons.find((x) => x.dataset.value === value);
    if (b) select(b);
  };
}

/** requestAnimationFrame tween from 0..1 with ease-out; instant under reduced motion. */
export function tween(duration: number, frame: (t: number) => void) {
  if (prefersReducedMotion() || duration <= 0) {
    frame(1);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    frame(1 - Math.pow(1 - t, 3));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Re-order children with a FLIP animation so rows glide to their new places. */
export function flipReorder(container: HTMLElement, ordered: HTMLElement[]) {
  const before = new Map(ordered.filter((el) => el.isConnected).map((el) => [el, el.getBoundingClientRect().top]));
  ordered.forEach((el) => container.appendChild(el));
  if (prefersReducedMotion()) return;
  for (const el of ordered) {
    if (!before.has(el)) {
      // Newly added rows fade in where they land.
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-out' });
      continue;
    }
    const dy = before.get(el)! - el.getBoundingClientRect().top;
    if (!dy) continue;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
      duration: 520,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    });
  }
}

/** Render (or re-render) a chart's table view: the accessible twin of the chart. */
export function renderTable(table: HTMLTableElement, head: string[], rows: (string | number)[][]) {
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const h of head) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = h;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  const tbody = document.createElement('tbody');
  for (const r of rows) {
    const row = document.createElement('tr');
    r.forEach((cell, i) => {
      const td = document.createElement(i === 0 ? 'th' : 'td');
      if (i === 0) (td as HTMLTableCellElement).scope = 'row';
      td.textContent = String(cell);
      row.appendChild(td);
    });
    tbody.appendChild(row);
  }
  table.replaceChildren(thead, tbody);
}

/** Run `fn` once, the first time `el` is revealed (or immediately if it already is). */
export function onReveal(el: HTMLElement, fn: () => void) {
  const target = el.closest<HTMLElement>('[data-reveal]') ?? el;
  if (target.classList.contains('is-visible') || !document.documentElement.classList.contains('js')) return fn();
  let done = false;
  const run = () => {
    if (!done) {
      done = true;
      fn();
    }
  };
  target.addEventListener('reveal', run, { once: true });
  // Safety net in case the reveal observer never fires (e.g. printed or very tall viewports).
  setTimeout(() => target.classList.contains('is-visible') && run(), 1500);
}
