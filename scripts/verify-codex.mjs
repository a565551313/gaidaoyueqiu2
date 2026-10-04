// 图鉴的回归测试。
//
// 图鉴最容易出的问题不是「写不出来」，是「慢慢和实际游戏对不上」：
// 预览自己画一套、属性手抄一份、音效另拼一个播放逻辑。
// 这三件事发生的时候页面照样好看，没有任何人会发现。
//
// 所以这一套测的全是**防漂移**：预览必须调真实渲染器、属性必须从 mods 生成、
// 音效必须是真实 SFX key、解锁状态必须来自存档。
import { readFileSync } from 'node:fs'
import { CODEX_GROUPS, groupData, codexProgress } from '../src/core/codex/index.js'
import { MATERIALS } from '../src/data/materials.js'
import { MOD_SPECS, describeMods } from '../src/data/blockMods.js'
import { materialSwatch } from '../src/core/codex/blocks.js'
import { MATERIAL_SFX, SFX } from '../src/core/audioTables.js'
import { ANT_SPECIES } from '../src/data/ants.js'
import { PETS } from '../src/data/pets.js'

let passed = 0
const failures = []
const check = (cond, label) => { cond ? passed++ : failures.push(label) }

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

// 一个什么都没解锁的存档，和一个解锁了一部分的存档
const emptyStore = { materials: { soil: true }, pets: {}, seen: {} }
const richStore = {
  materials: { soil: true, steel: true, blackgold: true },
  pets: { moonRabbit: { owned: true, level: 7, star: 2 } },
  seen: { enemies: { worker: true, queen: true } }
}

function recorder() {
  const log = []
  const grad = () => ({ addColorStop: () => log.push('stop') })
  const t = {
    createLinearGradient: () => { log.push('gradient'); return grad() },
    createRadialGradient: () => { log.push('gradient'); return grad() },
    measureText: () => ({ width: 8 }),
    canvas: { width: 300, height: 200 },
    _log: log
  }
  return new Proxy(t, {
    get(o, k) { if (k in o) return o[k]; if (typeof k !== 'string') return undefined; return (...a) => log.push(`${k}(${a.length})`) },
    set(o, k, v) { log.push(`${String(k)}=`); o[k] = v; return true }
  })
}

console.log('— 1. 三组都在，注册表驱动')
{
  check(CODEX_GROUPS.length === 3, 'three groups registered')
  check(CODEX_GROUPS.map((g) => g.id).join(',') === 'blocks,enemies,companions', 'groups are blocks / enemies / companions')
  for (const g of CODEX_GROUPS) {
    const d = groupData(g.id, richStore)
    check(d.entries.length > 0, `${g.id}: has entries`)
    check(d.entries.every((e) => e.id && e.name && e.state && e.preview), `${g.id}: every entry satisfies the contract`)
  }
  // 页面不该认识任何一个具体模块
  const page = src('../src/components/Codex.vue')
  check(!/data\/(materials|pets|ants)\.js/.test(page), 'the page imports no module data directly')
  check(/CODEX_GROUPS/.test(page), 'the tab bar is driven by the registry, so a new group needs no page change')
}

