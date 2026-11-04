# Vendored MindTopo game engines

These files are the planning environments' browser engines and renderers from
[mll-lab-nu/MindTopo](https://github.com/mll-lab-nu/MindTopo) at commit
`96ac4d1`, so the site runs the same rules the models were evaluated on. Each
file starts with a provenance line and `// @ts-nocheck`; otherwise they are
copied verbatim except for these patches:

- `chatnoir/render.ts`: import three from the bundled `three` package instead of unpkg.
- `chatnoir/chat_noir.ts`: append `solverHint()`, a thin wrapper over the engine's
  own `solveChatNoirInstance` / `rankedSolverActions` used by "show solution".
- `swap/swap_2d_puzzle.ts`: export `shortestActionSequence`.
- `onestroke/renderer.ts`: stop the render loop in `dispose()`.
- `untangle/untangle.ts`: add `exportSnapshot()` / `restoreSnapshot()`. Generating a
  medium or hard board takes 1-2.5 s, so `scripts/build-untangle-solutions.ts` generates
  every board offline with this engine and the site restores the snapshot; the
  constructor takes `{ skipInitialReset }` so it does not generate a throwaway board, and
  `generatorInfo.scrambleHistory` keeps the scramble moves (reversed, they are the board's oracle).

The site-side wrappers (input, budget, solution playback) live in `src/games/*.ts`.
To update, copy the files again and re-apply the patches above.
