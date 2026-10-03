import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { GameEngine, QUALITY_CALLOUTS, perfectCallout } from '../src/core/gameEngine.js'
import { classifyLandingQuality } from '../src/core/antSystem.js'
import { ANT_PROTOTYPE_CONFIG, antWavesForLevel } from '../src/data/ants.js'
import { getLevel } from '../src/data/levels.js'
import { nextPetRoamDelay, nextPetRoamPosition, PET_ROAM_CONFIG } from '../src/core/petRoaming.js'
import { WEATHER_DEFS } from '../src/core/weather.js'
import { Audio, VOICE_CLIPS } from '../src/core/audio.js'

let passed = 0
function check(condition, label) {
  assert.ok(condition, label)
  passed++
  console.log(`PASS ${label}`)
}

function makeEngine(levelId = 1) {
  const engine = new GameEngine({
    level: getLevel(levelId),
    theme: 'dark',
    skills: {},
    inventory: { revive: 0, auto: 0, slow: 0, shield: 0, comboGuard: 0 },
    onState: () => {},
    onEnd: () => {},
    onReviveOffer: () => {},
    onInventoryChange: () => {}
  })
  engine.antSystem.waves = []
  engine.weather._tryStart = () => { engine.weather.timer = 999 }
  return engine
}

function growTo(engine, floorCount) {
  let guard = 0
  while (engine.floors < floorCount && engine.status === 'playing' && guard++ < 30000) {
    engine.update(1 / 60)
    const moving = engine.moving
    const top = engine.blocks.at(-1)
    if (moving && !engine.dropping && Math.abs(moving.cx - (top.cx + engine.swayOffset(top.index))) < 3) engine.tap()
  }
  assert.ok(engine.floors >= floorCount, `failed to grow tower to ${floorCount}`)
}

// Pet roaming is randomized, bounded to the perimeter lane, and waits a randomized interval.
check(PET_ROAM_CONFIG.intervalMinMs > 0 && PET_ROAM_CONFIG.intervalMaxMs > PET_ROAM_CONFIG.intervalMinMs, 'pet roam uses a random nonzero interval range')
check(nextPetRoamDelay(() => 0) === PET_ROAM_CONFIG.intervalMinMs && nextPetRoamDelay(() => 1) === PET_ROAM_CONFIG.intervalMaxMs, 'pet roam delay stays within configured min/max')
let seed = 341
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000 }
let position = { ...PET_ROAM_CONFIG.start }
let moved = false
for (let i = 0; i < 500; i++) {
  const next = nextPetRoamPosition(position, random)
  const { bounds, step } = PET_ROAM_CONFIG
  assert.ok(next.x >= bounds.xMin && next.x <= bounds.xMax && next.y >= bounds.yMin && next.y <= bounds.yMax, 'pet remains inside its safe perimeter bounds')
  assert.ok(Math.abs(next.x - position.x) <= step.x + 1e-9 && Math.abs(next.y - position.y) <= step.y + 1e-9, 'pet takes bounded small roaming steps')
  if (next.x !== position.x || next.y !== position.y) moved = true
  position = next
}
check(moved, 'pet roaming produces movement while preserving bounds and step limits')

// The denser ant prototype is explicitly capped and progresses from teaching to later waves.
check(ANT_PROTOTYPE_CONFIG.maxAlive === 5 && ANT_PROTOTYPE_CONFIG.maxTargetsPerFloor === 3, 'ant prototype exposes five-live and three-per-floor caps')
check(ANT_PROTOTYPE_CONFIG.spawnGapSeconds === 4.5 && ANT_PROTOTYPE_CONFIG.spawnGapSeconds < 6, 'ant prototype shortens the old six-second spawn gap')
const stageCounts = [1, 2, 4, 6, 8].map((stage) => antWavesForLevel({ id: stage, chapterStage: stage }).reduce((sum, wave) => sum + wave.species.length, 0))
check(stageCounts[0] === 2 && stageCounts[1] < stageCounts[2] && stageCounts[2] <= 5 && stageCounts[3] > stageCounts[2], 'waves keep level one small, add ants in early stages, and grow denser later')
const population = makeEngine()
growTo(population, 8)
for (let i = 0; i < ANT_PROTOTYPE_CONFIG.maxAlive; i++) assert.ok(population.antSystem.spawn('worker', { force: true, personality: null }), `spawn ${i + 1}`)
check(population.antSystem.hudState().count === 5 && population.antSystem.hudState().max === 5 && population.antSystem.spawn('worker', { force: true }) === null, 'five ants are actually active and a sixth is rejected')

