import { describe, expect, it } from 'vitest';
import type { ChangedFile } from '../src/changes.ts';
import { validateDecisions } from '../src/decisions.ts';
import { buildInput } from '../src/input.ts';

const source = (path: string, testExists: boolean): ChangedFile => ({
  path,
  status: 'modified',
  kind: 'source',
  area: 'backend',
  testPath: `backend/tests/${path.split('/').pop()!.replace('.ts', '')}.test.ts`,
  testExists,
});

describe('buildInput', () => {
  const changed: ChangedFile[] = [
    source('backend/src/a.ts', false),
    source('backend/src/b.ts', true),
    source('backend/src/c.ts', false),
    { path: 'README.md', status: 'modified', kind: 'filtered', filterReason: 'outside application source' },
    { path: 'backend/src/gone.ts', status: 'deleted', kind: 'deleted' },
  ];
  const lines = new Map([
    ['backend/src/a.ts', [1, 2]],
    ['backend/src/b.ts', [1, 2, 3]],
    ['backend/src/c.ts', [1]],
  ]);
  const coverage = new Map([
    ['backend/src/a.ts', new Map([[1, 0], [2, 0]])],
    ['backend/src/b.ts', new Map([[1, 1], [2, 0], [3, 1]])],
  ]);

  it('ranks source files by uncovered changed lines, breaks ties by path and records code decisions', () => {
    const input = buildInput('pr', changed, lines, coverage, 2);
    expect(input.files.map((file) => [file.path, file.uncoveredChangedLines])).toEqual([
      ['backend/src/a.ts', [1, 2]],
      ['backend/src/b.ts', [2]],
    ]);
    expect(input.codeDecisions).toEqual([
      { file: 'README.md', reason: 'filtered', detail: 'outside application source' },
      { file: 'backend/src/gone.ts', reason: 'deleted', detail: 'file deleted in this change' },
      { file: 'backend/src/c.ts', reason: 'budget', detail: 'over the limit of 2 files per run' },
    ]);
  });
});

describe('validateDecisions', () => {
  const input = buildInput(
    'pr',
    [source('backend/src/a.ts', false), source('backend/src/b.ts', true)],
    new Map([['backend/src/a.ts', [1]], ['backend/src/b.ts', [4]]]),
    new Map([['backend/src/a.ts', new Map([[1, 0]])], ['backend/src/b.ts', new Map([[4, 3]])]]),
    10,
  );
  const create = { file: 'backend/src/a.ts', decision: 'create', rationale: 'new branch', testFile: 'backend/tests/a.test.ts', cases: ['returns 404 for a missing task'], categories: ['happy-path'] };
  const covered = { file: 'backend/src/b.ts', decision: 'skip', reason: 'already-covered', rationale: 'existing tests assert it' };

  it('accepts decisions that follow the rules', () => {
    const result = validateDecisions({ mode: 'pr', files: [create, covered] }, input);
    expect(result.ok).toBe(true);
  });

  it('rejects a schema violation such as an unknown skip reason', () => {
    const result = validateDecisions({ mode: 'pr', files: [create, { ...covered, reason: 'budget' }] }, input);
    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.errors[0]).toContain('files.1.reason');
  });

  it('reports every rule a decision breaks', () => {
    const result = validateDecisions(
      {
        mode: 'backfill',
        files: [
          { ...create, decision: 'update', testFile: 'backend/tests/other.test.ts', cases: [] },
          { file: 'backend/src/unknown.ts', decision: 'skip', reason: 'wiring', rationale: 'composition only' },
        ],
      },
      input,
    );
    expect(result.ok === false && result.errors).toEqual([
      'mode is backfill, expected pr',
      'backend/src/a.ts: backend/tests/a.test.ts does not exist, use create or skip',
      'backend/src/a.ts: testFile must be backend/tests/a.test.ts',
      'backend/src/a.ts: update needs at least one case',
      'backend/src/unknown.ts: not in the agent input',
      'backend/src/b.ts: missing decision',
    ]);
  });

  it('forbids already-covered while changed lines are uncovered', () => {
    const result = validateDecisions({ mode: 'pr', files: [{ ...covered, file: 'backend/src/a.ts' }, covered] }, input);
    expect(result.ok === false && result.errors).toEqual(['backend/src/a.ts: already-covered is not allowed while changed lines 1 are uncovered']);
  });

  it('forbids create when the test file exists and a reason on non-skip decisions', () => {
    const result = validateDecisions(
      { mode: 'pr', files: [create, { ...covered, decision: 'create', testFile: 'backend/tests/b.test.ts', cases: ['x'] }] },
      input,
    );
    expect(result.ok === false && result.errors).toEqual([
      'backend/src/b.ts: only skip takes a reason',
      'backend/src/b.ts: backend/tests/b.test.ts exists, use update or skip',
    ]);
  });
});
