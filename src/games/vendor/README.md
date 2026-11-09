# Vendored MindTopo game engines

These files are the planning environments' browser engines and renderers from
[MLL-Lab/MindTopo](https://github.com/MLL-Lab/MindTopo). Pipe, Swap, and
Chat Noir use the expert-capable frontend at commit `3e977584`; the remaining
engines match that release apart from the site patches below. This keeps Core
Hard rules such as split-channel pipes, row/column swaps, and the expert cat
policy in the browser. Each copied file starts with a provenance line and
`// @ts-nocheck`.

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

The expert helper modules are copied verbatim except for provenance comments.
The site-side wrappers (input, budget, solution playback) live in `src/games/*.ts`.
To update, copy the files again and re-apply the patches above.
