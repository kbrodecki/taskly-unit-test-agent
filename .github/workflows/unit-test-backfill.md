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
      - "**/*.test.ts"
      - "**/*.test.tsx"
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
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - name: Install dependencies
        run: |
          npm ci --prefix backend
          npm ci --prefix frontend
          npm ci --prefix tools
      - uses: actions/download-artifact@v8
        with:
          name: unit-test-agent-data
          path: .unit-test-agent
      - uses: actions/download-artifact@v8
        with:
          name: agent
          path: /tmp/agent-artifact
      - name: Run gates G1 to G7
        run: |
          patch="$(find /tmp/agent-artifact -maxdepth 1 -name 'aw-*.patch' | head -n 1)"
          node tools/src/cli/gates.ts --patch "$patch"
      - name: Upload gate results
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: unit-test-agent-gates
          path: .unit-test-agent/gates.json
          if-no-files-found: ignore
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
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - name: Install tools
        run: npm ci --prefix tools
      - uses: actions/download-artifact@v8
        continue-on-error: true
        with:
          name: unit-test-agent-data
          path: .unit-test-agent
      - uses: actions/download-artifact@v8
        continue-on-error: true
        with:
          name: unit-test-agent-gates
          path: .unit-test-agent
      - name: Render report
        run: |
          if [ -f .unit-test-agent/input.json ] && [ -f .unit-test-agent/gates.json ]; then node tools/src/cli/report.ts; fi
      - name: Publish comment and check run
        uses: actions/github-script@v9
        with:
          script: |
            const publishReport = require(`${process.env.GITHUB_WORKSPACE}/.github/scripts/publish-report.cjs`);
            const results = { agent: '${{ needs.agent.result }}', detection: '${{ needs.detection.result }}', gates: '${{ needs.gates.result }}', push: '${{ needs.safe_outputs.result }}' };
            await publishReport({ github, context, core, results, pullNumber: '${{ needs.safe_outputs.outputs.created_pr_number }}' });
---

# Unit Test Agent Backfill

Mode: `backfill`. Act as the `unit-test-agent` defined in the imported agent instructions above and follow its order of work.

- Input: `.unit-test-agent/input.json`, already prepared: every source file with uncovered lines, up to the limit.
- Output: `.unit-test-agent/decisions.json`, then one commit with the test files, published with `create_pull_request`. Title: `Add missing unit tests`. Body: one line per file you tested, naming the cases.
- Load skills with the Skill tool. Do not read skill or agent files from disk or git history.
