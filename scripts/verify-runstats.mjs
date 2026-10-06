// runStats.js 单元校验：确认「材质 + 技能 + 道具 + 宠物」统一结算的产出
// 和历史公式（原先散落在 gameEngine 构造函数里的内联算式）完全一致，
// 并且新增/缺失加成来源都能在 describeRunStats() 的清单里看见。
import assert from 'node:assert/strict'
import { buildRunStats, describeRunStats } from '../src/core/runStats.js'
import { resolvePetEffects } from '../src/core/petSystem.js'
import { getMaterial } from '../src/data/materials.js'

// ---- 1. 空加成：应该完全等于历史基准值 ----
{
  const r = buildRunStats({ material: getMaterial('soil'), skills: {}, pet: null, inventory: {}, widenActive: false })
  assert.equal(r.initialWidthPoints, 100, '无技能/道具时地基宽度应为基础 100 点')
  assert.equal(r.perfectWindowPx, 10, '无技能/宠物时完美窗口应为基础 10px')
  assert.equal(r.speedMult, 1, '无「以静制动」时速度倍率应为 1')
  assert.equal(r.swayReduce, 0, '无「以静制动」时晃动降低应为 0')
  assert.equal(r.goldenBellChance, 0)
  assert.equal(r.unityChance, 0)
  assert.equal(r.pursuitChance, 0)
  assert.equal(r.midasMult, 1)
  assert.equal(r.petCoinMult, 1)
  assert.equal(r.preemptiveLv, 0)
}

// ---- 2. 技能 + 道具叠加：磐石根基 Lv5 + 加宽卡，应与历史公式 100×1.05×1.10 一致 ----
{
  const r = buildRunStats({ material: getMaterial('soil'), skills: { foundation: 5 }, widenActive: true })
  const expected = 100 * (1 + 5 * 0.01) * 1.1
  assert.ok(Math.abs(r.initialWidthPoints - expected) < 1e-9, `地基宽度应为 ${expected}，实得 ${r.initialWidthPoints}`)
}

// ---- 3. 明察秋毫 + 月岩兔：完美窗口应是两者倍率相乘 ----
{
  const moonRabbit = { id: 'moonRabbit', effects: resolvePetEffects('moonRabbit', 1, 3) }
  const r = buildRunStats({ material: getMaterial('soil'), skills: { insight: 10 }, pet: moonRabbit })
  const expected = 10 * (1 + 10 * 0.01) * (moonRabbit.effects.perfectWindowMult || 1)
  assert.ok(Math.abs(r.perfectWindowPx - expected) < 1e-9, `完美窗口应为 ${expected}，实得 ${r.perfectWindowPx}`)
}

// ---- 4. 点石成金 + 星辉猫：金币倍率分别保留，结算时由调用方自己相乘 ----
{
  const starCat = { id: 'starCat', effects: resolvePetEffects('starCat', 1, 4) }
  const r = buildRunStats({ material: getMaterial('soil'), skills: { midas: 10 }, pet: starCat })
  assert.ok(Math.abs(r.midasMult - 1.2) < 1e-9, '点石成金 Lv10 应为 ×1.2')
  assert.ok(r.petCoinMult >= 1, '星辉猫金币倍率应 >= 1')
}

// ---- 5. 以静制动：速度倍率与晃动降低应同时反映 ----
{
  const r = buildRunStats({ material: getMaterial('soil'), skills: { stillness: 10 } })
  assert.ok(Math.abs(r.speedMult - 0.9) < 1e-9, '以静制动 Lv10 速度应 ×0.9')
  assert.ok(Math.abs(r.swayReduce - 0.4) < 1e-9, '以静制动 Lv10 晃动降低应封顶在 40%（10×8%=80% 被 min(0.4,·) 截断）')
}

// ---- 6. 切除保护优先链：顺序必须固定为 心手合一 > 金钟罩 > 燧星狐护层 > 护盾卡 > 材质兜底 ----
{
  const emberFox = { id: 'emberFox', effects: resolvePetEffects('emberFox', 1, 5) }
  const r = buildRunStats({
    material: getMaterial('bronze'),
    skills: { unity: 5, goldenBell: 8 },
    pet: emberFox,
    inventory: { shield: 2 }
  })
  const ids = r.cutProtectionChain.map((c) => c.id)
  assert.deepEqual(ids, ['unity', 'goldenBell', 'emberFoxShield', 'shieldCard', 'materialToughness'])
  assert.ok(r.cutProtectionChain[0].active, '心手合一应激活')
  assert.ok(r.cutProtectionChain[1].active, '金钟罩应激活')
  assert.ok(r.cutProtectionChain[2].active, '燧星狐 5★ 护层应激活')
  assert.ok(r.cutProtectionChain[3].active, '携带护盾卡应激活')
  assert.ok(r.cutProtectionChain[4].active, '材质兜底永远存在')
  assert.ok(r.cutProtectionChain[4].retainPct > 0, '青铜韧性兜底比例应 > 0')
}

// ---- 7. describeRunStats 不应抛错，且要把每一条加成来源都列出来 ----
{
  const cloudWisp = { id: 'cloudWisp', name: '云母精灵', effects: resolvePetEffects('cloudWisp', 1, 5) }
  const r = buildRunStats({
    material: getMaterial('blackgold'),
    skills: { foundation: 3, insight: 4, stillness: 2, midas: 1, goldenBell: 1, unity: 1 },
    pet: cloudWisp,
    inventory: { shield: 1 },
    widenActive: true
  })
  const lines = describeRunStats(r)
  const text = lines.map((l) => l.text).join('\n')
  assert.ok(text.includes('磐石根基'), '清单应出现磐石根基')
  assert.ok(text.includes('加宽卡'), '清单应出现加宽卡')
  assert.ok(text.includes('明察秋毫'), '清单应出现明察秋毫')
  assert.ok(text.includes('以静制动'), '清单应出现以静制动')
  assert.ok(text.includes('心手合一'), '切除链应出现心手合一')
  assert.ok(text.includes('护盾卡'), '切除链应出现护盾卡')
  assert.ok(text.includes('材质韧性兜底'), '切除链应出现材质兜底')
}

console.log('runStats 单元校验通过：7 组断言全部符合预期。')
