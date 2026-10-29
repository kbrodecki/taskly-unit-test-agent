import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { useClearCompletedMutation } from '../hooks/useClearCompletedMutation'
import { ClearCompletedDialog } from './ClearCompletedDialog'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useClearCompletedMutation', () => ({
  useClearCompletedMutation: vi.fn(),
}))

function mockMutation(overrides: object = {}) {
  const mutateAsync = vi.fn().mockResolvedValue({ deleted: 2 })
  vi.mocked(useClearCompletedMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync,
    ...overrides,
  } as unknown as ReturnType<typeof useClearCompletedMutation>)
  return mutateAsync
}

beforeEach(() => vi.clearAllMocks())

it('asks for confirmation and reports the deleted count after clearing', async () => {
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
  expect(
    screen.getByText('All completed tasks will be permanently deleted.'),
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Clear completed' }))
  expect(mutateAsync).toHaveBeenCalledTimes(1)
  expect(onCleared).toHaveBeenCalledWith(2)
})

it('closes without clearing when cancelled', async () => {
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

it('keeps the dialog open and shows the error when clearing fails', async () => {
  const user = userEvent.setup()
  const mutateAsync = mockMutation({
    error: new Error('The server is unavailable.'),
  })
  mutateAsync.mockRejectedValue(new Error('The server is unavailable.'))
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
  { name: 'the mutation is pending', busy: false, isPending: true },
  { name: 'the page is busy', busy: true, isPending: false },
])('disables every action while $name', async ({ busy, isPending }) => {
  const user = userEvent.setup()
  const mutateAsync = mockMutation({ isPending })
  const onCleared = vi.fn()
  render(
    <ClearCompletedDialog
      busy={busy}
      onClose={vi.fn()}
      onCleared={onCleared}
    />,
  )
  const clearing = screen.getByRole('button', { name: 'Clearing…' })
  expect(clearing).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await user.click(clearing)
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(onCleared).not.toHaveBeenCalled()
})
