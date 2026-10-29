---
name: backend-unit-tests
description: How unit tests are written for the Express and Prisma backend in this repo (Vitest, Supertest, fixtures, mocked Prisma IO). Use when the file to test is under backend/src/.
---
# Backend unit tests

Read the closest existing test before writing: the test file for the same module if it exists, otherwise the one for a sibling module.

## Where tests live

- `backend/src/features/todos/<module>.ts` is tested in `backend/tests/<module>.test.ts`. The input's `testPath` is authoritative.
- Shared data lives in `backend/tests/fixture.ts` (`record` is a database row, `todo` the mapped API shape). Add new fixtures there or build them from these with spreads; never redefine a whole object inline when a spread will do.
- Run one file: `npm --prefix backend test -- tests/<module>.test.ts`.

## Patterns to copy

| What is tested | Example to read | Pattern |
|---|---|---|
| HTTP routes | `backend/tests/router.test.ts` | `setup()` builds an Express app with `createTodosRouter(repository)` and a repository of `vi.fn()`; requests through `supertest`. Assert status and body together, and the exact repository call. |
| Repository | `backend/tests/repository.test.ts` | Real Prisma delegate from `createDatabase(...)` with IO mocked by `vi.spyOn(database.todo, '<method>')`. No database is needed; never connect to one. |
| Validators and mappers | `backend/tests/validators.test.ts`, `backend/tests/mappers.test.ts` | Pure functions: call and compare with `toEqual`; invalid inputs as an `it.each` table. |

## Style

- Imports use the `.ts` extension, for example `'../src/features/todos/router.ts'`.
- Import `it`, `expect`, `vi` and hooks from `vitest` explicitly; no globals.
- Semicolons, single quotes, no comments in tests.
- `afterEach(() => vi.restoreAllMocks())` when you spy on real objects.
- Rejections: `await expect(promise).rejects.toThrow(...)` or the router's error status and body.
