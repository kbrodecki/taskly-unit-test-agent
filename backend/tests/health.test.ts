import express from 'express';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { createHealthRouter } from '../src/api/health.ts';
import type { Database } from '../src/features/todos/types.ts';

function setup(findFirst: ReturnType<typeof vi.fn>) {
  const database = { todo: { findFirst } } as unknown as Database;
  const app = express();
  app.use('/api', createHealthRouter(database));
  return app;
}

it('reports ok after querying the database', async () => {
  const findFirst = vi.fn().mockResolvedValue(null);
  const response = await request(setup(findFirst)).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(findFirst).toHaveBeenCalledWith({ select: { id: true } });
});
