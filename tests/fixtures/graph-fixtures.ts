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
