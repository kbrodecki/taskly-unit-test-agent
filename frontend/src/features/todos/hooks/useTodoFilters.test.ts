import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useTodoFilters } from './useTodoFilters'

const done = { ...todoFixture, id: 8, title: 'Write report', completed: true }
const todos = [todoFixture, done]

it('starts with all tasks, no search and newest sorting', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
  expect(result.current.visible).toEqual([done, todoFixture])
})

it('narrows the visible tasks when the filter changes', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setFilter('completed'))
  expect(result.current.filter).toBe('completed')
  expect(result.current.visible).toEqual([done])
  act(() => result.current.setFilter('active'))
  expect(result.current.visible).toEqual([todoFixture])
})

it('narrows the visible tasks by search text', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setSearch('REPORT'))
  expect(result.current.search).toBe('REPORT')
  expect(result.current.visible).toEqual([done])
})

it('reorders the visible tasks when the sort changes', () => {
  const high = { ...todoFixture, id: 9, priority: 'high' as const }
  const { result } = renderHook(() => useTodoFilters([todoFixture, high]))
  act(() => result.current.setSort('priority'))
  expect(result.current.sort).toBe('priority')
  expect(result.current.visible).toEqual([high, todoFixture])
})

it('reflects new tasks passed on rerender', () => {
  const { result, rerender } = renderHook(
    ({ items }) => useTodoFilters(items),
    { initialProps: { items: [todoFixture] } },
  )
  rerender({ items: todos })
  expect(result.current.visible).toEqual([done, todoFixture])
})
