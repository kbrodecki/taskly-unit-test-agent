import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { compareDirs, compareShot } from '../src/compare.ts';

function png(width: number, height: number, red: number): PNG {
  const image = new PNG({ width, height });
  for (let i = 0; i < image.data.length; i += 4) image.data.set([red, 0, 0, 255], i);
  return image;
}

describe('compareShot', () => {
  it('finds no difference between identical images', () => {
    expect(compareShot(png(4, 4, 10), png(4, 4, 10)).diffPixels).toBe(0);
  });

  it('counts changed pixels', () => {
    expect(compareShot(png(4, 4, 0), png(4, 4, 255)).diffPixels).toBe(16);
  });

  it('treats a size change as a change of every pixel', () => {
    expect(compareShot(png(4, 4, 0), png(4, 5, 0)).diffPixels).toBe(20);
  });
});

describe('compareDirs', () => {
  it('labels screenshots as changed, unchanged, new or removed', () => {
    const root = mkdtempSync(join(tmpdir(), 'visual-'));
    const write = (side: string, id: string, image: PNG) => {
      mkdirSync(join(root, side), { recursive: true });
      writeFileSync(join(root, side, `${id}.png`), PNG.sync.write(image));
    };
    write('before', 'same', png(2, 2, 1));
    write('after', 'same', png(2, 2, 1));
    write('before', 'edited', png(2, 2, 0));
    write('after', 'edited', png(2, 2, 255));
    write('after', 'added', png(2, 2, 0));
    write('before', 'dropped', png(2, 2, 0));

    const shots = compareDirs(join(root, 'before'), join(root, 'after'), join(root, 'diff'));

    expect(shots.map((shot) => [shot.id, shot.status])).toEqual([
      ['added', 'new'],
      ['dropped', 'removed'],
      ['edited', 'changed'],
      ['same', 'unchanged'],
    ]);
  });
});
