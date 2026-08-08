# MindTopo — project page

Source for [mind-topo.github.io](https://mind-topo.github.io/), the project page for
**MindTopo: Can Foundation Models Reason in Topological Space?**

Built with [Astro](https://astro.build/) and deployed to GitHub Pages by
[`.github/workflows`](.github/workflows) on every push to `main`.

## Commands

| Command           | Action                                       |
| :---------------- | :------------------------------------------- |
| `npm install`     | Install dependencies                          |
| `npm run dev`     | Dev server at `localhost:4321`                |
| `npm run build`   | Build the production site to `./dist/`        |
| `npm run preview` | Preview the production build locally          |

## Structure

```text
public/            static assets served at the site root
  icon.png           MindTopo logo (header, favicon, hero)
  teaser.png         paper teaser figure
  task-overview.png  13-task overview figure
  data-stats.png     dataset statistics figure
  og-card.jpg        social preview card
  llms.txt           short LLM-facing summary
  llms-full.txt      extended LLM-facing reference
src/
  components/      Hero, Header, Algorithm (leaderboard), AuthorsCitation, Footer
  layouts/         Layout.astro — <head>, metadata, header/footer shell
  pages/           index.astro — the one published route
  pages_HIDDEN/    routes kept out of the build (see its README)
  scripts/         client-side TypeScript/JS
  styles/          global + per-section CSS
```

## Currently hidden

These are wired up but deliberately not rendered; re-enable by uncommenting the
import and the tag in [`src/pages/index.astro`](src/pages/index.astro).

- `DatasetViewer` — waiting on the MindTopo data drop under `public/`.
- `FindingsSection` — still contains MindCube results; needs MindTopo content.
- `TrajectoryViewer` — carried over from an earlier template.
- `src/pages_HIDDEN/challenge.astro` — MindCube challenge page, kept as a layout reference.

## Updating the leaderboard

Scores live in the `TASKS` and `MODELS` arrays at the top of
[`src/components/Algorithm.astro`](src/components/Algorithm.astro). Overall,
Reasoning and Planning columns are derived from them, so only the per-task
numbers need editing. Each row's `scores` array must follow `TASKS` order.
