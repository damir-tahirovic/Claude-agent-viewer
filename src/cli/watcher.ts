import * as nodeFs from 'node:fs'
import { join } from 'node:path'
import { MAIN, type AgentEvent, type SessionState } from '../core/model'
import { initialState, reduce } from '../core/reducer'
import { initialParseState, metaStart, parseRecord, type ParseState } from './transcript'

// Node side of the CLI: finds transcript files and tails them. Pure parsing stays in transcript.ts.
// It never throws out of poll(): an unreadable file is skipped for that round.

/** What the watcher needs to know about a file. */
export type FileStat = { readonly size: number; readonly mtimeMs: number }

/** The fs calls the watcher makes; injected so tests can count the bytes it reads. */
export type FileSystem = {
  readonly stat: (path: string) => FileStat
  readonly list: (path: string) => ReadonlyArray<string>
  readonly readRange: (path: string, start: number, length: number) => Buffer
  readonly readText: (path: string) => string
}

/** Real file system built on node:fs. */
export const nodeFileSystem: FileSystem = {
  stat: path => {
    const { size, mtimeMs } = nodeFs.statSync(path)
    return { size, mtimeMs }
  },
  list: path => nodeFs.readdirSync(path),
  readRange: (path, start, length) => {
    const descriptor = nodeFs.openSync(path, 'r')
    try {
      const buffer = Buffer.alloc(length)
      const bytesRead = nodeFs.readSync(descriptor, buffer, 0, length, start)
      return bytesRead === length ? buffer : buffer.subarray(0, bytesRead)
    } finally {
      nodeFs.closeSync(descriptor)
    }
  },
  readText: path => nodeFs.readFileSync(path, 'utf8'),
}

/** One session found on disk with its reduced state. */
export type WatchedSession = {
  readonly sessionId: string
  readonly projectDir: string
  readonly cwd?: string
  readonly title?: string
  readonly state: SessionState
  readonly startedAt: number
  readonly lastAt: number
}

/** Options of createWatcher. */
export type WatcherOptions = {
  readonly projectsDir: string
  readonly fs?: FileSystem
  readonly maxAgeMs?: number
  readonly maxSessions?: number
}

const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_MAX_SESSIONS = 50
const LIST_EVERY_MS = 5000
const CHUNK_BYTES = 4 * 1024 * 1024
const NEWLINE = 0x0a
const AGENT_FILE = /^agent-(.+)\.jsonl$/

// Mutable on purpose: this is the I/O edge, and one tail is owned by one watcher.
type Tail = { offset: number; pending: Buffer; parse: ParseState }

type Batch = {
  events: AgentEvent[]
  firstAt?: number
  lastAt?: number
  cwd?: string
  title?: string
}

type AgentWatch = {
  readonly id: string
  readonly path: string
  readonly metaPath: string
  tail: Tail
  metaMtimeMs: number
  isFinished: boolean
  isEndEmitted: boolean
  lastAt?: number
}

type SessionWatch = {
  readonly path: string
  readonly sessionId: string
  readonly projectDir: string
  readonly subagentsDir: string
  tail: Tail
  state?: SessionState
  cwd?: string
  title?: string
  startedAt: number
  lastAt: number
  mtimeMs?: number
  subagentsMtimeMs?: number
  readonly agents: Map<string, AgentWatch>
}

const newTail = (): Tail => ({ offset: 0, pending: Buffer.alloc(0), parse: initialParseState() })

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Reads the bytes appended since the last read and parses the complete lines among them. */
const readNew = (fs: FileSystem, path: string, tail: Tail, size: number, agentId: string): Batch => {
  const batch: Batch = { events: [] }
  while (tail.offset < size) {
    let chunk: Buffer
    try {
      chunk = fs.readRange(path, tail.offset, Math.min(CHUNK_BYTES, size - tail.offset))
    } catch {
      break
    }
    if (chunk.length === 0) break
    // Decode only whole lines: a multi-byte character cut by the read boundary stays in `pending`.
    const bytes = Buffer.concat([tail.pending, chunk])
    const lastNewline = bytes.lastIndexOf(NEWLINE)
    tail.offset += chunk.length
    tail.pending = lastNewline === -1 ? bytes : bytes.subarray(lastNewline + 1)
    if (lastNewline === -1) continue
    for (const line of bytes.toString('utf8', 0, lastNewline).split('\n')) {
      if (line.trim() === '') continue
      let record: unknown
      try {
        record = JSON.parse(line)
      } catch {
        continue
      }
      collect(batch, record)
      const parsed = parseRecord(tail.parse, record, agentId)
      tail.parse = parsed.state
      batch.events.push(...parsed.events)
    }
  }
  return batch
}

