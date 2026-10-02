// 澄河都会圈章节化关卡回归测试。
// 运行：node scripts/verify-chapter.mjs
import assert from 'node:assert/strict'
import { CHAPTER, LEVELS, TOTAL_STARS, getLevel } from '../src/data/levels.js'
import { GameEngine } from '../src/core/gameEngine.js'
import { CITY_SAFE_AREA, Scenery } from '../src/core/scenery.js'

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
  return new Proxy({ rects: [] }, {
    get(target, key) {
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient
      if (key === 'rect') return (...args) => target.rects.push(args)
      if (!(key in target)) target[key] = () => {}
      return target[key]
    },
    set(target, key, value) { target[key] = value; return true }
  })
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
  engine.weather.timer = 0
  engine.weather.update(0.05, 1)
  assert.equal(engine.weather.scale, 0, `level ${level.id}: weather scale is zero`)
  assert.equal(engine.weather.current, null, `level ${level.id}: weather does not start at full progress`)
  assert.equal(engine.weather.hudState(), null, `level ${level.id}: no weather HUD state is exposed`)
  const drawing = mockContext()
  engine.scenery.renderFront(drawing, 0)
  engine.scenery.renderCity(drawing)
  const sideClips = [
    [0, CITY_SAFE_AREA.minY, CITY_SAFE_AREA.leftWidth, 720 - CITY_SAFE_AREA.minY],
    [CITY_SAFE_AREA.rightStart, CITY_SAFE_AREA.minY, 420 - CITY_SAFE_AREA.rightStart, 720 - CITY_SAFE_AREA.minY]
  ]
  assert.deepEqual(drawing.rects, [...sideClips, ...sideClips], `level ${level.id}: foreground and landmarks are clipped to the two lower side strips`)
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

console.log(`章节回归通过：${LEVELS.length} 关配置、晴天/静止塔体、唯一城市轮廓、旧存档兼容及顺序解锁。`)
