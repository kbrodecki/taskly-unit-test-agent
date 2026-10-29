// Publishes the report rendered by tools/src/cli/report.ts: one PR comment updated in place, the
// "Unit Test Agent" check run and the job summary. Called from the report job of both workflows.
const fs = require('fs');

const MARKER = '<!-- unit-test-agent-report -->';
const TITLES = { success: 'Tests added and gates passed', neutral: 'Nothing to test', failure: 'Blocked or failing tests' };

module.exports = async function publishReport({ github, context, core, results, pullNumber }) {
  const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const reportFile = '.unit-test-agent/report.md';
  let body;
  let conclusion;
  if (fs.existsSync(reportFile)) {
    body = fs.readFileSync(reportFile, 'utf8');
    conclusion = fs.readFileSync('.unit-test-agent/conclusion.txt', 'utf8').trim();
  } else {
    body = `${MARKER}\n## Unit Test Agent\n\nThe run stopped before the gates produced a result: agent ${results.agent}, threat detection ${results.detection}, gates ${results.gates}. [Run log](${runUrl})\n`;
    conclusion = 'failure';
  }
  if (results.gates === 'success' && !['success', 'skipped'].includes(results.push)) {
    body += `\n> The gates passed, but publishing the tests ended with \`${results.push}\`. [Run log](${runUrl})\n`;
    conclusion = 'failure';
  }
  await core.summary.addRaw(body).write();
  if (!pullNumber) return;

  const issue_number = Number(pullNumber);
  const comments = await github.paginate(github.rest.issues.listComments, { ...context.repo, issue_number, per_page: 100 });
  // Only the workflow's own comment: anyone who can comment could post the marker.
  const existing = comments.find((comment) => comment.user?.login === 'github-actions[bot]' && comment.body && comment.body.includes(MARKER));
  if (existing) await github.rest.issues.updateComment({ ...context.repo, comment_id: existing.id, body });
  else await github.rest.issues.createComment({ ...context.repo, issue_number, body });

  const { data: pull } = await github.rest.pulls.get({ ...context.repo, pull_number: issue_number });
  await github.rest.checks.create({
    ...context.repo,
    name: 'Unit Test Agent',
    head_sha: pull.head.sha,
    status: 'completed',
    conclusion,
    details_url: runUrl,
    output: { title: TITLES[conclusion] || conclusion, summary: body.slice(0, 65000) },
  });
};
