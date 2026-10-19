// Dialog renderer. A typed port of `dialog` and its helpers in docs/design/spec-generator.js.
import { costSlot, showsCost } from '../core/billing'
import { isExpensive } from '../core/cost'
import { fmtCost, fmtK, fmtT } from '../core/format'
import type { Billing } from '../core/model'
import { progressPercent, type Plan } from '../core/progress'
import { colorize, dim, fitText, padLeft, padRight, stripCodes, toAscii, visibleLength } from './lines'
import { bottomBorder, progressBar, renderHints, rule, textLine, topBorder } from './frame'
import type { Row, RowStatus } from './rows'

export type DialogOpts = {
  W: number
  agents: Row[]
  sel?: number
  sid?: string
  path?: string
  plan?: Plan | null
  win?: [number, number]
  after?: string[]
  minRows?: number
  ended?: string
  hints?: [string, string][]
  ascii?: boolean
  /** Draw the border; false drops top, bottom and side edges for a host that draws its own. */
  frame?: boolean
  /** Spinner frame shown for running agents. */
  spin?: string
  /** How the session is paid for; cost is shown only with API billing, which is the default. */
  billing?: Billing
}

type ColumnKind = 'name' | 'st' | 'model' | 'task' | 'act' | 'plan' | 'tok' | 'io' | 'cost' | 'calls' | 'time'
type Column = {
  k: ColumnKind
  w?: number
  f?: 1
  r?: 1
  /** Tier at which the column appears: 1 narrow, 2 medium, 3 wide. */
  p?: number
  h: string
}
type Totals = Record<RowStatus, number> & { tok: number; isTokPartial: boolean; cost: number; n: number; costed: number }

/** Sums tokens, cost and per-status counts. (spec `totals`) */
const totalsOf = (agents: Row[]): Totals => {
  // `costed`: agents with a nonzero estimated cost; an unknown model counts as 0.
  const t: Totals = { tok: 0, isTokPartial: false, cost: 0, running: 0, waiting: 0, done: 0, failed: 0, unknown: 0, n: agents.length, costed: 0 }
  agents.forEach(x => { t.tok += x.i + x.o; if (x.outputPartial) t.isTokPartial = true; t.cost += x.cost; t[x.st]++; if (x.cost > 0) t.costed++ })
  return t
}

/** Tree-drawing prefix for each row. (spec `pre`) */
const treePrefixes = (list: Row[]): string[] => list.map((a, i) => {
  if (!a.d) return ''
  const hasNextSibling = (k: number): boolean => {
    for (let j = k + 1; j < list.length; j++) {
      if (list[j].d < list[k].d) return false
      if (list[j].d === list[k].d) return true
    }
    return false
  }
  let s = ''
  const chain: number[] = []
  for (let d = a.d - 1; d >= 1; d--) {
    let j = i - 1
    while (list[j].d !== d) j--
    chain.unshift(j)
  }
  chain.forEach(j => { s += hasNextSibling(j) ? '│  ' : '   ' })
  return s + (hasNextSibling(i) ? '├─ ' : '└─ ')
})

/** Status cell codes and text. (spec `stCell`) */
export const statusCell = (st: RowStatus, spin: string): [string, string] => {
  switch (st) {
    case 'running': return ['c', spin + ' running']
    case 'waiting': return ['y', '◔ waiting']
    case 'done': return ['g', '✓ done   ']
    case 'failed': return ['rB', '✗ failed ']
    case 'unknown': return ['d', '? unknown']
    default: { const unreachable: never = st; return unreachable }
  }
}

const NARROW_BELOW = 60
const COMPACT_SUMMARY_BELOW = 66

const ACT_CODES: Partial<Record<RowStatus, string>> = { waiting: 'y', failed: 'r', done: 'd', unknown: 'd' }

