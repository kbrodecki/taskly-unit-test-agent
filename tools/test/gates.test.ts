import { describe, expect, it } from 'vitest';
import { checkAssertions, checkPaths, checkPromised, checkValue, compareFailures, guardDiff, lintTests, newTests } from '../src/gates.ts';
import { parsePatch } from '../src/patch.ts';
import { findTests } from '../src/test-ast.ts';

const diff = (path: string, added: string[], removed: string[] = [], isNew = false) => ({ path, isNew, isDeleted: false, added, removed });

describe('parsePatch', () => {
  it('reads new, modified and deleted files with their added and removed lines', () => {
    const patch = [
      'diff --git a/backend/tests/a.test.ts b/backend/tests/a.test.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/backend/tests/a.test.ts',
      '@@ -0,0 +1,2 @@',
      "+import { it } from 'vitest';",
      "+it('works', () => {});",
      'diff --git a/frontend/src/x.test.ts b/frontend/src/x.test.ts',
      '--- a/frontend/src/x.test.ts',
      '+++ b/frontend/src/x.test.ts',
      '@@ -1 +1 @@',
      '-old line',
      '+new line',
      'diff --git a/backend/tests/old.test.ts b/backend/tests/old.test.ts',
      'deleted file mode 100644',
      '--- a/backend/tests/old.test.ts',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-gone',
    ].join('\n');
    expect(parsePatch(patch)).toEqual([
      { path: 'backend/tests/a.test.ts', isNew: true, isDeleted: false, added: ["import { it } from 'vitest';", "it('works', () => {});"], removed: [] },
      { path: 'frontend/src/x.test.ts', isNew: false, isDeleted: false, added: ['new line'], removed: ['old line'] },
      { path: 'backend/tests/old.test.ts', isNew: false, isDeleted: true, added: [], removed: ['gone'] },
    ]);
  });
});

describe('parsePatch with git format-patch output', () => {
  it('ignores the mail header and the signature footer', () => {
    const patch = [
      'From 1234 Mon Sep 17 00:00:00 2001',
      'Subject: [PATCH] agent tests',
      '---',
      ' backend/tests/a.test.ts | 1 +',
      'diff --git a/backend/tests/a.test.ts b/backend/tests/a.test.ts',
      '--- a/backend/tests/a.test.ts',
      '+++ b/backend/tests/a.test.ts',
      '@@ -1 +1,2 @@',
      ' kept',
      '+added',
      '-- ',
      '2.50.0',
    ].join('\n');
    expect(parsePatch(patch)).toEqual([{ path: 'backend/tests/a.test.ts', isNew: false, isDeleted: false, added: ['added'], removed: [] }]);
  });
});

describe('G1 checkPaths', () => {
  it('passes tests and fixtures and fails anything else', () => {
    const result = checkPaths([diff('backend/tests/router.test.ts', []), diff('frontend/src/test/todoFixture.ts', []), diff('backend/src/api/health.ts', []), diff('.github/workflows/ci.yml', [])]);
    expect(result).toEqual({
      id: 'G1',
      name: 'Only test files and test fixtures changed',
      status: 'fail',
      details: ['backend/src/api/health.ts is outside the allowed paths', '.github/workflows/ci.yml is outside the allowed paths'],
    });
  });
});

describe('G2 guardDiff', () => {
  it('leaves files outside the test paths to G1', () => {
    expect(guardDiff([diff('backend/src/api/health.ts', ['x'], ['y'])]).status).toBe('pass');
  });

  it('allows new files, added lines, changed imports and a trailing comma added to a fixture line', () => {
    const result = guardDiff([
      diff('backend/tests/new.test.ts', ["it('x', () => { expect(1).toBe(1); });"], [], true),
      diff('frontend/src/test/todoFixture.ts', ["  priority: 'high',", "  due_date: null,"], ["  priority: 'high'"]),
      diff('backend/tests/router.test.ts', ["import { it, expect, vi } from 'vitest';"], ["import { it, expect } from 'vitest';"]),
    ]);
    expect(result.status).toBe('pass');
  });

  it('fails removed or changed assertions, skipped or focused tests, suppressions and deleted test files', () => {
    const result = guardDiff([
      diff('backend/tests/router.test.ts', ['  expect(response.status).toBe(500);', "it.skip('later', () => {});", '// @ts-expect-error', "fit('focus', () => {});"], ['  expect(response.status).toBe(200);']),
      { path: 'backend/tests/old.test.ts', isNew: false, isDeleted: true, added: [], removed: ['x'] },
    ]);
    expect(result.details).toEqual([
      "backend/tests/router.test.ts: skipped, focused, todo or expected-to-fail test: it.skip('later', () => {});",
      'backend/tests/router.test.ts: type check suppression: // @ts-expect-error',
      "backend/tests/router.test.ts: skipped or focused test: fit('focus', () => {});",
      'backend/tests/router.test.ts: existing line removed or changed: expect(response.status).toBe(200);',
      'backend/tests/old.test.ts: deleting a test file is not allowed',
    ]);
  });
});

