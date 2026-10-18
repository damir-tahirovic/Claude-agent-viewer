// Dialog renderer. A typed port of `dialog` and its helpers in docs/design/spec-generator.js.
import { fmtCost, fmtK, fmtT } from '../core/format'
import type { Plan } from '../core/progress'
import { colorize, dim, fitText, padLeft, padRight, stripCodes, toAscii, visibleLength } from './lines'
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
}

type ColumnKind = 'name' | 'st' | 'model' | 'task' | 'act' | 'tok' | 'io' | 'cost' | 'calls' | 'time'
type Column = {
  k: ColumnKind
  w?: number
  f?: 1
  r?: 1
  /** Tier at which the column appears: 1 narrow, 2 medium, 3 wide. */
  p?: number
  h: string
}
type Totals = Record<RowStatus, number> & { tok: number; cost: number; n: number }

/** Sums tokens, cost and per-status counts. (spec `totals`) */
const totalsOf = (agents: Row[]): Totals => {
  const t: Totals = { tok: 0, cost: 0, running: 0, waiting: 0, done: 0, failed: 0, unknown: 0, n: agents.length }
  agents.forEach(x => { t.tok += x.i + x.o; t.cost += x.cost; t[x.st]++ })
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

/** Top border with a left and a right title. (spec `top`) */
const topBorder = (W: number, left: string, right: string): string =>
  dim('╭─ ') + left + dim(' ' + '─'.repeat(Math.max(1, W - 8 - visibleLength(left) - visibleLength(right))) + ' ') +
  right + dim(' ─╮')

/** Bottom border. (spec `bottom`) */
const bottomBorder = (W: number): string => dim('╰' + '─'.repeat(W - 2) + '╯')

/** Horizontal rule; without a frame it has no corner pieces. (spec `rule`) */
const rule = (W: number, hasFrame: boolean): string =>
  hasFrame ? dim('├' + '─'.repeat(W - 2) + '┤') : dim('─'.repeat(W - 2))

/** One text line inside the frame. (spec `txt`) */
const textLine = (W: number, s: string, hasFrame: boolean): string =>
  hasFrame ? dim('│') + ' ' + padRight(s, W - 4) + ' ' + dim('│') : ' ' + padRight(s, W - 4) + ' '

/** Progress bar of filled and empty blocks. (spec `bar`) */
const progressBar = (n: number, total: number, width: number, codes: string): string => {
  const filled = Math.round(n / total * width)
  return colorize(codes, '█'.repeat(filled)) + dim('░'.repeat(width - filled))
}

/** Key hints joined by gaps. (spec `hints`) */
const renderHints = (list: [string, string][]): string =>
  list.map(([key, label]) => colorize('B', key) + dim(' ' + label)).join('   ')

/** Status cell codes and text. (spec `stCell`) */
const statusCell = (st: RowStatus, spin: string): [string, string] => {
  switch (st) {
    case 'running': return ['c', spin + ' running']
    case 'waiting': return ['y', '◔ waiting']
    case 'done': return ['g', '✓ done   ']
    case 'failed': return ['rB', '✗ failed ']
    case 'unknown': return ['d', '? unknown']
    default: { const unreachable: never = st; return unreachable }
  }
}

const ACT_CODES: Partial<Record<RowStatus, string>> = { waiting: 'y', failed: 'r', done: 'd', unknown: 'd' }

/** Renders the agent dialog as coded lines. (spec `dialog`) */
export const renderDialog = (o: DialogOpts): string[] => {
  const W = o.W
  const a = o.agents
  const hasFrame = o.frame ?? true
  const spin = o.spin ?? '⠋'
  const tier = W < 100 ? 1 : W < 140 ? 2 : 3
  const t = totalsOf(a)
  const px = treePrefixes(a)
  const cd: Column[] = ([
    { k: 'name', w: W >= 100 ? 18 : 16, h: 'AGENT' }, { k: 'st', w: 9, h: 'STATUS' },
    { k: 'model', w: 10, h: 'MODEL', p: 2 }, { k: 'task', f: 1, p: 2, h: 'TASK' }, { k: 'act', f: 1, h: 'NOW' },
    { k: 'tok', w: 6, r: 1, h: 'TOK' }, { k: 'io', w: 11, r: 1, p: 3, h: 'IN/OUT' },
    { k: 'cost', w: 7, r: 1, p: 2, h: 'COST' }, { k: 'calls', w: 5, r: 1, p: 3, h: 'CALLS' },
    { k: 'time', w: 7, r: 1, h: 'TIME' },
  ] as Column[]).filter(c => (c.p || 1) <= tier)
  const fixed = cd.filter(c => c.w).reduce((s, c) => s + (c.w as number), 0)
  const flex = W - 5 - fixed - (cd.length - 1) * 2
  const hasTask = cd.some(c => c.k === 'task')
  const taskWidth = Math.floor(flex * .4)
  cd.forEach(c => { if (c.f) c.w = hasTask ? (c.k === 'task' ? taskWidth : flex - taskWidth) : flex })

  const cell = (c: Column, ag: Row, i: number): string => {
    const w = c.w as number
    const dm = ag.st === 'done' ? 'd' : ''
    const isExpensive = ag.cost >= 0.5 || ag.cost / t.cost >= 0.4
    switch (c.k) {
      case 'name':
        return dim(px[i]) + (ag.d
          ? colorize(dm, fitText(ag.name, w - px[i].length))
          : colorize('B', fitText(ag.name, w - px[i].length)))
      // The generator also prepends an empty colorize() call here; it always yields ''.
      case 'st': return colorize(...statusCell(ag.st, spin))
      case 'model': return dim(fitText(ag.model, w))
      case 'task': return colorize(dm, fitText(ag.task, w))
      case 'act': return colorize(ACT_CODES[ag.st] || '', fitText(ag.act || '—', w))
      case 'tok': return colorize(dm, padLeft(fmtK(ag.i + ag.o), w))
      case 'io': return dim(padLeft(fmtK(ag.i) + '/' + fmtK(ag.o), w))
      case 'cost':
        return isExpensive
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

  const out: string[] = []
  const pct = o.plan ? Math.round(o.plan.done / o.plan.total * 100) + '%' : '—'
  const idl = o.sid || '7f3a9c2e'
  const line = (s: string): string => textLine(W, s, hasFrame)
  if (hasFrame) {
    out.push(topBorder(
      W,
      colorize('B', 'agentview') + dim(' · session ') + idl + (o.path ? dim(' · ') + o.path : ''),
      dim(`${fmtK(t.tok)} tok · ${fmtCost(t.cost)} · plan `) + colorize('B', pct),
    ))
  }
  const summary: [string, string, string, number][] = [
    ['c', spin, 'running', t.running], ['y', '◔', 'waiting', t.waiting],
    ['g', '✓', 'done', t.done], ['r', '✗', 'failed', t.failed],
  ]
  if (t.unknown) summary.push(['d', '?', 'unknown', t.unknown])
  out.push(line(o.ended
    ? colorize('g', '✓ session finished') + dim(` · ${t.n} agents · ${o.ended}`)
    : summary.map(([c, g, w, n]) => n ? colorize(c, `${g} ${n} ${w}`) : dim(`${g} ${n} ${w}`)).join('   ') +
      dim(`   ·  ${t.n} agents`)))
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
  } else out.push(line('plan ' + dim('░'.repeat(barWidth) + '  —   no todo list in this session')))
  out.push(rule(W, hasFrame))
  const hintList = o.hints || [['↑↓', 'select'], ['⏎', 'details'], ['esc', 'close'], ['q', 'quit']]
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
