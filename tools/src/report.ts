import type { DecisionEntry } from './decisions.ts';
import type { GateResult } from './gates.ts';
import type { CodeDecision } from './input.ts';

export const MARKER = '<!-- unit-test-agent-report -->';

export type Conclusion = 'success' | 'neutral' | 'failure';

export interface CoverageRow {
  area: string;
  before: number;
  after: number;
}

export interface ReportData {
  mode: 'pr' | 'backfill';
  decisions: DecisionEntry[];
  decisionErrors: string[];
  codeDecisions: CodeDecision[];
  gates: GateResult[];
  authorFailures: string[];
  coverage: CoverageRow[];
  mutation?: MutationSummary;
  runUrl?: string;
}

export interface MutationSummary {
  rows: Array<{ file: string; scoreBefore: number; scoreAfter: number; before: { detected: number; valid: number }; after: { detected: number; valid: number } }>;
  reason?: string;
}

export function sanitize(text: string, max = 300): string {
  const clean = text
    .replace(/<[^>]*>/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\b(?:https?|ftp):\/\/\S+/gi, '[link removed]')
    .replace(/@(?=[\w-])/g, '@​')
    .replace(/[`|]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function conclusion(data: ReportData): Conclusion {
  if (data.decisionErrors.length > 0) return 'failure';
  if (data.gates.some((gate) => gate.status === 'fail')) return 'failure';
  if (data.authorFailures.length > 0) return 'failure';
  return data.decisions.some((entry) => entry.decision !== 'skip') ? 'success' : 'neutral';
}

const HEADLINE: Record<Conclusion, string> = {
  success: '✅ Tests added and every gate passed',
  neutral: '⚪ Nothing to test in this change',
  failure: '❌ Blocked, see below',
};

const ICON = { pass: '✅', fail: '❌', skipped: '⏭️' } as const;

function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function renderReport(data: ReportData): string {
  const result = conclusion(data);
  const lines = [MARKER, `### Unit test agent: ${HEADLINE[result]}`, ''];
  if (data.decisionErrors.length > 0) {
    lines.push('**The agent output broke the decision contract, so nothing was pushed:**', '');
    for (const error of data.decisionErrors) lines.push(`- ${sanitize(error)}`);
    lines.push('');
  }
  if (data.decisions.length > 0) {
    lines.push('| File | Decision | Why | Cases |', '|---|---|---|---|');
    for (const entry of data.decisions) {
      const decision = entry.decision === 'skip' ? `skip (${entry.reason})` : entry.decision;
      lines.push(`| \`${entry.file}\` | ${decision} | ${sanitize(entry.rationale)} | ${entry.cases.length} |`);
    }
    lines.push('');
  }
  const failed = data.gates.filter((gate) => gate.status === 'fail');
  if (data.gates.length > 0) {
    lines.push('| Gate | Result |', '|---|---|');
    for (const gate of data.gates) lines.push(`| ${gate.id} ${gate.name} | ${ICON[gate.status]} |`);
    lines.push('');
  }
  for (const gate of failed) {
    lines.push(`**${gate.id} failed:**`, '');
    for (const detail of gate.details.slice(0, 20)) lines.push(`- ${sanitize(detail)}`);
    lines.push('');
  }
  if (data.authorFailures.length > 0) {
    lines.push('**Existing tests fail without the agent changes.** Regression or intended change, a human decides:', '');
    for (const name of data.authorFailures) lines.push(`- ${sanitize(name)}`);
    lines.push('');
  }
  const rejected = data.decisions.flatMap((entry) => entry.rejected.map((item) => `\`${entry.file}\`: ${sanitize(item.case)}: ${sanitize(item.reason)}`));
  if (rejected.length > 0) {
    lines.push('**Tests the agent dropped after three failed attempts:**', '');
    for (const item of rejected) lines.push(`- ${item}`);
    lines.push('');
  }
  if (data.coverage.length > 0) {
    lines.push('| Line coverage | Before | After |', '|---|---|---|');
    for (const row of data.coverage) lines.push(`| ${row.area} | ${percent(row.before)} | ${percent(row.after)} |`);
    lines.push('');
  }
  if (data.mutation && data.mutation.rows.length > 0) {
    lines.push('| Mutation score (changed files) | Before | After |', '|---|---|---|');
    for (const row of data.mutation.rows) {
      lines.push(`| \`${row.file}\` | ${percent(row.scoreBefore)} (${row.before.detected}/${row.before.valid}) | ${percent(row.scoreAfter)} (${row.after.detected}/${row.after.valid}) |`);
    }
    lines.push('');
  } else if (data.mutation?.reason) {
    lines.push(`Mutation score not measured: ${sanitize(data.mutation.reason).replace(/\.$/, '')}. G7 used line coverage only.`, '');
  }
  if (data.codeDecisions.length > 0) {
    lines.push('<details><summary>Skipped before the model (filter, deleted, over budget)</summary>', '');
    for (const item of data.codeDecisions) lines.push(`- \`${item.file}\`: ${item.reason}, ${item.detail}`);
    lines.push('', '</details>', '');
  }
  if (data.runUrl) lines.push(`[Workflow run](${data.runUrl})`);
  return lines.join('\n').trimEnd() + '\n';
}
