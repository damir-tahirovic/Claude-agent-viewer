import { runs } from '../view/runs'

const SGR_OF_CODE: Readonly<Record<string, string>> = {
  d: '2', B: '1', I: '7', c: '36', y: '33', g: '32', r: '31', b: '34',
}

/** Converts a "{codes|text}" line to ANSI SGR escapes; each styled run ends with a reset. */
export const toAnsi = (line: string): string =>
  runs(line)
    .map(({ codes, text }) => {
      const params = [...codes].map((code) => SGR_OF_CODE[code]).filter((param) => param !== undefined)
      return params.length === 0 ? text : `\x1b[${params.join(';')}m${text}\x1b[0m`
    })
    .join('')
