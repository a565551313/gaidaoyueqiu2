// 天气表现层
// -------------------------------------------------------------
// 旧实现的问题：
//   雨  = 单层 1.4px 直线，无溅射、无景深
//   雹  = 纯白圆点，不旋转、不反弹、砸中没反馈
//   雪  = 全场仅 14 个圆点，而且被夹在左右两条窄边里，画面中间空着
//   风  = 空中什么都没有，只有一个固定在 (62,180) 的静止旗子
//   云  = 几个扁平半透明椭圆，没有体积
//   雷  = 一条不分叉的折线
//
// 这里把每种天气都做成「有景深分层 + 有运动 + 有受击反馈」的粒子场。
// 所有效果都按 420×720 逻辑画布设计，绘制时按层批量 stroke/fill 以控制开销。

const TAU = Math.PI * 2
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// 轻量可复现随机：同一关卡的天气表现稳定，不会每帧抖动
function makeRng(seed) {
  let s = (seed >>> 0) || 1
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    return ((s >>> 0) / 0x100000000)
  }
}

// =============================================================
// 雨：三层景深 + 风切斜角 + 落地溅射 + 偶发雨幕
// =============================================================
const RAIN_LAYERS = [
  { n: 116, speed: 560, len: [7, 13], w: 0.8, alpha: 0.26, tint: '170,198,228' },
  { n: 104, speed: 840, len: [15, 25], w: 1.25, alpha: 0.42, tint: '198,224,250' },
  { n: 64, speed: 1150, len: [26, 42], w: 2, alpha: 0.6, tint: '226,243,255' }
]

export class RainField {
  constructor(seed = 7) {
    this.rnd = makeRng(seed)
    this.layers = RAIN_LAYERS.map((cfg) => ({
      cfg,
      drops: Array.from({ length: cfg.n }, () => this._mk(cfg))
    }))
    this.splashes = []
    this.sheets = []
    this.sheetT = 1.5
    this.level = 0
  }

  _mk(cfg, atTop = false) {
    const r = this.rnd
    return {
      x: r() * 560 - 70,
      y: atTop ? -r() * 160 : r() * 760,
      len: cfg.len[0] + r() * (cfg.len[1] - cfg.len[0]),
      v: cfg.speed * (0.85 + r() * 0.3)
    }
  }

