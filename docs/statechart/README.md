# Run lifecycle model

`PRRun.tla` is a TLA+ model of one run of the PR workflow: the jobs `agent`, `detection`, `gates`, `safe_outputs`, `report` and `report_blocked` with the `needs` and `if` conditions of `unit-test-agent.lock.yml`. TLC checks two rules:

- `OneReport`: every run that was not cancelled by a new push ends with exactly one PR comment and one check run.
- `PushOnlyAfterGates`: tests reach the PR branch only after a threat detection verdict and all gates passed.

`PRRunNoCancel.tla` is the same model without the "author pushes again" step; `run.svg` is drawn from it, because the cancel arrow from every state made the chart unreadable. `view.mjs` holds the labels and colors of the chart.

Result: `PushOnlyAfterGates` holds. `OneReport` breaks on one path, marked in the chart: threat detection ends green without a verdict (detector unavailable or parse error), which skips `report` while `report_blocked` posts only on a detection failure. A second path, the `report` job failing after the push (seen live in run 40996080459), broke the rule until the job got a fallback step with `if: failure()` that posts the comment and check without the checkout.

Not modelled: a timeout of the `report` job (10 minutes) cancels its steps, so the fallback step does not run, and the fallback itself can fail on the GitHub API. Both leave the PR without a result; the run log and the job summary still hold it.

Rendered with the `pstack:statechart` skill (TLC through its `statechart` script, chart with Pele 1.9.0).
