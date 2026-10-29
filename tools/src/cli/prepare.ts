import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type ChangedFile, classify, parseNameStatus } from '../changes.ts';
import { buildInput } from '../input.ts';
import { allUncovered, parseUnifiedDiff } from '../lines.ts';
import { arg, git, runAll, serializeCoverage, writeJson } from './shared.ts';

const root = resolve(arg('root', '.'));
const mode = arg('mode', 'pr') as 'pr' | 'backfill';
const limit = Number(arg('limit', mode === 'pr' ? '10' : '25'));
const outDir = resolve(arg('out', '.unit-test-agent'));

const before = runAll(root, outDir, 'before');
const exists = (path: string) => existsSync(join(root, path));

let changed: ChangedFile[];
let changedLines: Map<string, number[]>;
if (mode === 'pr') {
  const range = `${arg('base')}...HEAD`;
  changed = parseNameStatus(git(root, 'diff', '--name-status', '-M', range)).map((change) => classify(change, exists));
  changedLines = parseUnifiedDiff(git(root, 'diff', '-U0', '-M', range));
} else {
  changedLines = new Map([...before.coverage].map(([path, hits]) => [path, allUncovered(hits)]).filter(([, lines]) => lines.length > 0) as Array<[string, number[]]>);
  changed = [...changedLines.keys()].map((path) => classify({ path, status: 'modified' }, exists));
}

const input = buildInput(mode, changed, changedLines, before.coverage, limit);
writeJson(join(outDir, 'input.json'), { ...input, headSha: git(root, 'rev-parse', 'HEAD').trim(), authorFailures: before.failed });
writeJson(join(outDir, 'coverage-before.json'), serializeCoverage(before.coverage));
console.log(`${input.files.length} file(s) for the agent, ${input.codeDecisions.length} decided by code, ${before.failed.length} failing test(s) before the agent`);
