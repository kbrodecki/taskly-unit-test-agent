import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { create: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  return {
    queryClient,
    ...renderHook(() => useCreateTodoMutation(), { wrapper }),
  }
}

const input = {
  title: 'Prepare a demo',
  description: '',
  priority: 'medium' as const,
  due_date: null,
  completed: false,
}

it('creates the cache list with the saved task when empty', async () => {
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { queryClient, result } = setup()
  await act(() => result.current.mutateAsync(input))
  expect(todosApi.create).toHaveBeenCalledWith(input)
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('prepends the saved task and replaces a duplicate id', async () => {
  const other = { ...todoFixture, id: 1, title: 'Other' }
  const saved = { ...todoFixture, id: 2, title: 'New' }
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { queryClient, result } = setup()
  queryClient.setQueryData(todoKeys.list, [other, { ...saved, title: 'Stale' }])
  await act(() => result.current.mutateAsync(input))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([saved, other])
})

it('leaves the cache untouched when the request fails', async () => {
  vi.mocked(todosApi.create).mockRejectedValue(new Error('nope'))
  const { queryClient, result } = setup()
  queryClient.setQueryData(todoKeys.list, [todoFixture])
  act(() => result.current.mutate(input))
  await waitFor(() => expect(result.current.error?.message).toBe('nope'))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
