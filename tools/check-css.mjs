/** Static sanity check for the CSS string embedded in client.js. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
const open = source.indexOf('const STYLE = `')
const start = open + 'const STYLE = `'.length
const end = source.indexOf('`\n\n    const ZH', start)
if (open < 0 || end < 0) throw new Error('style block not found')
const css = source.slice(start, end)

let depth = 0
let paren = 0
const issues = []
for (let i = 0; i < css.length; i += 1) {
  const ch = css[i]
  if (ch === '{') depth += 1
  if (ch === '}') {
    depth -= 1
    if (depth < 0) issues.push(`extra } at ${i}`)
  }
  if (ch === '(') paren += 1
  if (ch === ')') paren -= 1
  if (ch === '`') issues.push(`stray backtick at ${i}`)
  if (ch === '$' && css[i + 1] === '{') issues.push(`stray template interpolation at ${i}`)
}

const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
const emptySelectors = rules.filter((match) => match[1].trim() === '')
const doubled = rules.filter((match) => /;;|:\s*;/.test(match[2]))

console.log('css bytes:', css.length)
console.log('brace depth (0 expected):', depth, '| paren depth:', paren)
console.log('rules:', rules.length)
console.log('issues:', issues.length ? issues.slice(0, 8) : 'none')
console.log('empty selectors:', emptySelectors.length)
console.log('doubled declarations:', doubled.length)
console.log('uses color-mix:', css.includes('color-mix'))
console.log('button colors declared:', (css.match(/\.mt-(cast|btn)[^{]*\{[^}]*color:/g) || []).length)
process.exit(depth === 0 && paren === 0 && issues.length === 0 ? 0 : 1)
