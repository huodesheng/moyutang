/**
 * Asset-path smoke test: renders the components that switch to real artwork and
 * checks they produce <img> nodes instead of the procedural SVG fallback.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
const marker = '    return {\n      inject: [\'slots\'],'
const instrumented = source.replace(
  marker,
  `    globalThis.__MT_ASSETS__ = { FishImage, ItemIcon, PondScene, CatchCard, WeatherLayer, PetLayer, petAnimation, FISH, PONDS }
${marker}`,
)
const temporary = path.join(path.join(ROOT, 'tools'), '.tmp-assets.mjs')
fs.writeFileSync(temporary, instrumented)

globalThis.window = { __ModuleLoader__: { load(def) { globalThis.__DEF__ = def } }, addEventListener() {}, removeEventListener() {} }
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
globalThis.performance = globalThis.performance || { now: () => Date.now() }
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) })

let hookStore = []
let hookIndex = 0
const React = {
  createElement: (type, props, ...children) => ({ $$el: true, type, props: props || {}, children: children.flat(Infinity) }),
  createContext: () => ({ Provider: 'p' }),
  useContext: () => ({ t: (k) => k }),
  useState: (init) => {
    const i = hookIndex++
    if (!(i in hookStore)) hookStore[i] = typeof init === 'function' ? init() : init
    return [hookStore[i], () => {}]
  },
  useRef: (init) => {
    const i = hookIndex++
    if (!(i in hookStore)) hookStore[i] = { current: init }
    return hookStore[i]
  },
  useEffect: () => {
    hookIndex += 1
  },
  useMemo: (fn) => {
    hookIndex += 1
    return fn()
  },
  useCallback: (fn) => {
    hookIndex += 1
    return fn
  },
  Component: class {
    constructor(props) {
      this.props = props
    }
  },
}

await import(pathToFileURL(temporary).href)
const plugin = globalThis.__DEF__.factory(() => React)
const ctx = {
  get: () => undefined,
  effect: (fn) => {
    fn()
    return () => {}
  },
  slots: { inject: (key, cb) => { cb(); return () => {} }, register: () => () => {} },
}
plugin.apply(ctx)
const api = globalThis.__MT_ASSETS__
fs.unlinkSync(temporary)

function render(component, props) {
  hookStore = []
  hookIndex = 0
  return component(props)
}

function collect(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    node.forEach((child) => collect(child, out))
    return out
  }
  if (!node.$$el) return out
  out.push(node)
  node.children.forEach((child) => collect(child, out))
  return out
}

let failures = 0
function check(name, condition, detail) {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${condition || detail === undefined ? '' : ` → ${detail}`}`)
  if (!condition) failures += 1
}

const fish = api.FISH.find((entry) => entry.id === 'moyu')
const assets = {
  fish: new Set(api.FISH.map((entry) => entry.id)),
  items: new Set(['bamboo', 'hut', 'bobber', 'glow']),
  ponds: new Set(api.PONDS.map((pond) => pond.id)),
  url: (kind, id) => `/moyutang-api/asset/${kind}/${id}.webp?v=1`,
}

const fishTree = collect(render(api.FishImage, { fish, size: 72, assets }))
const fishImg = fishTree.find((node) => node.type === 'img')
check('FishImage renders an <img> when art exists', Boolean(fishImg), JSON.stringify(fishTree.map((n) => n.type)))
check('FishImage points at the asset route', fishImg && fishImg.props.src === '/moyutang-api/asset/fish/moyu.webp?v=1', fishImg && fishImg.props.src)

const lockedTree = collect(render(api.FishImage, { fish, size: 72, assets, locked: true }))
check('locked fish keeps the silhouette fallback', !lockedTree.some((node) => node.type === 'img'))

const noArtTree = collect(render(api.FishImage, { fish, size: 72, assets: { ...assets, fish: new Set() } }))
check('missing art falls back to the SVG', !noArtTree.some((node) => node.type === 'img'))

const iconTree = collect(render(api.ItemIcon, { id: 'bamboo', assets, size: 36 }))
check('ItemIcon renders an <img>', iconTree.some((node) => node.type === 'img'))
const missingIcon = collect(render(api.ItemIcon, { id: 'nope', assets }))
check('unknown item renders nothing', missingIcon.length === 0)

const pond = api.PONDS[0]
const sceneProps = {
  pond,
  phase: 'day',
  power: 40,
  watching: true,
  bite: false,
  reduceMotion: false,
  assets,
  floatArt: 'bobber',
  decorations: ['hut'],
  machine: {
    phase: 'waiting',
    nibbling: false,
    castTo: pond.anchor.float,
    float: { x: pond.anchor.float[0], y: pond.anchor.float[1] },
    splash: false,
  },
}
const scene = collect(render(api.PondScene, sceneProps))
check('pond scene paints the artwork layer', scene.some((node) => node.props.className === 'mt-scene-art'))
check('float sprite is placed on the water', scene.some((node) => node.type === 'img' && String(node.props.className).includes('mt-float-sprite')))
check('fishing line is drawn from the rod tip', scene.some((node) => node.props.className === 'mt-fishing-line'))

const casting = collect(render(api.PondScene, {
  ...sceneProps,
  machine: { ...sceneProps.machine, phase: 'casting', float: { x: 30, y: 40 }, splash: true },
}))
check('casting draws the flying float and splash', casting.some((node) => String(node.props.className).includes('mt-float-sprite'))
  && casting.some((node) => node.props.className === 'mt-splash'))

const charging = collect(render(api.PondScene, {
  ...sceneProps,
  machine: { ...sceneProps.machine, phase: 'charging', float: null },
}))
check('charging shows the landing target ring', charging.some((node) => node.props.className === 'mt-target-ring'))

const biting = collect(render(api.PondScene, { ...sceneProps, bite: true, machine: { ...sceneProps.machine, phase: 'bite' } }))
check('bite shows the bubble and the shake class', biting.some((node) => node.props.className === 'mt-bite-bubble')
  && biting.some((node) => String(node.props.className).includes('mt-scene-bite')))
check('pond scene renders owned decorations', scene.some((node) => String(node.props.className || '').includes('mt-scene-decor-item')))

const fallbackScene = collect(render(api.PondScene, {
  ...sceneProps,
  decorations: [],
  assets: { ...assets, ponds: new Set() },
}))
check('pond scene falls back to the CSS sky', fallbackScene.some((node) => node.props.className === 'mt-sky'))

const stormScene = collect(render(api.PondScene, { ...sceneProps, storm: true }))
check('pond scene hands the storm to the weather layer',
  stormScene.some((node) => node.type === api.WeatherLayer && node.props.storm === true))

const stormLayers = collect(render(api.WeatherLayer, { storm: true, phase: 'day', reduceMotion: false }))
check('storm paints rain, ripples and thunder',
  stormLayers.some((node) => String(node.props.className || '').includes('mt-rain'))
  && stormLayers.some((node) => node.props.className === 'mt-storm-ripple')
  && stormLayers.some((node) => String(node.props.className || '').includes('mt-thunder')))
check('storm drops the sunny glow', !stormLayers.some((node) => node.props.className === 'mt-sun-glow'))

const clearLayers = collect(render(api.WeatherLayer, { storm: false, phase: 'day', reduceMotion: false }))
check('clear weather keeps the sunny glow', clearLayers.some((node) => node.props.className === 'mt-sun-glow'))
check('clear weather has no rain', !clearLayers.some((node) => String(node.props.className || '').includes('mt-rain')))

const calmStorm = collect(render(api.WeatherLayer, { storm: true, phase: 'night', reduceMotion: true }))
check('reduce motion keeps the darkening but drops rain', calmStorm.some((node) => node.props.className === 'mt-storm-dark')
  && !calmStorm.some((node) => String(node.props.className || '').includes('mt-rain')))
check('night adds a time tint', calmStorm.some((node) => node.props.className === 'mt-time-tint'))

/* ---- pets ---------------------------------------------------------- */

