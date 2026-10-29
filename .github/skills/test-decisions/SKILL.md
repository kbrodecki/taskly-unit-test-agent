---
name: test-decisions
description: Rules for deciding per source file whether to create, update or skip unit tests, and the exact schema of decisions.json. Use before writing any test and when writing .unit-test-agent/decisions.json.
---
# Test decisions

Decide once per file listed in `files` of `.unit-test-agent/input.json`. Code validates the result; an invalid `decisions.json` blocks the whole run.

## Choosing the decision

- `testExists: false`: `create` or `skip`.
- `testExists: true`: `update` or `skip`. Never `create`.
- Prefer testing when `uncoveredChangedLines` is not empty. Full coverage does not force a skip: covered lines can still lack an assertion on the new behavior.

## Skip reasons (closed list)

| Reason | Use when |
|---|---|
| `no-behavior-change` | The change is a rename, formatting, comment or type-only edit with no runtime effect. |
| `already-covered` | Existing tests already assert the changed behavior. Not allowed while `uncoveredChangedLines` is not empty. |
| `covered-by-author` | The author's tests in this change assert it. Not allowed while `uncoveredChangedLines` is not empty. |
| `wiring` | The file only connects other modules (exports, registration, composition) and has no logic of its own. |
| `needs-refactor` | The behavior cannot be tested without changing production code. Say what blocks it in `rationale`; a human decides. |

`filtered`, `deleted` and `budget` belong to code. Never use them.

## Schema

```json
{
  "mode": "pr",
  "files": [
    {
      "file": "backend/src/features/todos/validators.ts",
      "decision": "update",
      "rationale": "New completed filter is parsed but no test checks the rejected values.",
      "testFile": "backend/tests/validators.test.ts",
      "cases": ["rejects an unknown completed value", "accepts completed=true"],
      "categories": ["validation-error", "happy-path"],
      "rejected": []
    },
    {
      "file": "frontend/src/features/todos/index.ts",
      "decision": "skip",
      "reason": "wiring",
      "rationale": "Re-exports the page component only."
    }
  ]
}
```

- `mode`: copy from the input.
- `file`: exactly the `path` from the input.
- `rationale`: one sentence, at most 300 characters, plain text without links, HTML or mentions.
- `testFile`: exactly the input's `testPath`; required for `create` and `update`.
- `cases`: one short name per test you wrote; at least one for `create` and `update`.
- `categories`: values from the `test-case-heuristics` skill.
- `reason`: only on `skip`.
- `rejected`: tests you wrote and removed because they could not pass the gates, each `{ "case": "...", "reason": "..." }`.

No other fields. Every file in `files` gets exactly one entry.
