import { readFileSync } from 'node:fs'
import type { Row } from '../../src/view/rows'

/** Builds one fixture row; the argument order mirrors the graph generator's `A(...)` helper. */
const A = (
  id: string, d: number, name: string, task: string, model: string, st: Row['st'], act: string,
  i: number, o: number, cr: number, cw: number, calls: number, secs: number, cost: number,
  extra: Partial<Row> = {},
): Row => ({ id, d, name, task, model, st, act, i, o, cr, cw, calls, secs, cost, ...extra })

/** The seven rows of `base()` in docs/design/graph-generator.js, ids g0 to g6. */
export const graphBaseRows = (): Row[] => [
  A('g0', 0, 'main', 'refactor auth flow', 'opus-5-5', 'running', 'Task: add token refresh', 18400, 3100, 52000, 9000, 14, 372, 0.61),
  A('g1', 1, 'worker', 'fix login bug', 'sonnet-5-5', 'done', 'Edit src/login.ts', 9800, 2200, 31000, 4200, 31, 188, 0.14),
  A('g2', 2, 'scout', 'find session usages', 'haiku-5-5', 'done', 'Grep "session"', 3100, 600, 8000, 900, 9, 22, 0.01),
  A('g3', 1, 'worker', 'add token refresh', 'sonnet-5-5', 'running', 'Edit src/auth.ts', 7400, 1900, 31200, 4100, 24, 201, 0.12),
  A('g4', 2, 'Explore', 'map refresh callers', 'haiku-5-5', 'running', 'Grep "TODO"', 2300, 410, 5000, 700, 6, 34, 0.01),
  A('g5', 2, 'reviewer', 'review auth diff', 'sonnet-5-5', 'waiting', 'Bash: rm -rf dist', 4000, 700, 9000, 1200, 4, 95, 0.03),
  A('g6', 1, 'worker', 'write auth tests', 'sonnet-5-5', 'running', 'Bash: npm test', 11200, 2400, 40000, 5200, 23, 250, 0.18, { stuck: 1 }),
]

/** Lines of a graph golden: the file without its trailing empty line. */
export const graphGolden = (id: string): string[] => {
  const path = new URL(`../../docs/design/golden/graph/${id}.spec.txt`, import.meta.url)
  return readFileSync(path, 'utf8').split('\n').slice(0, -1)
}

/** Plan shown by the generator's default graph screens. */
export const graphPlan = { done: 6, total: 10, cur: 'Add token refresh to auth.ts' }

/** `failed` in the generator: the last worker failed with `exit 1`. */
export const graphFailedRows = (): Row[] =>
  graphBaseRows().map(row => {
    if (row.id !== 'g6') return row
    const { stuck: _stuck, ...rest } = row
    return { ...rest, st: 'failed', act: 'Bash: npm test', err: 'exit 1' }
  })

/** `ended` in the generator: every agent done, main ran 862 seconds. */
export const graphEndedRows = (): Row[] =>
  graphBaseRows().map(row => {
    const { stuck: _stuck, ...rest } = row
    return row.id === 'g0' ? { ...rest, st: 'done', secs: 862, act: 'final summary' } : { ...rest, st: 'done' }
  })

/** `empty` in the generator: main alone. */
export const graphEmptyRows = (): Row[] => [
  A('e0', 0, 'main', 'refactor auth flow', 'opus-5-5', 'running', 'Read docs/auth.md', 2100, 380, 4000, 1700, 3, 41, 0.04),
]

const MANY_ACTIONS = [
  'Edit src/db/schema.ts', 'Read src/routes/users.ts', 'Grep "SELECT"', 'Bash: npm run build',
  'Edit tests/cart.test.ts', 'Bash: git diff --stat', 'Edit .github/ci.yml',
]

type ManyWorker = readonly [task: string, st: Row['st'], children: ReadonlyArray<readonly [string, string, Row['st']]>]
const MANY_WORKERS: ReadonlyArray<ManyWorker> = [
  ['migrate db schema', 'done', [['scout', 'list table usages', 'done'], ['Explore', 'find raw SQL', 'done']]],
  ['update API routes', 'running', [['worker', 'rewrite /users', 'running'], ['reviewer', 'check route types', 'running']]],
  ['port tests to vitest', 'running', [['worker', 'port auth tests', 'waiting']]],
  ['update docs', 'running', []],
  ['CI pipeline', 'running', [['Explore', 'inspect workflows', 'done'], ['worker', 'edit ci.yml', 'running']]],
  ['lint config', 'done', [['scout', 'list rules', 'done']]],
  ['release notes', 'running', []],
]

/** `mt` in the generator: 16 agents; finished worker subtrees are collapsed. Ids m0 to m15. */
export const graphManyAgents = (): { rows: Row[]; collapsedIds: Set<string> } => {
  const rows: Row[] = []
  const collapsedIds = new Set<string>()
  let k = 1
  const add = (d: number, name: string, task: string, st: Row['st']): Row => {
    const i = 3000 + k * 1300
    const o = 500 + k * 170
    const row = A(`m${rows.length}`, d, name, task, d === 1 ? 'sonnet-5-5' : 'haiku-5-5', st,
      MANY_ACTIONS[k % 7], i, o, i * 3, 800, 5 + k * 2, 30 + k * 23, +((i * 3 + o * 15) / 1e6).toFixed(2))
    k++
    rows.push(row)
    return row
  }
  rows.push(A('m0', 0, 'main', 'migrate webshop to vitest + new API', 'opus-5-5', 'running', 'Task: update API routes',
    41200, 8300, 160000, 22000, 38, 905, 0.94))
  MANY_WORKERS.forEach(([task, st, children]) => {
    const worker = add(1, 'worker', task, st)
    children.forEach(([name, childTask, childState]) => add(2, name, childTask, childState))
    if (st === 'done') collapsedIds.add(worker.id)
  })
  return { rows, collapsedIds }
}
