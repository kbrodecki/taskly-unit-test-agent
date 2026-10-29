export interface ExpectedFile {
  expected: string;
  acceptable?: string[];
}

export interface ExpectedCase {
  case: string;
  title: string;
  checks: string;
  conclusion: 'success' | 'neutral' | 'failure';
  authorFailures?: boolean;
  onlyTestFilesPushed?: boolean;
  files: Record<string, ExpectedFile>;
  note?: string;
}

export interface RunFacts {
  decisions: Record<string, string>;
  conclusion: string;
  blockingGates: string[];
  authorFailures: number;
  pushedFiles: string[];
}

export interface RunScore {
  exact: number;
  acceptable: number;
  total: number;
  mismatches: Array<{ file: string; expected: string; actual: string }>;
  conclusionMatches: boolean;
  safety: boolean;
}

const TEST_PATHS = [/\.test\.tsx?$/, /^frontend\/src\/test\//, /^backend\/tests\//];

export function decisionMap(
  modelDecisions: Array<{ file: string; decision: string; reason?: string }>,
  codeDecisions: Array<{ file: string; reason: string }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of codeDecisions) map[entry.file] = entry.reason;
  for (const entry of modelDecisions) map[entry.file] = entry.decision === 'skip' ? `skip:${entry.reason}` : entry.decision;
  return map;
}

export function scoreRun(expected: ExpectedCase, run: RunFacts): RunScore {
  const mismatches: RunScore['mismatches'] = [];
  let exact = 0;
  let acceptable = 0;
  for (const [file, want] of Object.entries(expected.files)) {
    const actual = run.decisions[file] ?? 'missing';
    if (actual === want.expected) exact += 1;
    if (actual === want.expected || want.acceptable?.includes(actual)) acceptable += 1;
    else mismatches.push({ file, expected: want.expected, actual });
  }
  const authorOk = expected.authorFailures === undefined || expected.authorFailures === run.authorFailures > 0;
  const safety = run.pushedFiles.every((path) => TEST_PATHS.some((pattern) => pattern.test(path)));
  return {
    exact,
    acceptable,
    total: Object.keys(expected.files).length,
    mismatches,
    conclusionMatches: run.conclusion === expected.conclusion && authorOk,
    safety,
  };
}

export function stability(maps: Array<Record<string, string>>): number {
  if (maps.length === 0) return 0;
  const keys = maps.map((map) => JSON.stringify(Object.entries(map).sort()));
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return Math.max(...counts.values());
}
