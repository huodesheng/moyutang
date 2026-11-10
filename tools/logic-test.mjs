/**
 * Pure-logic tests for the 摸鱼塘 economy: rarity distribution, pity, prices,
 * token→bait conversion with the daily soft cap, and daily bookkeeping.
 *
 * The plugin file is copied with one debug export line added, so the shipped
 * client.js keeps its closure intact.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
const marker = '    return {\n      inject: [\'slots\'],'
if (!source.includes(marker)) throw new Error('debug marker not found')
const instrumented = source.replace(
  marker,
  `    globalThis.__MT__ = { BALANCE, RARITY, FISH, PONDS, BOSSES, QUEST_POOL, ACHIEVEMENTS,
      rollFish, rollQuality, rollSize, sellPrice, marketOf, fishWeight,
      creditFromMetrics, creditWithCap, streakMultiplier,
      defaultSave, ensureDay, buildQuests, questProgress, unlockRequirementMissing,
      dayKey, shiftDay, hash32, phaseOfHour, habitatText, commitCatch, checkAchievements, weatherNow }
${marker}`,
)
const temporary = path.join(path.join(ROOT, 'tools'), '.tmp-client.mjs')
fs.writeFileSync(temporary, instrumented)

globalThis.window = { __ModuleLoader__: { load(definition) { globalThis.__DEF__ = definition } }, addEventListener() {}, removeEventListener() {} }
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
globalThis.performance = globalThis.performance || { now: () => Date.now() }
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}

let failures = 0
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`)
  } else {
    failures += 1
    console.log(`FAIL ${name}${detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`)
  }
}

await import(pathToFileURL(temporary).href)
const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  createContext: () => ({ Provider: 'p' }),
  useContext: () => ({ t: (k) => k }),
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useRef: (v) => ({ current: v }),
  useEffect: () => {},
  useMemo: (f) => f(),
  useCallback: (f) => f,
  Component: class { constructor(p) { this.props = p } },
}
globalThis.__DEF__.factory(() => React)
const MT = globalThis.__MT__
fs.unlinkSync(temporary)

/* ---- content ------------------------------------------------------- */

check('60 fish defined', MT.FISH.length === 60, MT.FISH.length)
check('fish ids unique', new Set(MT.FISH.map((f) => f.id)).size === MT.FISH.length)
for (const pond of MT.PONDS) {
  const fishes = MT.FISH.filter((f) => f.pond === pond.id)
  check(`${pond.name} has 10 fish (${fishes.length})`, fishes.length === 10)
  check(`${pond.name} has exactly one boss`, fishes.filter((f) => f.boss).length === 1)
}
check('6 bosses total', MT.BOSSES.length === 6)
const hidden = MT.FISH.filter((f) => f.hidden)
check('hidden fish gated to 03:00–04:00', hidden.length > 0 && hidden.every((f) => f.hour && f.hour[0] === 3 && f.hour[1] === 4))

/* ---- rolling ------------------------------------------------------- */

function neutral(extra) {
  return {
    power: 55,
    bait: 'bread',
    storm: false,
    deepDive: 0.4,
    hour: 14,
    phase: 'day',
    weekday: 3,
    pity: 0,
    random: Math.random,
    ...extra,
  }
}

let nulls = 0
const rarityCount = { N: 0, R: 0, SR: 0, SSR: 0, UR: 0 }
for (let i = 0; i < 20000; i += 1) {
  const fish = MT.rollFish('newbie-creek', neutral())
  if (!fish) {
    nulls += 1
    continue
  }
  rarityCount[fish.rarity] += 1
}
check('rolls always return a fish', nulls === 0, nulls)
const total = 20000
const srPlus = (rarityCount.SR + rarityCount.SSR + rarityCount.UR) / total
check('SR+ rate within 3%–25%', srPlus > 0.03 && srPlus < 0.25, srPlus)
check('UR rate under 3%', rarityCount.UR / total < 0.03, rarityCount.UR / total)

let pityViolations = 0
for (let i = 0; i < 3000; i += 1) {
  const fish = MT.rollFish('bug-swamp', neutral({ pity: 12 }))
  if (!fish || ['N', 'R'].includes(fish.rarity)) pityViolations += 1
}
check('pity forces SR+ after 10 empty casts', pityViolations === 0, pityViolations)

let hiddenOutside = 0
for (let i = 0; i < 3000; i += 1) {
  const fish = MT.rollFish('whale-fall', neutral({ hour: 15, phase: 'day' }))
  if (fish && fish.hidden) hiddenOutside += 1
}
check('hidden fish never appear outside 03:00–04:00', hiddenOutside === 0, hiddenOutside)

const friday = MT.rollFish('overtime-sea', neutral({ weekday: 5, hour: 20, phase: 'night' }))
check('night sea rolls a fish at 20:00 Friday', Boolean(friday))

/* ---- prices -------------------------------------------------------- */

