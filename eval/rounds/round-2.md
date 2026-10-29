| Case | Checks | Decisions exact | Decisions acceptable | Check as expected | Blocking gates | Only tests pushed | Stable | Cost | Turns | Agent min | Runs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E1 | Demo feature: clear completed tasks (commit 1 of PR 26) | 26/33 | 26/33 | 3/3 | none | 3/3 | 1/3 | $0.39 | 34 | 6.3 | [1](https://github.com/kbrodecki/gh-aw-spike/pull/48) [2](https://github.com/kbrodecki/gh-aw-spike/pull/49) [3](https://github.com/kbrodecki/gh-aw-spike/pull/50) |
| E4 | Author lowers the title limit from 120 to 80 without fixing tests | 3/3 | 3/3 | 3/3 | none | 3/3 | 3/3 | $0.10 | 19 | 4.0 | [1](https://github.com/kbrodecki/gh-aw-spike/pull/51) [2](https://github.com/kbrodecki/gh-aw-spike/pull/52) [3](https://github.com/kbrodecki/gh-aw-spike/pull/53) |

### Mismatches

- E1 run 1: `frontend/src/features/todos/api/queryKeys.ts` expected `filtered`, got `skip:wiring`
- E1 run 1: `frontend/src/features/todos/components/TodosHeader.tsx` expected `update`, got `skip:covered-by-author`
- E1 run 1: `frontend/src/features/todos/components/TodoList.tsx` expected `skip:no-behavior-change`, got `skip:covered-by-author`
- E1 run 2: `frontend/src/features/todos/api/queryKeys.ts` expected `filtered`, got `skip:wiring`
- E1 run 2: `frontend/src/features/todos/components/TodoList.tsx` expected `skip:no-behavior-change`, got `skip:already-covered`
- E1 run 3: `backend/src/features/todos/repository.ts` expected `skip:covered-by-author`, got `skip:already-covered`
- E1 run 3: `frontend/src/features/todos/api/queryKeys.ts` expected `filtered`, got `skip:wiring`
