// Continuously deforming closed loops: the page's visual motif for "topology is
// what survives continuous deformation". Each loop is star-shaped about its
// centre, r(θ, t) = R·(1 + Σ a_k·sin(kθ + φ_k + ω_k·t)) with Σ a_k < 0.4, so it
// stays a simple closed curve however it bends: its shape changes, its topology
// never does.

import { prefersReducedMotion } from './site';

export interface LoopSpec {
  cx: number;
  cy: number;
  r: number;
  seed: number;
}

interface Harmonic {
  k: number;
  a: number;
  phase: number;
  speed: number;
}

function rng(seed: number) {
  let s = seed * 2654435761;
  return () => {
    s = (s ^ (s >>> 15)) * 2246822507;
    s = (s ^ (s >>> 13)) * 3266489909;
    s ^= s >>> 16;
    return (s >>> 0) / 4294967296;
  };
}

export function harmonics(seed: number): Harmonic[] {
  const rand = rng(seed);
  return [2, 3, 4, 5].map((k, i) => ({
    k,
    a: [0.15, 0.11, 0.07, 0.045][i] * (0.75 + rand() * 0.5),
    phase: rand() * Math.PI * 2,
    speed: (0.18 + rand() * 0.22) * (rand() > 0.5 ? 1 : -1),
  }));
}

export function loopPoints(spec: LoopSpec, hs: Harmonic[], t: number, n = 120): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    let f = 1;
    for (const h of hs) f += h.a * Math.sin(h.k * th + h.phase + h.speed * t);
    pts.push([spec.cx + spec.r * f * Math.cos(th), spec.cy + spec.r * f * Math.sin(th)]);
  }
  return pts;
}

/** Smooth closed path through the points (Catmull-Rom converted to cubic Béziers). */
export function smoothPath(pts: [number, number][]) {
  const n = pts.length;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

export function perimeter(pts: [number, number][]) {
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    p += Math.hypot(x2 - x1, y2 - y1);
  }
  return p;
}

export function area(pts: [number, number][]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/**
 * Drive `frame(t)` with requestAnimationFrame while `el` is on screen and the tab
 * is visible. Under reduced motion it renders one still frame.
 */
export function runWhileVisible(el: Element, frame: (seconds: number) => void) {
  frame(0);
  if (prefersReducedMotion()) return;
  let raf = 0;
  let visible = false;
  let last = performance.now();
  let t = 0;
  const loop = (now: number) => {
    t += Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(t);
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (raf || !visible || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    visible ? start() : stop();
  }).observe(el);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
}

/** Decorative loops in an SVG: one <path> per spec, in order. */
export function animateLoops(svg: SVGSVGElement, specs: LoopSpec[]) {
  const paths = Array.from(svg.querySelectorAll('path'));
  const hs = specs.map((s) => harmonics(s.seed));
  runWhileVisible(svg, (t) => {
    specs.forEach((s, i) => paths[i]?.setAttribute('d', smoothPath(loopPoints(s, hs[i], t, 72))));
  });
}
