---
on:
  pull_request:
    types: [opened, synchronize]
permissions:
  contents: read
  pull-requests: read
engine:
  id: claude
  model: sonnet
max-turns: 20
max-ai-credits: 100
timeout-minutes: 15
inlined-imports: true
skills:
  - .github/skills/spike-marker
tools:
  edit:
  bash: ["cat spike/scenario.txt", "git status", "git diff", "git add *", "git commit *", "npx vitest run *"]
safe-outputs:
  push-to-pull-request-branch:
    allowed-files:
      - "backend/tests/**"
  threat-detection:
    continue-on-error: false
    report-as-issue: false
    steps:
      - name: S2 gate in detection
        run: |
          ls -la /tmp/gh-aw/threat-detection/
          if grep -q "GATE-FAIL-DETECTION" /tmp/gh-aw/threat-detection/aw.patch 2>/dev/null; then echo "S2 gate failed"; exit 1; fi
jobs:
  gates:
    needs: [agent, detection]
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: agent
          path: /tmp/agent-artifact
      - name: S2b gate in custom job
        run: |
          find /tmp/agent-artifact -maxdepth 3 | head -50
          if grep -rq "GATE-FAIL-JOB" /tmp/agent-artifact --include="*.patch" --include="*.bundle" 2>/dev/null; then echo "S2b gate failed"; exit 1; fi
  safe_outputs:
    needs: [gates]
    if: needs.gates.result == 'success'
  report:
    needs: [agent, detection, gates, safe_outputs]
    if: always()
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      checks: write
    steps:
      - name: S3 report
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          BODY: "spike report: agent=${{ needs.agent.result }} detection=${{ needs.detection.result }} gates=${{ needs.gates.result }} safe_outputs=${{ needs.safe_outputs.result }}"
        run: gh pr comment ${{ github.event.pull_request.number }} -R ${{ github.repository }} --body "$BODY"
---

# Spike

You are the spike agent. Agent marker: AGENT-LOADED-4410.

1. Read `spike/scenario.txt`.
2. Use the `spike-marker` skill and copy the marker it gives you.
3. Write `backend/tests/spike.test.ts` with one passing Vitest test whose name contains both markers (agent and skill) and the scenario text verbatim.
4. If the scenario says `TOUCH-SOURCE`, also append a blank line to `backend/src/api/health.ts`.
5. Commit the change on the current branch and push it with the push-to-pull-request-branch safe output.

Use the Skill tool to load `spike-marker`; do not read skill or agent files from git history. Mention in the commit message how you obtained each marker.
