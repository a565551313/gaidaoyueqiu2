// 回归测试套件：验证本轮全部修复
// 运行：node scripts/verify.mjs
import { GameEngine } from '../src/core/gameEngine.js'
import { getLevel, LEVELS } from '../src/data/levels.js'
import { ANT_PROTOTYPE_CONFIG, ANT_SPECIES, ANT_PERSONALITIES, FLOOR_WIDTH_MIN, antWavesForLevel, durabilityForWidth } from '../src/data/ants.js'
import { classifyLandingQuality } from '../src/core/antSystem.js'
import { MATERIALS } from '../src/data/materials.js'
import { modOf } from '../src/data/blocks.js'
import { createPetSnapshot } from '../src/core/petSystem.js'

const failures = []
const passes = []
function ok(cond, label) { (cond ? passes : failures).push(label) }

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
    engine.antSystem.waves = []
    engine.weather._tryStart = () => { engine.weather.timer = 999 }
  }
  return engine
}
const dt = 1 / 60
function step(e, n = 1) { for (let i = 0; i < n; i++) { e.update(dt); e.render(makeCtx()) } }
function autoPerfect(e) {
  if (e.status !== 'playing' || e.dropping || e.autoSeqActive || !e.moving) return false
  const mv = e.moving
  if (mv && !e.dropping) {
    const top = e.blocks[e.blocks.length - 1]
    if (Math.abs(mv.cx - (top.cx + e.swayOffset(top.index))) < 3) { e.tap(); return true }
  }
  return false
}
function spawnBite(e, floorIndex, species = 'worker', opts = {}) {
  const floor = e.blocks.find((block) => block.index === floorIndex)
  if (!floor) throw new Error(`missing floor ${floorIndex}`)
  const ant = e.antSystem.spawn(species, {
    route: opts.route || 'up',
    position: opts.position ?? floor.index,
    personality: Object.hasOwn(opts, 'personality') ? opts.personality : null,
    force: true
  })
  if (!ant || !e.antSystem.assignTarget(ant.id, floor.id, opts.mode || 'durability')) throw new Error(`cannot assign ant to floor ${floorIndex}`)
  ant.position = floor.index
  ant.state = 'bite'
  ant.segmentIndex = opts.segmentIndex || 0
  ant.segmentRemaining = opts.segmentRemaining ?? 10
  return ant
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

console.log('— 3. 蚂蚁兵种配置、波次阈值、冷却和 92% 边界')
{
  ok(Object.keys(ANT_SPECIES).sort().join(',') === 'queen,scout,soldier,worker', '3: four authored ant species exist')
  ok(ANT_SPECIES.worker.hp === 12 && ANT_SPECIES.worker.climbSpeed === 1.8 && ANT_SPECIES.worker.durability.join(',') === '2,2' && ANT_SPECIES.worker.width.join(',') === '2,2', '3: worker prototype HP, speed and bite segments match design')
  ok(ANT_SPECIES.scout.hp === 10 && ANT_SPECIES.scout.climbSpeed === 2.6 && ANT_SPECIES.scout.durability.join(',') === '2,2,2' && ANT_SPECIES.scout.width.join(',') === '2,2', '3: scout prototype is distinct')
  ok(ANT_SPECIES.soldier.hp === 16 && ANT_SPECIES.soldier.climbSpeed === 1.25 && ANT_SPECIES.soldier.durability.join(',') === '4,4,4' && ANT_SPECIES.soldier.width.join(',') === '4,4,2', '3: soldier prototype is distinct')
  ok(ANT_SPECIES.queen.hp === 24 && ANT_SPECIES.queen.climbSpeed === 1.6 && ANT_SPECIES.queen.durability.join(',') === '4,4' && ANT_SPECIES.queen.width.join(',') === '2,2,2', '3: queen prototype is distinct')
  for (const id of Object.keys(ANT_PERSONALITIES)) ok(ANT_PERSONALITIES[id].id === id, `3: personality ${id} is configured`)
  ok(FLOOR_WIDTH_MIN === 26, '3: width attack safety floor matches existing 26px lower bound')
  for (let id = 1; id <= 56; id++) {
    const stageId = (id - 1) % 8 + 1
    const waves = antWavesForLevel(getLevel(id))
    const stageWaves = antWavesForLevel(getLevel(stageId))
    ok(JSON.stringify(waves) === JSON.stringify(stageWaves), `3: L${id} uses stage ${stageId} ant waves`)
    ok(waves.length > 0 && waves.every((wave) => wave.at > 0 && wave.at < 0.92 && wave.species.every((species) => ANT_SPECIES[species])), `3: L${id} waves are valid and below 92%`)
  }
  const e = mk({ levelId: 1, noThreats: true })
  climb(e, 6, '3-cooldown')
  e.antSystem.waves = [{ at: 0.18, species: ['worker', 'scout'] }]
  e.antSystem.update(dt)
  ok(e.antSystem.ants.length === 1 && e.antSystem.ants[0].speciesId === 'worker', '3: first slot spawns immediately at the wave threshold')
  e.time += ANT_PROTOTYPE_CONFIG.spawnGapSeconds - 0.01
  e.antSystem.update(dt)
  ok(e.antSystem.ants.length === 1, '3: second slot waits for the configured spawn gap')
  e.time += 0.02
  e.antSystem.update(dt)
  ok(e.antSystem.ants.length === 2 && e.antSystem.ants.some((ant) => ant.speciesId === 'scout'), '3: second slot enters after the first ant cooldown')
  e.antSystem.spawn('soldier', { force: true, personality: null })
  e.antSystem.spawn('queen', { force: true, personality: null })
  e.antSystem.spawn('scout', { force: true, personality: null })
  ok(e.antSystem.ants.length === ANT_PROTOTYPE_CONFIG.maxAlive && e.antSystem.spawn('worker', { force: true }) === null, '3: live population reaches five and rejects a sixth ant')
  const count = e.antSystem.ants.length
  e.floors = Math.ceil(e.level.target * 0.92)
  e.antSystem.update(dt)
  ok(e.antSystem.ants.length === count && e.antSystem.pendingWaveSpawns.length === 0 && e.antSystem.spawn('worker') === null, '3: 92% stops new waves and spawns without debt')

  const finale = mk({ levelId: 1, noThreats: true })
  finale.level.target = 100
  finale.antSystem.waves = []
  climb(finale, 92, '3-finale')
  const prewarned = spawnBite(finale, 80, 'worker')
  prewarned.state = 'windup'
  prewarned.warningRemaining = 1.2
  finale.antSystem.update(0.2)
  ok(prewarned.state === 'windup' && prewarned.targetFloorId != null && Math.abs(prewarned.warningRemaining - 1) < 1e-9, '3: an already announced attack keeps its warning at the 92% boundary')
  prewarned.state = 'bite'
  prewarned.segmentRemaining = 0.01
  finale.antSystem.update(0.02)
  finale.antSystem.update(1.81)
  finale.antSystem.update(0.36)
  ok(prewarned.state === 'hold' && prewarned.targetFloorId === null, '3: the preannounced attack may finish but cannot select a follow-up target')
}

console.log('— 4. 游戏区任何坐标/敌人外观都只触发普通落层')
{
  const e = mk({ levelId: 1, noThreats: true })
  climb(e, 6, '4')
  const top = e.blocks.at(-1)
  const floorsBefore = e.floors
  e.moving.cx = top.cx + e.swayOffset(top.index)
  e.tapAt(8, 690)
  ok(e.dropping, '4: coordinate tap starts an ordinary drop rather than an enemy action')
  step(e, 12)
  ok(e.floors === floorsBefore + 1 && !e.attackSystem, '4: the drop resolves once and no legacy attack system exists')
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

console.log('— 6. 蚂蚁目标按稳定楼层ID锁定，重排安全映射且不误击同索引新层')
{
  const e = mk({ levelId: 4, noThreats: true })
  climb(e, 30, '6')
  const target = e.blocks[8]
  const ant = e.antSystem.spawn('worker', { route: 'up', position: 1, personality: null, force: true })
  ok(e.antSystem.assignTarget(ant.id, target.id, 'durability'), '6: worker locks a live non-foundation floor')
  const stableId = ant.targetFloorId
  const originalIndex = target.index
  e.antSystem.beforeTowerChange()
  e.blocks.splice(3, 1)
  e.blocks.forEach((block, index) => { block.index = index })
  e.floors--
  e.antSystem.remapAfterTowerChange()
  ok(e.blocks.includes(target) && ant.targetFloorId === target.id, '6: same surviving target object stays attached after reindex')
  ok(target.id === stableId && target.index === originalIndex - 1, '6: target keeps stable ID while its display index changes')
  ok(e.blocks.every((block, index) => block.index === index), '6: tower stays contiguous after reindex')
  const replacement = e.blocks.find((block) => block.index === target.index + 1)
  e.antSystem.beforeTowerChange()
  e.blocks.splice(target.index, 1)
  e.blocks.forEach((block, index) => { block.index = index })
  e.floors--
  e.antSystem.remapAfterTowerChange()
  ok(ant.targetFloorId === null && ant.state === 'rehang', '6: removed exact target safely cancels and visibly rehangs')
  ok(e.status === 'playing' && replacement?.durability === replacement?.maxDurability, '6: same-index replacement floor remains untouched')
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
  const e = mk({ levelId: 1, noThreats: true })
  climb(e, 20, '8')
  e.baseCoinSum = 123
  e.antSystem.spawn('worker', { route: 'up', position: 2, personality: null })
  const r = e.abandonResult()
  ok(r.cleared === false && r.abandoned === true, '8: abandon result flagged')
  ok(r.coins === 123, `8: earned coins paid out (${r.coins})`)
  ok(Number.isFinite(r.rate) && r.rate >= 0, '8: rate sane')
  ok(e.antSystem.ants.length === 0, '8: abandon clears active ants and pending attacks')
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
  // 契约随属性模型改写：材质效果从 effects{}（4 个任意键 + 第 5 个效果另存
  // 在 data/ants.js）变成 mods{}（统一词汇表，默认值写在 blockMods.js）。
  // 断言跟着从「读某个 effects 键」改成「经 modOf 解析出的实际值」——
  // 测的是玩家真正受到的影响，而不是数据长什么样。
  const ids = new Set(MATERIALS.map((m) => m.id))
  ok(ids.has('blackgold'), '13: materials intact')
  const spec = (id) => ({ typeId: 'normal', materialId: id })
  ok(modOf(spec('blackgold'), 'lightningFloors') === 1, '13: blackgold caps lightning at 1 floor')
  ok(modOf(spec('soil'), 'lightningFloors') === 3, '13: other materials keep the 3-floor lightning cap')
  // 青铜的抗碎以前是一个 antiBreak 同时管两件语义不同的事，现在拆成两条轴
  ok(modOf(spec('bronze'), 'widthDamage') === 0.75, '13: bronze still takes 25% less hail width damage')
  ok(modOf(spec('bronze'), 'cutRetain') === 0.25, '13: bronze still keeps 25% of the cut edge')
  ok(modOf(spec('concrete'), 'slip') === 0.7, '13: concrete still slips 30% less')
  ok(modOf(spec('steel'), 'windPush') === 0.75, '13: steel still takes 25% less wind push')
  // 耐久倍率以前住在 data/ants.js，属于材质的数据却放在蚂蚁文件里
  ok(modOf(spec('blackgold'), 'durabilityMax') === 1.35, '13: the durability bonus moved into materials.js intact')
  ok(durabilityForWidth(120, 'blackgold') === 24 && durabilityForWidth(120, 'soil') === 18, '13: durability pools unchanged by the move')
  // 展示文案改为从 mods 自动生成：旧的人肉副本漏掉了 4 个付费材质的耐久加成
  for (const m of MATERIALS.filter((x) => x.id !== 'soil')) {
    ok(m.effect.includes('耐久'), `13: ${m.id} now advertises its hidden durability bonus`)
  }
  ok(!MATERIALS.some((m) => 'effects' in m), '13: the old effects{} shape is gone')
  ok(MATERIALS.find((m) => m.id === 'soil').effect === '无特殊效果', '13: a material with no mods reads as having none')
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

console.log('— 15. 五档品质边界与两类分段楼层伤害')
{
  const q = (rawOverlap, centerOffset, perfectWindow = 10) => classifyLandingQuality({ rawOverlap, movingWidth: 100, topWidth: 100, centerOffset, perfectWindow })
  ok(q(0, 0) === 'Miss' && q(-0.1, 0) === 'Miss', '15: zero or negative raw overlap is Miss')
  ok(q(90, 10) === 'Perfect', '15: deterministic geometric perfect-window edge is inclusive for a physically consistent overlap')
  ok(q(85, 15) === 'Great' && q(84.99, 15) === 'Good', '15: Great starts exactly at 0.85 overlap ratio')
  ok(q(60, 40) === 'Good' && q(59.99, 40) === 'Bad', '15: Good starts exactly at 0.60 and any positive remainder is Bad')

  const e = mk({ levelId: 1, noThreats: true })
  climb(e, 10, '15-durability')
  const floor = e.blocks[4]
  const ant = spawnBite(e, floor.index, 'worker', { segmentRemaining: 0.01 })
  const durability = floor.durability
  e.antSystem.update(0.02)
  ok(floor.durability === durability - 2 && ant.segmentIndex === 1, '15: worker settles its first 2-point durability segment once')
  const firstSegmentIndex = ant.segmentIndex
  ant.segmentIndex = firstSegmentIndex - 1
  e.antSystem._settleSegment(ant, floor)
  ok(floor.durability === durability - 2 && ant.segmentIndex === firstSegmentIndex - 1, '15: replaying the same ant/round/segment token is idempotent')
  ant.segmentIndex = firstSegmentIndex
  e.antSystem.update(1.81)
  // 路线①：一轮啃完后，若该层已挂彩，蚂蚁不再重挂换层，而是原地锁进下一轮围攻。
  // 这正是「蚁群能啃穿一层」的前提——此前伤害平摊到几十层，单层永远破不了。
  ok(floor.durability === durability - 4 && ant.state === 'windup' && ant.siegeRounds === 1 && ant.targetFloorId === floor.id,
    '15: worker durability segments settle as 2+2, then lock into a second siege round on the same wounded floor')

  const w = mk({ levelId: 1, noThreats: true })
  climb(w, 6, '15-width')
  const top = w.blocks.at(-1)
  const width = top.width, center = top.cx, score = w.score, scorePts = top.scorePts
  const widthWorker = spawnBite(w, top.index, 'worker', { mode: 'width', segmentRemaining: 0.01 })
  w.antSystem.update(0.02)
  ok(top.width === width - 2 && top.cx === center && w.currentWidth === top.width, '15: width damage preserves center and syncs the current top width')
  ok(Math.abs((score - w.score) - 2 / 1.2) < 1e-6 && Math.abs((scorePts - top.scorePts) - 2 / 1.2) < 1e-6, '15: width loss removes only its proportional earned score')
  w.antSystem.update(1.81)
  // 路线①：啃宽度永远不会导致坍塌，所以一旦把楼层啃窄，下一轮转为啃耐久。
  ok(top.width === width - 4 && widthWorker.siegeRounds === 1 && widthWorker.targetMode === 'durability',
    '15: worker width segments settle as 2+2, then switch to durability to keep gnawing the breach')

  const edge = mk({ levelId: 1, noThreats: true })
  climb(edge, 4, '15-width-edge')
  const edgeTop = edge.blocks.at(-1)
  edgeTop.width = FLOOR_WIDTH_MIN + 1
  edge.currentWidth = edgeTop.width
  const edgeAnt = spawnBite(edge, edgeTop.index, 'worker', { mode: 'width', segmentRemaining: 0.01 })
  const edgePreview = edge.antSystem.hudState().entries.find((entry) => entry.id === edgeAnt.id)
  ok(edgePreview.expectedLoss === 1 && edgePreview.segments.join(',') === '1', '15: width forecast clips damage and remaining segments at the safety bound')
  edge.antSystem.update(0.02)
  ok(edgeTop.width === FLOOR_WIDTH_MIN && edge.currentWidth === FLOOR_WIDTH_MIN, '15: width bite stops exactly at the 26px safety lower bound')
  ok(edgeAnt.state === 'rehang' && edgeAnt.targetFloorId === null, '15: floor-boundary cancellation does not convert width damage to durability damage')

  const collapsed = mk({ levelId: 1, noThreats: true })
  climb(collapsed, 9, '15-collapse')
  const removed = collapsed.blocks[5]
  const removedId = removed.id
  // 路线①：蚁致坍塌从「上方全剪」改为「抽掉 ANT_SINK_FLOORS 层、上方塔身整体下沉」。
  // 整塔剪切实测平均一次损失 52.7 层（≈ 当场结束），对休闲塔类过于致命。
  const ANT_SINK_FLOORS = 3
  const survivorsAbove = collapsed.blocks.slice(5 + ANT_SINK_FLOORS).map((block) => block.id)
  const scoreLoss = collapsed.blocks.slice(5, 5 + ANT_SINK_FLOORS).reduce((sum, block) => sum + (block.scorePts || 0), 0)
  const scoreBeforeCollapse = collapsed.score
  removed.durability = 2
  const collapseAnt = spawnBite(collapsed, removed.index, 'worker', { segmentRemaining: 0.01 })
  collapsed.antSystem.update(0.02)
  ok(!collapsed.blocks.some((block) => block.id === removedId) && collapsed.floors === collapsed.blocks.length - 1, '15: durability collapse removes the locked stable floor and reindexes survivors')
  ok(Math.abs((scoreBeforeCollapse - collapsed.score) - scoreLoss) < 1e-6, '15: the ant sink subtracts exactly the sunk floors\' earned score')
  ok(survivorsAbove.every((id) => collapsed.blocks.some((block) => block.id === id)),
    '15: the ant sink keeps every floor above the breach instead of shearing the tower')
  ok(collapseAnt.state === 'rehang' && collapseAnt.targetFloorId === null && collapsed.currentWidth === collapsed.blocks.at(-1).width, '15: collapse cancels the stale target safely and synchronizes currentWidth')
}

console.log('— 16. 震击按活动咬击楼层扫描、环绕并同层去重')
{
  for (const [quality, expected] of [['Perfect', 3], ['Great', 3], ['Good', 2], ['Bad', 1], ['Miss', 0]]) {
    const e = mk({ levelId: 1, noThreats: true })
    climb(e, 8, `16-${quality}`)
    const ants = [spawnBite(e, 8), spawnBite(e, 5), spawnBite(e, 2)]
    e.antSystem.cursorId = e.blocks.at(-1).id
    const result = e.antSystem.onManualLanding(quality)
    ok(result.hitFloors.length === expected, `16: ${quality} scans ${expected} of at most three active floors`)
    if (quality === 'Miss') ok(ants.every((ant) => ant.hp === ant.maxHp), '16: Miss causes no ant damage')
  }
  const grouped = mk({ levelId: 1, noThreats: true })
  climb(grouped, 12, '16-group')
  const topId = grouped.blocks.at(-1).id
  const a = spawnBite(grouped, 10), b = spawnBite(grouped, 10), c = spawnBite(grouped, 3)
  grouped.antSystem.cursorId = topId
  const preview = grouped.antSystem.scanPreview()
  ok(preview.candidates.map((item) => item.floor).join(',') === '10,3' && preview.candidates[0].ants.length === 2, '16: preview skips empty floors and groups two ants on one floor')
  const cursorBefore = grouped.antSystem.cursorId
  const result = grouped.antSystem.onManualLanding('Good')
  ok(result.hitFloors.join(',') === '10,3' && result.hitAnts.length === 3, '16: Good uses two floor slots while both ants on floor 10 are hit once')
  ok(a.hp === 10 && b.hp === 10 && c.hp === 10, '16: every hit ant loses fixed 2 HP independent of quality')
  ok(grouped.antSystem.cursorId !== cursorBefore && grouped.blocks.find((block) => block.id === grouped.antSystem.cursorId)?.index === 2, '16: cursor advances from the last checked stable floor and wraps downward')
  const missCursor = grouped.antSystem.cursorId
  grouped.antSystem.onManualLanding('Miss')
  ok(grouped.antSystem.cursorId === missCursor, '16: Miss does not move the scan cursor')
  const warning = mk({ levelId: 1, noThreats: true })
  climb(warning, 5, '16-warning')
  const preBite = warning.antSystem.spawn('worker', { route: 'up', position: 1, personality: null, force: true })
  warning.antSystem.assignTarget(preBite.id, warning.blocks[4].id, 'durability')
  preBite.state = 'windup'
  ok(warning.antSystem.scanPreview().candidates.length === 0, '16: a preparing ant is not an active shock target')
}

console.log('— 17. 性格阈值、固定路线、目标名额与蚁后增援')
{
  const e = mk({ levelId: 1, noThreats: true })
  climb(e, 8, '17')
  const floor = e.blocks[5]
  const timid = spawnBite(e, 5, 'worker', { personality: 'timid' })
  const second = e.antSystem.spawn('worker', { route: 'up', position: 5, personality: null, force: true })
  ok(e.antSystem.assignTarget(second.id, floor.id, 'width'), '17: one second ant may share the same locked floor')
  const third = e.antSystem.spawn('worker', { route: 'up', position: 5, personality: null, force: true })
  const thirdAssigned = e.antSystem.assignTarget(third.id, floor.id, 'durability')
  const fourth = e.antSystem.spawn('worker', { route: 'up', position: 5, personality: null, force: true })
  ok(thirdAssigned && !e.antSystem.assignTarget(fourth.id, floor.id, 'durability') && !e.antSystem.assignTarget(timid.id, e.blocks[0].id, 'durability'), '17: three ants may lock one floor, a fourth is rejected, and the foundation stays safe')
  e.antSystem.onManualLanding('Bad')
  ok(timid.hitCount === 1 && timid.hp === 10 && timid.state === 'retreat', '17: timid ant retreats after one shock hit')

  const cowardEngine = mk({ levelId: 1, noThreats: true })
  climb(cowardEngine, 7, '17-coward')
  const coward = spawnBite(cowardEngine, 4, 'worker', { personality: 'coward' })
  cowardEngine.antSystem.onManualLanding('Bad')
  ok(coward.hitCount === 1 && coward.state === 'stunned', '17: coward is interrupted by the first shock but does not retreat')
  cowardEngine.antSystem.assignTarget(coward.id, cowardEngine.blocks[4].id, 'durability')
  coward.state = 'bite'
  cowardEngine.antSystem.onManualLanding('Bad')
  ok(coward.hitCount === 2 && coward.state === 'retreat', '17: coward retreats on its second cumulative shock')

  const temper = mk({ levelId: 1, noThreats: true })
  climb(temper, 6, '17-temper')
  const impatient = spawnBite(temper, 4, 'worker', { personality: 'impatient' })
  const intervals = [0, 1, 2, 3, 4, 5].map((streak) => { impatient.attackStreak = streak; return temper.antSystem._segmentInterval(impatient) })
  ok(intervals.every((value, index) => Math.abs(value - [1.8, 1.65, 1.5, 1.35, 1.2, 1.2][index]) < 1e-9), '17: impatient interval accelerates by 0.15s four times, capped at 1.2s')
  impatient.attackStreak = 4
  temper.antSystem.onManualLanding('Bad')
  ok(impatient.attackStreak === 0, '17: a shock resets impatient acceleration')
  const aggressive = temper.antSystem.spawn('worker', { route: 'up', position: 4, personality: 'aggressive', force: true })
  temper.antSystem.assignTarget(aggressive.id, temper.blocks[4].id, 'durability')
  ok(temper.antSystem._segmentDamage(aggressive, 2) === 3 && aggressive.warningRemaining === 2, '17: aggressive ant deals 1.5x damage with an additional readable 0.8s windup')

  const routes = mk({ levelId: 1, noThreats: true })
  climb(routes, 8, '17-routes')
  const down = routes.antSystem.spawn('scout', { route: 'down', position: 8, personality: null, force: true })
  routes.antSystem.assignTarget(down.id, routes.blocks[3].id, 'durability')
  const before = down.position
  routes.antSystem.update(0.1)
  ok(down.position < before && down.routeIntent === 'down', '17: descending-route ant follows its fixed route without teleporting')

  const queenEngine = mk({ levelId: 8, noThreats: true })
  climb(queenEngine, 12, '17-queen')
  const queen = spawnBite(queenEngine, 9, 'queen')
  for (let i = 0; i < 6; i++) {
    if (i > 0) {
      queenEngine.antSystem.assignTarget(queen.id, queenEngine.blocks[9].id, 'durability')
      queen.state = 'bite'
    }
    queenEngine.antSystem.onManualLanding('Bad')
  }
  ok(queen.hp === 12 && queenEngine.antSystem.pendingQueenReinforcements.length === 1, '17: queen half-health queues one announced worker reinforcement without healing')
  queenEngine.antSystem.update(1.21)
  ok(queenEngine.antSystem.ants.some((ant) => ant.speciesId === 'worker') && queen.hp === 12, '17: queen reinforcement honors normal population/cooldown rules')
}

console.log('— 18. 攻击预告冻结、窄屏恢复、Miss复活与胜利优先级')
{
  const realDrop = mk({ levelId: 1, noThreats: true })
  climb(realDrop, 8, '18-drop-window')
  const dropAnt = spawnBite(realDrop, 4)
  dropAnt.state = 'windup'
  dropAnt.warningRemaining = 2
  const dropTop = realDrop.blocks.at(-1)
  realDrop.moving.cx = dropTop.cx + realDrop.swayOffset(dropTop.index)
  realDrop.tap()
  let dropFrames = 0
  while (realDrop.dropping && dropFrames++ < 6) realDrop.update(0.05)
  ok(!realDrop.dropping && dropFrames === 3 && realDrop.dropElapsed >= 0.13 && realDrop.dropElapsed < 0.2, '18: the real hand-drop resolves after its approximately 0.13s animation')
  ok(dropAnt.warningRemaining === 2, '18: the full real drop animation freezes the existing ant warning')
  realDrop.update(0.05)
  ok(Math.abs(dropAnt.warningRemaining - 1.95) < 1e-9, '18: ant warning resumes after manual drop settlement')

  const e = mk({ levelId: 1, noThreats: true })
  climb(e, 8, '18')
  const ant = spawnBite(e, 4)
  ant.state = 'windup'
  ant.warningRemaining = 2
  const initial = ant.warningRemaining
  for (const [reason, setup, cleanup] of [
    ['drop', () => { e.dropping = true }, () => { e.dropping = false }],
    ['auto', () => { e.autoRemaining = 1 }, () => { e.autoRemaining = 0 }],
    ['auto sequence', () => { e.autoSeqActive = true }, () => { e.autoSeqActive = false }],
    ['weather', () => { e.weather.current = { def: { id: 'wind' }, phase: 'active' } }, () => { e.weather.current = null }]
  ]) {
    setup(); e.antSystem.update(0.2); cleanup()
    ok(ant.warningRemaining === initial, `18: ${reason} freezes the full attack preview`)
  }
  e.antSystem.pause(); e.antSystem.update(0.2); e.antSystem.resume()
  ok(ant.warningRemaining === initial, '18: explicit pause freezes the warning')
  e.antSystem.setLayoutScale(0.5)
  e.antSystem.update(1.21)
  ok(ant.state === 'rehang' && ant.targetFloorId === null, '18: prolonged unreadable layout cancels the warning and visibly rehangs')
  e.antSystem.setLayoutScale(0.7)
  e.antSystem.update(0.4)
  ok(e.antSystem.layoutSafe(), '18: readable narrow layout resumes ant processing')

  const miss = mk({ levelId: 1, noThreats: true, inventory: { revive: 1 } })
  climb(miss, 4, '18-miss')
  const bitten = spawnBite(miss, 4)
  const queenInGroup = miss.antSystem.spawn('queen', { route: 'up', position: 3, personality: null, force: true })
  const cursor = miss.antSystem.cursorId
  miss.moving.cx = miss.blocks.at(-1).cx + miss.moving.width + miss.blocks.at(-1).width
  miss.tap(); step(miss, 12)
  ok(miss.status === 'reviveOffer' && bitten.hp === bitten.maxHp && miss.antSystem.cursorId === cursor, '18: zero-overlap Miss uses revive without shock or cursor movement')
  miss.antSystem.waveIndex = 1
  miss.antSystem.pendingWaveSpawns.push({ species: 'scout', groupSpecies: ['worker', 'scout'], groupId: 1, index: 1, due: miss.time + 1, source: 'wave' })
  miss.antSystem.pendingQueenReinforcements.push({ queenId: queenInGroup.id, remaining: 0.8 })
  miss.acceptRevive()
  ok(miss.status === 'playing' && bitten.state === 'recover' && bitten.hp === bitten.maxHp && bitten.hitCount === 0 && bitten.targetFloorId === null, '18: revive preserves ant HP/route history and clears attack locks')
  ok(miss.antSystem.waveIndex === 1 && miss.antSystem.pendingWaveSpawns.length === 1 && miss.antSystem.pendingWaveSpawns[0].due >= miss.time + 6 && miss.antSystem.pendingQueenReinforcements.length === 1 && miss.antSystem.pendingQueenReinforcements[0].remaining >= 6, '18: revive preserves triggered wave slots and queen cue behind the normal six-second cooldown')
  const recoverTo = bitten.recoverTo
  miss.antSystem.update(1)
  ok(Math.abs(bitten.position - recoverTo) < 1e-6 && bitten.recoveryRemaining > 1.4, '18: ants retreat about 2.5 layers during the 2.5s regroup')
  miss.antSystem.update(1.6)
  ok(bitten.state === 'wait', '18: ant regroups before reselecting a target')

  const final = mk({ levelId: 1, noThreats: true })
  climb(final, final.level.target - 1, '18-final')
  const finalAnt = spawnBite(final, final.floors - 1)
  final.moving.cx = final.blocks.at(-1).cx
  final.tap(); step(final, 12)
  ok(final.status === 'win' && final.antSystem.ants.length === 0 && finalAnt.hp === finalAnt.maxHp, '18: target-layer victory clears ants immediately without a final shock')
}

console.log('— 19. 冰雹保留楼层效果，但不伤蚂蚁')
{
  const pet = createPetSnapshot('rivetHound', { rivetHound: { owned: true, star: 5, level: 1 } })
  const e = mk({ levelId: 4, noThreats: true, pet })
  climb(e, 30, '19')
  const ant = spawnBite(e, 10)
  const top = e.blocks[e.blocks.length - 1]
  const width0 = top.width
  const durability0 = top.durability
  e.weather._hitHail(4)
  ok(Math.abs(width0 - top.width - 4) < 0.001, `19: hail width reduction is unchanged (${width0} -> ${top.width})`)
  ok(Math.abs(durability0 - top.durability) < 0.001 && ant.hp === ant.maxHp && ant.state === 'bite', '19: hail does not damage tower durability or ants')
  ok(e.petRuntime.tryBlockFatalEvent === undefined && e.petRuntime.tryConsumeCutShield() === false, '19: retired hound event intercept and ant-shield hooks are absent')
  ok(!Object.hasOwn(e.petRuntime.effects, 'chargeEveryEvents') && !Object.hasOwn(e.petRuntime.effects, 'eventBonusCoins'), '19: retired event charge/coin bonuses are absent')
}

console.log('— 20. 随机完美、护盾与自动层不升级蚁伤品质')
{
  const pet = createPetSnapshot('rivetHound', { rivetHound: { owned: true, star: 5, level: 1 } })
  const e = mk({ levelId: 1, noThreats: true, pet, inventory: { shield: 1 } })
  climb(e, 8, '20-shield')
  const ants = [spawnBite(e, 7), spawnBite(e, 5), spawnBite(e, 3)]
  e.moving.cx = e.blocks.at(-1).cx + 20
  e.tap(); step(e, 12)
  ok(e.antSystem.lastLandingQuality === 'Good' && ants.map((ant) => ant.hp).join(',') === '10,10,12', '20: raw Good geometry remains a two-floor shock despite shield protection')

  const unity = mk({ levelId: 1, noThreats: true, skills: { unity: 100 } })
  climb(unity, 8, '20-unity')
  const unityAnts = [spawnBite(unity, 7), spawnBite(unity, 5), spawnBite(unity, 3)]
  unity.moving.cx = unity.blocks.at(-1).cx + 20
  unity.tap(); step(unity, 12)
  ok(unity.unityChance === 1 && unity.antSystem.lastLandingQuality === 'Good' && unityAnts.map((ant) => ant.hp).join(',') === '10,10,12', '20: randomized Unity perfection cannot upgrade shock quality')

  const auto = mk({ levelId: 1, noThreats: true })
  climb(auto, 6, '20-auto')
  const untouched = spawnBite(auto, 3)
  const serial = auto.antSystem.landingSeq
  auto._placeAuto('flame')
  ok(untouched.hp === untouched.maxHp && auto.antSystem.landingSeq === serial, '20: automatic layers never shock ants or move the scan cursor')

  const cat = createPetSnapshot('starCat', { starCat: { owned: true, star: 3, level: 1 } })
  ok(!Object.hasOwn(cat.effects, 'eventBonusCoins') && cat.effects.coinMult > 1, '20: star cat keeps ordinary coin multiplier but has no retired event salvage')
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
