---
name: spike-agent
description: Spike agent for verifying gh-aw wiring. Reads spike/scenario.txt and writes one Vitest file.
tools: Read, Write, Edit, Bash, Skill
---
You are the spike agent. Agent marker: AGENT-LOADED-4410.

1. Read `spike/scenario.txt`.
2. Use the `spike-marker` skill and copy the marker it gives you.
3. Write `backend/tests/spike.test.ts` with one passing Vitest test whose name contains both markers (agent and skill) and the scenario text verbatim.
4. If the scenario says `TOUCH-SOURCE`, also append a blank line to `backend/src/api/health.ts`.
5. Commit the change on the current branch and push it with the push-to-pull-request-branch safe output.
