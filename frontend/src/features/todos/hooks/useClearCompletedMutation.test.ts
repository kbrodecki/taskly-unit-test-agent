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
  return { queryClient, wrapper }
}

it('removes completed tasks from the cached list on success', async () => {
  const { queryClient, wrapper } = setup()
  const active = { ...todoFixture, id: 1, completed: false }
  const done = { ...todoFixture, id: 2, completed: true }
  queryClient.setQueryData(todoKeys.list, [active, done])
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 1 })
  const { result } = renderHook(() => useClearCompletedMutation(), { wrapper })
  let response: unknown
  await act(async () => {
    response = await result.current.mutateAsync()
  })
  expect(response).toEqual({ deleted: 1 })
  expect(todosApi.clearCompleted).toHaveBeenCalledTimes(1)
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([active])
})

it('leaves the cache empty when the list was never loaded', async () => {
  const { queryClient, wrapper } = setup()
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 0 })
  const { result } = renderHook(() => useClearCompletedMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync()
  })
  await waitFor(() => expect(result.current.data).toEqual({ deleted: 0 }))
  expect(queryClient.getQueryData(todoKeys.list)).toBeUndefined()
})

it('keeps the cached list and exposes the error when the request fails', async () => {
  const { queryClient, wrapper } = setup()
  const done = { ...todoFixture, completed: true }
  queryClient.setQueryData(todoKeys.list, [done])
  vi.mocked(todosApi.clearCompleted).mockRejectedValue(new Error('down'))
  const { result } = renderHook(() => useClearCompletedMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync().catch(() => undefined)
  })
  await waitFor(() => expect(result.current.error?.message).toBe('down'))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([done])
})
