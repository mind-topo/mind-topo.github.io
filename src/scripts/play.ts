// "Play the benchmark": tabs over the five planning gyms, difficulty, move meter,
// end-of-episode card and solution playback; plus the reasoning-question answers.

import { createGame, type Difficulty, type Game, type GameId, type Instance } from '../games/types';
import { GAMES } from '../games/meta';
import { bindRadioGroup } from './viz';

// Maintainer mode (?record): load /games/<game>-pool.json when present (e.g. every hard
// Untangle seed), show board ids, and POST each board solved by hand to /__record, so a
// local server can save the moves as candidate solutions. Off on the public site.
const RECORD = new URLSearchParams(location.search).has('record');

const pools = new Map<GameId, Promise<Instance[]>>();
const loadPool = (id: GameId) => {
  if (!pools.has(id)) {
    const get = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
    const data = RECORD ? get(`/games/${id}-pool.json`).catch(() => get(`/games/${id}.json`)) : get(`/games/${id}.json`);
    pools.set(id, data.then((d) => d.instances as Instance[]));
  }
  return pools.get(id)!;
};

// Every move is saved (solved or not), so a hand-played attempt is never lost.
let lastRecordKey = '';
let savedCount = 0;
function record(game: GameId, instance: Instance, moves: unknown[], status: { solved: boolean; progress?: string }) {
  if (!RECORD) return;
  const key = `${instance.id}|${moves.length}|${status.solved}`;
  if (key === lastRecordKey) return;
  lastRecordKey = key;
  fetch('/__record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game, id: instance.id, difficulty: instance.difficulty, moves, solved: status.solved, progress: status.progress, at: new Date().toISOString() }),
  })
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      savedCount += 1;
      const badge = document.getElementById('record-badge');
      if (badge) badge.textContent = `● Recording · ${savedCount} moves saved`;
    })
    .catch((e) => {
      console.error('record failed', e);
      const badge = document.getElementById('record-badge');
      if (badge) badge.textContent = '● Recording FAILED (see console)';
    });
}

