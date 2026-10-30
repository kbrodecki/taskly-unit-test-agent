import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateDecisions, type Validation } from '../decisions.ts';
import { analyzeTestChange, checkAssertions, checkPaths, checkPromised, checkValue, compareFailures, gate, type GateResult, guardDiff, lintTests } from '../gates.ts';
import type { PreparedInput } from '../input.ts';
import { parsePatch } from '../patch.ts';
import { compareMutation, mutationScore, type MutationRun } from '../mutation.ts';
import type { GateRun } from '../report.ts';
import { linePercent } from '../vitest-results.ts';
import { APPS, arg, deserializeCoverage, git, mergeMutation, readJson, runAll, runMutation, runVitest, worktreePatch, writeJson } from './shared.ts';

const root = resolve(arg('root', '.'));
const dir = resolve(arg('input', '.unit-test-agent'));
const worktree = process.argv.includes('--worktree');
const patchFile = worktree ? '' : arg('patch', '');
const outFile = resolve(arg('out', join(dir, worktree ? 'gates-self.json' : 'gates.json')));
const reruns = Number(arg('reruns', worktree ? '2' : '5'));
// Mutation testing runs only in the gates job: it is slow, and the agent's coverage-only self-check is the stricter one.
const mutationOn = !worktree && process.argv.includes('--mutation');
const mutationBudgetMs = Number(arg('mutation-minutes', '8')) * 60000;
const MUTATION_FILES = 4;

const input = readJson<PreparedInput>(join(dir, 'input.json'));
const base = input.headSha;
const coverageBefore = deserializeCoverage(readJson(join(dir, 'coverage-before.json')));
const decisionsFile = join(dir, 'decisions.json');
const validation: Validation = existsSync(decisionsFile)
  ? validateDecisions(readJson(decisionsFile), input)
  : input.files.length === 0
    ? { ok: true, decisions: { mode: input.mode, files: [] } }
    : { ok: false, errors: ['decisions.json is missing'] };

const patch = worktree ? worktreePatch(root, base) : patchFile && existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : '';
const diffs = parsePatch(patch);
const gates: GateResult[] = [];
let coverageAfter = coverageBefore;
let authorFailures = input.authorFailures;

const promised = validation.ok ? validation.decisions.files : [];
const touched = promised.filter((entry) => entry.decision !== 'skip').map((entry) => entry.file);
const mutated = touched.filter((file) => APPS.some((app) => file.startsWith(`${app}/src/`)) && existsSync(join(root, file))).slice(0, MUTATION_FILES);
const deadline = Date.now() + mutationBudgetMs;
const mutate = (label: string, share: number): MutationRun =>
  mergeMutation(APPS.map((app) => runMutation(root, app, mutated.filter((file) => file.startsWith(`${app}/`)).map((file) => file.slice(app.length + 1)), dir, label, Math.floor((deadline - Date.now()) * share))));
let mutation: ReturnType<typeof compareMutation> = { rows: [], reason: undefined };
gates.push(checkPromised(promised, diffs));
if (diffs.length === 0) {
  gates.push({ id: 'G1-G7', name: 'No test changes to check', status: 'skipped', details: [] });
} else {
  gates.push(checkPaths(diffs));
  // Before the patch: the source is identical in both runs (G1 allows only tests), so the counts are comparable.
  const mutationBefore = mutationOn && mutated.length > 0 ? mutate('before', 0.5) : undefined;
  const applied = worktree ? { status: 0, stderr: '' } : spawnSync('git', ['apply', '--whitespace=nowarn', patchFile], { cwd: root, encoding: 'utf8' });
  if (applied.status !== 0) {
    gates.push(guardDiff(diffs));
    gates.push(gate('G0', 'Patch applies to the PR head', [applied.stderr.trim() || 'git apply failed']));
    if (mutationBefore) mutation = { rows: [], reason: 'the patch did not apply' };
  } else {
    const testFiles = diffs.filter((diff) => !diff.isDeleted && /\.test\.tsx?$/.test(diff.path));
    const added = testFiles.map((diff) => {
      let before: string | undefined;
      try {
        before = git(root, 'show', `${base}:${diff.path}`);
      } catch {
        before = undefined;
      }
      const after = readFileSync(join(root, diff.path), 'utf8');
      return { path: diff.path, ...analyzeTestChange(before, after, diff.path) };
    });
    gates.push(guardDiff(diffs, added.flatMap((file) => file.lost.map((name) => `${file.path}: existing test "${name}" is gone (commented out, removed or renamed)`))));
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
        const failed = runVitest(root, app, join(dir, `shuffle-${app}-${seed}.json`), ['--sequence.shuffle', `--sequence.seed=${seed}`, ...files]);
        const added = compareFailures(input.authorFailures, failed).added;
        if (added.length > 0) flaky.push(`${app}: run ${seed} of ${reruns} with shuffled order failed: ${added.slice(0, 3).join('; ')}`);
      }
    }
    gates.push(gate('G5', `New and changed tests pass ${reruns} shuffled reruns`, flaky));
    gates.push(checkAssertions(added));
    if (mutationBefore) mutation = compareMutation(mutationBefore, mutate('after', 1));
    else if (mutationOn) mutation = { rows: [], reason: 'no changed source files to mutate' };
    gates.push(checkValue(touched, coverageBefore, coverageAfter, mutation.rows));
  }
}

const result: GateRun = {
  gates,
  decisionErrors: validation.ok ? [] : validation.errors,
  decisions: validation.ok ? validation.decisions.files : [],
  authorFailures,
  coverage: APPS.map((app) => ({ area: app, before: linePercent(coverageBefore, `${app}/`), after: linePercent(coverageAfter, `${app}/`) })),
  mutation: { rows: mutation.rows.map((row) => ({ ...row, scoreBefore: mutationScore(row.before), scoreAfter: mutationScore(row.after) })), reason: mutation.reason },
};
writeJson(outFile, result);
const blocked = gates.some((item) => item.status === 'fail') || result.decisionErrors.length > 0;
for (const item of gates) console.log(`${item.id} ${item.status}: ${item.name}${item.details.length ? `\n  ${item.details.join('\n  ')}` : ''}`);
if (mutationOn) console.log(mutation.reason ? `mutation: not used, ${mutation.reason}` : `mutation: ${mutation.rows.length} file(s) compared`);
for (const error of result.decisionErrors) console.log(`decisions: ${error}`);
process.exitCode = blocked ? 1 : 0;