  // intensity 0~1；dir 风向（-1~1）；impact 为塔顶 {y,x0,x1}，只有落在塔顶上的雨滴才溅开
  update(dt, { intensity = 0, dir = 0, impact = null } = {}) {
    this.level += (intensity - this.level) * Math.min(1, dt * 2.2)
    const k = this.level
    this.dir = dir
    if (k < 0.01) { this.splashes.length = 0; return }
    const shear = dir * 240 * (0.5 + k)
    for (const layer of this.layers) {
      const active = Math.ceil(layer.cfg.n * clamp(0.25 + k, 0, 1))
      for (let i = 0; i < layer.drops.length; i++) {
        const d = layer.drops[i]
        if (i >= active) continue
        d.y += d.v * dt * (0.7 + 0.5 * k)
        d.x += shear * dt
        const hitTower = impact && d.y >= impact.y && d.y - d.v * dt < impact.y && d.x > impact.x0 && d.x < impact.x1
        if (d.y > 744 || hitTower || d.x < -110 || d.x > 520) {
          if ((hitTower || d.y > 744) && layer.cfg.w > 1 && this.splashes.length < 54 && this.rnd() < 0.5) {
            this._splash(d.x, hitTower ? impact.y : 738)
          }
          Object.assign(d, this._mk(layer.cfg, true))
        }
      }
    }
    // 雨幕：一道半透明斜带扫过，强化"下大了"的体感
    this.sheetT -= dt
    if (this.sheetT <= 0 && k > 0.35) {
      this.sheetT = 2.2 + this.rnd() * 3
      this.sheets.push({ x: dir >= 0 ? -220 : 640, life: 1.5, max: 1.5, v: (dir >= 0 ? 1 : -1) * (320 + this.rnd() * 180) })
    }
    for (let i = this.sheets.length - 1; i >= 0; i--) {
      const s = this.sheets[i]
      s.x += s.v * dt
      s.life -= dt
      if (s.life <= 0) this.sheets.splice(i, 1)
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i]
      s.life -= dt
      s.r += dt * 26
      for (const p of s.bits) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt }
      if (s.life <= 0) this.splashes.splice(i, 1)
    }
  }

  _splash(x, y) {
    const r = this.rnd
    this.splashes.push({
      x, y, r: 1.4, life: 0.34, max: 0.34,
      bits: Array.from({ length: 3 }, () => ({
        x, y, vx: (r() - 0.5) * 70, vy: -30 - r() * 55
      }))
    })
  }

  draw(ctx) {
    const k = this.level
    if (k < 0.01) return
    ctx.save()
    // 雨幕
    for (const s of this.sheets) {
      const a = Math.sin((1 - s.life / s.max) * Math.PI) * 0.1 * k
      if (a <= 0.004) continue
      const g = ctx.createLinearGradient(s.x, 0, s.x + 200, 720)
      g.addColorStop(0, 'rgba(188,214,240,0)')
      g.addColorStop(0.5, `rgba(198,224,248,${a.toFixed(3)})`)
      g.addColorStop(1, 'rgba(188,214,240,0)')
      ctx.fillStyle = g
      ctx.fillRect(s.x - 60, -20, 300, 760)
    }
    // 三层雨线（每层一次 stroke）
    for (const layer of this.layers) {
      const cfg = layer.cfg
      const active = Math.ceil(cfg.n * clamp(0.25 + k, 0, 1))
      ctx.strokeStyle = `rgba(${cfg.tint},${(cfg.alpha * clamp(0.35 + k, 0, 1)).toFixed(3)})`
      ctx.lineWidth = cfg.w
      ctx.lineCap = 'round'
      ctx.beginPath()
      const dx = this.dir * cfg.len[1] * 0.42
      for (let i = 0; i < active; i++) {
        const d = layer.drops[i]
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.x - dx, d.y - d.len)
      }
      ctx.stroke()
    }
    // 溅射
    for (const s of this.splashes) {
      const t = 1 - s.life / s.max
      ctx.strokeStyle = `rgba(232,248,255,${(0.75 * (1 - t)).toFixed(3)})`
      ctx.lineWidth = 1.3
      ctx.beginPath()
      ctx.ellipse(s.x, s.y, s.r * 3.2, s.r * 1.1, 0, 0, TAU)
      ctx.stroke()
      ctx.fillStyle = `rgba(236,250,255,${(0.85 * (1 - t)).toFixed(3)})`
      for (const p of s.bits) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.35, 0, TAU); ctx.fill()
      }
    }
    ctx.restore()
  }
}

// =============================================================
// 冰雹：翻滚的多面冰块 + 拖影 + 砸中迸裂
// =============================================================
export class HailField {
  constructor(seed = 11) {
    this.rnd = makeRng(seed)
    this.stones = []
    this.bursts = []
    this.level = 0
    this.acc = 0
  }

