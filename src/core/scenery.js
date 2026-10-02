// 场景装饰系统（山体 / 建筑 / 植物）
// -------------------------------------------------------------
// 目标：让“从地面盖到月球”的过程有真实的纵深感。
//
// 分 5 个视差层，越远的层移动越慢、颜色越淡越偏天空色（空气透视），
// 越近的层移动越快、细节越多、颜色越实：
//
//   层级        视差系数   内容                         消失进度
//   远山        0.14      按地点取舍的远丘/地貌           p 0.16 → 0.50
//   远景城市    0.28      城市化程度、色彩各异的轮廓     p 0.10 → 0.36
//   中景建筑    0.50      不同体量、屋顶和色彩的楼群     p 0.06 → 0.26
//   近景        1.00      植物/住宅/河岸等地点化景物     p 0.00 → 0.16
//   前景        1.35      画面最底部的大剪影（在塔之前） p 0.00 → 0.09
//
// 视差装饰随本局进度 p 淡出并滑出视野；章节全景与晴天空色固定在屏幕上，
// 确保每关的城市身份不会在堆叠过程中消失。

import { CHAPTER, getChapterForLevel } from '../data/levels.js'

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

// Stable side-only landmark drawing area: the tower lane stays clear.
export const CITY_SAFE_AREA = Object.freeze({ leftWidth: 112, rightStart: W - 112, minY: 488 })

