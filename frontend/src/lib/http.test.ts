import { afterEach, expect, it, vi } from 'vitest'
import { request } from './http'

afterEach(() => vi.unstubAllGlobals())

function stubFetch(response: Partial<Response> | Error) {
  const fetchMock =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

it('prefixes the path with /api and sends JSON headers', async () => {
  const fetchMock = stubFetch({
    ok: true,
    status: 200,
    json: async () => [1],
  })
  await expect(
    request('/todos', { method: 'POST', headers: { 'X-Test': 'a' } }),
  ).resolves.toEqual([1])
  expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test': 'a' },
  })
})

it('returns undefined for a 204 response', async () => {
  const json = vi.fn()
  const fetchMock = stubFetch({ ok: true, status: 204, json })
  await expect(request('/todos/1', { method: 'DELETE' })).resolves.toEqual(
    undefined,
  )
  expect(json).not.toHaveBeenCalled()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('throws a connection message when fetch fails', async () => {
  stubFetch(new TypeError('Failed to fetch'))
  await expect(request('/todos')).rejects.toThrow(
    'Cannot connect to the server. Please try again.',
  )
})

it('rethrows the original error when the request was aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const abortError = Object.assign(new Error('Aborted'), { name: 'AbortError' })
  stubFetch(abortError)
  await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
    abortError,
  )
})

it('throws a validation message for a 422 response', async () => {
  stubFetch({ ok: false, status: 422, json: async () => ({ detail: [] }) })
  await expect(request('/todos')).rejects.toThrow(
    'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
  )
})

it('throws the detail of an error response', async () => {
  stubFetch({
    ok: false,
    status: 404,
    json: async () => ({ detail: 'Task not found.' }),
  })
  await expect(request('/todos/9')).rejects.toThrow('Task not found.')
})

it.each([
  ['a non-string detail', async () => ({ detail: [1] })],
  ['an unparseable body', async () => Promise.reject(new Error('bad json'))],
])('throws the generic message for %s', async (_, json) => {
  stubFetch({ ok: false, status: 500, json })
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})
