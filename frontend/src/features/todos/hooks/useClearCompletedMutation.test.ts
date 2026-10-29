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

it('removes completed tasks from the cached list and returns the deleted count', async () => {
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 1 })
  const { queryClient, result } = setup()
  const active = { ...todoFixture, id: 1, completed: false }
  const done = { ...todoFixture, id: 2, completed: true }
  queryClient.setQueryData(todoKeys.list, [active, done])
  let response: { deleted: number } | undefined
  await act(async () => {
    response = await result.current.mutateAsync()
  })
  expect(response).toEqual({ deleted: 1 })
  expect(todosApi.clearCompleted).toHaveBeenCalledTimes(1)
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([active])
})

it('does not create a list in the cache when none was loaded', async () => {
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 0 })
  const { queryClient, result } = setup()
  await act(async () => {
    await result.current.mutateAsync()
  })
  await waitFor(() => expect(result.current.data).toEqual({ deleted: 0 }))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual(undefined)
})

it('keeps the cached list and exposes the error when clearing fails', async () => {
  vi.mocked(todosApi.clearCompleted).mockRejectedValue(new Error('Failed.'))
  const { queryClient, result } = setup()
  const done = { ...todoFixture, completed: true }
  queryClient.setQueryData(todoKeys.list, [done])
  await act(async () => {
    await result.current.mutateAsync().catch(() => undefined)
  })
  await waitFor(() => expect(result.current.error?.message).toBe('Failed.'))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([done])
})
