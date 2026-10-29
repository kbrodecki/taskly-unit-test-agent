import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { useClearCompletedMutation } from '../hooks/useClearCompletedMutation'
import { ClearCompletedDialog } from './ClearCompletedDialog'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useClearCompletedMutation', () => ({
  useClearCompletedMutation: vi.fn(),
}))

function mockMutation(
  overrides: { isPending?: boolean; error?: Error | null } = {},
  mutateAsync = vi.fn().mockResolvedValue({ deleted: 2 }),
) {
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
  const onClose = vi.fn()
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
  await user.click(screen.getByRole('button', { name: 'Clear completed' }))
  expect(mutateAsync).toHaveBeenCalledTimes(1)
  expect(onCleared).toHaveBeenCalledWith(2)
  expect(onClose).not.toHaveBeenCalled()
})

it('closes from the cancel button without clearing', async () => {
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

it('shows the server error and stays open when clearing fails', async () => {
  const user = userEvent.setup()
  const mutateAsync = mockMutation(
    { error: new Error('The server is unavailable.') },
    vi.fn().mockRejectedValue(new Error('The server is unavailable.')),
  )
  const onCleared = vi.fn()
  const onClose = vi.fn()
  render(
    <ClearCompletedDialog
      busy={false}
      onClose={onClose}
      onCleared={onCleared}
    />,
  )
  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Clear completed' }))
  expect(mutateAsync).toHaveBeenCalledTimes(1)
  expect(onCleared).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeVisible()
})

it.each([
  { name: 'the page is busy', busy: true, isPending: false },
  { name: 'the mutation is pending', busy: false, isPending: true },
])('disables both actions while $name', async ({ busy, isPending }) => {
  const user = userEvent.setup()
  const mutateAsync = mockMutation({ isPending })
  const onClose = vi.fn()
  render(
    <ClearCompletedDialog busy={busy} onClose={onClose} onCleared={vi.fn()} />,
  )
  const clear = screen.getByRole('button', { name: 'Clearing…' })
  expect(clear).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await user.click(clear)
  expect(mutateAsync).not.toHaveBeenCalled()
})