  update(dt, { intensity = 0, impact = null } = {}) {
    this.level += (intensity - this.level) * Math.min(1, dt * 3)
    const k = this.level
    const r = this.rnd
    if (k > 0.02) {
      this.acc += (34 + 70 * k) * dt
      while (this.acc >= 1 && this.stones.length < 62) {
        this.acc -= 1
        this.stones.push({
          x: r() * 500 - 40, y: -14 - r() * 60,
          vx: (r() - 0.5) * 46, vy: 470 + r() * 280,
          s: 3.4 + r() * 4.2, rot: r() * TAU, spin: (r() - 0.5) * 11,
          facets: 5 + Math.floor(r() * 2)
        })
      }
    } else this.acc = 0
    for (let i = this.stones.length - 1; i >= 0; i--) {
      const s = this.stones[i]
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.vy += 260 * dt
      s.rot += s.spin * dt
      const hitTower = impact && s.y > impact.y && s.x > impact.x0 && s.x < impact.x1
      if (hitTower || s.y > 748) {
        if (this.bursts.length < 30) this._burst(s.x, hitTower ? impact.y : 742, s.s)
        this.stones.splice(i, 1)
      }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]
      b.life -= dt
      for (const p of b.bits) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 520 * dt; p.rot += p.spin * dt }
      if (b.life <= 0) this.bursts.splice(i, 1)
    }
  }

  // 由玩法侧真正命中塔顶时调用，给一次更强的迸裂
  impact(x, y, strength = 1) {
    this._burst(x, y, 3.4 * strength, Math.round(6 * strength))
  }

  _burst(x, y, size, n = 4) {
    const r = this.rnd
    this.bursts.push({
      x, y, life: 0.34, max: 0.34, size,
      bits: Array.from({ length: n }, () => ({
        x, y, vx: (r() - 0.5) * 210, vy: -60 - r() * 150,
        s: size * (0.26 + r() * 0.4), rot: r() * TAU, spin: (r() - 0.5) * 18
      }))
    })
  }

  // 单位空间绘制：渐变每帧只建一次，靠 scale 复用，避免每颗冰雹都 createLinearGradient
  _stone(ctx, grad, x, y, s, rot, facets, alpha) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.scale(s, s)
    ctx.globalAlpha = alpha
    ctx.beginPath()
    for (let i = 0; i < facets; i++) {
      const a = (i / facets) * TAU
      const rr = i % 2 ? 0.78 : 1
      const px = Math.cos(a) * rr
      const py = Math.sin(a) * rr
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
    }
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 0.6 / s
    ctx.stroke()
    // 内部棱线，让它像冰不像球
    ctx.beginPath()
    ctx.moveTo(-0.4, -0.5); ctx.lineTo(0.2, 0.15); ctx.lineTo(-0.1, 0.6)
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 0.5 / s
    ctx.stroke()
    ctx.restore()
  }

  draw(ctx) {
    ctx.save()
    // 下落拖影
    ctx.strokeStyle = 'rgba(222,244,255,0.16)'
    ctx.lineWidth = 2.4
    ctx.beginPath()
    for (const s of this.stones) {
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(s.x - s.vx * 0.008, s.y - s.vy * 0.0085)
    }
    ctx.stroke()
    const grad = ctx.createLinearGradient(-1, -1, 1, 1)
    grad.addColorStop(0, 'rgba(255,255,255,0.96)')
    grad.addColorStop(0.55, 'rgba(214,240,250,0.9)')
    grad.addColorStop(1, 'rgba(150,196,216,0.85)')
    for (const s of this.stones) this._stone(ctx, grad, s.x, s.y, s.s, s.rot, s.facets, 1)
    for (const b of this.bursts) {
      const t = 1 - b.life / b.max
      ctx.globalAlpha = 1 - t
      ctx.strokeStyle = 'rgba(236,250,255,0.9)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.size * (1 + t * 4), 0, TAU)
      ctx.stroke()
      for (const p of b.bits) this._stone(ctx, grad, p.x, p.y, p.s, p.rot, 5, 1 - t)
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }
}

// =============================================================
// 雪：三层景深 + 近景六角冰晶 + 整体横向涌动
// 中央操作通道保持低存在感（近中心的雪更小更淡），但不再是左右两条空边。
// =============================================================
export class SnowField {
  constructor(seed = 23) {
    this.rnd = makeRng(seed)
    const r = this.rnd
    this.far = Array.from({ length: 110 }, () => ({ x: r() * 440 - 10, y: r() * 740, s: 0.75 + r() * 0.85, v: 12 + r() * 10, ph: r() * TAU, sw: 5 + r() * 7 }))
    this.mid = Array.from({ length: 56 }, () => ({ x: r() * 440 - 10, y: r() * 740, s: 1.5 + r() * 1.2, v: 22 + r() * 15, ph: r() * TAU, sw: 9 + r() * 11 }))
    this.near = Array.from({ length: 22 }, () => ({ x: r() * 440 - 10, y: r() * 740, s: 3.0 + r() * 2.2, v: 34 + r() * 20, ph: r() * TAU, sw: 14 + r() * 14, rot: r() * TAU, spin: (r() - 0.5) * 1.5 }))
    this.gust = 0
    this.gustT = 2
    this.t = 0
  }

  // coverage 0~1：章节推进越深，雪越密
  update(dt, { coverage = 0.4 } = {}) {
    this.t += dt
    this.cov = coverage
    this.gustT -= dt
    if (this.gustT <= 0) { this.gustT = 3 + this.rnd() * 4; this.gustTarget = (this.rnd() - 0.5) * 26 }
    this.gust += ((this.gustTarget || 0) - this.gust) * Math.min(1, dt * 0.8)
    const drift = this.gust
    for (const group of [this.far, this.mid, this.near]) {
      for (const f of group) {
        f.y += f.v * dt * (0.7 + coverage * 0.6)
        f.x += (Math.sin(this.t * 0.9 + f.ph) * f.sw + drift) * dt
        if (f.rot != null) f.rot += f.spin * dt
        if (f.y > 736) { f.y = -8; f.x = this.rnd() * 440 - 10 }
        if (f.x < -16) f.x = 436
        if (f.x > 436) f.x = -16
      }
    }
  }

