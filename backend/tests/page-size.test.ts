import { describe, expect, it } from 'vitest';
import { pageSize } from '../src/core/page-size.ts';

describe('pageSize', () => {
  it('returns a valid requested size unchanged', () => {
    expect(pageSize('50')).toBe(50);
  });

  it.each([
    ['100', 100],
    ['101', 100],
    ['100000', 100],
  ])('clamps %s to the maximum', (requested, expected) => {
    expect(pageSize(requested)).toBe(expected);
  });

  it('accepts the smallest size of 1', () => {
    expect(pageSize('1')).toBe(1);
  });

  it.each([undefined, '', 'abc', '0', '-5', '2.5', 'NaN', 'Infinity'])(
    'falls back to the default for %s',
    (requested) => {
      expect(pageSize(requested)).toBe(20);
    },
  );

  it('uses a custom fallback and maximum', () => {
    expect(pageSize('abc', 10, 30)).toBe(10);
    expect(pageSize('45', 10, 30)).toBe(30);
  });
});
