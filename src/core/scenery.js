// 场景装饰系统（山体 / 建筑 / 植物）
// -------------------------------------------------------------
// 目标：让“从地面盖到月球”的过程有真实的纵深感。
//
// 分 5 个视差层，越远的层移动越慢、颜色越淡越偏天空色（空气透视），
// 越近的层移动越快、细节越多、颜色越实：
//
//   层级        视差系数   内容                         消失进度
//   远山        0.14      连绵山脉 + 雪顶              p 0.16 → 0.50
//   远景城市    0.28      灰蓝色天际线剪影              p 0.10 → 0.36
//   中景建筑    0.50      有窗格与屋顶细节的楼房        p 0.06 → 0.26
//   近景        1.00      小屋 / 松树 / 阔叶树 / 灌木   p 0.00 → 0.16
//   前景        1.35      画面最底部的大剪影（在塔之前） p 0.00 → 0.09
//
// 所有层都随本局进度 p（已盖层数 / 目标层数）淡出，
// 同时因为视差会一层层向画面下方滑走，最终“逐渐消失在视野”。

const W = 420
const H = 720

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const rnd = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

// 视差系数
const F_PEAK_BACK = 0.1
const F_PEAK_FRONT = 0.16
const F_FARCITY = 0.28
const F_MIDCITY = 0.5
const F_NEAR = 1
const F_FRONT = 1.35

// 淡出区间 [开始淡出的进度, 完全消失的进度]
const FADE = {
  peakBack: [0.22, 0.58],
  peakFront: [0.18, 0.52],
  farCity: [0.12, 0.4],
  midCity: [0.1, 0.32],
  near: [0.06, 0.26],
  front: [0.02, 0.12]
}

// 取屏幕某个 y 处的天空颜色（顶色与底色之间插值），用于空气透视
function skyAt(pal, y) {
  if (!pal) return [255, 255, 255]
  if (Array.isArray(pal)) return pal
  const t = clamp(y / H, 0, 1)
  return [
    Math.round(pal.top[0] + (pal.bot[0] - pal.top[0]) * t),
    Math.round(pal.top[1] + (pal.bot[1] - pal.top[1]) * t),
    Math.round(pal.top[2] + (pal.bot[2] - pal.top[2]) * t)
  ]
}

function fadeOf(range, p) {
  const [a, b] = range
  if (p <= a) return 1
  if (p >= b) return 0
  return 1 - (p - a) / (b - a)
}

// 滑到画面下缘时再补一层淡出，避免装饰“硬生生”被裁掉
function edgeFade(base) {
  return clamp((H + 90 - base) / 230, 0, 1)
}

export class Scenery {
  constructor(engine) {
    this.engine = engine
    this.dark = engine.theme === 'dark'
    this.t = 0
    this._build()
  }

