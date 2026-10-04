// 云母精灵天气类效果的章节可达性回归：weatherDurationMult（缩短天气持续时间）
// 和 weatherOpeningReduction（开场3秒强度-X%，经 weatherIntensityMult 消费）
// 之前只在旧版非章节天气系统（_tryStart）里被读取，chapterMode 下 56 关永远
// 读不到——和乌金硬度/blockLightning 曾经的问题是同一类「写了没人读」死代码。
// 这里直接撬开 weather 内部状态，不跑完整关卡，验证两个效果在章节天气里真的
// 会改变数值。
import assert from 'node:assert/strict'
import { GameEngine } from '../src/core/gameEngine.js'
import { LEVELS } from '../src/data/levels.js'
import { resolvePetEffects } from '../src/core/petSystem.js'

function mk(level, pet) {
  return new GameEngine({
    level,
    theme: 'dark',
    skills: {},
    pet,
    material: 'soil',
    inventory: { revive: 0, auto: 0, slow: 0, shield: 0, comboGuard: 0 },
    widenActive: false,
    doubleActive: false,
    onState: () => {},
    onEnd: () => {},
    onReviveOffer: () => {},
    onInventoryChange: () => {}
  })
}

const windLevel = LEVELS.find((l) => l.chapterId === 'lanhe-metropolitan' && l.chapterStage === 4)
const rainLevel = LEVELS.find((l) => l.chapterId === 'yuting-metropolitan' && l.chapterStage === 4)
const hailLevel = LEVELS.find((l) => l.chapterId === 'lichuan-metropolitan' && l.chapterStage === 4)
assert.ok(windLevel && rainLevel && hailLevel, '三个对照关卡都应存在')

const cloudWisp5 = { id: 'cloudWisp', name: '云母精灵', effects: resolvePetEffects('cloudWisp', 50, 5) }

// ---- 1. weatherDurationMult：章节天气的 active 阶段时长应按宠物倍率压缩 ----
{
  const bare = mk(windLevel, null)
  bare.weather._startChapterEvent()
  const durBare = bare.weather.current.dur

  const withPet = mk(windLevel, cloudWisp5)
  withPet.weather._startChapterEvent()
  const durPet = withPet.weather.current.dur

  assert.ok(durPet < durBare, `云母精灵应缩短章节天气时长：无宠物 ${durBare}，携带后 ${durPet}`)
  const expectedMult = resolvePetEffects('cloudWisp', 50, 5).weatherDurationMult
  assert.ok(Math.abs(durPet / durBare - expectedMult) < 1e-6, 'duration 应恰好按 weatherDurationMult 缩放')
}

// ---- 2. weatherOpeningReduction：开场3秒内风力推力应被削弱，3秒后恢复 ----
// 同一个 engine 实例内对比 t=1（开场窗口内）和 t=5（窗口外），gustPhase 不变，
// 两次读数的比值就是纯粹的强度倍率变化，不受随机阵风相位干扰。
{
  const bare = mk(windLevel, null)
  bare.weather._startChapterEvent()
  bare.weather.current.phase = 'active'
  bare.weather.current.t = 1
  const bareEarly = bare.weather.modifiers().windX
  bare.weather.current.t = 5
  const bareLate = bare.weather.modifiers().windX
  assert.ok(Math.abs(bareEarly / bareLate - 1) < 1e-6, `无宠物时开场前后风力不应有差异：${bareEarly} vs ${bareLate}`)

  const withPet = mk(windLevel, cloudWisp5)
  withPet.weather._startChapterEvent()
  withPet.weather.current.phase = 'active'
  withPet.weather.current.t = 1
  const petEarly = withPet.weather.modifiers().windX
  withPet.weather.current.t = 5
  const petLate = withPet.weather.modifiers().windX
  const expectedMult = 1 - resolvePetEffects('cloudWisp', 50, 5).weatherOpeningReduction
  assert.ok(Math.abs(petEarly / petLate - expectedMult) < 1e-6, `开场3秒内风力应按 weatherOpeningReduction 削弱：比值 ${petEarly / petLate}，期望 ${expectedMult}`)
}

// ---- 3. 雨天打滑同理：开场3秒内滑移速度应被削弱 ----
{
  const bare = mk(rainLevel, null)
  bare.weather._startChapterEvent()
  bare.weather.current.phase = 'active'
  bare.weather.current.t = 1
  const slipBare = bare.weather.slipVelocity(1)

  const withPet = mk(rainLevel, cloudWisp5)
  withPet.weather._startChapterEvent()
  withPet.weather.current.phase = 'active'
  withPet.weather.current.t = 1
  const slipPet = withPet.weather.slipVelocity(1)

  assert.ok(Math.abs(slipPet) < Math.abs(slipBare), `开场3秒内云母精灵应削弱打滑：无宠物 ${slipBare}，携带 ${slipPet}`)
}

// ---- 4. 冰雹开场3秒内单次伤害应被削弱 ----
{
  const bare = mk(hailLevel, null)
  bare.weather._startChapterEvent()
  bare.weather.current.phase = 'active'
  bare.weather.current.t = 1
  bare.weather.hailHitT = 0 // 强制这一帧立即命中，不等真实预警间隔
  let bareDamage = null
  const origBare = bare.applyWidthDamage.bind(bare)
  bare.applyWidthDamage = (block, amount, opts) => { bareDamage = amount; return origBare(block, amount, opts) }
  bare.weather._tickChapterActive(0.001)

  const withPet = mk(hailLevel, cloudWisp5)
  withPet.weather._startChapterEvent()
  withPet.weather.current.phase = 'active'
  withPet.weather.current.t = 1
  withPet.weather.hailHitT = 0
  let petDamage = null
  const origPet = withPet.applyWidthDamage.bind(withPet)
  withPet.applyWidthDamage = (block, amount, opts) => { petDamage = amount; return origPet(block, amount, opts) }
  withPet.weather._tickChapterActive(0.001)

  assert.ok(bareDamage != null, '无宠物局应触发一次冰雹伤害用于对照')
  assert.ok(petDamage != null, '携带宠物局应触发一次冰雹伤害用于对照')
  assert.ok(petDamage < bareDamage, `开场3秒内云母精灵应削弱冰雹伤害：无宠物 ${bareDamage}，携带 ${petDamage}`)
}

console.log('云母精灵天气效果回归通过：weatherDurationMult / weatherOpeningReduction 在章节天气下均已可达并生效。')
