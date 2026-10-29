import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { git, worktreePatch } from '../src/cli/shared.ts';
import { parsePatch } from '../src/patch.ts';

function repo(): { root: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), 'worktree-patch-'));
  const run = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  run('init', '-q');
  run('config', 'user.email', 'test@example.com');
  run('config', 'user.name', 'Test');
  mkdirSync(join(root, 'backend/tests'), { recursive: true });
  writeFileSync(join(root, 'backend/tests/a.test.ts'), "it('a', () => {});\n");
  run('add', '.');
  run('commit', '-q', '-m', 'base');
  return { root, head: git(root, 'rev-parse', 'HEAD').trim() };
}

describe('worktreePatch', () => {
  it('includes committed, uncommitted and untracked changes since the PR head', () => {
    const { root, head } = repo();
    writeFileSync(join(root, 'backend/tests/a.test.ts'), "it('a', () => {});\nit('b', () => {});\n");
    git(root, 'commit', '-q', '-am', 'agent commit');
    writeFileSync(join(root, 'backend/tests/new.test.ts'), "it('c', () => {});\n");

    const diffs = parsePatch(worktreePatch(root, head));

    expect(diffs.map((d) => [d.path, d.isNew, d.added])).toEqual([
      ['backend/tests/a.test.ts', false, ["it('b', () => {});"]],
      ['backend/tests/new.test.ts', true, ["it('c', () => {});"]],
    ]);
  });

  it('ignores the .claude/ removal gh-aw stages before the agent starts', () => {
    const { root } = repo();
    mkdirSync(join(root, '.claude'));
    writeFileSync(join(root, '.claude/settings.json'), '{}\n');
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'claude config');
    const head = git(root, 'rev-parse', 'HEAD').trim();
    git(root, 'rm', '-q', '-r', '.claude');

    expect(worktreePatch(root, head)).toBe('');
  });

  it('is empty when nothing changed', () => {
    const { root, head } = repo();

    expect(worktreePatch(root, head)).toBe('');
  });
});
