---
name: gates-loop
description: How to run the quality gates on your test changes, read the result, fix or remove failing tests and record rejections. Use after writing tests and decisions.json, before committing.
---
# Gates loop

The same gates run again after you finish, on a clean checkout. Passing them here is how you avoid a blocked run.

## Run

1. Run `node tools/src/cli/gates.ts --worktree` from the repository root.
2. Read `.unit-test-agent/gates-self.json`. Each entry in `gates` has `id`, `status` and `details`. `decisionErrors` lists problems in `decisions.json`.

To run one test file while fixing it: `npm --prefix backend test -- tests/<name>.test.ts` or `npm --prefix frontend test -- src/<path>.test.tsx`.

## Fix

| Gate | What to do |
|---|---|
| decisions | Fix `decisions.json` to match the `test-decisions` skill. |
| G0 | A `create` or `update` decision names a test file you did not change. Write the tests, or change the decision. |
| G1 | You changed a file outside the test paths. Undo that change. |
| G2 | You changed or removed an existing test line, or used a skip, focus or suppression. Restore the original lines; add new tests instead. |
| G3 | Fix the type error, or add a real `expect(...).<matcher>(...)` to the named test. |
| G4 | Your test fails, or it broke another test. Fix your test; production code is off limits. |
| G5 | Your test depends on order or shared state. Reset mocks and state per test (`beforeEach`, `vi.clearAllMocks`, fresh fixtures). |
| G6 | Assert the actual value, rendered content or call arguments, not only existence or status. |
| G7 | The tests do not run the changed code. Target the `uncoveredChangedLines`. |

Then run the gates again.

## Give up on a test

Make at most three fix attempts per test file. If a test still fails after the third:

- In an existing test file, remove only the tests you added, with Edit.
- In a test file you created, remove the failing tests with Edit; if none remain, delete the file with `git rm -f <path>` if you already added it, or `rm <path>` if you did not.
- Move each removed test from `cases` to `rejected` in `decisions.json` with a one-sentence reason. If no cases remain for the file, change the decision to `skip` with `needs-refactor` when production code blocks testing.

Run the gates one last time. Commit only when they pass, apart from failures listed in `authorFailures`.
