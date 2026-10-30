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

const ALLOWED_PATHS = [/^(?:backend|frontend)\/.+\.test\.tsx?$/, /^frontend\/src\/test\//, /^backend\/tests\//];

const allowed = (path: string) => ALLOWED_PATHS.some((pattern) => pattern.test(path));

export function checkPaths(diffs: FileDiff[]): GateResult {
  const paths = diffs.flatMap((diff) => (diff.oldPath ? [diff.oldPath, diff.path] : [diff.path]));
  const outside = [...new Set(paths)].filter((path) => !allowed(path));
  return gate('G1', 'Only test files and test fixtures changed', outside.map((path) => `${path} is outside the allowed paths`));
}

const BANNED = [
  [/\b(?:it|test|describe|suite)(?:\.\w+)*\.(?:skip|only|todo|fails|skipIf|runIf)\b/, 'skipped, focused, todo, conditional or expected-to-fail test'],
  [/\b\w+\.skip\(\s*\)/, 'test skipped at run time'],
  [/\b(?:xit|xtest|xdescribe|fit|fdescribe)\(/, 'skipped or focused test'],
  [/@ts-(?:ignore|expect-error|nocheck)/, 'type check suppression'],
  [/eslint-disable/, 'lint suppression'],
] as const;

const IMPORT_LINE = /^\s*(import\b|\} from |from )/;
const SPECIFIER = /(?:from\s+|^\s*import\s+)['"]([^'"]+)['"]/;

// A removed import line is a reformatted import, not a removed dependency, only when the same
// module is still imported by an added line (or, for the opening line of a multi-line import, when an import line was added).
function keepsImport(line: string, added: string[]): boolean {
  if (!IMPORT_LINE.test(line)) return false;
  const specifier = SPECIFIER.exec(line)?.[1];
  if (specifier === undefined) return added.some((item) => IMPORT_LINE.test(item));
  return added.some((item) => SPECIFIER.exec(item)?.[1] === specifier);
}

export function guardDiff(diffs: FileDiff[], lost: string[] = []): GateResult {
  const problems: string[] = [];
  for (const diff of diffs.filter((item) => allowed(item.path) || (item.oldPath !== undefined && allowed(item.oldPath)))) {
    if (diff.isDeleted) {
      problems.push(`${diff.path}: deleting a test file is not allowed`);
      continue;
    }
    if (diff.isRename) problems.push(`${diff.oldPath}: renaming or copying a test file is not allowed (to ${diff.path})`);
    if (diff.isSymlink) problems.push(`${diff.path}: symbolic links are not allowed`);
    else if (diff.modeChanged) problems.push(`${diff.path}: file mode changes are not allowed`);
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
      if (!keepsImport(line, diff.added) && !commaOnly && trimmed.trim() !== '') {
        problems.push(`${diff.path}: existing line removed or changed: ${trimmed.trim()}`);
      }
    }
  }
  return gate('G2', 'Changes to existing tests are additive only', [...problems, ...lost]);
}

// Parses both sides once. New tests are the ones whose title is new. Additive edits can still hide an
// existing test, for example by wrapping it in a block comment, so every test the file had before the
// patch must still be there after it (counted, so duplicate titles count too).
export function analyzeTestChange(before: string | undefined, after: string, fileName: string): { tests: TestCase[]; lost: string[] } {
  const previous = before ? findTests(before, fileName) : [];
  const current = findTests(after, fileName);
  const previousNames = new Set(previous.map((test) => test.name));
  const left = new Map<string, number>();
  for (const test of current) left.set(test.name, (left.get(test.name) ?? 0) + 1);
  const lost: string[] = [];
  for (const test of previous) {
    const count = left.get(test.name) ?? 0;
    if (count === 0) lost.push(test.name);
    else left.set(test.name, count - 1);
  }
  return { tests: current.filter((test) => !previousNames.has(test.name)), lost };
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
