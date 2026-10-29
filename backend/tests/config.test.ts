import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

const names = ['DATABASE_URL', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'DB_PORT', 'POSTGRES_DB'];

beforeEach(() => {
  for (const name of names) vi.stubEnv(name, '');
});
afterEach(() => vi.unstubAllEnvs());

function setParts() {
  vi.stubEnv('POSTGRES_USER', 'user');
  vi.stubEnv('POSTGRES_PASSWORD', 'p@ss');
  vi.stubEnv('POSTGRES_HOST', 'db.local');
  vi.stubEnv('DB_PORT', '5433');
  vi.stubEnv('POSTGRES_DB', 'my db');
}

it('prefers the override and rewrites the psycopg scheme', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://env/db');
  expect(resolveDatabaseUrl('postgresql+psycopg://override/db')).toBe('postgresql://override/db');
});
it('uses DATABASE_URL when no override is given', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql+psycopg://env/db');
  expect(resolveDatabaseUrl()).toBe('postgresql://env/db');
});
it('builds the url from the postgres variables with escaping', () => {
  setParts();
  expect(resolveDatabaseUrl()).toBe('postgresql://user:p%40ss@db.local:5433/my%20db');
});
it.each(names.slice(1))('throws when %s is missing', (name) => {
  setParts();
  vi.stubEnv(name, '');
  expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${name}`);
});
