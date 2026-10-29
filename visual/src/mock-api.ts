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

// Serves only the requests the scenarios make; anything else gets a 404 so a new scenario fails loudly.
export async function mockApi(page: Page, initial: MockTodo[]): Promise<void> {
  const todos = initial.map((item) => ({ ...item }));
  await page.clock.setFixedTime(NOW);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api/, '');
    const method = request.method();
    if (path === '/todos' && method === 'GET') return json(route, 200, todos);
    if (path === '/todos/completed' && method === 'DELETE') {
      const before = todos.length;
      todos.splice(0, todos.length, ...todos.filter((item) => !item.completed));
      return json(route, 200, { deleted: before - todos.length });
    }
    return json(route, 404, { detail: `No mock for ${method} ${path}.` });
  });
}
