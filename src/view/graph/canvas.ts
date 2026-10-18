// Character canvas for the graph view. A typed port of `Cv` in docs/design/graph-generator.js.

type Cell = readonly [char: string, codes: string]

/** Hard cap on canvas rows, so a runaway layout cannot grow without bound. */
const MAX_ROWS = 2000

/** A fixed grid of coded cells; writes outside the grid are ignored. (graph spec `Cv`) */
export class Canvas {
  private readonly cells: Cell[][]

  /** `height` is the initial row count; the canvas grows downward up to `MAX_ROWS` as cells are written. */
  constructor(readonly width: number, height: number) {
    this.cells = []
    this.growTo(height)
  }

  private growTo(rows: number): void {
    while (this.cells.length < rows) this.cells.push(Array.from({ length: this.width }, (): Cell => [' ', '']))
  }

  /** Writes one character with color codes. */
  put(x: number, y: number, char: string, codes = ''): void {
    if (x < 0 || x >= this.width || y < 0 || y >= MAX_ROWS) return
    this.growTo(y + 1)
    this.cells[y][x] = [char, codes]
  }

  /** Writes a string starting at x, one cell per character. */
  text(x: number, y: number, text: string, codes = ''): void {
    ;[...text].forEach((char, index) => this.put(x + index, y, char, codes))
  }

  /** Writes consecutive `[text, codes]` runs starting at x. */
  runs(x: number, y: number, runs: ReadonlyArray<readonly [string, string]>): void {
    let position = x
    runs.forEach(([text, codes]) => {
      this.text(position, y, text, codes)
      position += [...text].length
    })
  }

  /** The first `height` rows as `{codes|text}` lines, merging neighbours with equal codes. */
  lines(height: number): string[] {
    return this.cells.slice(0, height).map(row => {
      let out = ''
      let current: string | null = null
      let buffer = ''
      const flush = (): void => {
        if (buffer) out += current ? `{${current}|${buffer}}` : buffer
        buffer = ''
      }
      row.forEach(([char, codes]) => {
        if (codes !== current) {
          flush()
          current = codes
        }
        buffer += char
      })
      flush()
      return out
    })
  }
}
