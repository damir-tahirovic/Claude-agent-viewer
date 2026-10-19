// Session list renderer for the standalone CLI. A typed port of `sessions` in docs/design/spec-generator.js.
import { fmtCost, fmtK } from '../core/format'
import { statusCell, windowFor } from './dialog'
import { bottomBorder, renderHints, rule, textLine, topBorder } from './frame'
import { colorize, dim, fitText, padLeft, padRight, stripCodes, toAscii, visibleLength } from './lines'
import type { RowStatus } from './rows'

export type SessionListItem = {
  readonly status: RowStatus
  readonly project: string
  readonly id: string
  readonly agents: string
  readonly tok: number
  /** True when some agent's output is unknown, so `tok` is a lower bound and shows a plus. */
  readonly isTokPartial?: true
  readonly cost: number
  readonly plan: string
  readonly act: string
  readonly ago: string
}

export type SessionListOpts = {
  W: number
  active: ReadonlyArray<SessionListItem>
  recent: ReadonlyArray<SessionListItem>
  /** Id of the selected session; none selected when absent. */
  selId?: string
  /** Tokens across all listed sessions, shown in the title bar. */
  totalTok: number
  /** True when the total includes a session with unknown output; the title shows a plus. */
  isTotalPartial?: boolean
  totalCost: number
  /** False when the cost is unknown: the COST column is dropped and the title shows a dash. */
  hasCost: boolean
  spin?: string
  ascii?: boolean
  /** Pads the output to this many lines; sessions beyond what fits scroll. */
  minRows?: number
  /** The window shown last time; the new window moves the least that keeps the selection visible. */
  win?: [number, number]
}

type ColumnKind = 'st' | 'pj' | 'id' | 'ag' | 'tok' | 'cost' | 'plan' | 'act' | 'ago'
type Column = {
  k: ColumnKind
  w?: number
  f?: 1
  r?: 1
  /** Tier at which the column appears: 1 narrow, 2 wide. */
  p?: number
  h: string
}

// Lines outside the session rows: top, rule, header, closing rule, hints, bottom.
const CHROME_LINES = 6
const EMPTY_TEXT = 'no Claude Code sessions found in ~/.claude/projects'

/** Token total with one decimal below a million, as the spec's title bar shows it ("118.3k"). */
const fmtTotal = (count: number): string => (count < 1000 ? fmtK(count) : (count / 1000).toFixed(1) + 'k')

const ACT_CODES: Partial<Record<RowStatus, string>> = { waiting: 'y', failed: 'r' }