// Same-floor attacks are previewed in sequence and damage is bounded as a group.
const combat = makeEngine()
growTo(combat, 10)
const floor = combat.blocks.find((block) => block.index === 5)
const attackers = Array.from({ length: 4 }, () => combat.antSystem.spawn('worker', {
  route: 'up', position: floor.index, personality: 'aggressive', force: true
}))
const assigned = attackers.slice(0, 3).map((ant) => combat.antSystem.assignTarget(ant.id, floor.id, 'durability'))
const rejectedFourth = combat.antSystem.assignTarget(attackers[3].id, floor.id, 'durability') === false
check(assigned.every(Boolean) && rejectedFourth, 'three ants can target one floor while a fourth cannot')
check(attackers[0].warningRemaining === 2 && attackers[1].warningRemaining === 2 + ANT_PROTOTYPE_CONFIG.warningStaggerSeconds && attackers[2].warningRemaining === 2 + 2 * ANT_PROTOTYPE_CONFIG.warningStaggerSeconds, 'same-floor warning countdowns are visibly staggered')
const initialDurability = floor.durability
for (const ant of attackers.slice(0, 3)) {
  ant.state = 'bite'
  ant.segmentIndex = 0
  ant.segmentRemaining = 0.01
}
function updateAnts(dt) { combat.time += dt; combat.antSystem.update(dt) }
updateAnts(0.02)
check(attackers[0].segmentIndex === 1 && attackers[1].segmentIndex === 0 && attackers[2].segmentIndex === 0, 'first same-floor bite settles alone before the attack gap')
updateAnts(ANT_PROTOTYPE_CONFIG.minFloorAttackGapSeconds)
check(attackers[1].segmentIndex === 1 && attackers[2].segmentIndex === 0, 'second same-floor bite waits for the configured attack gap')
updateAnts(ANT_PROTOTYPE_CONFIG.minFloorAttackGapSeconds)
const combinedDamage = initialDurability - floor.durability
check(combinedDamage <= ANT_PROTOTYPE_CONFIG.maxFloorBurstDamage && attackers[2].segmentIndex === 0, 'same-floor combined damage is capped at six per two-second window')

// Weather state supplies direction/strength; the UI consumes a single icon, not the old text line.
const weatherEngine = makeEngine()
weatherEngine.weather.chapterMode = true
weatherEngine.weather.chapter = { weatherKind: 'wind' }
weatherEngine.weather.current = {
  def: WEATHER_DEFS.wind, phase: 'active', phaseTimer: 3, dur: 4, t: 1, intensity: 0.8, dir: -1
}
const wind = weatherEngine.weather.hudState()
check(wind.id === 'wind' && wind.dir === -1 && wind.intensity === 0.8, 'weather HUD state exposes active wind direction and strength')
check(classifyLandingQuality({ rawOverlap: 0, movingWidth: 100, topWidth: 100, centerOffset: 200, perfectWindow: 10 }) === 'Miss', 'Miss remains a distinct landing-quality result')

