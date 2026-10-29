import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useClearCompletedMutation } from './useClearCompletedMutation'

vi.mock('../api/todos', () => ({ todosApi: { clearCompleted: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  return {
    queryClient,
    ...renderHook(() => useClearCompletedMutation(), { wrapper }),
  }
}

it('removes completed tasks from the cached list and returns the count', async () => {
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 1 })
  const active = { ...todoFixture, id: 8, completed: false }
  const done = { ...todoFixture, id: 9, completed: true }
  const { queryClient, result } = setup()
  queryClient.setQueryData(todoKeys.list, [active, done])
  let value: { deleted: number } | undefined
  await act(async () => {
    value = await result.current.mutateAsync()
  })
  expect(value).toEqual({ deleted: 1 })
  expect(todosApi.clearCompleted).toHaveBeenCalledTimes(1)
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([active])
})

it('does not create a cache entry when no list is cached', async () => {
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 0 })
  const { queryClient, result } = setup()
  await act(() => result.current.mutateAsync())
  expect(
    queryClient.getQueryCache().findAll({ queryKey: todoKeys.list }),
  ).toEqual([])
})

it('keeps the cached list when the request fails', async () => {
  vi.mocked(todosApi.clearCompleted).mockRejectedValue(new Error('nope'))
  const done = { ...todoFixture, completed: true }
  const { queryClient, result } = setup()
  queryClient.setQueryData(todoKeys.list, [done])
  act(() => result.current.mutate())
  await waitFor(() => expect(result.current.error?.message).toBe('nope'))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([done])
})
