/**
 * 摸鱼塘 · Host half.
 *
 * Job: count how many tokens the Agent spends, and nothing else. It never reads
 * message text, never stores prompt content, never calls a model and never makes
 * a network request. The numbers are accumulated into a small local JSON file and
 * served to the Client half over a same-origin HTTP route so the pond can turn
 * them into bait points.
 *
 * The whole game (fish, collection, coins, shop) lives in the Client half; this
 * file only answers "how much work happened, and how was the weather?".
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROUTE = '/moyutang-api'
const STATE_VERSION = 1
const KEEP_DAYS = 180
const SAVE_DELAY = 1200
const STORM_WINDOW = 5 * 60 * 1000
const STORM_ERRORS = 2

function dataDirectory() {
  const override = process.env.DSH_MOYUTANG_DIR
  if (typeof override === 'string' && override.trim() !== '') return override
  return path.join(os.homedir(), '.dsh', 'moyutang')
}

function dayKey(now = Date.now()) {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * 有效 Token = 输出 × 1.0 + 未命中缓存的输入 × 0.2 + 缓存 Token × 0.05.
 * Cache counters are treated as sub-counts of the prompt when they fit, so a
 * provider that reports them separately is not double counted.
 */
function effectiveTokens(usage) {
  if (!usage || typeof usage !== 'object') return 0
  const output = num(usage.outputTokens)
  const input = num(usage.inputTokens)
  const cacheRead = num(usage.cacheReadTokens)
  const cacheWrite = num(usage.cacheWriteTokens)
  const cache = cacheRead + cacheWrite
  const direct = Math.max(0, input - cache)
  return output + direct * 0.2 + cache * 0.05
}

function blankDay() {
  return { effectiveTokens: 0, reasoningTokens: 0, reasoningMs: 0, turnsCompleted: 0 }
}

/** Time the model spent emitting reasoning chunks, in milliseconds. */
function reasoningMsOf(stream) {
  if (!Array.isArray(stream)) return 0
  let total = 0
  for (const record of stream) {
    if (!record || record.type !== 'reasoning-chunks' || !Array.isArray(record.dt)) continue
    for (const delta of record.dt) {
      if (typeof delta === 'number' && Number.isFinite(delta) && delta > 0) total += delta
    }
  }
  return total
}

function freshState() {
  const now = Date.now()
  return {
    v: STATE_VERSION,
    createdAt: now,
    updatedAt: now,
    totalEffectiveTokens: 0,
    turnsCompleted: 0,
    days: {},
    recentErrors: [],
    lastErrorAt: 0,
    lastTurnEndAt: 0,
  }
}

function normalize(raw) {
  const state = freshState()
  if (!raw || typeof raw !== 'object') return state
  state.createdAt = num(raw.createdAt) || state.createdAt
  state.updatedAt = num(raw.updatedAt) || state.updatedAt
  state.totalEffectiveTokens = num(raw.totalEffectiveTokens)
  state.turnsCompleted = num(raw.turnsCompleted)
  state.lastErrorAt = num(raw.lastErrorAt)
  state.lastTurnEndAt = num(raw.lastTurnEndAt)
  if (Array.isArray(raw.recentErrors)) {
    state.recentErrors = raw.recentErrors.filter((t) => typeof t === 'number' && Number.isFinite(t)).slice(-20)
  }
  if (raw.days && typeof raw.days === 'object') {
    const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000
    for (const [key, value] of Object.entries(raw.days)) {
      if (!value || typeof value !== 'object') continue
      const stamp = Date.parse(`${key}T00:00:00`)
      if (Number.isFinite(stamp) && stamp < cutoff) continue
      state.days[key] = {
        effectiveTokens: num(value.effectiveTokens),
        reasoningTokens: num(value.reasoningTokens),
        reasoningMs: num(value.reasoningMs),
        turnsCompleted: num(value.turnsCompleted),
      }
    }
  }
  return state
}

function loadState(file) {
  try {
    const text = fs.readFileSync(file, 'utf8')
    return normalize(JSON.parse(text))
  } catch {
    return freshState()
  }
}