/** Renders the agent dialog as coded lines. (spec `dialog`) */
export const renderDialog = (o: DialogOpts): string[] => {
  const W = o.W
  const a = o.agents
  const hasFrame = o.frame ?? true
  const spin = o.spin ?? '⠋'
  const tier = W < 100 ? 1 : W < 140 ? 2 : 3
  // Below this width only name, a one-glyph status and TIME fit; not in the generator, added for narrow panes.
  const isNarrow = W < NARROW_BELOW
  // The full summary is about 60 characters wide, so it needs a frameless width of at least 66.
  const isCompactSummary = W < COMPACT_SUMMARY_BELOW
  const hasCost = showsCost(o.billing)
  // Only a subagent's own todo list opens the column; main's plan has its bar, so goldens without lists stay as they are.
  const hasSubagentPlan = a.some(row => row.d > 0 && row.prog !== undefined)
  const t = totalsOf(a)
  const px = treePrefixes(a)
  const wideColumns: Column[] = ([
    { k: 'name', w: W >= 100 ? 18 : 16, h: 'AGENT' }, { k: 'st', w: 9, h: 'STATUS' },
    { k: 'model', w: 10, h: 'MODEL', p: 2 }, { k: 'task', f: 1, p: 2, h: 'TASK' }, { k: 'act', f: 1, h: 'NOW' },
    { k: 'plan', w: 5, r: 1, p: 2, h: 'PLAN' },
    { k: 'tok', w: 6, r: 1, h: 'TOK' }, { k: 'io', w: 11, r: 1, p: 3, h: 'IN/OUT' },
    { k: 'cost', w: 7, r: 1, p: 2, h: 'COST' }, { k: 'calls', w: 5, r: 1, p: 3, h: 'CALLS' },
    { k: 'time', w: 7, r: 1, h: 'TIME' },
  ] as Column[]).filter(c =>
    (c.p || 1) <= tier && (c.k !== 'cost' || hasCost) && (c.k !== 'plan' || hasSubagentPlan))
  const narrowColumns: Column[] = [
    { k: 'name', f: 1, h: 'AGENT' }, { k: 'st', w: 1, h: 'S' }, { k: 'time', w: 7, r: 1, h: 'TIME' },
  ]
  const cd = isNarrow ? narrowColumns : wideColumns
  const fixed = cd.filter(c => c.w).reduce((s, c) => s + (c.w as number), 0)
  const flex = W - 5 - fixed - (cd.length - 1) * 2
  const hasTask = cd.some(c => c.k === 'task')
  const taskWidth = Math.floor(flex * .4)
  cd.forEach(c => { if (c.f) c.w = hasTask ? (c.k === 'task' ? taskWidth : flex - taskWidth) : flex })

  const cell = (c: Column, ag: Row, i: number): string => {
    const w = c.w as number
    const dm = ag.st === 'done' ? 'd' : ''
    const isCostly = isExpensive(ag.cost, t.cost, t.costed)
    switch (c.k) {
      case 'name':
        return dim(px[i]) + (ag.d
          ? colorize(dm, fitText(ag.name, w - px[i].length))
          : colorize('B', fitText(ag.name, w - px[i].length)))
      // The generator also prepends an empty colorize() call here; it always yields ''.
      case 'st': {
        const [codes, text] = statusCell(ag.st, spin)
        return colorize(codes, isNarrow ? [...text][0] : text)
      }
      case 'model': return dim(fitText(ag.model, w))
      case 'task': return colorize(dm, fitText(ag.task, w))
      case 'act': return colorize(ACT_CODES[ag.st] || '', fitText(ag.act || '—', w))
      case 'plan': {
        const progress = ag.d > 0 ? ag.prog : undefined
        if (!progress) return dim(padLeft('—', w))
        const counts = `${progress.done}/${progress.total}`
        // A count too long for the cell falls back to the percent, never to a cut number.
        return colorize(dm, padLeft([...counts].length <= w ? counts : progressPercent(progress) + '%', w))
      }
      case 'tok': return colorize(dm, padLeft(ag.outputPartial ? '—' : fmtK(ag.i + ag.o), w))
      case 'io': return dim(padLeft(fmtK(ag.i) + '/' + (ag.outputPartial ? '—' : fmtK(ag.o)), w))
      case 'cost':
        return isCostly
          ? colorize('yB', padLeft(fmtCost(ag.cost) + '▲', w))
          : colorize(dm, padLeft(fmtCost(ag.cost) + ' ', w))
      case 'calls': return colorize(dm, padLeft(String(ag.calls), w))
      case 'time':
        return ag.stuck && ag.st === 'running'
          ? colorize('y', padLeft(fmtT(ag.secs) + '!', w))
          : colorize(dm, padLeft(fmtT(ag.secs) + ' ', w))
      default: { const unreachable: never = c.k; return unreachable }
    }
  }

  // A total with an unknown output is a lower bound, so it says so with a plus.
  const totalTok = fmtK(t.tok) + (t.isTokPartial ? '+' : '')
  const out: string[] = []
  const pct = o.plan ? Math.round(o.plan.done / o.plan.total * 100) + '%' : '—'
  const idl = o.sid || '7f3a9c2e'
  const line = (s: string): string => textLine(W, s, hasFrame)
  if (hasFrame) {
    out.push(isNarrow
      ? topBorder(W, colorize('B', 'agentview'), dim(`${totalTok} tok · plan `) + colorize('B', pct))
      : topBorder(
        W,
        colorize('B', 'agentview') + dim(' · session ') + idl + (o.path ? dim(' · ') + o.path : ''),
        dim(`${totalTok} tok · ${costSlot(o.billing, t.cost)} · plan `) + colorize('B', pct),
      ))
  }
  const summary: [string, string, string, number][] = [
    ['c', spin, 'running', t.running], ['y', '◔', 'waiting', t.waiting],
    ['g', '✓', 'done', t.done], ['r', '✗', 'failed', t.failed],
  ]
  if (t.unknown) summary.push(['d', '?', 'unknown', t.unknown])
  const summaryCell = ([c, g, w, n]: [string, string, string, number]): string => {
    const label = isCompactSummary ? `${g} ${n}` : `${g} ${n} ${w}`
    return n ? colorize(c, label) : dim(label)
  }
  out.push(line(o.ended
    ? colorize('g', '✓ session finished') + dim(` · ${t.n} agents · ${o.ended}`)
    : summary.map(summaryCell).join(isCompactSummary ? '  ' : '   ') + dim(isCompactSummary ? ` · ${t.n}` : `   ·  ${t.n} agents`)))
  out.push(rule(W, hasFrame))
  // Header row patch from render-spec.js: dim edges around the heads, not the txt() helper.
  const heads = cd.map(c => c.r ? padLeft(c.h, c.w as number) : fitText(c.h, c.w as number)).join('  ')
  out.push(hasFrame ? dim('│') + dim('  ' + heads) + ' ' + dim('│') : dim('  ' + heads) + ' ')
  const win = o.win
  const s = win ? win[0] : 0
  const e = win ? win[1] : a.length
  const h = e - s
  const N = a.length
  if (win && s > 0) out.push(line(dim(`  ↑ ${s} more above`)))
  const thumbStart = Math.floor(s / N * h)
  const thumbLength = Math.max(1, Math.round(h * h / N))
  for (let idx = s; idx < e; idx++) {
    const k = idx - s
    const isSelected = idx === o.sel
    const inner = (isSelected ? '▸' : ' ') + ' ' + cd.map(c => cell(c, a[idx], idx)).join('  ') + ' '
    const body = isSelected ? colorize('IB', stripCodes(inner)) : inner
    const edge = win && k >= thumbStart && k < thumbStart + thumbLength ? colorize('B', '┃') : dim('│')
    out.push(hasFrame ? dim('│') + body + edge : body)
  }
  if (win && e < N) out.push(line(dim(`  ↓ ${N - e} more below`)))
  ;(o.after || []).forEach(l => out.push(line(l)))
  if (o.minRows) while (out.length < o.minRows) out.push(line(''))
  out.push(rule(W, hasFrame))
  const barWidth = W >= 100 ? 24 : 14
  if (o.plan) {
    const p = o.plan
    const planPrefix = 'plan ' + '█'.repeat(barWidth) + ` ${p.done}/${p.total} ${pct}  ▸ `
    out.push(line(
      colorize('', 'plan ') + progressBar(p.done, p.total, barWidth, p.done === p.total ? 'g' : 'b') +
      colorize('B', ` ${p.done}/${p.total} ${pct}`) + '  ' +
      (o.ended
        ? colorize('g', '✓ ') + dim(p.cur)
        : colorize('c', '▸ ') + fitText(p.cur, W - 4 - [...planPrefix].length).trimEnd()),
    ))
  } else {
    out.push(line('plan ' + dim('░'.repeat(barWidth) + (isNarrow ? '  —' : '  —   no todo list in this session'))))
  }
  out.push(rule(W, hasFrame))
  const hintList = o.hints ||
    (isNarrow ? [['↑↓', 'select'], ['⏎', 'details'], ['esc', 'close']] : [['↑↓', 'select'], ['⏎', 'details'], ['esc', 'close'], ['q', 'quit']])
  const right = o.ended ? dim('ended') : colorize('g', '●') + dim(' live')
  out.push(line(padRight(renderHints(hintList), W - 4 - visibleLength(right)) + right))
  if (hasFrame) out.push(bottomBorder(W))
  return o.ascii ? out.map(toAscii) : out
}

/** Window of rows to show: all when they fit, else `prev` moved the least that keeps `sel` visible. */
export const windowFor = (n: number, sel: number, rows: number, prev?: [number, number]): [number, number] => {
  if (n <= rows) return [0, n]
  if (prev && sel >= prev[0] && sel < prev[1] && prev[1] - prev[0] === rows && prev[1] <= n) return prev
  const start = prev && prev[1] - prev[0] === rows ? prev[0] : 0
  const clamped = sel < start ? sel : sel >= start + rows ? sel - rows + 1 : start
  const first = Math.min(Math.max(0, clamped), n - rows)
  return [first, first + rows]
}
