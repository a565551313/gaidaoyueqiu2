// 方块外观：纯函数，不依赖 GameEngine。
//
// 之所以是纯函数：图鉴要在没有引擎的页面里画出和局内一模一样的方块。
// 只要预览和实战共用这一个入口，图鉴就不可能画出「看起来对但其实不是」的东西。
//
// 美术方向「月球工程体」：整塔读成一座发射塔，每层是塔上的一个舱段，
// 而不是一摞各自独立的圆角糖块。三条规则撑起这个读法：
//   1. 方正切角，不要圆角；不要整圈白描边 —— 描边会把每层框成独立物件
//   2. 竖向结构件（端柱 / 中脊）贯穿整层高度，相邻层对齐后连成通柱
//   3. 顶亮底暗的硬边，让层与层之间读成「挤压成型的连续塔体」的接缝
//
// 材质不只换色相，每种给一个结构母题，缩到 28px 也能靠图形区分：
//   soil      月壤压实块 —— 哑光颗粒，无金属件，粗糙浇注边
//   concrete  月壤混凝土板 —— 竖向板缝，冷灰
//   steel     钢桁架段 —— 警示斜纹 + 铆钉
//   bronze    铜合金散热段 —— 竖向散热鳍片
//   blackgold 乌金导流段 —— 近黑复合材 + 发光金色导流条

// 材质母题。colors 仍由 data/materials.js 提供，这里只定义「长什么样」。
export const MATERIAL_MOTIF = {
  soil: { motif: 'regolith', metal: 0, grain: 0.5, hazard: false },
  concrete: { motif: 'panel', metal: 0.15, grain: 0.18, hazard: false },
  steel: { motif: 'truss', metal: 0.85, grain: 0, hazard: true },
  bronze: { motif: 'radiator', metal: 0.6, grain: 0.08, hazard: false },
  blackgold: { motif: 'conduit', metal: 0.45, grain: 0, hazard: false, glow: '#f0c357' }
}

export function motifOf(materialId) {
  return MATERIAL_MOTIF[materialId] || MATERIAL_MOTIF.soil
}

