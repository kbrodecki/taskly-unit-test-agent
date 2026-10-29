import { appendFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DecisionEntry } from '../decisions.ts';
import type { GateResult } from '../gates.ts';
import type { AgentInput } from '../input.ts';
import { conclusion, type CoverageRow, type ReportData, renderReport } from '../report.ts';
import { arg, readJson } from './shared.ts';

const dir = resolve(arg('input', '.unit-test-agent'));
const gatesFile = resolve(arg('gates', join(dir, 'gates.json')));
const outFile = resolve(arg('out', join(dir, 'report.md')));

const input = readJson<AgentInput>(join(dir, 'input.json'));
const gates = readJson<{ gates: GateResult[]; decisionErrors: string[]; decisions: DecisionEntry[]; authorFailures: string[]; coverage: CoverageRow[] }>(gatesFile);

const data: ReportData = {
  mode: input.mode,
  decisions: gates.decisions,
  decisionErrors: gates.decisionErrors,
  codeDecisions: input.codeDecisions,
  gates: gates.gates,
  authorFailures: gates.authorFailures,
  coverage: gates.coverage,
  runUrl: process.env.RUN_URL ?? (process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : undefined),
};
writeFileSync(outFile, renderReport(data));
const result = conclusion(data);
writeFileSync(join(dir, 'conclusion.txt'), `${result}\n`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `conclusion=${result}\n`);
console.log(result);
