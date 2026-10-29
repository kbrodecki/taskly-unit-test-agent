# ADR 5: Visual evidence from the real app on a mocked API

## Context

Unit tests do not show a reviewer what a frontend change looks like. The repo's Storybook covers only the design system, not the feature components that real PRs change. Building and running PR code is running untrusted code, and the GitHub API cannot attach images to a comment.

## Decision

A plain Actions workflow, `visual-evidence.yml`, separate from the agent and with no model. It runs on PRs that change `frontend/src` outside tests.

- Job `capture` (read-only token, no secrets) builds the base and head frontends and runs Playwright on a fixed catalog of scenarios in `visual/scenarios/`. `/api` is an in-memory mock behind `page.route`, and the clock is fixed. Pixelmatch compares the two sides.
- Job `publish` runs no PR code. It accepts only PNG, GIF and WebM files within size and count limits, commits them to the orphan branch `visual-evidence` under `pr-<N>/<sha>/`, and updates one "Visual evidence" comment: changed screens before and after first, unchanged ones folded.
- With the label `visual-video`, scenarios tagged `@video` are also recorded as video and GIF.

## Alternatives

- Storybook screenshots only: no setup, but they would miss nearly every real change.
- The agent writes stories or scenarios: widens the agent's output beyond unit tests and its `allowed-files`.
- The full stack with a database in CI: closer to production, but slower and with no gain for screenshots.
- Images as an Actions artifact only: no extra branch, but the reviewer has to download a zip.

## Consequences

- Screenshots are deterministic and cheap; the catalog is code that people maintain, and the demo PR added its scenario.
- In a private repository the images do not render inline, so the comment links each one.
- The `visual-evidence` branch grows with every run; there is no cleanup yet.
