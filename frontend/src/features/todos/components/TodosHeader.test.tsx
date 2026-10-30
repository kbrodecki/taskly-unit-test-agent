import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { TodosHeader } from './TodosHeader'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

it('invokes creation when enabled and blocks it when disabled', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  const { rerender } = render(
    <TodosHeader disabled={false} onCreate={onCreate} />,
  )
  expect(screen.getByRole('heading', { name: 'Tasks' })).toBeVisible()
  expect(
    screen.getByText('Create, organize, and complete tasks.'),
  ).toBeVisible()
  const button = screen.getByRole('button', { name: 'New task' })
  await user.click(button)
  expect(onCreate).toHaveBeenCalledTimes(1)
  rerender(<TodosHeader disabled onCreate={onCreate} />)
  expect(button).toBeDisabled()
  await user.click(button)
  expect(onCreate).toHaveBeenCalledTimes(1)
})

it('hides the clear completed button without a handler', () => {
  render(<TodosHeader disabled={false} onCreate={vi.fn()} completedCount={2} />)
  expect(
    screen.queryByRole('button', { name: /Clear completed/ }),
  ).not.toBeInTheDocument()
})

it('shows the completed count and invokes the clear handler', async () => {
  const user = userEvent.setup()
  const onClearCompleted = vi.fn()
  render(
    <TodosHeader
      disabled={false}
      onCreate={vi.fn()}
      onClearCompleted={onClearCompleted}
      completedCount={2}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Clear completed (2)' }))
  expect(onClearCompleted).toHaveBeenCalledTimes(1)
})

it.each([
  ['nothing is completed', false, 0],
  ['the page is disabled', true, 2],
])('disables the clear button when %s', (_case, disabled, completedCount) => {
  render(
    <TodosHeader
      disabled={disabled}
      onCreate={vi.fn()}
      onClearCompleted={vi.fn()}
      completedCount={completedCount}
    />,
  )
  expect(screen.getByRole('button', { name: /Clear completed/ })).toBeDisabled()
})
