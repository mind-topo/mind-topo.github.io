// Page-wide behaviour: navigation state, reveal-on-scroll, in-view media,
// count-up figures and the copy button. Chart scripts live with their sections.

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Scroll-spy, reading progress, header shadow, back-to-top. One rAF-throttled scroll handler. */
function initNavigation() {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[data-nav-link]'));
  const ids = Array.from(new Set(links.map((a) => a.dataset.navLink!)));
  const sections = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
  const fill = document.getElementById('side-nav-fill');
  const bar = document.getElementById('read-progress-bar');
  const toTop = document.getElementById('to-top');
  const toggleLabel = document.getElementById('nav-toggle-label');
  let current = '';
  let ticking = false;

  const update = () => {
    ticking = false;
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (fill) fill.style.transform = `scaleY(${progress})`;
    if (bar) bar.style.transform = `scaleX(${progress})`;
    doc.classList.toggle('is-scrolled', window.scrollY > 8);
    toTop?.classList.toggle('show', window.scrollY > window.innerHeight * 0.8);

    // The active section is the last one whose top has crossed 35% of the viewport;
    // at the very bottom the last section wins even if it is short.
    const line = window.innerHeight * 0.35;
    let active = sections[0]?.id ?? '';
    for (const s of sections) if (s.getBoundingClientRect().top <= line) active = s.id;
    if (max - window.scrollY < 4 && sections.length) active = sections[sections.length - 1].id;

    if (active !== current) {
      current = active;
      const activeIndex = ids.indexOf(active);
      for (const a of links) {
        const idx = ids.indexOf(a.dataset.navLink!);
        if (idx === activeIndex) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
        a.classList.toggle('is-past', idx < activeIndex);
      }
      if (toggleLabel) {
        const label = links.find((a) => a.dataset.navLink === active)?.dataset.label;
        toggleLabel.textContent = active === 'top' || !label ? 'Sections' : label;
      }
    }
  };

  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
}

/** Header menu for narrow screens: Escape and outside clicks close it, focus returns to the toggle. */
function initMobileMenu() {
  const toggle = document.getElementById('nav-toggle');
  const menu = document.getElementById('mobile-nav');
  if (!toggle || !menu) return;

  const setOpen = (open: boolean, restoreFocus = false) => {
    toggle.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    if (open) (menu.querySelector<HTMLElement>('[aria-current="true"]') ?? menu.querySelector<HTMLElement>('a'))?.focus();
    else if (restoreFocus) toggle.focus();
  };

  toggle.addEventListener('click', () => setOpen(menu.hidden));
  menu.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) setOpen(false, true);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node) && !toggle.contains(e.target as Node)) setOpen(false);
  });
  window.matchMedia('(min-width: 1200px)').addEventListener('change', (e) => e.matches && setOpen(false));
}

/** Fade sections in once as they enter. Content is visible without JS (the .js class gates the hidden state). */
function initReveal() {
  const items = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
    items.forEach((el) => {
      el.classList.add('is-visible');
      el.dispatchEvent(new CustomEvent('reveal'));
    });
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        entry.target.dispatchEvent(new CustomEvent('reveal'));
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  items.forEach((el) => io.observe(el));
}

/**
 * Muted loops play only while on screen (saves battery, keeps attention on what
 * the reader is looking at). With reduced motion they stay paused on their poster
 * and show native controls instead.
 */
function initInViewVideos() {
  const videos = document.querySelectorAll<HTMLVideoElement>('video[data-inview]');
  if (prefersReducedMotion()) {
    videos.forEach((v) => (v.controls = true));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        const v = target as HTMLVideoElement;
        if (isIntersecting) {
          if (v.preload === 'none') v.preload = 'auto';
          v.play().catch(() => (v.controls = true));
        } else v.pause();
      }
    },
    { threshold: 0.35 },
  );
  videos.forEach((v) => io.observe(v));
}

/** Big standalone figures count up the first time they are seen. */
function initCountUp() {
  const els = document.querySelectorAll<HTMLElement>('[data-countup]');
  if (prefersReducedMotion()) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        if (!isIntersecting) continue;
        io.unobserve(target);
        const el = target as HTMLElement;
        const end = Number(el.dataset.countup);
        const digits = Number(el.dataset.digits ?? 0);
        const final = el.dataset.final ?? '';
        const start = performance.now();
        const dur = 900;
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - t, 3);
          el.textContent = t < 1 ? (end * eased).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : final;
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    },
    { threshold: 0.6 },
  );
  els.forEach((el) => {
    el.dataset.final = el.textContent ?? '';
    el.textContent = (0).toFixed(Number(el.dataset.digits ?? 0));
    io.observe(el);
  });
}

/** Copy buttons: data-copy-target is the id of the element whose text is copied. */
function initCopy() {
  document.querySelectorAll<HTMLButtonElement>('[data-copy-target]').forEach((btn) => {
    const label = btn.querySelector('[data-copy-label]');
    btn.addEventListener('click', async () => {
      const text = document.getElementById(btn.dataset.copyTarget!)?.textContent ?? '';
      try {
        await navigator.clipboard.writeText(text.trim());
        btn.classList.add('copied');
        if (label) label.textContent = 'Copied';
      } catch {
        if (label) label.textContent = 'Press Ctrl+C';
        const range = document.createRange();
        range.selectNodeContents(document.getElementById(btn.dataset.copyTarget!)!);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
      }
      setTimeout(() => {
        btn.classList.remove('copied');
        if (label) label.textContent = 'Copy';
      }, 1800);
    });
  });
}

export function initSite() {
  initNavigation();
  initMobileMenu();
  initReveal();
  initInViewVideos();
  initCountUp();
  initCopy();
}
