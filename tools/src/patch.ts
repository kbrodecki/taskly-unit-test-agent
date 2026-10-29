export interface FileDiff {
  path: string;
  isNew: boolean;
  isDeleted: boolean;
  added: string[];
  removed: string[];
}

export function parsePatch(text: string): FileDiff[] {
  const files: FileDiff[] = [];
  let current: FileDiff | undefined;
  let oldPath = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ') || line === '-- ') {
      current = undefined;
    } else if (line.startsWith('--- ')) {
      oldPath = line.slice(4).trim();
    } else if (line.startsWith('+++ ')) {
      const newPath = line.slice(4).trim();
      const isDeleted = newPath === '/dev/null';
      current = {
        path: (isDeleted ? oldPath : newPath).replace(/^[ab]\//, ''),
        isNew: oldPath === '/dev/null',
        isDeleted,
        added: [],
        removed: [],
      };
      files.push(current);
    } else if (current && line.startsWith('+')) {
      current.added.push(line.slice(1));
    } else if (current && line.startsWith('-')) {
      current.removed.push(line.slice(1));
    }
  }
  return files;
}
