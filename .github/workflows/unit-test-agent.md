---
name: Unit Test Agent
description: Decides which changed source files need unit tests, writes them, gates them and reports on the pull request.
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
if: github.event.pull_request.draft == false && !contains(github.event.pull_request.labels.*.name, 'skip-test-agent')
concurrency:
  group: unit-test-agent-${{ github.event.pull_request.number }}
  cancel-in-progress: true
permissions:
  contents: read
  pull-requests: read
engine:
  id: claude
  model: sonnet
max-turns: 60
max-ai-credits: 150
timeout-minutes: 30
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
  - name: Fetch base branch history
    env:
      BASE_REF: ${{ github.event.pull_request.base.ref }}
    run: |
      if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then git fetch --no-tags --unshallow origin; fi
      git fetch --no-tags origin "$BASE_REF"
  - name: Install dependencies
    run: |
      npm ci --prefix backend
      npm ci --prefix frontend
      npm ci --prefix tools
  - name: Prepare agent input
    env:
      BASE_REF: ${{ github.event.pull_request.base.ref }}
    run: node tools/src/cli/prepare.ts --mode pr --base "origin/$BASE_REF"
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
  push-to-pull-request-branch:
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
    timeout-minutes: 30
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ github.event.pull_request.head.sha }}
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
          node tools/src/cli/gates.ts --patch "$patch" --mutation --mutation-minutes 8
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
          ref: ${{ github.event.pull_request.base.sha }}
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
            await publishReport({ github, context, core, results, pullNumber: context.payload.pull_request.number });
---

# Unit Test Agent

Mode: `pr`. Act as the `unit-test-agent` defined in the imported agent instructions above and follow its order of work.

- Input: `.unit-test-agent/input.json`, already prepared.
- Output: `.unit-test-agent/decisions.json`, then one commit with the test files, published with `push_to_pull_request_branch`.
- Load skills with the Skill tool. Do not read skill or agent files from disk or git history.