  // 中央通道（112~308）内的雪降低存在感，保证塔顶与落点可读
  _laneFade(x) {
    if (x < 96 || x > 324) return 1
    const d = Math.min(x - 96, 324 - x) / 114
    return 1 - 0.58 * Math.sin(clamp(d, 0, 1) * Math.PI / 2)
  }

  _crystal(ctx, x, y, s, rot, alpha) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.strokeStyle = `rgba(248,253,255,${alpha.toFixed(3)})`
    ctx.lineWidth = Math.max(0.5, s * 0.22)
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI
      ctx.moveTo(-Math.cos(a) * s, -Math.sin(a) * s)
      ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s)
    }
    ctx.stroke()
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU
      const bx = Math.cos(a) * s * 0.58
      const by = Math.sin(a) * s * 0.58
      ctx.moveTo(bx, by)
      ctx.lineTo(bx + Math.cos(a + 0.7) * s * 0.3, by + Math.sin(a + 0.7) * s * 0.3)
      ctx.moveTo(bx, by)
      ctx.lineTo(bx + Math.cos(a - 0.7) * s * 0.3, by + Math.sin(a - 0.7) * s * 0.3)
    }
    ctx.lineWidth = Math.max(0.4, s * 0.15)
    ctx.stroke()
    ctx.restore()
  }

  draw(ctx) {
    const cov = this.cov ?? 0.4
    ctx.save()
    // 远层：批量小圆点
    ctx.fillStyle = `rgba(240,250,254,${(0.4 + cov * 0.26).toFixed(3)})`
    ctx.beginPath()
    for (const f of this.far) {
      const a = this._laneFade(f.x)
      if (a < 0.55) continue
      ctx.moveTo(f.x + f.s, f.y)
      ctx.arc(f.x, f.y, f.s, 0, TAU)
    }
    ctx.fill()
    // 中层
    for (const f of this.mid) {
      ctx.globalAlpha = (0.58 + cov * 0.32) * this._laneFade(f.x)
      ctx.fillStyle = '#f2fafd'
      ctx.beginPath(); ctx.arc(f.x, f.y, f.s, 0, TAU); ctx.fill()
    }
    ctx.globalAlpha = 1
    // 近层：真正画出六角冰晶
    for (const f of this.near) {
      this._crystal(ctx, f.x, f.y, f.s, f.rot, (0.62 + cov * 0.35) * this._laneFade(f.x))
    }
    ctx.restore()
  }
}

// =============================================================
// 风：空气速度线 + 翻滚的树叶/纸片 + 阵风脉冲
// =============================================================
export class WindField {
  constructor(seed = 31) {
    this.rnd = makeRng(seed)
    const r = this.rnd
    this.streaks = Array.from({ length: 56 }, () => ({
      x: r() * 500 - 40, y: r() * 700, len: 40 + r() * 110, v: 150 + r() * 280,
      a: 0.18 + r() * 0.4, w: 0.9 + r() * 2.1, wob: r() * TAU,
      dark: r() < 0.38 // 一部分画成暗色，亮天空下也能看见风
    }))
    this.debris = Array.from({ length: 20 }, () => ({
      x: r() * 460 - 20, y: r() * 700, v: 110 + r() * 190, rot: r() * TAU, spin: (r() - 0.5) * 11,
      s: 3.2 + r() * 4.4, kind: Math.floor(r() * 3), ph: r() * TAU, bob: 14 + r() * 26
    }))
    this.level = 0
    this.pulse = 0
    this.t = 0
  }

  update(dt, { intensity = 0, dir = 1 } = {}) {
    this.t += dt
    this.level += (intensity - this.level) * Math.min(1, dt * 2.4)
    this.dir = dir || 1
    const k = this.level
    // 阵风脉冲：速度与密度一起起伏，让"风"有强弱而不是匀速滚动
    this.pulse = 0.62 + 0.38 * Math.sin(this.t * 1.7) + 0.16 * Math.sin(this.t * 4.3)
    const boost = (0.45 + k * 1.5) * this.pulse
    for (const s of this.streaks) {
      s.x += this.dir * s.v * boost * dt
      s.y += Math.sin(this.t * 1.3 + s.wob) * 7 * dt
      if (this.dir > 0 && s.x > 470) { s.x = -80 - this.rnd() * 60; s.y = this.rnd() * 700 }
      if (this.dir < 0 && s.x < -80) { s.x = 470 + this.rnd() * 60; s.y = this.rnd() * 700 }
    }
    for (const d of this.debris) {
      d.x += this.dir * d.v * boost * dt
      d.y += Math.sin(this.t * 1.9 + d.ph) * d.bob * dt + 7 * dt
      d.rot += d.spin * boost * dt
      if (this.dir > 0 && d.x > 460) { d.x = -30; d.y = this.rnd() * 680 }
      if (this.dir < 0 && d.x < -30) { d.x = 460; d.y = this.rnd() * 680 }
      if (d.y > 730) d.y = -10
    }
  }

