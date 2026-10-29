import { describe, expect, it } from 'vitest';
import { failedTests, linePercent, NO_RESULTS } from '../src/vitest-results.ts';

describe('failedTests', () => {
  it('lists failed tests as file and full name relative to the project', () => {
    const json = {
      testResults: [
        { name: '/repo/backend/tests/router.test.ts', assertionResults: [{ fullName: 'lists tasks', status: 'passed' }, { fullName: 'rejects bad id', status: 'failed' }] },
        { name: '/repo/backend/tests/mappers.test.ts', assertionResults: [{ fullName: 'maps dates', status: 'failed' }] },
      ],
    };
    expect(failedTests(json, '/repo/backend')).toEqual(['tests/router.test.ts > rejects bad id', 'tests/mappers.test.ts > maps dates']);
  });
});

describe('failedTests when a suite does not run', () => {
  it('reports a file that failed to load as a failure', () => {
    const json = { testResults: [{ name: '/repo/backend/tests/a.test.ts', status: 'failed', assertionResults: [] }] };
    expect(failedTests(json, '/repo/backend')).toEqual(['tests/a.test.ts > (file failed to run)']);
  });

  it('reports a run without results as a failure', () => {
    expect(failedTests({ testResults: [] }, '/repo/backend')).toEqual([NO_RESULTS]);
  });
});

describe('linePercent', () => {
  it('computes covered executable lines for one area', () => {
    const coverage = new Map([
      ['backend/src/a.ts', new Map([[1, 1], [2, 0]])],
      ['backend/src/b.ts', new Map([[1, 3], [2, 2]])],
      ['frontend/src/c.ts', new Map([[1, 0]])],
    ]);
    expect(linePercent(coverage, 'backend/')).toBe(75);
    expect(linePercent(coverage, 'frontend/')).toBe(0);
    expect(linePercent(new Map(), 'backend/')).toBe(0);
  });
});
