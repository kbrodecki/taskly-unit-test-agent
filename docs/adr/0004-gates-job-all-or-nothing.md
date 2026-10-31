# ADR 4: Gates in their own job decide the push, all or nothing

## Context

The agent's patch must be checked by code before it reaches the PR branch. In gh-aw the agent job's own post-steps do not stop the safe output. A failed custom step in the threat detection job does stop it, but then no job that depends on detection runs, so the PR would get no report.

## Decision

A custom `gates` job runs after detection, applies the patch to the PR head and runs gates G0 to G7. The safe output job has `if: needs.gates.result == 'success'`. The `report` job runs whenever threat detection passed and explains a block. When detection itself blocks the run, the compiled workflow skips every custom job that depends on it, so a separate `report_blocked` job with `detection-gate: status-only` posts a status comment and a failed check instead; it has no detail from the agent's output. When a step of the `report` job fails, a final step with `if: failure()` posts a short comment and a red check with an inline script, so the PR is never left without a result; the run log holds the detail.

The gates read the agent input and the coverage baseline from an artifact that the agent job uploads before the agent starts, because the agent can edit anything in its workspace. From the agent they take only `decisions.json` and the patch, and they fail when the run produced more than one patch.

| Gate | Blocks when |
|---|---|
| G0 | a `create` or `update` has no test file in the patch, or the patch does not apply |
| G1 | the patch touches anything except test paths |
| G2 | an existing test line is removed or changed, or a test is skipped, focused or suppressed |
| G3 | typecheck fails, or a new test has no real assertion |
| G4 | a test fails with the patch that did not fail without it |
| G5 | new or changed test files fail one of five runs in shuffled order |
| G6 | a new test only checks existence, truthiness or an HTTP status |
| G7 | a file with tests added gains no covered lines and no detected mutants (fully covered files pass) |

The gates cannot remove one bad test from a patch, so the agent runs the same gates on its working tree first (`gates.ts --worktree`). A test it cannot fix in three attempts it deletes and lists as rejected in `decisions.json`.

## Alternatives

- Gates in the detection job: the documented blocking path, but a block also hides the report.
- The gates cut failing tests out of the patch: a partial push, but the code that edits the agent's patch would be fragile and hard to trust.

## Consequences

- One bad test blocks the whole patch; the report names the gate and the test, and the patch stays in the run's artifacts.
- The agent's self-check uses line coverage only, so it is stricter than CI, where Stryker can also pass G7.
- Gate behavior depends on gh-aw job names and the patch file name in the `agent` artifact; a gh-aw upgrade must be checked against both.
