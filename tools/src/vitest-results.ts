import type { Coverage } from './lines.ts';

interface VitestJson {
  testResults: Array<{ name: string; status?: string; assertionResults: Array<{ fullName: string; status: string }> }>;
}

export const NO_RESULTS = '(no test results: the suite did not run)';

export function failedTests(json: VitestJson, projectRoot: string): string[] {
  if (json.testResults.length === 0) return [NO_RESULTS];
  return json.testResults.flatMap((file) => {
    const relative = file.name.startsWith(projectRoot) ? file.name.slice(projectRoot.length).replace(/^\//, '') : file.name;
    const failed = file.assertionResults.filter((test) => test.status === 'failed').map((test) => `${relative} > ${test.fullName}`);
    return failed.length === 0 && file.status === 'failed' ? [`${relative} > (file failed to run)`] : failed;
  });
}

export function linePercent(coverage: Coverage, prefix: string): number {
  let total = 0;
  let covered = 0;
  for (const [path, hits] of coverage) {
    if (!path.startsWith(prefix)) continue;
    total += hits.size;
    covered += [...hits.values()].filter((count) => count > 0).length;
  }
  return total === 0 ? 0 : (covered / total) * 100;
}
