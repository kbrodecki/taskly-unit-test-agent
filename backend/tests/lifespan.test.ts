import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDatabase: vi.fn(),
  initialize: vi.fn(),
  resolveDatabaseUrl: vi.fn(),
  createApp: vi.fn(),
}));

vi.mock('../src/core/database.ts', () => ({ createDatabase: mocks.createDatabase, initialize: mocks.initialize }));
vi.mock('../src/core/config.ts', () => ({ resolveDatabaseUrl: mocks.resolveDatabaseUrl }));
vi.mock('../src/factory.ts', () => ({ createApp: mocks.createApp }));

import { start } from '../src/core/lifespan.ts';

function setup() {
  const database = { $connect: vi.fn().mockResolvedValue(undefined), $disconnect: vi.fn().mockResolvedValue(undefined) };
  const listener = Object.assign(new EventEmitter(), { address: () => ({ port: 4321 }), close: vi.fn() });
  const listen = vi.fn((port: number, host: string, callback: () => void) => {
    queueMicrotask(callback);
    return listener;
  });
  mocks.createDatabase.mockReturnValue(database);
  mocks.initialize.mockResolvedValue(undefined);
  mocks.resolveDatabaseUrl.mockReturnValue('postgresql://db');
  mocks.createApp.mockReturnValue({ listen });
  return { database, listener, listen };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  Object.values(mocks).forEach((mock) => mock.mockReset());
  process.exitCode = undefined;
});

it('connects, initializes and listens on the configured port', async () => {
  const { database, listener, listen } = setup();
  vi.stubEnv('API_PORT', '4321');
  const once = vi.spyOn(process, 'once').mockImplementation(() => process);
  const result = await start();
  expect(mocks.createDatabase).toHaveBeenCalledWith('postgresql://db');
  expect(database.$connect).toHaveBeenCalledOnce();
  expect(mocks.initialize).toHaveBeenCalledWith(database);
  expect(listen).toHaveBeenCalledWith(4321, '0.0.0.0', expect.any(Function));
  expect(console.log).toHaveBeenCalledWith('Taskly App Node API listening on port 4321');
  expect(result).toEqual({ server: listener, database });
  expect(once.mock.calls.map(([signal]) => signal)).toEqual(['SIGTERM', 'SIGINT']);
});

it('defaults to port 8000', async () => {
  const { listen } = setup();
  vi.stubEnv('API_PORT', '');
  vi.spyOn(process, 'once').mockImplementation(() => process);
  await start();
  expect(listen).toHaveBeenCalledWith(8000, '0.0.0.0', expect.any(Function));
});

it('disconnects and rethrows when startup fails', async () => {
  const { database } = setup();
  const failure = new Error('connect failed');
  database.$connect.mockRejectedValue(failure);
  await expect(start()).rejects.toBe(failure);
  expect(database.$disconnect).toHaveBeenCalledOnce();
  expect(mocks.createApp).not.toHaveBeenCalled();
});

it('rejects when the listener emits an error', async () => {
  const { database, listener, listen } = setup();
  const failure = new Error('EADDRINUSE');
  listen.mockImplementation(() => {
    queueMicrotask(() => listener.emit('error', failure));
    return listener;
  });
  await expect(start()).rejects.toBe(failure);
  expect(database.$disconnect).toHaveBeenCalledOnce();
});

it('closes the server and disconnects the database on shutdown', async () => {
  const { database, listener } = setup();
  const handlers: Record<string, () => void> = {};
  vi.spyOn(process, 'once').mockImplementation(((signal: string, handler: () => void) => {
    handlers[signal] = handler;
    return process;
  }) as never);
  listener.close.mockImplementation((callback: () => Promise<void>) => callback());
  await start();
  handlers.SIGTERM();
  await vi.waitFor(() => expect(database.$disconnect).toHaveBeenCalledOnce());
  expect(listener.close).toHaveBeenCalledOnce();
  expect(process.exitCode).toBeUndefined();
});

it('sets a failing exit code when disconnecting fails during shutdown', async () => {
  const { database, listener } = setup();
  const failure = new Error('disconnect failed');
  const handlers: Record<string, () => void> = {};
  vi.spyOn(process, 'once').mockImplementation(((signal: string, handler: () => void) => {
    handlers[signal] = handler;
    return process;
  }) as never);
  database.$disconnect.mockRejectedValue(failure);
  listener.close.mockImplementation((callback: () => Promise<void>) => callback());
  await start();
  handlers.SIGINT();
  await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith(failure));
  expect(process.exitCode).toBe(1);
});

it('forces exit with code 1 when the server does not close in time', async () => {
  const { listener } = setup();
  const handlers: Record<string, () => void> = {};
  vi.spyOn(process, 'once').mockImplementation(((signal: string, handler: () => void) => {
    handlers[signal] = handler;
    return process;
  }) as never);
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  await start();
  vi.useFakeTimers();
  handlers.SIGTERM();
  expect(listener.close).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(10000);
  expect(exit).toHaveBeenCalledWith(1);
});
