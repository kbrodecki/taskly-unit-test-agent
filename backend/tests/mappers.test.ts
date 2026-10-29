import { it, expect } from 'vitest';
import { fromModel, isOverdue } from '../src/features/todos/mappers.ts';
import { record, todo } from './fixture.ts';

it.each([false, true])('maps records to JSON without mutation (completed: %s)', (completed) => {
  const input = { ...record, completed };
  const before = structuredClone(input);
  expect(fromModel(input)).toEqual({ ...todo, completed });
  expect(input).toEqual(before);
});
it('preserves an absent due date', () => {
  expect(fromModel({ ...record, due_date: null }).due_date).toBeNull();
});
it('rejects invalid stored data', () => {
  expect(() => fromModel({ ...record, title: '' })).toThrow();
});
it.each([
  { name: 'incomplete todo due before today', patch: { completed: false, due_date: '2026-10-14' }, expected: true },
  { name: 'incomplete todo due today', patch: { completed: false, due_date: '2026-10-15' }, expected: false },
  { name: 'incomplete todo due after today', patch: { completed: false, due_date: '2026-10-16' }, expected: false },
  { name: 'completed todo due before today', patch: { completed: true, due_date: '2026-10-14' }, expected: false },
  { name: 'incomplete todo without a due date', patch: { completed: false, due_date: null }, expected: false },
])('isOverdue is $expected for $name', ({ patch, expected }) => {
  expect(isOverdue({ ...todo, ...patch }, '2026-10-15')).toBe(expected);
});
