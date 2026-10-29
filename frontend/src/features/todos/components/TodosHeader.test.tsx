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

it('shows the clear completed action only when a handler is given', () => {
  const { rerender } = render(
    <TodosHeader disabled={false} onCreate={vi.fn()} />,
  )
  expect(
    screen.queryByRole('button', { name: 'Clear completed' }),
  ).not.toBeInTheDocument()
  rerender(
    <TodosHeader
      disabled={false}
      onCreate={vi.fn()}
      onClearCompleted={vi.fn()}
    />,
  )
  expect(screen.getByRole('button', { name: 'Clear completed' })).toBeVisible()
})

it('invokes clear completed when enabled and blocks it when disabled', async () => {
  const user = userEvent.setup()
  const onClearCompleted = vi.fn()
  const onCreate = vi.fn()
  const { rerender } = render(
    <TodosHeader
      disabled={false}
      onCreate={onCreate}
      onClearCompleted={onClearCompleted}
    />,
  )
  const button = screen.getByRole('button', { name: 'Clear completed' })
  await user.click(button)
  expect(onClearCompleted).toHaveBeenCalledTimes(1)
  expect(onCreate).not.toHaveBeenCalled()
  rerender(
    <TodosHeader
      disabled
      onCreate={onCreate}
      onClearCompleted={onClearCompleted}
    />,
  )
  expect(button).toBeDisabled()
  await user.click(button)
  expect(onClearCompleted).toHaveBeenCalledTimes(1)
})
