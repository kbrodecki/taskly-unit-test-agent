import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { useNotice } from '../../hooks/useNotice'
import { todoFixture } from '../../test/todoFixture'
import { TodosHeader } from './components/TodosHeader'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import { TodosPage } from './TodosPage'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: () => <h1>Tasks</h1>,
}))
vi.mock('./components/ClearCompletedDialog', () => ({
  ClearCompletedDialog: ({
    onClose,
    onCleared,
  }: {
    onClose: () => void
    onCleared: (deleted: number) => void
  }) => (
    <div role="dialog" aria-label="Clear dialog">
      <button onClick={onClose}>Close clear</button>
      <button onClick={() => onCleared(1)}>Cleared one</button>
      <button onClick={() => onCleared(4)}>Cleared four</button>
    </div>
  ),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: ({ onClearCompleted }: { onClearCompleted: () => void }) => (
    <>
      <h1>Tasks</h1>
      <button onClick={onClearCompleted}>Open clear</button>
    </>
  ),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: vi.fn(
    ({ onClearCompleted }: { onClearCompleted: () => void }) => (
      <>
        <h1>Tasks</h1>
        <button onClick={onClearCompleted}>Open clear</button>
      </>
    ),
  ),
}))
vi.mock('./components/TodoFilters', () => ({ TodoFilters: () => null }))
vi.mock('./components/TodoList', () => ({ TodoList: () => <p>Task list</p> }))
vi.mock('./components/TodoEditor', () => ({ TodoEditor: () => null }))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: () => null,
}))
vi.mock('../../components/SuccessNotice', () => ({ SuccessNotice: () => null }))

it('displays a query failure and resets mutation errors before retrying', async () => {
  const user = userEvent.setup()
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [],
    isPending: false,
    isFetching: false,
    isError: true,
    error: new Error('The server is unavailable.'),
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(false)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify: vi.fn() })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})

function mockPage(notify: (message: string) => void) {
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [],
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset: vi.fn(),
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(false)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
}

it('passes the number of completed tasks to the header', () => {
  mockPage(vi.fn())
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [
      { ...todoFixture, id: 1, completed: true },
      { ...todoFixture, id: 2, completed: false },
      { ...todoFixture, id: 3, completed: true },
    ],
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useTodosQuery>)
  render(<TodosPage />)
  expect(vi.mocked(TodosHeader).mock.lastCall?.[0].completedCount).toBe(2)
})

it('passes zero completed tasks to the header when there are no tasks', () => {
  mockPage(vi.fn())
  render(<TodosPage />)
  expect(vi.mocked(TodosHeader).mock.lastCall?.[0].completedCount).toBe(0)
})

it('opens the clear completed dialog and closes it on cancel', async () => {
  const user = userEvent.setup()
  const notify = vi.fn()
  mockPage(notify)
  render(<TodosPage />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Open clear' }))
  expect(screen.getByRole('dialog', { name: 'Clear dialog' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Close clear' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})

it.each([
  ['Cleared one', '1 completed task cleared.'],
  ['Cleared four', '4 completed tasks cleared.'],
])(
  'closes the dialog and notifies after %s',
  async (button, expectedNotice) => {
    const user = userEvent.setup()
    const notify = vi.fn()
    mockPage(notify)
    render(<TodosPage />)
    await user.click(screen.getByRole('button', { name: 'Open clear' }))
    await user.click(screen.getByRole('button', { name: button }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(notify).toHaveBeenCalledWith(expectedNotice)
  },
)
