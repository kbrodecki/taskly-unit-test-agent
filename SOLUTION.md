# Solution: unit test agent

**TL;DR.** A custom Claude agent with five reusable skills runs on every pull request through GitHub Agentic Workflows (gh-aw). For each changed source file it decides `create`, `update` or `skip` with a reason, writes Vitest tests in the repo's style, and runs them. Deterministic code (`tools/`) computes the input, runs eight gates (G0 to G7) on the agent's patch and renders the report, so the model never grades its own work. A backfill run of the same agent raised line coverage from 33.0% to 100% in the backend and from 47.7% to 89.4% in the frontend.

```mermaid
flowchart LR
  PR[PR opened or updated] --> P[prepare: changed files, filter,<br/>uncovered changed lines]
  P --> A[agent: decisions.json + tests,<br/>own gate loop]
  A --> D[gh-aw threat detection]
  D --> G[gates job: G0 to G7 on the patch,<br/>mutation score]
  G -->|all pass| S[safe output: push tests<br/>to the PR branch]
  G --> R[report job: PR comment + check]
  S --> R
  D -->|blocked| B[report_blocked job: PR comment + check]
```

## 1. Key decisions

| Decision | Why | Record |
|---|---|---|
| gh-aw with the Claude engine, not a hand-written Actions job | sandboxed agent, read-only token, writes only through a typed safe output with `allowed-files` | [ADR 1](docs/adr/0001-gh-aw-with-claude-engine.md) |
| Code computes, the model judges | changed lines, coverage, gates and the report are reproducible; the model only decides and writes tests, through the `decisions.json` contract | [ADR 2](docs/adr/0002-code-computes-model-judges.md) |
| Updates to existing tests are additive only | an agent that edits a failing test can hide a regression; a red author test is reported for a human | [ADR 3](docs/adr/0003-additive-test-updates.md) |
| Gates in their own job decide the push, all or nothing | the patch is pushed only when every gate passes; the agent drops tests it cannot fix itself | [ADR 4](docs/adr/0004-gates-job-all-or-nothing.md) |
| `skip` is a decision with a closed list of reasons | the report shows why a file got no tests; code rejects `already-covered` and `covered-by-author` while changed lines are uncovered | [test-decisions skill](.github/skills/test-decisions/SKILL.md) |
| Mutation testing as a signal, not a blocker | Stryker scores before and after the patch; more detected mutants is an alternative proof for G7 | [tools README](tools/README.md) |
| Backfill is a separate workflow with the same agent and gates | different trigger, input and safe output; the rules stay in one place | [unit-test-backfill.md](.github/workflows/unit-test-backfill.md) |

## 2. How to run

Requirements: a GitHub repository with Actions enabled, Node 22.18 or newer for local work (the `tools/` scripts run as TypeScript without a build step), and an Anthropic API key (one PR run costs about $0.05 to $0.40 with Sonnet). The `gh aw` CLI is needed only to recompile a workflow after editing its `.md` file.

1. Fork or copy this repository.
2. Add the secret `ANTHROPIC_API_KEY` (Settings, Secrets and variables, Actions). Set a spending limit on the key in the Anthropic console; the workflows also cap turns and AI credits.
3. Optional: add `GH_AW_CI_TRIGGER_TOKEN`, a fine-grained PAT with Contents read and write on the repository. Without it, CI does not run on the agent's commit (GitHub does not trigger workflows from `GITHUB_TOKEN` pushes).
4. Open a pull request inside the repository that changes code in `backend/src` or `frontend/src`. The "Unit Test Agent" check and a report comment appear after 10 to 15 minutes. Add the label `skip-test-agent` to opt a PR out; drafts are skipped. PRs from forks are not supported (no secrets there).
5. Backfill: run the "Unit Test Backfill" workflow from the Actions tab (input `limit`, default 25 files). It opens a PR with the tests. This needs the repository setting "Allow GitHub Actions to create and approve pull requests"; without it gh-aw pushes the branch and opens an issue instead.

Locally, from the repository root: `node tools/src/cli/prepare.ts --mode pr --base origin/main` writes the agent input, and `node tools/src/cli/gates.ts --worktree` gates the working tree. The agent and skills are linked into `.claude/` for `claude --agent unit-test-agent`, but that path was not verified end to end; its last step names a gh-aw safe output, so stop before publishing and commit by hand.

## 3. Where things live

```text
.github/
├── agents/unit-test-agent.md    # role, hard rules, decision contract, order of work
├── skills/                      # test-decisions, test-case-heuristics, gates-loop (stack-free),
│                                # backend-unit-tests, frontend-unit-tests (this repo's conventions)
├── workflows/
│   ├── unit-test-agent.md       # PR mode (gh-aw source; .lock.yml is the compiled workflow)
│   ├── unit-test-backfill.md    # backfill mode
│   └── ci.yml                   # typecheck and tests of backend, frontend, tools
├── actions/                     # gate and report steps shared by both gh-aw workflows
└── scripts/                     # publish the report
tools/      # prepare, gates G0 to G7, report; tested on their own (npm test)
eval/       # expected results, collector, results of each evaluation round
docs/adr/   # the four decisions above
```

## 4. Example run

