import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useDeleteTodoMutation } from '../hooks/useDeleteTodoMutation'
import { DeleteTodoDialog } from './DeleteTodoDialog'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useDeleteTodoMutation', () => ({
  useDeleteTodoMutation: vi.fn(),
}))

it('shows a deletion error and allows cancelling without deleting', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn()
  vi.mocked(useDeleteTodoMutation).mockReturnValue({
    isPending: false,
    error: new Error('Could not delete.'),
    mutateAsync,
  } as unknown as ReturnType<typeof useDeleteTodoMutation>)
  const onClose = vi.fn()
  const onDeleted = vi.fn()
  render(
    <DeleteTodoDialog
      todo={todoFixture}
      busy={false}
      onClose={onClose}
      onDeleted={onDeleted}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Delete task?' })).toBeVisible()
  expect(
    screen.getByText(
      `The task “${todoFixture.title}” will be permanently deleted.`,
    ),
  ).toBeVisible()
  expect(screen.getByTestId('alert')).toHaveTextContent('Could not delete.')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(onDeleted).not.toHaveBeenCalled()
})

function mockMutation(
  mutateAsync: ReturnType<typeof vi.fn>,
  isPending = false,
) {
  vi.mocked(useDeleteTodoMutation).mockReturnValue({
    isPending,
    error: null,
    mutateAsync,
  } as unknown as ReturnType<typeof useDeleteTodoMutation>)
}

it('deletes the task and reports it', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn().mockResolvedValue(undefined)
  mockMutation(mutateAsync)
  const onDeleted = vi.fn()
  render(
    <DeleteTodoDialog
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onDeleted={onDeleted}
    />,
  )
  expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Delete task' }))
  expect(mutateAsync).toHaveBeenCalledWith(todoFixture.id)
  await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
})

it('stays open and does not report when deletion fails', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn().mockRejectedValue(new Error('nope'))
  mockMutation(mutateAsync)
  const onDeleted = vi.fn()
  render(
    <DeleteTodoDialog
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onDeleted={onDeleted}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Delete task' }))
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  expect(onDeleted).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'Delete task?' })).toBeVisible()
})

it.each([
  ['the mutation is pending', true, false],
  ['the page is busy', false, true],
])('disables both actions while %s', (_, isPending, busy) => {
  mockMutation(vi.fn(), isPending)
  render(
    <DeleteTodoDialog
      todo={todoFixture}
      busy={busy}
      onClose={vi.fn()}
      onDeleted={vi.fn()}
    />,
  )
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
})
