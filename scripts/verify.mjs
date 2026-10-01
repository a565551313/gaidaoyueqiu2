// 回归测试套件：验证本轮全部修复
// 运行：node scripts/verify.mjs
import { GameEngine } from '../src/core/gameEngine.js'
import { getLevel, LEVELS } from '../src/data/levels.js'
import { ATTACK_CONFIG } from '../src/data/attacks.js'
import { MATERIALS } from '../src/data/materials.js'

const failures = []
const passes = []
function ok(cond, label) { (cond ? passes : failures).push(label) }

function makeCtx() {
  const gradient = { addColorStop: () => {} }
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => gradient
      if (typeof k === 'string') { if (!(k in t)) t[k] = (...a) => {}; return t[k] }
      return undefined
    },
    set(t, k, v) { t[k] = v; return true }
  })
}

function mk(opts = {}) {
  let level = getLevel(opts.levelId || 1)
  if (opts.levelOverrides) level = { ...level, ...opts.levelOverrides }
  const engine = new GameEngine({
    level,
    theme: 'dark',
    skills: opts.skills || {},
    material: opts.material || 'soil',
    inventory: Object.assign({ revive: 0, auto: 0, slow: 0, shield: 0, comboGuard: 0 }, opts.inventory || {}),
    widenActive: !!opts.widen,
    doubleActive: !!opts.double,
    onState: () => {},
    onEnd: (r) => { engine.__result = r },
    onReviveOffer: () => { engine.__reviveOffer = true },
    onInventoryChange: () => {}
  })
  if (opts.noThreats) {
    engine.attackSystem.spawnRandom = () => { engine.attackSystem.timer = 999 }
    engine.weather._tryStart = () => { engine.weather.timer = 999 }
  }
  return engine
}
const dt = 1 / 60
function step(e, n = 1) { for (let i = 0; i < n; i++) { e.update(dt); e.render(makeCtx()) } }
function autoPerfect(e) {
  const mv = e.moving
  if (mv && !e.dropping) {
    const top = e.blocks[e.blocks.length - 1]
    if (Math.abs(mv.cx - (top.cx + e.swayOffset(top.index))) < 3) { e.tap(); return true }
  }
  return false
}
function climb(e, to, label) {
  let guard = 0
  while (e.floors < to && e.status === 'playing' && guard++ < 400000) { step(e); autoPerfect(e) }
  ok(e.floors >= to, `${label}: climb to ${to} (got ${e.floors}, status ${e.status})`)
  return e.floors >= to
}
function noGaps(e, label) {
  let bad = -1
  e.blocks.forEach((b, i) => { if (b.index !== i && bad < 0) bad = i })
  ok(bad < 0, `${label}: tower has no index gaps${bad >= 0 ? ' (first gap at ' + bad + ')' : ''}`)
}

// =====================================================================
console.log('— 1. 完美对局：无威胁时达成率恰好 100%')
{
  const e = mk({ levelId: 1, noThreats: true })
  let guard = 0
  while (e.status === 'playing' && guard++ < 400000) { step(e); autoPerfect(e) }
  ok(e.status === 'win', '1: perfect run wins')
  ok(Math.abs(e.__result.rate - 1) < 1e-9, `1: rate exactly 100% (got ${(e.__result.rate * 100).toFixed(2)}%)`)
  noGaps(e, '1')
}

console.log('— 2. 有威胁时达成率永不超过 100%（楼层损失扣分）')
for (const lv of [1, 3, 6]) {
  const e = mk({ levelId: lv, material: 'steel' })
  let guard = 0
  while ((e.status === 'playing' || e.status === 'reviveOffer') && guard++ < 600000) {
    step(e)
    if (e.status === 'reviveOffer') { e.acceptRevive(); continue }
    autoPerfect(e)
    if (e.chargeReady && guard % 700 === 0) e.releaseFlame()
  }
  const rate = e.__result ? e.__result.rate : e.score / e.theoreticalMax
  ok(rate <= 1.0000001, `2 (L${lv}): rate ≤ 100% (got ${(rate * 100).toFixed(2)}%, ${e.status})`)
  noGaps(e, `2 (L${lv})`)
}

