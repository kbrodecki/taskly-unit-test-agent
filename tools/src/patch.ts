export interface FileDiff {
  path: string;
  // Set when git reports a rename or copy; both paths must pass G1.
  oldPath?: string;
  isNew: boolean;
  isDeleted: boolean;
  isRename: boolean;
  isSymlink: boolean;
  modeChanged: boolean;
  added: string[];
  removed: string[];
}

const HUNK = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

// Reads `git diff` and `git format-patch` output. Header lines are only recognised outside hunks,
// and hunk bodies are consumed by their line counts, so content that starts with "--- " or "+++ "
// is never mistaken for a header. A pure rename has no hunks and is still reported.
export function parsePatch(text: string): FileDiff[] {
  const files: FileDiff[] = [];
  let current: FileDiff | undefined;
  let oldLeft = 0;
  let newLeft = 0;
  for (const line of text.split('\n')) {
    if (current && (oldLeft > 0 || newLeft > 0)) {
      if (line.startsWith('\\')) continue;
      if (line.startsWith('+')) {
        current.added.push(line.slice(1));
        newLeft -= 1;
      } else if (line.startsWith('-')) {
        current.removed.push(line.slice(1));
        oldLeft -= 1;
      } else {
        oldLeft -= 1;
        newLeft -= 1;
      }
      continue;
    }
    const start = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (start) {
      current = { path: start[2], isNew: false, isDeleted: false, isRename: false, isSymlink: false, modeChanged: false, added: [], removed: [] };
      if (start[1] !== start[2]) current.oldPath = start[1];
      files.push(current);
      continue;
    }
    if (!current) continue;
    const hunk = HUNK.exec(line);
    if (hunk) {
      oldLeft = hunk[1] === undefined ? 1 : Number(hunk[1]);
      newLeft = hunk[2] === undefined ? 1 : Number(hunk[2]);
    } else if (line.startsWith('new file mode ')) {
      current.isNew = true;
      if (line.endsWith('120000')) current.isSymlink = true;
    } else if (line.startsWith('deleted file mode ')) {
      current.isDeleted = true;
    } else if (line.startsWith('new mode ')) {
      current.modeChanged = true;
      if (line.endsWith('120000')) current.isSymlink = true;
    } else if (line.startsWith('rename from ') || line.startsWith('copy from ')) {
      current.isRename = true;
      current.oldPath = line.replace(/^(?:rename|copy) from /, '');
    } else if (line.startsWith('rename to ') || line.startsWith('copy to ')) {
      current.path = line.replace(/^(?:rename|copy) to /, '');
    } else if (line === '-- ') {
      current = undefined;
    }
  }
  return files;
}