/** Renders the session list as coded lines. (spec `sessions`, the `mk` closure) */
export const renderSessions = (o: SessionListOpts): string[] => {
  const W = o.W
  const spin = o.spin ?? '⠋'
  const tier = W < 100 ? 1 : 2
  const all = [...o.active, ...o.recent]
  const columns: Column[] = ([
    { k: 'st', w: 9, h: 'STATUS' }, { k: 'pj', f: 1, h: 'PROJECT' }, { k: 'id', w: 8, p: 2, h: 'SESSION' },
    { k: 'ag', w: 10, h: 'AGENTS' }, { k: 'tok', w: 6, r: 1, h: 'TOK' },
    { k: 'cost', w: 7, r: 1, p: 2, h: 'COST' }, { k: 'plan', w: 5, r: 1, h: 'PLAN' },
    { k: 'act', f: 1, p: 2, h: 'LAST ACTION' }, { k: 'ago', w: 6, r: 1, h: 'AGO' },
  ] as Column[]).filter(c => (c.p || 1) <= tier && (c.k !== 'cost' || o.hasCost))
  const fixed = columns.filter(c => c.w).reduce((sum, c) => sum + (c.w as number), 0)
  const flex = W - 5 - fixed - (columns.length - 1) * 2
  const flexCount = columns.filter(c => c.f).length
  const projectWidth = Math.floor(flex * .4)
  columns.forEach(c => { if (c.f) c.w = flexCount === 2 ? (c.k === 'pj' ? projectWidth : flex - projectWidth) : flex })

  const cell = (c: Column, s: SessionListItem): string => {
    const w = c.w as number
    const dm = s.status === 'done' || s.status === 'unknown' ? 'd' : ''
    switch (c.k) {
      case 'st': return colorize(...statusCell(s.status, spin))
      case 'pj': return colorize(dm, fitText(s.project, w))
      case 'id': return dim(fitText(s.id, w))
      case 'ag': return colorize(dm, fitText(s.agents, w))
      case 'tok': return colorize(dm, padLeft(fmtK(s.tok) + (s.isTokPartial ? '+' : ''), w))
      case 'cost': return colorize(dm, padLeft(fmtCost(s.cost), w))
      case 'plan': return colorize(dm, padLeft(s.plan, w))
      case 'act': return colorize(ACT_CODES[s.status] ?? 'd', fitText(s.act, w))
      case 'ago': return dim(padLeft(s.ago, w))
      default: { const unreachable: never = c.k; return unreachable }
    }
  }
  const row = (s: SessionListItem, isSelected: boolean): string => {
    const inner = (isSelected ? '▸' : ' ') + ' ' + columns.map(c => cell(c, s)).join('  ') + ' '
    return dim('│') + (isSelected ? colorize('IB', stripCodes(inner)) : inner) + dim('│')
  }
  const line = (s: string): string => textLine(W, s, true)

  const out: string[] = []
  out.push(topBorder(
    W,
    colorize('B', 'agentview') + dim(` · ${all.length} sessions · ${o.active.length} active`),
    dim(`${fmtTotal(o.totalTok)}${o.isTotalPartial ? '+' : ''} tok today · ${o.hasCost ? fmtCost(o.totalCost) : '—'}`),
  ))
  out.push(rule(W, true))
  const heads = columns.map(c => c.r ? padLeft(c.h, c.w as number) : fitText(c.h, c.w as number)).join('  ')
  // Header row patch from render-spec.js: dim edges around the heads, not the txt() helper.
  out.push(dim('│') + dim('  ' + heads) + ' ' + dim('│'))

  if (!all.length) {
    out.push(line(dim(EMPTY_TEXT)))
  } else {
    // Window over the combined list; the group headings and scroll hints are reserved out of the room.
    const groupCount = (o.active.length ? 1 : 0) + (o.recent.length ? 1 : 0)
    const reserved = groupCount + (groupCount === 2 ? 1 : 0) + 2
    const capacity = o.minRows ? Math.max(1, o.minRows - CHROME_LINES - reserved) : all.length
    const selIndex = Math.max(0, all.findIndex(s => s.id === o.selId))
    const [start, end] = windowFor(all.length, selIndex, capacity, o.win)
    if (start > 0) out.push(line(dim(`  ↑ ${start} more above`)))
    const showGroup = (name: string, items: ReadonlyArray<SessionListItem>, offset: number, hasBlankBefore: boolean) => {
      const from = Math.max(start, offset)
      const to = Math.min(end, offset + items.length)
      if (from >= to) return
      if (hasBlankBefore) out.push(line(''))
      out.push(line(dim(`${name} · ${items.length}`)))
      for (let idx = from; idx < to; idx++) out.push(row(all[idx], all[idx].id === o.selId))
    }
    showGroup('ACTIVE', o.active, 0, false)
    showGroup('RECENT', o.recent, o.active.length, start < o.active.length && end > o.active.length)
    if (end < all.length) out.push(line(dim(`  ↓ ${all.length - end} more below`)))
  }
  if (o.minRows) while (out.length < o.minRows - 3) out.push(line(''))
  out.push(rule(W, true))
  out.push(line(padRight(renderHints([['↑↓', 'select'], ['⏎', 'open session'], ['q', 'quit']]), W - 4 - 6) +
    colorize('g', '●') + dim(' live')))
  out.push(bottomBorder(W))
  return o.ascii ? out.map(toAscii) : out
}
