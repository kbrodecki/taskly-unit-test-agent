import type { Page, Route } from '@playwright/test';

export interface MockTodo {
  id: number;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export const NOW = new Date('2026-10-15T10:00:00Z');

export function todo(id: number, fields: Partial<MockTodo>): MockTodo {
  const stamp = new Date(NOW.getTime() - id * 3_600_000).toISOString();
  return { id, title: `Task ${id}`, description: '', priority: 'medium', due_date: null, completed: false, created_at: stamp, updated_at: stamp, ...fields };
}

export const SAMPLE: MockTodo[] = [
  todo(1, { title: 'Prepare the sprint demo', description: 'Slides and a short recording', priority: 'high', due_date: '2026-10-16' }),
  todo(2, { title: 'Review the onboarding checklist', priority: 'medium', due_date: '2026-10-20' }),
  todo(3, { title: 'Book the team retro room', priority: 'low', completed: true }),
  todo(4, { title: 'Send the release notes', priority: 'medium', due_date: '2026-10-14', completed: true }),
];

const json = (route: Route, status: number, body?: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) });

export async function mockApi(page: Page, initial: MockTodo[]): Promise<MockTodo[]> {
  const todos = initial.map((item) => ({ ...item }));
  await page.clock.setFixedTime(NOW);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api/, '');
    const method = request.method();
    const body = request.postDataJSON?.() ?? null;
    if (path === '/todos' && method === 'GET') return json(route, 200, todos);
    if (path === '/todos' && method === 'POST') {
      const created = todo(Math.max(0, ...todos.map((item) => item.id)) + 1, { ...body, created_at: NOW.toISOString(), updated_at: NOW.toISOString() });
      todos.unshift(created);
      return json(route, 201, created);
    }
    const match = path.match(/^\/todos\/(\d+)$/);
    const index = match ? todos.findIndex((item) => item.id === Number(match[1])) : -1;
    if (index === -1) return json(route, 404, { detail: 'Task not found.' });
    if (method === 'GET') return json(route, 200, todos[index]);
    if (method === 'PATCH') {
      const defined = Object.fromEntries(Object.entries(body ?? {}).filter(([, value]) => value !== undefined));
      todos[index] = { ...todos[index], ...defined, updated_at: NOW.toISOString() };
      return json(route, 200, todos[index]);
    }
    if (method === 'DELETE') {
      todos.splice(index, 1);
      return json(route, 204);
    }
    return json(route, 405, { detail: 'Method not allowed.' });
  });
  return todos;
}
