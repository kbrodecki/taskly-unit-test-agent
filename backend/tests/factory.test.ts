import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../src/factory.ts';
import type { Database } from '../src/features/todos/types.ts';
import { record, todo } from './fixture.ts';

afterEach(() => vi.restoreAllMocks());

function setup(overrides: Record<string, unknown> = {}) {
  const findMany = vi.fn().mockResolvedValue([record]);
  const findFirst = vi.fn().mockResolvedValue(null);
  const database = { todo: { findMany, findFirst, ...overrides } } as unknown as Database;
  return { app: createApp(database), findMany, findFirst };
}

it('does not expose the x-powered-by header', async () => {
  const response = await request(setup().app).get('/api/health');
  expect(response.body).toEqual({ status: 'ok' });
  expect(Object.keys(response.headers)).not.toContain('x-powered-by');
});
it('mounts the health router under /api', async () => {
  const { app, findFirst } = setup();
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(findFirst).toHaveBeenCalledOnce();
});
it('mounts the todos router under /api/todos', async () => {
  const { app } = setup();
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
});
it('serves the OpenAPI specification', async () => {
  const response = await request(setup().app).get('/openapi.json');
  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('openapi');
  expect(response.body).toHaveProperty('paths');
});
it('serves the docs page', async () => {
  const response = await request(setup().app).get('/docs/');
  expect(response.status).toBe(200);
  expect(response.text).toContain('swagger-ui');
});
it('responds with 404 json for unknown routes', async () => {
  const response = await request(setup().app).get('/nope');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Not Found' });
});
it('responds with 422 for malformed JSON', async () => {
  const response = await request(setup().app).post('/api/todos').set('Content-Type', 'application/json').send('{bad');
  expect(response.status).toBe(422);
  expect(response.body).toEqual({ detail: 'Invalid JSON.' });
});
it('responds with 413 for an oversized body', async () => {
  const response = await request(setup().app).post('/api/todos').send({ title: 'x'.repeat(200000) });
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ detail: 'Request body too large.' });
});
it('logs unexpected errors and responds with 500', async () => {
  const error = new Error('boom');
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { app } = setup({ findMany: vi.fn().mockRejectedValue(error) });
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
  expect(log).toHaveBeenCalledWith(error);
});