  // ---------------- 生成 ----------------
  _build() {
    // 远山：两道山脊，后排更高更淡并带雪顶
    this.peaksBack = []
    for (let i = 0; i < 7; i++) {
      this.peaksBack.push({
        x: -60 + i * 90 + rnd(-22, 22),
        w: rnd(78, 130),
        h: rnd(120, 205),
        snow: true
      })
    }
    this.peaksFront = []
    for (let i = 0; i < 8; i++) {
      this.peaksFront.push({
        x: -50 + i * 74 + rnd(-18, 18),
        w: rnd(62, 104),
        h: rnd(62, 128),
        snow: Math.random() < 0.35
      })
    }

    // 远景城市：纯剪影天际线
    this.farCity = []
    let x = -30
    while (x < W + 40) {
      const w = rnd(16, 38)
      this.farCity.push({
        x,
        w,
        h: rnd(42, 148),
        spire: Math.random() < 0.28,
        step: Math.random() < 0.3
      })
      x += w + rnd(2, 9)
    }

    // 中景建筑：带窗格、屋顶水箱/天线
    this.midCity = []
    x = -34
    const midPalette = this.dark
      ? ['#2c3550', '#343e5d', '#283149', '#3a4466']
      : ['#8794bd', '#9aa6cb', '#7d8bb4', '#a7b2d4']
    while (x < W + 44) {
      const w = rnd(28, 56)
      const h = rnd(62, 205)
      const cols = Math.max(2, Math.round(w / 13))
      const rows = Math.max(3, Math.round(h / 17))
      const lit = []
      for (let i = 0; i < cols * rows; i++) lit.push(Math.random() < 0.42)
      this.midCity.push({
        x,
        w,
        h,
        cols,
        rows,
        lit,
        color: pick(midPalette),
        roof: pick(['tank', 'antenna', 'flat', 'slope']),
        blinkIdx: Math.floor(Math.random() * Math.max(1, cols * rows)),
        phase: rnd(0, 6.28)
      })
      x += w + rnd(6, 20)
    }

    // 近景：地面上的房子、树木、灌木、草丛
    // dy 表示“比地平线更靠近镜头多少”，越大越靠下也越大，形成地面纵深
    this.near = []
    const nearTypes = ['pine', 'tree', 'grass', 'bush', 'pine', 'house', 'tree', 'grass', 'tree', 'bush']
    for (let i = 0; i < 34; i++) {
      const type = nearTypes[i % nearTypes.length]
      const dy = rnd(2, 178)
      this.near.push({
        type,
        x: rnd(-40, W + 40),
        dy,
        s: 0.58 + (dy / 178) * 1.15,
        phase: rnd(0, 6.28),
        flip: Math.random() < 0.5 ? 1 : -1
      })
    }
    this.near.sort((a, b) => a.dy - b.dy)

    // 前景：贴着画面下缘的大剪影，最先滑出视野
    this.front = []
    for (let i = 0; i < 6; i++) {
      this.front.push({
        type: i % 2 === 0 ? 'bushBig' : 'pineBig',
        x: rnd(-50, W + 50),
        dy: rnd(240, 340),
        s: rnd(2.1, 3.4),
        phase: rnd(0, 6.28)
      })
    }
    this.front.sort((a, b) => a.dy - b.dy)
  }

  update(dt) {
    this.t += dt
  }

  // ---------------- 坐标 ----------------
  // 某个视差系数下“地平线”在屏幕上的 y
  _base(f) {
    return this.engine.parallaxBase(f)
  }

  // ---------------- 渲染入口 ----------------

  // 背景层：远山 → 远景城市 → 中景建筑（在云层与地面之前绘制）
  // haze 为当前天空底色 [r,g,b]，用来把每一层的底边溶进空气里（空气透视），
  // 否则地面滑走之后，远景会留下一条生硬的水平切边。
  renderBack(ctx, p, haze) {
    const bPeakB = this._base(F_PEAK_BACK)
    const bPeakF = this._base(F_PEAK_FRONT)
    const bFar = this._base(F_FARCITY)
    const bMid = this._base(F_MIDCITY)

    const aPeakB = fadeOf(FADE.peakBack, p) * edgeFade(bPeakB)
    const aPeakF = fadeOf(FADE.peakFront, p) * edgeFade(bPeakF)
    const aFar = fadeOf(FADE.farCity, p) * edgeFade(bFar)
    const aMid = fadeOf(FADE.midCity, p) * edgeFade(bMid)

    if (aPeakB > 0.01) {
      this._drawPeaks(ctx, this.peaksBack, bPeakB, aPeakB * 0.78, true)
      this._haze(ctx, bPeakB, aPeakB * 0.85, haze, 64)
    }
    if (aPeakF > 0.01) {
      this._drawPeaks(ctx, this.peaksFront, bPeakF, aPeakF * 0.92, false)
      this._haze(ctx, bPeakF, aPeakF * 0.8, haze, 58)
    }
    if (aFar > 0.01) {
      this._drawFarCity(ctx, bFar, aFar)
      this._haze(ctx, bFar, aFar * 0.7, haze, 50)
    }
    if (aMid > 0.01) {
      this._drawMidCity(ctx, bMid, aMid)
      this._haze(ctx, bMid, aMid * 0.5, haze, 40)
    }
  }

