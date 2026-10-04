// 端到端「真实节奏」回归测试 —— 对应 docs/ENEMY_WEATHER_AUDIT.md 的 P0 发现与
// P1 建议第 11 条「补端到端回归」。
//
// 之前的回归脚本都是在把天气/蚁群状态手动推进到 active / 手动 spawnBite 之后
// 做单元断言；审计发现的问题恰恰是「单元断言各自成立，但以玩家真实落块节奏
// （约 1.1 秒/层）跑完整局时，蚂蚁和冰雹几乎不会真正发生」。
// 这里改成跑满 56 关的真实整局（Canvas/Audio 全部打桩），用贴近人类的
// 「落点对齐才点击」节奏驱动 GameEngine，统计蚂蚁咬击与冰雹命中次数，
// 防止以后的改动在不破坏任何单元断言的情况下又把这两套系统改回"写了但不发生"。
//
// 运行：node scripts/verify-campaign-cadence.mjs
import assert from 'node:assert/strict'
import { GameEngine } from '../src/core/gameEngine.js'
import { LEVELS } from '../src/data/levels.js'

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

function mk(level) {
  const engine = new GameEngine({
    level,
    theme: 'dark',
    skills: {},
    pet: null,
    material: 'soil',
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

// 「落点对齐才点击」= 不作弊的完美玩家：只有待落方块和塔顶完全重合时才落子，
// 不依赖随机数，因此整条回归在任意机器上都应得到完全相同的结果。
function runLevel(level) {
  const engine = mk(level)
  let antWidthHits = 0
  let antDurabilityHits = 0
  let hailHits = 0

  const origWidthDamage = engine.damageFloorWidthById.bind(engine)
  engine.damageFloorWidthById = (id, amount, source) => {
    if (source === 'ant') antWidthHits++
    return origWidthDamage(id, amount, source)
  }
  const origDurabilityDamage = engine.damageFloor.bind(engine)
  engine.damageFloor = (index, amount, source) => {
    if (source === 'ant') antDurabilityHits++
    return origDurabilityDamage(index, amount, source)
  }
  const origHitHail = engine.weather._hitHail.bind(engine.weather)
  engine.weather._hitHail = (amount) => {
    const before = engine.blocks[engine.blocks.length - 1]?.width
    origHitHail(amount)
    const after = engine.blocks[engine.blocks.length - 1]?.width
    if (after != null && before != null && after < before) hailHits++
  }

  let t = 0
  // 100 层 @150 像素/秒的最慢关卡，完美玩家也要走相当长时间；留足够余量。
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
  return { antBites: antWidthHits + antDurabilityHits, hailHits, status, floors, seconds: t }
}

const results = LEVELS.map((level) => ({ level, ...runLevel(level) }))

// ---- 完局健全性：真实节奏下 56 关都应该能在超时前分出胜负 ----
for (const r of results) {
  assert.notEqual(r.status, 'playing', `L${r.level.id} (${r.level.chapterId}#${r.level.chapterStage}): 完美节奏下应在 ${220}s 内分出胜负，而不是卡在 playing`)
}

// ---- P0 回归守卫 1：蚂蚁必须真的咬得到塔 ----
// 审计基线（2026-10-02，112 局旧实现）：56 关里有 35 关全程 0 次咬击。
// 当前实现下，56 关在完美节奏下应当全部 > 0 次咬击。
const zeroBiteLevels = results.filter((r) => r.antBites === 0)
assert.equal(
  zeroBiteLevels.length,
  0,
  `发现 ${zeroBiteLevels.length} 关在完美节奏下蚂蚁 0 次咬击（回归到审计基线的 35/56）：` +
    zeroBiteLevels.map((r) => `${r.level.chapterId}#${r.level.chapterStage}`).join(', ')
)

const totalAntBites = results.reduce((sum, r) => sum + r.antBites, 0)
assert.ok(totalAntBites >= 300, `蚁群总咬击数过低（${totalAntBites} < 300），疑似攻击节奏又被拖慢`)

// ---- P0 回归守卫 2：砺川（冰雹）全部 8 关必须真的下雹 ----
// 审计基线：冰雹章 8 关在 112 局里从未进入 active，命中数为 0。
const hailLevels = results.filter((r) => r.level.chapterId === 'lichuan-metropolitan')
assert.equal(hailLevels.length, 8, '砺川都会圈应为 8 关')
for (const r of hailLevels) {
  assert.ok(r.hailHits > 0, `砺川 #${r.level.chapterStage} 在完美节奏下应至少命中一次冰雹，实际 ${r.hailHits} 次`)
}
const totalHailHits = hailLevels.reduce((sum, r) => sum + r.hailHits, 0)
assert.ok(totalHailHits >= 20, `砺川章总冰雹命中数过低（${totalHailHits} < 20）`)

console.log(
  `端到端节奏回归通过：56 关完美节奏整局，蚁群总咬击 ${totalAntBites} 次（0 咬击关卡 0 个），` +
    `砺川章冰雹总命中 ${totalHailHits} 次（8 关全部 > 0）。`
)