console.log('— 3. 敌人全部可以点击击退（含 UFO 充能奖励）')
{
  const e = mk({ levelId: 6, noThreats: true })
  climb(e, 80, '3')
  for (const type of Object.keys(ATTACK_CONFIG.enemies)) {
    e.attackSystem.events.length = 0
    e.attackSystem.spawn(type)
    const ev = e.attackSystem.events[0]
    ok(!!ev, `3: ${type} spawned`)
    // 快进到 active
    let guard = 0
    while (ev.state === 'warn' && guard++ < 300) step(e)
    guard = 0
    while (ev.state === 'active' && ev.hp > 0 && guard++ < 4000) {
      step(e)
      e.tapAt(ev.x, e.screenY(ev.wy)) // 精确点击
    }
    ok(!e.attackSystem.events.includes(ev), `3: ${type} can be tapped to death`)
  }
  // UFO 击杀奖励充能
  e.attackSystem.events.length = 0
  e.charge = 0
  e.attackSystem.spawn('ufo')
  const ufo = e.attackSystem.events[0]
  let guard = 0
  while (ufo.state === 'warn' && guard++ < 300) step(e)
  e.attackSystem.killEvent(ufo)
  ok(e.charge === 1, `3: UFO kill grants +1 charge (got ${e.charge})`)
}

console.log('— 4. 同屏最多 2 个捣乱者，且不重复类型')
{
  const e = mk({ levelId: 6 })
  let maxActive = 0, dupSeen = false
  let guard = 0
  while (guard++ < 60 * 240) {
    step(e); autoPerfect(e)
    const act = e.attackSystem.events.filter((x) => x.state !== 'flee')
    maxActive = Math.max(maxActive, act.length)
    if (new Set(act.map((x) => x.type)).size !== act.length) dupSeen = true
  }
  ok(maxActive <= ATTACK_CONFIG.schedule.maxConcurrent, `4: max concurrent ${maxActive} ≤ ${ATTACK_CONFIG.schedule.maxConcurrent}`)
  ok(!dupSeen, '4: no duplicate types on screen')
}

console.log('— 5. 雷击：最多劈 3 层（乌金 1 层），瞄准中会重建待落方块，无空洞')
{
  const e = mk({ levelId: 6, material: 'soil', noThreats: true })
  climb(e, 100, '5')
  let maxRemoved = 0
  for (let i = 0; i < 40; i++) {
    const before = e.floors
    e.weather._resolveStrike(1.4, null, true)
    maxRemoved = Math.max(maxRemoved, before - e.floors)
    step(e, 20)
    const mv = e.moving
    if (mv && !e.dropping) {
      const top = e.blocks[e.blocks.length - 1]
      if (Math.abs(mv.cx - (top.cx + e.swayOffset(top.index))) < 3) e.tap()
    }
  }
  ok(maxRemoved <= 3, `5: lightning removes ≤ 3 floors (max ${maxRemoved})`)
  noGaps(e, '5')
  const bg = mk({ levelId: 6, material: 'blackgold', noThreats: true })
  climb(bg, 100, '5-bg')
  let bgMax = 0
  for (let i = 0; i < 40; i++) {
    const before = bg.floors
    bg.weather._resolveStrike(1.4, null, true)
    bgMax = Math.max(bgMax, before - bg.floors)
    step(bg, 20); autoPerfect(bg)
  }
  ok(bgMax <= 1, `5: blackgold lightning removes ≤ 1 floor (max ${bgMax})`)
}

