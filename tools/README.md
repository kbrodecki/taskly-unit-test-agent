# Unit test agent tools

Deterministic code around the unit test agent. The model decides which files need tests and writes them; everything that can be computed lives here and is covered by its own tests (`npm test`).

Run the commands from the repository root (`node tools/src/cli/...`); paths default to `.` and `.unit-test-agent/`.

| Command | What it does |
|---|---|
| `node tools/src/cli/prepare.ts --mode pr --base <ref>` | Runs both suites with coverage, lists changed files, filters the ones that need no test, maps each source file to its test file and writes the agent input (`.unit-test-agent/input.json`) with uncovered changed lines. |
| `node tools/src/cli/prepare.ts --mode backfill --limit 25` | Same input for the backfill mode: every source file with uncovered lines. |
| `node tools/src/cli/gates.ts --patch <agent.patch>` | Validates `decisions.json` against the input, applies the agent patch and runs gates G1 to G7. Exits 1 when the patch must not be pushed. |
| `node tools/src/cli/gates.ts --worktree` | The agent's own check before it commits: the same gates on the working tree against the PR head recorded in `input.json`, two shuffled reruns, result in `gates-self.json`. |
| `node tools/src/cli/report.ts` | Renders the PR comment from the input and the gate results and writes the check conclusion. |

Gates:

| Gate | Blocks when |
|---|---|
| G0 | a `create` or `update` decision names a test file the patch does not contain |
| G1 | the patch touches anything except `*.test.ts(x)`, `frontend/src/test/**` or `backend/tests/**` |
| G2 | an existing test line is removed or changed (imports and an added trailing comma excepted), or a test is skipped, focused or suppressed |
| G3 | typecheck fails, or a new test has no `expect` or an `expect` without a matcher |
| G4 | a test fails with the patch that did not fail without it, or a test file or suite fails to run |
| G5 | new or changed test files fail one of five runs in shuffled order |
| G6 | a new test only checks existence, truthiness or an HTTP status |
| G7 | a file the agent created or updated tests for gains no covered lines (files already fully covered pass) |

Tests that already fail without the patch are reported as the author's, not as a gate failure.

Coverage comes from each app's `lcov`. A line counts as uncovered when it did not run, holds a function that never ran, or holds a branch never taken; a one-line route handler is otherwise "covered" as soon as the route is registered.