- **Demo PR**, [Clear completed tasks](https://github.com/kbrodecki/taskly-unit-test-agent/pull/26/changes) (merged). Commit 1 adds the feature with one backend repository test and no frontend tests. The agent created tests for the new dialog and hook, updated tests for `TodosPage` and `api/todos`, and skipped `repository.ts` because the author's test covers it. It also skipped `TodosHeader.tsx` as covered by the author, which was wrong: the header tests never rendered the new button, so a person added them later. Commit 2 ("after review") changes the button; the agent extended its own tests additively. The [run for commit 2](https://github.com/kbrodecki/taskly-unit-test-agent/actions/runs/40893602871) loaded all five skills through the `Skill` tool: `test-decisions`, `test-case-heuristics`, `backend-unit-tests`, `frontend-unit-tests` and `gates-loop`. See the [agent report](https://github.com/kbrodecki/taskly-unit-test-agent/pull/26#issuecomment-6498643517).
- **Backfill PR**, [Add missing unit tests](https://github.com/kbrodecki/taskly-unit-test-agent/pull/24/changes) (merged). Of 24 input files the agent decided 15 `create`, 8 `update` and 1 `skip` (`TodosPage.tsx`, `needs-refactor`), wrote 23 test files, and passed every gate. Line coverage went from 33.0% to 100% in the backend and from 47.7% to 89.4% in the frontend. The run took 126 turns, $1.22 and 16 minutes. [Report](https://github.com/kbrodecki/taskly-unit-test-agent/pull/24#issuecomment-6495119717), rendered from the run's artifacts because the run could not open the PR itself.

## 5. Evaluation

Five cases, three runs each, expected results committed before the first run. Round 2 reran E1 and E4 after the gate fixes that round 1 exposed. Details: [eval/README.md](eval/README.md), [round 1](eval/rounds/round-1.md), [round 2](eval/rounds/round-2.md).

| Case | What it checks | Decisions exact | Blocking gates | Only tests pushed | Stable | Cost per run |
|---|---|---|---|---|---|---|
| E1 | demo feature in backend and frontend | 20/33, after fixes 26/33 | none | 3/3 | 1/3 | $0.39 |
| E2 | README, CSS and a type only | 9/9 | none | 3/3 | 3/3 | $0.04 |
| E3 | pure refactor | 3/3 | none | 3/3 | 3/3 | $0.07 |
| E4 | author breaks a test and does not fix it | 3/3 | G5, G7; after fixes none | 3/3 | 3/3 | $0.10 |
| E5 | prompt injection in a code comment | 3/3 | none | 3/3 | 3/3 | $0.10 |

Costs cover the agent job only, not the threat detection job. In a [run with nothing to test](https://github.com/kbrodecki/taskly-unit-test-agent/actions/runs/41051150988), the agent cost $0.04 and detection about $0.07.

In round 1, G5 and G7 blocked the agent's correct test in E4. The suite wrote no coverage while the author's test failed, and G5 counted the author's failure as the agent's. Both are fixed in [PR 46](https://github.com/kbrodecki/taskly-unit-test-agent/pull/46/changes). In E1 the remaining mismatches are skip reasons (`already-covered` and `covered-by-author` swapped), one expectation error of mine (`api/queryKeys.ts`) and one real miss: in one run of three the agent skipped `TodosHeader.tsx` instead of updating its tests. In E5 the agent ignored the injected instructions in 3 of 3 runs.

## 6. Assumptions

- "Unit tests" means the repo's current style: Vitest with React Testing Library in the frontend, Supertest with a mocked repository in the backend. No database, no end-to-end tests, no new frameworks.
- Coverage is measured with the existing configuration; excluded files stay excluded.
- Deciding not to write a test is a valid outcome when the reason is explicit.
- The agent never changes production code. If code is hard to test, it says so (`needs-refactor`).
- PRs come from branches of the same repository.

## 7. Limitations

- The untrusted party is the agent, not the PR author. Same-repository authors already have write access. The workflows run their code, and the `gates` job runs the `tools/` version from the PR branch, so a PR can change the gate code it is checked by. A production setup would run the gates from the base branch.
- The test checks are syntactic. G3 and G6 do not catch a tautology such as `expect(1).toBe(1)`. New tests are matched by title, so a new test that reuses an existing title in another `describe` is not linted. Mutation testing partly covers this.
- gh-aw reads the agent, its skills and the workflow prompt from the default branch. A change to them takes effect after merge, not in the PR that makes it.
- Without `GH_AW_CI_TRIGGER_TOKEN`, CI does not run on the agent's commit. With it, the agent runs again on its own commit; it then finds nothing new to do, but there is no explicit loop guard.
- G2 allows only added lines, so an update cannot change existing test setup. When a test needs a different mock, the agent adds another `vi.mock` for the same module instead of editing the first one. `TodosPage.test.tsx` collected three `TodosHeader` mocks this way, and only the last one took effect, until a manual cleanup in [PR 63](https://github.com/kbrodecki/taskly-unit-test-agent/pull/63/changes). Test files grow with each update until someone tidies them.
- Skip reasons are not fully stable between runs (E1 stable 1 of 3). The closed list does not tell the author's tests from the agent's earlier tests.
- When threat detection blocks a run, the PR gets only a status comment and a failed check, with no detail from the agent's output. That path was checked by compiling the workflow and reading the compiled condition, not by a live run. A backfill run has no such report: it has no PR yet.
- Mutation testing covers up to four files within an 8 minute budget, runs only in PR mode, and stops when an author test is already red.

## 8. Production version

- A GitHub App instead of the PAT, so the agent's commits trigger CI without a personal token.
- A second model as a reviewer of the tests, outside the decision path.
- Mutation score as a blocking gate for critical paths, with Stryker's incremental mode and a cache.
- Skill changes evaluated in CI against the `eval/` cases before merge.
- Telemetry of cost, turns and decisions per run, and retention rules for artifacts.
