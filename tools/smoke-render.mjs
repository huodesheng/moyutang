/**
 * Render smoke test for the 摸鱼塘 client half.
 *
 * Not a visual check: it executes every component's render function once with a
 * minimal hook dispatcher, so a ReferenceError / TypeError in a render path fails
 * here instead of blanking the slot in the browser.
 */
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let subtree = null
let runtimeValue = { t: (key) => key, locale: null }

globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      subtree = definition
    },
  },
  addEventListener() {},
  removeEventListener() {},
  location: { reload() {} },
}

const store = new Map()
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
}

const today = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

store.set(
  'dsh.moyutang.save.v1',
  JSON.stringify({
    v: 1,
    createdAt: Date.now(),
    points: 128.4,
    coins: 2400,
    favor: { 'newbie-creek': 3 },
    credit: { day: today, pointsToday: 210, seenTotal: 100000, seenTurns: 5, streak: 4, lastActiveDay: today },
    collection: {
      moyu: { firstAt: Date.now() - 86400000, count: 7, maxSize: 33.2, shiny: false, shinyAt: 0 },
      mouwang: { firstAt: Date.now() - 3600000, count: 1, maxSize: 88.5, shiny: true, shinyAt: Date.now() },
      xizhu: { firstAt: Date.now() - 600000, count: 1, maxSize: 160.2, shiny: false, shinyAt: 0 },
      buglu: { firstAt: Date.now() - 7200000, count: 2, maxSize: 41, shiny: false, shinyAt: 0 },
    },
    basket: [
      { uid: 'a1', fishId: 'moyu', size: 26.4, quality: 'fat', price: 18, at: Date.now() - 60000 },
      { uid: 'a2', fishId: 'xizhu', size: 160.2, quality: 'normal', price: 0, at: Date.now() - 120000 },
    ],
    ponds: ['newbie-creek', 'caffeine-lake'],
    gear: { rod: 'carbon', line: 'glow', bait: 'coffee' },
    inventory: { coffee: 3, bug: 0, chain: 1 },
    owned: { carbon: true, glow: true, hut: true },
    decor: ['hut', 'cat'],
    stats: {
      casts: 42,
      catches: 30,
      misses: 12,
      emptyStreak: 0,
      maxEmptyStreak: 11,
      sold: 20,
      coinsEarned: 4000,
      coinsSpent: 1600,
      pointsEarned: 300,
      bossCaught: { 'newbie-creek': true },
      bugCatches: 2,
      shinyCatches: 1,
      sinceSR: 4,
      day: today,
      dayStats: { casts: 6, catches: 4, rareCatches: 2, sold: 1, stormCatches: 1, shinyCatches: 1, distinct: ['moyu', 'buglu'] },
    },
    quests: {
      day: today,
      items: [
        { id: 'cast5', claimed: false },
        { id: 'rare1', claimed: true },
        { id: 'storm1', claimed: false },
      ],
    },
    achievements: { empty10: Date.now() },
    diary: [{ at: Date.now(), text: '在新手摸鱼溪钓到 摸鱼 · 26.4cm', fishId: 'moyu', size: 26.4 }],
    feed: [{ at: Date.now(), text: 'Agent 干活换到 12 鱼饵积分' }],
    cheat: { manual: 0 },
    settings: { auto: true, reduceMotion: false, confirmPause: true },
    updatedAt: Date.now(),
  }),
)

globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({
    ok: true,
    metrics: {
      day: '2026-11-10',
      totalEffectiveTokens: 250000,
      todayEffectiveTokens: 180000,
      reasoningTokensToday: 42000,
      turnsCompleted: 12,
      turnsCompletedToday: 4,
      storm: true,
      recentErrorCount: 3,
      lastErrorAt: Date.now(),
      lastTurnEndAt: Date.now(),
      updatedAt: Date.now(),
      history: [],
    },
  }),
})

globalThis.performance = globalThis.performance || { now: () => Date.now() }
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}
globalThis.AbortController = globalThis.AbortController || class { constructor() { this.signal = {} } abort() {} }

/* ---- minimal React -------------------------------------------------- */

let hookStore = []
let hookIndex = 0