  _leaf(ctx, d, alpha) {
    ctx.save()
    ctx.translate(d.x, d.y)
    ctx.rotate(d.rot)
    ctx.scale(1, 0.4 + 0.6 * Math.abs(Math.cos(d.rot * 1.3))) // 翻面感
    ctx.globalAlpha = alpha
    if (d.kind === 0) {
      ctx.fillStyle = '#8fae6b'
      ctx.beginPath()
      ctx.moveTo(-d.s, 0)
      ctx.quadraticCurveTo(0, -d.s * 0.9, d.s, 0)
      ctx.quadraticCurveTo(0, d.s * 0.9, -d.s, 0)
      ctx.fill()
      ctx.strokeStyle = 'rgba(60,78,46,0.55)'
      ctx.lineWidth = 0.45
      ctx.beginPath(); ctx.moveTo(-d.s, 0); ctx.lineTo(d.s, 0); ctx.stroke()
    } else if (d.kind === 1) {
      ctx.fillStyle = '#d9d2c0'
      ctx.fillRect(-d.s, -d.s * 0.7, d.s * 2, d.s * 1.4)
      ctx.strokeStyle = 'rgba(120,112,96,0.5)'
      ctx.lineWidth = 0.4
      ctx.strokeRect(-d.s, -d.s * 0.7, d.s * 2, d.s * 1.4)
    } else {
      ctx.fillStyle = '#b9a98c'
      ctx.beginPath(); ctx.arc(0, 0, d.s * 0.6, 0, TAU); ctx.fill()
    }
    ctx.restore()
  }

  draw(ctx) {
    const k = this.level
    if (k < 0.01) return
    ctx.save()
    ctx.lineCap = 'round'
    for (const s of this.streaks) {
      const a = s.a * clamp(0.3 + k * 1.3, 0, 1) * (0.6 + 0.4 * this.pulse)
      if (a < 0.012) continue
      // 亮/暗两种风线交替，保证在任何天空色上都读得出来
      ctx.strokeStyle = s.dark
        ? `rgba(96,128,152,${(a * 0.72).toFixed(3)})`
        : `rgba(240,252,255,${a.toFixed(3)})`
      ctx.lineWidth = s.w
      const L = s.len * (0.6 + k * 0.9) * (0.7 + 0.5 * this.pulse)
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.quadraticCurveTo(s.x - this.dir * L * 0.5, s.y + Math.sin(this.t * 2 + s.wob) * 3, s.x - this.dir * L, s.y)
      ctx.stroke()
    }
    for (const d of this.debris) this._leaf(ctx, d, clamp(0.4 + k * 0.9, 0, 0.95))
    ctx.restore()
  }

