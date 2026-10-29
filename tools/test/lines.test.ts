import { describe, expect, it } from 'vitest';
import { allUncovered, coveredCount, mergeCoverage, parseLcov, parseUnifiedDiff, uncoveredLines } from '../src/lines.ts';

describe('parseUnifiedDiff', () => {
  it('collects added line numbers per file from a zero-context diff', () => {
    const diff = [
      'diff --git a/backend/src/a.ts b/backend/src/a.ts',
      '--- a/backend/src/a.ts',
      '+++ b/backend/src/a.ts',
      '@@ -3,0 +4,2 @@ export function a() {',
      '+  one',
      '+  two',
      '@@ -10 +12 @@',
      '-old',
      '+new',
      '@@ -20,3 +23,0 @@',
      'diff --git a/frontend/src/gone.ts b/frontend/src/gone.ts',
      '--- a/frontend/src/gone.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
    ].join('\n');
    expect(parseUnifiedDiff(diff)).toEqual(new Map([['backend/src/a.ts', [4, 5, 12]]]));
  });
});

describe('parseLcov', () => {
  it('prefixes relative paths with the project directory', () => {
    const lcov = 'TN:\nSF:src/api/health.ts\nDA:5,0\nDA:6,3\nend_of_record\nSF:src/factory.ts\nDA:1,1\nend_of_record\n';
    const coverage = parseLcov(lcov, 'backend');
    expect([...coverage.keys()]).toEqual(['backend/src/api/health.ts', 'backend/src/factory.ts']);
    expect(coverage.get('backend/src/api/health.ts')).toEqual(new Map([[5, 0], [6, 3]]));
  });

  it('cuts absolute runner paths down to the repository path', () => {
    const coverage = parseLcov('SF:/home/runner/work/repo/repo/frontend/src/lib/http.ts\nDA:2,1\nend_of_record\n', 'frontend');
    expect([...coverage.keys()]).toEqual(['frontend/src/lib/http.ts']);
  });
});

describe('uncoveredLines', () => {
  const hits = new Map([[4, 0], [5, 2], [12, 0]]);

  it('keeps executable changed lines that no test ran and ignores non-executable lines', () => {
    expect(uncoveredLines([4, 5, 7, 12], hits)).toEqual([4, 12]);
  });

  it('treats every changed line as uncovered when the file is missing from coverage', () => {
    expect(uncoveredLines([1, 2], undefined)).toEqual([1, 2]);
  });
});

describe('coverage helpers', () => {
  it('lists all uncovered lines and counts covered ones', () => {
    const hits = new Map([[1, 0], [2, 1], [3, 4]]);
    expect(allUncovered(hits)).toEqual([1]);
    expect(coveredCount(hits)).toBe(2);
    expect(coveredCount(undefined)).toBe(0);
  });

  it('merges backend and frontend coverage', () => {
    const merged = mergeCoverage(new Map([['backend/a.ts', new Map()]]), new Map([['frontend/b.ts', new Map()]]));
    expect([...merged.keys()]).toEqual(['backend/a.ts', 'frontend/b.ts']);
  });
});
