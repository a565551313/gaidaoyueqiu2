// 回归测试套件：验证本轮全部修复
// 运行：node scripts/verify.mjs
import { GameEngine } from '../src/core/gameEngine.js'
import { getLevel, LEVELS } from '../src/data/levels.js'
import { EVENT_CONFIG, EVENT_SCHEDULES } from '../src/data/attacks.js'
import { MATERIALS } from '../src/data/materials.js'
import { createPetSnapshot } from '../src/core/petSystem.js'

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
    pet: opts.pet || null,
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
    engine.attackSystem.script = []
    engine.weather._tryStart = () => { engine.weather.timer = 999 }
  }
  return engine
}
const dt = 1 / 60
function step(e, n = 1) { for (let i = 0; i < n; i++) { e.update(dt); e.render(makeCtx()) } }
function autoPerfect(e) {
  if (e.status !== 'playing' || e.dropping || e.autoSeqActive || !e.moving) return false
  const event = e.attackSystem?.currentEvent
  if (event) {
    if (event.type === 'drill' && event.state === 'pressure') {
      const top = e.blocks[e.blocks.length - 1]
      if (e.moving && Math.abs(e.moving.cx - (top.cx + e.swayOffset(top.index))) < 3) e.tap()
      return true
    }
    e.tapAt(event.x, e.screenY(e.attackSystem._deviceWorldY(event)))
    return true
  }
  const mv = e.moving
  if (mv && !e.dropping) {
    const top = e.blocks[e.blocks.length - 1]
    if (Math.abs(mv.cx - (top.cx + e.swayOffset(top.index))) < 3) { e.tap(); return true }
  }
  return false
}
function hitDevice(e, event = e.attackSystem?.currentEvent) {
  if (!event) return false
  const y = e.screenY(e.attackSystem._deviceWorldY(event))
  e.tapAt(event.x, y)
  return event.settled && !e.attackSystem.events.includes(event)
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

console.log('— 3. 三类结构事件按确定性进度脚本覆盖全部 56 关')
{
  ok(Object.keys(EVENT_CONFIG).sort().join(',') === 'blocker,cutter,drill', '3: exactly three structure event types')
  ok(Object.keys(EVENT_SCHEDULES).length === 56, `3: all 56 levels have scripts (got ${Object.keys(EVENT_SCHEDULES).length})`)
  ok(Object.values(EVENT_SCHEDULES).every((script) => script.length > 0 && script.every((event) => EVENT_CONFIG[event.type] && event.at >= 0.18 && event.at < 0.92)), '3: scripts contain only valid, gated event types')
  for (let id = 1; id <= 56; id++) {
    const stageId = (id - 1) % 8 + 1
    if (JSON.stringify(EVENT_SCHEDULES[id]) !== JSON.stringify(EVENT_SCHEDULES[stageId])) ok(false, `3: L${id} stage script matches L${stageId}`)
  }
  ok(true, '3: every weather chapter reuses its matching stage script')
  const late = mk({ levelId: 4, noThreats: true })
  late.floors = Math.ceil(late.level.target * 0.92)
  late.attackSystem.chainDue = late.time
  late.attackSystem.chainType = 'drill'
  ok(late.attackSystem._tryStartScheduledEvent() === null && late.attackSystem.chainDue === null, '3: chain finale cannot start a new event after 92% progress')
}

console.log('— 4. 一次设备点击只中止事件；下一次独立点击才落层')
{
  const e = mk({ levelId: 1, noThreats: true })
  climb(e, 6, '4')
  const event = e.attackSystem.spawn('cutter')
  const target = event?.targetBlock
  const moving = e.moving
  ok(e.attackSystem.spawn('drill') === null && e.attackSystem.events.length === 1, '4: only one unsettled event can exist at a time')
  const floorsBefore = e.floors
  const coinsBefore = e.baseCoinSum
  ok(!!event && target?.id === event.targetId, '4: cutter binds a stable target object ID')
  ok(hitDevice(e, event), '4: a single device hit settles the event')
  ok(e.floors === floorsBefore && !e.dropping && e.moving === moving, '4: device hit does not drop the moving block')
  ok(e.baseCoinSum === coinsBefore + EVENT_CONFIG.cutter.cancelCoins, '4: cutter cancellation grants its configured reward once')
  e.moving.cx = e.blocks.at(-1).cx + e.swayOffset(e.blocks.at(-1).index)
  e.tap()
  ok(e.dropping, '4: the next tap remains an ordinary layer drop')
  step(e, 20)
  ok(e.floors === floorsBefore + 1, '4: ordinary drop resolves independently')
}

console.log('— 5. 雷击：最多劈 3 层（乌金 1 层），瞄准中会重建待落方块，无空洞')
{
  // This isolates the legacy lightning capability with a test-only modifier;
  // actual Chapter One stages keep weather and sway disabled.
  const e = mk({ levelId: 8, levelOverrides: { weather: 1.35, sway: 1.25 }, material: 'soil', noThreats: true })
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
  const bg = mk({ levelId: 8, levelOverrides: { weather: 1.35, sway: 1.25 }, material: 'blackgold', noThreats: true })
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

console.log('— 6. 承重切断器目标按楼层对象绑定，重排不串层，目标失效时安全撤销')
{
  const e = mk({ levelId: 4, noThreats: true })
  climb(e, 30, '6')
  const as = e.attackSystem
  const event = as.spawn('cutter')
  const target = event.targetBlock
  const stableId = event.targetId
  const originalIndex = target.index
  e.blocks.splice(3, 1)
  e.blocks.forEach((block, index) => { block.index = index })
  e.floors--
  as.remapAfterTowerChange()
  ok(e.blocks.includes(target) && event.targetBlock === target, '6: same surviving target object stays attached after reindex')
  ok(target.id === stableId && target.index === originalIndex - 1, '6: target keeps stable ID while its display index changes')
  as.update(event.warning + 0.05)
  ok(!as.events.includes(event) && e.status === 'playing', '6: event resolves against its original live object')
  ok(e.blocks.every((block, index) => block.index === index), '6: cutter consequence leaves a contiguous tower')

  const e2 = mk({ levelId: 4, noThreats: true })
  climb(e2, 30, '6-stale')
  const staleEvent = e2.attackSystem.spawn('cutter')
  const stale = staleEvent.targetBlock
  const differentObject = e2.blocks[stale.index + 1]
  e2.blocks.splice(stale.index, 1)
  e2.blocks.forEach((block, index) => { block.index = index })
  e2.floors--
  e2.attackSystem.remapAfterTowerChange()
  ok(!e2.attackSystem.events.includes(staleEvent), '6: a removed exact target cancels safely')
  ok(e2.status === 'playing' && differentObject.durability === differentObject.maxDurability, '6: stale index collision cannot damage another floor')
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
  const e = mk({ levelId: 1, noThreats: true, inventory: { revive: 1 } })
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

console.log('— 12. 长时压力测试（L4/L6，测试配置显式启用天气+摆动）')
for (const lv of [4, 6]) {
  const e = mk({ levelId: lv, levelOverrides: { weather: 0.9, sway: 0.9 }, material: 'bronze', skills: { foundation: 5, stillness: 3, insight: 2 }, inventory: { revive: 1, slow: 2, auto: 1 } })
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
    if (e.attackSystem.currentEvent && rand() < 0.2) hitDevice(e)
    if (rand() < 0.03) e.tapAt(rand() * 420, rand() * 720)
    if (rand() < 0.002) e.useSlow()
    if (rand() < 0.002) e.useAuto()
    if (e.chargeReady && rand() < 0.01) e.releaseFlame()
  }
  noGaps(e, `14 (L${lv})`)
  ok(Number.isFinite(e.score) && e.score >= 0, `14 (L${lv}): score sane (${Math.round(e.score)}, ${e.status})`)
}

console.log('— 15. 施工事件在落层、自动接管、暂停和窄屏边界安全冻结')
{
  const e = mk({ levelId: 4, noThreats: true })
  climb(e, 30, '15')
  const as = e.attackSystem
  const event = as.spawn('blocker')
  as.update(2.5)
  ok(Math.abs(event.remaining - 0.5) < 1e-6, '15: blocker advances during normal warning')
  e.dropping = true
  as.update(1)
  ok(Math.abs(event.remaining - 0.5) < 1e-6 && event.pausedReason === 'drop', '15: drop animation freezes the countdown')
  e.dropping = false
  as.update(0.01)
  ok(event.remaining >= 0.74 && event.remaining <= 0.76, '15: after a drop, at least 0.75 seconds remain')
  e.autoRemaining = 1
  as.update(0.1)
  ok(event.pausedReason === 'auto', '15: active auto takeover pauses a started event')
  e.autoRemaining = 0
  as.update(0.01)
  ok(event.state === 'warn' && event.remaining >= event.warning - 0.02, '15: auto takeover expiry restarts the full preview')
  as.pause()
  const pausedRemaining = event.remaining
  as.update(1)
  ok(event.remaining === pausedRemaining, '15: explicit pause freezes the countdown')
  as.resume()
  as.setLayoutScale(0.7)
  as.update(1)
  ok(event.pausedReason === 'layout' && event.remaining === pausedRemaining, '15: unsafe narrow layout defers the event')
  as.setLayoutScale(1)
  as.update(0.01)
  ok(event.pausedReason === '', '15: safe layout resumes the existing event')

  const wind = mk({ levelId: 9, noThreats: true })
  const windEvent = wind.attackSystem.spawn('blocker')
  wind.weather.current = { def: { id: 'wind' }, phase: 'active', intensity: 1 }
  wind.attackSystem.update(1)
  ok(windEvent.pausedReason === 'weather' && windEvent.remaining === windEvent.warning, '15: gameplay weather pauses event time')
}

console.log('— 16. 地基破拆进入失败/复活边界，胜负结算幂等')
{
  const e = mk({ levelId: 1, noThreats: true, inventory: { revive: 1 } })
  let ended = 0
  e.onEnd = (result) => { ended++; e.__result = result }
  const event = e.attackSystem.spawn('drill')
  e.attackSystem.update(event.warning + 0.01)
  ok(event.state === 'pressure', '16: drill enters the green pressure window after its preview')
  e.attackSystem.update(event.config.pressureWindow + 0.01)
  ok(e.status === 'reviveOffer' && e.floors === 0, '16: missed pressure window collapses from the foundation and offers revive')
  ok(!e.attackSystem.events.includes(event) && ended === 0, '16: revive prompt is not an end-of-game settlement')
  e.acceptRevive()
  ok(e.status === 'playing' && e.attackSystem.events.length === 0 && e.attackSystem.safeUntil > e.time, '16: revive clears events and starts a safe reset window')
  e._handleFail(e.moving)
  ok(e.status === 'fail' && ended === 1, '16: subsequent failure settles once')
  e._doFail()
  e._win()
  ok(ended === 1 && e.__result?.cleared === false, '16: later terminal callbacks cannot double-settle or flip the result')
}

console.log('— 17. 承重目标在原引用移除后不误击占据相同索引的新楼层')
{
  const e = mk({ levelId: 4, noThreats: true })
  climb(e, 30, '17')
  const event = e.attackSystem.spawn('cutter')
  const staleTarget = event.targetBlock
  const nextObject = e.blocks[staleTarget.index + 1]
  e.blocks.splice(staleTarget.index, 1)
  e.blocks.forEach((block, index) => { block.index = index })
  e.floors--
  e.attackSystem.remapAfterTowerChange()
  ok(event.targetBlock === staleTarget && !e.blocks.includes(staleTarget), '17: event retains the stale object rather than following a numeric index')
  ok(!e.attackSystem.events.includes(event), '17: removed target cancels the event instead of retargeting')
  ok(e.status === 'playing' && nextObject.durability === nextObject.maxDurability, '17: replacement floor remains untouched')
}

console.log('— 18. 第一关按脚本出现结构事件且完美应对仍可通关')
{
  const e = mk({ levelId: 1, inventory: { revive: 3 } })
  let count = 0
  const orig = e.attackSystem.spawn.bind(e.attackSystem)
  e.attackSystem.spawn = (type, options) => {
    const before = e.attackSystem.events.length
    const result = orig(type, options)
    if (e.attackSystem.events.length > before) count++
    return result
  }
  let guard = 0
  while ((e.status === 'playing' || e.status === 'reviveOffer') && guard++ < 500000) {
    step(e)
    if (e.status === 'reviveOffer') { e.acceptRevive(); continue }
    autoPerfect(e)
  }
  ok(count === EVENT_SCHEDULES[1].length, `18: L1 spawned its authored events (got ${count})`)
  ok(e.status === 'win', `18: perfect event responses still win L1 (${e.status}, floors ${e.floors})`)
}

console.log('— 19. 冰雹保留楼层效果，但不会消耗铆钉犬致命事件拦截')
{
  const pet = createPetSnapshot('rivetHound', { rivetHound: { owned: true, star: 5, level: 1 } })
  const e = mk({ levelId: 4, noThreats: true, pet })
  climb(e, 30, '19')
  const top = e.blocks[e.blocks.length - 1]
  const width0 = top.width
  const durability0 = top.durability
  e.weather._hitHail(4)
  ok(!e.petRuntime.fatalEventBlocked, '19: hail does not consume the one-time structural-event intercept')
  ok(Math.abs(width0 - top.width - 4) < 0.001, `19: hail width reduction is unchanged (${width0} -> ${top.width})`)
  ok(Math.abs(durability0 - top.durability - 2.6) < 0.001, `19: hail durability damage is unchanged (${durability0} -> ${top.durability})`)
}

console.log('— 20. 宠物事件奖励、充能与首次致命拦截只触发一次')
{
  const hound = createPetSnapshot('rivetHound', { rivetHound: { owned: true, star: 3, level: 1 } })
  const e = mk({ levelId: 1, noThreats: true, pet: hound })
  climb(e, 6, '20')
  const chargeBefore = e.charge
  for (const type of ['cutter', 'blocker', 'drill']) {
    const event = e.attackSystem.spawn(type)
    ok(hitDevice(e, event), `20: ${type} can be safely neutralized`)
  }
  ok(e.charge === chargeBefore + 1 && e.petRuntime.neutralizedEvents === 3, '20: rivet hound converts three neutralized events into one charge')

  const cat = createPetSnapshot('starCat', { starCat: { owned: true, star: 3, level: 1 } })
  const catEngine = mk({ levelId: 1, noThreats: true, pet: cat })
  climb(catEngine, 6, '20-cat')
  const coinsBefore = catEngine.baseCoinSum
  const catEvent = catEngine.attackSystem.spawn('cutter')
  hitDevice(catEngine, catEvent)
  ok(catEngine.baseCoinSum === coinsBefore + EVENT_CONFIG.cutter.cancelCoins + 1, '20: star cat grants its event-only bonus on no-damage neutralization')

  const fatalPet = createPetSnapshot('rivetHound', { rivetHound: { owned: true, star: 5, level: 1 } })
  const fatalEngine = mk({ levelId: 1, noThreats: true, pet: fatalPet })
  const drill = fatalEngine.attackSystem.spawn('drill')
  const floorsBefore = fatalEngine.floors
  fatalEngine.attackSystem.update(drill.warning + 0.01)
  fatalEngine.attackSystem.update(drill.config.pressureWindow + 0.01)
  ok(fatalEngine.status === 'playing' && fatalEngine.floors === floorsBefore, '20: first fatal drill is automatically intercepted')
  ok(fatalEngine.petRuntime.fatalEventBlocked && !fatalEngine.attackSystem.events.includes(drill), '20: interception is recorded once and removes the settled event')
  const secondDrill = fatalEngine.attackSystem.spawn('drill')
  fatalEngine.attackSystem.update(secondDrill.warning + 0.01)
  fatalEngine.attackSystem.update(secondDrill.config.pressureWindow + 0.01)
  ok(fatalEngine.status === 'fail', '20: later fatal drill is not intercepted a second time')
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