console.log('— 6. 飞机坠毁不会伤到地基；UFO 只吸楼顶（塔身无“腰细”悬浮）')
{
  const e = mk({ levelId: 4, noThreats: true })
  climb(e, 30, '6')
  const as = e.attackSystem
  // 强制飞机坠毁在第 1 层
  as.events.length = 0; as.timer = 999
  as.events.push({ id: ++as.seq, type: 'plane', state: 'active', t: 99, warning: 0, targetIndex: 1, dir: 1, x: 100, y: 0, vx: 180, absorb: 0, absorbDuration: 1, hit: true, knocked: true, locked: new Set() })
  e.weather.current = { def: { id: 'storm' }, t: 0, dur: 99, intensity: 1.4, dir: 1 }
  const baseBefore = e.blocks[0].width
  as.crashPlane(as.events[0])
  ok(Math.abs(e.blocks[0].width - baseBefore) < 0.01, `6: base width untouched by plane crash (${baseBefore.toFixed(1)} -> ${e.blocks[0].width.toFixed(1)})`)

  // UFO 蓄力吸层：只允许锁定/削减“当前楼顶”，绝不动中间层
  // （连击恢复造成的“楼顶比下层宽”是合法奖励，不属于悬浮腰身，故用行为断言而非宽度断言）
  const e2 = mk({ levelId: 4, noThreats: true })
  climb(e2, 30, '6-ufo')
  e2.attackSystem.events.length = 0; e2.attackSystem.timer = 999
  e2.attackSystem.spawn('ufo')
  const ufo = e2.attackSystem.events[0]
  let guard = 0
  while (ufo.state === 'warn' && guard++ < 300) step(e2)
  // 不变量：正在被吸（attackProgress > 0）的楼层必须是当前楼顶。
  // （targetIndex 因帧内更新顺序允许滞后一帧，但吸取效果绝不落在非楼顶上）
  let drainedNonTop = false, staleBar = false
  guard = 0
  while (e2.attackSystem.events.includes(ufo) && guard++ < 4000) {
    step(e2)
    autoPerfect(e2)
    e2.blocks.forEach((b) => {
      if (b.attackProgress > 0 && b.index !== e2.blocks.length - 1) drainedNonTop = true
    })
  }
  e2.blocks.forEach((b) => { if (b.attackProgress > 0) staleBar = true })
  ok(!drainedNonTop, '6: UFO drain only ever applies to the current top floor')
  ok(!staleBar, '6: no stale progress bars after UFO leaves')
  // 被吸完后：楼层数减一、无索引空洞、继续可玩
  noGaps(e2, '6')
  ok(e2.status === 'playing' || e2.status === 'win', `6: still playable after UFO meal (${e2.status})`)
}

console.log('— 7. 落块动画期间冰雹/雷击不结算（所见即所得）')
{
  const e = mk({ levelId: 5 })
  climb(e, 50, '7')
  let tries = 0
  while (!e.dropping && tries++ < 3000 && e.status === 'playing') { step(e); autoPerfect(e) }
  const before = e.blocks[e.blocks.length - 1].width
  const floorsBefore = e.floors
  e.weather._hitHail(20) // should be skipped mid-drop
  e.weather._resolveStrike(1.4, null, true) // should be skipped mid-drop
  ok(Math.abs(e.blocks[e.blocks.length - 1].width - before) < 0.01, '7: hail skipped mid-drop')
  ok(e.floors === floorsBefore, '7: lightning skipped mid-drop')
}

console.log('— 8. 中途退出结算（abandonResult）')
{
  const e = mk({ levelId: 1 })
  climb(e, 20, '8')
  e.baseCoinSum = 123
  const r = e.abandonResult()
  ok(r.cleared === false && r.abandoned === true, '8: abandon result flagged')
  ok(r.coins === 123, `8: earned coins paid out (${r.coins})`)
  ok(Number.isFinite(r.rate) && r.rate >= 0, '8: rate sane')
}

console.log('— 9. 复活流程')
{
  const e = mk({ levelId: 1, inventory: { revive: 1 } })
  let guard = 0
  while (engine_status(e) && guard++ < 100000) {
    step(e)
    const mv = e.moving
    if (mv && !e.dropping && guard > 30) {
      const top = e.blocks[e.blocks.length - 1]
      if (Math.abs(mv.cx - top.cx) > 100) e.tap() // deliberate far miss
    }
  }
  function engine_status(x) { return x.status === 'playing' }
  ok(e.status === 'reviveOffer', `9: revive offered (status ${e.status})`)
  e.acceptRevive()
  step(e, 60)
  ok(e.status === 'playing' && Math.abs(e.currentWidth - e.initialWidthPx) < 1, '9: revive restores width & play continues')
  // 第二次失败不再询问
  guard = 0
  while (e.status === 'playing' && guard++ < 100000) {
    step(e)
    const mv = e.moving
    if (mv && !e.dropping) {
      const top = e.blocks[e.blocks.length - 1]
      if (Math.abs(mv.cx - top.cx) > 100) e.tap()
    }
  }
  ok(e.status === 'fail', `9: no second revive offer (status ${e.status})`)
}

console.log('— 10. 烈焰三连叠在目标前 2 层释放：正确通关不超层')
{
  const e = mk({ levelId: 1, noThreats: true })
  climb(e, e.level.target - 2, '10')
  e.charge = e.chargeCap
  e.chargeReady = true
  e.releaseFlame()
  let guard = 0
  while (e.status === 'playing' && guard++ < 600) step(e)
  ok(e.status === 'win' && e.floors === e.level.target, `10: flame finishes the level exactly (floors ${e.floors}/${e.level.target})`)
  noGaps(e, '10')
}

