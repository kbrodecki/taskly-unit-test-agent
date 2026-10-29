import { describe, expect, it } from 'vitest';
import type { DecisionEntry } from '../src/decisions.ts';
import { conclusion, MARKER, type ReportData, renderReport, sanitize } from '../src/report.ts';

const created: DecisionEntry = {
  file: 'backend/src/factory.ts',
  decision: 'create',
  rationale: 'No tests cover app wiring',
  testFile: 'backend/tests/factory.test.ts',
  cases: ['serves health', 'mounts todos'],
  categories: ['happy-path'],
  rejected: [],
};

const base: ReportData = {
  mode: 'pr',
  decisions: [created],
  decisionErrors: [],
  codeDecisions: [{ file: 'README.md', reason: 'filtered', detail: 'outside application source' }],
  gates: [{ id: 'G1', name: 'Only test files and test fixtures changed', status: 'pass', details: [] }],
  authorFailures: [],
  coverage: [{ area: 'backend', before: 33.02, after: 61.5 }],
  runUrl: 'https://github.com/o/r/actions/runs/1',
};

describe('sanitize', () => {
  it('removes html, links and table breakers, defuses mentions and truncates', () => {
    expect(sanitize('<img src=x> see [docs](https://evil.example) or https://x.y/z ping @octocat | `rm`')).toBe(
      "see docs or [link removed] ping @​octocat ' 'rm'",
    );
    expect(sanitize('a'.repeat(400))).toHaveLength(300);
  });
});

describe('conclusion', () => {
  it('is success when tests were added and nothing failed', () => {
    expect(conclusion(base)).toBe('success');
  });

  it('is neutral when every decision is a skip', () => {
    expect(conclusion({ ...base, decisions: [{ ...created, decision: 'skip', reason: 'wiring' }] })).toBe('neutral');
    expect(conclusion({ ...base, decisions: [] })).toBe('neutral');
  });

  it('is failure on a contract error, a failed gate or failing author tests', () => {
    expect(conclusion({ ...base, decisionErrors: ['x'] })).toBe('failure');
    expect(conclusion({ ...base, gates: [{ ...base.gates[0], status: 'fail', details: ['y'] }] })).toBe('failure');
    expect(conclusion({ ...base, authorFailures: ['router > lists tasks'] })).toBe('failure');
  });
});

describe('renderReport', () => {
  it('renders the marker, decisions, gates, coverage, code decisions and run link', () => {
    expect(renderReport(base)).toBe(
      [
        MARKER,
        '### Unit test agent: ✅ Tests added and every gate passed',
        '',
        '| File | Decision | Why | Cases |',
        '|---|---|---|---|',
        '| `backend/src/factory.ts` | create | No tests cover app wiring | 2 |',
        '',
        '| Gate | Result |',
        '|---|---|',
        '| G1 Only test files and test fixtures changed | ✅ |',
        '',
        '| Line coverage | Before | After |',
        '|---|---|---|',
        '| backend | 33.0% | 61.5% |',
        '',
        '<details><summary>Skipped before the model (filter, deleted, over budget)</summary>',
        '',
        '- `README.md`: filtered, outside application source',
        '',
        '</details>',
        '',
        '[Workflow run](https://github.com/o/r/actions/runs/1)',
        '',
      ].join('\n'),
    );
  });

  it('lists failed gate details, author failures and dropped tests', () => {
    const report = renderReport({
      ...base,
      decisions: [{ ...created, rejected: [{ case: 'flaky timer', reason: 'failed 2 of 5 reruns' }] }],
      gates: [{ id: 'G2', name: 'Changes to existing tests are additive only', status: 'fail', details: ['router.test.ts: existing line removed'] }],
      authorFailures: ['router > lists tasks'],
      codeDecisions: [],
      runUrl: undefined,
    });
    expect(report).toContain('### Unit test agent: ❌ Blocked, see below');
    expect(report).toContain('**G2 failed:**\n\n- router.test.ts: existing line removed');
    expect(report).toContain('Regression or intended change, a human decides:\n\n- router > lists tasks');
    expect(report).toContain('- `backend/src/factory.ts`: flaky timer: failed 2 of 5 reruns');
    expect(report).not.toContain('Workflow run');
  });

  it('explains a broken decision contract', () => {
    expect(renderReport({ ...base, decisions: [], decisionErrors: ['backend/src/a.ts: missing decision'] })).toContain(
      '**The agent output broke the decision contract, so nothing was pushed:**\n\n- backend/src/a.ts: missing decision',
    );
  });
});
