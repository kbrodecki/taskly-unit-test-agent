// Publishes the screenshots from the capture job without running any code from the pull request:
// validates the files, commits them to the orphan branch "visual-evidence" through the Git Data API
// and updates one "Visual evidence" comment on the PR.
const fs = require('fs');
const path = require('path');

const BRANCH = 'visual-evidence';
const MARKER = '<!-- visual-evidence -->';
const ID = /^[a-z0-9][a-z0-9-]{0,60}$/;
const ALLOWED = { before: ['.png'], after: ['.png', '.gif', '.webm'], diff: ['.png'] };
const MAX_FILE = 15 * 1024 * 1024;
const MAX_FILES = 80;

function collect(dir) {
  const files = [];
  for (const [side, extensions] of Object.entries(ALLOWED)) {
    const sideDir = path.join(dir, side);
    if (!fs.existsSync(sideDir)) continue;
    for (const name of fs.readdirSync(sideDir)) {
      const extension = path.extname(name);
      const id = name.slice(0, -extension.length);
      const file = path.join(sideDir, name);
      if (!extensions.includes(extension) || !ID.test(id) || !fs.statSync(file).isFile()) throw new Error(`Unexpected file ${side}/${name}`);
      if (fs.statSync(file).size > MAX_FILE) throw new Error(`${side}/${name} is larger than ${MAX_FILE} bytes`);
      files.push({ side, name, file });
    }
  }
  if (files.length > MAX_FILES) throw new Error(`${files.length} files, at most ${MAX_FILES} allowed`);
  return files;
}

async function commitFiles({ github, context, prefix, files, message }) {
  const repo = context.repo;
  let parent;
  try {
    const { data } = await github.rest.git.getRef({ ...repo, ref: `heads/${BRANCH}` });
    parent = data.object.sha;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  const baseTree = parent ? (await github.rest.git.getCommit({ ...repo, commit_sha: parent })).data.tree.sha : undefined;
  const tree = [];
  for (const { side, name, file } of files) {
    const { data: blob } = await github.rest.git.createBlob({ ...repo, content: fs.readFileSync(file).toString('base64'), encoding: 'base64' });
    tree.push({ path: `${prefix}/${side}/${name}`, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const { data: newTree } = await github.rest.git.createTree({ ...repo, tree, ...(baseTree ? { base_tree: baseTree } : {}) });
  const { data: commit } = await github.rest.git.createCommit({ ...repo, message, tree: newTree.sha, parents: parent ? [parent] : [] });
  if (parent) await github.rest.git.updateRef({ ...repo, ref: `heads/${BRANCH}`, sha: commit.sha });
  else await github.rest.git.createRef({ ...repo, ref: `refs/heads/${BRANCH}`, sha: commit.sha });
  return commit.sha;
}

function render({ shots, videos, url, runUrl, has, privateRepo }) {
  const image = (side, id, alt) => (has(side, `${id}.png`) ? `<a href="${url(side, `${id}.png`)}"><img src="${url(side, `${id}.png`)}" alt="${alt}" width="420"></a>` : '_none_');
  const changed = shots.filter((shot) => shot.status !== 'unchanged');
  const unchanged = shots.filter((shot) => shot.status === 'unchanged');
  const lines = [MARKER, '## Visual evidence', ''];
  lines.push(`Screens from the scenario catalog in \`visual/scenarios/\`, rendered on the base and on this PR with the API mocked. [Run](${runUrl})`, '');
  if (privateRepo) lines.push('> In a private repository GitHub does not show these images inline; click an image or link to open it.', '');
  for (const id of videos) {
    lines.push(`### Video: \`${id}\``, '');
    if (has('after', `${id}.gif`)) lines.push(`<a href="${url('after', `${id}.gif`)}"><img src="${url('after', `${id}.gif`)}" alt="${id} recording" width="840"></a>`, '');
    lines.push(`[GIF](${url('after', `${id}.gif`)}) · [Full video (webm)](${url('after', `${id}.webm`)})`, '');
  }
  if (changed.length === 0) lines.push('No screen changed.', '');
  else {
    lines.push('| Scenario | Status | Before | After |', '|---|---|---|---|');
    for (const shot of changed) {
      const diff = has('diff', `${shot.id}.png`) ? `<br>[diff](${url('diff', `${shot.id}.png`)}), ${shot.diffPixels} px` : '';
      lines.push(`| \`${shot.id}\` | ${shot.status}${diff} | ${image('before', shot.id, `${shot.id} before`)} | ${image('after', shot.id, `${shot.id} after`)} |`);
    }
    lines.push('');
  }
  if (unchanged.length > 0) {
    lines.push(`<details><summary>Unchanged (${unchanged.length})</summary>`, '');
    for (const shot of unchanged) lines.push(`**\`${shot.id}\`**`, '', image('after', shot.id, shot.id), '');
    lines.push('</details>', '');
  }
  return lines.join('\n');
}

module.exports = async function publishVisual({ github, context, core, dir }) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const STATUSES = ['changed', 'unchanged', 'new', 'removed'];
  const shots = (manifest.shots || []).filter((shot) => ID.test(shot.id) && STATUSES.includes(shot.status)).map((shot) => ({ id: shot.id, status: shot.status, diffPixels: Number(shot.diffPixels) || 0 }));
  const videos = (manifest.videos || []).filter((id) => ID.test(id));
  const files = collect(dir);
  const pull = context.payload.pull_request;
  const prefix = `pr-${pull.number}/${pull.head.sha.slice(0, 12)}`;
  const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const commit = await commitFiles({ github, context, prefix, files, message: `Visual evidence for PR ${pull.number} at ${pull.head.sha.slice(0, 12)}` });
  const names = new Set(files.map((item) => `${item.side}/${item.name}`));
  const has = (side, name) => names.has(`${side}/${name}`);
  const url = (side, name) => `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/blob/${commit}/${prefix}/${side}/${name}?raw=true`;
  const body = render({ shots, videos, url, runUrl, has, privateRepo: Boolean(context.payload.repository && context.payload.repository.private) });

  const comments = await github.paginate(github.rest.issues.listComments, { ...context.repo, issue_number: pull.number, per_page: 100 });
  // Only the workflow's own comment: anyone who can comment could post the marker.
  const existing = comments.find((comment) => comment.user?.login === 'github-actions[bot]' && comment.body && comment.body.includes(MARKER));
  if (existing) await github.rest.issues.updateComment({ ...context.repo, comment_id: existing.id, body });
  else await github.rest.issues.createComment({ ...context.repo, issue_number: pull.number, body });
  await core.summary.addRaw(body).write();
};
