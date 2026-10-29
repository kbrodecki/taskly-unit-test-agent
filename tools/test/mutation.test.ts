import { describe, expect, it } from 'vitest';
import { compareMutation, mutationScore, parseMutationReport } from '../src/mutation.ts';

const report = {
  files: {
    'src/features/todos/router.ts': {
      mutants: ['Killed', 'Killed', 'Timeout', 'Survived', 'NoCoverage', 'CompileError', 'Ignored'].map((status) => ({ status })),
    },
  },
};

describe('parseMutationReport', () => {
  it('counts killed and timed out mutants as detected and leaves out invalid ones, keyed by repo path', () => {
    expect(parseMutationReport(report, 'backend')).toEqual(
      new Map([['backend/src/features/todos/router.ts', { detected: 3, survived: 1, noCoverage: 1, valid: 5 }]]),
    );
  });
});

describe('mutationScore', () => {
  it('is the share of valid mutants detected', () => {
    expect(mutationScore({ detected: 3, survived: 1, noCoverage: 1, valid: 5 })).toBe(60);
  });
});

describe('compareMutation', () => {
  const counts = (detected: number, valid = 5) => ({ detected, survived: valid - detected, noCoverage: 0, valid });
  const file = 'backend/src/a.ts';

  it('pairs the runs file by file', () => {
    const result = compareMutation({ counts: new Map([[file, counts(2)]]) }, { counts: new Map([[file, counts(4)]]) });
    expect(result).toEqual({ rows: [{ file, before: counts(2), after: counts(4) }] });
  });

  it('passes on the reason when a run did not finish', () => {
    expect(compareMutation({ reason: 'backend: There were failed tests in the initial test run.' }, { counts: new Map() })).toEqual({
      rows: [],
      reason: 'backend: There were failed tests in the initial test run.',
    });
  });

  it('drops both runs when the mutant count differs', () => {
    const result = compareMutation({ counts: new Map([[file, counts(2)]]) }, { counts: new Map([[file, counts(2, 6)]]) });
    expect(result.rows).toEqual([]);
    expect(result.reason).toContain('runs not comparable');
  });
});
