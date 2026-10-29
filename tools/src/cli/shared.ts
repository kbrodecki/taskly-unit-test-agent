import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Coverage, mergeCoverage, parseLcov } from '../lines.ts';
import { failedTests } from '../vitest-results.ts';

export const APPS = ['backend', 'frontend'] as const;

export function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

export function worktreePatch(root: string, base: string): string {
  const untracked = git(root, 'ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
  if (untracked.length > 0) git(root, 'add', '--intent-to-add', '--', ...untracked);
  // gh-aw removes .claude/ from the agent workspace before the agent starts; that deletion is not the agent's change.
  return git(root, 'diff', '--no-color', '-M', base, '--', '.', ':(exclude).claude');
}

export function arg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? fallback : process.argv[index + 1];
  if (value === undefined) throw new Error(`Missing --${name}`);
  return value;
}

export interface SuiteRun {
  failed: string[];
  coverage: Coverage;
  ok: boolean;
}

export function runSuite(root: string, app: string, outDir: string, label: string, extra: string[] = []): SuiteRun {
  const resultFile = join(outDir, `${label}-${app}.json`);
  const args = ['vitest', 'run', '--coverage', '--reporter=json', `--outputFile=${resultFile}`, ...extra];
  const run = spawnSync('npx', args, { cwd: join(root, app), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const json = existsSync(resultFile) ? JSON.parse(readFileSync(resultFile, 'utf8')) : { testResults: [] };
  const lcovFile = join(root, app, 'coverage', 'lcov.info');
  const coverage = existsSync(lcovFile) ? parseLcov(readFileSync(lcovFile, 'utf8'), app) : new Map();
  return { failed: failedTests(json, join(root, app)), coverage, ok: run.status === 0 };
}

export function runAll(root: string, outDir: string, label: string): SuiteRun {
  const runs = APPS.map((app) => runSuite(root, app, outDir, label));
  return {
    failed: runs.flatMap((run, i) => run.failed.map((name) => `${APPS[i]}/${name}`)),
    coverage: mergeCoverage(...runs.map((run) => run.coverage)),
    ok: runs.every((run) => run.ok),
  };
}

export function serializeCoverage(coverage: Coverage): Record<string, Array<[number, number]>> {
  return Object.fromEntries([...coverage].map(([path, hits]) => [path, [...hits]]));
}

export function deserializeCoverage(data: Record<string, Array<[number, number]>>): Coverage {
  return new Map(Object.entries(data).map(([path, hits]) => [path, new Map(hits)]));
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}
