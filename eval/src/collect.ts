import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { decisionMap, type ExpectedCase, type RunFacts, scoreRun, stability } from './score.ts';

const repo = process.argv[2] ?? 'kbrodecki/gh-aw-spike';
const round = process.argv[3] ?? 'round-1';
const branchPrefix = process.argv[4] ?? 'eval/';
const only = process.argv[5]?.split(',');
const root = resolve(import.meta.dirname, '..');
const gh = (...args: string[]) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const ghJson = <T>(...args: string[]) => JSON.parse(gh(...args)) as T;

interface Pull { number: number; headRefName: string; url: string }
interface Run { databaseId: number; createdAt: string; url: string }

function download(runId: number, name: string): string | undefined {
  const dir = mkdtempSync(join(tmpdir(), `eval-${name}-`));
  try {
    gh('run', 'download', String(runId), '--repo', repo, '-n', name, '-D', dir);
    return dir;
  } catch {
    return undefined;
  }
}

const readJson = <T>(file: string): T | undefined => (existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : undefined);

function facts(pull: Pull, run: Run) {
  const data = download(run.databaseId, 'unit-test-agent-data');
  const gatesDir = download(run.databaseId, 'unit-test-agent-gates');
  const agentDir = download(run.databaseId, 'agent');
  const input = data ? readJson<{ codeDecisions: Array<{ file: string; reason: string }> }>(join(data, 'input.json')) : undefined;
  const gates = gatesDir ? readJson<{ gates: Array<{ id: string; status: string }>; decisionErrors: string[]; decisions: Array<{ file: string; decision: string; reason?: string }>; authorFailures: string[] }>(join(gatesDir, 'gates.json')) : undefined;
  const usage = agentDir ? readJson<{ ai_credits: number }>(join(agentDir, 'agent_usage.json')) : undefined;
  const stdio = agentDir && existsSync(join(agentDir, 'agent-stdio.log')) ? readFileSync(join(agentDir, 'agent-stdio.log'), 'utf8') : '';
  const turns = [...stdio.matchAll(/"num_turns":(\d+)/g)].map((match) => Number(match[1])).pop() ?? 0;

  const commits = ghJson<{ commits: Array<{ oid: string; authors: Array<{ login: string }> }> }>('pr', 'view', String(pull.number), '--repo', repo, '--json', 'commits').commits;
  const botCommits = commits.filter((commit) => commit.authors.some((author) => author.login.includes('github-actions')));
  const pushedFiles = botCommits.flatMap((commit) => ghJson<{ files: Array<{ filename: string }> }>('api', `repos/${repo}/commits/${commit.oid}`).files.map((file) => file.filename));
  const checks = commits.flatMap((commit) => ghJson<{ check_runs: Array<{ name: string; conclusion: string; completed_at: string }> }>('api', `repos/${repo}/commits/${commit.oid}/check-runs?check_name=Unit%20Test%20Agent`).check_runs);
  const check = checks.filter((item) => item.name === 'Unit Test Agent').sort((a, b) => a.completed_at.localeCompare(b.completed_at)).pop();
  const jobs = ghJson<{ jobs: Array<{ name: string; started_at: string; completed_at: string }> }>('api', `repos/${repo}/actions/runs/${run.databaseId}/jobs`).jobs;
  const agentJob = jobs.find((job) => job.name === 'agent');
  const minutes = (job?: { started_at: string; completed_at: string }) => (job ? (Date.parse(job.completed_at) - Date.parse(job.started_at)) / 60000 : 0);
  const runMinutes = (Math.max(...jobs.map((job) => Date.parse(job.completed_at))) - Math.min(...jobs.map((job) => Date.parse(job.started_at)))) / 60000;

  const result: RunFacts = {
    decisions: decisionMap(gates?.decisions ?? [], input?.codeDecisions ?? []),
    conclusion: check?.conclusion ?? 'missing',
    blockingGates: [...(gates?.gates.filter((item) => item.status === 'fail').map((item) => item.id) ?? []), ...((gates?.decisionErrors.length ?? 0) > 0 ? ['decisions'] : [])],
    authorFailures: gates?.authorFailures.length ?? 0,
    pushedFiles,
  };
  return { ...result, usd: (usage?.ai_credits ?? 0) / 100, turns, agentMinutes: minutes(agentJob), runMinutes, runUrl: run.url, prUrl: pull.url };
}

const cases = readdirSync(join(root, 'expected')).filter((name) => name.endsWith('.json') && (!only || only.includes(name.slice(0, -5)))).map((name) => readJson<ExpectedCase>(join(root, 'expected', name))!).sort((a, b) => a.case.localeCompare(b.case));
const pulls = ghJson<Pull[]>('pr', 'list', '--repo', repo, '--label', 'eval', '--state', 'all', '--limit', '100', '--json', 'number,headRefName,url');

const results = cases.map((expected) => {
  const own = pulls.filter((pull) => pull.headRefName.startsWith(`${branchPrefix}${expected.case.toLowerCase()}-r`)).sort((a, b) => a.headRefName.localeCompare(b.headRefName));
  const runs = own.flatMap((pull) => {
    const list = ghJson<Run[]>('run', 'list', '--repo', repo, '--workflow', 'Unit Test Agent', '--branch', pull.headRefName, '--limit', '20', '--json', 'databaseId,createdAt,url');
    const first = list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!first) return [];
    const run = facts(pull, first);
    return [{ ...run, score: scoreRun(expected, run) }];
  });
  return { expected, runs, stable: stability(runs.map((run) => run.decisions)) };
});

writeFileSync(join(root, 'rounds', `${round}.json`), `${JSON.stringify(results, null, 2)}\n`);

const avg = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const lines = [
  '| Case | Checks | Decisions exact | Decisions acceptable | Check as expected | Blocking gates | Only tests pushed | Stable | Cost | Turns | Agent min | Runs |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
];
for (const { expected, runs, stable } of results) {
  const total = runs.length * Object.keys(expected.files).length;
  const exact = runs.reduce((sum, run) => sum + run.score.exact, 0);
  const acceptable = runs.reduce((sum, run) => sum + run.score.acceptable, 0);
  const blocking = [...new Set(runs.flatMap((run) => run.blockingGates))].join(', ') || 'none';
  lines.push(
    `| ${expected.case} | ${expected.title} | ${exact}/${total} | ${acceptable}/${total} | ${runs.filter((run) => run.score.conclusionMatches).length}/${runs.length} | ${blocking} | ${runs.filter((run) => run.score.safety).length}/${runs.length} | ${stable}/${runs.length} | $${avg(runs.map((run) => run.usd)).toFixed(2)} | ${Math.round(avg(runs.map((run) => run.turns)))} | ${avg(runs.map((run) => run.agentMinutes)).toFixed(1)} | ${runs.map((run, i) => `[${i + 1}](${run.prUrl})`).join(' ')} |`,
  );
}
lines.push('', '### Mismatches', '');
for (const { expected, runs } of results) {
  runs.forEach((run, i) => {
    for (const miss of run.score.mismatches) lines.push(`- ${expected.case} run ${i + 1}: \`${miss.file}\` expected \`${miss.expected}\`, got \`${miss.actual}\``);
    if (!run.score.conclusionMatches) lines.push(`- ${expected.case} run ${i + 1}: check \`${run.conclusion}\`, expected \`${expected.conclusion}\`${expected.authorFailures ? ' with author failures' : ''}`);
  });
}
writeFileSync(join(root, 'rounds', `${round}.md`), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
