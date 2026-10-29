import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useTodosQuery } from './useTodosQuery'

vi.mock('../api/todos', () => ({ todosApi: { list: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  return { queryClient, ...renderHook(() => useTodosQuery(), { wrapper }) }
}

it('is pending until the tasks load, then caches them under the list key', async () => {
  vi.mocked(todosApi.list).mockResolvedValue([todoFixture])
  const { queryClient, result } = setup()
  expect(result.current.isPending).toBe(true)
  await waitFor(() => expect(result.current.data).toEqual([todoFixture]))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('passes the abort signal to the api', async () => {
  vi.mocked(todosApi.list).mockResolvedValue([])
  const { result } = setup()
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(todosApi.list).toHaveBeenCalledWith(expect.any(AbortSignal))
})

it('exposes the error when loading fails', async () => {
  vi.mocked(todosApi.list).mockRejectedValue(new Error('down'))
  const { result } = setup()
  await waitFor(() => expect(result.current.error?.message).toBe('down'))
})
