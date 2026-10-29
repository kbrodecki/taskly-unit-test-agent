import { afterEach, expect, it, vi } from 'vitest';

const start = vi.hoisted(() => vi.fn());
vi.mock('../src/core/lifespan.ts', () => ({ start }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  start.mockReset();
  process.exitCode = undefined;
});

it('starts the server', async () => {
  start.mockResolvedValue(undefined);
  await import('../src/main.ts');
  expect(start).toHaveBeenCalledOnce();
  expect(process.exitCode).toBeUndefined();
});

it('logs the error and sets a failing exit code when startup fails', async () => {
  const failure = new Error('boom');
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  start.mockRejectedValue(failure);
  await import('../src/main.ts');
  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(log).toHaveBeenCalledWith('Cannot start Taskly App Node API:', failure);
});
