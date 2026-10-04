// 敌人（蚁群）的图鉴适配器。
//
// 蚂蚁和方块的不同在于「拥有」没有意义——你不会买一只蚂蚁。
// 所以它的状态只有「已遭遇 / 未遭遇」：在局内真的见过这个兵种，图鉴才解锁。
// 遭遇记录由 antSystem 出生时写入 store.seen。
import { ANT_SPECIES, ANT_PERSONALITIES, ANT_PROTOTYPE_CONFIG } from '../../data/ants.js'
import { ANT_ART, drawAnt } from '../antArt.js'
import { drawBlockFace } from '../blockArt.js'
import { MATERIALS } from '../../data/materials.js'

const ORDER = ['worker', 'scout', 'soldier', 'queen']

const ROLE = {
  worker: '基础单位 · 随机挑层',
  scout: '高速单位 · 专挑高层',
  soldier: '重装单位 · 专挑残血层',
  queen: '首领单位 · 会召唤增援'
}

const BLURB = {
  worker: '数量最多的一种，爬得不快但从不停手。被打退一次就会重新挂绳。',
  scout: '翅鞘泛青的快腿兵，总往塔顶跑——越高的楼层越细，啃穿得越快。',
  soldier: '钳甲厚实，专找已经被啃过的楼层补刀，一口能啃掉四点耐久。',
  queen: '巢穴的核心。血厚、会持续召唤增援，打掉它整波攻势就会散。'
}

// 一口咬掉多少：durability / width 是分段表，总和才是一次完整啃咬的量。
const sum = (arr) => (arr || []).reduce((a, b) => a + b, 0)

function statsFor(species) {
  return [
    { key: 'hp', label: '血量', value: species.hp, base: 0, text: String(species.hp), better: 'high' },
    { key: 'climbSpeed', label: '攀爬速度', value: species.climbSpeed, base: 0, text: `${species.climbSpeed}x`, better: 'high' },
    { key: 'biteDurability', label: '啃耐久', value: sum(species.durability), base: 0, text: `${sum(species.durability)} / 轮`, better: 'high' },
    { key: 'biteWidth', label: '啃宽度', value: sum(species.width), base: 0, text: `${sum(species.width)} px / 轮`, better: 'high' }
  ]
}

// 步频住在 ANT_ART 里（渲染侧参数），不在 ANT_SPECIES（玩法侧数值）里。
const gaitOf = (id) => (ANT_ART[id] || ANT_ART.worker).gait

function previewDraw(species) {
  return (ctx, w, h, t) => {
    ctx.save()
    ctx.translate(w / 2, h / 2 + 4)
    ctx.scale(2.1, 2.1)
    // 局内同一个 drawAnt。步态靠 walk 相位推进、啃咬靠 bite 开合度，
    // 参数名必须和 antSystem._renderAnt 对齐，写错了不会报错、只会悄悄不动。
    drawAnt(ctx, {
      speciesId: species.id,
      color: species.color,
      time: t,
      seed: 3,
      walk: t * gaitOf(species.id),
      bite: 0
    })
    ctx.restore()
  }
}

// 场景图：蚂蚁趴在楼层正面啃——这是它在局内真正出现的样子。
const BLOCK_H = 28
const FLOOR_COLORS = (MATERIALS.find((m) => m.id === 'steel') || MATERIALS[0]).colors

function sceneDraw(species) {
  return (ctx, w, h, t) => {
    const cx = w / 2
    const cy = h / 2
    ctx.save()
    ctx.translate(cx, cy)
    const s = Math.min(2.6, h / 74)
    ctx.scale(s, s)
    // 内容在局部坐标里占 y≈[-14, 32]（蚂蚁身体在楼层面上方探出一截），
    // 把它的中点挪到画布中心，否则整组会偏下、上面空一大块。
    ctx.translate(0, -9)
    // 啃的是一层真方块，不是随手画的灰条：蚂蚁和层高的比例必须和局内一致，
    // 不然图鉴会让人误判这玩意儿有多大。BLOCK_H 和引擎同源。
    const floorW = Math.min(150, (w / s) - 8)
    drawBlockFace(ctx, { x: -floorW / 2, y: 4, w: floorW, h: BLOCK_H },
      { colors: FLOOR_COLORS, materialId: 'steel', theme: 'dark' },
      { index: 4, damage01: 0.45 + Math.sin(t * 1.3) * 0.18 })
    for (let i = 0; i < 3; i++) {
      const id = i * 7 + 1
      const bob = Math.sin(t * 5 + i * 1.7) * 0.4
      ctx.save()
      // 和 antSystem._renderAnt 一致：原点落在楼层正面的中心，蚂蚁是「趴在面上」
      // 而不是「站在顶上」，onSurface 才会给出那层压实的接触阴影。
      ctx.translate(-30 + i * 30, 4 + BLOCK_H / 2 + bob)
      drawAnt(ctx, {
        speciesId: species.id,
        color: species.color,
        time: t + i * 0.6,
        seed: id * 1.37,
        walk: (t + i) * gaitOf(species.id) * 0.22,
        bite: (0.5 + 0.5 * Math.sin(t * 17 + id)) ** 0.7,
        onSurface: true
      })
      ctx.restore()
    }
    ctx.restore()
  }
}

export function enemyEntries(store) {
  const seen = store?.seen?.enemies || {}
  return ORDER.map((id, i) => {
    const species = ANT_SPECIES[id]
    const met = Boolean(seen[id])
    return {
      id: `enemy:${id}`,
      group: 'enemies',
      order: i,
      name: species.name,
      subtitle: ROLE[id],
      blurb: BLURB[id],
      // 蚂蚁不存在「拥有」，只有遭遇过没有
      state: met ? 'seen' : 'locked',
      lockedHint: '在关卡中遭遇后解锁',
      stats: statsFor(species),
      extras: [
        { label: '目标偏好', value: { random: '随机', high: '高层优先', damaged: '残血优先' }[species.preference] || species.preference },
        { label: '同时在场上限', value: String(ANT_PROTOTYPE_CONFIG.maxAlive) }
      ],
      preview: { kind: 'canvas', draw: previewDraw(species) },
      scene: { label: '啃咬中', kind: 'canvas', draw: sceneDraw(species) },
      sounds: []
    }
  })
}

export const ANT_PERSONALITY_LIST = Object.values(ANT_PERSONALITIES)
