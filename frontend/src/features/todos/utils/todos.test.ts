import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDate, isOverdue, selectTodos, validateTodo } from './todos'
import type { Todo } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })

  it('shows only completed tasks for the completed filter', () => {
    const done = { ...base, id: 2, completed: true }
    expect(selectTodos([base, done], 'completed', '', 'newest')).toEqual([done])
  })

  it('sorts by due date with undated tasks last and newer ids first on ties', () => {
    const late = { ...base, id: 1, due_date: '2026-12-01' }
    const early = { ...base, id: 2, due_date: '2026-11-01' }
    const tieOlder = { ...base, id: 3, due_date: '2026-11-01' }
    const undated = { ...base, id: 4 }
    expect(
      selectTodos([undated, late, early, tieOlder], 'all', '', 'due'),
    ).toEqual([tieOlder, early, late, undated])
  })

  it('sorts newest first by creation time, then by id', () => {
    const older = { ...base, id: 1, created_at: '2026-09-01T12:00:00Z' }
    const newer = { ...base, id: 2 }
    const sameTime = { ...base, id: 3 }
    expect(selectTodos([older, newer, sameTime], 'all', '', 'newest')).toEqual([
      sameTime,
      newer,
      older,
    ])
  })

  it('breaks priority ties by newer id first', () => {
    const a = { ...base, id: 1 }
    const b = { ...base, id: 2 }
    expect(selectTodos([a, b], 'all', '', 'priority')).toEqual([b, a])
  })
})

describe('validateTodo', () => {
  const valid = {
    title: 'Plan',
    description: '',
    priority: 'medium' as const,
    due_date: null,
    completed: false,
  }

  it('returns no errors for valid input', () => {
    expect(validateTodo({ ...valid, due_date: '2026-10-15' })).toEqual({})
  })

  it('requires a title that is not blank', () => {
    expect(validateTodo({ ...valid, title: '   ' })).toEqual({
      title: 'Enter a task title.',
    })
  })

  it.each([
    [120, {}],
    [121, { title: 'The title must be at most 120 characters.' }],
  ])('checks a trimmed title of %i characters', (length, expected) => {
    expect(
      validateTodo({ ...valid, title: ` ${'x'.repeat(length)} ` }),
    ).toEqual(expected)
  })

  it.each([
    [2000, {}],
    [2001, { description: 'The description must be at most 2000 characters.' }],
  ])('checks a description of %i characters', (length, expected) => {
    expect(validateTodo({ ...valid, description: 'x'.repeat(length) })).toEqual(
      expected,
    )
  })

  it.each(['2026-02-30', '2026-13-01', '15/10/2026', '2026-1-5', 'garbage'])(
    'rejects the due date %s',
    (due_date) => {
      expect(validateTodo({ ...valid, due_date })).toEqual({
        due_date: 'Enter a valid date.',
      })
    },
  )

  it('accepts a leap day', () => {
    expect(validateTodo({ ...valid, due_date: '2028-02-29' })).toEqual({})
  })
})

describe('isOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it.each([
    ['2026-10-14', false, true],
    ['2026-10-15', false, false],
    ['2026-10-16', false, false],
    ['2026-10-14', true, false],
    [null, false, false],
  ])('due %s completed=%s gives %s', (due_date, completed, expected) => {
    expect(isOverdue({ ...base, due_date, completed })).toBe(expected)
  })
})

describe('formatDate', () => {
  it('formats a date in en-GB style', () => {
    expect(formatDate('2026-10-05')).toBe('5 Oct 2026')
  })
})