  // 会飘动的风向旗（替代原来固定不动的三角形）
  drawFlag(ctx, x, y, dir, accent = '#b5eada') {
    const k = clamp(0.25 + this.level, 0, 1)
    const wave = this.pulse
    ctx.save()
    ctx.strokeStyle = 'rgba(35,74,90,.7)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x, y + 48); ctx.lineTo(x, y); ctx.stroke()
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    ctx.moveTo(x + dir * 1, y + 2)
    const L = (16 + 12 * k) * dir
    for (let i = 1; i <= 6; i++) {
      const t = i / 6
      const px = x + L * t
      const py = y + 2 + Math.sin(this.t * 7 + t * 5) * 2.6 * t * wave
      ctx.lineTo(px, py)
    }
    for (let i = 6; i >= 1; i--) {
      const t = i / 6
      const px = x + L * t
      const py = y + 12 + Math.sin(this.t * 7 + t * 5 + 0.6) * 3.1 * t * wave
      ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}

// =============================================================
// 云：有体积的团块（多个带径向渐变的球叠加），分层不同速度
// =============================================================
export class CloudField {
  constructor(seed = 41, count = 5) {
    this.rnd = makeRng(seed)
    const r = this.rnd
    this.puffs = Array.from({ length: count }, (_, i) => ({
      x: r() * 560 - 70,
      y: 56 + r() * 150 + (i % 2) * 40,
      s: 0.75 + r() * 0.85,
      v: 7 + r() * 16,
      blobs: Array.from({ length: 4 + Math.floor(r() * 3) }, () => ({
        dx: (r() - 0.5) * 120, dy: (r() - 0.5) * 22, rr: 20 + r() * 30
      }))
    }))
  }

  update(dt, { dir = 1, speed = 1 } = {}) {
    for (const p of this.puffs) {
      p.x += dir * p.v * speed * dt
      if (dir > 0 && p.x > 620) p.x = -160
      if (dir < 0 && p.x < -160) p.x = 620
    }
  }

  // alpha 受测试约束（前景云必须 ≤0.13），所以体积感靠形状而不是靠加深
  draw(ctx, { alpha = 0.1, tint = '226,234,240', yOffset = 0 } = {}) {
    ctx.save()
    ctx.globalAlpha = alpha
    const g = ctx.createRadialGradient(0, -0.25, 0.15, 0, 0, 1)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.55, `rgba(${tint},0.85)`)
    g.addColorStop(1, `rgba(${tint},0)`)
    ctx.fillStyle = g
    for (const p of this.puffs) {
      for (const b of p.blobs) {
        const rr = b.rr * p.s
        ctx.save()
        ctx.translate(p.x + b.dx * p.s, p.y + b.dy * p.s + yOffset)
        ctx.scale(rr, rr * 0.72)
        ctx.beginPath()
        ctx.arc(0, 0, 1, 0, TAU)
        ctx.fill()
        ctx.restore()
      }
    }
    ctx.restore()
  }
}

// =============================================================
// 闪电：带分叉的主干 + 余辉 + 多次闪烁
// =============================================================
export function makeBolt(rndFn, { x0, y0, y1, width = 70, forks = 3, steps = 9 } = {}) {
  const r = rndFn
  const main = [{ x: x0, y: y0 }]
  let x = x0
  let y = y0
  const dy = (y1 - y0) / steps
  for (let i = 0; i < steps; i++) {
    y += dy * (0.72 + r() * 0.56)
    x += (r() - 0.5) * width
    main.push({ x, y })
  }
  const branches = []
  for (let f = 0; f < forks; f++) {
    const at = 1 + Math.floor(r() * (main.length - 2))
    const base = main[at]
    const seg = [{ x: base.x, y: base.y }]
    let bx = base.x
    let by = base.y
    const dir = r() < 0.5 ? -1 : 1
    const n = 2 + Math.floor(r() * 3)
    for (let i = 0; i < n; i++) {
      by += Math.abs(dy) * (0.35 + r() * 0.5)
      bx += dir * (6 + r() * 22)
      seg.push({ x: bx, y: by })
    }
    branches.push(seg)
  }
  return { main, branches, life: 1, born: 0 }
}

export function drawBolt(ctx, bolt, { alpha = 1, core = '#fffdf2', glow = '#ffe9a8', width = 3.2, glowBlur = 20 } = {}) {
  if (!bolt) return
  const stroke = (pts, w, color, blur) => {
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.strokeStyle = color
    ctx.lineWidth = w
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.shadowColor = glow
    ctx.shadowBlur = blur
    ctx.stroke()
  }
  ctx.save()
  ctx.globalAlpha = alpha
  // 外层光晕 → 中层 → 白芯，三遍叠出辉光
  stroke(bolt.main, width * 3.2, `rgba(255,228,150,0.22)`, glowBlur * 1.6)
  for (const b of bolt.branches) stroke(b, width * 1.3, `rgba(255,232,170,0.4)`, glowBlur * 0.6)
  stroke(bolt.main, width * 1.5, glow, glowBlur)
  stroke(bolt.main, width * 0.55, core, glowBlur * 0.4)
  ctx.shadowBlur = 0
  ctx.restore()
}

/** 云层被闪电点亮的径向辉光 */
export function drawSkyGlow(ctx, x, y, radius, strength, color = '255,243,205') {
  if (strength <= 0.01) return
  ctx.save()
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius)
  g.addColorStop(0, `rgba(${color},${(0.5 * strength).toFixed(3)})`)
  g.addColorStop(0.45, `rgba(${color},${(0.18 * strength).toFixed(3)})`)
  g.addColorStop(1, `rgba(${color},0)`)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, TAU)
  ctx.fill()
  ctx.restore()
}

export { makeRng }
