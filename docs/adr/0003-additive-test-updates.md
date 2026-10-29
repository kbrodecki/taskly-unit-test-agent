# ADR 3: Updates to existing tests are additive only

## Context

The workflow must create or update tests for changed code. When a change breaks an existing test, the agent could edit the test to match the new code. That is also the easiest way to hide a regression.

## Decision

The agent adds test cases and may extend fixtures and imports, but never changes or removes an existing test line. It must not skip, focus or suppress tests either. Gate G2 enforces this on the diff. When an existing test already fails without the agent's patch, the report lists it as "Regression or intended change, a human decides" and the check is red. The agent's own tests can still be pushed if they add no new failures (G4 compares the failures before and after the patch).

## Alternatives

- Let the agent change assertions when the behavior change looks intended: covers more of "update", but the agent would be judging the author's intent from the code alone.
- Stop the agent when any test is red: safe, but the PR gets no tests at all until the author fixes theirs.

## Consequences

- Existing tests stay the specification. Only a person decides that a behavior change is intended.
- A PR with a broken author test gets a red check from the agent even when the agent's work is fine. Evaluation case E4 tests exactly this.
- The agent may extend its own earlier tests in a later commit of the same PR, again only by adding lines.
