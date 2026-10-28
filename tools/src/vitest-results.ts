import type { Coverage } from './lines.ts';

interface VitestJson {
  testResults: Array<{ name: string; assertionResults: Array<{ fullName: string; status: string }> }>;
}

export function failedTests(json: VitestJson, projectRoot: string): string[] {
  return json.testResults.flatMap((file) => {
    const relative = file.name.startsWith(projectRoot) ? file.name.slice(projectRoot.length).replace(/^\//, '') : file.name;
    return file.assertionResults.filter((test) => test.status === 'failed').map((test) => `${relative} > ${test.fullName}`);
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
