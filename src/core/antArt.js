// 蚂蚁造型绘制
// -------------------------------------------------------------
// 旧实现：两个重叠椭圆 fill 成一坨 + 6 根完全静止的折线腿，约 16×6 px，
// 四个兵种只有颜色不同 —— 看不出是蚂蚁。
//
// 这里重做为「背视图（俯视）」的标准蚂蚁剪影：
//   头（含上颚 + 复眼 + 肘状触角） — 细腰 — 胸节 — 腹部（gaster）
//   6 条两段式关节腿，三角步态（tripod gait）交替摆动
//   兵种差异体现在体型比例、上颚大小、甲片、翅膀、后冠上，而不只是换色
//
// 坐标系：局部 +X = 前进方向（头朝向），腿向 ±Y 两侧张开。
// 调用方负责 translate + rotate，把 +X 对准蚂蚁的朝向。

const TAU = Math.PI * 2

// ---------------- 颜色工具 ----------------
const hexCache = new Map()
function rgb(hex) {
  let v = hexCache.get(hex)
  if (v) return v
  let h = hex.replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = parseInt(h, 16)
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  hexCache.set(hex, v)
  return v
}
function mix(hex, target, t) {
  const [r, g, b] = rgb(hex)
  const [tr, tg, tb] = target
  return `rgb(${Math.round(r + (tr - r) * t)},${Math.round(g + (tg - g) * t)},${Math.round(b + (tb - b) * t)})`
}
const lighten = (hex, t) => mix(hex, [255, 248, 236], t)
const darken = (hex, t) => mix(hex, [18, 12, 20], t)

// ---------------- 兵种造型参数 ----------------
// 每个兵种的体型比例都不同，远看靠剪影就能区分：
//   工蚁 = 标准；斥候 = 瘦长 + 长腿 + 薄翅；
//   钳甲兵 = 粗壮 + 巨颚 + 背甲；蚁后 = 最大 + 翅 + 后冠 + 腹部条纹
export const ANT_ART = {
  worker: {
    scale: 1.12, gaster: [-7.2, 5.3, 4.1], waist: [-2.4, 1.35], thorax: [1.4, 3.5, 2.8], head: [6.6, 3.5, 3.2],
    legLen: 7.6, legSpread: 1.9, mandible: 2.7, gait: 9, wings: 0, crown: false, armor: false, bands: 0
  },
  scout: {
    scale: 1.05, gaster: [-7.4, 4.5, 3.3], waist: [-2.6, 1.1], thorax: [1.3, 3.0, 2.3], head: [6.2, 3.1, 2.8],
    legLen: 9.6, legSpread: 2.0, mandible: 2.2, gait: 13.5, wings: 1.15, crown: false, armor: false, bands: 0
  },
  soldier: {
    scale: 1.36, gaster: [-8.0, 6.1, 4.9], waist: [-2.6, 1.6], thorax: [1.6, 3.9, 3.2], head: [7.6, 4.9, 4.3],
    legLen: 7.8, legSpread: 2.3, mandible: 5.4, gait: 6.5, wings: 0, crown: false, armor: true, bands: 0
  },
  queen: {
    scale: 1.58, gaster: [-9.4, 7.6, 5.4], waist: [-2.8, 1.5], thorax: [1.8, 4.2, 3.4], head: [7.4, 4.1, 3.8],
    legLen: 8.4, legSpread: 2.1, mandible: 2.9, gait: 7, wings: 1, crown: true, armor: false, bands: 3
  }
}

function ellipse(ctx, cx, cy, rx, ry, rot = 0) {
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, rot, 0, TAU)
}

// ---------------- 单条腿 ----------------
// 两段式：基节 → 膝 → 跗节尖。三角步态让对角的三条腿同相位。
function drawLeg(ctx, ax, sign, art, phase, stroke, width) {
  const swing = Math.sin(phase) * art.legLen * 0.38
  const lift = Math.max(0, Math.cos(phase)) // 回摆时略微收腿
  const reach = 1 - 0.2 * lift
  const spread = art.legSpread
  const kneeX = ax + swing * 0.55
  const kneeY = sign * (spread + art.legLen * 0.52 * reach)
  const tipX = ax + swing * 1.45
  const tipY = sign * (spread + art.legLen * reach)
  ctx.beginPath()
  ctx.moveTo(ax, sign * spread * 0.55)
  ctx.quadraticCurveTo(ax + swing * 0.2, sign * (spread + art.legLen * 0.2), kneeX, kneeY)
  ctx.lineTo(tipX, tipY)
  ctx.lineWidth = width
  ctx.strokeStyle = stroke
  ctx.lineCap = 'round'
  ctx.stroke()
  // 跗节末端的小抓钩，强化"扒在塔壁上"的感觉
  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(tipX - swing * 0.3 - 1.1, tipY + sign * 0.9)
  ctx.lineWidth = width * 0.8
  ctx.stroke()
}

