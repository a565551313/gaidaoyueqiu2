// 方块外观的回归测试。
//
// 这一套是新开的，因为重做视觉之前整个仓库对方块渲染**一条断言都没有**：
// 4 套 verify 全绿，但没有任何一条在看方块画成什么样。于是「材质只靠色相、
// soil 和 bronze 几乎同色」这种问题可以一直存在而测试永远是绿的。
//
// 这里测的是「玩家能不能看懂」，不是「像素有没有变」：
// 像素级快照一改美术就全红，没人会去维护；
// 下面每一条对应一个具体的可读性要求，改美术不该让它们变红。
import { readFileSync } from 'node:fs'
import { drawBlockFace } from '../src/core/blockArt.js'
import { MATERIALS } from '../src/data/materials.js'
import { BLOCK_H } from '../src/core/geometry.js'

let passed = 0
const failures = []
function check(cond, label) {
  if (cond) passed++
  else failures.push(label)
}

// 记录型 ctx：方法调用和属性赋值都按顺序记下来，用于比较「画了什么」。
function recorder() {
  const log = []
  const grad = () => ({ addColorStop: (p, c) => log.push(`stop:${c}`) })
  const target = {
    createLinearGradient: () => { log.push('gradient'); return grad() },
    createRadialGradient: () => { log.push('gradient'); return grad() },
    measureText: () => ({ width: 10 }),
    _log: log
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k]
      if (typeof k !== 'string') return undefined
      return (...a) => log.push(`${k}(${a.map((x) => (typeof x === 'number' ? x.toFixed(1) : String(x))).join(',')})`)
    },
    set(t, k, v) { log.push(`${String(k)}=${v}`); t[k] = v; return true }
  })
}

const RECT = { x: 0, y: 0, w: 110, h: BLOCK_H }
const artOf = (m) => ({ colors: m.colors, materialId: m.id, theme: 'dark' })
function trace(material, state = {}) {
  const ctx = recorder()
  drawBlockFace(ctx, RECT, artOf(material), { index: 3, ...state })
  return ctx._log
}

console.log('— 1. 纯函数：没有引擎也能画')
{
  // 图鉴要在没有 GameEngine 的页面里画出和局内一模一样的方块。
  // 只要这里能画，预览和实战就不可能分叉。
  const ctx = recorder()
  let threw = null
  try {
    drawBlockFace(ctx, RECT, { colors: ['#aabbcc', '#223344'], materialId: 'steel', theme: 'dark' }, { index: 1 })
  } catch (err) { threw = err }
  check(threw === null, `drawBlockFace runs without an engine (${threw && threw.message})`)
  check(ctx._log.length > 10, 'it actually draws something')

  const src = readFileSync(new URL('../src/core/blockArt.js', import.meta.url), 'utf8')
  check(!/\bthis\./.test(src), 'blockArt never touches `this` — nothing to bind, nothing to fake in the codex')
  check(!/import .*gameEngine/.test(src), 'blockArt does not import the engine')
}

console.log('— 2. 五种材质必须互相区分得开')
{
  // 旧实现里材质只换色相，soil 和 bronze、steel 和 blackgold 在 28px 下几乎一样。
  // 现在每种材质有自己的结构母题，所以「去掉颜色之后」也应该长得不一样。
  const shapeOf = (m) => trace(m).filter((op) => !op.startsWith('fillStyle=') && !op.startsWith('strokeStyle=')).join('|')
  const colorOf = (m) => trace(m).filter((op) => op.startsWith('fillStyle=') || op.startsWith('strokeStyle=')).join('|')
  for (let i = 0; i < MATERIALS.length; i++) {
    for (let j = i + 1; j < MATERIALS.length; j++) {
      const a = MATERIALS[i], b = MATERIALS[j]
      check(colorOf(a) !== colorOf(b), `${a.id} vs ${b.id}: different colours`)
      check(shapeOf(a) !== shapeOf(b), `${a.id} vs ${b.id}: different structure, not just a hue swap`)
    }
  }
}

