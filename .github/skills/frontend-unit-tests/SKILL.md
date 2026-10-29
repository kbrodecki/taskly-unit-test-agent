---
name: frontend-unit-tests
description: How unit tests are written for the React frontend in this repo (Vitest, Testing Library, user-event, TanStack Query, design system mocks). Use when the file to test is under frontend/src/.
---
# Frontend unit tests

Read the closest existing test before writing: the test next to the file if it exists, otherwise one for a sibling in the same folder.

## Where tests live

- Next to the source file: `X.tsx` is tested in `X.test.tsx`, `x.ts` in `x.test.ts`. The input's `testPath` is authoritative.
- Shared data: `frontend/src/test/todoFixture.ts` (`todoFixture`). Build variants with spreads: `{ ...todoFixture, completed: true }`.
- `frontend/src/test/setup.ts` already loads jest-dom matchers and cleans up after each test.
- Run one file: `npm --prefix frontend test -- src/<path>.test.tsx`.

## Patterns to copy

| What is tested | Example to read | Pattern |
|---|---|---|
| Components | `frontend/src/features/todos/components/TodoItem.test.tsx` | `vi.mock('<relative>/design-system', () => import('<relative>/design-system/mocks'))`, `render`, `userEvent.setup()`, queries by role and accessible name, callbacks as `vi.fn()`. |
| Pages wired to hooks | `frontend/src/features/todos/TodosPage.test.tsx` | Mock child components and hooks with `vi.mock`, set return values with `vi.mocked(hook).mockReturnValue(...)`. |
| API client | `frontend/src/features/todos/api/todos.test.ts` | Mock `lib/http` `request`, assert the exact path and options. |
| Plain hooks and utils | `frontend/src/hooks/useNotice.test.ts`, `frontend/src/features/todos/utils/todos.test.ts` | `renderHook` or direct calls. |
| Query and mutation hooks | none yet | `renderHook` with a `wrapper` that provides a fresh `new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })`; mock `todosApi`; assert the cache with `queryClient.getQueryData(todoKeys.list)`. |

## Style

- Prettier style of the frontend: no semicolons, single quotes, trailing commas. After writing, run `npm --prefix frontend run format`.
- Import `it`, `expect`, `vi` from `vitest` explicitly.
- Prefer `getByRole` with `name` over test IDs or text fragments; assert visibility or state with jest-dom (`toBeVisible`, `toBeDisabled`, `toBeChecked`).
- Await every `user` interaction; use `waitFor` or `findBy*` for async updates.
- No comments in tests.
