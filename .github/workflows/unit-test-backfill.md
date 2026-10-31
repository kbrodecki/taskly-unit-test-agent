---
name: Unit Test Agent Backfill
description: Adds missing unit tests for source files with uncovered lines across the repo and opens one pull request with them.
on:
  workflow_dispatch:
    inputs:
      limit:
        description: Most source files the agent decides on in this run
        required: false
        default: "25"
concurrency:
  group: unit-test-agent-backfill
  cancel-in-progress: false
  job-discriminator: ${{ github.run_id }}
permissions:
  contents: read
  pull-requests: read
engine:
  id: claude
  model: sonnet
max-turns: 500
max-ai-credits: 1000
timeout-minutes: 120
imports:
  - .github/agents/unit-test-agent.md
skills:
  - .github/skills/test-decisions
  - .github/skills/test-case-heuristics
  - .github/skills/gates-loop
  - .github/skills/backend-unit-tests
  - .github/skills/frontend-unit-tests
tools:
  edit:
  bash:
    - "node tools/src/cli/gates.ts --worktree"
    - "npm --prefix backend test:*"
    - "npm --prefix frontend test:*"
    - "npm --prefix frontend run format"
    - "git status"
    - "git diff:*"
    - "git add:*"
    - "git rm:*"
    - "git commit:*"
    - "rm:*"
pre-agent-steps:
  - name: Install dependencies
    run: |
      npm ci --prefix backend
      npm ci --prefix frontend
      npm ci --prefix tools
  - name: Prepare agent input
    env:
      LIMIT: ${{ inputs.limit }}
    run: node tools/src/cli/prepare.ts --mode backfill --limit "$LIMIT"
  # Uploaded before the agent starts: the gates and the report read the input and the coverage
  # baseline from here, not from the agent's workspace, which the agent can edit.
  - name: Upload prepared input
    uses: actions/upload-artifact@v7
    with:
      name: unit-test-agent-input
      path: |
        .unit-test-agent/input.json
        .unit-test-agent/coverage-before.json
      include-hidden-files: true
      if-no-files-found: error
post-steps:
  - name: Upload agent input and decisions
    if: always()
    uses: actions/upload-artifact@v7
    with:
      name: unit-test-agent-data
      path: .unit-test-agent/
      include-hidden-files: true
      if-no-files-found: ignore
safe-outputs:
  create-pull-request:
    title-prefix: "[unit-test-agent] "
    labels: [unit-test-agent]
    draft: false
    allowed-files:
      - "backend/**/*.test.ts"
      - "frontend/**/*.test.ts"
      - "frontend/**/*.test.tsx"
      - "backend/tests/**"
      - "frontend/src/test/**"
  threat-detection:
    continue-on-error: false
    report-as-issue: false
jobs:
  gates:
    needs: [agent, detection]
    runs-on: ubuntu-latest
    timeout-minutes: 40
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ github.sha }}
          persist-credentials: false
      - uses: ./.github/actions/unit-test-gates
  safe_outputs:
    needs: [gates]
    if: needs.gates.result == 'success'
  report:
    needs: [agent, detection, gates, safe_outputs]
    if: always()
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
      pull-requests: write
      checks: write
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ github.sha }}
          sparse-checkout: |
            tools
            .github/scripts
            .github/actions
          persist-credentials: false
      - uses: ./.github/actions/unit-test-report
        with:
          agent: ${{ needs.agent.result }}
          detection: ${{ needs.detection.result }}
          gates: ${{ needs.gates.result }}
          push: ${{ needs.safe_outputs.result }}
          pull-number: ${{ needs.safe_outputs.outputs.created_pr_number }}
      - name: Fallback report
        # Runs only when a step above failed: the PR still gets a comment and a red check, without any file from the checkout.
        if: failure()
        uses: actions/github-script@v9
        env:
          PULL_NUMBER: ${{ needs.safe_outputs.outputs.created_pr_number }}
        with:
          script: |
            const marker = '<!-- unit-test-agent-report -->';
            const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
            const body = `${marker}\n## Unit Test Agent\n\n❌ The report job failed before it could publish the result. Gates and push are in the [run log](${runUrl}).\n`;
            const issue_number = Number(process.env.PULL_NUMBER);
            if (!issue_number) { core.warning('no pull request to report on'); return; }
            const comments = await github.paginate(github.rest.issues.listComments, { ...context.repo, issue_number, per_page: 100 });
            const existing = comments.find((comment) => comment.user?.login === 'github-actions[bot]' && comment.body && comment.body.includes(marker));
            if (existing) await github.rest.issues.updateComment({ ...context.repo, comment_id: existing.id, body });
            else await github.rest.issues.createComment({ ...context.repo, issue_number, body });
            const { data: pull } = await github.rest.pulls.get({ ...context.repo, pull_number: issue_number });
            await github.rest.checks.create({ ...context.repo, name: 'Unit Test Agent', head_sha: pull.head.sha, status: 'completed', conclusion: 'failure', details_url: runUrl, output: { title: 'Report failed', summary: body } });
---

# Unit Test Agent Backfill

Mode: `backfill`. Act as the `unit-test-agent` defined in the imported agent instructions above and follow its order of work.

- Input: `.unit-test-agent/input.json`, already prepared: every source file with uncovered lines, up to the limit.
- Output: `.unit-test-agent/decisions.json`, then one commit with the test files, published with `create_pull_request`. Title: `Add missing unit tests`. Body: one line per file you tested, naming the cases.
- Load skills with the Skill tool. Do not read skill or agent files from disk or git history.