  // 底边空气透视：把该层的底部渐渐溶进“该高度上的天空色”
  _haze(ctx, base, alpha, haze, up) {
    if (!haze || alpha <= 0.01) return
    const [r, g, b] = skyAt(haze, base)
    const grad = ctx.createLinearGradient(0, base - up, 0, base + 34)
    grad.addColorStop(0, `rgba(${r},${g},${b},0)`)
    grad.addColorStop(0.72, `rgba(${r},${g},${b},${clamp(alpha * 0.9, 0, 1)})`)
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
    ctx.fillStyle = grad
    ctx.fillRect(-20, base - up, W + 40, up + 34)
  }

  // 近景层：地面上的植物与小屋（在地面之后、塔之前绘制）
  renderNear(ctx, p) {
    const base = this._base(F_NEAR)
    if (base > H + 120) return
    const a = fadeOf(FADE.near, p)
    if (a <= 0.01) return
    ctx.save()
    for (const it of this.near) {
      const y = base + it.dy
      if (y < -40 || y > H + 90) continue
      ctx.globalAlpha = a * edgeFade(y)
      if (ctx.globalAlpha <= 0.01) continue
      if (it.type === 'pine') this._drawPine(ctx, it.x, y, it.s, it.phase, false)
      else if (it.type === 'tree') this._drawTree(ctx, it.x, y, it.s, it.phase)
      else if (it.type === 'bush') this._drawBush(ctx, it.x, y, it.s, false)
      else if (it.type === 'house') this._drawHouse(ctx, it.x, y, it.s, it.flip)
      else this._drawGrass(ctx, it.x, y, it.s, it.phase)
    }
    ctx.restore()
  }

  // 前景层：最靠近镜头的大剪影（在塔之后绘制，营造纵深）
  renderFront(ctx, p) {
    const base = this._base(F_FRONT)
    if (base > H + 260) return
    const a = fadeOf(FADE.front, p)
    if (a <= 0.01) return
    ctx.save()
    for (const it of this.front) {
      const y = base + it.dy
      if (y < -20 || y > H + 240) continue
      ctx.globalAlpha = a * 0.95 * clamp((H + 230 - y) / 200, 0, 1)
      if (ctx.globalAlpha <= 0.01) continue
      if (it.type === 'pineBig') this._drawPine(ctx, it.x, y, it.s, it.phase, true)
      else this._drawBush(ctx, it.x, y, it.s, true)
    }
    ctx.restore()
  }

  // ---------------- 山体 ----------------
  _drawPeaks(ctx, peaks, base, alpha, far) {
    if (base < -260) return
    ctx.save()
    ctx.globalAlpha = alpha
    const body = far
      ? this.dark ? '#2b3252' : '#9fb4d8'
      : this.dark ? '#333b5c' : '#83a0cc'
    const shade = far
      ? this.dark ? '#232941' : '#8ba2c9'
      : this.dark ? '#282f4b' : '#6d89b6'
    const snowC = this.dark ? '#b8c4e6' : '#f4f8ff'

    for (const m of peaks) {
      // 山体
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.moveTo(m.x - m.w, base)
      ctx.lineTo(m.x, base - m.h)
      ctx.lineTo(m.x + m.w, base)
      ctx.closePath()
      ctx.fill()
      // 背光面
      ctx.fillStyle = shade
      ctx.beginPath()
      ctx.moveTo(m.x, base - m.h)
      ctx.lineTo(m.x + m.w, base)
      ctx.lineTo(m.x + m.w * 0.18, base)
      ctx.closePath()
      ctx.fill()
      // 雪顶
      if (m.snow) {
        const sh = m.h * 0.26
        const sw = m.w * 0.27
        ctx.fillStyle = snowC
        ctx.beginPath()
        ctx.moveTo(m.x, base - m.h)
        ctx.lineTo(m.x + sw, base - m.h + sh)
        ctx.lineTo(m.x + sw * 0.45, base - m.h + sh * 0.68)
        ctx.lineTo(m.x + sw * 0.12, base - m.h + sh * 1.08)
        ctx.lineTo(m.x - sw * 0.34, base - m.h + sh * 0.62)
        ctx.lineTo(m.x - sw * 0.72, base - m.h + sh * 1.02)
        ctx.lineTo(m.x - sw, base - m.h + sh)
        ctx.closePath()
        ctx.fill()
      }
    }
    ctx.restore()
  }

