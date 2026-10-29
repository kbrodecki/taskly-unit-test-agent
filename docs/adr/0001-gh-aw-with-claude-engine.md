# ADR 1: GitHub Agentic Workflows with the Claude engine

## Context

The agent runs on every pull request, reads code that anyone with push access can change, and must write only tests. The rubric weighs security and reliability. Skills must be reusable, also outside CI.

## Decision

The PR workflow is a gh-aw workflow (`.github/workflows/unit-test-agent.md`, compiled to `.lock.yml`) with the Claude engine and Sonnet. The agent job has a read-only token and a Bash allowlist. It writes only through the `push-to-pull-request-branch` safe output, whose `allowed-files` accepts test paths only. Limits per run: 60 turns, 150 AI credits, 30 minutes. The agent definition is `.github/agents/unit-test-agent.md`, imported by the workflow; the five skills are in `.github/skills/` and linked into `.claude/` for local use with `claude --agent unit-test-agent`.

## Alternatives

- `anthropics/claude-code-action`: simpler, but the agent job would hold the write token, and there is no cost limit per run.
- A custom Claude Agent SDK step: full control, but the sandbox, network firewall, write separation and threat detection would all be ours to build and review.
- Copilot coding agent: needs a Copilot license, and the reviewer could not run it with an API key alone.

## Consequences

- Security comes from configuration that gh-aw already enforces: a separate write job, `allowed-files` checked already in the agent's tool, pinned actions, an API proxy with a credit limit. A spike tested each of these before the build (patch outside tests rejected, run stopped at the credit limit).
- gh-aw reads the prompt, the imported agent and the skills from the default branch. A change to the agent takes effect after merge.
- gh-aw removes `.claude/` from the agent workspace, so the agent and skills live in `.github/` and `.claude/` holds only links.
- The reviewer needs the `gh aw` CLI only to recompile a changed workflow.
