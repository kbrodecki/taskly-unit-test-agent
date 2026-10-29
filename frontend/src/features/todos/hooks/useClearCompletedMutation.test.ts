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
  const { result } = renderHook(() => useClearCompletedMutation(), { wrapper })
  return { queryClient, result }
}

it('removes completed tasks from the cached list on success', async () => {
  const active = { ...todoFixture, id: 1, completed: false }
  const done = { ...todoFixture, id: 2, completed: true }
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 1 })
  const { queryClient, result } = setup()
  queryClient.setQueryData(todoKeys.list, [active, done])
  let response: unknown
  await act(async () => {
    response = await result.current.mutateAsync()
  })
  expect(response).toEqual({ deleted: 1 })
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([active])
})

it('leaves the cache empty when no list was loaded', async () => {
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 0 })
  const { queryClient, result } = setup()
  await act(async () => {
    await result.current.mutateAsync()
  })
  await waitFor(() => expect(result.current.data).toEqual({ deleted: 0 }))
  expect(queryClient.getQueryData(todoKeys.list)).toBeUndefined()
})

it('keeps the cached list and exposes the error on failure', async () => {
  vi.mocked(todosApi.clearCompleted).mockRejectedValue(new Error('nope'))
  const done = { ...todoFixture, completed: true }
  const { queryClient, result } = setup()
  queryClient.setQueryData(todoKeys.list, [done])
  await act(async () => {
    await result.current.mutateAsync().catch(() => undefined)
  })
  await waitFor(() => expect(result.current.error?.message).toBe('nope'))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([done])
})