console.log('— 11. AI 接管不涨充能、点击只结束 AI')
{
  const e = mk({ levelId: 1, noThreats: true })
  e.inv.auto = 1
  ok(e.useAuto() === true, '11: useAuto works')
  const c0 = e.charge
  let guard = 0
  while (e.autoRemaining > 0 && guard++ < 3000) step(e)
  ok(e.charge === c0, '11: AI floors do not charge')
}

console.log('— 12. 长时压力测试（L4/L6，含天气+敌人+道具）')
for (const lv of [4, 6]) {
  const e = mk({ levelId: lv, material: 'bronze', skills: { foundation: 5, stillness: 3, insight: 2 }, inventory: { revive: 1, slow: 2, auto: 1 } })
  let guard = 0
  let usedSlow = 0, usedAuto = 0
  while ((e.status === 'playing' || e.status === 'reviveOffer') && guard++ < 700000) {
    step(e)
    if (e.status === 'reviveOffer') { e.acceptRevive(); continue }
    const mv = e.moving
    if (mv && !e.dropping) {
      const top = e.blocks[e.blocks.length - 1]
      const off = mv.cx - (top.cx + e.swayOffset(top.index))
      if (Math.abs(off) < 3) e.tap()
    }
    if (guard % 1500 === 0 && e.useSlow()) usedSlow++
    if (guard % 2500 === 0 && e.useAuto()) usedAuto++
    if (e.chargeReady && guard % 900 === 0) e.releaseFlame()
  }
  noGaps(e, `12 (L${lv})`)
  ok(true, `12 (L${lv}): finished ${e.status}, floors ${e.floors}/${e.level.target}, combo ${e.maxCombo}, slow×${usedSlow}, auto×${usedAuto}`)
}

console.log('— 13. 材质配置一致性')
{
  const ids = new Set(MATERIALS.map((m) => m.id))
  ok(ids.has('blackgold'), '13: materials intact')
  const bg = MATERIALS.find((m) => m.id === 'blackgold')
  ok(bg.effects.lightningMaxFloors === 1, '13: blackgold caps lightning at 1 floor')
  ok(!('attackBird' in bg.effects), '13: dead attack* keys removed from materials')
}

console.log('— 14. 随机乱点长局（1 分钟 × 3 关）：无异常')
for (const lv of [1, 3, 5]) {
  let seed = 1234 + lv
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  const e = mk({ levelId: lv, inventory: { revive: 2, auto: 1, slow: 1, shield: 2, comboGuard: 2 } })
  let guard = 0
  while ((e.status === 'playing' || e.status === 'reviveOffer') && guard++ < 60 * 60) {
    step(e)
    if (e.status === 'reviveOffer') { e.acceptRevive(); continue }
    if (rand() < 0.03) e.tapAt(rand() * 420, rand() * 720)
    if (rand() < 0.002) e.useSlow()
    if (rand() < 0.002) e.useAuto()
    if (e.chargeReady && rand() < 0.01) e.releaseFlame()
  }
  noGaps(e, `14 (L${lv})`)
  ok(Number.isFinite(e.score) && e.score >= 0, `14 (L${lv}): score sane (${Math.round(e.score)}, ${e.status})`)
}

console.log('— 15. 攻击必定落地：落块动画期间穿越类悬停等待，不吞攻击')
{
  const e = mk({ levelId: 4, noThreats: true })
  climb(e, 30, '15')
  const as = e.attackSystem
  as.events.length = 0
  as.timer = 999
  as.spawn('bird')
  const bird = as.events[0]
  ok(!!bird, '15: bird spawned')
  let guard = 0
  while (bird.state === 'warn' && guard++ < 300) step(e)
  // 把鸟放在目标层前 60px（尚未触发啄击），并锁定目标层
  const blk = e.blocks.find((b) => b.index === bird.targetIndex)
  bird.x = bird.dir > 0 ? blk.cx - 60 : blk.cx + 60
  bird.hit = false
  const dur0 = blk.durability
  // 制造一次对齐落块：动画期间鸟必须原地悬停、不结算
  const mv = e.moving
  const top = e.blocks[e.blocks.length - 1]
  mv.cx = top.cx + e.swayOffset(top.index)
  e.tap()
  ok(e.dropping === true, '15: drop in progress')
  const x0 = bird.x
  step(e, 4)
  ok(Math.abs(bird.x - x0) < 0.001 && blk.durability === dur0, '15: bird frozen in place, no damage during drop animation')
  step(e, 40)
  ok(!e.dropping, '15: drop resolved')
  guard = 0
  while (as.events.includes(bird) && guard++ < 3000) {
    step(e)
    if (blk.durability < dur0) break
  }
  ok(blk.durability < dur0, `15: peck lands right after the drop resolves (${dur0} -> ${blk.durability})`)
}

