/** Everything a pane build depends on; the session is compared by identity, the rest by value. */
export type ViewKey = {
  readonly session: object
  readonly view: string
  readonly selId: string
  readonly mode: string | undefined
  readonly graphCol: number | undefined
  readonly spin: number
  readonly win: readonly [number, number] | undefined
  readonly columns: number
  readonly rows: number
  readonly ascii: boolean
  /** The clock second, since durations on screen move once a second. */
  readonly second: number
}

const sameWindow = (a: ViewKey['win'], b: ViewKey['win']): boolean =>
  a === b || (a !== undefined && b !== undefined && a[0] === b[0] && a[1] === b[1])

const sameKey = (a: ViewKey, b: ViewKey): boolean =>
  a.session === b.session && a.view === b.view && a.selId === b.selId && a.mode === b.mode &&
  a.graphCol === b.graphCol && a.spin === b.spin && sameWindow(a.win, b.win) && a.columns === b.columns &&
  a.rows === b.rows && a.ascii === b.ascii && a.second === b.second

/** One-entry memo: `build` runs only when the key differs from the last call's. */
export const createViewMemo = <Result>() => {
  let last: { readonly key: ViewKey; readonly result: Result } | undefined
  return (key: ViewKey, build: () => Result): Result => {
    if (last && sameKey(last.key, key)) return last.result
    const result = build()
    last = { key, result }
    return result
  }
}