const catGame = { save: { pet: { id: 'cat', x: 0.7, y: 0.8 } }, act: () => true }
const catPet = collect(render(api.PetLayer, {
  game: catGame,
  pets: [],
  machine: { phase: 'idle', outcome: null },
  auto: false,
  assets,
  draggingHint: 'drag',
}))
check('built-in cat renders at its saved spot',
  catPet.some((node) => String(node.props.className || '').includes('mt-pet'))
  && catPet.some((node) => node.type === 'img' && String(node.props.className).includes('mt-pet-cat')))

const sheetPet = {
  id: 'local:kitty',
  displayName: 'Kitty',
  frame: { width: 192, height: 208, columns: 8, rows: 9 },
  animations: {},
  sprite: '/moyutang-api/pet/local/kitty/sprite',
}
const codexGame = { save: { pet: { id: 'local:kitty', x: 0.5, y: 0.8 } }, act: () => true }
const codexPet = collect(render(api.PetLayer, {
  game: codexGame,
  pets: [sheetPet],
  machine: { phase: 'idle', outcome: null },
  auto: false,
  assets,
  draggingHint: 'drag',
}))
const sheetNode = codexPet.find((node) => String(node.props.className || '').includes('mt-pet-sheet'))
check('codex pet renders as a sprite-sheet frame', Boolean(sheetNode))
check('sprite sheet background is scaled to the grid',
  sheetNode && sheetNode.props.style.backgroundSize === '768px 936px', sheetNode && sheetNode.props.style.backgroundSize)
check('idle starts at row 0', sheetNode && /^-?0px -?0px$/.test(sheetNode.props.style.backgroundPosition), sheetNode && sheetNode.props.style.backgroundPosition)

const idleAnim = api.petAnimation(sheetPet, 'idle')
const jumpAnim = api.petAnimation(sheetPet, 'jumping')
check('default idle uses 6 frames from row 0', idleAnim.frames.length === 6 && idleAnim.frames[0] === 0)
check('default jumping uses 5 frames from row 4', jumpAnim.frames.length === 5 && jumpAnim.frames[0] === 32, jumpAnim.frames[0])
const customAnim = api.petAnimation({ ...sheetPet, animations: { failed: { frames: [3, 4], fps: 4 } } }, 'failed')
check('pet.json animations override the defaults', customAnim.frames.join(',') === '3,4' && customAnim.fps === 4)

const missingPet = collect(render(api.PetLayer, {
  game: { save: { pet: { id: 'gone', x: 0.5, y: 0.5 } }, act: () => true },
  pets: [],
  machine: { phase: 'idle', outcome: null },
  auto: false,
  assets,
  draggingHint: 'drag',
}))
check('unknown pet id renders nothing', missingPet.length === 0)

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