/** Notes record time, cwd (first one wins) and ai-title (latest wins). */
const collect = (batch: Batch, record: unknown): void => {
  if (!isObject(record)) return
  const at = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : Number.NaN
  if (!Number.isNaN(at)) {
    batch.firstAt ??= at
    batch.lastAt = Math.max(batch.lastAt ?? at, at)
  }
  if (batch.cwd === undefined && typeof record.cwd === 'string') batch.cwd = record.cwd
  if (record.type === 'ai-title' && typeof record.aiTitle === 'string') batch.title = record.aiTitle
}

/** Creates a polling watcher over the transcript files under projectsDir; the caller owns the timer. */
export const createWatcher = (options: WatcherOptions) => {
  const fs = options.fs ?? nodeFileSystem
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS
  const watched = new Map<string, SessionWatch>()
  let ordered: SessionWatch[] = []
  let lastListAt = Number.NEGATIVE_INFINITY
  let lastNow = Number.NEGATIVE_INFINITY

  const safeList = (path: string): ReadonlyArray<string> => {
    try {
      return fs.list(path)
    } catch {
      return []
    }
  }

  const safeStat = (path: string): FileStat | undefined => {
    try {
      return fs.stat(path)
    } catch {
      return undefined
    }
  }

  /** Lists the project directories; returns true when the set of tracked sessions changed. */
  const discover = (now: number): boolean => {
    const found: Array<{ session: SessionWatch; mtimeMs: number }> = []
    for (const projectDir of safeList(options.projectsDir)) {
      const projectPath = join(options.projectsDir, projectDir)
      for (const name of safeList(projectPath)) {
        if (!name.endsWith('.jsonl')) continue
        const path = join(projectPath, name)
        const stat = safeStat(path)
        if (!stat || now - stat.mtimeMs > maxAgeMs) continue
        const sessionId = name.slice(0, -'.jsonl'.length)
        const session = watched.get(path) ?? {
          path,
          sessionId,
          projectDir,
          subagentsDir: join(projectPath, sessionId, 'subagents'),
          tail: newTail(),
          startedAt: stat.mtimeMs,
          lastAt: stat.mtimeMs,
          agents: new Map<string, AgentWatch>(),
        }
        found.push({ session, mtimeMs: stat.mtimeMs })
      }
    }
    found.sort((left, right) => right.mtimeMs - left.mtimeMs)
    const next = found.slice(0, maxSessions).map(entry => entry.session)
    const hasChanged = next.length !== ordered.length || next.some((session, index) => session !== ordered[index])
    watched.clear()
    for (const session of next) watched.set(session.path, session)
    ordered = next
    return hasChanged
  }

  const resetSession = (session: SessionWatch): void => {
    session.tail = newTail()
    session.state = undefined
    session.cwd = undefined
    session.title = undefined
    session.agents.clear()
    session.subagentsMtimeMs = undefined
  }

  /** Tails one subagent file and its meta; returns its events (start, records, finish). */
  const pollAgent = (agent: AgentWatch, isNew: boolean, meta: unknown, metaMtimeMs: number): AgentEvent[] => {
    const stat = safeStat(agent.path)
    if (stat && stat.size < agent.tail.offset) agent.tail = newTail()
    const batch = stat ? readNew(fs, agent.path, agent.tail, stat.size, agent.id) : { events: [] }
    if (batch.lastAt !== undefined) agent.lastAt = Math.max(agent.lastAt ?? batch.lastAt, batch.lastAt)
    const events: AgentEvent[] = []
    if (isNew) {
      const start = metaStart(meta, agent.id, batch.firstAt ?? metaMtimeMs)
      if (start) events.push(start)
    }
    events.push(...batch.events)
    if (agent.isFinished && !agent.isEndEmitted) {
      agent.isEndEmitted = true
      events.push({ kind: 'agent.end', at: agent.lastAt ?? metaMtimeMs, id: agent.id, ok: true })
    }
    return events
  }

  const readMeta = (agent: AgentWatch, stat: FileStat): unknown => {
    agent.metaMtimeMs = stat.mtimeMs
    const meta: unknown = JSON.parse(fs.readText(agent.metaPath))
    agent.isFinished = isObject(meta) && meta.finished === true
    return meta
  }

  const pollSubagents = (session: SessionWatch, isMainChanged: boolean): AgentEvent[] => {
    const dirStat = safeStat(session.subagentsDir)
    const isDirChanged = dirStat?.mtimeMs !== session.subagentsMtimeMs
    const events: AgentEvent[] = []
    const newIds = new Set<string>()
    if (isMainChanged || isDirChanged) {
      session.subagentsMtimeMs = dirStat?.mtimeMs
      for (const name of dirStat ? safeList(session.subagentsDir) : []) {
        const id = AGENT_FILE.exec(name)?.[1]
        if (id === undefined || session.agents.has(id)) continue
        const base = join(session.subagentsDir, `agent-${id}`)
        const agent: AgentWatch = {
          id,
          path: `${base}.jsonl`,
          metaPath: `${base}.meta.json`,
          tail: newTail(),
          metaMtimeMs: 0,
          isFinished: false,
          isEndEmitted: false,
        }
        const metaStat = safeStat(agent.metaPath)
        if (!metaStat) continue
        try {
          const meta = readMeta(agent, metaStat)
          session.agents.set(id, agent)
          newIds.add(id)
          events.push(...pollAgent(agent, true, meta, metaStat.mtimeMs))
        } catch {
          // Meta unreadable or half-written: retried on the next directory change.
        }
      }
    }
    for (const agent of session.agents.values()) {
      if (newIds.has(agent.id)) continue
      if (!agent.isEndEmitted) {
        const metaStat = safeStat(agent.metaPath)
        if (metaStat && metaStat.mtimeMs !== agent.metaMtimeMs) {
          try {
            readMeta(agent, metaStat)
          } catch {
            // Keep the old meta; the next mtime change retries.
          }
        }
      }
      events.push(...pollAgent(agent, false, undefined, agent.metaMtimeMs))
    }
    return events
  }

  /** Reads what changed in one session and reduces it; returns true when its state or labels changed. */
  const pollSession = (session: SessionWatch, now: number): boolean => {
    const stat = safeStat(session.path)
    if (!stat) return false
    if (stat.size < session.tail.offset) resetSession(session)
    const isMainChanged = stat.mtimeMs !== session.mtimeMs || stat.size !== session.tail.offset
    session.mtimeMs = stat.mtimeMs
    const batch = readNew(fs, session.path, session.tail, stat.size, MAIN)
    const events = [...batch.events, ...pollSubagents(session, isMainChanged)]
    // Records of different files interleave in time; the reducer expects them in order.
    events.sort((left, right) => left.at - right.at)
    const before = session.state
    let state = before ?? initialState(session.sessionId, events[0]?.at ?? batch.firstAt ?? stat.mtimeMs)
    for (const event of events) state = reduce(state, event)
    if (events.length > 0 || now > lastNow) state = reduce(state, { kind: 'tick', at: now })
    session.state = state
    if (before === undefined) session.startedAt = state.startedAt
    const previousLabels = `${session.cwd}\n${session.title}`
    session.cwd ??= batch.cwd
    if (batch.title !== undefined) session.title = batch.title
    session.lastAt = Math.max(session.lastAt, batch.lastAt ?? 0, ...events.map(event => event.at))
    return state !== before || previousLabels !== `${session.cwd}\n${session.title}`
  }

  return {
    /** Reads what changed on disk and reduces it; true when a session or the session set changed. */
    poll: (now: number): boolean => {
      let hasChanged = false
      if (now - lastListAt >= LIST_EVERY_MS) {
        lastListAt = now
        hasChanged = discover(now)
      }
      for (const session of ordered) {
        try {
          if (pollSession(session, now)) hasChanged = true
        } catch {
          // One broken file must not stop the others.
        }
      }
      lastNow = Math.max(lastNow, now)
      return hasChanged
    },
    /** Tracked sessions, newest file first; sessions not yet read are left out. */
    sessions: (): ReadonlyArray<WatchedSession> =>
      ordered.flatMap(session =>
        session.state
          ? [{
              sessionId: session.sessionId,
              projectDir: session.projectDir,
              cwd: session.cwd,
              title: session.title,
              state: session.state,
              startedAt: session.startedAt,
              lastAt: session.lastAt,
            }]
          : [],
      ),
  }
}