function initPlayground() {
  const root = document.getElementById('game-root');
  if (!root) return;
  if (RECORD) {
    const badge = document.createElement('p');
    badge.id = 'record-badge';
    badge.textContent = '● Recording · 0 moves saved';
    badge.style.cssText = 'font-size:.82rem;font-weight:650;color:#b42318';
    document.querySelector('.game-panel')?.prepend(badge);
  }
  const wrap = document.getElementById('game-stage-wrap')!;
  const loading = document.getElementById('game-loading')!;
  const overlay = document.getElementById('game-overlay')!;
  const goTitle = document.getElementById('go-title')!;
  const goSub = document.getElementById('go-sub')!;
  const goNext = document.getElementById('go-next') as HTMLButtonElement;
  const goRetry = document.getElementById('go-retry') as HTMLButtonElement;
  const movesEl = document.getElementById('game-moves')!;
  const bar = document.getElementById('game-bar')!;
  const progress = document.getElementById('game-progress')!;
  const undoBtn = document.getElementById('game-undo') as HTMLButtonElement;
  const restartBtn = document.getElementById('game-restart') as HTMLButtonElement;
  const newBtn = document.getElementById('game-new') as HTMLButtonElement;
  const solveBtn = document.getElementById('game-solve') as HTMLButtonElement;
  const solveLabel = solveBtn.querySelector('span')!;
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.game-tab'));
  const infos = Array.from(document.querySelectorAll<HTMLElement>('.gp-info'));

  let gameId: GameId = 'pipe';
  let difficulty: Difficulty = 'easy';
  let game: Game | null = null;
  let instance: Instance | null = null;
  let playback: AbortController | null = null;
  let shownSolution = false;
  let openToken = 0;
  const cursor = new Map<string, number>();

  const nextInstance = async (advance: boolean) => {
    const pool = (await loadPool(gameId)).filter((x) => x.difficulty === difficulty);
    const k = `${gameId}/${difficulty}`;
    const i = ((cursor.get(k) ?? -1) + (advance || !cursor.has(k) ? 1 : 0)) % pool.length;
    cursor.set(k, i);
    return pool[i];
  };

  const showOverlay = (kind: 'win' | 'lose' | 'shown', title: string, sub: string) => {
    goTitle.textContent = title;
    goTitle.className = `go-title ${kind === 'lose' ? 'lose' : 'win'}`;
    goSub.textContent = sub;
    goRetry.textContent = kind === 'lose' ? 'Show solution' : 'Try again';
    goRetry.dataset.action = kind === 'lose' ? 'solve' : 'retry';
    overlay.hidden = false;
  };

  const update = () => {
    if (!game || !instance) return;
    const s = game.status();
    movesEl.textContent = `${s.moves} / ${s.budget}`;
    bar.style.width = `${Math.min(100, (100 * s.moves) / Math.max(1, s.budget))}%`;
    bar.classList.toggle('low', s.budget - s.moves <= 2 && !s.solved);
    progress.textContent = (s.progress ?? ' ') + (RECORD ? ` · ${instance.id.replace(/^.*_(easy|medium|hard)_seed_/, '$1 seed ')}` : '');
    const busy = playback !== null;
    undoBtn.disabled = busy || !game.canUndo() || s.failed && !game.canUndo();
    restartBtn.disabled = busy;
    newBtn.disabled = busy;
    // No solution means the offline search found no engine-verified plan for this board.
    solveBtn.disabled = !busy && !instance.solution;
    game.setLocked(busy || s.solved || s.failed);

    if (busy) return;
    if (game.moves) record(gameId, instance, game.moves(), s);
    if (s.solved && shownSolution) {
      showOverlay('shown', `One solution: ${s.moves} moves`, '');
    } else if (s.solved) {
      const best = instance.optimal;
      showOverlay('win', `Solved in ${s.moves} moves`, best ? (s.moves <= best ? 'That matches the shortest known solution.' : `The shortest known solution takes ${best}.`) : `Within the ${s.budget}-move budget.`);
    } else if (s.failed) {
      showOverlay('lose', s.reason ?? 'Out of moves.', `This demo board has a ${s.budget}-move budget.`);
    } else {
      overlay.hidden = true;
    }
  };

  const stopPlayback = () => {
    playback?.abort();
    playback = null;
    solveLabel.textContent = 'Show solution';
  };

  const loadInstance = async (inst: Instance) => {
    instance = inst;
    shownSolution = false;
    overlay.hidden = true;
    await game!.load(inst);
    update();
  };

  const open = async (id: GameId) => {
    const token = ++openToken;
    stopPlayback();
    game?.destroy();
    game = null;
    gameId = id;
    const meta = GAMES.find((g) => g.id === id)!;
    wrap.dataset.theme = meta.dark ? 'dark' : 'light';
    infos.forEach((el) => (el.hidden = el.dataset.game !== id));
    overlay.hidden = true;
    loading.classList.remove('gone');
    const [created, inst] = await Promise.all([createGame(id, root, update), nextInstance(false)]);
    if (token !== openToken) return created.destroy();
    game = created;
    await loadInstance(inst);
    loading.classList.add('gone');
  };

  const solve = async () => {
    if (!game) return;
    if (playback) return stopPlayback();
    overlay.hidden = true;
    playback = new AbortController();
    solveLabel.textContent = 'Stop';
    shownSolution = true;
    update();
    try {
      await game.playSolution(playback.signal);
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') console.error(e);
    }
    playback = null;
    solveLabel.textContent = 'Show solution';
    update();
  };

  undoBtn.addEventListener('click', async () => {
    overlay.hidden = true;
    await game?.undo();
    update();
  });
  restartBtn.addEventListener('click', () => instance && loadInstance(instance));
  newBtn.addEventListener('click', async () => loadInstance(await nextInstance(true)));
  solveBtn.addEventListener('click', solve);
  goNext.addEventListener('click', async () => loadInstance(await nextInstance(true)));
  goRetry.addEventListener('click', () => (goRetry.dataset.action === 'solve' ? solve() : instance && loadInstance(instance)));

  bindRadioGroup(document.getElementById('game-level')!, async (value) => {
    difficulty = value as Difficulty;
    if (!game) return;
    stopPlayback();
    await loadInstance(await nextInstance(false));
  });

  tabs.forEach((tab, i) => {
    const select = (focus: boolean) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
      if (focus) tab.focus();
      open(tab.dataset.game as GameId);
    };
    tab.addEventListener('click', () => tab.getAttribute('aria-selected') !== 'true' && select(false));
    tab.addEventListener('keydown', (e) => {
      const n = tabs.length;
      const j = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      tabs[j].click();
      tabs[j].focus();
    });
  });

  // Start the first gym only when the section comes near the viewport (it may pull in three.js).
  const section = document.getElementById('play')!;
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      open(gameId);
    }
  }, { rootMargin: '600px 0px' });
  io.observe(section);
}

function initAnswers() {
  document.querySelectorAll<HTMLButtonElement>('#play .reveal-btn').forEach((btn) => {
    const answer = btn.nextElementSibling as HTMLElement;
    btn.addEventListener('click', () => {
      const open = answer.hidden;
      answer.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Hide answer' : 'Reveal answer';
    });
  });
  document.querySelectorAll<HTMLElement>('#play .mcq').forEach((group) => {
    const options = Array.from(group.querySelectorAll<HTMLButtonElement>('.mcq-option'));
    const feedback = group.querySelector('.mcq-feedback')!;
    const correct = options.find((o) => o.dataset.correct === 'true')!;
    options.forEach((opt) =>
      opt.addEventListener('click', () => {
        options.forEach((o) => o.classList.remove('right', 'wrong'));
        opt.classList.add(opt === correct ? 'right' : 'wrong');
        correct.classList.add('right');
        feedback.textContent = opt === correct ? 'Correct.' : `The answer is ${correct.textContent!.trim()}.`;
      }),
    );
  });
}

export function initPlay() {
  initPlayground();
  initAnswers();
}
