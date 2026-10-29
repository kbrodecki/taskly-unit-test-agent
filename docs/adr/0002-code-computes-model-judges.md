# ADR 2: Code computes, the model judges

## Context

Agents that write tests are known to game them: weak assertions, edited expectations, claims of coverage that did not happen. Model output also varies between runs. The numbers in the PR must be true whatever the model says.

## Decision

Everything that can be computed is code in `tools/`, with its own tests:

- `prepare.ts`: changed files, a filter for files that need no test (tests, types, docs, config), the mapping to test files, and the uncovered changed lines from `lcov`.
- `gates.ts`: validates the agent's output, applies its patch and runs gates G0 to G7.
- `report.ts`: renders the PR comment and the check conclusion from data.

The model does what needs understanding: one decision per file (`create`, `update` or `skip` with a reason from a closed list), the tests themselves, and at most three attempts to fix each failing test. The contract between them is `decisions.json`, validated against a schema and against the input (every input file decided, no file outside it).

The report is published by our own job, not by the agent. It renders only from the prepared input and the gate results and never reads files from the agent's workspace. Text from the model (rationales, case names) is shortened and stripped of links, HTML and mentions; file names from the PR are kept inside code spans that they cannot close.

## Alternatives

- The agent runs the whole flow and writes the PR comment itself: fewer moving parts, but every number in the PR would be the model's claim.
- A second model reviews the tests: catches more weak tests, but adds cost and another non-deterministic judge. Left for the production version.

## Consequences

- Every number in the comment is reproducible from the artifacts of the run.
- The model gets a smaller, focused input: only files that passed the filter, with their uncovered lines.
- The `decisions.json` schema is part of the agent definition; changing it means changing the agent, the skills and `tools/` together.
- A broken contract fails the run and nothing is pushed.