// Static template contract for visible labels and gameplay controls.
const gameView = readFileSync(new URL('../src/components/GameView.vue', import.meta.url), 'utf8')
const template = gameView.split('<script setup>')[0]
check((template.match(/hud\.pet\.name/g) || []).length === 1 && template.includes('{{ hud.pet.name }}·Lv.{{ hud.pet.level }}') && !template.includes('hud.pet.notice ||'), 'pet has exactly one visible name/level label and no persistent status text')
check(template.includes('weather-indicator') && template.includes("weatherIndicator.id === 'wind'") && !template.includes('hud.weather.phaseLabel') && !template.includes('hud.weather.hint'), 'weather display is one direction icon with no old wind text')
const starBarTop = Number(gameView.match(/\.star-bar-wrap\s*\{[^}]*top: calc\(var\(--safe-top\) \+ (\d+)px\)/s)?.[1])
const starBarHeight = Number(gameView.match(/\.star-bar\s*\{[^}]*height: (\d+)px/s)?.[1])
const weatherIconTop = Number(gameView.match(/\.weather-indicator\s*\{[^}]*top: calc\(var\(--safe-top\) \+ (\d+)px\)/s)?.[1])
check(Number.isFinite(weatherIconTop) && weatherIconTop >= starBarTop + starBarHeight + 2, 'weather icon clears the full star strip and star markers')
check(!template.includes('未扫到活动咬击') && !template.includes('震击第 ') && !template.includes('完美 ×{{ hud.combo }}'), 'old shock explanations and perfect-count badge are absent')
check(!template.includes('class="ant-hud"') && !template.includes('hud.ants.entries'), 'persistent detailed ant information panel is removed')
// 契约改写（落层评价播报改版）：原断言要求左上角常驻一个 .ant-quality-toast 显示 hud.ants.lastQuality。
// 新设计把评价统一做成「画布内大字 + 分档语音喊话」，左上角那块与中央大字内容完全重复，
// 用户明确要求移除，因此这里反过来断言它不再存在，并把「评价反馈仍然可用」的举证迁到引擎侧。
check(!template.includes('ant-quality-toast') && !template.includes('hud.ants.lastQuality'), 'duplicated top-left landing quality toast is removed')
check(template.includes('class="charge-btn"') && template.includes('@pointerdown.stop="releaseFlame"') && template.includes('hud.chargeReady ? \'可释放\'') , 'charge control and release interaction remain intact')
const antSystem = readFileSync(new URL('../src/core/antSystem.js', import.meta.url), 'utf8')
// 契约改写（同上）：原断言要求 antSystem.onManualLanding 自己再浮一行英文档位名。
// 那行小字与 gameEngine 的评价大字位置几乎重合，是第二处重复显示，已删；
// 评价播报现在只有 gameEngine._spawnQualityCallout 一个出口。
check(!antSystem.includes('未扫到活动咬击') && !antSystem.includes('_spawnFloat(top.cx, quality'), 'ant system no longer duplicates the landing quality float')

// ---------------------------------------------------------------
// 落层评价播报：单一出口 + 「越高档越激动」的单调递增
// ---------------------------------------------------------------
const engineSrc = readFileSync(new URL('../src/core/gameEngine.js', import.meta.url), 'utf8')
check(engineSrc.includes("_spawnQualityCallout('Perfect', this.combo, placed)") && engineSrc.includes('_spawnQualityCallout(landingQuality, 0, placed)'), 'perfect and non-perfect landings both route through one callout')
check(!engineSrc.includes("_spawnFloat(placed.cx, '完美'"), 'old perfect-only chinese float is replaced by the tiered callout')

// 用一局真实对局举证：Good / Great / Perfect 三档都要落字，而不是只有完美才有反馈。
const calloutEngine = makeEngine(1)
const seenCallouts = new Set()
const originalSpawnFloat = calloutEngine._spawnFloat.bind(calloutEngine)
calloutEngine._spawnFloat = (cx, text, color, wy, opts) => {
  if (opts?.pop) seenCallouts.add(text)
  return originalSpawnFloat(cx, text, color, wy, opts)
}
// 直接构造三种落点：居中 = Perfect，偏 12px = Great，偏 40px = Good。
calloutEngine.unityChance = 0
calloutEngine.goldenBellChance = 0
for (const offset of [0, 12, 40]) {
  const top = calloutEngine.blocks.at(-1)
  calloutEngine.moving = { cx: top.cx + calloutEngine.swayOffset(top.index) + offset, width: top.width, index: top.index + 1, dir: 1, spd: 0, hue: 0 }
  calloutEngine.dropType = 'manual'
  calloutEngine._resolveDrop()
}
check(seenCallouts.has('PERFECT!') && seenCallouts.has('GREAT!') && seenCallouts.has('GOOD'), 'good / great / perfect landings each raise their own callout')

