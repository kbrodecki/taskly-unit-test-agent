import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { todoFixture } from '../../../test/todoFixture'
import { useClearCompletedMutation } from './useClearCompletedMutation'

vi.mock('../api/todos', () => ({ todosApi: { clearCompleted: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  const { result } = renderHook(() => useClearCompletedMutation(), { wrapper })
  return { queryClient, result }
}

it('removes completed tasks from the cached list on success', async () => {
  const done = { ...todoFixture, id: 2, completed: true }
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 1 })
  const { queryClient, result } = setup()
  queryClient.setQueryData(todoKeys.list, [todoFixture, done])
  await expect(result.current.mutateAsync()).resolves.toEqual({ deleted: 1 })
  await waitFor(() =>
    expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture]),
  )
})

it('leaves the cache empty when no list was loaded', async () => {
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 0 })
  const { queryClient, result } = setup()
  await expect(result.current.mutateAsync()).resolves.toEqual({ deleted: 0 })
  expect(queryClient.getQueryCache().findAll()).toEqual([])
})

it('keeps the cached list and exposes the error when the request fails', async () => {
  const done = { ...todoFixture, id: 2, completed: true }
  vi.mocked(todosApi.clearCompleted).mockRejectedValue(new Error('boom'))
  const { queryClient, result } = setup()
  queryClient.setQueryData(todoKeys.list, [todoFixture, done])
  await expect(result.current.mutateAsync()).rejects.toThrow('boom')
  await waitFor(() => expect(result.current.error?.message).toBe('boom'))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture, done])
})
