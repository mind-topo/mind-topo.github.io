# MindTopo — project page

Source for [mind-topo.github.io](https://mind-topo.github.io/), the project page for
**MindTopo: Can Foundation Models Reason in Topological Space?**

Built with [Astro](https://astro.build/) and deployed to GitHub Pages by
[`.github/workflows`](.github/workflows) on every push to `main`. No chart library:
every chart is plain HTML/SVG with a few small TypeScript modules. The planning
games run MindTopo's own engines (see [Playable games](#playable-games)).

## Commands

| Command           | Action                                       |
| :---------------- | :------------------------------------------- |
| `npm install`     | Install dependencies                          |
| `npm run dev`     | Dev server at `localhost:4321`                |
| `npm run build`   | Build the production site to `./dist/`        |
| `npm run preview` | Preview the production build locally          |

## Updating the numbers

Every score and release count on the page comes from `src/data/paper.json`, which
is generated from the current arXiv manuscript tables and release manifest:

```bash
python3 scripts/sync-paper-data.py ../topobench_arxiv/arxiv
```

The script parses the main, Easy-level, difficulty, training, error-analysis,
probing, video-verifier and Extended tables plus `data/release_counts.json` and
`data/extended_results.json`. It cross-checks
them (Easy + Hard must average to the main table; the Reason/Plan means and Core
size must match) and refuses to write if they disagree. Headlines such as "13 of
13 models plan worse than they reason" are computed from the data, so they update
with it. Extended denominators and percentages must match the result counts and
release composition, and the two sets are displayed in separate tables.

Update the downloadable manuscript, compressed manifests, and Core examples with:

```bash
python3 scripts/sync-release-assets.py ../topobench_arxiv/arxiv ../topobench
```

This requires Pillow and Poppler's `pdftotext`. It verifies the two example
records and every source image against the Core manifest before exporting
Assembly's five options and Bead's complete answer to `src/data/examples.json`.
It copies `arxiv/arxiv.pdf` after checking that its abstract names both current
sets. Keep that compiled PDF current with the manuscript before running this
command. The manifest downloads contain input identifiers, source locations,
and hashes, rather than full question records or images.

Other per-task copy and error-example quotes live in `src/data/site.ts`.
`public/llms.txt` and `public/llms-full.txt` are hand-maintained summaries and
must be checked when changing the release or evaluation protocols.

## Page structure

The page reads top to bottom as a list of conclusions; each section's headline is
its finding, and the side navigation (desktop) or the header menu (below 1200px)
tracks the current section.

| Section | Component | Interaction |
| :-- | :-- | :-- |
| Overview | `Hero.astro` | count-up stats, deforming-loop motif |
| Teaser video | `TeaserVideo.astro` | loads only on play |
| Key findings | `Findings.astro` | six cards linking to their evidence |
| Play the benchmark | `Play.astro` | five input-hash-verified Core planning demos; reasoning-question quiz |
| The action gap | `Results.astro` | difficulty switch, dumbbell chart, sortable heatmap leaderboard |
| Core & Extended | `Release.astro` | separate Extended results, per-task composition, manuscript and manifest downloads |
| Against humans | `Humans.astro` | model picker, morphing radar, largest gaps |
| Training | `Training.astro` | method switch |
| Failure modes | `Errors.astro` | model switch, linked legend / bars / example gallery |
| Visual imagination | `Imagination.astro` | in-view video loops, planner switch, verifier small multiples |
| Citation | `Citation.astro` | copy BibTeX |

Section order and labels live in `src/data/nav.ts`. Charts share the toolkit in
`src/scripts/viz.ts` (tooltip, radio groups, FLIP reordering, table views); every
chart has a "Show data table" twin. Motion respects `prefers-reduced-motion`.

```text
public/
  media/               teaser video + poster, rollout clips, task / error / figure images (WebP)
  games/               benchmark boards for the playable games
  paper/               current compiled manuscript (PDF)
  release/             compressed input manifests, composition and Extended result counts
  og-card.jpg          social preview card
  llms.txt             short LLM-facing summary
  llms-full.txt        extended LLM-facing reference
scripts/
  sync-paper-data.py   regenerates src/data/paper.json from the paper's tables
  sync-release-assets.py   exports the manuscript, release files and two verified Core examples
  build-game-instances.py, build-untangle-solutions.ts, serve-record.py   playable boards (see Playable games)
src/
  data/                paper.json (generated), site.ts, people.ts, nav.ts, results.ts, humans.ts
  games/               game wrappers + vendor/ (MindTopo engines)
  components/          one component per section, plus Header, SideNav, Footer, Icon, SectionHeader
  scripts/             client behaviour: site.ts (nav, reveal, media), viz.ts, one module per chart
  styles/global.css    design tokens and shared UI pieces
```

The chart palette (reasoning `#0a7fb0`, planning `#eb6834`, model `#6250d6`, and
the seven error-category slots) was checked for color-vision-deficiency
separation and contrast; change it in `src/styles/global.css` and
`src/data/site.ts` together.

## Playable games

The Pipe, One Stroke, Swap, Chat Noir and Untangle engines and renderers are
vendored from [mll-lab-nu/MindTopo](https://github.com/mll-lab-nu/MindTopo) in
`src/games/vendor/` (patches listed in its README). `src/games/*.ts` wraps each
one with input, the models' move budget, undo and solution playback; three.js
and each game load only when the game is opened.

Boards are selected through the manuscript's exact Core manifest. The export
refuses to write site data unless the source-file, source-row, record, and
model-input hashes all match the release record. It exports 40 boards from each
of Core Easy and Core Hard for every planning task.

```bash
python3 scripts/build-game-instances.py ../topobench ../topobench_arxiv/arxiv
npx esbuild scripts/validate-core-games.ts --bundle --platform=node --format=esm --outfile=/tmp/validate-core-games.mjs
node /tmp/validate-core-games.mjs
# Untangle Core boards and engine-verified solutions (generation is too slow in the browser).
# Keep the process count low (here 4, at nice 19); each process takes one core.
npx esbuild scripts/build-untangle-solutions.ts --bundle --platform=node --format=esm \
  --loader:.json=json --outfile=/tmp/untangle-solutions.mjs
run() { for s in 0 1 2 3; do nice -n 19 node /tmp/untangle-solutions.mjs "$@" $s 4 & done; wait; }
run hydrate; node /tmp/untangle-solutions.mjs merge-hydrate 4   # verify exact Core states, save snapshots and any robust oracle plans
node /tmp/untangle-solutions.mjs verify
```

A plan counts as a solution only under the benchmark's own test: `step()` each move from
the stored board with no extra frames in between, and the engine's `crossings()` (the
simulated ropes seen from above) ends at 0, and stays 0 for 600 more frames. The page
plays by the same rules: the board only changes through `step(source hole, target hole)`,
the benchmark's action space. While you drag, a throwaway copy of the board runs live
physics so the rope follows the pointer; on release the real move plays as the frames
`step()` simulates. A game is therefore just its list of moves, and replays exactly.

Core level and generator difficulty are separate fields. Hydration regenerates
each selected board, checks its grid, rope endpoints, colors, signature, and
crossing counts against the Core source row, then stores a browser snapshot.
Every board remains playable; when its reverse-scramble oracle also passes the
engine's stability test, the optional "Show solution" control is enabled.

Additional solutions can be recorded by hand:

```bash
python3 scripts/serve-record.py dist 4400 solves.jsonl     # play at http://localhost:4400/
node /tmp/untangle-solutions.mjs add-solves solves.jsonl [pool.json]
node /tmp/untangle-solutions.mjs verify
```

`?record` posts every move to `/__record` and shows the board's seed; it plays the boards
in `public/games/untangle.json`, or `public/games/untangle-pool.json` if present (a local
file of unsolved boards with snapshots).

## Authors and links

Author pages, paper, code, dataset and lab links live in `src/data/people.ts`
(taken from the MindTopo entry on https://qinengwang-aiden.github.io/).

## Currently hidden

These predate the 2026-11 redesign and are not rendered. They still work with
their own stylesheets but will need restyling to match the new design.

- `DatasetViewer` — waiting on the MindTopo data drop under `public/`.
- `FindingsSection` — MindCube results; superseded by `Findings.astro`.
- `TrajectoryViewer` — carried over from an earlier template (styles in `src/styles/trajectoryViewer.css`).
- `src/pages_HIDDEN/challenge.astro` — MindCube challenge page, kept as a layout reference.
