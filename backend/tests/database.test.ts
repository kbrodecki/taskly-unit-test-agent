import { expect, it, vi } from 'vitest';
import { initialize } from '../src/core/database.ts';
import type { Database } from '../src/features/todos/types.ts';

it('creates the todos table if it does not exist', async () => {
  const $executeRaw = vi.fn().mockResolvedValue(0);
  await initialize({ $executeRaw } as unknown as Database);
  expect($executeRaw).toHaveBeenCalledOnce();
  const sql = ($executeRaw.mock.calls[0][0] as string[]).join('');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS todos');
  expect(sql).toContain('title VARCHAR(120) NOT NULL');
});

it('propagates a database failure', async () => {
  const $executeRaw = vi.fn().mockRejectedValue(new Error('down'));
  await expect(initialize({ $executeRaw } as unknown as Database)).rejects.toThrow('down');
});
