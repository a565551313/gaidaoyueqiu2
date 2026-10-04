// 霆川（雷电）章节回归测试：验证雷击不再是纯背景表现，而是真的会劈塔，
// 并且乌金（硬度）材质和云母精灵（5★ blockLightning）确实减少损失。
//
// 运行：node scripts/verify-lightning.mjs
import assert from 'node:assert/strict'
import { GameEngine } from '../src/core/gameEngine.js'
import { LEVELS } from '../src/data/levels.js'
import { resolvePetEffects } from '../src/core/petSystem.js'

function makeCtx() {
  const gradient = { addColorStop: () => {} }
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => gradient
      if (k === 'measureText') return (text) => ({ width: String(text).length * 6 })
      if (typeof k === 'string') { if (!(k in t)) t[k] = (...a) => {}; return t[k] }
      return undefined
    },
    set(t, k, v) { t[k] = v; return true }
  })
}

function mk(level, { material = 'soil', pet = null } = {}) {
  const engine = new GameEngine({
    level,
    theme: 'dark',
    skills: {},
    pet,
    material,
    inventory: { revive: 0, auto: 0, slow: 0, shield: 0, comboGuard: 0 },
    widenActive: false,
    doubleActive: false,
    onState: () => {},
    onEnd: (r) => { engine.__result = r },
    onReviveOffer: () => { engine.__reviveOffer = true },
    onInventoryChange: () => {}
  })
  return engine
}

const dt = 1 / 60

function runLevel(level, opts) {
  const engine = mk(level, opts)
  let strikeCalls = 0
  let floorsLostTotal = 0
  let blockedByPet = 0

  const origStrikeTower = engine.weather._strikeTower.bind(engine.weather)
  engine.weather._strikeTower = () => {
    const before = engine.floors
    const ok = origStrikeTower()
    if (ok) {
      strikeCalls++
      floorsLostTotal += before - engine.floors
    }
    return ok
  }
  if (engine.petRuntime) {
    const origBlock = engine.petRuntime.tryBlockLightning.bind(engine.petRuntime)
    engine.petRuntime.tryBlockLightning = () => {
      const did = origBlock()
      if (did) blockedByPet++
      return did
    }
  }

  let t = 0
  const maxSeconds = 220
  while (engine.status === 'playing' && t < maxSeconds) {
    engine.update(dt)
    engine.render(makeCtx())
    t += dt
    if (engine.status === 'playing' && !engine.dropping && !engine.autoSeqActive && engine.moving) {
      const top = engine.blocks[engine.blocks.length - 1]
      const targetX = top.cx + engine.swayOffset(top.index)
      if (Math.abs(engine.moving.cx - targetX) < 3) engine.tap()
    }
    if (engine.__reviveOffer) { engine.__reviveOffer = false; engine.declineRevive?.() }
  }
  const status = engine.status
  const floors = engine.floors
  engine.destroy()
  return { status, floors, strikeCalls, floorsLostTotal, blockedByPet, seconds: t }
}

const lightningLevels = LEVELS.filter((l) => l.chapterId === 'tingchuan-metropolitan')
assert.equal(lightningLevels.length, 8, '霆川都会圈应为 8 关')

// ---- 守卫 1：真实落子节奏下，霆川 8 关必须真的发生雷击 ----
// 命中是概率性的（和真实雷电一样「偶有」），短关（如第1关）单局偶尔会抽到 0 次，
// 属于正常方差，不代表机制坏了；所以每关重放 6 次，只要求「累计」命中 > 0，
// 并盯住一次完整回合确认不会卡关（status 必须分出胜负）。
const TRIALS = 6
const soilResults = lightningLevels.map((level) => {
  let strikeCalls = 0
  let last = null
  for (let i = 0; i < TRIALS; i++) {
    last = runLevel(level, { material: 'soil' })
    assert.notEqual(last.status, 'playing', `霆川#${level.chapterStage} 应在超时前分出胜负`)
    strikeCalls += last.strikeCalls
  }
  return { level, strikeCalls }
})
const zeroStrikeLevels = soilResults.filter((r) => r.strikeCalls === 0)
assert.equal(
  zeroStrikeLevels.length,
  0,
  `发现 ${zeroStrikeLevels.length} 关连续 ${TRIALS} 次完美节奏重放全部 0 次雷击（雷电又变回纯背景表现）：` +
    zeroStrikeLevels.map((r) => `#${r.level.chapterStage}`).join(', ')
)
const totalStrikes = soilResults.reduce((sum, r) => sum + r.strikeCalls, 0)
assert.ok(totalStrikes >= 8, `霆川章总雷击次数过低（${totalStrikes} < 8，共 ${TRIALS}×8 局）`)

// ---- 守卫 2：乌金材质（硬度 20 → lightningFloors 封顶 1）应比泥土损失楼层更少 ----
// 用固定随机种子不现实（Math.random 不可控），改用大样本平均对比：
// 多次重放第 8 关（strikeChance 最高、样本最充分），比较「场均每次雷击损失层数」。
function sampleAvgLossPerStrike(level, material, trials = 60) {
  let totalStrikes = 0
  let totalLoss = 0
  for (let i = 0; i < trials; i++) {
    const r = runLevel(level, { material })
    totalStrikes += r.strikeCalls
    totalLoss += r.floorsLostTotal
  }
  return { totalStrikes, totalLoss, avg: totalStrikes > 0 ? totalLoss / totalStrikes : 0 }
}

const finalLevel = lightningLevels[lightningLevels.length - 1]
const soilSample = sampleAvgLossPerStrike(finalLevel, 'soil')
const blackgoldSample = sampleAvgLossPerStrike(finalLevel, 'blackgold')
assert.ok(soilSample.totalStrikes >= 20, `泥土样本雷击次数太少（${soilSample.totalStrikes}），测不出均值`)
assert.ok(blackgoldSample.totalStrikes >= 20, `乌金样本雷击次数太少（${blackgoldSample.totalStrikes}），测不出均值`)
assert.ok(
  blackgoldSample.avg < soilSample.avg,
  `乌金场均每次雷击损失层数（${blackgoldSample.avg.toFixed(2)}）应小于泥土（${soilSample.avg.toFixed(2)}）`
)
assert.ok(
  blackgoldSample.avg <= 1.01,
  `乌金硬度 20 应把单次雷击封顶在 1 层，实际场均 ${blackgoldSample.avg.toFixed(2)}`
)

// ---- 守卫 3：云母精灵 5★ 应该挡下本局第一次雷击（blockLightning） ----
const cloudWispPet = { id: 'cloudWisp', level: 1, star: 5, effects: resolvePetEffects('cloudWisp', 1, 5) }
assert.ok(cloudWispPet.effects.blockLightning, '云母精灵 5★ 应解锁 blockLightning 效果')
let petBlockedAtLeastOnce = false
for (let i = 0; i < 20 && !petBlockedAtLeastOnce; i++) {
  const r = runLevel(finalLevel, { material: 'soil', pet: cloudWispPet })
  if (r.blockedByPet > 0) petBlockedAtLeastOnce = true
}
assert.ok(petBlockedAtLeastOnce, '云母精灵 5★ 在多次重放中应至少挡下一次雷击（blockLightning 应该真的生效）')

console.log(
  `霆川章回归通过：8 关完美节奏下总雷击 ${totalStrikes} 次；` +
    `乌金场均每次损失 ${blackgoldSample.avg.toFixed(2)} 层 < 泥土 ${soilSample.avg.toFixed(2)} 层；` +
    `云母精灵 5★ 挡雷验证通过。`
)