console.log('— 3. 完美落层不再是永久金边')
{
  // 旧实现给每个完美层画一圈金色描边。14 层里 13 层完美时，
  // 满屏金边等于没有任何信号。现在只点亮端柱上的两盏灯。
  const normal = trace(MATERIALS[2])
  const perfect = trace(MATERIALS[2], { perfect: true })
  const added = perfect.length - normal.length
  check(added > 0, 'a perfect landing is still marked somehow')
  check(added <= 10, `the perfect marker is a small accent, not a whole outline (${added} extra ops)`)
  check(!perfect.some((op) => op.includes('rgba(255,224,130')), 'the old permanent gold stroke is gone')
}

console.log('— 4. 耐久条只在受损时出现')
{
  // 旧实现每层都常驻一条血条，14 层挂 14 条，没有任何一层在报警。
  const render = readFileSync(new URL('../src/core/gameRender.js', import.meta.url), 'utf8')
  check(/ratio < 1\) \{[\s\S]{0,400}?fillRect\(barX/.test(render), 'the durability bar is behind a ratio < 1 guard')
  // 受损方块必须比完好方块多画东西（裂纹）
  const healthy = trace(MATERIALS[2], { damage01: 1 })
  const hurt = trace(MATERIALS[2], { damage01: 0.3 })
  check(hurt.length > healthy.length, 'a damaged block shows cracks on its face')
}

console.log('— 5. 不再是糖块：没有整圈白描边 / 圆角')
{
  const ops = trace(MATERIALS[0])
  check(!ops.some((op) => op.includes('rgba(255,255,255,0.44)')), 'no full white perimeter stroke around every floor')
  check(!ops.some((op) => op.startsWith('arcTo(')), 'no rounded-rect silhouette (chamfered corners instead)')
  const src = readFileSync(new URL('../src/core/blockArt.js', import.meta.url), 'utf8')
  check(/function chamfer/.test(src), 'the silhouette is a chamfered engineering part')
}

console.log('— 6. 宽度必须一眼可读（这是个对齐游戏）')
{
  // 方块左右边界是玩家唯一的判断依据，任何装饰都不能把它糊掉。
  for (const w of [26, 40, 70, 120]) {
    const ctx = recorder()
    drawBlockFace(ctx, { x: 10, y: 0, w, h: BLOCK_H }, artOf(MATERIALS[4]), { index: 2 })
    const ops = ctx._log.join(' ')
    check(ops.includes(`(12.0,0.0,${(w - 4).toFixed(1)},1.0)`) || ops.includes('fillRect(12.0,0.0'),
      `width ${w}: the lit top edge spans the block so the landing surface is visible`)
  }
  // 窄到安全下限也不能画崩
  let threw = null
  try {
    const ctx = recorder()
    drawBlockFace(ctx, { x: 0, y: 0, w: 26, h: BLOCK_H }, artOf(MATERIALS[3]), { index: 9 })
  } catch (err) { threw = err }
  check(threw === null, `narrowest possible floor (26px) still renders (${threw && threw.message})`)
}

console.log('— 7. 死掉的贴图管线已经拆干净')
{
  // Kenney 墙砖是 70x70 的图，压到 28px 高之后完全看不出来，
  // window.png 更是加载进缓存后一次都没画过。
  const render = readFileSync(new URL('../src/core/gameRender.js', import.meta.url), 'utf8')
  const engine = readFileSync(new URL('../src/core/gameEngine.js', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  for (const [name, src] of [['gameRender', render], ['gameEngine', engine], ['main', main]]) {
    check(!src.includes('floorTextures'), `${name} no longer loads the invisible wall tiles`)
  }
  check(!render.includes('_drawKenneyFloor') && !render.includes('_drawMaterialTexture'),
    'the dead texture helpers are gone')
}

if (failures.length) {
  console.log(`\n失败: ${failures.length}`)
  failures.forEach((f) => console.log('  ✗ ' + f))
  process.exit(1)
}
console.log(`\nBlock art verification passed: ${passed} checks.`)
