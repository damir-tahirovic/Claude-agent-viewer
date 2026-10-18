// Agent detail view. A typed port of `detail` in docs/design/spec-generator.js.
import { costOf } from '../core/cost'
import { fmtCost, fmtT, shortModel } from '../core/format'
import type { Action, AgentNode, AgentStatus, Todo } from '../core/model'
import { bottomBorder, progressBar, renderHints, rule, textLine, topBorder } from './frame'
import { colorize, dim, fitText, padLeft, padRight, toAscii } from './lines'

/** Options for one render of the detail view. */
export type DetailOpts = {
  readonly W: number
  readonly agent: AgentNode
  readonly parentName: string
  readonly todos?: ReadonlyArray<Todo>
  readonly now: number
  /** Formats an epoch-ms timestamp as 'HH:MM:SS'; injected so tests are deterministic. */
  readonly clock: (ms: number) => string
  /** Short title shown in the header after the type; defaults to the first line of the description. */
  readonly title?: string
  /** Agent cost in USD; defaults to the estimate from its tokens and model. */
  readonly cost?: number
  /** Whole-session cost in USD; enables the "% of session cost" note. */
  readonly sessionCost?: number
  /** Spinner frame shown for the live action and a running agent. */
  readonly spin?: string
  readonly ascii?: boolean
  /** Key hints in the footer; the generator's list when absent. */
  readonly hints?: ReadonlyArray<readonly [string, string]>
  /** Draw the border; false drops top, bottom and side edges for a host that draws its own. */
  readonly frame?: boolean
}

const LEFT_WIDTH = 66
const MAX_ACTIONS = 20
const MAX_TASK_LINES = 3
const TITLE_WIDTH = 40
const TOKEN_BAR_WIDTH = 20

/** Status badge codes and text for the header. (spec `stCell`) */
export const statusBadge = (status: AgentStatus, spin: string): [string, string] => {
  switch (status) {
    case 'running': return ['c', spin + ' running']
    case 'waiting': return ['y', '◔ waiting']
    case 'done': return ['g', '✓ done']
    case 'failed': return ['rB', '✗ failed']
    case 'unknown': return ['d', '? unknown']
    default: { const unreachable: never = status; return unreachable }
  }
}

/** Integer with thousands separators, like toLocaleString('en-US'). (spec `nm`) */
const withThousands = (count: number): string => String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** Duration of a finished tool call: `0.1s`, `6.1s`, `12s`. */
const callDuration = (ms: number | undefined): string =>
  ms === undefined ? '' : ms < 10_000 ? (ms / 1000).toFixed(1) + 's' : fmtT(Math.round(ms / 1000))

/** Word-wraps the task text, keeping its line breaks; the last allowed line is cut with an ellipsis. */
const wrapTask = (text: string, width: number): string[] => {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let current = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (current && [...current].length + 1 + [...word].length > width) {
        lines.push(current)
        current = word
      } else current = current ? current + ' ' + word : word
    }
    if (current) lines.push(current)
  }
  if (lines.length <= MAX_TASK_LINES) return lines
  const rest = lines.slice(MAX_TASK_LINES - 1).join(' ')
  return [...lines.slice(0, MAX_TASK_LINES - 1), fitText(rest, width).trimEnd()]
}

/** One line of the actions list; `action` is null for the live one. (spec `acts.forEach`) */
const actionLine = (
  clock: string, action: Action | null, tool: string, target: string, duration: string, spin: string,
): string => {
  const mark = action === null
    ? colorize('c', spin)
    : action.ok ? colorize('g', '✓') : colorize('rB', '✗')
  const toolCell = fitText(tool, 6)
  const targetCell = fitText(target, 40)
  return dim(clock) + ' ' + mark + ' ' + (action === null ? colorize('B', toolCell) : toolCell) + ' ' +
    (action === null
      ? colorize('B', targetCell)
      : action.ok === false ? colorize('r', targetCell) : targetCell) +
    ' ' + dim(padLeft(duration, 5))
}

/** The todo block of the right column. */
const todoLines = (todos: ReadonlyArray<Todo>): string[] => {
  const doneCount = todos.filter(todo => todo.status === 'completed').length
  return [
    '',
    dim(`TODO · this agent  ${doneCount}/${todos.length}`),
    ...todos.map(todo => {
      switch (todo.status) {
        case 'completed': return colorize('g', '✓ ') + dim(todo.content)
        case 'in_progress': return colorize('c', '▸ ') + colorize('B', todo.content)
        case 'pending': return colorize('', '◌ ') + dim(todo.content)
        default: { const unreachable: never = todo.status; return unreachable }
      }
    }),
  ]
}

