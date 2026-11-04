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

Every score on the page comes from `src/data/paper.json`, which is generated from
the paper's LaTeX tables (the TMLR version, the newest results):

```bash
python3 scripts/sync-paper-data.py ../-NeurIPS-2026-TopoBench/tmlr
```

The script parses the main, Easy-level, difficulty, training, error-analysis,
probing and video-verifier tables, cross-checks them (Easy + Hard must average to
the main table; the Reason/Plan means must match), and refuses to write if they
disagree. Headlines such as "13 of 13 models plan worse than they reason" are
computed from the data, so they update with it. Only the per-task copy (questions,
answers, error-example quotes) lives by hand in `src/data/site.ts`.

## Page structure

The page reads top to bottom as a list of conclusions; each section's headline is
its finding, and the side navigation (desktop) or the header menu (below 1200px)
tracks the current section.

| Section | Component | Interaction |
| :-- | :-- | :-- |
| Overview | `Hero.astro` | count-up stats, deforming-loop motif |
| Teaser video | `TeaserVideo.astro` | loads only on play |
| Key findings | `Findings.astro` | six cards linking to their evidence |
| Play the benchmark | `Play.astro` | the five planning gyms on real benchmark boards; reasoning-question quiz |
| The action gap | `Results.astro` | difficulty switch, dumbbell chart, sortable heatmap leaderboard |
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
  og-card.jpg          social preview card
  llms.txt             short LLM-facing summary
  llms-full.txt        extended LLM-facing reference
scripts/
  sync-paper-data.py   regenerates src/data/paper.json from the paper's tables
  build-game-instances.py, build-untangle-solutions.ts   playable boards (see Playable games)
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

Boards come from the code repo's `environments/<env>/output/question.jsonl`:

```bash
python3 scripts/build-game-instances.py ../MindTopo          # public/games/<game>.json
# Untangle boards and engine-verified solutions (generation is too slow to do in the browser):
npx esbuild scripts/build-untangle-solutions.ts --bundle --platform=node --format=esm \
  --loader:.json=json --outfile=/tmp/untangle-solutions.mjs
for s in $(seq 0 23); do node /tmp/untangle-solutions.mjs $s 24 & done; wait
node /tmp/untangle-solutions.mjs merge 24
```

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