  // ---------------- 远景城市 ----------------
  _drawFarCity(ctx, base, alpha) {
    if (base < -200) return
    ctx.save()
    ctx.globalAlpha = alpha * 0.85
    ctx.fillStyle = this.dark ? '#242c47' : '#8b9cc4'
    for (const b of this.farCity) {
      const top = base - b.h
      if (b.step) {
        ctx.fillRect(b.x, top + 10, b.w, b.h - 10)
        ctx.fillRect(b.x + b.w * 0.2, top, b.w * 0.6, 12)
      } else {
        ctx.fillRect(b.x, top, b.w, b.h)
      }
      if (b.spire) {
        ctx.fillRect(b.x + b.w / 2 - 1, top - 14, 2, 15)
      }
    }
    // 窗点（很淡，只是暗示有灯）
    ctx.fillStyle = this.dark ? 'rgba(255,225,160,0.4)' : 'rgba(255,255,255,0.32)'
    for (const b of this.farCity) {
      const top = base - b.h
      for (let y = top + 8; y < base - 6; y += 12) {
        for (let x = b.x + 4; x < b.x + b.w - 3; x += 9) {
          if (((x * 7 + y * 13) | 0) % 5 === 0) ctx.fillRect(x, y, 2, 3)
        }
      }
    }
    ctx.restore()
  }