const React = {
  createElement(type, props, ...children) {
    return { $$el: true, type, props: props || {}, children: children.flat(Infinity) }
  },
  createContext(defaultValue) {
    const context = { defaultValue, Provider: 'Provider', Consumer: 'Consumer' }
    return context
  },
  useContext() {
    return runtimeValue
  },
  useState(init) {
    const index = hookIndex++
    if (globalThis.__FORCE_TAB__ && init === 'pond') return [globalThis.__FORCE_TAB__, () => {}]
    if (!(index in hookStore)) hookStore[index] = typeof init === 'function' ? init() : init
    const set = (next) => {
      hookStore[index] = typeof next === 'function' ? next(hookStore[index]) : next
    }
    return [hookStore[index], set]
  },
  useRef(init) {
    const index = hookIndex++
    if (!(index in hookStore)) hookStore[index] = { current: init }
    return hookStore[index]
  },
  useEffect() {
    hookIndex += 1
  },
  useMemo(factory) {
    hookIndex += 1
    return factory()
  },
  useCallback(fn) {
    hookIndex += 1
    return fn
  },
  useSyncExternalStore(subscribe, getSnapshot) {
    hookIndex += 2
    return getSnapshot()
  },
}
React.Component = class Component {
  constructor(props) {
    this.props = props
    this.state = {}
  }
  setState() {}
}
React.Component.prototype.isReactComponent = {}

/* ---- render walker -------------------------------------------------- */

const errors = []
const renders = new Set()

function renderNode(node, depth) {
  if (node === null || node === undefined || node === false || node === true) return
  if (typeof node === 'string' || typeof node === 'number') return
  if (Array.isArray(node)) {
    node.forEach((child) => renderNode(child, depth))
    return
  }
  if (!node.$$el) return
  const { type, props, children } = node
  if (typeof type === 'function') {
    const name = type.name || 'anonymous'
    if (depth > 30) throw new Error(`render depth exceeded at ${name}`)
    const previousStore = hookStore
    hookStore = []
    hookIndex = 0
    let output
    try {
      if (type.prototype && type.prototype.isReactComponent) {
        const instance = new type({ ...(props || {}), children })
        output = instance.render()
      } else {
        output = type({ ...(props || {}), children: children.length === 1 ? children[0] : children })
      }
      renders.add(name)
    } catch (error) {
      errors.push(`${name}: ${error && error.message ? error.message : String(error)}`)
      throw error
    } finally {
      hookStore = previousStore
    }
    renderNode(output, depth + 1)
    return
  }
  for (const child of children) renderNode(child, depth + 1)
  if (props && props.children) renderNode(props.children, depth + 1)
}

function render(name, element) {
  try {
    renderNode(element, 0)
    console.log(`ok   ${name}`)
  } catch (error) {
    console.log(`FAIL ${name}: ${error && error.stack ? error.stack.split('\n').slice(0, 4).join(' | ') : error}`)
  }
}

/* ---- load the plugin ------------------------------------------------ */

await import(pathToFileURL(path.join(ROOT, 'client.js')).href)
if (!subtree || !subtree.factory) throw new Error('module loader factory was not registered')

const plugin = subtree.factory(() => React)
console.log('module id:', subtree.id)

const registrations = []
const ctx = {
  get: (name) => (name === 'locale' ? { register: () => () => {}, getLocale: () => ({ active: 'zh-CN' }) } : undefined),
  effect: (fn) => {
    const disposer = fn()
    return typeof disposer === 'function' ? disposer : () => {}
  },
  slots: {
    inject: (key, callback) => {
      callback()
      return () => {}
    },
    register: (options, component) => {
      registrations.push({ options, component })
      return () => {}
    },
  },
}

plugin.apply(ctx)
console.log(
  'registrations:',
  registrations.map((entry) => `${entry.options.name}:${entry.options.id || entry.options.key}`).join(', '),
)

const icon = registrations.find((entry) => entry.options.name === 'sidebar.panellist')
const panel = registrations.find((entry) => entry.options.name === 'main')
render('SidebarIcon', React.createElement(icon.component, { size: 20, active: true }))
render('SidebarIcon (inactive, no props)', React.createElement(icon.component))
for (const tab of ['pond', 'collection', 'shop', 'basket', 'quests', 'settings']) {
  globalThis.__FORCE_TAB__ = tab
  render(`PanelSeat [${tab}]`, React.createElement(panel.component))
}
globalThis.__FORCE_TAB__ = null
console.log('labels:', icon.options.label())
console.log('components rendered:', renders.size)

console.log('errors:', errors.length === 0 ? 'none' : errors)
