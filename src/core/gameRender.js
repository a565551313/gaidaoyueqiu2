// 渲染层：GameEngine 的全部绘制方法（背景 / 天体 / 楼层 / 塔身 / 特效）。
//
// 这些方法在 gameEngine.js 里通过 Object.assign 挂到 GameEngine.prototype 上，
// 所以函数体里的 this 仍然是引擎实例，和写在 class 里时完全一样。
// 拆出来只是为了把「怎么画」和「游戏怎么运转」分开：
// 改一处像素效果不用在两千行逻辑里翻找，读玩法逻辑时也不用跳过七百行绘制代码。

import { getBlockType } from '../data/blockTypes.js'
import { drawBlockFace } from './blockArt.js'
import { sprite, tinted } from './spritePacks.js'
import { LOGICAL_W, BLOCK_H, clamp, lerp } from './geometry.js'

// 落层结果是 tags，不是类型。掉落残块这类临时伪块可能没有 tags 字段。
function hasTag(block, tag) {
  return Boolean(block.tags && block.tags.includes(tag))
}

export const RenderMixin = {
  render(ctx) {
    if (this.destroyed) return
    const p = clamp(this.floors / this.level.target, 0, 1)
    ctx.save()
    // 震动
    let sx = 0
    let sy = 0
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * this.shake
      sy = (Math.random() - 0.5) * this.shake
    }
    ctx.translate(sx, sy)

    this._drawBackground(ctx, p)
    this.weather.renderBack(ctx, LOGICAL_W, this.viewH)
    this._drawTower(ctx)
    if (this.antSystem) this.antSystem.render(ctx)
    this._drawEffects(ctx)
    // 最近的一层前景剪影盖在塔前面，强化“近处”的纵深
    if (this.scenery) this.scenery.renderFront(ctx, p)
    this.weather.renderFront(ctx, LOGICAL_W, this.viewH)

    if (this.flashPerfect > 0) {
      ctx.fillStyle = `rgba(255,236,150,${this.flashPerfect * 0.35})`
      ctx.fillRect(-20, -20, LOGICAL_W + 40, this.viewH + 40)
    }
    // 切除瞬间的冷色白闪，让“被切掉了”一眼可见
    if (this.flashCut > 0) {
      ctx.fillStyle = `rgba(226,244,255,${clamp(this.flashCut * 1.35, 0, 0.42)})`
      ctx.fillRect(-20, -20, LOGICAL_W + 40, this.viewH + 40)
    }
    ctx.restore()
  },

  _bgPalette(p) {
    // Chapter stages use a clear daytime gradient; legacy/non-city levels retain
    // the established space palette.
    if (this.level.cityscape) {
      const sky = this.scenery?.district?.sky || [[87, 164, 221], [190, 224, 237]]
      return {
        top: `rgb(${sky[0].join(',')})`,
        bot: `rgb(${sky[1].join(',')})`,
        topArr: [...sky[0]],
        botArr: [...sky[1]],
        starAlpha: 0,
        cloudAlpha: 0.48
      }
    }
    const kf = [
      { p: 0, top: [15, 36, 80], bot: [26, 65, 116] },
      { p: 0.25, top: [16, 31, 76], bot: [25, 53, 112] },
      { p: 0.5, top: [21, 23, 69], bot: [47, 36, 119] },
      { p: 0.75, top: [16, 18, 50], bot: [35, 27, 88] },
      { p: 1, top: [5, 9, 24], bot: [16, 18, 48] }
    ]
    let a = kf[0]
    let b = kf[kf.length - 1]
    for (let i = 0; i < kf.length - 1; i++) {
      if (p >= kf[i].p && p <= kf[i + 1].p) {
        a = kf[i]
        b = kf[i + 1]
        break
      }
    }
    const t = (p - a.p) / Math.max(0.0001, b.p - a.p)
    const mix = (c1, c2) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]
    const top = mix(a.top, b.top)
    const bot = mix(a.bot, b.bot)
    return {
      top: `rgb(${top.map(Math.round).join(',')})`,
      bot: `rgb(${bot.map(Math.round).join(',')})`,
      topArr: top.map(Math.round),
      botArr: bot.map(Math.round),
      starAlpha: 0.62 + clamp(p, 0, 1) * 0.3,
      cloudAlpha: clamp(1 - Math.abs(p - 0.2) / 0.26, 0, 1) * 0.28
    }
  },

  _drawBackground(ctx, p) {
    const pal = this._bgPalette(p)
    const grad = ctx.createLinearGradient(0, 0, 0, this.viewH)
    grad.addColorStop(0, pal.top)
    grad.addColorStop(1, pal.bot)
    ctx.fillStyle = grad
    ctx.fillRect(-20, -20, LOGICAL_W + 40, this.viewH + 40)

    if (this.level.cityscape) {
      if (!this.level.weatherKind || this.level.weatherKind === 'wind') this._drawDaySun(ctx)
    } else {
      // Orbit-station atmosphere retained for any future non-city chapter.
      ctx.save()
      ctx.globalAlpha = 0.16
      ctx.strokeStyle = '#6de2ff'
      ctx.lineWidth = 1
      for (let x = -this.viewH; x < LOGICAL_W + this.viewH; x += 34) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + this.viewH * 0.32, this.viewH); ctx.stroke()
      }
      ctx.globalAlpha = 0.22
      ctx.strokeStyle = '#ffd66e'
      ctx.beginPath(); ctx.arc(LOGICAL_W * 0.78, this.viewH * 0.22, 86, 0.25, 2.55); ctx.stroke()
      ctx.restore()
    }

    // 星星（Simple Space 星星精灵，按大小分档）
    if (pal.starAlpha > 0.02) {
      for (const s of this.stars) {
        const sy = this.screenY(s.wy)
        if (sy < -10 || sy > this.viewH + 10) continue
        const tw = 0.5 + 0.5 * Math.sin(s.tw)
        ctx.globalAlpha = pal.starAlpha * tw
        const skey = s.r < 0.8 ? 'star-tiny' : s.r < 1.2 ? 'star-small' : s.r < 1.6 ? 'star-medium' : 'star-large'
        const simg = sprite(skey)
        if (simg) {
          const sz = s.r < 0.8 ? 9 : s.r < 1.2 ? 13 : s.r < 1.6 ? 18 : 25
          ctx.drawImage(simg, s.x - sz / 2, sy - sz / 2, sz, sz)
        } else {
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(s.x, sy, s.r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    }

    // 月亮仅供显式配置该景观的非城市关卡使用。
    if (!this.level.cityscape) this._drawMoon(ctx, p)

    // 远景装饰：山脉 → 远处城市 → 中景楼房（越远移动越慢、越淡）
    if (this.scenery) this.scenery.renderBack(ctx, p, { top: pal.topArr, bot: pal.botArr })

    // 云层
    if (pal.cloudAlpha > 0.02) {
      for (const c of this.clouds) {
        const sy = this.screenY(c.wy)
        if (sy < -60 || sy > this.viewH + 60) continue
        ctx.globalAlpha = pal.cloudAlpha * 0.85
        this._drawCloud(ctx, c.x, sy, c.s)
      }
      ctx.globalAlpha = 1
    }

    // 地面
    const groundWy = this.worldY(0) + BLOCK_H
    const gy = this.screenY(groundWy)
    const dark = true
    if (gy < this.viewH + 200) {
      const snowScene = this.level.weatherKind === 'snow'
      const gGrad = ctx.createLinearGradient(0, gy, 0, gy + 300)
      gGrad.addColorStop(0, snowScene ? '#c9d9d9' : dark ? '#2b4a2d' : '#7ec87e')
      gGrad.addColorStop(1, snowScene ? '#738c98' : dark ? '#16280f' : '#4e9a4e')
      ctx.fillStyle = gGrad
      ctx.fillRect(-20, gy, LOGICAL_W + 40, this.viewH + 40 - gy + 20)
      // 草地高光
      ctx.fillStyle = snowScene ? 'rgba(246,251,250,0.46)' : dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.18)'
      ctx.fillRect(-20, gy, LOGICAL_W + 40, 6)
      // 远处地面的起伏（贴着地平线的两道缓坡，暗示草原延伸）
      ctx.fillStyle = snowScene ? 'rgba(238,246,244,0.28)' : dark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.14)'
      ctx.beginPath()
      ctx.ellipse(LOGICAL_W * 0.22, gy + 16, 150, 20, 0, Math.PI, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(LOGICAL_W * 0.82, gy + 22, 130, 17, 0, Math.PI, Math.PI * 2)
      ctx.fill()
    }

    // 近景装饰：地面上的小屋、树木、灌木和草丛（跟着地面一起滑出视野）
    if (this.scenery) this.scenery.renderNear(ctx, p)
  },
  _drawDaySun(ctx) {
    const x = 354
    const y = 214
    const glow = ctx.createRadialGradient(x, y, 18, x, y, 62)
    glow.addColorStop(0, 'rgba(255,246,198,0.62)')
    glow.addColorStop(1, 'rgba(255,246,198,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(x, y, 62, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffe9a8'
    ctx.beginPath()
    ctx.arc(x, y, 25, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.54)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x - 4, y - 4, 18, Math.PI * 1.12, Math.PI * 1.82)
    ctx.stroke()
  },

  _drawCloud(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.beginPath()
    ctx.ellipse(x, y, 42 * s, 22 * s, 0, 0, Math.PI * 2)
    ctx.ellipse(x - 34 * s, y + 6 * s, 26 * s, 16 * s, 0, 0, Math.PI * 2)
    ctx.ellipse(x + 34 * s, y + 6 * s, 30 * s, 18 * s, 0, 0, Math.PI * 2)
    ctx.fill()
  },

  _drawMoon(ctx, p) {
    // 非城市章节只有显式配置 moon 才绘制月球，不再将第 6 个关卡 ID 当作内容标记。
    if (!this.level.moon) return
    // 月亮世界坐标在塔顶之上
    const moonWy = this.worldY(this.level.target) - 160
    const my = this.screenY(moonWy)
    if (my > this.viewH + 120 || my < -260) return
    const appear = clamp((p - 0.45) / 0.4, 0, 1)
    if (appear <= 0.02) return
    const r = 60 + appear * 24
    const cx = LOGICAL_W * 0.72
    ctx.save()
    ctx.globalAlpha = appear
    // 光晕
    const glow = ctx.createRadialGradient(cx, my, r * 0.6, cx, my, r * 2)
    glow.addColorStop(0, 'rgba(255,245,200,0.5)')
    glow.addColorStop(1, 'rgba(255,245,200,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, my, r * 2, 0, Math.PI * 2)
    ctx.fill()
    // 月球本体
    const mg = ctx.createRadialGradient(cx - r * 0.3, my - r * 0.3, r * 0.2, cx, my, r)
    mg.addColorStop(0, '#fff9e6')
    mg.addColorStop(1, '#e6d9a8')
    ctx.fillStyle = mg
    ctx.beginPath()
    ctx.arc(cx, my, r, 0, Math.PI * 2)
    ctx.fill()
    // 环形山
    ctx.fillStyle = 'rgba(180,165,120,0.5)'
    const craters = [
      [-0.3, -0.2, 0.18],
      [0.25, 0.1, 0.22],
      [0.05, 0.4, 0.14],
      [-0.4, 0.3, 0.1],
      [0.4, -0.35, 0.12]
    ]
    for (const [dx, dy, cr] of craters) {
      ctx.beginPath()
      ctx.arc(cx + dx * r, my + dy * r, cr * r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  },

  _blockColors(block) {
    // 类型自带配色就用类型的（地基 / 烈焰层 / 追击层），否则跟随材质。
    const typeArt = getBlockType(block.typeId).art
    if (typeArt.colors) return typeArt.colors
    const materialColors = this.material.colors || ['#b9794a', '#8e4d2f']
    // 完美层走材质原色；深色主题下的泥土另有一组更沉的配色。
    // 这两条的先后顺序是旧实现留下的：深色泥土的完美层用的是原色而不是暗色。
    // 看着像是写漏了，但属性重构不该顺手改画面，留给视觉重做那一步处理。
    if (hasTag(block, 'perfect')) return materialColors
    if (this.theme === 'dark' && this.material.colorsDark) return this.material.colorsDark
    return materialColors
  },

  _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  },

  _drawBlock(ctx, cx, screenTopY, width, block, extra = {}) {
    const x = cx - width / 2
    const y = screenTopY
    const typeArt = getBlockType(block.typeId).art
    const ratio = block.maxDurability
      ? clamp((block.durability ?? block.maxDurability) / block.maxDurability, 0, 1)
      : 1

    // 面板交给 blockArt 的纯函数画：局内和图鉴走同一个入口，
    // 预览就不可能画出「看着对但其实不是」的方块。
    drawBlockFace(ctx, { x, y, w: width, h: BLOCK_H }, {
      colors: this._blockColors(block),
      materialId: this.material.id,
      motifOverride: typeArt.motif ? { motif: typeArt.motif } : null,
      tint: typeArt.tint,
      theme: this.theme
    }, {
      index: block.index || 0,
      damage01: block.index > 0 && block.maxDurability ? ratio : null,
      perfect: hasTag(block, 'perfect'),
      snow: this.level.weatherKind === 'snow',
      flash: block.damageFlash > 0 ? Math.min(0.5, block.damageFlash) : 0
    })

    // 火焰层：沿顶边跳动的 Kenney 火苗。这是动画，留在渲染层。
    if (typeArt.edge === 'flame') {
      const flick = 0.6 + 0.4 * Math.sin(this.time * 20 + cx)
      ctx.strokeStyle = `rgba(255,140,40,${flick})`
      ctx.lineWidth = 2
      ctx.strokeRect(x - 0.5, y - 0.5, width + 1, BLOCK_H + 1)
      const n = Math.max(2, Math.floor(width / 52))
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < n; i++) {
        const fimg = tinted('flame' + ((i % 6) + 1), '#ff9a3c')
        if (!fimg) continue
        const fx = x + (width * (i + 0.5)) / n
        const fl = 0.72 + 0.28 * Math.sin(this.time * 13 + i * 2.4 + cx * 0.05)
        const fh = 36 * fl
        const fw = fh * 0.62
        ctx.drawImage(fimg, fx - fw / 2, y - fh + 7, fw, fh)
      }
      ctx.restore()
    }

    // 耐久条只在真的掉过耐久时出现。以前每层都常驻一条，
    // 14 层挂 14 条血条，等于没有任何一层在报警。
    if (block.index > 0 && block.maxDurability && ratio < 1) {
      const barW = Math.min(width, 92)
      const barX = cx - barW / 2
      const barY = y - 6
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(barX, barY, barW, 3)
      ctx.fillStyle = ratio > 0.55 ? '#7cf29b' : ratio > 0.25 ? '#ffd36b' : '#ff6b73'
      ctx.fillRect(barX, barY, barW * ratio, 3)
    }
  },

  _drawTower(ctx) {
    // 已放置方块（带高空晃动：底部固定，越往上摆幅越大）
    for (const b of this.blocks) {
      const wy = this.worldY(b.index)
      const sy = this.screenY(wy)
      if (sy < -BLOCK_H - 10 || sy > this.viewH + 20) continue
      this._drawBlock(ctx, b.cx + this.swayOffset(b.index), sy, b.width, b)
    }

    // 被切下的板材（翻滚坠落的切片）
    for (const s of this.cutSlabs) {
      const sy = this.screenY(s.wy)
      if (sy < -80 || sy > this.viewH + 120) continue
      const a = clamp(s.life / s.maxLife, 0, 1)
      ctx.save()
      ctx.globalAlpha = Math.min(1, a * 1.6)
      ctx.translate(s.wx, sy + s.h / 2)
      ctx.rotate(s.rot)
      // 板材本体
      const grad = ctx.createLinearGradient(0, -s.h / 2, 0, s.h / 2)
      grad.addColorStop(0, s.c1)
      grad.addColorStop(0.55, s.c2)
      grad.addColorStop(1, 'rgba(0,0,0,0.35)')
      ctx.fillStyle = grad
      this._roundRect(ctx, -s.w / 2, -s.h / 2, s.w, s.h, Math.min(4, s.w / 2))
      ctx.fill()
      // 切口断面高光
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 1.4
      ctx.stroke()
      ctx.restore()
      ctx.globalAlpha = 1
    }

    // 坠落方块
    if (this.fallingBlock) {
      const fb = this.fallingBlock
      const sy = this.screenY(fb.wy)
      ctx.save()
      ctx.translate(fb.cx, sy + BLOCK_H / 2)
      ctx.rotate(fb.rot)
      ctx.globalAlpha = clamp(fb.life, 0, 1)
      this._drawBlock(ctx, 0, -BLOCK_H / 2, fb.width, { typeId: 'normal', tags: [] })
      ctx.restore()
      ctx.globalAlpha = 1
    }

    // 待落方块（吊在半空，不随楼体摆动——玩家要掐楼体荡回来的时机）
    if (this.moving && this.status === 'playing') {
      const wy = this.worldY(this.moving.index)
      const sy = this.screenY(wy) - this.riseOffset
      this._drawBlock(ctx, this.moving.cx, sy, this.moving.width, this.moving)
      // 落点指示线（跟随晃动中的楼顶）
      const prev = this.blocks[this.blocks.length - 1]
      const prevCxNow = prev.cx + this.swayOffset(prev.index)
      ctx.save()
      ctx.globalAlpha = 0.25
      ctx.strokeStyle = '#ffffff'
      ctx.setLineDash([4, 6])
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(prevCxNow, sy + BLOCK_H)
      ctx.lineTo(prevCxNow, this.screenY(this.worldY(prev.index)))
      ctx.stroke()
      ctx.restore()
    }
  },


  _drawEffects(ctx) {
    // 切口闪光：沿切割面的高亮竖条 + 向外扩散的冲击弧
    for (const f of this.cutFx) {
      const t = 1 - f.life / f.maxLife
      const a = clamp(f.life / f.maxLife, 0, 1)
      const sy = this.screenY(f.wy)
      ctx.save()
      ctx.globalAlpha = a
      // 竖向高亮切割线
      const lg = ctx.createLinearGradient(f.wx - 6, 0, f.wx + 6, 0)
      lg.addColorStop(0, 'rgba(255,255,255,0)')
      lg.addColorStop(0.5, 'rgba(255,255,255,0.95)')
      lg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = lg
      const hh = BLOCK_H / 2 + 6 + t * 14
      ctx.fillRect(f.wx - 6, sy - hh, 12, hh * 2)
      // 向切除方向扩散的冲击弧
      ctx.globalAlpha = a * 0.75
      ctx.strokeStyle = '#fff3c4'
      ctx.lineWidth = 2.4 * (1 - t) + 0.6
      ctx.beginPath()
      ctx.ellipse(f.wx + f.side * t * 26, sy, 8 + t * 46, BLOCK_H * 0.6 + t * 20, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
    ctx.globalAlpha = 1

    // 恢复脉冲
    if (this.restorePulse) {
      const rp = this.restorePulse
      const t = 1 - rp.life / rp.maxLife
      const sy = this.screenY(rp.wy)
      ctx.save()
      ctx.globalAlpha = rp.life / rp.maxLife
      ctx.strokeStyle = '#4ade80'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(rp.cx, sy, 40 + t * 120, 16 + t * 30, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    // 粒子（带 sprite 的用 Kenney 贴图：白色精灵按 p.color 染色；glow 用加色发光）
    for (const p of this.particles) {
      const sy = this.screenY(p.wy)
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1)
      const pimg = p.sprite ? tinted(p.sprite, p.color || '#ffffff') : null
      if (pimg) {
        const s = p.size * (p.spriteScale || 3)
        ctx.save()
        if (p.glow) ctx.globalCompositeOperation = 'lighter'
        ctx.translate(p.wx, sy)
        if (p.rot != null) ctx.rotate(p.rot)
        ctx.drawImage(pimg, -s / 2, -s / 2, s, s)
        ctx.restore()
        continue
      }
      ctx.fillStyle = p.color
      if (p.rot != null) {
        ctx.save()
        ctx.translate(p.wx, sy)
        ctx.rotate(p.rot)
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
        ctx.restore()
      } else {
        ctx.beginPath()
        ctx.arc(p.wx, sy, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1

    // 浮动文字
    ctx.textAlign = 'center'
    for (const f of this.floatTexts) {
      const sy = this.screenY(f.wy)
      ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1)
      if (!f.pop) {
        ctx.font = 'bold 20px system-ui, sans-serif'
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.fillText(f.text, f.cx + 1, sy + 1)
        ctx.fillStyle = f.color
        ctx.fillText(f.text, f.cx, sy)
        continue
      }
      // 评价大字：0.35 倍瞬间冲到 1.18 倍再回落到 1，做出“砸”在塔顶上的手感
      const t = clamp(1 - f.life / f.maxLife, 0, 1)
      const scale = t < 0.1 ? 0.35 + 8.3 * t : t < 0.28 ? 1.18 - (t - 0.1) : 1
      let px = Math.max(10, Math.round((f.size || 20) * scale))
      ctx.font = `900 ${px}px system-ui, sans-serif`
      let x = f.cx
      if (f.clampX) {
        // 先按画布宽度自动缩字（不同机型 system-ui 字宽差别很大，
        // 「LEGENDARY ×10」这类长文案在窄字体上会直接顶出画布），再做贴边回拉。
        const maxW = LOGICAL_W - 24
        let w = ctx.measureText(f.text).width
        if (w > maxW) {
          px = Math.max(10, Math.floor(px * maxW / w))
          ctx.font = `900 ${px}px system-ui, sans-serif`
          w = ctx.measureText(f.text).width
        }
        const half = w / 2
        x = clamp(f.cx, half + 6, Math.max(half + 6, LOGICAL_W - half - 6))
      }
      ctx.lineJoin = 'round'
      ctx.lineWidth = Math.max(3, px * 0.16)
      ctx.strokeStyle = 'rgba(6,12,22,0.8)'
      ctx.strokeText(f.text, x, sy)
      ctx.shadowColor = f.color
      ctx.shadowBlur = px * 0.55
      ctx.fillStyle = f.color
      ctx.fillText(f.text, x, sy)
      ctx.shadowBlur = 0
      ctx.shadowColor = 'transparent'
    }
    ctx.globalAlpha = 1
    ctx.textAlign = 'start'
  }
}
