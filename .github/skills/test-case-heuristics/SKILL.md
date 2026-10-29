---
name: test-case-heuristics
description: Categories of test cases to consider for a changed source file and how to pick the ones that matter. Use when choosing which cases to write for a create or update decision.
---
# Test case heuristics

Start from `uncoveredChangedLines`: every uncovered branch should end up exercised by at least one case. Then walk the categories below and keep the ones the changed code can actually hit. Do not write a case for a category the code has no path for.

| Category | Ask |
|---|---|
| `happy-path` | What does the changed code return or render for normal input? |
| `boundaries` | Empty lists, zero, maximum lengths, first and last item, dates at limits. |
| `validation-error` | Which inputs are rejected, and what error or status does the caller see? Is the dependency left uncalled? |
| `network-or-repository-error` | What happens when the API request, repository or database call fails? |
| `double-submit` | Can the action run twice while the first is in flight? Is the control disabled or the second call ignored? |
| `loading-and-disabled-state` | What does the user see while data loads or a mutation runs? |

## Writing good cases

- One behavior per test. Name it after the behavior: `rejects a title longer than 120 characters`, not `test validation`.
- Assert the observable result: returned value, rendered text or role, the exact arguments a dependency was called with, the status together with the body.
- Prefer one `it.each` table over several near-identical tests, as the existing tests do.
- Record every category you covered in `categories` and every test name in `cases` of `decisions.json`.
