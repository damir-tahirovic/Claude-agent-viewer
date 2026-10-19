// Node edge of the standalone CLI: terminal setup, the 1 s poll loop and cleanup. Rendering lives in app.ts.
import * as os from 'node:os'
import * as path from 'node:path'
import { stripCodes, SPIN } from '../view/lines'
import { toAnsi } from './ansi'
import { handleKey, hasLiveAgents, initialAppState, parseKeys, renderApp, type AppState, type RenderOpts } from './app'
import { diffScreen, fullScreen } from './screen'
import { createWatcher } from './watcher'

const ENTER_ALT_SCREEN = '\x1b[?1049h'
const LEAVE_ALT_SCREEN = '\x1b[?1049l'
const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'
const TICK_MS = 1000
// With nothing running the screen only needs fresh ages and stale detection now and then.
const IDLE_REFRESH_MS = 60_000
const SNAPSHOT_COLUMNS = 100
const SNAPSHOT_ROWS = 30
const DEFAULT_COLUMNS = 80
const DEFAULT_ROWS = 24

/** Injectable pieces so tests can drive the loop without a real terminal. */
export type RunOptions = {
  readonly env?: NodeJS.ProcessEnv
  readonly stdout?: NodeJS.WriteStream
  readonly stdin?: NodeJS.ReadStream
}

const pad2 = (value: number): string => String(value).padStart(2, '0')
const clockText = (ms: number): string => {
  const date = new Date(ms)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}
const localMidnight = (ms: number): number => new Date(ms).setHours(0, 0, 0, 0)

const isAscii = (env: NodeJS.ProcessEnv): boolean => {
  if (env.AGENTVIEW_ASCII === '1') return true
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || ''
  return !/utf-?8/i.test(locale)
}

/** Runs the viewer: one plain snapshot when stdout is not a TTY, otherwise the live full-screen loop. */
export const run = (options: RunOptions = {}): void => {
  const env = options.env ?? process.env
  const stdout = options.stdout ?? process.stdout
  const stdin = options.stdin ?? process.stdin
  const home = os.homedir()
  const projectsDir = env.AGENTVIEW_PROJECTS_DIR ?? path.join(home, '.claude', 'projects')
  const ascii = isAscii(env)
  const watcher = createWatcher({ projectsDir })
  const renderOpts = (spin: string, now: number): RenderOpts =>
    ({ home, ascii, spin, clock: clockText, dayStart: localMidnight(now) })

  if (!stdout.isTTY) {
    const now = Date.now()
    watcher.poll(now)
    const { lines } = renderApp(
      initialAppState(), watcher.sessions(), now, SNAPSHOT_COLUMNS, SNAPSHOT_ROWS, renderOpts(SPIN[0], now))
    stdout.write(`${lines.map(stripCodes).join('\n')}\n`)
    return
  }

  let app: AppState = initialAppState()
  let spinIndex = 0
  let painted: string[] = []
  let isClosed = false
  let lastDrawAt = 0
  const rawBefore = stdin.isRaw

  const size = () => ({ columns: stdout.columns || DEFAULT_COLUMNS, rows: stdout.rows || DEFAULT_ROWS })

  const paint = (now: number): string[] => {
    const { columns, rows } = size()
    const result = renderApp(app, watcher.sessions(), now, columns, rows, renderOpts(SPIN[spinIndex], now))
    app = result.app
    return result.lines.map(toAnsi)
  }

  const redraw = (): void => {
    const next = paint(Date.now())
    const out = diffScreen(painted, next, size().rows)
    painted = next
    lastDrawAt = Date.now()
    if (out !== '') stdout.write(out)
  }

  const redrawFully = (): void => {
    painted = paint(Date.now())
    lastDrawAt = Date.now()
    stdout.write(fullScreen(painted, size().rows))
  }

  const safePoll = (now: number): void => {
    try {
      watcher.poll(now)
    } catch {
      // A broken transcript must not take the viewer down; the next tick tries again.
    }
  }

  const tick = setInterval(() => {
    const now = Date.now()
    let hasChanged = false
    try {
      hasChanged = watcher.poll(now)
    } catch {
      // A broken transcript must not take the viewer down; the next tick tries again.
    }
    // The spinner and clocks only move while something is running; an idle screen writes nothing.
    const isLive = hasLiveAgents(watcher.sessions(), app, now)
    if (isLive) spinIndex = (spinIndex + 1) % SPIN.length
    if (isLive || hasChanged || now - lastDrawAt >= IDLE_REFRESH_MS) redraw()
  }, TICK_MS)

  const restore = (): void => {
    if (isClosed) return
    isClosed = true
    clearInterval(tick)
    stdin.off('data', onData)
    stdout.off('resize', redrawFully)
    stdout.write(SHOW_CURSOR + LEAVE_ALT_SCREEN)
    try {
      stdin.setRawMode(rawBefore === true)
    } catch {
      // Not every stdin supports raw mode; nothing left to restore then.
    }
    stdin.pause()
  }

  const quit = (code: number): void => {
    restore()
    process.exit(code)
  }

  function onData(chunk: Buffer | string): void {
    const now = Date.now()
    for (const key of parseKeys(String(chunk))) {
      const next = handleKey(app, key, watcher.sessions(), now, size().columns)
      if (next === 'quit') return quit(0)
      app = next
    }
    redraw()
  }

  process.on('SIGINT', () => quit(0))
  process.on('SIGTERM', () => quit(0))
  process.on('uncaughtException', (error) => {
    restore()
    console.error(error)
    process.exit(1)
  })
  // Node turns SIGWINCH into 'resize' on a TTY stdout, so one listener covers both.
  stdout.on('resize', redrawFully)

  stdout.write(ENTER_ALT_SCREEN + HIDE_CURSOR)
  stdin.setRawMode(true)
  stdin.resume()
  stdin.on('data', onData)
  safePoll(Date.now())
  redrawFully()
}
