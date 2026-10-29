import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { update: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  return {
    queryClient,
    ...renderHook(() => useUpdateTodoMutation(), { wrapper }),
  }
}

it('replaces only the updated task in the cached list', async () => {
  const saved = { ...todoFixture, completed: true }
  const other = { ...todoFixture, id: 8 }
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { queryClient, result } = setup()
  queryClient.setQueryData(todoKeys.list, [todoFixture, other])
  await act(() =>
    result.current.mutateAsync({ id: 7, input: { completed: true } }),
  )
  expect(todosApi.update).toHaveBeenCalledWith(7, { completed: true })
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([saved, other])
})

it('does not create a cache entry when no list is cached', async () => {
  vi.mocked(todosApi.update).mockResolvedValue(todoFixture)
  const { queryClient, result } = setup()
  await act(() => result.current.mutateAsync({ id: 7, input: { title: 'x' } }))
  expect(
    queryClient.getQueryCache().findAll({ queryKey: todoKeys.list }),
  ).toEqual([])
})

it('keeps the cached list when the request fails', async () => {
  vi.mocked(todosApi.update).mockRejectedValue(new Error('nope'))
  const { queryClient, result } = setup()
  queryClient.setQueryData(todoKeys.list, [todoFixture])
  act(() => result.current.mutate({ id: 7, input: { completed: true } }))
  await waitFor(() => expect(result.current.error?.message).toBe('nope'))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
