/** Token count as the generator shows it: exact below 1000, `3.7k` below 100k, then `123k`. */
export const fmtK = (count: number): string => {
  if (count < 1000) return String(count)
  if (count < 100000) return (count / 1000).toFixed(1) + 'k'
  return Math.round(count / 1000) + 'k'
}

/** Duration as the generator shows it: `22s`, `3m08s` or `1h02m`. */
export const fmtT = (seconds: number): string => {
  if (seconds < 60) return seconds + 's'
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm' + String(seconds % 60).padStart(2, '0') + 's'
  return Math.floor(seconds / 3600) + 'h' + String(Math.floor((seconds % 3600) / 60)).padStart(2, '0') + 'm'
}

/** Cost in USD with a tilde, because prices are estimates: `~$0.61`. */
export const fmtCost = (usd: number): string => '~$' + usd.toFixed(2)

/** Model id without the `claude-` prefix and the `[1m]` suffix: `sonnet-5-5`. A dash when unknown. */
export const shortModel = (id?: string): string =>
  id ? id.replace(/^claude-/, '').replace(/\[.*\]$/, '') : '—'
