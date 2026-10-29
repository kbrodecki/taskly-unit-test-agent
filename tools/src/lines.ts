export type LineHits = Map<number, number>;
export type Coverage = Map<string, LineHits>;

export function parseUnifiedDiff(text: string): Map<string, number[]> {
  const result = new Map<string, number[]>();
  let current: number[] | undefined;
  for (const line of text.split('\n')) {
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).trim();
      current = path === '/dev/null' ? undefined : [];
      if (current) result.set(path.replace(/^b\//, ''), current);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let n = start; n < start + count; n += 1) current.push(n);
    }
  }
  return result;
}

export function parseLcov(text: string, projectDir: string): Coverage {
  const coverage: Coverage = new Map();
  let hits: LineHits | undefined;
  for (const line of text.split('\n')) {
    if (line.startsWith('SF:')) {
      const file = line.slice(3).trim();
      const path = file.startsWith('/') ? file.slice(file.indexOf(`/${projectDir}/`) + 1) : `${projectDir}/${file}`;
      hits = new Map();
      coverage.set(path, hits);
    } else if (line.startsWith('DA:') && hits) {
      const [lineNumber, count] = line.slice(3).split(',');
      hits.set(Number(lineNumber), Number(count));
    } else if (line.startsWith('end_of_record')) {
      hits = undefined;
    }
  }
  return coverage;
}

export function mergeCoverage(...parts: Coverage[]): Coverage {
  return new Map(parts.flatMap((part) => [...part]));
}

export function uncoveredLines(lines: number[], hits: LineHits | undefined): number[] {
  if (!hits) return [...lines];
  return lines.filter((line) => hits.get(line) === 0);
}

export function allUncovered(hits: LineHits): number[] {
  return [...hits].filter(([, count]) => count === 0).map(([line]) => line);
}

export function coveredCount(hits: LineHits | undefined): number {
  if (!hits) return 0;
  return [...hits.values()].filter((count) => count > 0).length;
}
