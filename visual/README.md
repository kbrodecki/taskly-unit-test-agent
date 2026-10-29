# Visual evidence

Screenshots of the frontend for pull requests that change it. Not part of the unit test agent: no model runs here, and the agent cannot change these files.

- `scenarios/catalog.spec.ts`: the scenario catalog, written and kept by people. Each test is one screen; its id is the part of the title before the colon.
- `src/mock-api.ts`: an in-memory `/api/todos` behind `page.route`, with a fixed clock, so no backend or database is needed.
- `src/compare.ts`: pixelmatch of base and head screenshots, writes `out/manifest.json` and `out/diff/`.

The workflow `.github/workflows/visual-evidence.yml` builds the base and head frontends, captures both, compares them and uploads `out/`. A second job, which runs no code from the PR, commits the images to the `visual-evidence` branch under `pr-<N>/<sha>/` and updates one "Visual evidence" comment. Scenarios tagged `@video` in their title are also recorded as video (and a GIF) when the PR has the `visual-video` label.

Run locally from this directory after `npx vite build` in `frontend/`:

```bash
VISUAL_OUT=out/after npx playwright test
```
