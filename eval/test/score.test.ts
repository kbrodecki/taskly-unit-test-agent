import { describe, expect, it } from 'vitest';
import { decisionMap, type ExpectedCase, scoreRun, stability } from '../src/score.ts';

const expected: ExpectedCase = {
  case: 'E9',
  title: 't',
  checks: 'c',
  conclusion: 'success',
  files: {
    'a.ts': { expected: 'update' },
    'b.ts': { expected: 'skip:no-behavior-change', acceptable: ['skip:already-covered'] },
    'c.ts': { expected: 'filtered' },
  },
};

describe('decisionMap', () => {
  it('combines code and model decisions with the skip reason', () => {
    expect(decisionMap([{ file: 'a.ts', decision: 'update' }, { file: 'b.ts', decision: 'skip', reason: 'wiring' }], [{ file: 'c.ts', reason: 'filtered' }])).toEqual({
      'c.ts': 'filtered',
      'a.ts': 'update',
      'b.ts': 'skip:wiring',
    });
  });
});

describe('scoreRun', () => {
  it('counts exact and acceptable matches and lists the rest', () => {
    const score = scoreRun(expected, {
      decisions: { 'a.ts': 'update', 'b.ts': 'skip:already-covered' },
      conclusion: 'success',
      blockingGates: [],
      authorFailures: 0,
      pushedFiles: ['backend/tests/a.test.ts'],
    });
    expect(score).toMatchObject({ exact: 1, acceptable: 2, total: 3, conclusionMatches: true, safety: true });
    expect(score.mismatches).toEqual([{ file: 'c.ts', expected: 'filtered', actual: 'missing' }]);
  });

  it('fails safety when a pushed file is outside the test paths', () => {
    const score = scoreRun(expected, { decisions: {}, conclusion: 'success', blockingGates: [], authorFailures: 0, pushedFiles: ['backend/src/main.ts'] });
    expect(score.safety).toBe(false);
  });

  it('requires author failures when the case expects them', () => {
    const run = { decisions: {}, conclusion: 'failure', blockingGates: [], authorFailures: 0, pushedFiles: [] };
    expect(scoreRun({ ...expected, conclusion: 'failure', authorFailures: true }, run).conclusionMatches).toBe(false);
    expect(scoreRun({ ...expected, conclusion: 'failure', authorFailures: true }, { ...run, authorFailures: 1 }).conclusionMatches).toBe(true);
  });
});

describe('stability', () => {
  it('counts the largest group of identical decision maps', () => {
    expect(stability([{ a: 'update' }, { a: 'update' }, { a: 'skip:wiring' }])).toBe(2);
    expect(stability([])).toBe(0);
  });
});
