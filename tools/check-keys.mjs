/**
 * Compare every t('key') used in client.js against the two dictionaries, and
 * report keys that would fall through to the raw key text in the UI.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')

function dictOf(name) {
  const start = source.indexOf(`const ${name} = {`)
  if (start < 0) throw new Error(`dictionary ${name} not found`)
  const end = source.indexOf('\n    }\n', start)
  const body = source.slice(start, end)
  const keys = new Set()
  for (const match of body.matchAll(/^\s{6}([a-zA-Z0-9]+):/gm)) keys.add(match[1])
  return keys
}

const zh = dictOf('ZH')
const en = dictOf('EN')

const used = new Set()
for (const match of source.matchAll(/\bt\('([a-zA-Z0-9]+)'\)/g)) used.add(match[1])
for (const match of source.matchAll(/\bt\("([a-zA-Z0-9]+)"\)/g)) used.add(match[1])

const missingZh = [...used].filter((key) => !zh.has(key)).sort()
const missingEn = [...used].filter((key) => !en.has(key)).sort()
const unused = [...zh].filter((key) => !used.has(key)).sort()

console.log('keys used:', used.size, '| ZH:', zh.size, '| EN:', en.size)
console.log('missing in ZH:', missingZh.length ? missingZh.join(', ') : 'none')
console.log('missing in EN:', missingEn.length ? missingEn.join(', ') : 'none')
console.log('defined but unused:', unused.length ? unused.join(', ') : 'none')
process.exit(missingZh.length === 0 && missingEn.length === 0 ? 0 : 1)
