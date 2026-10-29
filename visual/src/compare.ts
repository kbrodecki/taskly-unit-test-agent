import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export type ShotStatus = 'changed' | 'unchanged' | 'new' | 'removed';

export interface Shot {
  id: string;
  status: ShotStatus;
  diffPixels: number;
}

const ids = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.png')).map((name) => name.slice(0, -4)) : []);

export function compareShot(before: PNG, after: PNG): { diffPixels: number; diff?: PNG } {
  if (before.width !== after.width || before.height !== after.height) return { diffPixels: Math.max(before.width * before.height, after.width * after.height) };
  const diff = new PNG({ width: after.width, height: after.height });
  const diffPixels = pixelmatch(before.data, after.data, diff.data, after.width, after.height, { threshold: 0.1 });
  return { diffPixels, diff };
}

export function compareDirs(beforeDir: string, afterDir: string, diffDir: string): Shot[] {
  const all = [...new Set([...ids(beforeDir), ...ids(afterDir)])].sort();
  mkdirSync(diffDir, { recursive: true });
  return all.map((id) => {
    const beforeFile = join(beforeDir, `${id}.png`);
    const afterFile = join(afterDir, `${id}.png`);
    if (!existsSync(beforeFile)) return { id, status: 'new', diffPixels: 0 };
    if (!existsSync(afterFile)) return { id, status: 'removed', diffPixels: 0 };
    const { diffPixels, diff } = compareShot(PNG.sync.read(readFileSync(beforeFile)), PNG.sync.read(readFileSync(afterFile)));
    if (diff && diffPixels > 0) writeFileSync(join(diffDir, `${id}.png`), PNG.sync.write(diff));
    return { id, status: diffPixels > 0 ? 'changed' : 'unchanged', diffPixels };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = resolve(process.argv[2] ?? 'out');
  const shots = compareDirs(join(out, 'before'), join(out, 'after'), join(out, 'diff'));
  const videos = existsSync(join(out, 'after')) ? readdirSync(join(out, 'after')).filter((name) => name.endsWith('.webm')).map((name) => name.slice(0, -5)) : [];
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify({ shots, videos }, null, 2)}\n`);
  for (const shot of shots) console.log(`${shot.status.padEnd(9)} ${shot.id}${shot.diffPixels ? ` (${shot.diffPixels} px)` : ''}`);
}
