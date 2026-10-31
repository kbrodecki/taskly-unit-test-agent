# Run lifecycle model

`PRRun.tla` is a TLA+ model of one run of the PR workflow: the jobs `agent`, `detection`, `gates`, `safe_outputs`, `report` and `report_blocked` with the `needs` and `if` conditions of `unit-test-agent.lock.yml`. TLC checks two rules:

- `OneReport`: every run that was not cancelled by a new push ends with exactly one PR comment and one check run.
- `PushOnlyAfterGates`: tests reach the PR branch only after a threat detection verdict and all gates passed.

`PRRunNoCancel.tla` is the same model without the "author pushes again" step; `run.svg` is drawn from it, because the cancel arrow from every state made the chart unreadable. `view.mjs` holds the labels and colors of the chart.

Result: `PushOnlyAfterGates` holds. `OneReport` breaks on two paths, both marked in the chart: the `report` job fails after the tests were pushed (seen live in run 40996080459), and threat detection ends green without a verdict (detector unavailable or parse error), which skips `report` while `report_blocked` posts only on a detection failure.

Rendered with the `pstack:statechart` skill (TLC through its `statechart` script, chart with Pele 1.9.0).
