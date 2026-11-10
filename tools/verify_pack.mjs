/** Verify the packed copy is self-contained and consistent. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const manifestForVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const root = path.join(ROOT, 'dist', 'verify', 'dsh-moyutang-' + manifestForVersion.version)
let failures = 0

function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` → ${detail}`}`)
  if (!ok) failures += 1
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
check('package.json parses', typeof manifest.name === 'string', manifest.name)
check('bundle patch declared', manifest.dsh?.bundle?.patch === './cordis.patch.yml')
check('client half declared', manifest.dsh?.client?.platform === 'web' && manifest.dsh?.client?.immediately === true)

const client = fs.readFileSync(path.join(root, 'client.js'), 'utf8')
check('client module id equals package name', client.includes(`id: '${manifest.name}'`), manifest.name)
const patch = fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8')
check('patch row uses the package name', patch.includes(`name: '${manifest.name}'`), patch.trim())

check('host half exports apply', /export function apply\(/.test(fs.readFileSync(path.join(root, 'index.js'), 'utf8')))

for (const [folder, expected] of [['fish', 60], ['items', 21], ['ponds', 6]]) {
  const files = fs.readdirSync(path.join(root, 'assets', folder)).filter((name) => name.endsWith('.webp'))
  check(`assets/${folder} has ${expected} webp files`, files.length === expected, files.length)
}

for (const file of ['locale/en.json', 'locale/zh-CN.json', 'icon.svg', 'README.md', 'INSTALL.md']) {
  check(`${file} present`, fs.existsSync(path.join(root, file)))
}
for (const file of ['locale/en.json', 'locale/zh-CN.json']) {
  const dict = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
  check(`${file} has meta.title/description`, Boolean(dict.meta?.title && dict.meta?.description))
}

const listed = new Set(manifest.files)
check('files lists the runtime entry points', listed.has('index.js') && listed.has('client.js') && listed.has('cordis.patch.yml'))
check('files lists the asset globs', listed.has('assets/fish/*.webp') && listed.has('assets/items/*.webp') && listed.has('assets/ponds/*.webp'))

const polluted = []
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(png|jpe?g|py|ps1|mjs)$/i.test(entry.name) && !full.includes('assets')) polluted.push(full)
  }
}
walk(root)
check('no working files leaked into the package', polluted.length === 0, polluted.slice(0, 3).join(', '))

const total = (() => {
  let bytes = 0
  const walkSize = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) walkSize(full)
      else bytes += fs.statSync(full).size
    }
  }
  walkSize(root)
  return bytes
})()
console.log(`\npackage size: ${(total / 1024).toFixed(0)} KB`)
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
