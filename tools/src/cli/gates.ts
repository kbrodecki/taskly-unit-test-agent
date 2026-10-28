import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateDecisions } from '../decisions.ts';
import { checkAssertions, checkPaths, checkValue, compareFailures, gate, type GateResult, guardDiff, lintTests, newTests } from '../gates.ts';
import type { AgentInput } from '../input.ts';
import { parsePatch } from '../patch.ts';
import { linePercent } from '../vitest-results.ts';
import { APPS, arg, deserializeCoverage, git, readJson, runAll, writeJson } from './shared.ts';

const root = resolve(arg('root', '.'));
const dir = resolve(arg('input', '.unit-test-agent'));
const patchFile = arg('patch', '');
const outFile = resolve(arg('out', join(dir, 'gates.json')));
const reruns = Number(arg('reruns', '5'));

const input = readJson<AgentInput & { authorFailures: string[] }>(join(dir, 'input.json'));
const coverageBefore = deserializeCoverage(readJson(join(dir, 'coverage-before.json')));
const decisionsFile = join(dir, 'decisions.json');
const validation = existsSync(decisionsFile)
  ? validateDecisions(readJson(decisionsFile), input)
  : input.files.length === 0
    ? ({ ok: true, decisions: { mode: input.mode, files: [] } } as const)
    : ({ ok: false, errors: ['decisions.json is missing'] } as const);

const patch = patchFile && existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : '';
const diffs = parsePatch(patch);
const gates: GateResult[] = [];
let coverageAfter = coverageBefore;
let authorFailures = input.authorFailures;

if (diffs.length === 0) {
  gates.push({ id: 'G1-G7', name: 'No test changes to check', status: 'skipped', details: [] });
} else {
  gates.push(checkPaths(diffs), guardDiff(diffs));
  const applied = spawnSync('git', ['apply', '--whitespace=nowarn', patchFile], { cwd: root, encoding: 'utf8' });
  if (applied.status !== 0) {
    gates.push(gate('G0', 'Patch applies to the PR head', [applied.stderr.trim() || 'git apply failed']));
  } else {
    const testFiles = diffs.filter((diff) => !diff.isDeleted && /\.test\.tsx?$/.test(diff.path));
    const added = testFiles.map((diff) => {
      let before: string | undefined;
      try {
        before = git(root, 'show', `HEAD:${diff.path}`);
      } catch {
        before = undefined;
      }
      return { path: diff.path, tests: newTests(before, readFileSync(join(root, diff.path), 'utf8'), diff.path) };
    });
    const typeErrors = APPS.flatMap((app) => {
      const run = spawnSync('npm', ['run', '--silent', 'typecheck'], { cwd: join(root, app), encoding: 'utf8' });
      return run.status === 0 ? [] : [`${app}: typecheck failed: ${(run.stdout + run.stderr).trim().split('\n').slice(0, 5).join(' / ')}`];
    });
    const lint = lintTests(added);
    gates.push(gate('G3', 'Typecheck passes and every new test asserts with a matcher', [...typeErrors, ...lint.details]));

    const after = runAll(root, dir, 'after');
    coverageAfter = after.coverage;
    const failures = compareFailures(input.authorFailures, after.failed);
    authorFailures = failures.existing;
    gates.push(gate('G4', 'Full backend and frontend suites pass', failures.added.map((name) => `${name} fails with the agent changes`)));

    const flaky: string[] = [];
    for (const app of APPS) {
      const files = testFiles.filter((diff) => diff.path.startsWith(`${app}/`)).map((diff) => diff.path.slice(app.length + 1));
      if (files.length === 0) continue;
      for (let seed = 1; seed <= reruns; seed += 1) {
        const run = spawnSync('npx', ['vitest', 'run', '--sequence.shuffle', `--sequence.seed=${seed}`, ...files], { cwd: join(root, app), encoding: 'utf8' });
        if (run.status !== 0) flaky.push(`${app}: run ${seed} of ${reruns} with shuffled order failed`);
      }
    }
    gates.push(gate('G5', `New and changed tests pass ${reruns} shuffled reruns`, flaky));
    gates.push(checkAssertions(added));
    const touched = validation.ok ? validation.decisions.files.filter((entry) => entry.decision !== 'skip').map((entry) => entry.file) : [];
    gates.push(checkValue(touched, coverageBefore, coverageAfter));
  }
}

const result = {
  gates,
  decisionErrors: validation.ok ? [] : validation.errors,
  decisions: validation.ok ? validation.decisions.files : [],
  authorFailures,
  coverage: APPS.map((app) => ({ area: app, before: linePercent(coverageBefore, `${app}/`), after: linePercent(coverageAfter, `${app}/`) })),
};
writeJson(outFile, result);
const blocked = gates.some((item) => item.status === 'fail') || result.decisionErrors.length > 0;
for (const item of gates) console.log(`${item.id} ${item.status}: ${item.name}${item.details.length ? `\n  ${item.details.join('\n  ')}` : ''}`);
for (const error of result.decisionErrors) console.log(`decisions: ${error}`);
process.exitCode = blocked ? 1 : 0;