// Location palettes and skyline proportions make each district readable through
// its parallax skyline and persistent chapter panorama.
const DISTRICTS = {
  launchField: {
    feature: 'launchField', accent: '#5d806f', peaks: 4, peakHeight: [42, 88], farWidth: [58, 96], farHeight: [14, 52], midWidth: [64, 108], midHeight: [24, 78],
    sky: [[112, 181, 211], [204, 229, 200]],
    far: ['#9bb8aa', '#303e4b'], mid: ['#91afa0', '#a0bba9', '#86a697'], darkMid: ['#344c4c', '#3b554d', '#2c4547'],
    roofs: ['flat', 'slope', 'tank'], near: ['pine', 'grass', 'bush', 'grass', 'tree', 'house', 'grass']
  },
  riversideHomes: {
    feature: 'riversideHomes', accent: '#5e8f9f', peaks: 0, peakHeight: [0, 0], farWidth: [40, 76], farHeight: [26, 72], midWidth: [54, 92], midHeight: [40, 92],
    sky: [[77, 177, 207], [192, 230, 222]],
    far: ['#8caebe', '#293e54'], mid: ['#8eafb9', '#a0bdc5', '#819fab'], darkMid: ['#314c5a', '#3a5762', '#2c4254'],
    roofs: ['slope', 'flat', 'tank'], near: ['house', 'tree', 'house', 'bush', 'house', 'grass', 'tree']
  },
  oldFerry: {
    feature: 'oldFerry', accent: '#777993', peaks: 0, peakHeight: [0, 0], farWidth: [44, 80], farHeight: [20, 64], midWidth: [60, 98], midHeight: [32, 90],
    sky: [[132, 157, 199], [228, 216, 221]],
    far: ['#a19fba', '#30354d'], mid: ['#a29fba', '#b1aec7', '#8e9ab8'], darkMid: ['#45475f', '#4e506b', '#3b465d'],
    roofs: ['slope', 'flat', 'tank'], near: ['tree', 'bush', 'grass', 'house', 'bush', 'tree']
  },
  inlandPort: {
    feature: 'inlandPort', accent: '#9a6d60', peaks: 0, peakHeight: [0, 0], farWidth: [28, 50], farHeight: [30, 88], midWidth: [42, 68], midHeight: [42, 108],
    sky: [[199, 150, 112], [244, 213, 167]],
    far: ['#b1948c', '#493c4c'], mid: ['#b89a8c', '#c3a591', '#a88782'], darkMid: ['#594955', '#63504f', '#4a3c4a'],
    roofs: ['flat', 'tank', 'antenna'], near: ['bush', 'grass', 'house', 'grass', 'bush', 'tree']
  },
  crossRiverBridge: {
    feature: 'crossRiverBridge', accent: '#627d97', peaks: 0, peakHeight: [0, 0], farWidth: [34, 64], farHeight: [40, 100], midWidth: [44, 74], midHeight: [56, 132],
    sky: [[83, 155, 211], [190, 221, 239]],
    far: ['#89a9bf', '#2b4057'], mid: ['#89adbf', '#9bb9c8', '#7d9eb5'], darkMid: ['#304b62', '#38566a', '#2b4057'],
    roofs: ['flat', 'antenna', 'tank'], near: ['tree', 'bush', 'grass', 'house', 'tree', 'bush']
  },
  sciencePark: {
    feature: 'sciencePark', accent: '#52887e', peaks: 2, peakHeight: [30, 68], farWidth: [42, 78], farHeight: [24, 72], midWidth: [56, 92], midHeight: [34, 98],
    sky: [[87, 177, 158], [210, 235, 199]],
    far: ['#82b4aa', '#294951'], mid: ['#86b9ad', '#9ac8ba', '#79a99f'], darkMid: ['#2e5552', '#37615a', '#294b4c'],
    roofs: ['flat', 'antenna', 'slope'], near: ['tree', 'tree', 'bush', 'grass', 'house', 'tree', 'bush']
  },
  financeCore: {
    feature: 'financeCore', accent: '#626d8b', peaks: 0, peakHeight: [0, 0], farWidth: [19, 38], farHeight: [72, 158], midWidth: [28, 54], midHeight: [88, 188],
    sky: [[113, 140, 201], [219, 213, 237]],
    far: ['#9098bf', '#30334e'], mid: ['#969cbe', '#a7abc9', '#858eaf'], darkMid: ['#444864', '#4b506c', '#383e59'],
    roofs: ['flat', 'antenna', 'tank'], near: ['house', 'bush', 'grass', 'house', 'tree', 'bush']
  },
  centralTower: {
    feature: 'centralTower', accent: '#4e6c84', peaks: 0, peakHeight: [0, 0], farWidth: [18, 36], farHeight: [88, 190], midWidth: [27, 50], midHeight: [108, 216],
    sky: [[76, 143, 185], [187, 215, 229]],
    far: ['#748eae', '#263a55'], mid: ['#7f9bb7', '#92acc4', '#708cac'], darkMid: ['#304b64', '#39566d', '#2a405b'],
    roofs: ['flat', 'antenna', 'tank'], near: ['bush', 'house', 'grass', 'bush', 'tree', 'house']
  }
}

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
    this.scene = engine.level.cityscape || null
    this.chapter = getChapterForLevel(engine.level)
    this.chapterTheme = engine.level.chapterId && engine.level.chapterId !== CHAPTER.id ? this.chapter.weatherKind : null
    this.district = this._districtForLevel(engine.level)
    this.t = 0
    this.seed = ((engine.level.id || 1) * 0x9e3779b1) >>> 0
    this.cityProgress = engine.level.cityscape
      ? clamp(((engine.level.chapterStage || engine.level.id || 1) - 1) / 7, 0, 1)
      : 0
    this._build()
  }

  _districtForLevel(level) {
    if (!this.chapterTheme) return DISTRICTS[this.scene] || null
    const chapter = this.chapter
    const style = chapter.scenery
    if (!style) return DISTRICTS[level.landmarkFeature] || DISTRICTS.centralTower
    const stage = level.chapterStage || 1
    const baseSky = style.sky
    const skyShift = (stage - 1) * 2
    const shift = (rgb, delta) => rgb.map((channel, i) => clamp(channel + (i === 2 ? delta : delta * 0.35), 0, 255))
    return {
      feature: level.landmarkFeature || 'centralTower',
      accent: style.accent,
      peaks: style.peaks,
      peakHeight: [32 + stage * 2, 74 + stage * 2],
      farWidth: chapter.number >= 6 ? [24, 50] : [34, 78],
      farHeight: chapter.number >= 6 ? [28, 92] : [24, 82],
      midWidth: chapter.number >= 6 ? [42, 76] : [54, 98],
      midHeight: chapter.number >= 6 ? [38, 114] : [34, 102],
      sky: [shift(baseSky[0], skyShift), shift(baseSky[1], skyShift)],
      far: style.far,
      mid: style.mid,
      darkMid: style.darkMid,
      roofs: [['flat', 'tank', 'slope', 'antenna'][stage % 4], 'flat', 'slope'],
      near: chapter.number === 6 ? ['pine', 'pine', 'tree', 'house', 'grass', 'bush'] : ['tree', 'house', 'grass', 'bush', 'tree']
    }
  }

  _random() {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0
    return this.seed / 4294967296
  }

  _rnd(a, b) {
    return a + this._random() * (b - a)
  }

  _pick(values) {
    return values[Math.floor(this._random() * values.length)]
  }

  // ---------------- 生成 ----------------
  _build() {
    // 远丘：只在郊外与园区保留低丘，其余城市由水岸/建筑地平线区分。
    this.peaksBack = []
    const peakCount = this.district
      ? this.district.peaks
      : Math.max(0, Math.round(7 * (1 - this.cityProgress / 0.82)))
    for (let i = 0; i < peakCount; i++) {
      this.peaksBack.push({
        x: -60 + i * (540 / peakCount) + this._rnd(-22, 22),
        w: this._rnd(78, 130),
        h: this.district ? this._rnd(...this.district.peakHeight) : this._rnd(120, 205),
        snow: !this.district || this.chapterTheme === 'snow'
      })
    }
    this.peaksFront = []
    const frontPeakCount = this.district
      ? this.district.peaks > 0 ? 2 : 0
      : Math.max(0, Math.round(8 * (1 - this.cityProgress / 0.72)))
    for (let i = 0; i < frontPeakCount; i++) {
      this.peaksFront.push({
        x: -50 + i * (570 / Math.max(1, frontPeakCount)) + this._rnd(-18, 18),
        w: this._rnd(62, 104),
        h: this.district ? this._rnd(...this.district.peakHeight) : this._rnd(62, 128),
        snow: this.chapterTheme === 'snow' || (this.district ? false : this._random() < 0.35)
      })
    }

    // 远景城市：纯剪影天际线
    this.farCity = []
    const district = this.district || {
      farWidth: [16, 38], farHeight: [36, 126], midWidth: [38, 70], midHeight: [54, 150],
      far: ['#8b9cc4', '#242c47'], mid: ['#8794bd', '#9aa6cb', '#7d8bb4', '#a7b2d4'],
      darkMid: ['#2c3550', '#343e5d', '#283149', '#3a4466'], roofs: ['tank', 'antenna', 'flat', 'slope'],
      near: ['pine', 'tree', 'grass', 'bush', 'pine', 'house', 'tree', 'grass', 'tree', 'bush']
    }
    let x = -30
    while (x < W + 40) {
      const w = this._rnd(...district.farWidth)
      this.farCity.push({
        x,
        w,
        h: this._rnd(district.farHeight[0] + this.cityProgress * 18, district.farHeight[1] + this.cityProgress * 30),
        spire: this._random() < 0.28 + this.cityProgress * 0.28,
        step: this._random() < 0.3 + this.cityProgress * 0.24
      })
      x += w + this._rnd(2, 9 - this.cityProgress * 3)
    }

    // 中景建筑：带窗格、屋顶水箱/天线
    this.midCity = []
    x = -34
    const midPalette = this.dark ? district.darkMid : district.mid
    while (x < W + 44) {
      const w = this._rnd(Math.max(25, district.midWidth[0] - this.cityProgress * 8), Math.max(34, district.midWidth[1] - this.cityProgress * 12))
      const h = this._rnd(district.midHeight[0] + this.cityProgress * 42, district.midHeight[1] + this.cityProgress * 76)
      const cols = Math.max(2, Math.round(w / 13))
      const rows = Math.max(3, Math.round(h / 17))
      const lit = []
      for (let i = 0; i < cols * rows; i++) lit.push(this._random() < 0.42)
      this.midCity.push({
        x,
        w,
        h,
        cols,
        rows,
        lit,
        color: this._pick(midPalette),
        roof: this._pick(district.roofs),
        blinkIdx: Math.floor(this._random() * Math.max(1, cols * rows)),
        phase: this._rnd(0, 6.28)
      })
      x += w + this._rnd(6, 20 - this.cityProgress * 6)
    }

    // 近景：按地点选择房屋、树木、灌木、草丛，并可铺设静态水岸。
    // dy 表示“比地平线更靠近镜头多少”，越大越靠下也越大，形成地面纵深
    this.near = []
    const nearTypes = district.near
    const nearCount = Math.max(0, Math.round(34 - this.cityProgress * 44))
    for (let i = 0; i < nearCount; i++) {
      const type = nearTypes[i % nearTypes.length]
      const dy = this._rnd(2, 178)
      this.near.push({
        type,
        x: this._rnd(-40, W + 40),
        dy,
        s: 0.58 + (dy / 178) * 1.15,
        phase: this._rnd(0, 6.28),
        flip: this._random() < 0.5 ? 1 : -1
      })
    }
    this.near.sort((a, b) => a.dy - b.dy)

    // 前景：贴着画面下缘的大剪影，最先滑出视野
    this.front = []
    for (let i = 0; i < Math.max(0, Math.round(6 * (1 - this.cityProgress))); i++) {
      this.front.push({
        type: i % 2 === 0 ? 'bushBig' : 'pineBig',
        x: this._rnd(-50, W + 50),
        dy: this._rnd(240, 340),
        s: this._rnd(2.1, 3.4),
        phase: this._rnd(0, 6.28)
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
    this.renderChapterBackdrop(ctx)
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
    if (aFar > 0.01) this._drawDistrictLandmarks(ctx, bFar, aFar)
  }

  // A fixed, low-contrast city panorama keeps each chapter recognizable after
  // the moving skyline has passed. Strong landmarks stay in the outer wings;
  // only a soft atmospheric cue is allowed through the central tower lane.
  renderChapterBackdrop(ctx) {
    const district = this.district
    if (!district) return
    const { leftWidth, rightStart } = CITY_SAFE_AREA
    const softInk = district.accent
    const ink = district.far[0]

    ctx.save()
    ctx.globalAlpha = 0.045
    ctx.fillStyle = softInk
    ctx.strokeStyle = softInk
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    if (district.feature === 'launchField') {
      ctx.beginPath(); ctx.moveTo(0, 470); ctx.quadraticCurveTo(210, 410, 420, 470); ctx.lineTo(420, 585); ctx.lineTo(0, 585); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(0, 497); ctx.quadraticCurveTo(210, 455, 420, 497); ctx.stroke()
    } else if (district.feature === 'riversideHomes') {
      ctx.beginPath(); ctx.moveTo(0, 462); ctx.quadraticCurveTo(170, 495, 420, 448); ctx.lineTo(420, 525); ctx.quadraticCurveTo(190, 558, 0, 518); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(0, 480); ctx.quadraticCurveTo(190, 520, 420, 466); ctx.stroke()
    } else if (district.feature === 'oldFerry') {
      ctx.beginPath(); ctx.moveTo(24, 493); ctx.quadraticCurveTo(210, 305, 396, 493); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(42, 493); ctx.quadraticCurveTo(210, 344, 378, 493); ctx.stroke()
    } else if (district.feature === 'inlandPort') {
      for (const x of [132, 288]) {
        ctx.beginPath(); ctx.moveTo(x, 500); ctx.lineTo(x, 365); ctx.lineTo(x + (x < 210 ? 66 : -66), 365); ctx.lineTo(x + (x < 210 ? 66 : -66), 452); ctx.stroke()
      }
      ctx.beginPath(); ctx.moveTo(104, 500); ctx.lineTo(316, 500); ctx.stroke()
    } else if (district.feature === 'crossRiverBridge') {
      ctx.beginPath(); ctx.moveTo(0, 492); ctx.quadraticCurveTo(210, 360, 420, 492); ctx.lineTo(420, 510); ctx.quadraticCurveTo(210, 378, 0, 510); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(0, 492); ctx.quadraticCurveTo(210, 360, 420, 492); ctx.stroke()
    } else if (district.feature === 'sciencePark') {
      ctx.beginPath(); ctx.ellipse(210, 493, 180, 112, 0, Math.PI, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.ellipse(210, 493, 138, 86, 0, Math.PI, Math.PI * 2); ctx.stroke()
    } else if (district.feature === 'financeCore') {
      ctx.fillRect(0, 492, 420, 74)
      ctx.fillRect(0, 449, 420, 18)
      ctx.fillRect(0, 477, 420, 10)
    } else if (district.feature === 'centralTower') {
      ctx.beginPath(); ctx.ellipse(210, 405, 220, 120, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke()
      ctx.beginPath(); ctx.ellipse(210, 405, 174, 91, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke()
    }
    ctx.restore()

    // Tall/graphic landmark detail is clipped to the two 112 px wings. The
    // central 196 px remains available for tower blocks and landing alignment.
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, leftWidth, H)
    ctx.rect(rightStart, 0, W - rightStart, H)
    ctx.clip()
    for (const mirrored of [false, true]) {
      ctx.save()
      if (mirrored) { ctx.translate(W, 0); ctx.scale(-1, 1) }
      ctx.globalAlpha = 0.3
      ctx.fillStyle = ink
      ctx.strokeStyle = district.accent
      ctx.lineWidth = 3
      ctx.lineCap = 'round'

      if (district.feature === 'launchField') {
        ctx.beginPath(); ctx.moveTo(0, 478); ctx.quadraticCurveTo(55, 428, 112, 470); ctx.lineTo(112, 558); ctx.lineTo(0, 558); ctx.closePath(); ctx.fill()
        for (const x of [26, 48]) { ctx.beginPath(); ctx.moveTo(x, 486); ctx.lineTo(x, 300); ctx.stroke() }
        ctx.beginPath(); ctx.moveTo(22, 322); ctx.lineTo(53, 322); ctx.moveTo(26, 365); ctx.lineTo(48, 365); ctx.moveTo(26, 412); ctx.lineTo(48, 412); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(72, 405); ctx.lineTo(81, 368); ctx.lineTo(90, 405); ctx.lineTo(90, 478); ctx.lineTo(72, 478); ctx.closePath(); ctx.fill()
      } else if (district.feature === 'riversideHomes') {
        for (const [x, y, w, h] of [[-4, 400, 39, 145], [37, 347, 57, 198], [96, 418, 24, 127]]) {
          ctx.fillRect(x, y, w, h)
          ctx.fillRect(x + 5, y - 12, w - 10, 12)
          for (let wy = y + 17; wy < y + h - 10; wy += 23) { ctx.beginPath(); ctx.moveTo(x + 8, wy); ctx.lineTo(x + w - 7, wy); ctx.stroke() }
        }
      } else if (district.feature === 'oldFerry') {
        ctx.fillRect(8, 410, 96, 126)
        ctx.beginPath(); ctx.moveTo(5, 412); ctx.quadraticCurveTo(56, 262, 107, 412); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(16, 412); ctx.quadraticCurveTo(56, 295, 96, 412); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, 507); ctx.lineTo(112, 507); ctx.moveTo(8, 535); ctx.lineTo(44, 535); ctx.stroke()
      } else if (district.feature === 'inlandPort') {
        ctx.beginPath(); ctx.moveTo(20, 505); ctx.lineTo(20, 310); ctx.lineTo(102, 310); ctx.lineTo(102, 490); ctx.moveTo(14, 315); ctx.lineTo(108, 315); ctx.moveTo(29, 320); ctx.lineTo(96, 360); ctx.moveTo(94, 317); ctx.lineTo(94, 405); ctx.stroke()
        for (const [x, y, w, h] of [[2, 480, 32, 66], [39, 451, 33, 95], [77, 493, 35, 53]]) { ctx.fillRect(x, y, w, h); ctx.strokeRect(x + 5, y + 8, w - 10, h - 16) }
      } else if (district.feature === 'crossRiverBridge') {
        ctx.fillRect(45, 298, 22, 190)
        ctx.beginPath(); ctx.moveTo(0, 443); ctx.lineTo(56, 298); ctx.lineTo(112, 443); ctx.moveTo(0, 463); ctx.lineTo(112, 463); ctx.stroke()
        for (const x of [12, 28, 82, 98]) { ctx.beginPath(); ctx.moveTo(x, 463); ctx.lineTo(56 + (x < 56 ? -1 : 1) * (56 - Math.abs(x - 56)) * 0.76, 332 + Math.abs(x - 56) * 0.9); ctx.stroke() }
      } else if (district.feature === 'sciencePark') {
        ctx.fillRect(4, 442, 104, 102)
        ctx.beginPath(); ctx.moveTo(2, 443); ctx.ellipse(56, 443, 56, 116, 0, Math.PI, Math.PI * 2); ctx.lineTo(112, 460); ctx.lineTo(0, 460); ctx.closePath(); ctx.fill()
        for (const x of [14, 34, 56, 78, 98]) { ctx.beginPath(); ctx.moveTo(x, 443); ctx.lineTo(56, 329); ctx.stroke() }
        ctx.beginPath(); ctx.moveTo(8, 404); ctx.lineTo(104, 404); ctx.stroke()
      } else if (district.feature === 'financeCore') {
        ctx.fillRect(0, 398, 27, 148); ctx.fillRect(31, 315, 39, 231); ctx.fillRect(74, 360, 38, 186)
        ctx.fillRect(38, 297, 25, 18); ctx.fillRect(49, 276, 3, 21)
        for (const [x, y, w, h] of [[7, 413, 2, 7], [18, 413, 2, 7], [40, 333, 3, 7], [54, 333, 3, 7], [82, 378, 3, 7], [97, 378, 3, 7]]) ctx.fillRect(x, y, w, h)
      } else if (district.feature === 'centralTower') {
        ctx.beginPath(); ctx.moveTo(18, 535); ctx.lineTo(29, 321); ctx.lineTo(55, 248); ctx.lineTo(80, 321); ctx.lineTo(94, 535); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(55, 248); ctx.lineTo(55, 222); ctx.moveTo(30, 354); ctx.lineTo(79, 354); ctx.moveTo(26, 405); ctx.lineTo(83, 405); ctx.moveTo(23, 458); ctx.lineTo(87, 458); ctx.stroke()
      }
      if (this.chapterTheme) {
        const stage = this.engine.level.chapterStage || 1
        const x = 8 + stage * 11
        const top = 478 - stage * 13
        ctx.globalAlpha = 0.3
        ctx.strokeStyle = district.accent
        ctx.lineWidth = 2 + stage * 0.12
        ctx.beginPath()
        ctx.moveTo(x, 510)
        ctx.lineTo(x, top)
        ctx.lineTo(x + 7, top - 5 - stage)
        ctx.moveTo(x - 5, top + 12)
        ctx.lineTo(x + 5, top + 12)
        ctx.stroke()
        ctx.strokeRect(x - 4, top - 8, 8 + stage % 3, 4)
      }
      ctx.restore()
    }
    ctx.restore()
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
    if (this.district?.feature === 'riversideHomes' || this.district?.feature === 'oldFerry') {
      const ferry = this.district.feature === 'oldFerry'
      const top = ferry ? 42 : 28
      const bottom = ferry ? 92 : 76
      ctx.globalAlpha = a * (ferry ? 0.28 : 0.42)
      ctx.fillStyle = this.dark ? '#315f72' : ferry ? '#78a8b6' : '#579daf'
      ctx.beginPath()
      ctx.moveTo(0, base + top + 4)
      ctx.quadraticCurveTo(118, base + top - 6, 210, base + top + 8)
      ctx.quadraticCurveTo(306, base + top + 20, W, base + top + 3)
      ctx.lineTo(W, base + bottom)
      ctx.quadraticCurveTo(298, base + bottom - 12, 210, base + bottom - 3)
      ctx.quadraticCurveTo(94, base + bottom + 8, 0, base + bottom - 2)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = a * 0.38
      ctx.strokeStyle = this.dark ? '#9bc9d6' : ferry ? '#739aa8' : '#659cae'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, base + top + 4)
      ctx.quadraticCurveTo(118, base + top - 6, 210, base + top + 8)
      ctx.quadraticCurveTo(306, base + top + 20, W, base + top + 3)
      ctx.stroke()
      // Water marks remain in the outer thirds; the tower and landing lane stay quiet.
      for (const x of [12, 48, 86, 286, 328, 374]) {
        const y = base + top + 18 + (x % 3) * 3
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + 18, y - 1)
        ctx.stroke()
      }
    }
    if (this.chapterTheme === 'snow') {
      ctx.globalAlpha = a * 0.58
      ctx.fillStyle = '#e7f1ef'
      ctx.beginPath()
      ctx.moveTo(0, base + 13)
      ctx.quadraticCurveTo(82, base + 4, 156, base + 14)
      ctx.quadraticCurveTo(246, base + 25, 332, base + 10)
      ctx.quadraticCurveTo(380, base + 5, W, base + 15)
      ctx.lineTo(W, base + 28)
      ctx.lineTo(0, base + 28)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = a * 0.3
      ctx.fillStyle = '#f4f8f6'
      for (const x of [18, 72, 124, 293, 354, 402]) {
        ctx.beginPath(); ctx.ellipse(x, base + 9 + (x % 3), 13 + (x % 5), 2.4, 0, 0, Math.PI * 2); ctx.fill()
      }
    }
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
    if (this.engine.level.cityscape) {
      const { leftWidth, rightStart, minY } = CITY_SAFE_AREA
      ctx.beginPath()
      ctx.rect(0, minY, leftWidth, H - minY)
      ctx.rect(rightStart, minY, W - rightStart, H - minY)
      ctx.clip()
    }
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
    ctx.fillStyle = this.district ? this.district.far[this.dark ? 1 : 0] : this.dark ? '#242c47' : '#8b9cc4'
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
    if (this.chapterTheme === 'snow') {
      ctx.globalAlpha = alpha * 0.42
      ctx.strokeStyle = '#edf6f4'
      ctx.lineWidth = 2
      for (const b of this.farCity) {
        const top = base - b.h
        ctx.beginPath(); ctx.moveTo(b.x + 2, top + 1); ctx.lineTo(b.x + b.w - 2, top + 1); ctx.stroke()
      }
    }
    ctx.restore()
  }

  // Low-contrast landmarks sit in the remote skyline and frame, rather than
  // fill, the central tower/landing lane.
  _drawDistrictLandmarks(ctx, base, alpha) {
    const district = this.district
    if (!district || base < -200) return
    const ink = district.far[this.dark ? 1 : 0]
    const accent = this.dark ? '#b4d0dc' : district.accent
    ctx.save()
    ctx.globalAlpha = alpha * 0.62
    ctx.fillStyle = ink
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    const line = (x1, y1, x2, y2, width = 2) => {
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
    const polygon = (points) => {
      ctx.beginPath()
      ctx.moveTo(points[0][0], points[0][1])
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1])
      ctx.closePath()
      ctx.fill()
    }

    // Riverbanks are broad, quiet horizontal forms; gameplay remains in front.
    if (district.feature === 'riversideHomes' || district.feature === 'oldFerry') {
      ctx.globalAlpha = alpha * (district.feature === 'riversideHomes' ? 0.43 : 0.27)
      ctx.fillStyle = this.dark ? '#557f94' : district.feature === 'riversideHomes' ? '#5f9daf' : district.far[0]
      polygon([
        [0, base - 69], [72, base - 76], [148, base - 67], [224, base - 72],
        [302, base - 63], [420, base - 71], [420, base - 42], [306, base - 46],
        [220, base - 39], [132, base - 48], [60, base - 42], [0, base - 48]
      ])
      ctx.globalAlpha = alpha * (district.feature === 'riversideHomes' ? 0.52 : 0.38)
      ctx.strokeStyle = accent
      line(0, base - 69, 72, base - 76, 1.5)
      line(224, base - 72, 302, base - 63, 1.5)
    }

    if (district.feature === 'crossRiverBridge') {
      // One thin distant bridge span; its pylons stay out of the center lane.
      ctx.globalAlpha = alpha * 0.4
      ctx.strokeStyle = accent
      line(0, base - 45, 420, base - 45, 2)
      line(34, base - 45, 34, base - 210, 4)
      line(386, base - 45, 386, base - 210, 4)
      ctx.beginPath()
      ctx.moveTo(34, base - 210)
      ctx.quadraticCurveTo(210, base - 95, 386, base - 210)
      ctx.stroke()
      if (this.chapterTheme === 'snow') {
        ctx.globalAlpha = alpha * 0.38
        ctx.strokeStyle = '#eef6f5'
        line(0, base - 48, 420, base - 48, 3)
      }
      for (const x of [72, 112, 152, 192, 228, 268, 308, 348]) {
        const d = Math.abs(x - 210)
        line(x, base - 45, x, base - 210 + d * 0.54, 1)
      }
    }

    for (const mirrored of [false, true]) {
      ctx.save()
      if (mirrored) {
        ctx.translate(W, 0)
        ctx.scale(-1, 1)
      }
      if (district.feature === 'launchField') {
        // Open rolling field, two gantry uprights and a small launch vehicle.
        ctx.globalAlpha = alpha * 0.2
        ctx.fillStyle = accent
        polygon([[0, base - 7], [28, base - 19], [57, base - 12], [83, base - 24], [112, base - 10], [112, base + 4], [0, base + 4]])
        ctx.globalAlpha = alpha * 0.56
        ctx.strokeStyle = accent
        line(18, base - 7, 18, base - 160, 3)
        line(49, base - 7, 49, base - 160, 3)
        line(14, base - 150, 64, base - 150, 3)
        for (const y of [base - 118, base - 84, base - 48]) line(18, y, 49, y, 1.5)
        ctx.fillStyle = ink
        polygon([[76, base - 31], [85, base - 122], [94, base - 31]])
        ctx.fillRect(79, base - 32, 12, 91)
      } else if (district.feature === 'riversideHomes') {
        // Terraced apartment blocks with stepped roofs and a riverside walk.
        ctx.globalAlpha = alpha * 0.42
        ctx.fillStyle = ink
        ctx.fillRect(5, base - 62, 31, 62)
        ctx.fillRect(42, base - 83, 43, 83)
        ctx.fillRect(88, base - 53, 21, 53)
        polygon([[5, base - 62], [20, base - 74], [36, base - 62]])
        polygon([[42, base - 83], [63, base - 96], [85, base - 83]])
        ctx.globalAlpha = alpha * 0.45
        ctx.strokeStyle = accent
        line(0, base - 18, 112, base - 18, 2)
        for (const x of [15, 28, 55, 69, 96]) line(x, base - 49, x, base - 40, 1)
      } else if (district.feature === 'oldFerry') {
        // A broad arched ferry hall, paired mooring posts and a low boat roof.
        ctx.globalAlpha = alpha * 0.48
        ctx.fillStyle = ink
        ctx.fillRect(17, base - 47, 78, 47)
        ctx.beginPath()
        ctx.moveTo(13, base - 46)
        ctx.quadraticCurveTo(56, base - 153, 99, base - 46)
        ctx.lineTo(89, base - 46)
        ctx.quadraticCurveTo(56, base - 125, 23, base - 46)
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = alpha * 0.52
        ctx.strokeStyle = accent
        for (const x of [7, 104]) line(x, base - 4, x, base - 66, 2)
        line(4, base - 66, 16, base - 66, 2)
        line(98, base - 66, 110, base - 66, 2)
        polygon([[63, base - 12], [72, base - 24], [91, base - 24], [101, base - 12]])
      } else if (district.feature === 'inlandPort') {
        // Tall boxy harbor crane and stacked container rows.
        ctx.globalAlpha = alpha * 0.55
        ctx.strokeStyle = accent
        line(19, base - 4, 19, base - 176, 4)
        line(83, base - 4, 83, base - 176, 4)
        line(14, base - 174, 101, base - 174, 5)
        line(23, base - 170, 96, base - 132, 2)
        line(92, base - 172, 92, base - 91, 2)
        line(86, base - 91, 99, base - 91, 2)
        ctx.globalAlpha = alpha * 0.44
        ctx.fillStyle = ink
        ctx.fillRect(2, base - 42, 31, 42)
        ctx.fillRect(37, base - 59, 35, 59)
        ctx.fillRect(76, base - 34, 34, 34)
        for (const x of [7, 43, 82]) line(x, base - 37, x, base - 5, 1)
      } else if (district.feature === 'sciencePark') {
        // Low glass lab, a clean geodesic dome and an observatory dish.
        ctx.globalAlpha = alpha * 0.42
        ctx.fillStyle = ink
        ctx.fillRect(5, base - 43, 89, 43)
        ctx.beginPath()
        ctx.arc(50, base - 65, 48, Math.PI, Math.PI * 2)
        ctx.lineTo(98, base - 39)
        ctx.lineTo(2, base - 39)
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = alpha * 0.5
        ctx.strokeStyle = accent
        for (const x of [13, 29, 43, 57, 71, 87]) line(x, base - 43, 50, base - 113, 1)
        line(4, base - 66, 96, base - 66, 1)
        line(94, base - 43, 104, base - 124, 2)
        ctx.beginPath()
        ctx.arc(101, base - 127, 16, Math.PI * 1.12, Math.PI * 1.9)
        ctx.stroke()
      } else if (district.feature === 'financeCore') {
        // A dense stepped cluster of office towers and narrow crown accents.
        ctx.globalAlpha = alpha * 0.46
        ctx.fillStyle = ink
        ctx.fillRect(3, base - 87, 26, 87)
        ctx.fillRect(34, base - 121, 34, 121)
        ctx.fillRect(72, base - 98, 37, 98)
        ctx.fillRect(40, base - 132, 22, 11)
        ctx.globalAlpha = alpha * 0.52
        ctx.strokeStyle = accent
        line(51, base - 132, 51, base - 149, 2)
        for (const x of [10, 18, 43, 54, 63, 81, 95]) line(x, base - 80, x, base - 69, 1)
      } else if (district.feature === 'centralTower') {
        // Slender super-tall district silhouettes bracket the clear play lane.
        ctx.globalAlpha = alpha * 0.48
        ctx.fillStyle = ink
        polygon([[8, base], [15, base - 112], [27, base - 137], [39, base - 112], [44, base]])
        ctx.fillRect(48, base - 94, 24, 94)
        ctx.fillRect(77, base - 73, 32, 73)
        ctx.globalAlpha = alpha * 0.5
        ctx.strokeStyle = accent
        line(27, base - 137, 27, base - 161, 2)
        line(14, base - 91, 38, base - 91, 1.5)
        line(15, base - 64, 40, base - 64, 1.5)
        line(48, base - 74, 72, base - 74, 1)
        line(78, base - 55, 108, base - 55, 1)
      }
      ctx.restore()
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

      if (this.chapterTheme === 'snow') {
        ctx.fillStyle = 'rgba(239,247,245,0.82)'
        ctx.fillRect(b.x + 1, top - 1, Math.max(0, b.w - 2), 2.2)
      }

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
    if (this.chapterTheme === 'snow') {
      ctx.globalAlpha = 0.76
      ctx.strokeStyle = '#f1f7f5'
      ctx.lineWidth = 2.4 * s
      ctx.beginPath()
      ctx.moveTo(-w / 2 - 4 * s, -h - 1)
      ctx.lineTo(0, -h - 15 * s)
      ctx.lineTo(w / 2 + 4 * s, -h - 1)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
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