console.log('— 2. 预览必须调真实渲染器（不能另画一套）')
{
  const blocks = src('../src/core/codex/blocks.js')
  const enemies = src('../src/core/codex/enemies.js')
  check(/import \{ drawBlockFace \} from '\.\.\/blockArt\.js'/.test(blocks), 'block preview imports the real block renderer')
  check(/import \{ ANT_ART, drawAnt \} from '\.\.\/antArt\.js'/.test(enemies), 'enemy preview imports the real ant renderer')
  check(/drawBlockFace\(ctx, \{ x: -floorW \/ 2/.test(enemies), 'the ants chew a real rendered floor, so the size ratio matches the game')
  // 适配器里不许出现自己攒的绘制原语
  for (const [name, code] of [['blocks', blocks], ['enemies', enemies]]) {
    const body = code.replace(/^\/\/.*$/gm, '')
    check(!/ctx\.(createLinearGradient|arcTo|roundRect)\(/.test(body), `${name}: no hand-rolled block/ant drawing in the adapter`)
  }
  // 真的画得出东西
  for (const g of CODEX_GROUPS) {
    for (const entry of groupData(g.id, richStore).entries) {
      if (entry.preview.kind !== 'canvas') continue
      const ctx = recorder()
      let threw = null
      try { entry.preview.draw(ctx, 148, 64, 1.2) } catch (err) { threw = err }
      check(threw === null, `${entry.id}: preview draws without throwing (${threw && threw.message})`)
      check(ctx._log.length > 8, `${entry.id}: preview actually draws something`)
    }
  }
}

// 渲染器的选项名写错是这套东西最阴的失败方式：`drawAnt` 内部是 `o.walk || 0`，
// 传成 `state:'walk'` 既不抛错也不产生 NaN，只是蚂蚁从此一动不动。
// 所以直接比对「渲染器读了哪些选项」和「适配器传了哪些选项」。
{
  const artSrc = src('../src/core/antArt.js')
  const fnBody = artSrc.slice(artSrc.indexOf('export function drawAnt'))
  const known = new Set([...fnBody.matchAll(/\bo\.([A-Za-z_]\w*)/g)].map((m) => m[1]))
  check(known.has('walk') && known.has('bite') && known.has('onSurface'), 'drawAnt option names were discovered from its source')

  const adapter = src('../src/core/codex/enemies.js')
  for (const call of adapter.matchAll(/drawAnt\(ctx, \{([\s\S]*?)\}\)/g)) {
    const passed = [...call[1].matchAll(/^\s*([A-Za-z_]\w*)\s*:/gm)].map((m) => m[1])
    check(passed.length > 0, 'the drawAnt call site was parsed')
    for (const name of passed) check(known.has(name), `drawAnt has no "${name}" option — the adapter is passing something the renderer ignores`)
  }
  // 两处调用都必须真的驱动步态/啃咬，否则图鉴里是一只标本
  check(/walk:/.test(adapter) && /bite:/.test(adapter), 'the codex drives gait and bite, so the ants are animated like in game')
  check(/onSurface: true/.test(adapter), 'the scene marks the ants as pressed against the floor face')
}

// 顺带守一道 NaN：坐标算错时至少别把 NaN 喂进画布。
// （注意这道抓不住上面那类参数名错误，drawAnt 用 `|| 0` 自我兜底了。）
{
  for (const g of CODEX_GROUPS) {
    for (const entry of groupData(g.id, richStore).entries) {
      for (const [slot, p] of [['preview', entry.preview], ['scene', entry.scene]]) {
        if (p.kind !== 'canvas') continue
        const bad = []
        const ctx = new Proxy({
          createLinearGradient: () => ({ addColorStop() {} }),
          createRadialGradient: () => ({ addColorStop() {} }),
          measureText: () => ({ width: 8 })
        }, {
          get(o, k) {
            if (k in o) return o[k]
            return (...a) => { if (a.some((v) => typeof v === 'number' && !Number.isFinite(v))) bad.push(k) }
          },
          set() { return true }
        })
        for (const t of [0, 0.4, 1.4, 3.1]) p.draw(ctx, 200, 150, t)
        check(bad.length === 0, `${entry.id}.${slot}: no NaN reaches the canvas (${bad.slice(0, 2).join(', ')})`)
      }
    }
  }
}

console.log('— 3. 方块堆叠预览（用户明确要求）')
{
  const d = groupData('blocks', richStore)
  for (const entry of d.entries) {
    check(entry.scene && entry.scene.kind === 'canvas', `${entry.id}: has a stacking scene`)
    const ctx = recorder()
    entry.scene.draw(ctx, 300, 190, 0.7)
    // 堆叠要画出多层：单块预览的调用量远少于一摞
    const single = recorder()
    entry.preview.draw(single, 148, 64, 0.7)
    check(ctx._log.length > single._log.length * 3, `${entry.id}: the scene really stacks several floors`)
  }
}

console.log('— 4. 属性必须从 mods 自动生成，不能手抄')
{
  const blocks = src('../src/core/codex/blocks.js')
  check(/statsOf\(/.test(blocks), 'block stats come from statsOf')
  const d = groupData('blocks', richStore)
  for (const material of MATERIALS) {
    const entry = d.entries.find((e) => e.id === `block:${material.id}`)
    for (const key of Object.keys(material.mods)) {
      const stat = entry.stats.find((s) => s.key === key)
      check(stat && stat.value === material.mods[key], `${material.id}.${key}: codex shows the real configured value`)
    }
    // 展示文案也走同一个生成器
    check(entry.effect === describeMods(material.mods), `${material.id}: blurb line is generated, not a hand-kept copy`)
  }
  // 轴是全组统一的，否则没法横向比较
  check(d.axes.length > 0 && d.entries.every((e) => d.axes.every((a) => e.stats.some((s) => s.key === a.key))),
    'every entry carries every axis in the group, so the bars line up')
  // 没加成的轴必须是空条，不能撑出半格
  const soil = d.entries.find((e) => e.id === 'block:soil')
  check(d.axes.every((a) => d.ratioOf(soil.stats.find((s) => s.key === a.key)) === 0),
    'a material with no bonuses shows empty bars, not half-full ones')
  // 每条轴都要声明哪边更好，否则条会往反方向填
  check(Object.values(MOD_SPECS).every((s) => s.better === 'high' || s.better === 'low'),
    'every mod declares which direction is good for the player')
}

console.log('— 5. 音效必须是真实的 SFX key 和真实的播放入口')
{
  const d = groupData('blocks', richStore)
  for (const material of MATERIALS) {
    const entry = d.entries.find((e) => e.id === `block:${material.id}`)
    check(entry.sounds.length === 2, `${material.id}: has land + cut`)
    const keys = entry.sounds.map((s) => s.key)
    check(keys[0] === MATERIAL_SFX[material.id].landKey && keys[1] === MATERIAL_SFX[material.id].cutKey,
      `${material.id}: sound keys come from MATERIAL_SFX`)
    for (const key of keys) check(Object.hasOwn(SFX, key), `${material.id}: ${key} is a real sampled effect`)
  }
  // 播放走的是局内那两个公开入口，不是另拼一套
  const blocks = src('../src/core/codex/blocks.js')
  check(/Audio\.setMaterial\(materialId\); Audio\.drop\(\)/.test(blocks), 'land preview calls the same entry point the game calls')
  check(/Audio\.setMaterial\(materialId\); Audio\.cut\(\)/.test(blocks), 'cut preview calls the same entry point the game calls')
  check(!/_sample\(/.test(blocks), 'the adapter does not reach into the private sampler')
}

// 商店橱窗必须和局内同源。以前这里是五条手写 CSS 色块，
// 改了方块画法不会有任何东西提醒你橱窗已经对不上了。
{
  const shop = src('../src/components/Shop.vue')
  check(/import \{ materialSwatch \} from '\.\.\/core\/codex\/blocks\.js'/.test(shop), 'the shop renders materials with the real renderer')
  check(!/material-swatch-(soil|concrete|steel|bronze|blackgold)/.test(shop), 'no hand-kept CSS swatches are left to drift')
  for (const material of MATERIALS) {
    const ctx = recorder()
    let threw = null
    try { materialSwatch(material.id)(ctx, 64, 52, 0) } catch (err) { threw = err }
    check(threw === null && ctx._log.length > 8, `${material.id}: shop swatch draws (${threw && threw.message})`)
  }
  check(materialSwatch('soil') !== materialSwatch('steel'), 'each material gets its own swatch')
}

console.log('— 6. 解锁状态来自存档')
{
  const poor = groupData('blocks', emptyStore)
  const rich = groupData('blocks', richStore)
  check(poor.unlocked === 1 && rich.unlocked === 3, `owned materials drive block unlocks (${poor.unlocked} / ${rich.unlocked})`)
  check(poor.entries.find((e) => e.id === 'block:steel').state === 'locked', 'an unbought material is locked')
  check(rich.entries.find((e) => e.id === 'block:steel').state === 'owned', 'a bought material is owned')

  // 敌人没有「拥有」，只有「遭遇过」
  const enemies = groupData('enemies', richStore)
  check(enemies.entries.find((e) => e.id === 'enemy:worker').state === 'seen', 'an encountered ant reads as seen, not owned')
  check(enemies.entries.find((e) => e.id === 'enemy:scout').state === 'locked', 'an ant never met stays locked')
  check(enemies.entries.every((e) => e.state !== 'owned'), 'you never "own" an ant')
  check(ANT_SPECIES.soldier && enemies.entries.length === Object.keys(ANT_SPECIES).length, 'every species has an entry')

  const pets = groupData('companions', richStore)
  check(pets.entries.find((e) => e.id === 'companion:moonRabbit').state === 'owned', 'an owned pet reads as owned')
  check(pets.entries.length === PETS.length, 'every pet has an entry')

  const progress = codexProgress(richStore)
  check(progress.total === MATERIALS.length + Object.keys(ANT_SPECIES).length + PETS.length, 'progress counts all three groups')
  check(progress.unlocked === 3 + 2 + 1, `progress counts unlocked across groups (${progress.unlocked})`)
}

console.log('— 7. 锁住的条目不能泄漏内容')
{
  const page = src('../src/components/Codex.vue')
  check(/entry\.state === 'locked' \? '\?\?\?' : entry\.name/.test(page), 'a locked entry hides its name')
  check(/v-if="entry\.state === 'locked'"[\s\S]{0,200}?card-locked/.test(page), 'a locked entry shows a lock instead of the preview')
  check(/e\.state !== 'locked'\) \|\| null/.test(page), 'a locked entry cannot be opened even by id')
}

console.log('— 8. 核心逻辑不依赖存档层')
{
  // 蚂蚁的遭遇记录走引擎回调。直接 import store 会让任何 import 过引擎的测试
  // 在 mock 存档之前就把 store 初始化掉（verify-chapter 就是这么挂的）。
  const antSystem = src('../src/core/antSystem.js')
  check(!/from '\.\/store\.js'/.test(antSystem), 'antSystem does not import the save layer')
  check(/this\.engine\.onSeen\('enemies', speciesId\)/.test(antSystem), 'encounters are reported through an engine callback')
  const engine = src('../src/core/gameEngine.js')
  check(/this\.onSeen = opts\.onSeen \|\| \(\(\) => \{\}\)/.test(engine), 'the engine defaults the callback so core stays standalone')
  const view = src('../src/components/GameView.vue')
  check(/onSeen: \(group, id\) => actions\.markSeen\(group, id\)/.test(view), 'the app layer wires the callback to the save')
  for (const file of ['../src/core/codex/contract.js', '../src/core/codex/blocks.js', '../src/core/codex/enemies.js', '../src/core/codex/companions.js']) {
    check(!/store\.js/.test(src(file)), `${file.split('/').pop()}: adapters take the save as an argument instead of importing it`)
  }
}

if (failures.length) {
  console.log(`\n失败: ${failures.length}`)
  failures.forEach((f) => console.log('  ✗ ' + f))
  process.exit(1)
}
console.log(`\nCodex verification passed: ${passed} checks.`)