describe('findTests and newTests', () => {
  const before = "it('lists tasks', () => { expect(list()).toEqual([]); });";
  const after = `${before}
describe('create', () => {
  it('rejects an empty title', async () => {
    await expect(create('')).rejects.toThrow('title');
  });
  it.each([1, 2])('handles %s', (n) => { expect(n).not.toBe(0); });
  test('no assertion', () => { render(); });
  it('dangling expect', () => { expect(value); });
});`;

  it('finds tests with their matchers, including each and negated or rejected chains', () => {
    expect(findTests(after, 'x.test.ts')).toEqual([
      { name: 'lists tasks', expects: [{ subject: 'list()', matcher: 'toEqual' }] },
      { name: 'rejects an empty title', expects: [{ subject: "create('')", matcher: 'toThrow' }] },
      { name: 'handles %s', expects: [{ subject: 'n', matcher: 'toBe' }] },
      { name: 'no assertion', expects: [] },
      { name: 'dangling expect', expects: [{ subject: 'value', matcher: undefined }] },
    ]);
  });

  it('returns only tests whose names are new', () => {
    expect(newTests(before, after, 'x.test.ts').map((test) => test.name)).toEqual(['rejects an empty title', 'handles %s', 'no assertion', 'dangling expect']);
  });

  it('G3 flags tests without expect and expect without a matcher', () => {
    expect(lintTests([{ path: 'x.test.ts', tests: newTests(before, after, 'x.test.ts') }]).details).toEqual([
      'x.test.ts: "no assertion" has no expect',
      'x.test.ts: "dangling expect" calls expect without a matcher',
    ]);
  });
});

describe('G6 checkAssertions', () => {
  it('fails tests that only check existence, truthiness or an HTTP status', () => {
    const code = `
it('trivial', () => { expect(result).toBeDefined(); expect(ok).toBeTruthy(); });
it('status only', async () => { const response = await request(app).get('/'); expect(response.status).toBe(200); });
it('real', async () => { const response = await request(app).get('/'); expect(response.status).toBe(200); expect(response.body).toEqual([todo]); });`;
    expect(checkAssertions([{ path: 'r.test.ts', tests: findTests(code, 'r.test.ts') }]).details).toEqual([
      'r.test.ts: "trivial" only checks existence, truthiness or an HTTP status',
      'r.test.ts: "status only" only checks existence, truthiness or an HTTP status',
    ]);
  });
});

describe('compareFailures', () => {
  it('separates new failures from failures that already existed without the patch', () => {
    expect(compareFailures(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], existing: ['b'] });
  });
});

describe('G7 checkValue', () => {
  it('fails files with uncovered lines whose covered line count did not grow', () => {
    const before = new Map([['backend/src/a.ts', new Map([[1, 0], [2, 1]])], ['backend/src/b.ts', new Map([[1, 0], [2, 1]])]]);
    const after = new Map([['backend/src/a.ts', new Map([[1, 3], [2, 1]])], ['backend/src/b.ts', new Map([[1, 0], [2, 4]])]]);
    expect(checkValue(['backend/src/a.ts', 'backend/src/b.ts'], before, after).details).toEqual([
      'backend/src/b.ts: covered lines did not grow (1 before, 1 after)',
    ]);
  });

  it('passes a file that was already fully covered', () => {
    const before = new Map([['backend/src/c.ts', new Map([[1, 2]])]]);
    expect(checkValue(['backend/src/c.ts'], before, before).status).toBe('pass');
  });

  it('passes a file whose coverage did not grow when the new tests detect more mutants', () => {
    const coverage = new Map([['backend/src/a.ts', new Map([[1, 0], [2, 1]])], ['backend/src/b.ts', new Map([[1, 0], [2, 1]])]]);
    const counts = (detected: number) => ({ detected, survived: 10 - detected, noCoverage: 0, valid: 10 });
    const mutation = [
      { file: 'backend/src/a.ts', before: counts(4), after: counts(6) },
      { file: 'backend/src/b.ts', before: counts(4), after: counts(4) },
    ];
    const result = checkValue(['backend/src/a.ts', 'backend/src/b.ts'], coverage, coverage, mutation);
    expect(result.name).toBe('Each create or update covers more lines or detects more mutants');
    expect(result.details).toEqual(['backend/src/b.ts: covered lines did not grow (1 before, 1 after) and no more mutants detected']);
  });
});

describe('checkPromised', () => {
  it('blocks a create or update whose test file is not in the change', () => {
    const decisions = [
      { file: 'backend/src/a.ts', decision: 'update', testFile: 'backend/tests/a.test.ts' },
      { file: 'backend/src/b.ts', decision: 'create', testFile: 'backend/tests/b.test.ts' },
      { file: 'backend/src/c.ts', decision: 'skip' },
    ];
    const result = checkPromised(decisions, [diff('backend/tests/a.test.ts', ['x'])]);
    expect(result.status).toBe('fail');
    expect(result.details).toEqual(['backend/src/b.ts: create promised backend/tests/b.test.ts, which the change does not contain']);
  });

  it('passes when nothing is promised and nothing changed', () => {
    expect(checkPromised([{ file: 'backend/src/c.ts', decision: 'skip' }], []).status).toBe('pass');
  });
});
