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
const QUOTED = '"(?:[^"\\\\]|\\\\.)*"';
const HEADER = new RegExp(`^diff --git (${QUOTED}|a/.+?) (${QUOTED}|b/.+)$`);

// Git C-quotes paths with special characters: "a/x\tz.ts", with octal escapes for UTF-8 bytes.
function unquote(path: string): string {
  if (!path.startsWith('"')) return path;
  const bytes: number[] = [];
  const body = path.slice(1, -1);
  const simple: Record<string, number> = { n: 10, t: 9, r: 13, '"': 34, '\\': 92, a: 7, b: 8, f: 12, v: 11 };
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== '\\') {
      bytes.push(...Buffer.from(body[i]));
    } else if (/[0-7]/.test(body[i + 1] ?? '')) {
      bytes.push(parseInt(body.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      bytes.push(simple[body[i + 1]] ?? body.charCodeAt(i + 1));
      i += 1;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

const strip = (path: string, side: 'a' | 'b') => unquote(path).replace(new RegExp(`^${side}/`), '');

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
    if (line.startsWith('diff --git ')) {
      const start = HEADER.exec(line);
      // An unreadable header still opens a section, so its hunks are never credited to the previous file; G1 then rejects the path.
      const path = start ? strip(start[2], 'b') : `(unreadable diff header) ${line.slice(11)}`;
      const oldPath = start ? strip(start[1], 'a') : path;
      current = { path, isNew: false, isDeleted: false, isRename: false, isSymlink: false, modeChanged: false, added: [], removed: [] };
      if (oldPath !== path) current.oldPath = oldPath;
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
      current.oldPath = unquote(line.replace(/^(?:rename|copy) from /, ''));
    } else if (line.startsWith('rename to ') || line.startsWith('copy to ')) {
      current.path = unquote(line.replace(/^(?:rename|copy) to /, ''));
    } else if (line === '-- ') {
      current = undefined;
    }
  }
  return files;
}