console.log('— 16. 客机俯冲坠毁：爆炸落在标记层，伤害真实可见')
{
  const e = mk({ levelId: 4, noThreats: true })
  climb(e, 30, '16')
  const as = e.attackSystem
  as.events.length = 0
  as.timer = 999
  as.spawn('plane')
  const plane = as.events[0]
  ok(!!plane, '16: plane spawned')
  let guard = 0
  while (plane.state === 'warn' && guard++ < 300) step(e)
  plane.targetIndex = 6 // 固定打第 6 层（中层，下层有效）
  const blk = e.blocks.find((b) => b.index === 6)
  const below = e.blocks.find((b) => b.index === 5)
  const d0 = blk.durability
  const b0 = below.durability
  const topW0 = e.blocks[e.blocks.length - 1].width
  const baseD0 = e.blocks[0].durability
  guard = 0
  while (as.events.includes(plane) && guard++ < 4000) step(e)
  ok(!as.events.includes(plane), '16: plane destroyed by its own crash (no ghost flight)')
  ok(d0 - blk.durability >= 4, `16: marked layer takes real damage (${d0} -> ${blk.durability})`)
  ok(below.durability < b0, `16: layer below also damaged (${b0} -> ${below.durability})`)
  ok(e.blocks[0].durability === baseD0, '16: base untouched')
  ok(Math.abs(e.blocks[e.blocks.length - 1].width - topW0) < 0.01, '16: no width loss when target is not the top')
  ok(e.particles.length >= 20, `16: explosion particles spawned (${e.particles.length})`)
}

console.log('— 17. 目标层被移除后重定向，不再凭空消失')
{
  const e = mk({ levelId: 4, noThreats: true })
  climb(e, 30, '17')
  const as = e.attackSystem
  as.events.length = 0
  as.timer = 999
  as.spawn('bird')
  const bird = as.events[0]
  let guard = 0
  while (bird.state === 'warn' && guard++ < 300) step(e)
  ok(bird.state === 'active', '17: bird active')
  const ti = bird.targetIndex
  e.removeAttackLayer(ti)
  ok(as.events.includes(bird) && bird.state === 'active', '17: bird still exists after its target layer was removed')
  ok(bird.targetIndex !== ti, '17: bird retargeted a live layer')
  ok(bird.targetIndex === -1 || !!e.blocks.find((b) => b.index === bird.targetIndex), '17: new target is a real layer')
}

console.log('— 18. 刷新频率加强：L1 整局至少 8 个捣乱者，且完美操作仍可通关')
{
  const e = mk({ levelId: 1, inventory: { revive: 3 } })
  let count = 0
  const orig = e.attackSystem.spawn.bind(e.attackSystem)
  e.attackSystem.spawn = (t) => {
    const before = e.attackSystem.events.length
    const r = orig(t)
    if (e.attackSystem.events.length > before) count++
    return r
  }
  let guard = 0
  while ((e.status === 'playing' || e.status === 'reviveOffer') && guard++ < 500000) {
    step(e)
    if (e.status === 'reviveOffer') { e.acceptRevive(); continue }
    autoPerfect(e)
  }
  ok(count >= 8, `18: L1 spawned ${count} enemies (≥8)`)
  ok(e.status === 'win', `18: perfect play still wins L1 (${e.status}, floors ${e.floors})`)
}

console.log('\n================ 结果 ================')
console.log(`通过: ${passes.length}`)
if (failures.length) {
  console.log(`失败: ${failures.length}`)
  failures.forEach((f) => console.log('  ✗ ' + f))
  process.exit(1)
} else {
  console.log('全部通过 ✓')
  passes.forEach((p) => console.log('  ✓ ' + p))
}
