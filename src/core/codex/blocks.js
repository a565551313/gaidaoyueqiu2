// 方块的图鉴适配器。
//
// 两条硬规则在这里兑现：
//   预览必须调真实渲染器 —— 用的是局内同一个 drawBlockFace，不是另画一套
//   属性必须从 mods 自动生成 —— 用的是 statsOf，不是手抄一份数字
// 这两条一旦绕过，图鉴就会和实战慢慢分叉，而且没人会发现。
import { MATERIALS } from '../../data/materials.js'
import { MOD_SPECS, statsOf } from '../../data/blockMods.js'
import { MATERIAL_SFX } from '../audioTables.js'
import { Audio } from '../audio.js'
import { drawBlockFace } from '../blockArt.js'
import { durabilityForWidth } from '../../data/ants.js'

const BLOCK_H = 28

// 这一组展示哪些属性轴：任何一个材质用到过的轴。
// 全部 10 条都列出来会让 5 个材质里有 7 条空轴，看着像坏了。
function activeKeys() {
  const keys = []
  for (const key of Object.keys(MOD_SPECS)) {
    if (MATERIALS.some((m) => Object.hasOwn(m.mods, key))) keys.push(key)
  }
  return keys
}

function statsFor(material, keys) {
  return statsOf(material.mods, keys).map((stat) => ({
    key: stat.key,
    label: stat.label,
    value: stat.value,
    base: stat.def,
    text: stat.isDefault ? '—' : stat.text,
    better: MOD_SPECS[stat.key].better,
    isDefault: stat.isDefault
  }))
}

// 单块预览：铺满给定矩形的一块方块。
function previewDraw(materialId, colors) {
  return (ctx, w, h) => {
    const bw = Math.min(w - 12, 150)
    const scale = Math.max(1, Math.min(3.2, (h - 10) / BLOCK_H))
    ctx.save()
    ctx.translate((w - bw) / 2, (h - BLOCK_H * scale) / 2)
    ctx.scale(1, scale)
    drawBlockFace(ctx, { x: 0, y: 0, w: bw, h: BLOCK_H },
      { colors, materialId, theme: 'dark' }, { index: 3 })
    ctx.restore()
  }
}

// 堆叠预览：用户明确要求图鉴要能看到方块堆起来是什么样。
// 同样走 drawBlockFace，连轻微的高空摇摆都按局内的方式算。
function sceneDraw(materialId, colors) {
  const widths = [132, 126, 118, 113, 105, 98, 92]
  return (ctx, w, h, t) => {
    const scale = Math.min(1.5, Math.max(0.85, h / (widths.length * BLOCK_H + 28)))
    ctx.save()
    ctx.translate(w / 2, h - 10)
    ctx.scale(scale, scale)
    widths.forEach((bw, i) => {
      const sway = Math.sin(t * 1.1 + i * 0.42) * (i * 0.55)
      const drift = ((i * 37) % 11) - 5
      const y = -(i + 1) * BLOCK_H
      drawBlockFace(ctx, { x: -bw / 2 + sway + drift * 0.6, y, w: bw, h: BLOCK_H },
        { colors, materialId, theme: 'dark' },
        { index: i, perfect: i === 3 })
    })
    ctx.restore()
  }
}

// 音效：不自己拼播放逻辑，直接调局内那两个公开入口。
// 这样图鉴里听到的就是实战里会响的，不可能对不上。
function soundsFor(materialId) {
  const sfx = MATERIAL_SFX[materialId] || {}
  return [
    {
      label: '落层',
      key: sfx.landKey,
      play() { Audio.setMaterial(materialId); Audio.drop() }
    },
    {
      label: '切除',
      key: sfx.cutKey,
      play() { Audio.setMaterial(materialId); Audio.cut() }
    }
  ]
}

export function blockEntries(store) {
  const keys = activeKeys()
  return MATERIALS.map((material, i) => {
    const owned = Boolean(store?.materials?.[material.id])
    return {
      id: `block:${material.id}`,
      group: 'blocks',
      order: i,
      name: material.name,
      subtitle: material.id === 'soil' ? '默认材质' : `${material.price} 金币`,
      blurb: material.desc,
      effect: material.effect,
      state: owned ? 'owned' : 'locked',
      stats: statsFor(material, keys),
      extras: [
        { label: '满宽耐久', value: String(durabilityForWidth(120, material.id)) },
        { label: '最窄耐久', value: String(durabilityForWidth(26, material.id)) }
      ],
      preview: { kind: 'canvas', draw: previewDraw(material.id, material.colors) },
      scene: { label: '堆叠预览', kind: 'canvas', draw: sceneDraw(material.id, material.colors) },
      sounds: soundsFor(material.id)
    }
  })
}

// 商店也用这一个入口。手写一套 CSS 色块意味着「橱窗里的样子」和
// 「落到塔上的样子」是两份独立维护的东西，迟早对不上。
export function materialSwatch(materialId) {
  const material = MATERIALS.find((m) => m.id === materialId) || MATERIALS[0]
  return previewDraw(material.id, material.colors)
}
