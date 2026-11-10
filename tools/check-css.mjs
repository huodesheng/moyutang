/** Static sanity check for the CSS strings embedded in client.js. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
let failures = 0

for (const [name, endMarker] of [
  ['STYLE', '`\n\n    const ZH'],
  ['DOCK_STYLE', '`\n\n    function AutoDock'],
]) {
  const open = source.indexOf(`const ${name} = \``)
  const start = open + `const ${name} = \``.length
  const end = source.indexOf(endMarker, start)
  if (open < 0 || end < 0) throw new Error(`${name} block not found`)
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

  console.log(`[${name}] bytes ${css.length} | rules ${rules.length} | braces ${depth} | parens ${paren}`)
  console.log(
    `[${name}] issues: ${issues.length ? issues.slice(0, 5).join(', ') : 'none'} | empty selectors ${emptySelectors.length} | doubled ${doubled.length}`,
  )
  if (depth !== 0 || paren !== 0 || issues.length > 0 || emptySelectors.length > 0) failures += 1
}

console.log(`uses color-mix: ${source.includes('color-mix')}`)
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
