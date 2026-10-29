import { describe, expect, it } from 'vitest';
import { classify, parseNameStatus, testPathFor } from '../src/changes.ts';

const none = () => false;

describe('parseNameStatus', () => {
  it('reads added, modified, deleted and renamed entries', () => {
    const text = 'A\tbackend/src/a.ts\nM\tfrontend/src/b.tsx\nD\tbackend/src/c.ts\nR087\tfrontend/src/old.ts\tfrontend/src/new.ts\n';
    expect(parseNameStatus(text)).toEqual([
      { path: 'backend/src/a.ts', status: 'added' },
      { path: 'frontend/src/b.tsx', status: 'modified' },
      { path: 'backend/src/c.ts', status: 'deleted' },
      { path: 'frontend/src/new.ts', status: 'renamed', oldPath: 'frontend/src/old.ts' },
    ]);
  });

  it('rejects an unknown status code', () => {
    expect(() => parseNameStatus('X\tfile.ts')).toThrow('Unknown git status line');
  });
});

describe('testPathFor', () => {
  it('maps backend modules to backend/tests by module name', () => {
    expect(testPathFor('backend/src/features/todos/router.ts', 'backend')).toBe('backend/tests/router.test.ts');
  });

  it('keeps frontend tests next to the file with the same extension', () => {
    expect(testPathFor('frontend/src/features/todos/components/TodoForm.tsx', 'frontend')).toBe('frontend/src/features/todos/components/TodoForm.test.tsx');
    expect(testPathFor('frontend/src/lib/http.ts', 'frontend')).toBe('frontend/src/lib/http.test.ts');
  });
});

describe('classify', () => {
  it.each([
    ['frontend/src/App.test.tsx', 'test file'],
    ['backend/tests/fixture.ts', 'test support'],
    ['frontend/src/features/todos/types.ts', 'types only'],
    ['frontend/src/features/todos/index.ts', 'barrel file'],
    ['frontend/src/styles.css', 'styles'],
    ['frontend/src/design-system/components/Button/Button.tsx', 'design system, outside coverage'],
    ['backend/src/generated/prisma/client.ts', 'generated code'],
    ['README.md', 'outside application source'],
    ['backend/package.json', 'outside application source'],
  ])('filters %s as %s', (path, reason) => {
    expect(classify({ path, status: 'modified' }, none)).toMatchObject({ kind: 'filtered', filterReason: reason });
  });

  it('marks deleted files without looking for tests', () => {
    expect(classify({ path: 'backend/src/api/health.ts', status: 'deleted' }, none)).toEqual({ path: 'backend/src/api/health.ts', status: 'deleted', kind: 'deleted' });
  });

  it('maps a source file to its test and checks whether the test exists', () => {
    const exists = (path: string) => path === 'backend/tests/router.test.ts';
    expect(classify({ path: 'backend/src/features/todos/router.ts', status: 'modified' }, exists)).toEqual({
      path: 'backend/src/features/todos/router.ts',
      status: 'modified',
      kind: 'source',
      area: 'backend',
      testPath: 'backend/tests/router.test.ts',
      testExists: true,
    });
  });

  it('uses the new path of a renamed file', () => {
    const result = classify({ path: 'frontend/src/lib/fetcher.ts', status: 'renamed', oldPath: 'frontend/src/lib/http.ts' }, none);
    expect(result).toMatchObject({ kind: 'source', testPath: 'frontend/src/lib/fetcher.test.ts', testExists: false, oldPath: 'frontend/src/lib/http.ts' });
  });
});
