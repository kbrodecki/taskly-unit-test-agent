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
          GH_TOKEN: ${{ github.token }}
          BODY: "spike report: agent=${{ needs.agent.result }} detection=${{ needs.detection.result }} gates=${{ needs.gates.result }} safe_outputs=${{ needs.safe_outputs.result }}"
        run: gh pr comment ${{ github.event.pull_request.number }} -R ${{ github.repository }} --body "$BODY"
---

# Spike

Act as the `spike-agent` subagent defined in `.claude/agents/spike-agent.md`: delegate the whole task to it with the Agent tool. If delegation is not available, read that file and follow it yourself, and say so in the commit message.
