import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clipLine, stripCodes, toAscii } from '../../src/view/lines'

test('clipLine leaves a short line alone', () => assert.equal(clipLine('{c|abc}', 5), '{c|abc}'))
test('clipLine cuts across runs and keeps the codes of what stays', () => {
  assert.equal(clipLine('ab{c|cdef}{d|gh}', 4), 'ab{c|cd}')
})
test('clipLine result is never wider than the width', () => {
  assert.equal([...stripCodes(clipLine('{B|hello} {d|world}', 7))].length, 7)
})
test('toAscii maps the prev arrow', () => assert.equal(toAscii('◂ ▸'), '< >'))
