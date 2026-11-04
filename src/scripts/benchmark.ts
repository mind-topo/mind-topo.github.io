// Benchmark section: the invariance demo, property tabs, state steppers for the
// planning gyms, and the try-it-yourself answers.

import { prefersReducedMotion } from './site';
import { area, harmonics, loopPoints, perimeter, runWhileVisible, smoothPath } from './loops';
import { onReveal } from './viz';

/** The loop bends toward the pointer (a Gaussian bump in r(θ)); it never self-intersects. */
function initInvariance() {
  const stage = document.getElementById('inv-stage');
  const path = document.getElementById('inv-loop');
  const perimEl = document.getElementById('inv-perimeter');
  const areaEl = document.getElementById('inv-area');
  const svg = document.getElementById('inv-svg') as SVGSVGElement | null;
  if (!stage || !path || !svg) return;

  const spec = { cx: 180, cy: 120, r: 70, seed: 7 };
  const hs = harmonics(spec.seed);
  let target = { angle: 0, amount: 0 };
  let bump = { angle: 0, amount: 0 };

  const toSvg = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 360, y: ((e.clientY - r.top) / r.height) * 240 };
  };
  stage.addEventListener('pointermove', (e) => {
    const p = toSvg(e);
    const dx = p.x - spec.cx;
    const dy = p.y - spec.cy;
    stage.classList.add('touched');
    target = { angle: Math.atan2(dy, dx), amount: Math.min(0.55, Math.max(0, Math.hypot(dx, dy) / spec.r - 0.6) * 0.5) };
  });
  stage.addEventListener('pointerleave', () => (target = { ...target, amount: 0 }));

  let lastText = 0;
  const draw = (t: number) => {
    // Ease the bump toward the pointer target; wrap the angle the short way round.
    let da = target.angle - bump.angle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    bump = { angle: bump.angle + da * 0.18, amount: bump.amount + (target.amount - bump.amount) * 0.12 };
    const pts = loopPoints(spec, hs, t * 1.6, 160).map(([x, y], i, all) => {
      const th = (i / all.length) * Math.PI * 2;
      const d = Math.atan2(Math.sin(th - bump.angle), Math.cos(th - bump.angle));
      const k = 1 + bump.amount * Math.exp(-(d * d) / 0.35);
      return [spec.cx + (x - spec.cx) * k, spec.cy + (y - spec.cy) * k] as [number, number];
    });
    path.setAttribute('d', smoothPath(pts));
    const now = performance.now();
    if (now - lastText > 120) {
      lastText = now;
      if (perimEl) perimEl.textContent = Math.round(perimeter(pts)).toLocaleString('en-US');
      if (areaEl) areaEl.textContent = Math.round(area(pts)).toLocaleString('en-US');
    }
  };
  runWhileVisible(stage, draw);
}

/** WAI-ARIA tabs: arrows/Home/End move between properties. */
function initTabs() {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.prop-tab'));
  const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')!)!);

  const select = (i: number, focus = false) => {
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panels[k].hidden = !on;
    });
    if (focus) tabs[i].focus();
    requestAnimationFrame(() => panels[i].classList.add('drawn'));
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('keydown', (e) => {
      const n = tabs.length;
      const next = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(next, true);
    });
  });

  const explorer = document.querySelector<HTMLElement>('.explorer');
  if (explorer) onReveal(explorer, () => panels.find((p) => !p.hidden)?.classList.add('drawn'));
}

/** Planning gyms cycle through their states while visible; hover/focus pauses, the button toggles. */
function initSteppers() {
  const auto = !prefersReducedMotion();
  document.querySelectorAll<HTMLElement>('[data-stepper]').forEach((el) => {
    const frames = Array.from(el.querySelectorAll<HTMLImageElement>('.stepper-frames img'));
    const steps = Array.from(el.querySelectorAll<HTMLButtonElement>('.step'));
    const toggle = el.querySelector<HTMLButtonElement>('.stepper-toggle')!;
    let index = 0;
    let playing = auto;
    let hovering = false;
    let visible = false;
    let timer = 0;

    const show = (i: number) => {
      index = i;
      frames.forEach((f, k) => f.classList.toggle('on', k === i));
      steps.forEach((s, k) => s.classList.toggle('on', k === i));
    };
    const schedule = () => {
      clearTimeout(timer);
      if (!playing || hovering || !visible) return;
      // Linger on the final (solved) state so the outcome registers.
      const hold = index === frames.length - 1 ? 2600 : 1500;
      timer = window.setTimeout(() => {
        show((index + 1) % frames.length);
        schedule();
      }, hold);
    };
    const setPlaying = (on: boolean) => {
      playing = on;
      toggle.dataset.playing = String(on);
      toggle.setAttribute('aria-label', on ? 'Pause the animation' : 'Play the animation');
      schedule();
    };

    if (!auto) setPlaying(false);
    toggle.addEventListener('click', () => setPlaying(!playing));
    steps.forEach((s, k) =>
      s.addEventListener('click', () => {
        show(k);
        setPlaying(false);
      }),
    );
    el.addEventListener('pointerenter', () => ((hovering = true), schedule()));
    el.addEventListener('pointerleave', () => ((hovering = false), schedule()));
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && e.target.getClientRects().length > 0;
      schedule();
    }, { threshold: 0.5 }).observe(el);
  });
}

function initAnswers() {
  document.querySelectorAll<HTMLButtonElement>('.reveal-btn').forEach((btn) => {
    const answer = btn.nextElementSibling as HTMLElement;
    btn.addEventListener('click', () => {
      const open = answer.hidden;
      answer.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Hide answer' : 'Reveal answer';
    });
  });

  document.querySelectorAll<HTMLElement>('.mcq').forEach((group) => {
    const options = Array.from(group.querySelectorAll<HTMLButtonElement>('.mcq-option'));
    const feedback = group.querySelector('.mcq-feedback')!;
    options.forEach((opt) =>
      opt.addEventListener('click', () => {
        const right = opt.dataset.correct === 'true';
        options.forEach((o) => o.classList.remove('right', 'wrong'));
        opt.classList.add(right ? 'right' : 'wrong');
        options.find((o) => o.dataset.correct === 'true')!.classList.add('right');
        const answer = options.find((o) => o.dataset.correct === 'true')!.textContent!.trim();
        feedback.textContent = right ? 'Correct.' : `Not quite: the answer is ${answer}.`;
      }),
    );
  });
}

export function initBenchmark() {
  initInvariance();
  initTabs();
  initSteppers();
  initAnswers();
}
