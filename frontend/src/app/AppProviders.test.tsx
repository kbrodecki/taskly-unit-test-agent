import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { GlobalStyles } from '../design-system/mocks'
import { queryClient } from '../lib/queryClient'
import { AppProviders } from './AppProviders'

vi.mock('../design-system', () => import('../design-system/mocks'))

function ClientProbe({ expected }: { expected: QueryClient }) {
  return (
    <p>{useQueryClient() === expected ? 'expected client' : 'other client'}</p>
  )
}

it('renders children and global styles', () => {
  render(
    <AppProviders>
      <p>Child content</p>
    </AppProviders>,
  )
  expect(screen.getByText('Child content')).toBeVisible()
  expect(GlobalStyles).toHaveBeenCalled()
})

it('provides the shared query client by default', () => {
  render(
    <AppProviders>
      <ClientProbe expected={queryClient} />
    </AppProviders>,
  )
  expect(screen.getByText('expected client')).toBeVisible()
})

it('provides a custom query client when given one', () => {
  const custom = new QueryClient()
  render(
    <AppProviders client={custom}>
      <ClientProbe expected={custom} />
    </AppProviders>,
  )
  expect(screen.getByText('expected client')).toBeVisible()
})
