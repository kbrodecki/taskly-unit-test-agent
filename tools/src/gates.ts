import { type Coverage, coveredCount } from './lines.ts';
import type { MutationRow } from './mutation.ts';
import type { FileDiff } from './patch.ts';
import { findTests, type TestCase } from './test-ast.ts';

export type GateStatus = 'pass' | 'fail' | 'skipped';

export interface GateResult {
  id: string;
  name: string;
  status: GateStatus;
  details: string[];
}

export function gate(id: string, name: string, details: string[]): GateResult {
  return { id, name, status: details.length === 0 ? 'pass' : 'fail', details };
}

export function checkPromised(decisions: ReadonlyArray<{ file: string; decision: string; testFile?: string }>, diffs: FileDiff[]): GateResult {
  const changed = new Set(diffs.filter((diff) => !diff.isDeleted).map((diff) => diff.path));
  const missing = decisions.filter((entry) => entry.decision !== 'skip' && entry.testFile && !changed.has(entry.testFile));
  return gate('G0', 'Every create or update decision has its test file in the change', missing.map((entry) => `${entry.file}: ${entry.decision} promised ${entry.testFile}, which the change does not contain`));
}

const ALLOWED_PATHS = [/\.test\.tsx?$/, /^frontend\/src\/test\//, /^backend\/tests\//];

export function checkPaths(diffs: FileDiff[]): GateResult {
  const outside = diffs.map((diff) => diff.path).filter((path) => !ALLOWED_PATHS.some((pattern) => pattern.test(path)));
  return gate('G1', 'Only test files and test fixtures changed', outside.map((path) => `${path} is outside the allowed paths`));
}

const BANNED = [
  [/\b(?:it|test|describe)\.(?:skip|only|todo|fails)\b/, 'skipped, focused, todo or expected-to-fail test'],
  [/\b(?:xit|xtest|xdescribe|fit|fdescribe)\(/, 'skipped or focused test'],
  [/@ts-(?:ignore|expect-error|nocheck)/, 'type check suppression'],
  [/eslint-disable/, 'lint suppression'],
] as const;

const IMPORT_LINE = /^\s*(import\b|\} from |from )/;

export function guardDiff(diffs: FileDiff[]): GateResult {
  const problems: string[] = [];
  for (const diff of diffs.filter((item) => ALLOWED_PATHS.some((pattern) => pattern.test(item.path)))) {
    if (diff.isDeleted) {
      problems.push(`${diff.path}: deleting a test file is not allowed`);
      continue;
    }
    for (const line of diff.added) {
      for (const [pattern, label] of BANNED) {
        if (pattern.test(line)) problems.push(`${diff.path}: ${label}: ${line.trim()}`);
      }
    }
    if (diff.isNew) continue;
    const added = new Set(diff.added.map((line) => line.trimEnd()));
    for (const line of diff.removed) {
      const trimmed = line.trimEnd();
      const commaOnly = added.has(`${trimmed},`);
      if (!IMPORT_LINE.test(line) && !commaOnly && trimmed.trim() !== '') {
        problems.push(`${diff.path}: existing line removed or changed: ${trimmed.trim()}`);
      }
    }
  }
  return gate('G2', 'Changes to existing tests are additive only', problems);
}

export function newTests(before: string | undefined, after: string, fileName: string): TestCase[] {
  const old = new Set(before ? findTests(before, fileName).map((test) => test.name) : []);
  return findTests(after, fileName).filter((test) => !old.has(test.name));
}

export function lintTests(files: Array<{ path: string; tests: TestCase[] }>): GateResult {
  const problems: string[] = [];
  for (const { path, tests } of files) {
    for (const test of tests) {
      if (test.expects.length === 0) problems.push(`${path}: "${test.name}" has no expect`);
      if (test.expects.some((call) => !call.matcher)) problems.push(`${path}: "${test.name}" calls expect without a matcher`);
    }
  }
  return gate('G3', 'Every new test asserts with a matcher', problems);
}

const TRIVIAL_MATCHERS = new Set(['toBeDefined', 'toBeTruthy', 'toBeFalsy', 'toBeUndefined']);

function isTrivial(call: { subject: string; matcher?: string }): boolean {
  if (call.matcher && TRIVIAL_MATCHERS.has(call.matcher)) return true;
  return /\.(status|statusCode)$/.test(call.subject);
}

export function checkAssertions(files: Array<{ path: string; tests: TestCase[] }>): GateResult {
  const problems: string[] = [];
  for (const { path, tests } of files) {
    for (const test of tests) {
      if (test.expects.length > 0 && test.expects.every(isTrivial)) {
        problems.push(`${path}: "${test.name}" only checks existence, truthiness or an HTTP status`);
      }
    }
  }
  return gate('G6', 'New tests assert behaviour, not only existence', problems);
}

export function compareFailures(before: string[], after: string[]): { added: string[]; existing: string[] } {
  const old = new Set(before);
  return { added: after.filter((name) => !old.has(name)), existing: after.filter((name) => old.has(name)) };
}

// A file with nothing left to cover passes: line coverage cannot show the value of a new boundary test there.
// When mutation results exist, more detected mutants is an alternative proof of value.
export function checkValue(files: string[], before: Coverage, after: Coverage, mutation: MutationRow[] = []): GateResult {
  const fullyCovered = (file: string) => {
    const hits = before.get(file);
    return hits !== undefined && hits.size > 0 && [...hits.values()].every((count) => count > 0);
  };
  const moreDetected = (file: string) => {
    const row = mutation.find((item) => item.file === file);
    return row !== undefined && row.after.detected > row.before.detected;
  };
  const problems = files
    .filter((file) => !fullyCovered(file) && !moreDetected(file) && coveredCount(after.get(file)) <= coveredCount(before.get(file)))
    .map((file) => `${file}: covered lines did not grow (${coveredCount(before.get(file))} before, ${coveredCount(after.get(file))} after)${mutation.some((item) => item.file === file) ? ' and no more mutants detected' : ''}`);
  return gate('G7', mutation.length > 0 ? 'Each create or update covers more lines or detects more mutants' : 'Each create or update covers more lines', problems);
}
