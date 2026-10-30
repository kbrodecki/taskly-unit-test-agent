export type ChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export interface Change {
  path: string;
  status: ChangeStatus;
  oldPath?: string;
}

export type Area = 'backend' | 'frontend';

export type ChangedFile =
  | (Change & { kind: 'source'; area: Area; testPath: string; testExists: boolean })
  | (Change & { kind: 'filtered'; filterReason: string })
  | (Change & { kind: 'deleted' });

const STATUS: Record<string, ChangeStatus> = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'added', T: 'modified' };

export function parseNameStatus(text: string): Change[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [code, first, second] = line.split('\t');
      const status = STATUS[code[0]];
      if (!status) throw new Error(`Unknown git status line: ${line}`);
      return status === 'renamed' ? { path: second, status, oldPath: first } : { path: first, status };
    });
}

const FILTERS: Array<[RegExp, string]> = [
  [/\.test\.tsx?$/, 'test file'],
  [/^backend\/tests\//, 'test support'],
  [/^frontend\/src\/test\//, 'test support'],
  [/(^|\/)types\.ts$|\.types\.ts$|\.d\.ts$/, 'types only'],
  [/(^|\/)index\.ts$/, 'barrel file'],
  [/(^|\/)constants\.tsx?$|\.constants\.ts$/, 'constants'],
  [/\.(css|scss)$/, 'styles'],
  [/\.stories\.tsx?$/, 'story'],
  [/^frontend\/src\/design-system\//, 'design system, outside coverage'],
  [/^frontend\/src\/main\.tsx$/, 'entry point, outside coverage'],
  [/^backend\/src\/generated\//, 'generated code'],
];

const SOURCE: Array<[RegExp, Area]> = [
  [/^backend\/src\/.+\.ts$/, 'backend'],
  [/^frontend\/src\/.+\.tsx?$/, 'frontend'],
];

export function testPathFor(path: string, area: Area): string {
  if (area === 'backend') {
    const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.ts$/, '');
    return `backend/tests/${name}.test.ts`;
  }
  return path.replace(/\.(tsx?)$/, '.test.$1');
}

export function classify(change: Change, exists: (path: string) => boolean): ChangedFile {
  if (change.status === 'deleted') return { ...change, kind: 'deleted' };
  const filter = FILTERS.find(([pattern]) => pattern.test(change.path));
  if (filter) return { ...change, kind: 'filtered', filterReason: filter[1] };
  const source = SOURCE.find(([pattern]) => pattern.test(change.path));
  if (!source) return { ...change, kind: 'filtered', filterReason: 'outside application source' };
  const area = source[1];
  const testPath = testPathFor(change.path, area);
  return { ...change, kind: 'source', area, testPath, testExists: exists(testPath) };
}
