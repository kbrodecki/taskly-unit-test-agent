import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Coverage, mergeCoverage, parseLcov } from '../lines.ts';
import { type Mutation, type MutationRun, parseMutationReport, strykerConfig } from '../mutation.ts';
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
}

// One Vitest run with the JSON reporter; returns failing tests prefixed with the app. A run that wrote
// no results counts as one failure (NO_RESULTS), so a crashed suite never passes.
export function runVitest(root: string, app: string, resultFile: string, args: string[]): string[] {
  spawnSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${resultFile}`, ...args], { cwd: join(root, app), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const json = existsSync(resultFile) ? JSON.parse(readFileSync(resultFile, 'utf8')) : { testResults: [] };
  return failedTests(json, join(root, app)).map((name) => `${app}/${name}`);
}

export function runAll(root: string, outDir: string, label: string): SuiteRun {
  const failed = APPS.flatMap((app) => runVitest(root, app, join(outDir, `${label}-${app}.json`), ['--coverage', '--coverage.reportOnFailure']));
  const coverage = APPS.map((app) => {
    const lcovFile = join(root, app, 'coverage', 'lcov.info');
    return existsSync(lcovFile) ? parseLcov(readFileSync(lcovFile, 'utf8'), app) : new Map();
  });
  return { failed, coverage: mergeCoverage(...coverage) };
}

const STRYKER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'node_modules', '.bin', 'stryker');

// Stryker's vitest runner loads vitest from tools/node_modules, so tools pins the same vitest version as the apps.
export function runMutation(root: string, app: string, files: string[], outDir: string, label: string, timeoutMs: number): MutationRun {
  if (files.length === 0) return { counts: new Map() };
  if (timeoutMs <= 0) return { reason: 'time budget used up' };
  const reportFile = join(outDir, `mutation-${label}-${app}.json`);
  const configFile = join(outDir, `stryker-${label}-${app}.json`);
  const tempDir = join(process.env.RUNNER_TEMP ?? process.env.TMPDIR ?? '/tmp', `stryker-${label}-${app}`);
  writeJson(configFile, strykerConfig(files, reportFile, tempDir, Math.max(1, Math.floor(timeoutMs / 60000))));
  const run = spawnSync(STRYKER, ['run', configFile], { cwd: join(root, app), encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  if ((run.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT') return { reason: `${app}: over the time budget` };
  if (run.status !== 0 || !existsSync(reportFile)) {
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.replace(/\x1b\[[0-9;]*m/g, '');
    const error = output.split('\n').find((line) => / ERROR /.test(line))?.replace(/^.* ERROR \S+\s*/, '');
    return { reason: `${app}: ${error ?? `stryker exited with ${run.status}`}` };
  }
  return { counts: parseMutationReport(readJson(reportFile), app) };
}

export function mergeMutation(runs: MutationRun[]): MutationRun {
  const counts: Mutation = new Map();
  for (const run of runs) {
    if (!run.counts) return run;
    for (const entry of run.counts) counts.set(...entry);
  }
  return { counts };
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
