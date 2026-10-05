// 七章 56 关、旧档、场景与专属天气回归测试。
// 运行：node scripts/verify-chapter.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CHAPTER, CHAPTERS, LEVELS, TOTAL_STARS, getLevel, getChapterLevels } from '../src/data/levels.js'
import { GameEngine } from '../src/core/gameEngine.js'
import { ANT_PROTOTYPE_CONFIG, ANT_SPECIES, antWavesForLevel } from '../src/data/ants.js'
import { WEATHER_DEFS } from '../src/core/weather.js'
import { CITY_SAFE_AREA, Scenery } from '../src/core/scenery.js'

const gameEngineSource = readFileSync(new URL('../src/core/gameEngine.js', import.meta.url), 'utf8')
assert.doesNotMatch(gameEngineSource, /\bthis\.scenery\.renderCity\s*\(/, 'removed bottom-corner landmarks are not invoked during background rendering')
assert.equal(CHAPTER.name, '澄河都会圈')
assert.equal(CHAPTERS.length, 7)
assert.equal(LEVELS.length, 56)
assert.equal(TOTAL_STARS, 168)
assert.deepEqual(CHAPTERS.map(({ number }) => number), [1, 2, 3, 4, 5, 6, 7])
assert.deepEqual(LEVELS.map(({ id }) => id), Array.from({ length: 56 }, (_, i) => i + 1), 'all level IDs are explicit, continuous and unique')
assert.equal(new Set(LEVELS.map(({ id }) => id)).size, 56)
assert.equal(getLevel(999).id, 1)
assert.equal(getChapterLevels(CHAPTER.id).length, 8)
assert.deepEqual(CITY_SAFE_AREA, { leftWidth: 112, rightStart: 308, minY: 488 })
assert.ok(CITY_SAFE_AREA.rightStart - CITY_SAFE_AREA.leftWidth >= 180, 'city silhouettes leave a wide central play lane')
assert.deepEqual(Object.keys(ANT_SPECIES).sort(), ['queen', 'scout', 'soldier', 'worker'])
assert.equal(ANT_PROTOTYPE_CONFIG.maxAlive, 5, 'ant activity cap is the untested five-ant prototype')
assert.equal(ANT_PROTOTYPE_CONFIG.maxTargetsPerFloor, 3, 'same-floor target cap is the untested three-ant prototype')
const prototypeWaveCounts = Array.from({ length: 8 }, (_, i) => antWavesForLevel(getLevel(i + 1)).reduce((sum, wave) => sum + wave.species.length, 0))
assert.deepEqual(prototypeWaveCounts, [2, 4, 4, 5, 5, 7, 7, 6], 'ant waves stay small for teaching and become denser in later stages')
for (let levelId = 1; levelId <= 56; levelId++) {
  const stageId = ((levelId - 1) % 8) + 1
  assert.deepEqual(antWavesForLevel(getLevel(levelId)), antWavesForLevel(getLevel(stageId)), `L${levelId}: uses its chapter-stage ant waves`)
}
for (const level of LEVELS) {
  const waves = antWavesForLevel(level)
  assert.ok(waves.length > 0, `L${level.id}: has deterministic ant wave slots`)
  assert.ok(waves.every(({ at, species }) => at > 0 && at < 0.92 && species.length <= 2 && species.every((id) => ANT_SPECIES[id])), `L${level.id}: wave species/gates/group sizes are valid`)
  assert.ok(waves.length <= 4, `L${level.id}: bounded prototype wave queue`)
}

const expectedWeather = ['clear', 'wind', 'cloud', 'lightning', 'rain', 'snow', 'hail']
for (const [chapterIndex, chapter] of CHAPTERS.entries()) {
  const levels = getChapterLevels(chapter.id)
  assert.equal(levels.length, 8, `${chapter.name}: exactly eight independent small levels`)
  assert.equal(chapter.weatherKind, expectedWeather[chapterIndex])
  assert.equal(chapter.firstLevelId, chapterIndex * 8 + 1)
  assert.equal(chapter.lastLevelId, chapterIndex * 8 + 8)
  assert.deepEqual(levels.map(({ chapterStage }) => chapterStage || (chapterIndex === 0 ? 0 : undefined)), chapterIndex === 0 ? Array(8).fill(0) : [1, 2, 3, 4, 5, 6, 7, 8])
  assert.deepEqual(levels.map(({ target }) => target), [30, 40, 50, 60, 70, 80, 90, 100], `${chapter.name}: target heights ascend independently`)
  assert.equal(new Set(levels.map(({ cityscape }) => cityscape)).size, 8, `${chapter.name}: each stage has a distinct scene ID`)
  assert.equal(new Set(levels.map(({ city }) => city)).size, 8, `${chapter.name}: each stage has its own city identity`)
  assert.ok(levels.every((level) => level.speed === 150 && level.chargeNeed === 8), `${chapter.name}: level speed/charge settings stay fixed`)
  assert.ok(levels.every((level) => !Object.hasOwn(level, 'enemyShift') && !Object.hasOwn(level, 'enemyRate')), `${chapter.name}: no obsolete randomized enemy timing fields`)
  if (chapterIndex > 0) {
    assert.ok(levels.every((level) => level.chapterId === chapter.id && level.weatherKind === chapter.weatherKind), `${chapter.name}: all stages use exactly their chapter weather`)
    assert.ok(levels.every((level) => level.weather === 0), `${chapter.name}: legacy randomized weather remains disabled`)
    assert.ok(levels.every((level) => level.weatherHint && level.place && level.landmarkFeature), `${chapter.name}: every stage has a player hint and authored place`)
  }
}

const firstChapter = getChapterLevels(CHAPTER.id)
assert.deepEqual(firstChapter.map(({ target }) => target), [30, 40, 50, 60, 70, 80, 90, 100])
assert.deepEqual(firstChapter.map(({ city }) => city), ['晴原市', '柳汀市', '渡川市', '澄浦市', '新桥市', '青梧市', '平川市', '中澜市'])
assert.ok(firstChapter.every((level) => level.sway === 0 && level.weather === 0 && !level.weatherKind), 'first chapter remains a clear-day, static-tower run')
assert.ok(firstChapter.every((level) => level.speed === firstChapter[0].speed), 'first chapter keeps the established fixed speed')
assert.ok(firstChapter.every((level) => !Object.hasOwn(level, 'enemyShift') && !Object.hasOwn(level, 'enemyRate')), 'first chapter has no retired enemy timing fields')
assert.equal(getLevel(8).target, 100)
assert.equal(getLevel(9).chapterId, CHAPTERS[1].id)
assert.equal(getLevel(56).chapterId, CHAPTERS[6].id)
assert.equal(getLevel(56).target, 100)
assert.deepEqual(getChapterLevels(CHAPTERS[1].id).map(({ sway }) => sway), [0, 0, 0, 0, 0, 0.1, 0.14, 0.16], 'wind-tower sway begins gently only in the later stages')

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
assert.equal(new Set(fixedSeedScenes.map(({ district }) => JSON.stringify(district.sky))).size, 56, 'all 56 stages have distinct authored sky gradients')
const safeWingClips = [[0, 0, CITY_SAFE_AREA.leftWidth, 720], [CITY_SAFE_AREA.rightStart, 0, 420 - CITY_SAFE_AREA.rightStart, 720]]
const fixedBackdropTraces = []
for (const scenery of fixedSeedScenes) {
  const drawing = mockContext()
  scenery.renderChapterBackdrop(drawing)
  assert.deepEqual(drawing.rects, safeWingClips, `${scenery.scene}: panorama is clipped to the outer wings`)
  const centralArtwork = drawing.trace.filter((trace) => trace[4] === null)
  assert.ok(centralArtwork.length > 0, `${scenery.scene}: a low-contrast central atmosphere cue exists`)
  assert.ok(centralArtwork.every((trace) => trace[3] <= 0.0451), `${scenery.scene}: central marks stay low-contrast behind the tower`)
  assert.ok(drawing.trace.some((trace) => trace[4]?.length === 2), `${scenery.scene}: authored landmarks are actually drawn in both safe wings`)
  fixedBackdropTraces.push(JSON.stringify(drawing.trace))
}
assert.equal(new Set(fixedBackdropTraces).size, 56, 'each small level has a distinguishable fixed-seed city panorama')
for (const progress of [0, 0.5, 0.9]) {
  const backdropTraces = fixedSeedScenes.map((scenery) => {
    const drawing = mockContext()
    scenery.renderBack(drawing, progress, { top: [87, 164, 221], bot: [190, 224, 237] })
    return JSON.stringify(drawing.trace)
  })
  assert.equal(new Set(backdropTraces).size, 56, `all chapter backgrounds remain distinguishable at progress ${progress}`)
}

// First chapter stays on the original clear-day path with no sway or weather HUD.
for (const level of firstChapter) {
  const engine = new GameEngine({ level, theme: 'dark', skills: {}, material: 'soil', inventory: {}, onState: () => {}, onEnd: () => {}, onReviveOffer: () => {}, onInventoryChange: () => {} })
  engine.floors = level.target
  engine.blocks.push({ cx: 210, index: 1 })
  assert.equal(engine.swayMaxAmp, 0, `first-chapter level ${level.id}: sway stays disabled`)
  assert.equal(engine.swayOffset(1), 0, `first-chapter level ${level.id}: tower position stays fixed`)
  assert.equal(engine._bgPalette(0).starAlpha, 0, `first-chapter level ${level.id}: daytime sky has no stars`)
  assert.deepEqual(engine._bgPalette(0).topArr, engine.scenery.district.sky[0])
  assert.deepEqual(engine._bgPalette(0).botArr, engine.scenery.district.sky[1])
  engine.weather.timer = 0
  engine.weather.update(0.05, 1)
  assert.equal(engine.weather.scale, 0)
  assert.equal(engine.weather.current, null)
  assert.equal(engine.weather.hudState(), null)
  const drawing = mockContext()
  engine.scenery.renderFront(drawing, 0)
  assert.deepEqual(drawing.rects, [[0, CITY_SAFE_AREA.minY, CITY_SAFE_AREA.leftWidth, 720 - CITY_SAFE_AREA.minY], [CITY_SAFE_AREA.rightStart, CITY_SAFE_AREA.minY, 420 - CITY_SAFE_AREA.rightStart, 720 - CITY_SAFE_AREA.minY]])
  assert.equal(typeof engine.scenery.renderCity, 'undefined')
  assert.deepEqual(engine.scenery.farCity, new Scenery({ level, theme: 'dark' }).farCity, 'original city scene generation stays reproducible')
  engine.destroy()
}

function makeEngine(levelId) {
  return new GameEngine({ level: getLevel(levelId), theme: 'dark', skills: {}, material: 'soil', inventory: {}, onState: () => {}, onEnd: () => {}, onReviveOffer: () => {}, onInventoryChange: () => {} })
}

// Chapter-only weather scheduler uses one authored weather type, forecast phase, and neutral defaults.
for (const level of LEVELS.slice(8)) {
  const engine = makeEngine(level.id)
  const weather = engine.weather
  assert.equal(weather.chapterMode, true, `${level.id}: chapter weather mode is isolated`)
  assert.equal(Object.hasOwn(weather, 'attackWeatherId'), false, `${level.id}: no obsolete enemy/weather-attack field remains`)
  assert.deepEqual(weather.modifiers(), { windX: 0, speedMod: 1 }, `${level.id}: chapter starts with no weather force`)
  if (level.weatherKind === 'snow') {
    assert.equal(weather.hudState().phaseLabel, '纯视觉')
    assert.equal(weather.activeId, 'snow')
    const drawing = mockContext()
    weather.renderFront(drawing, 420, 720)
    assert.ok(drawing.trace.every((trace) => trace[4] === null), 'snowflakes stay in the side margins without obscuring the operation lane')
  } else {
    weather.chapterTimer = 0
    weather.update(0.016, 0.1)
    assert.equal(weather.current?.phase, 'warning')
    const expectedId = ({ wind: 'wind', cloud: 'smog', lightning: 'storm', rain: 'rain', hail: 'hail' })[level.weatherKind]
    assert.equal(weather.current?.def.id, expectedId, `${level.chapterId}: only its authored weather starts`)
    assert.equal(weather.hudState().phase, 'warning')
    assert.deepEqual(weather.modifiers(), { windX: 0, speedMod: 1 }, `${level.id}: forecast is gameplay-neutral`)
    if (level.weatherKind === 'rain') assert.equal(weather.slipVelocity(1), 0, 'rain has no force before the forecast expires')
    weather.update(weather.current.phaseTimer + 0.02, 0.1)
    assert.equal(weather.current?.phase, 'active')
    if (level.weatherKind === 'wind') {
      assert.notEqual(weather.modifiers().windX, 0)
      assert.equal(weather.modifiers().speedMod, 1)
    } else if (level.weatherKind === 'rain') {
      assert.deepEqual(weather.modifiers(), { windX: 0, speedMod: 1 }, 'rain never pushes a moving block or changes its speed')
      assert.notEqual(weather.slipVelocity(1), 0, 'rain slip activates only once an active-phase click starts a drop')
      engine.tap()
      assert.equal(engine.dropping, true)
      assert.notEqual(engine.slipV, 0, 'the real click/drop transition captures chapter rain slip')
    } else if (level.weatherKind === 'cloud') {
      assert.equal(weather.fogStrength(), 0, 'new cloud chapter never uses the legacy opaque fog curtain')
      const drawing = mockContext()
      weather.renderFront(drawing, 420, 720)
      assert.ok(drawing.trace.every((trace) => trace[3] <= 0.13), 'foreground clouds remain translucent enough to preserve block outlines')
    } else if (level.weatherKind === 'lightning') {
      const testFloor = { id: 1, cx: 210, index: 1, width: 100, scorePts: 100, maxDurability: 30, durability: 30 }
      engine.blocks.push(testFloor)
      engine.floors = 1
      const ant = engine.antSystem.spawn('worker', { route: 'up', position: 1, personality: null, force: true })
      assert.ok(engine.antSystem.assignTarget(ant.id, testFloor.id, 'durability'))
      ant.state = 'bite'
      ant.segmentRemaining = 2
      const before = { floors: engine.floors, score: engine.score, durability: testFloor.durability, hp: ant.hp, bite: ant.state }
      weather._strike(1)
      assert.deepEqual({ floors: engine.floors, score: engine.score, durability: testFloor.durability, hp: ant.hp, bite: ant.state }, before, 'chapter lightning never damages the tower or ant')
      assert.equal(weather.flash, 0, 'chapter lightning does not invoke the legacy full-screen flash')
      assert.equal(weather.blind, 0)
    } else if (level.weatherKind === 'hail') {
      const top = { id: 1, cx: 210, index: 1, width: 62, scorePts: 120, maxDurability: 30, durability: 30 }
      engine.blocks.push(top)
      engine.floors = 1
      engine.currentWidth = top.width
      engine.score = 120
      const ant = engine.antSystem.spawn('worker', { route: 'up', position: 1, personality: null, force: true })
      assert.ok(engine.antSystem.assignTarget(ant.id, top.id, 'durability'))
      ant.state = 'bite'
      ant.segmentRemaining = 100
      engine.dropping = true
      const before = { width: top.width, floors: engine.floors, score: engine.score, durability: top.durability, hp: ant.hp }
      weather._hitHail(99)
      assert.deepEqual({ width: top.width, floors: engine.floors, score: engine.score, durability: top.durability, hp: ant.hp }, before, 'hail cannot settle while the block is falling')
      weather.update(0.1, 0.1)
      assert.equal(weather.current.phase, 'warning', 'hail suspends itself while a block is falling')
      engine.dropping = false
      weather.update(0.1, 0.1)
      assert.equal(weather.current.phase, 'warning', 'hail re-arms with a short warning after the block lands')

      // 回归守卫（P0）：落块曾经把 warning 整轮重置成 3s，而玩家约每 1.1s 落一块，
      // 于是倒计时永远走不到 0，整章冰雹实测 0% 时间处于 active。
      // 这里模拟「一直在落块」的真实节奏，冰雹必须仍能进入 active。
      let reachedActive = false
      for (let tick = 0; tick < 1200 && !reachedActive; tick++) {
        engine.dropping = tick % 66 < 26      // 约每 1.1s 落一块，落块本身占 0.43s
        weather.update(1 / 60, 0.4)
        if (weather.current?.phase === 'active') reachedActive = true
      }
      assert.ok(reachedActive, 'hail still reaches its active phase while the player keeps dropping blocks')
      for (let i = 0; i < 40; i++) weather._hitHail(99)
      assert.ok(top.width >= 26, 'chapter hail cannot reduce the top below the safety floor')
      assert.equal(engine.floors, 1)
      assert.equal(engine.score, 120)
      assert.equal(top.durability, 30, 'hail remains width-only and does not affect floor durability')
      assert.equal(ant.hp, ant.maxHp, 'hail does not damage ants')
      assert.equal(ant.state, 'bite', 'hail does not alter the ant state or bite phase')
      assert.equal(engine.status, 'playing')
    }
  }
  engine.destroy()
}

// Legacy v1 saves retain the same first eight IDs and all existing progress.
const legacySave = {
  coins: 321,
  unlocked: 6,
  stars: { 1: 3, 2: 2, 3: 1, 4: 3, 5: 2, 6: 3 },
  bestScores: { 1: 1800, 2: 2400, 3: 2600, 4: 3200, 5: 3900, 6: 5100 },
  settings: { sound: false, volume: 0.4 }
}
let persisted = JSON.stringify(legacySave)
globalThis.localStorage = { getItem: () => persisted, setItem: (_key, value) => { persisted = value }, removeItem: () => { persisted = null } }
const { Storage } = await import('../src/core/storage.js')
const restored = Storage.load()
assert.equal(restored.coins, 321)
assert.equal(restored.unlocked, 6)
for (const id of Object.keys(legacySave.stars)) assert.equal(restored.stars[id], legacySave.stars[id])
for (const id of Object.keys(legacySave.bestScores)) assert.equal(restored.bestScores[id], legacySave.bestScores[id])
assert.equal(restored.stars[56], 0)
assert.equal(restored.bestScores[56], 0)
assert.equal(restored.settings.musicOn, false)
assert.equal(restored.settings.sfxOn, false)
assert.equal(restored.settings.musicVolume, 0.4)
assert.equal(restored.settings.effectsVolume, 0.4)

const { actions, useStore } = await import('../src/core/store.js')
const state = useStore()
assert.equal(state.unlocked, 6)
for (const id of [6, 7, 8]) {
  actions.settle({ coins: 0, level: { id }, score: 0, cleared: true, stars: 1, petExp: 0 })
  assert.equal(state.unlocked, id + 1, `clearing level ${id} unlocks its immediate successor`)
}
state.unlocked = 55
actions.settle({ coins: 0, level: { id: 55 }, score: 0, cleared: true, stars: 1, petExp: 0 })
assert.equal(state.unlocked, 56, 'the last small level unlocks without skipping chapters')
actions.settle({ coins: 0, level: { id: 56 }, score: 0, cleared: true, stars: 1, petExp: 0 })
assert.equal(state.unlocked, 56, 'the last chapter has no invalid level 57')

console.log('章节回归通过：56 个关卡配置与天气池、独立城市视觉、安全操作区、预告/静歇/落块隔离、冰雹安全下限、旧档兼容和跨章顺序解锁。')