/** Renders the agent detail view as coded lines. (spec `detail`) */
export const renderDetail = (o: DetailOpts): string[] => {
  const W = o.W
  const leftWidth = LEFT_WIDTH
  const rightWidth = W - 2 - leftWidth - 1
  const hasFrame = o.frame ?? true
  const spin = o.spin ?? '⠋'
  const agent = o.agent
  const line = (s: string): string => textLine(W, s, hasFrame)
  const split = (left: string, right: string): string => {
    const body = ' ' + padRight(left, leftWidth - 2) + ' ' + dim('│') + ' ' +
      padRight(right, rightWidth - 2) + ' '
    return hasFrame ? dim('│') + body + dim('│') : body
  }
  const divider = (joint: string): string =>
    dim((hasFrame ? '├' : '') + '─'.repeat(leftWidth) + joint + '─'.repeat(rightWidth) +
      (hasFrame ? '┤' : ''))
  const out: string[] = []

  const firstLine = agent.description.split('\n')[0]
  if (hasFrame) {
    out.push(topBorder(
      W,
      colorize('B', 'agentview') + dim(' › ') + colorize('B', agent.type) +
        dim(' · ' + (o.title ?? fitText(firstLine, TITLE_WIDTH).trimEnd())),
      colorize(...statusBadge(agent.status, spin)),
    ))
  }
  const elapsed = Math.floor(((agent.endedAt ?? o.now) - agent.startedAt) / 1000)
  const current = agent.current
  out.push(line(
    dim('model ') + shortModel(agent.model) + '   ' + dim('parent ') + o.parentName + '   ' +
    dim('started ') + o.clock(agent.startedAt) + '   ' + dim('elapsed ') + fmtT(elapsed) + '   ' +
    dim('tool calls ') + agent.toolCount +
    (current ? '   ' + dim('on this action ') + fmtT(Math.floor((o.now - current.since) / 1000)) : ''),
  ))
  out.push(rule(W, hasFrame))
  out.push(line(dim('TASK')))
  wrapTask(agent.description, W - 4).forEach(text => out.push(line(text)))
  out.push(divider('┬'))

  const shown = agent.recent.slice(-(current ? MAX_ACTIONS - 1 : MAX_ACTIONS))
  const left = [dim(`ACTIONS · last ${shown.length + (current ? 1 : 0)} of ${agent.toolCount}`)]
  shown.forEach(action => left.push(
    actionLine(o.clock(action.at), action, action.tool, action.summary, callDuration(action.ms), spin),
  ))
  if (current) {
    left.push(actionLine(
      o.clock(current.since), null, current.tool, current.summary,
      fmtT(Math.floor((o.now - current.since) / 1000)), spin,
    ))
  }

  const tokens = agent.tokens
  const largest = Math.max(tokens.input, tokens.output, tokens.cacheRead, tokens.cacheWrite, 1)
  const tokenRow = (label: string, count: number): string =>
    fitText(label, 12) + padLeft(withThousands(count), 7) + ' ' +
    progressBar(count, largest, TOKEN_BAR_WIDTH, 'b')
  const cost = o.cost ?? costOf(agent.model, tokens)
  const share = o.sessionCost ? dim(`   ${Math.round(cost / o.sessionCost * 100)}% of session cost`) : ''
  const right = [
    dim('TOKENS'),
    tokenRow('input', tokens.input), tokenRow('output', tokens.output),
    tokenRow('cache read', tokens.cacheRead), tokenRow('cache write', tokens.cacheWrite),
    '',
    fitText('in + out', 12) + padLeft(withThousands(tokens.input + tokens.output), 7),
    fitText('cost', 12) + padLeft(fmtCost(cost), 7) + share,
    ...(o.todos?.length ? todoLines(o.todos) : []),
  ]
  const bodyRows = Math.max(left.length, right.length)
  for (let i = 0; i < bodyRows; i++) out.push(split(left[i] || '', right[i] || ''))
  out.push(divider('┴'))
  out.push(line(renderHints(o.hints?.map(([key, label]): [string, string] => [key, label]) ??
    [['↑↓', 'prev / next agent'], ['esc', 'back to tree'], ['q', 'quit']])))
  if (hasFrame) out.push(bottomBorder(W))
  return o.ascii ? out.map(toAscii) : out
}
