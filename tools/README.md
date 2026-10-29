# Unit test agent tools

Deterministic code around the unit test agent. The model decides which files need tests and writes them; everything that can be computed lives here and is covered by its own tests (`npm test`).

| Command | What it does |
|---|---|
| `node src/cli/prepare.ts --mode pr --base <ref>` | Runs both suites with coverage, lists changed files, filters the ones that need no test, maps each source file to its test file and writes the agent input (`.unit-test-agent/input.json`) with uncovered changed lines. |
| `node src/cli/prepare.ts --mode backfill --limit 25` | Same input for the backfill mode: every source file with uncovered lines. |
| `node src/cli/gates.ts --patch <agent.patch>` | Validates `decisions.json` against the input, applies the agent patch and runs gates G1 to G7. Exits 1 when the patch must not be pushed. |
| `node src/cli/report.ts` | Renders the PR comment from the input and the gate results and writes the check conclusion. |

Gates:

| Gate | Blocks when |
|---|---|
| G1 | the patch touches anything except `*.test.ts(x)`, `frontend/src/test/**` or `backend/tests/**` |
| G2 | an existing test line is removed or changed (imports and an added trailing comma excepted), or a test is skipped, focused or suppressed |
| G3 | typecheck fails, or a new test has no `expect` or an `expect` without a matcher |
| G4 | a test fails with the patch that did not fail without it |
| G5 | new or changed test files fail one of five runs in shuffled order |
| G6 | a new test only checks existence, truthiness or an HTTP status |
| G7 | a file the agent created or updated tests for gains no covered lines |

Tests that already fail without the patch are reported as the author's, not as a gate failure.