// 「越高档越激动」：字号 / 屏震 / 语音优先级必须严格递增，不能三档一个调子。
const perfectTiers = [1, 2, 3, 5, 7, 10].map((combo) => perfectCallout(combo))
check(QUALITY_CALLOUTS.Good.size < QUALITY_CALLOUTS.Great.size && QUALITY_CALLOUTS.Great.size < Math.min(...perfectTiers.map((tier) => tier.size)), 'callout font size escalates good < great < perfect')
check(perfectTiers.slice(1).every((tier, i) => tier.shake > perfectTiers[i].shake && tier.flash > perfectTiers[i].flash), 'perfect combo milestones escalate shake and flash monotonically')
// 契约改写（喊话精简）：原断言要求每个连击里程碑都配一句专属长喊。
// 长句念完要 2.7~4.7 秒，而塔每 1~2 秒长一层，喊话必然落后画面，用户要求全部砍掉；
// 现在喊话只留单词，7 连以下一律 perfect，7 连及以上换 unbelievable。文字阶梯不受影响。
check([1, 2, 3, 5].every((combo) => perfectCallout(combo).voice === 'perfect'), 'perfect combos below seven all use the short shout')
check([7, 10, 13, 20].every((combo) => perfectCallout(combo).voice === 'unbelievable'), 'seven-combo and above switch to the unbelievable shout')

const voiceNames = ['good', 'great', 'perfect', 'unbelievable']
check(Object.keys(VOICE_CLIPS).length === voiceNames.length && voiceNames.every((name) => VOICE_CLIPS[name]), 'exactly four single-word shouts are declared, no long lines left')
check(voiceNames.every((name) => existsSync(new URL(`../public/assets/voice/${name}.mp3`, import.meta.url))), 'all four voice clips are shipped')
check(!existsSync(new URL('../public/assets/voice/perfect2.mp3', import.meta.url)) && !existsSync(new URL('../public/assets/voice/perfect10.mp3', import.meta.url)), 'retired long-line clips are removed from the bundle')

// 契约改写（抢断规则反转）：原断言要求低档位不得打断高档位。
// 用户要求改成「落的是哪一层就听哪一层」——Good 还在念、下一层是 Great 就当场改口，
// 因此 voice() 现在无条件先 stopVoice() 再播，VOICE_CLIPS 里也不再有 priority。
const audioSrc = readFileSync(new URL('../src/core/audio.js', import.meta.url), 'utf8')
check(audioSrc.includes('voice(name) {') && audioSrc.includes('stopVoice() {'), 'audio manager exposes a single-slot voice channel')
check(/voice\(name\) \{[\s\S]*?this\.stopVoice\(\)[\s\S]*?source\.cloneNode/.test(audioSrc), 'every new shout unconditionally cuts off the previous one')
check(Object.values(VOICE_CLIPS).every((clip) => clip.priority === undefined), 'voice priority gating is gone')

// bug 修复举证：一局结束后解说不能还在喊。失败 / 通关 / 销毁三条终局路径都要掐断喊话。
let stopVoiceCalls = 0
const realStopVoice = Audio.stopVoice.bind(Audio)
Audio.stopVoice = () => { stopVoiceCalls++; realStopVoice() }
for (const finish of ['_doFail', '_win', 'destroy']) {
  const e = makeEngine(1)
  const before = stopVoiceCalls
  e[finish]()
  check(stopVoiceCalls > before, `${finish} stops the running shout so audio cannot outlive the run`)
}
Audio.stopVoice = realStopVoice

console.log(`Gameplay prototype verification passed: ${passed} checks.`)
