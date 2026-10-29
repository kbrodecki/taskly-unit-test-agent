import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { expect, it } from 'vitest'
import { todoKeys } from '../api/queryKeys'
import { useTodosBusy } from './useTodosBusy'

let release: () => void = () => undefined

function setup(mutationKey: readonly string[]) {
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  return renderHook(
    () => ({
      busy: useTodosBusy(),
      mutation: useMutation({
        mutationKey,
        mutationFn: () => new Promise<void>((resolve) => (release = resolve)),
      }),
    }),
    { wrapper },
  )
}

it('is false when nothing is mutating', () => {
  const { result } = setup(todoKeys.create)
  expect(result.current.busy).toBe(false)
})

it('is true while a todo mutation runs and false after it settles', async () => {
  const { result } = setup(todoKeys.create)
  act(() => result.current.mutation.mutate())
  await waitFor(() => expect(result.current.busy).toBe(true))
  await act(async () => release())
  await waitFor(() => expect(result.current.busy).toBe(false))
})

it('ignores mutations outside the todos keys', async () => {
  const { result } = setup(['other'])
  act(() => result.current.mutation.mutate())
  await waitFor(() => expect(result.current.mutation.isPending).toBe(true))
  expect(result.current.busy).toBe(false)
  await act(async () => release())
})
