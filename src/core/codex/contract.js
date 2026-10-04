// 图鉴的条目契约。
//
// 方块、敌人、伙伴三个模块的渲染方式完全不同：
//   方块  drawBlockFace(ctx, rect, art, state)   纯函数，canvas
//   敌人  drawAnt(ctx, opts)                      纯函数，canvas
//   伙伴  AnimatedPet.vue                         SVG 组件
// 所以不可能给它们一个统一的数据 schema。统一的是**条目契约**：
// 每个模块自己写一个适配器，把自家的东西翻成下面这个形状，
// 图鉴页面只认这个形状，不认识任何一个具体模块。
//
// 以后加「道具图鉴」只需要再写一个适配器，页面一行不用改。
//
// 条目：
// {
//   id, group, name, subtitle, blurb,
//   state:   'owned' | 'seen' | 'locked',
//   stats:   [{ key, label, value, text, better, isDefault }],
//   preview: { kind:'canvas', draw(ctx,w,h,t) } | { kind:'component', name, props },
//   scene:   { label, kind:'canvas', draw(ctx,w,h,t) },   // 大图：堆叠 / 场景
//   sounds:  [{ label, key, play() }]
// }

export const CODEX_STATES = Object.freeze({
  owned: { label: '已拥有', rank: 0 },
  seen: { label: '已遭遇', rank: 1 },
  locked: { label: '未解锁', rank: 2 }
})

// 同一组里所有条目共用同一套属性轴，否则没法横向比较。
// 轴的集合 = 这一组里任何一个条目用到过的轴的并集。
export function unifyStatAxes(entries) {
  const axes = []
  const seen = new Set()
  for (const entry of entries) {
    for (const stat of entry.stats || []) {
      if (seen.has(stat.key)) continue
      seen.add(stat.key)
      axes.push({ key: stat.key, label: stat.label, better: stat.better || 'high' })
    }
  }
  return axes
}

// 属性条的长度。
//
// 不用「值占最大值的比例」——那样默认值也会撑出半条，看着像有加成。
// 改成「相对默认值的优势」，默认值 = 空条，组内最强 = 满条。
// 空条本身就是信息：这个材质在这条轴上没有加成。
export function barRatios(entries, axes) {
  const best = {}
  for (const axis of axes) {
    let max = 0
    for (const entry of entries) {
      const stat = (entry.stats || []).find((s) => s.key === axis.key)
      if (stat) max = Math.max(max, advantage(stat))
    }
    best[axis.key] = max
  }
  return (stat) => {
    if (!stat) return 0
    const max = best[stat.key] || 0
    if (max <= 0) return 0
    return Math.max(0, Math.min(1, advantage(stat) / max))
  }
}

function advantage(stat) {
  const base = stat.base ?? 1
  if (base === 0) return stat.value
  const delta = stat.better === 'low' ? base - stat.value : stat.value - base
  return delta / Math.abs(base)
}

export function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const ra = CODEX_STATES[a.state]?.rank ?? 9
    const rb = CODEX_STATES[b.state]?.rank ?? 9
    if (ra !== rb) return ra - rb
    return (a.order ?? 0) - (b.order ?? 0)
  })
}
