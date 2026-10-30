export interface MutantCounts {
  detected: number;
  survived: number;
  noCoverage: number;
  valid: number;
}

export type Mutation = Map<string, MutantCounts>;

export type MutationRun = { counts: Mutation; reason?: never } | { reason: string; counts?: never };

export interface MutationRow {
  file: string;
  before: MutantCounts;
  after: MutantCounts;
}

const DETECTED = new Set(['Killed', 'Timeout']);
const INVALID = new Set(['CompileError', 'RuntimeError', 'Ignored']);

// Stryker's JSON report (mutation-testing-report-schema) keys files relative to the project it ran in.
export function parseMutationReport(report: { files: Record<string, { mutants: Array<{ status: string }> }> }, app: string): Mutation {
  const result: Mutation = new Map();
  for (const [file, { mutants }] of Object.entries(report.files)) {
    const counts: MutantCounts = { detected: 0, survived: 0, noCoverage: 0, valid: 0 };
    for (const { status } of mutants) {
      if (INVALID.has(status)) continue;
      counts.valid += 1;
      if (DETECTED.has(status)) counts.detected += 1;
      else if (status === 'NoCoverage') counts.noCoverage += 1;
      else counts.survived += 1;
    }
    result.set(`${app}/${file.replace(/^\.\//, '')}`, counts);
  }
  return result;
}

export function mutationScore(counts: MutantCounts): number {
  return counts.valid === 0 ? 100 : (counts.detected / counts.valid) * 100;
}

// Tests are the only change, so both runs mutate the same source; a different mutant count means the runs are not comparable.
export function compareMutation(before: MutationRun, after: MutationRun): { rows: MutationRow[]; reason?: string } {
  if (!before.counts) return { rows: [], reason: before.reason };
  if (!after.counts) return { rows: [], reason: after.reason };
  const rows: MutationRow[] = [];
  for (const [file, counts] of before.counts) {
    const next = after.counts.get(file);
    if (!next || next.valid !== counts.valid) return { rows: [], reason: `mutant count changed for ${file}, runs not comparable` };
    rows.push({ file, before: counts, after: next });
  }
  return { rows };
}

export function strykerConfig(files: string[], reportFile: string, tempDir: string, timeoutMinutes: number): Record<string, unknown> {
  return {
    testRunner: 'vitest',
    plugins: ['@stryker-mutator/vitest-runner'],
    // Route tests reach source through the app factory, which vitest's related-file lookup does not follow.
    vitest: { related: false },
    mutate: files,
    reporters: ['json'],
    jsonReporter: { fileName: reportFile },
    tempDirName: tempDir,
    coverageAnalysis: 'perTest',
    incremental: false,
    dryRunTimeoutMinutes: timeoutMinutes,
  };
}
