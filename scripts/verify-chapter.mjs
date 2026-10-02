// 澄河都会圈章节化关卡回归测试。
// 运行：node scripts/verify-chapter.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CHAPTER, LEVELS, TOTAL_STARS, getLevel } from '../src/data/levels.js'
import { GameEngine } from '../src/core/gameEngine.js'
import { CITY_SAFE_AREA, Scenery } from '../src/core/scenery.js'

const gameEngineSource = readFileSync(new URL('../src/core/gameEngine.js', import.meta.url), 'utf8')
assert.doesNotMatch(gameEngineSource, /\bthis\.scenery\.renderCity\s*\(/, 'removed bottom-corner landmarks are not invoked during background rendering')

assert.equal(CHAPTER.name, '澄河都会圈')
assert.equal(LEVELS.length, 8)
assert.equal(TOTAL_STARS, 24)
assert.deepEqual(LEVELS.map(({ target }) => target), [30, 40, 50, 60, 70, 80, 90, 100])
assert.deepEqual(LEVELS.map(({ city }) => city), ['晴原市', '柳汀市', '渡川市', '澄浦市', '新桥市', '青梧市', '平川市', '中澜市'])
assert.equal(new Set(LEVELS.map(({ cityscape }) => cityscape)).size, 8, 'each stage uses its own recognizable skyline')
assert.ok(LEVELS.every((level) => level.chapterId === CHAPTER.id && level.city && level.place))
assert.ok(LEVELS.every((level) => level.speed === LEVELS[0].speed), 'base drop speed is fixed for all eight stages')
assert.ok(LEVELS.every((level) => level.chargeNeed === LEVELS[0].chargeNeed), 'charge difficulty does not scale independently')
assert.ok(LEVELS.every((level) => level.sway === 0 && level.weather === 0), 'tower sway and weather are independently disabled')
assert.ok(LEVELS.every((level) => level.enemyShift === LEVELS[0].enemyShift && level.enemyRate === LEVELS[0].enemyRate), 'existing threat schedule does not get a per-level boost')
assert.equal(getLevel(8).target, 100)
assert.equal(getLevel(999).id, 1)
assert.equal(CITY_SAFE_AREA.leftWidth, 112)
assert.equal(CITY_SAFE_AREA.rightStart, 308)
assert.equal(CITY_SAFE_AREA.minY, 488)
assert.ok(CITY_SAFE_AREA.rightStart - CITY_SAFE_AREA.leftWidth >= 180, 'city silhouettes leave a wide central play lane')

function mockContext() {
  const gradient = { addColorStop() {} }
  const tracedMethods = new Set(['fillRect', 'strokeRect', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'ellipse', 'closePath', 'fill', 'stroke'])
  return new Proxy({ rects: [], trace: [], pathRects: [], activeClip: null, clipStack: [] }, {
    get(target, key) {
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient
      if (key === 'save') return () => target.clipStack.push(target.activeClip)
      if (key === 'restore') return () => { target.activeClip = target.clipStack.pop() ?? null }
      if (key === 'beginPath') return () => { target.pathRects = [] }
      if (key === 'rect') return (...args) => { target.rects.push(args); target.pathRects.push(args) }
      if (key === 'clip') return () => { target.activeClip = target.pathRects.map((rect) => [...rect]) }
      if (tracedMethods.has(key)) return (...args) => target.trace.push([key, target.fillStyle, target.strokeStyle, target.globalAlpha, target.activeClip?.map((rect) => [...rect]) || null, ...args])
      if (!(key in target)) target[key] = () => {}
      return target[key]
    },
    set(target, key, value) { target[key] = value; return true }
  })
}

const fixedSeedScenes = LEVELS.map((level) => new Scenery({
  level: { ...level, id: 1 },
  theme: 'light',
  parallaxBase: (factor) => 358 + factor * 280
}))
assert.equal(new Set(fixedSeedScenes.map(({ district }) => JSON.stringify(district.sky))).size, LEVELS.length, 'all eight clear-day sky gradients are distinct')

const safeWingClips = [[0, 0, CITY_SAFE_AREA.leftWidth, 720], [CITY_SAFE_AREA.rightStart, 0, 420 - CITY_SAFE_AREA.rightStart, 720]]
const fixedBackdropTraces = []
for (const scenery of fixedSeedScenes) {
  const drawing = mockContext()
  scenery.renderChapterBackdrop(drawing)
  assert.deepEqual(drawing.rects, safeWingClips, `level ${scenery.scene}: landmark artwork is clipped to the outer wings`)
  const centralArtwork = drawing.trace.filter((trace) => trace[4] === null)
  assert.ok(centralArtwork.length > 0, `level ${scenery.scene}: the panorama provides a soft central background cue`)
  assert.ok(centralArtwork.every((trace) => trace[3] <= 0.0451), `level ${scenery.scene}: central background marks stay low contrast behind the tower`)
  assert.ok(drawing.trace.some((trace) => trace[4]?.length === 2), `level ${scenery.scene}: the district landmark is actually drawn inside both safe wings`)
  fixedBackdropTraces.push(JSON.stringify(drawing.trace))
}
assert.equal(new Set(fixedBackdropTraces).size, LEVELS.length, 'eight fixed-seed screen-space panoramas have distinct authored landmark layouts')

for (const progress of [0, 0.5, 0.9]) {
  const backdropTraces = fixedSeedScenes.map((scenery) => {
    const drawing = mockContext()
    scenery.renderBack(drawing, progress, { top: [87, 164, 221], bot: [190, 224, 237] })
    return JSON.stringify(drawing.trace)
  })
  assert.equal(new Set(backdropTraces).size, LEVELS.length, `all eight backgrounds remain distinguishable at progress ${progress}`)
}

for (const level of LEVELS) {
  const engine = new GameEngine({
    level,
    theme: 'dark',
    skills: {},
    material: 'soil',
    inventory: {},
    onState: () => {},
    onEnd: () => {},
    onReviveOffer: () => {},
    onInventoryChange: () => {}
  })
  engine.floors = level.target
  engine.blocks.push({ cx: 210, index: 1 })
  assert.equal(engine.swayMaxAmp, 0, `level ${level.id}: configured sway is truly disabled`)
  assert.equal(engine.swayOffset(1), 0, `level ${level.id}: an upper tower layer remains in the same horizontal position`)
  assert.equal(engine._bgPalette(0).starAlpha, 0, `level ${level.id}: clear daytime sky has no night stars`)
  assert.deepEqual(engine._bgPalette(0).topArr, engine.scenery.district.sky[0], `level ${level.id}: engine uses its authored persistent sky color`)
  assert.deepEqual(engine._bgPalette(0).botArr, engine.scenery.district.sky[1], `level ${level.id}: engine uses its authored horizon color`)
  engine.weather.timer = 0
  engine.weather.update(0.05, 1)
  assert.equal(engine.weather.scale, 0, `level ${level.id}: weather scale is zero`)
  assert.equal(engine.weather.current, null, `level ${level.id}: weather does not start at full progress`)
  assert.equal(engine.weather.hudState(), null, `level ${level.id}: no weather HUD state is exposed`)
  const drawing = mockContext()
  engine.scenery.renderFront(drawing, 0)
  const sideClips = [
    [0, CITY_SAFE_AREA.minY, CITY_SAFE_AREA.leftWidth, 720 - CITY_SAFE_AREA.minY],
    [CITY_SAFE_AREA.rightStart, CITY_SAFE_AREA.minY, 420 - CITY_SAFE_AREA.rightStart, 720 - CITY_SAFE_AREA.minY]
  ]
  assert.deepEqual(drawing.rects, sideClips, `level ${level.id}: remaining parallax foreground is clipped to the lower side strips`)
  assert.equal(typeof engine.scenery.renderCity, 'undefined', `level ${level.id}: no fixed bottom-corner landmarks are available to render`)
  assert.deepEqual(engine.scenery.farCity, new Scenery(engine).farCity, `level ${level.id}: procedural skyline is reproducible`)
  engine.destroy()
}

// Legacy v1 saves use the same first six level IDs. Merging defaults for the two new
// stages must preserve all existing currencies, stars, scores, settings and unlocks.
const legacySave = {
  coins: 321,
  unlocked: 6,
  stars: { 1: 3, 2: 2, 3: 1, 4: 3, 5: 2, 6: 3 },
  bestScores: { 1: 1800, 2: 2400, 3: 2600, 4: 3200, 5: 3900, 6: 5100 },
  settings: { sound: false, volume: 0.4 }
}
let persisted = JSON.stringify(legacySave)
globalThis.localStorage = {
  getItem: () => persisted,
  setItem: (_key, value) => { persisted = value },
  removeItem: () => { persisted = null }
}
const { Storage } = await import('../src/core/storage.js')
const restored = Storage.load()
assert.equal(restored.coins, 321)
assert.equal(restored.unlocked, 6)
assert.deepEqual(Object.values(legacySave.stars), Object.values(Object.fromEntries(Object.keys(legacySave.stars).map((id) => [id, restored.stars[id]]))))
assert.deepEqual(Object.values(legacySave.bestScores), Object.values(Object.fromEntries(Object.keys(legacySave.bestScores).map((id) => [id, restored.bestScores[id]]))))
assert.equal(restored.stars[7], 0)
assert.equal(restored.bestScores[8], 0)
assert.equal(restored.settings.sound, false)
assert.equal(restored.settings.musicVolume, 0.4)
assert.equal(restored.settings.effectsVolume, 0.4)

// Existing progress on stage 6 remains in place; clearing it unlocks stage 7, then 8.
const { actions, useStore } = await import('../src/core/store.js')
const state = useStore()
assert.equal(state.unlocked, 6)
actions.settle({ coins: 0, level: { id: 6 }, score: 0, cleared: true, stars: 1, petExp: 0 })
assert.equal(state.unlocked, 7)
actions.settle({ coins: 0, level: { id: 7 }, score: 0, cleared: true, stars: 1, petExp: 0 })
assert.equal(state.unlocked, 8)

console.log(`章节回归通过：${LEVELS.length} 关配置、独立晴天空色与持久全景、中轴安全及固定种子多进度辨识、旧存档兼容和顺序解锁。`)