// —— 小工具 ——
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t)
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t)
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t)
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`
}

// 方正切角路径：工程件的轮廓，不是糖块的圆角。
function chamfer(ctx, x, y, w, h, c) {
  const k = Math.min(c, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + k, y)
  ctx.lineTo(x + w - k, y)
  ctx.lineTo(x + w, y + k)
  ctx.lineTo(x + w, y + h - k)
  ctx.lineTo(x + w - k, y + h)
  ctx.lineTo(x + k, y + h)
  ctx.lineTo(x, y + h - k)
  ctx.lineTo(x, y + k)
  ctx.closePath()
}

// 舱段：实心舱体 + 端柱 + 腰带数据条。
// 另外两个候选（桁架 / 装甲板）已出图比过，落选。桁架在整塔尺度下读成噪点、
// 方块显得空心；装甲板的中央楔子压住了方块中轴，而中轴正是对齐时要看的地方。
function drawModule(ctx, x, y, w, h, p) {
  const { c1, c2, mo, dark } = p
  const cap = Math.min(7, Math.max(3, w * 0.12))

  chamfer(ctx, x, y, w, h, 3)
  ctx.save()
  ctx.clip()

  // 舱体：顶亮底暗的硬分带，不用柔和渐变
  ctx.fillStyle = mix(c1, '#ffffff', mo.metal * 0.18)
  ctx.fillRect(x, y, w, h * 0.42)
  ctx.fillStyle = c2
  ctx.fillRect(x, y + h * 0.42, w, h * 0.58)
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.fillRect(x, y + h - 5, w, 5)

  drawMotif(ctx, x, y, w, h, p, cap)

  // 腰带：一条贯穿的深色数据带，把上下两段压住
  ctx.fillStyle = dark ? 'rgba(6,12,26,0.5)' : 'rgba(20,28,46,0.3)'
  ctx.fillRect(x, y + h * 0.42 - 1.5, w, 3)
  if (mo.metal > 0.3 && w > 34) {
    ctx.fillStyle = `rgba(120,200,255,${0.22 + mo.metal * 0.2})`
    for (let dx = x + cap + 4; dx < x + w - cap - 3; dx += 9) ctx.fillRect(dx, y + h * 0.42 - 0.5, 4, 1)
  }

  // 端柱：竖向结构件，相邻层对齐后连成通柱
  if (w > 22) {
    ctx.fillStyle = `rgba(0,0,0,${0.2 + mo.metal * 0.1})`
    ctx.fillRect(x, y, cap, h)
    ctx.fillRect(x + w - cap, y, cap, h)
    ctx.fillStyle = `rgba(255,255,255,${0.1 + mo.metal * 0.14})`
    ctx.fillRect(x + cap - 1, y, 1, h)
    ctx.fillRect(x + w - cap, y, 1, h)
    // 警示色只压在端柱最外侧 2.5px，整塔叠起来才不会糊成一片黄
    if (mo.hazard) {
      hazard(ctx, x, y + 2, 2.5, h - 4, 1)
      hazard(ctx, x + w - 2.5, y + 2, 2.5, h - 4, -1)
    }
    // 螺栓
    if (h >= 18) {
      ctx.fillStyle = `rgba(255,255,255,${0.26 + mo.metal * 0.2})`
      for (const by of [y + h * 0.26, y + h * 0.74]) {
        ctx.beginPath(); ctx.arc(x + cap / 2, by, 1.1, 0, 6.284); ctx.fill()
        ctx.beginPath(); ctx.arc(x + w - cap / 2, by, 1.1, 0, 6.284); ctx.fill()
      }
    }
  }
  ctx.restore()
  edges(ctx, x, y, w, h, p)
}

// —— 材质母题：缩到 28px 仍能靠图形区分 ——
function drawMotif(ctx, x, y, w, h, p, inset) {
  const { c1, c2, mo, seed } = p
  if (mo.motif === 'regolith') {
    // 月壤压实块：哑光颗粒，没有一条直线
    ctx.fillStyle = 'rgba(28,16,10,0.26)'
    const n = Math.max(5, Math.floor(w / 7))
    for (let i = 0; i < n; i++) {
      const px = x + ((seed + i * 37) % Math.max(4, w - 4)) + 2
      const py = y + 3 + ((seed * 3 + i * 19) % Math.max(4, h - 7))
      ctx.fillRect(px, py, 1.6, 1.6)
    }
    ctx.fillStyle = 'rgba(255,240,220,0.1)'
    for (let i = 0; i < n; i++) {
      const px = x + ((seed * 5 + i * 23) % Math.max(4, w - 4)) + 2
      const py = y + 3 + ((seed + i * 31) % Math.max(4, h - 7))
      ctx.fillRect(px, py, 1.2, 1.2)
    }
  } else if (mo.motif === 'panel') {
    // 混凝土板：竖向板缝
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let dx = x + inset + 10; dx < x + w - inset - 4; dx += 18) {
      ctx.moveTo(Math.round(dx) + 0.5, y + 2)
      ctx.lineTo(Math.round(dx) + 0.5, y + h - 2)
    }
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.beginPath()
    for (let dx = x + inset + 10; dx < x + w - inset - 4; dx += 18) {
      ctx.moveTo(Math.round(dx) + 1.5, y + 2)
      ctx.lineTo(Math.round(dx) + 1.5, y + h - 2)
    }
    ctx.stroke()
  } else if (mo.motif === 'radiator') {
    // 铜合金散热鳍片：密集竖纹
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let dx = x + inset + 3; dx < x + w - inset - 2; dx += 5) {
      ctx.moveTo(Math.round(dx) + 0.5, y + 4)
      ctx.lineTo(Math.round(dx) + 0.5, y + h - 4)
    }
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,214,160,0.2)'
    ctx.beginPath()
    for (let dx = x + inset + 4; dx < x + w - inset - 2; dx += 5) {
      ctx.moveTo(Math.round(dx) + 0.5, y + 4)
      ctx.lineTo(Math.round(dx) + 0.5, y + h - 4)
    }
    ctx.stroke()
  } else if (mo.motif === 'conduit') {
    // 乌金导流段：近黑底 + 发光金色导流条
    ctx.fillStyle = 'rgba(2,4,12,0.4)'
    ctx.fillRect(x, y, w, h)
    const gy = y + h * 0.3
    ctx.fillStyle = mo.glow
    ctx.globalAlpha = 0.9
    ctx.fillRect(x + inset, gy, Math.max(0, w - inset * 2), 1.4)
    ctx.globalAlpha = 0.35
    ctx.fillRect(x + inset, gy + 1.4, Math.max(0, w - inset * 2), 1)
    ctx.globalAlpha = 1
    if (w > 46) {
      ctx.fillStyle = mo.glow
      for (let dx = x + inset + 8; dx < x + w - inset - 6; dx += 20) {
        ctx.globalAlpha = 0.55
        ctx.fillRect(dx, y + h * 0.62, 5, 1.4)
      }
      ctx.globalAlpha = 1
    }
  } else if (mo.motif === 'truss') {
    // 钢：铆钉行
    if (w > 40) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      for (let dx = x + inset + 6; dx < x + w - inset - 4; dx += 11) {
        ctx.beginPath(); ctx.arc(dx, y + h * 0.22, 0.9, 0, 6.284); ctx.fill()
      }
    }
  }
}

// 警示斜纹
function hazard(ctx, x, y, w, h, dir) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.strokeStyle = 'rgba(247,188,42,0.75)'
  ctx.lineWidth = 2.4
  ctx.beginPath()
  for (let i = -h; i < w + h; i += 6) {
    ctx.moveTo(x + i, y + h)
    ctx.lineTo(x + i + dir * h, y)
  }
  ctx.stroke()
  ctx.restore()
}

// 顶亮底暗的硬边：层与层之间读成连续塔体的接缝，而不是各自的轮廓
function edges(ctx, x, y, w, h, p) {
  ctx.fillStyle = `rgba(255,255,255,${0.3 + p.mo.metal * 0.25})`
  ctx.fillRect(x + 2, y, Math.max(0, w - 4), 1)
  ctx.fillStyle = 'rgba(0,0,0,0.42)'
  ctx.fillRect(x + 2, y + h - 1, Math.max(0, w - 4), 1)
}

// 主入口。rect 是屏幕矩形，art 是解析好的外观（材质 colors + 类型 art），
// state 是运行时（受损 / 闪白 / 完美 / 积雪）。不碰 engine。
export function drawBlockFace(ctx, rect, art, state = {}) {
  const { x, y, w, h } = rect
  if (w <= 0) return
  const colors = art.colors || ['#b9794a', '#8e4d2f']
  const p = {
    c1: colors[0],
    c2: colors[1],
    mo: { ...motifOf(art.materialId), ...(art.motifOverride || {}) },
    dark: art.theme !== 'light',
    seed: ((state.index || 0) * 17) % 97
  }
  drawModule(ctx, x, y, w, h, p)

  // 受损：裂纹沿舱体走，不画血条
  if (state.damage01 != null && state.damage01 < 1) {
    const d = 1 - state.damage01
    ctx.save()
    chamfer(ctx, x, y, w, h, 3)
    ctx.clip()
    ctx.strokeStyle = `rgba(20,6,4,${0.3 + d * 0.45})`
    ctx.lineWidth = 1.2
    ctx.beginPath()
    const n = Math.ceil(d * 3)
    for (let i = 0; i < n; i++) {
      const cx0 = x + ((p.seed + i * 41) % Math.max(6, w - 10)) + 5
      ctx.moveTo(cx0, y + 3)
      ctx.lineTo(cx0 + (i % 2 ? 4 : -4), y + h * 0.5)
      ctx.lineTo(cx0 + (i % 2 ? -2 : 2), y + h - 3)
    }
    ctx.stroke()
    if (d > 0.6) {
      ctx.fillStyle = `rgba(255,96,60,${(d - 0.6) * 0.5})`
      ctx.fillRect(x, y, w, h)
    }
    ctx.restore()
  }

  // 完美落层：端柱亮一盏绿灯，而不是整圈金边。
  // 旧实现 14 层会挂 13 圈金边，信号等于没有。
  if (state.perfect) {
    const cap = Math.min(7, Math.max(3, w * 0.12))
    ctx.fillStyle = '#8ef0b4'
    ctx.beginPath(); ctx.arc(x + cap / 2, y + h * 0.5, 1.6, 0, 6.284); ctx.fill()
    ctx.beginPath(); ctx.arc(x + w - cap / 2, y + h * 0.5, 1.6, 0, 6.284); ctx.fill()
  }

  if (state.snow) {
    ctx.fillStyle = 'rgba(238,246,244,0.8)'
    ctx.fillRect(x + 2, y, Math.max(0, w - 4), 2)
  }

  if (state.flash > 0) {
    ctx.save()
    chamfer(ctx, x, y, w, h, 3)
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.75, state.flash)})`
    ctx.fill()
    ctx.restore()
  }
}