  // ---------------- 中景建筑 ----------------
  _drawMidCity(ctx, base, alpha) {
    if (base < -240) return
    ctx.save()
    ctx.globalAlpha = alpha
    for (const b of this.midCity) {
      const top = base - b.h
      if (top > 740) continue
      // 楼体
      const g = ctx.createLinearGradient(b.x, top, b.x + b.w, top)
      g.addColorStop(0, b.color)
      g.addColorStop(1, this.dark ? 'rgba(10,14,28,0.85)' : 'rgba(70,84,124,0.9)')
      ctx.fillStyle = g
      ctx.fillRect(b.x, top, b.w, b.h)
      // 顶部亮边
      ctx.fillStyle = this.dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)'
      ctx.fillRect(b.x, top, b.w, 2.5)

      // 屋顶细节
      ctx.fillStyle = this.dark ? '#1d2438' : '#6b78a4'
      if (b.roof === 'tank') {
        ctx.fillRect(b.x + b.w * 0.3, top - 9, b.w * 0.3, 9)
        ctx.fillRect(b.x + b.w * 0.28, top - 11, b.w * 0.34, 3)
      } else if (b.roof === 'antenna') {
        ctx.fillRect(b.x + b.w / 2 - 1, top - 20, 2, 20)
        ctx.fillStyle = '#ff6b6b'
        ctx.beginPath()
        ctx.arc(b.x + b.w / 2, top - 21, 1.8, 0, Math.PI * 2)
        ctx.fill()
      } else if (b.roof === 'slope') {
        ctx.beginPath()
        ctx.moveTo(b.x - 2, top)
        ctx.lineTo(b.x + b.w / 2, top - 12)
        ctx.lineTo(b.x + b.w + 2, top)
        ctx.closePath()
        ctx.fill()
      }

      // 窗格
      const padX = 4
      const padY = 6
      const cw = (b.w - padX * 2) / b.cols
      const ch = (b.h - padY * 2) / b.rows
      const ww = Math.max(2.2, cw * 0.56)
      const wh = Math.max(2.6, ch * 0.5)
      for (let r = 0; r < b.rows; r++) {
        for (let c = 0; c < b.cols; c++) {
          const idx = r * b.cols + c
          let on = b.lit[idx]
          // 一扇窗会缓慢闪烁，让城市有呼吸感
          if (idx === b.blinkIdx) on = Math.sin(this.t * 1.4 + b.phase) > 0
          ctx.fillStyle = on
            ? this.dark
              ? 'rgba(255,214,130,0.92)'
              : 'rgba(255,241,190,0.95)'
            : this.dark
              ? 'rgba(12,16,30,0.6)'
              : 'rgba(58,70,108,0.45)'
          ctx.fillRect(b.x + padX + c * cw + (cw - ww) / 2, top + padY + r * ch + (ch - wh) / 2, ww, wh)
        }
      }
    }
    ctx.restore()
  }

  // ---------------- 近景植物与小屋 ----------------
  _drawPine(ctx, x, base, s, phase, silhouette) {
    const sway = Math.sin(this.t * 1.1 + phase) * 1.6 * s
    const h = 46 * s
    const w = 17 * s
    ctx.save()
    ctx.translate(x, base)
    const dark1 = silhouette ? (this.dark ? '#101a2c' : '#22593c') : this.dark ? '#24603f' : '#2f8a56'
    const dark2 = silhouette ? (this.dark ? '#0b1120' : '#18442d') : this.dark ? '#1b4a31' : '#256f45'
    // 树干
    ctx.fillStyle = silhouette ? dark2 : this.dark ? '#4a3524' : '#7a5433'
    ctx.fillRect(-2 * s, -10 * s, 4 * s, 10 * s)
    // 三层树冠
    for (let i = 0; i < 3; i++) {
      const ty = -10 * s - i * (h / 3.6)
      const tw = w * (1 - i * 0.22)
      const th = h * (0.44 - i * 0.03)
      ctx.fillStyle = i % 2 === 0 ? dark1 : dark2
      ctx.beginPath()
      ctx.moveTo(sway * (i + 1) * 0.4, ty - th)
      ctx.lineTo(tw, ty)
      ctx.lineTo(-tw, ty)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  _drawTree(ctx, x, base, s, phase) {
    const sway = Math.sin(this.t * 1.3 + phase) * 2 * s
    ctx.save()
    ctx.translate(x, base)
    // 树干
    ctx.strokeStyle = this.dark ? '#4a3524' : '#7d5636'
    ctx.lineWidth = 3.4 * s
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(sway * 0.3, -12 * s, sway * 0.6, -20 * s)
    ctx.stroke()
    // 树冠（三团重叠）
    const leaf1 = this.dark ? '#2f6b45' : '#4aa96a'
    const leaf2 = this.dark ? '#245537' : '#3c8f58'
    const cx = sway * 0.7
    const cy = -26 * s
    ctx.fillStyle = leaf2
    ctx.beginPath()
    ctx.ellipse(cx - 8 * s, cy + 4 * s, 11 * s, 9.5 * s, 0, 0, Math.PI * 2)
    ctx.ellipse(cx + 9 * s, cy + 3 * s, 10 * s, 9 * s, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = leaf1
    ctx.beginPath()
    ctx.ellipse(cx, cy - 3 * s, 13 * s, 11.5 * s, 0, 0, Math.PI * 2)
    ctx.fill()
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.beginPath()
    ctx.ellipse(cx - 4 * s, cy - 7 * s, 5 * s, 3.4 * s, -0.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  _drawBush(ctx, x, base, s, silhouette) {
    ctx.save()
    ctx.translate(x, base)
    const c1 = silhouette ? (this.dark ? '#101a2c' : '#245e3f') : this.dark ? '#2b6346' : '#48a068'
    const c2 = silhouette ? (this.dark ? '#0b1120' : '#1a4830') : this.dark ? '#1f4c35' : '#3a8755'
    ctx.fillStyle = c2
    ctx.beginPath()
    ctx.ellipse(-8 * s, -4 * s, 9 * s, 7 * s, 0, 0, Math.PI * 2)
    ctx.ellipse(8 * s, -3.5 * s, 8.5 * s, 6.5 * s, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = c1
    ctx.beginPath()
    ctx.ellipse(0, -8 * s, 11 * s, 8.5 * s, 0, 0, Math.PI * 2)
    ctx.fill()
    if (!silhouette) {
      ctx.fillStyle = 'rgba(255,255,255,0.16)'
      ctx.beginPath()
      ctx.ellipse(-3 * s, -11 * s, 4 * s, 2.6 * s, -0.3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  _drawGrass(ctx, x, base, s, phase) {
    ctx.save()
    ctx.translate(x, base)
    ctx.strokeStyle = this.dark ? '#2f6b45' : '#4fae6d'
    ctx.lineWidth = 1.6 * s
    ctx.lineCap = 'round'
    for (let i = -2; i <= 2; i++) {
      const sway = Math.sin(this.t * 2 + phase + i) * 2 * s
      ctx.beginPath()
      ctx.moveTo(i * 3.4 * s, 0)
      ctx.quadraticCurveTo(i * 3.4 * s + sway * 0.5, -5 * s, i * 3.4 * s + sway, -9 * s)
      ctx.stroke()
    }
    // 小花
    ctx.fillStyle = this.dark ? '#c78fd8' : '#ffd166'
    ctx.beginPath()
    ctx.arc(4 * s, -9 * s, 1.7 * s, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  _drawHouse(ctx, x, base, s, flip) {
    ctx.save()
    ctx.translate(x, base)
    ctx.scale(flip, 1)
    const w = 34 * s
    const h = 24 * s
    const wallA = this.dark ? '#5a4a63' : '#f6e7cf'
    const wallB = this.dark ? '#453a52' : '#e2cfae'
    const roofA = this.dark ? '#8a4b46' : '#d8624f'
    const roofB = this.dark ? '#6d3a36' : '#b34a3c'

    // 墙体
    const g = ctx.createLinearGradient(-w / 2, -h, w / 2, 0)
    g.addColorStop(0, wallA)
    g.addColorStop(1, wallB)
    ctx.fillStyle = g
    ctx.fillRect(-w / 2, -h, w, h)
    // 屋顶
    ctx.fillStyle = roofA
    ctx.beginPath()
    ctx.moveTo(-w / 2 - 4 * s, -h)
    ctx.lineTo(0, -h - 15 * s)
    ctx.lineTo(w / 2 + 4 * s, -h)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = roofB
    ctx.beginPath()
    ctx.moveTo(0, -h - 15 * s)
    ctx.lineTo(w / 2 + 4 * s, -h)
    ctx.lineTo(w * 0.16, -h)
    ctx.closePath()
    ctx.fill()
    // 门
    ctx.fillStyle = this.dark ? '#33283c' : '#8a6a4a'
    ctx.fillRect(-w * 0.12, -h * 0.62, w * 0.24, h * 0.62)
    // 窗（夜里亮灯）
    ctx.fillStyle = this.dark ? 'rgba(255,214,130,0.95)' : '#9fd6f5'
    ctx.fillRect(-w * 0.42, -h * 0.78, w * 0.22, h * 0.3)
    ctx.fillRect(w * 0.2, -h * 0.78, w * 0.22, h * 0.3)
    // 烟囱与炊烟
    ctx.fillStyle = roofB
    ctx.fillRect(w * 0.24, -h - 20 * s, 5 * s, 10 * s)
    ctx.fillStyle = this.dark ? 'rgba(200,205,225,0.3)' : 'rgba(255,255,255,0.65)'
    for (let i = 0; i < 3; i++) {
      const tt = (this.t * 0.55 + i * 0.33) % 1
      ctx.globalAlpha = (1 - tt) * 0.7
      ctx.beginPath()
      ctx.arc(
        w * 0.265 + Math.sin(tt * 5 + i) * 4 * s,
        -h - 22 * s - tt * 26 * s,
        (2 + tt * 4) * s,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }
}

export const SCENERY_W = W
export { clamp as sceneryClamp, rnd as sceneryRnd }
