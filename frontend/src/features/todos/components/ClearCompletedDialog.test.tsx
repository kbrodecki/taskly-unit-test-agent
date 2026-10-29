import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { useClearCompletedMutation } from '../hooks/useClearCompletedMutation'
import { ClearCompletedDialog } from './ClearCompletedDialog'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useClearCompletedMutation', () => ({
  useClearCompletedMutation: vi.fn(),
}))

function mockMutation(
  mutateAsync: ReturnType<typeof vi.fn>,
  isPending = false,
  error: Error | null = null,
) {
  vi.mocked(useClearCompletedMutation).mockReturnValue({
    isPending,
    error,
    mutateAsync,
  } as unknown as ReturnType<typeof useClearCompletedMutation>)
}

it('shows the confirmation and allows cancelling without clearing', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn()
  mockMutation(mutateAsync)
  const onClose = vi.fn()
  const onCleared = vi.fn()
  render(
    <ClearCompletedDialog
      busy={false}
      onClose={onClose}
      onCleared={onCleared}
    />,
  )
  expect(
    screen.getByRole('dialog', { name: 'Clear completed tasks?' }),
  ).toBeVisible()
  expect(
    screen.getByText('All completed tasks will be permanently deleted.'),
  ).toBeVisible()
  expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(onCleared).not.toHaveBeenCalled()
})

it('clears completed tasks and reports the deleted count', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn().mockResolvedValue({ deleted: 3 })
  mockMutation(mutateAsync)
  const onCleared = vi.fn()
  render(
    <ClearCompletedDialog
      busy={false}
      onClose={vi.fn()}
      onCleared={onCleared}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Clear completed' }))
  expect(mutateAsync).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(onCleared).toHaveBeenCalledWith(3))
})

it('stays open, shows the error and does not report when clearing fails', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn().mockRejectedValue(new Error('nope'))
  mockMutation(mutateAsync, false, new Error('Could not clear.'))
  const onCleared = vi.fn()
  render(
    <ClearCompletedDialog
      busy={false}
      onClose={vi.fn()}
      onCleared={onCleared}
    />,
  )
  expect(screen.getByTestId('alert')).toHaveTextContent('Could not clear.')
  await user.click(screen.getByRole('button', { name: 'Clear completed' }))
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  expect(onCleared).not.toHaveBeenCalled()
  expect(
    screen.getByRole('dialog', { name: 'Clear completed tasks?' }),
  ).toBeVisible()
})

it.each([
  ['the mutation is pending', true, false],
  ['the page is busy', false, true],
])('disables both actions while %s', (_, isPending, busy) => {
  mockMutation(vi.fn(), isPending)
  render(
    <ClearCompletedDialog busy={busy} onClose={vi.fn()} onCleared={vi.fn()} />,
  )
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Clearing…' })).toBeDisabled()
})