// ---------------- 上颚 ----------------
function drawMandibles(ctx, hx, hr, art, open, fill, line) {
  const m = art.mandible
  const spread = hr * 0.52 + open * m * 0.42
  for (const sign of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(hx + hr * 0.5, sign * hr * 0.45)
    ctx.quadraticCurveTo(hx + hr * 0.6 + m * 0.75, sign * (spread + m * 0.18), hx + hr * 0.35 + m, sign * spread * 0.55)
    ctx.quadraticCurveTo(hx + hr * 0.7 + m * 0.45, sign * (spread * 0.35), hx + hr * 0.45, sign * hr * 0.1)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
    ctx.lineWidth = 0.55
    ctx.strokeStyle = line
    ctx.stroke()
  }
}

// ---------------- 触角 ----------------
function drawAntennae(ctx, hx, hr, sway, stroke, width) {
  for (const sign of [-1, 1]) {
    const s = sway * sign
    ctx.beginPath()
    ctx.moveTo(hx + hr * 0.45, sign * hr * 0.35)
    ctx.quadraticCurveTo(hx + hr + 2.2, sign * (hr * 0.5 + 1.4) + s, hx + hr + 3.4, sign * (hr + 2.4) + s * 1.6)
    ctx.lineWidth = width
    ctx.strokeStyle = stroke
    ctx.lineCap = 'round'
    ctx.stroke()
  }
}

function drawWings(ctx, art, t, alpha) {
  const flutter = Math.sin(t * 22) * 0.1
  for (const sign of [-1, 1]) {
    ctx.save()
    ctx.translate(art.thorax[0] - 0.6, sign * 1.2)
    ctx.rotate(sign * (0.34 + flutter))
    ctx.globalAlpha = alpha
    const grad = ctx.createLinearGradient(0, 0, -art.gaster[1] * 2.4, 0)
    grad.addColorStop(0, 'rgba(232,251,255,0.8)')
    grad.addColorStop(0.6, 'rgba(206,240,251,0.4)')
    grad.addColorStop(1, 'rgba(188,230,246,0.1)')
    ctx.fillStyle = grad
    ellipse(ctx, -art.gaster[1] * 1.2, sign * art.gaster[2] * 0.62, art.gaster[1] * 1.45, art.gaster[2] * 0.5, 0)
    ctx.fill()
    ctx.strokeStyle = 'rgba(240,253,255,0.7)'
    ctx.lineWidth = 0.5
    ctx.stroke()
    // 翅脉
    ctx.beginPath()
    ctx.moveTo(-art.gaster[1] * 0.2, sign * art.gaster[2] * 0.5)
    ctx.lineTo(-art.gaster[1] * 2.5, sign * art.gaster[2] * 0.72)
    ctx.strokeStyle = 'rgba(236,252,255,0.38)'
    ctx.lineWidth = 0.35
    ctx.stroke()
    ctx.restore()
  }
}

/**
 * 绘制一只蚂蚁（局部坐标，+X 为朝向）。
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} o
 *   speciesId 兵种 | color 主色 | time 当前时间 | seed 个体随机种子
 *   walk 步态推进量（米／秒意义上的相位） | moving 是否在走
 *   bite 0~1 咬合开合量 | flash 0~1 受击白闪 | alpha 整体透明度
 */
