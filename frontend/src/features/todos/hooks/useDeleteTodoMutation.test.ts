import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { remove: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  return {
    queryClient,
    ...renderHook(() => useDeleteTodoMutation(), { wrapper }),
  }
}

it('removes the deleted task from the cached list', async () => {
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const other = { ...todoFixture, id: 8 }
  const { queryClient, result } = setup()
  queryClient.setQueryData(todoKeys.list, [todoFixture, other])
  await act(() => result.current.mutateAsync(7))
  expect(todosApi.remove).toHaveBeenCalledWith(7)
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([other])
})

it('does not create a cache entry when no list is cached', async () => {
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { queryClient, result } = setup()
  await act(() => result.current.mutateAsync(7))
  expect(
    queryClient.getQueryCache().findAll({ queryKey: todoKeys.list }),
  ).toEqual([])
})

it('keeps the task in the cache when the request fails', async () => {
  vi.mocked(todosApi.remove).mockRejectedValue(new Error('nope'))
  const { queryClient, result } = setup()
  queryClient.setQueryData(todoKeys.list, [todoFixture])
  act(() => result.current.mutate(7))
  await waitFor(() => expect(result.current.error?.message).toBe('nope'))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
