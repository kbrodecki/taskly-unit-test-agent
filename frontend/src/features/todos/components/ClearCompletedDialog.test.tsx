import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { useClearCompletedMutation } from '../hooks/useClearCompletedMutation'
import { ClearCompletedDialog } from './ClearCompletedDialog'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useClearCompletedMutation', () => ({
  useClearCompletedMutation: vi.fn(),
}))
beforeEach(() => vi.clearAllMocks())

function mockMutation(overrides: Record<string, unknown> = {}) {
  const mutateAsync = vi.fn().mockResolvedValue({ deleted: 2 })
  vi.mocked(useClearCompletedMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync,
    ...overrides,
  } as unknown as ReturnType<typeof useClearCompletedMutation>)
  return mutateAsync
}

it('clears completed tasks and reports the deleted count', async () => {
  const user = userEvent.setup()
  const mutateAsync = mockMutation()
  const onCleared = vi.fn()
  render(
    <ClearCompletedDialog
      busy={false}
      onClose={vi.fn()}
      onCleared={onCleared}
    />,
  )
  expect(
    screen.getByRole('dialog', { name: 'Clear completed tasks?' }),
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Clear completed' }))
  await waitFor(() => expect(onCleared).toHaveBeenCalledWith(2))
  expect(mutateAsync).toHaveBeenCalledTimes(1)
})

it('cancels without clearing', async () => {
  const user = userEvent.setup()
  const mutateAsync = mockMutation()
  const onClose = vi.fn()
  render(
    <ClearCompletedDialog busy={false} onClose={onClose} onCleared={vi.fn()} />,
  )
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(mutateAsync).not.toHaveBeenCalled()
})

it('stays open and shows the server error when clearing fails', async () => {
  const user = userEvent.setup()
  const mutateAsync = mockMutation({ error: new Error('Server down') })
  mutateAsync.mockRejectedValue(new Error('Server down'))
  const onCleared = vi.fn()
  render(
    <ClearCompletedDialog
      busy={false}
      onClose={vi.fn()}
      onCleared={onCleared}
    />,
  )
  expect(screen.getByTestId('alert')).toHaveTextContent('Server down')
  await user.click(screen.getByRole('button', { name: 'Clear completed' }))
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  expect(onCleared).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeVisible()
})

it.each([
  ['the page is busy', true, false],
  ['the mutation is pending', false, true],
])('disables both actions while %s', async (_name, busy, isPending) => {
  const user = userEvent.setup()
  const mutateAsync = mockMutation({ isPending })
  render(
    <ClearCompletedDialog busy={busy} onClose={vi.fn()} onCleared={vi.fn()} />,
  )
  const clear = screen.getByRole('button', { name: 'Clearing…' })
  expect(clear).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await user.click(clear)
  expect(mutateAsync).not.toHaveBeenCalled()
})