export function drawAnt(ctx, o) {
  const art = ANT_ART[o.speciesId] || ANT_ART.worker
  const color = o.color || '#d47a45'
  const t = o.time || 0
  const seed = o.seed || 0
  const s = art.scale * (o.sizeScale || 1)

  const body = color
  const bodyLit = lighten(body, 0.42)
  const bodyDark = darken(body, 0.44)
  const line = darken(body, 0.66)

  ctx.save()
  ctx.scale(s, s)
  if (o.alpha != null) ctx.globalAlpha = o.alpha

  // ---- 落在塔壁上的接触阴影 ----
  ctx.save()
  ctx.globalAlpha = (o.alpha ?? 1) * 0.26
  ctx.fillStyle = '#05080f'
  ellipse(ctx, -1.5, 1.6, art.gaster[1] * 1.5, art.gaster[2] * 1.05, 0)
  ctx.fill()
  ctx.restore()

  const walk = o.walk || 0
  const legW = Math.max(0.75, 1.05 * (art.scale > 1.2 ? 1.15 : 1))
  const legStroke = darken(body, 0.3)

  // ---- 后侧三条腿（画在身体之前，形成层次）----
  const legAnchors = [art.thorax[0] + 2.0, art.thorax[0] - 0.2, art.thorax[0] - 2.4]
  for (let i = 0; i < 3; i++) {
    const phase = walk + Math.PI * ((i + 1) % 2) + seed
    drawLeg(ctx, legAnchors[i], -1, art, phase, legStroke, legW)
  }
  for (let i = 0; i < 3; i++) {
    const phase = walk + Math.PI * (i % 2) + seed
    drawLeg(ctx, legAnchors[i], 1, art, phase, legStroke, legW)
  }

  if (art.wings) drawWings(ctx, art, t + seed, art.wings * 0.9)

  // ---- 腹部 gaster ----
  const bob = Math.sin(walk * 2 + seed) * 0.25
  const [gx, grx, gry] = art.gaster
  const gGrad = ctx.createLinearGradient(gx, -gry, gx, gry)
  gGrad.addColorStop(0, bodyLit)
  gGrad.addColorStop(0.45, body)
  gGrad.addColorStop(1, bodyDark)
  ellipse(ctx, gx, bob, grx, gry, -0.06)
  ctx.fillStyle = gGrad
  ctx.fill()
  ctx.lineWidth = 0.6
  ctx.strokeStyle = line
  ctx.stroke()
  // 腹部环节纹（蚁后更明显）
  const bands = art.bands || 2
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(gx, bob, grx, gry, -0.06, 0, TAU)
  ctx.clip()
  ctx.strokeStyle = darken(body, 0.3)
  ctx.lineWidth = art.crown ? 0.9 : 0.5
  ctx.globalAlpha = (o.alpha ?? 1) * (art.crown ? 0.75 : 0.45)
  for (let i = 1; i <= bands; i++) {
    const bx = gx - grx + (grx * 2 * i) / (bands + 1)
    ctx.beginPath()
    ctx.moveTo(bx, bob - gry)
    ctx.quadraticCurveTo(bx + 0.9, bob, bx, bob + gry)
    ctx.stroke()
  }
  ctx.restore()
  // 高光
  ctx.save()
  ctx.globalAlpha = (o.alpha ?? 1) * 0.34
  ctx.fillStyle = lighten(body, 0.6)
  ellipse(ctx, gx - grx * 0.18, bob - gry * 0.5, grx * 0.32, gry * 0.17, -0.25)
  ctx.fill()
  ctx.restore()

  // ---- 细腰 petiole ----
  const [wx, wr] = art.waist
  ellipse(ctx, wx, bob * 0.6, wr, wr * 0.85, 0)
  ctx.fillStyle = bodyDark
  ctx.fill()

  // ---- 胸节 thorax ----
  const [tx, trx, try_] = art.thorax
  const tGrad = ctx.createLinearGradient(tx, -try_, tx, try_)
  tGrad.addColorStop(0, lighten(body, 0.3))
  tGrad.addColorStop(1, darken(body, 0.28))
  ellipse(ctx, tx, bob * 0.35, trx, try_, 0)
  ctx.fillStyle = tGrad
  ctx.fill()
  ctx.lineWidth = 0.6
  ctx.strokeStyle = line
  ctx.stroke()

  // 钳甲兵的背甲片
  if (art.armor) {
    ctx.save()
    ctx.globalAlpha = (o.alpha ?? 1) * 0.9
    ctx.fillStyle = darken(body, 0.18)
    for (const dx of [-1.6, 0.6]) {
      ellipse(ctx, tx + dx, bob * 0.35, trx * 0.46, try_ * 0.95, 0)
      ctx.fill()
      ctx.lineWidth = 0.45
      ctx.strokeStyle = line
      ctx.stroke()
    }
    ctx.restore()
  }

  // ---- 头 ----
  const [hx, hrx, hry] = art.head
  const bite = o.bite || 0
  drawMandibles(ctx, hx, hrx, art, bite, darken(body, 0.12), line)
  const hGrad = ctx.createLinearGradient(hx, -hry, hx, hry)
  hGrad.addColorStop(0, lighten(body, 0.34))
  hGrad.addColorStop(1, darken(body, 0.34))
  ellipse(ctx, hx, bob * 0.2, hrx, hry, 0)
  ctx.fillStyle = hGrad
  ctx.fill()
  ctx.lineWidth = 0.6
  ctx.strokeStyle = line
  ctx.stroke()

  // 复眼
  ctx.fillStyle = darken(body, 0.78)
  for (const sign of [-1, 1]) {
    ellipse(ctx, hx + hrx * 0.18, sign * hry * 0.56, hrx * 0.3, hry * 0.26, sign * 0.3)
    ctx.fill()
  }
  ctx.save()
  ctx.globalAlpha = (o.alpha ?? 1) * 0.85
  ctx.fillStyle = '#ffffff'
  for (const sign of [-1, 1]) {
    ellipse(ctx, hx + hrx * 0.3, sign * hry * 0.6, hrx * 0.1, hry * 0.09, 0)
    ctx.fill()
  }
  ctx.restore()

  drawAntennae(ctx, hx, hrx, Math.sin(t * 5.5 + seed) * 0.9 + bite * 1.1, darken(body, 0.24), Math.max(0.7, legW * 0.85))

  // 蚁后的后冠：戴在头顶（朝前的那一端）
  if (art.crown) {
    ctx.save()
    ctx.translate(hx + hrx * 0.15, bob * 0.2)
    ctx.rotate(Math.PI / 2)
    ctx.fillStyle = '#ffd98a'
    ctx.strokeStyle = '#a9762c'
    ctx.lineWidth = 0.42
    ctx.beginPath()
    const w = hrx * 0.82
    ctx.moveTo(-w, 0)
    ctx.lineTo(-w * 0.6, -2.0)
    ctx.lineTo(-w * 0.2, -0.5)
    ctx.lineTo(0, -2.4)
    ctx.lineTo(w * 0.2, -0.5)
    ctx.lineTo(w * 0.6, -2.0)
    ctx.lineTo(w, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  // ---- 受击白闪 ----
  if (o.flash > 0) {
    ctx.save()
    ctx.globalAlpha = Math.min(1, o.flash) * 0.8
    ctx.fillStyle = '#f4fbff'
    ellipse(ctx, gx, bob, grx * 1.08, gry * 1.08, -0.06); ctx.fill()
    ellipse(ctx, tx, bob * 0.35, trx * 1.1, try_ * 1.1, 0); ctx.fill()
    ellipse(ctx, hx, bob * 0.2, hrx * 1.1, hry * 1.1, 0); ctx.fill()
    ctx.restore()
  }

  ctx.restore()
}

/** 咬击时在头部前方迸出的碎屑火花（局部坐标） */
export function drawBiteSparks(ctx, o) {
  const art = ANT_ART[o.speciesId] || ANT_ART.worker
  const s = art.scale * (o.sizeScale || 1)
  const hx = (art.head[0] + art.head[1] + art.mandible * 0.8) * s
  const t = o.time || 0
  ctx.save()
  const pulse = 0.55 + 0.45 * Math.sin(t * 17 + (o.seed || 0))
  // 小而密的碎屑，贴着上颚尖端迸出
  ctx.globalAlpha = (0.35 + 0.45 * pulse)
  ctx.fillStyle = '#ffe9a8'
  for (let i = 0; i < 5; i++) {
    const a = -0.95 + i * 0.48 + Math.sin(t * 11 + i * 2.1) * 0.2
    const r = 1.2 + ((i * 7 + Math.floor(t * 9)) % 5) * 0.62 + pulse * 1.3
    ctx.beginPath()
    ctx.arc(hx * 0.9 + Math.cos(a) * r, Math.sin(a) * r, 0.5 + (i % 2) * 0.32, 0, TAU)
    ctx.fill()
  }
  ctx.globalAlpha = 0.22 + 0.26 * pulse
  ctx.strokeStyle = '#fff6cf'
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.arc(hx * 0.9, 0, 2.2 + pulse * 1.1, -0.95, 0.95)
  ctx.stroke()
  ctx.restore()
}
