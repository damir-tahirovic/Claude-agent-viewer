// Dependency-free build: compile with the local tsc, then make relative specifiers valid for Node ESM.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

rmSync(dist, { recursive: true, force: true })
// execFileSync throws on a non-zero exit, so tsc errors fail the build loudly.
execFileSync(join(root, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.cli.json'], { cwd: root, stdio: 'inherit' })

const jsFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? jsFiles(path) : path.endsWith('.js') ? [path] : []
  })

const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])(\.{1,2}\/[^'"]*)\2/g
const withExtension = (specifier) => (/\.[cm]?js$|\.json$/.test(specifier) ? specifier : `${specifier}.js`)

for (const file of jsFiles(dist)) {
  const source = readFileSync(file, 'utf8')
  const rewritten = source.replace(SPECIFIER, (_, lead, quote, specifier) =>
    `${lead}${quote}${withExtension(specifier)}${quote}`)
  if (rewritten !== source) writeFileSync(file, rewritten)
}
