// Shared contract between the playground UI (src/scripts/play.ts) and the five
// game wrappers. Each wrapper drives one vendored MindTopo engine.

/** Balanced release level from the Core manifest, independent of generator tags. */
export type Difficulty = 'easy' | 'hard';

export interface Instance {
  id: string;
  difficulty: Difficulty;
  /** Generator's original tier (for provenance only; never drives the UI control). */
  sourceDifficulty?: string;
  inputSha256?: string;
  source?: string;
  sourceLine?: number;
  /** Step budget the models had (max_actions_per_traj). */
  budget: number;
  /** Shortest solution length, when the generator records it. */
  optimal: number | null;
  /** The engine's own reset_config for this benchmark instance. */
  config: any;
  /** Untangle only: board generated offline by the engine, and an engine-verified solution. */
  snapshot?: any;
  solution?: [number, number][] | null;
}

export interface Status {
  /** Moves spent. Undo does not refund them: the models had no undo. */
  moves: number;
  budget: number;
  solved: boolean;
  failed: boolean;
  /** Why the episode was lost, for the end-of-game message. */
  reason?: string;
  /** Live progress, e.g. "8 / 11 pipes connected". */
  progress?: string;
}

export interface Game {
  load(instance: Instance): Promise<void>;
  restart(): Promise<void>;
  undo(): Promise<void>;
  canUndo(): boolean;
  status(): Status;
  /** Restart, then play a solution move by move. Resolves true if it solved the board. */
  playSolution(signal: AbortSignal): Promise<boolean>;
  /** Block player input (during playback and after the episode ends). */
  setLocked(locked: boolean): void;
  /** The moves played so far, in the engine's action format (used by ?record). */
  moves?(): unknown[];
  destroy(): void;
}

export type GameId = 'pipe' | 'onestroke' | 'swap' | 'chatnoir' | 'untangle';

export type GameFactory = (root: HTMLElement, onChange: () => void) => Promise<Game>;

export const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'));
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    }, { once: true });
  });

/** Move counter shared by every wrapper: counts actions, never refunds on undo. */
export class Budget {
  moves = 0;
  budget = 0;
  reset(budget: number) {
    this.moves = 0;
    this.budget = budget;
  }
  spend() {
    this.moves += 1;
  }
  get exhausted() {
    return this.moves >= this.budget;
  }
}

export async function createGame(id: GameId, root: HTMLElement, onChange: () => void): Promise<Game> {
  const factories: Record<GameId, () => Promise<{ create: GameFactory }>> = {
    pipe: () => import('./pipe'),
    onestroke: () => import('./onestroke'),
    swap: () => import('./swap'),
    chatnoir: () => import('./chatnoir'),
    untangle: () => import('./untangle'),
  };
  const mod = await factories[id]();
  return mod.create(root, onChange);
}