function persist(file, state) {
  const directory = path.dirname(file)
  fs.mkdirSync(directory, { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(state), 'utf8')
  fs.renameSync(temporary, file)
}

function respondJson(response, status, body) {
  let text
  try {
    text = JSON.stringify(body)
  } catch {
    text = '{"ok":false,"error":"serialization"}'
  }
  if (!response || typeof response.setHeader !== 'function') return
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-length', Buffer.byteLength(text))
  response.end(text)
}

/* ------------------------------------------------------------------ *
 * 美术资源：同源提供，客户端按 /moyutang-api/asset/<kind>/<id>.webp 取图
 * ------------------------------------------------------------------ */

const ASSET_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets')
const ASSET_KINDS = ['fish', 'items', 'ponds']
const ASSET_NAME = /^[a-z0-9][a-z0-9-]*\.webp$/

function assetManifest() {
  const manifest = { ok: true, version: 0, fish: [], items: [], ponds: [] }
  for (const kind of ASSET_KINDS) {
    const directory = path.join(ASSET_ROOT, kind)
    try {
      for (const entry of fs.readdirSync(directory)) {
        if (!entry.endsWith('.webp')) continue
        manifest[kind].push(entry.slice(0, -'.webp'.length))
        try {
          manifest.version = Math.max(manifest.version, Math.floor(fs.statSync(path.join(directory, entry)).mtimeMs))
        } catch {}
      }
    } catch {}
    manifest[kind].sort()
  }
  return manifest
}

function serveAsset(request, response, relative) {
  const parts = relative.split('/')
  if (parts.length !== 2) {
    respondJson(response, 404, { ok: false, error: 'not-found' })
    return
  }
  const [kind, name] = parts
  if (!ASSET_KINDS.includes(kind) || !ASSET_NAME.test(name)) {
    respondJson(response, 404, { ok: false, error: 'not-found' })
    return
  }
  const base = path.resolve(path.join(ASSET_ROOT, kind))
  const file = path.resolve(path.join(base, name))
  if (!file.startsWith(`${base}${path.sep}`)) {
    respondJson(response, 404, { ok: false, error: 'not-found' })
    return
  }
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    respondJson(response, 404, { ok: false, error: 'not-found' })
    return
  }
  if (!stat.isFile()) {
    respondJson(response, 404, { ok: false, error: 'not-found' })
    return
  }
  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`
  if (request?.headers?.['if-none-match'] === etag) {
    response.statusCode = 304
    response.end()
    return
  }
  let blob
  try {
    blob = fs.readFileSync(file)
  } catch {
    respondJson(response, 500, { ok: false, error: 'read-failed' })
    return
  }
  response.statusCode = 200
  response.setHeader('content-type', 'image/webp')
  response.setHeader('cache-control', 'public, max-age=86400')
  response.setHeader('etag', etag)
  response.setHeader('content-length', blob.length)
  response.end(blob)
}

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx) {
  const directory = dataDirectory()
  const file = path.join(directory, 'metrics.json')
  const state = loadState(file)

  let saveTimer = null
  let failedSaves = 0

  const flush = () => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    state.updatedAt = Date.now()
    try {
      persist(file, state)
      failedSaves = 0
    } catch (error) {
      if (failedSaves < 3) {
        failedSaves += 1
        try {
          ctx.logger?.('moyutang')?.warn?.(`save failed: ${String(error)}`)
        } catch {}
      }
    }
  }

  const scheduleSave = () => {
    if (saveTimer !== null) return
    saveTimer = setTimeout(() => {
      saveTimer = null
      flush()
    }, SAVE_DELAY)
    saveTimer.unref?.()
  }

  ctx.effect(() => () => flush(), 'moyutang:persist')

  const today = () => {
    const key = dayKey()
    if (!state.days[key]) state.days[key] = blankDay()
    return state.days[key]
  }

  let eventsSeen = 0
  let lastEventAt = 0
  let lastModelCallAt = 0
  let reattaches = 0
  let disposeEvents = null

  const onSessionEvent = (session, event) => {
    try {
      eventsSeen += 1
      lastEventAt = Date.now()
      if (!event || typeof event !== 'object') return
      if (event.type === 'assistant/message') {
        const usage = event.data?.usage
        const tokens = effectiveTokens(usage)
        const reasoning = num(usage?.reasoningTokens)
        const reasoningMs = reasoningMsOf(event.data?.stream)
        if (tokens <= 0 && reasoning <= 0 && reasoningMs <= 0) return
        const day = today()
        day.effectiveTokens += tokens
        day.reasoningTokens += reasoning
        day.reasoningMs += reasoningMs
        state.totalEffectiveTokens += tokens
        scheduleSave()
        return
      }
      if (event.type === 'turn/end') {
        const kind = event.data?.reason?.kind
        if (kind === 'completed') {
          state.turnsCompleted += 1
          state.lastTurnEndAt = Date.now()
          today().turnsCompleted += 1
          scheduleSave()
        }
        return
      }
      if (event.type === 'tool/result') {
        if (!event.data?.error) return
        const now = Date.now()
        state.recentErrors.push(now)
        if (state.recentErrors.length > 20) state.recentErrors = state.recentErrors.slice(-20)
        state.lastErrorAt = now
        scheduleSave()
      }
    } catch (error) {
      try {
        ctx.logger?.('moyutang')?.warn?.(`event fold failed: ${String(error)}`)
      } catch {}
    }
  }

  const attachEvents = () => {
    if (disposeEvents) {
      try {
        disposeEvents()
      } catch {}
      disposeEvents = null
    }
    try {
      disposeEvents = ctx.on('session/event', onSessionEvent)
    } catch (error) {
      try {
        ctx.logger?.('moyutang')?.warn?.(`listener registration failed: ${String(error)}`)
      } catch {}
    }
  }

  attachEvents()

  // A streaming model call is a reliable "work happened" signal. If one passes
  // while our session listener stays silent, a reload dropped the listener, so
  // re-arm it. Re-arming is idempotent (the previous one is disposed first).
  ctx.effect(
    () =>
      ctx.on('llm/stream', (options, next) => {
        lastModelCallAt = Date.now()
        return next()
      }),
    'moyutang:llm-stream',
  )

  const watchdog = setInterval(() => {
    if (lastModelCallAt > lastEventAt + 240_000) {
      reattaches += 1
      attachEvents()
      lastEventAt = Date.now()
    }
  }, 30_000)
  watchdog.unref?.()

  ctx.effect(
    () => () => {
      clearInterval(watchdog)
      if (disposeEvents) {
        try {
          disposeEvents()
        } catch {}
        disposeEvents = null
      }
    },
    'moyutang:watchdog',
  )

  const snapshot = () => {
    const key = dayKey()
    const day = state.days[key] ?? blankDay()
    const now = Date.now()
    const recentErrors = state.recentErrors.filter((t) => now - t <= STORM_WINDOW)
    const storm = recentErrors.length >= STORM_ERRORS
    const history = Object.entries(state.days)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 21)
      .map(([date, value]) => ({
        date,
        effectiveTokens: Math.round(value.effectiveTokens),
        turnsCompleted: value.turnsCompleted,
      }))
    return {
      ok: true,
      meta: { version: STATE_VERSION, dataDir: directory, route: ROUTE },
      serverTime: now,
      debug: {
        eventsSeen,
        lastEventAt,
        lastModelCallAt,
        reattaches,
        listenerAttached: disposeEvents !== null,
      },
      metrics: {
        day: key,
        totalEffectiveTokens: Math.round(state.totalEffectiveTokens),
        todayEffectiveTokens: Math.round(day.effectiveTokens),
        reasoningTokensToday: Math.round(day.reasoningTokens),
        reasoningMsToday: Math.round(day.reasoningMs),
        turnsCompleted: state.turnsCompleted,
        turnsCompletedToday: day.turnsCompleted,
        storm,
        recentErrorCount: recentErrors.length,
        lastErrorAt: state.lastErrorAt,
        lastTurnEndAt: state.lastTurnEndAt,
        updatedAt: state.updatedAt,
        history,
      },
    }
  }

  const handler = (request, response) => {
    try {
      const method = request?.method ?? 'GET'
      const rawUrl = typeof request?.url === 'string' ? request.url : ''
      const pathname = rawUrl.split('?')[0].replace(/\/+$/, '')
      if (method !== 'GET' && method !== 'HEAD') {
        respondJson(response, 405, { ok: false, error: 'method-not-allowed' })
        return
      }
      if (pathname === `${ROUTE}/state` || pathname === `${ROUTE}/metrics`) {
        respondJson(response, 200, snapshot())
        return
      }
      if (pathname === `${ROUTE}/ping`) {
        respondJson(response, 200, { ok: true, name: 'moyutang' })
        return
      }
      if (pathname === `${ROUTE}/assets`) {
        respondJson(response, 200, assetManifest())
        return
      }
      if (pathname.startsWith(`${ROUTE}/asset/`)) {
        serveAsset(request, response, pathname.slice(`${ROUTE}/asset/`.length))
        return
      }
      respondJson(response, 404, { ok: false, error: 'not-found' })
    } catch (error) {
      respondJson(response, 500, { ok: false, error: String(error) })
    }
  }

  const attach = (server) => {
    try {
      return server.register({ kind: 'prefix', path: ROUTE, handler })
    } catch (error) {
      try {
        ctx.logger?.('moyutang')?.warn?.(`route registration failed: ${String(error)}`)
      } catch {}
      return undefined
    }
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (scoped) => {
      const server = scoped.webServer ?? scoped.get?.('webServer')
      if (!server) return
      scoped.effect(() => attach(server), 'moyutang:route')
    })
  } else {
    const server = ctx.get('webServer')
    if (server) ctx.effect(() => attach(server), 'moyutang:route')
  }
}