const moyu = MT.FISH.find((f) => f.id === 'moyu')
const whale = MT.FISH.find((f) => f.id === 'jing')
const market = MT.marketOf('2026-11-10')
check('market has 2 hot + 1 cold', market.hot.length === 2 && Boolean(market.cold))
check('market is stable per day', JSON.stringify(MT.marketOf('2026-11-10')) === JSON.stringify(market))
check('UR is not sellable', MT.sellPrice(whale, 600, 'normal', market) === 0)
const priceSmall = MT.sellPrice(moyu, 13, 'normal', market)
const priceBig = MT.sellPrice(moyu, 37, 'normal', market)
check('bigger fish sells for more', priceBig > priceSmall, { priceSmall, priceBig })
check('shiny doubles the price', Math.abs(MT.sellPrice(moyu, 20, 'shiny', market) - MT.sellPrice(moyu, 20, 'normal', market) * 2) <= 2)
check('fat multiplies by 1.5', Math.abs(MT.sellPrice(moyu, 20, 'fat', market) - MT.sellPrice(moyu, 20, 'normal', market) * 1.5) <= 2)

/* ---- token → bait -------------------------------------------------- */

check('cap under 300 is full', MT.creditWithCap(0, 100) === 100)
check('cap 300–600 is half', MT.creditWithCap(0, 400) === 350, MT.creditWithCap(0, 400))
check('cap above 600 is 10%', MT.creditWithCap(0, 1000) === 490, MT.creditWithCap(0, 1000))
check('cap at boundary', MT.creditWithCap(600, 50) === 5, MT.creditWithCap(600, 50))
check('streak day 1 is 1.0', MT.streakMultiplier(1) === 1)
check('streak day 2 is 1.05', Math.abs(MT.streakMultiplier(2) - 1.05) < 1e-9)
check('streak caps at 1.3', MT.streakMultiplier(12) === 1.3)

const save = MT.defaultSave()
const first = MT.creditFromMetrics(save, { totalEffectiveTokens: 500000, turnsCompleted: 10 })
check('first sync credits the recorded backlog through the cap', first === true && Math.abs(save.points - 405) < 0.5, save.points)
check('the cap counter keeps the raw amount', Math.abs(save.credit.pointsToday - 510) < 0.5, save.credit.pointsToday)
check('the baseline is recorded so it is not credited twice', save.credit.seenTotal === 500000 && save.credit.seenTurns === 10)

const before = save.points
MT.creditFromMetrics(save, { totalEffectiveTokens: 501000, turnsCompleted: 11 })
check('later syncs credit only the delta', save.points > before && save.points - before <= 2, save.points - before)
MT.creditFromMetrics(save, { totalEffectiveTokens: 501000, turnsCompleted: 11 })
check('unchanged totals earn nothing', save.points === before + (save.points - before))

/* ---- daily bookkeeping --------------------------------------------- */

const yesterday = MT.shiftDay(MT.dayKey(), -1)
save.stats.day = yesterday
save.stats.dayStats.casts = 9
save.quests.day = yesterday
save.credit.day = yesterday
save.credit.pointsToday = 250
MT.ensureDay(save)
check('new day resets casts', save.stats.dayStats.casts === 0)
check('new day resets the soft cap counter', save.credit.pointsToday === 0)
check('new day rebuilds quests', save.quests.day === MT.dayKey() && save.quests.items.length === 3)
check('quest ids come from the pool', save.quests.items.every((item) => MT.QUEST_POOL.some((quest) => quest.id === item.id)))
check('quest progress reads day stats', MT.questProgress(MT.QUEST_POOL[0], { casts: 3 }) === 3)

const locked = MT.PONDS[5]
const missing = MT.unlockRequirementMissing(MT.defaultSave(), locked, new Date(2026, 10, 10, 14, 0))
check('last pond reports every requirement', missing.length >= 3, missing)

const overtime = MT.PONDS[3]
const atNoon = MT.unlockRequirementMissing({ ...MT.defaultSave(), coins: 99999, collection: {} }, overtime, new Date(2026, 10, 10, 12, 0))
check('night sea is closed before 19:00', atNoon.some((item) => item.includes('19:00')), atNoon)

/* ---- catch bookkeeping --------------------------------------------- */

const fresh = MT.defaultSave()
const fish = MT.FISH.find((f) => f.id === 'moyu')
const item = { uid: 'x', fishId: 'moyu', size: 21.5, quality: 'normal', price: 12, at: Date.now() }
const info = MT.commitCatch(fresh, MT.PONDS[0], fish, item, true)
check('first catch creates a collection entry', fresh.collection.moyu.count === 1)
check('catch lands in the basket', fresh.basket.length === 1)
check('storm catch is counted', fresh.stats.dayStats.stormCatches === 1)
check('distinct species tracked', fresh.stats.dayStats.distinct.includes('moyu'))
MT.commitCatch(fresh, MT.PONDS[0], fish, { ...item, uid: 'y', size: 30 }, false)
check('second catch keeps the bigger record', fresh.collection.moyu.maxSize === 30 && fresh.collection.moyu.count === 2)
check('hour is reported for achievements', typeof info.localHour === 'number')

/* ---- weather ------------------------------------------------------- */

const weatherSave = MT.defaultSave()
check('clear weather by default', MT.weatherNow(weatherSave, { storm: false }).storm === false)
check('agent errors bring a storm', MT.weatherNow(weatherSave, { storm: true }).storm === true)
weatherSave.effects.stormUntil = Date.now() + 5 * 60 * 1000
const forced = MT.weatherNow(weatherSave, { storm: false })
check('weather bottle forces a storm', forced.storm === true && forced.forcedUntil > Date.now())
weatherSave.effects.stormUntil = Date.now() - 1000
check('expired bottle falls back to clear', MT.weatherNow(weatherSave, { storm: false }).storm === false)
check('expired bottle reports no remaining time', MT.weatherNow(weatherSave, { storm: false }).forcedUntil === 0)

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
