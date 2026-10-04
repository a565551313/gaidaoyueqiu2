<template>
  <div class="lab">
    <header class="lab-head">
      <h1>天气 / 敌人 表现预览</h1>
      <p>直接驱动游戏里的真实渲染模块（<code>weatherFx.js</code> / <code>antArt.js</code>），不是另画一套演示。</p>
    </header>

    <div class="lab-body">
      <div class="stage-wrap">
        <canvas ref="cv" class="stage" width="420" height="720"></canvas>
      </div>

      <div class="panel">
        <section>
          <h2>天气</h2>
          <div class="chips">
            <button
              v-for="w in weathers"
              :key="w.id"
              class="chip"
              :class="{ on: weather === w.id }"
              @click="weather = w.id"
            >{{ w.icon }} {{ w.name }}</button>
          </div>
          <label class="slider">
            强度 <b>{{ intensity.toFixed(2) }}</b>
            <input v-model.number="intensity" type="range" min="0" max="1" step="0.01" />
          </label>
          <label class="slider">
            风向 <b>{{ dir > 0 ? '→ 右' : '← 左' }}</b>
            <input v-model.number="dir" type="range" min="-1" max="1" step="2" />
          </label>
          <button class="act" @click="strike">⚡ 触发一次闪电</button>
          <button class="act" @click="hailHit">🧊 触发一次冰雹砸中</button>
        </section>

        <section>
          <h2>蚂蚁</h2>
          <div class="chips">
            <button
              v-for="s in speciesList"
              :key="s.id"
              class="chip"
              :class="{ on: species === s.id }"
              @click="species = s.id"
            >{{ s.shortName }}</button>
          </div>
          <div class="chips">
            <button
              v-for="s in states"
              :key="s.id"
              class="chip sm"
              :class="{ on: antState === s.id }"
              @click="antState = s.id"
            >{{ s.name }}</button>
          </div>
          <label class="slider">
            放大镜 <b>{{ zoom.toFixed(1) }}×</b>
            <input v-model.number="zoom" type="range" min="1" max="5" step="0.5" />
          </label>
          <label class="check">
            <input v-model="showOld" type="checkbox" />
            并排显示旧造型（两个椭圆 + 静止折线腿）
          </label>
        </section>

        <section class="note">
          <h2>这版改了什么</h2>
          <ul>
            <li><b>蚂蚁</b>：头／细腰／胸节／腹部四段剪影，复眼、肘状触角、可开合上颚；6 条两段式关节腿走三角步态；兵种靠体型、巨颚、背甲、翅膀、后冠区分，不再只是换色。</li>
            <li><b>雨</b>：三层景深 + 风切斜角 + 落到塔顶的溅射 + 偶发雨幕。</li>
            <li><b>雹</b>：翻滚多面冰块 + 拖影 + 砸中迸裂碎屑。</li>
            <li><b>雪</b>：64/34/14 三层，近景画真正的六角冰晶；中央操作通道自动淡化。</li>
            <li><b>风</b>：空气速度线 + 翻滚树叶纸片 + 阵风脉冲 + 会飘的旗。</li>
            <li><b>云</b>：径向渐变球叠出的体积团块（前景仍限 α≤0.13 保证方块可读）。</li>
            <li><b>雷</b>：带分叉的主干 + 云层辉光 + 快速明灭。</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CloudField, HailField, RainField, SnowField, WindField, drawBolt, drawSkyGlow, makeBolt, makeRng } from '../core/weatherFx.js'
import { ANT_ART, drawAnt, drawBiteSparks } from '../core/antArt.js'
import { ANT_SPECIES } from '../data/ants.js'

const weathers = [
  { id: 'clear', name: '晴', icon: '☀' },
  { id: 'wind', name: '强风', icon: '🌬' },
  { id: 'rain', name: '暴雨', icon: '🌧' },
  { id: 'hail', name: '冰雹', icon: '🧊' },
  { id: 'snow', name: '飘雪', icon: '❄' },
  { id: 'cloud', name: '低云', icon: '☁' },
  { id: 'lightning', name: '雷暴', icon: '⚡' }
]
const states = [
  { id: 'climb', name: '攀爬' },
  { id: 'windup', name: '预备' },
  { id: 'bite', name: '咬击' },
  { id: 'stunned', name: '受击' },
  { id: 'retreat', name: '撤退' }
]
const speciesList = Object.values(ANT_SPECIES)

const cv = ref(null)
const weather = ref('rain')
const intensity = ref(0.7)
const dir = ref(1)
const species = ref('worker')
const antState = ref('bite')
const zoom = ref(2.5)
const showOld = ref(true)

let raf = 0
let last = 0
let t = 0
const rng = makeRng(20261003)
const fx = {
  rain: new RainField(7),
  hail: new HailField(11),
  snow: new SnowField(23),
  wind: new WindField(31),
  cloud: new CloudField(41, 6)
}
let bolt = null
let boltLife = 0
let skyGlow = 0
let glowAt = { x: 210, y: 80 }
let flash = 0

function strike() {
  const x0 = 60 + Math.random() * 300
  bolt = makeBolt(rng, { x0, y0: -10, y1: 300 + Math.random() * 220, width: 70, forks: 4, steps: 10 })
  boltLife = 0.36
  skyGlow = 1
  flash = 0.7
  glowAt = { x: x0, y: 70 }
}
function hailHit() {
  fx.hail.impact(210 + (Math.random() - 0.5) * 90, 392, 1.4)
}

const SKY = {
  clear: [[27, 95, 128], [185, 217, 206]],
  wind: [[77, 155, 184], [225, 215, 169]],
  rain: [[58, 86, 116], [140, 158, 172]],
  hail: [[70, 86, 98], [168, 172, 160]],
  snow: [[108, 139, 166], [209, 216, 213]],
  cloud: [[88, 111, 145], [185, 196, 201]],
  lightning: [[40, 52, 78], [120, 132, 144]]
}

function drawSky(ctx) {
  const [a, b] = SKY[weather.value] || SKY.clear
  const g = ctx.createLinearGradient(0, 0, 0, 720)
  g.addColorStop(0, `rgb(${a.join(',')})`)
  g.addColorStop(1, `rgb(${b.join(',')})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 420, 720)
}

// 一座简易塔，用来给蚂蚁站位、给雨雹提供溅射平面
const TOP_Y = 392
const BLOCK_H = 28
function drawTower(ctx) {
  for (let i = 0; i < 11; i++) {
    const y = TOP_Y + i * BLOCK_H
    const w = 150 - i * 2
    const grad = ctx.createLinearGradient(0, y, 0, y + BLOCK_H)
    grad.addColorStop(0, i === 0 ? '#c98a56' : '#b9794a')
    grad.addColorStop(1, '#8e4d2f')
    ctx.fillStyle = grad
    ctx.fillRect(210 - w / 2, y, w, BLOCK_H - 1)
    ctx.strokeStyle = 'rgba(40,22,12,.55)'
    ctx.lineWidth = 1
    ctx.strokeRect(210 - w / 2 + 0.5, y + 0.5, w - 1, BLOCK_H - 2)
  }
}

// 旧造型：原封不动照搬改之前的 _renderAnt 画法，用于直观对比
function drawOldAnt(ctx, color, side) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.ellipse(0, 0, 4.5, 3, 0, 0, Math.PI * 2)
  ctx.ellipse(side < 0 ? 5 : -5, 0, 3.5, 2.6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  for (let leg = -1; leg <= 1; leg++) {
    const lx = leg * 2
    ctx.moveTo(lx, -1); ctx.lineTo(lx - 3, -5 + Math.abs(leg)); ctx.lineTo(lx - 4, -7 + Math.abs(leg))
    ctx.moveTo(lx, 1); ctx.lineTo(lx - 3, 5 - Math.abs(leg)); ctx.lineTo(lx - 4, 7 - Math.abs(leg))
  }
  ctx.moveTo(side < 0 ? 8 : -8, -1); ctx.lineTo(side < 0 ? 10 : -10, -4)
  ctx.moveTo(side < 0 ? 8 : -8, 1); ctx.lineTo(side < 0 ? 10 : -10, 4)
  ctx.stroke()
  ctx.restore()
}

function label(ctx, text, x, y, color = '#eaf6ff') {
  ctx.save()
  ctx.font = 'bold 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  const w = ctx.measureText(text).width + 12
  ctx.fillStyle = 'rgba(6,14,26,.72)'
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - 11, w, 16, 8); ctx.fill()
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}

function frame(now) {
  raf = requestAnimationFrame(frame)
  const ctx = cv.value?.getContext('2d')
  if (!ctx) return
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016
  last = now
  t += dt

  const kind = weather.value
  const k = intensity.value
  const d = dir.value >= 0 ? 1 : -1

  fx.rain.update(dt, { intensity: kind === 'rain' ? k : 0, dir: d * 0.55, impactY: TOP_Y })
  fx.hail.update(dt, { intensity: kind === 'hail' ? k : 0, impactY: TOP_Y })
  fx.snow.update(dt, { coverage: kind === 'snow' ? k : 0 })
  fx.wind.update(dt, { intensity: kind === 'wind' ? k : 0, dir: d })
  fx.cloud.update(dt, { dir: d, speed: 1 + k })
  if (boltLife > 0) { boltLife -= dt; if (boltLife <= 0) bolt = null }
  if (skyGlow > 0) skyGlow = Math.max(0, skyGlow - dt * 1.9)
  if (flash > 0) flash = Math.max(0, flash - dt * 1.9)

  ctx.clearRect(0, 0, 420, 720)
  drawSky(ctx)

  // 背景云
  if (kind === 'cloud') fx.cloud.draw(ctx, { alpha: Math.min(0.3, 0.1 + k * 0.3), tint: '86,107,131' })
  if (kind === 'lightning') {
    fx.cloud.draw(ctx, { alpha: 0.3, tint: '38,49,74' })
    if (skyGlow > 0) drawSkyGlow(ctx, glowAt.x, glowAt.y, 200, skyGlow)
  }

  drawTower(ctx)

  // ---- 蚂蚁 ----
  const art = ANT_ART[species.value] || ANT_ART.worker
  const color = ANT_SPECIES[species.value].color
  const st = antState.value
  const walking = st === 'climb' || st === 'retreat'
  const gait = art.gait * (st === 'retreat' ? 1.5 : 1)
  const walk = t * (walking ? gait : gait * 0.15)
  const bite = st === 'bite'
    ? (0.5 + 0.5 * Math.sin(t * 17)) ** 0.7
    : st === 'windup' ? 0.25 + 0.25 * Math.sin(t * 5) : 0
  const angle = st === 'windup' || st === 'bite' ? Math.PI : st === 'retreat' ? Math.PI / 2 : -Math.PI / 2

  // 塔上实际尺寸（右侧）
  const standoff = 7 + art.scale * 3.4
  const antX = 210 + 75 + standoff
  const antY = TOP_Y + BLOCK_H * 2.5
  ctx.save()
  ctx.translate(antX, antY)
  if (st === 'stunned') ctx.translate(Math.sin(t * 42) * 1.1, 0)
  ctx.rotate(angle)
  drawAnt(ctx, { speciesId: species.value, color, time: t, seed: 1.37, walk, bite, flash: st === 'stunned' ? 0.8 : 0 })
  if (st === 'bite') drawBiteSparks(ctx, { speciesId: species.value, time: t, seed: 1.37 })
  ctx.restore()
  label(ctx, '游戏内实际大小', antX + 4, antY + 46)

  // 放大对照（左侧）
  const zx = 96
  const zy = 250
  ctx.save()
  ctx.translate(zx, zy)
  ctx.scale(zoom.value, zoom.value)
  ctx.rotate(angle)
  drawAnt(ctx, { speciesId: species.value, color, time: t, seed: 1.37, walk, bite, flash: st === 'stunned' ? 0.8 : 0 })
  if (st === 'bite') drawBiteSparks(ctx, { speciesId: species.value, time: t, seed: 1.37 })
  ctx.restore()
  label(ctx, `新造型 ${zoom.value.toFixed(1)}×`, zx, zy + 26 * zoom.value + 18, '#9ff2c8')

  if (showOld.value) {
    const ox = 320
    const oy = 250
    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(zoom.value, zoom.value)
    drawOldAnt(ctx, color, 1)
    ctx.restore()
    label(ctx, `旧造型 ${zoom.value.toFixed(1)}×`, ox, oy + 26 * zoom.value + 18, '#ffb0a0')
  }

  // ---- 前景天气 ----
  if (kind === 'rain') fx.rain.draw(ctx)
  if (kind === 'hail') fx.hail.draw(ctx)
  if (kind === 'snow') fx.snow.draw(ctx)
  if (kind === 'wind') { fx.wind.draw(ctx); fx.wind.drawFlag(ctx, 50, 120, d, 'rgba(181,234,218,.9)') }
  if (kind === 'cloud') {
    for (const baseY of [206, 560]) {
      const x = ((t * 26 * d) % 630) - 100
      ctx.save()
      ctx.globalAlpha = Math.min(0.13, 0.045 + k * 0.14)
      for (const [dx, dy, rr, kk] of [[0, 0, 46, 0.78], [40, -9, 32, 0.62], [84, 3, 42, 0.7], [-34, 5, 28, 0.55]]) {
        const g = ctx.createRadialGradient(x + dx, baseY + dy - rr * 0.3, rr * 0.12, x + dx, baseY + dy, rr)
        g.addColorStop(0, 'rgba(255,255,255,1)')
        g.addColorStop(0.5, `rgba(227,234,240,${kk})`)
        g.addColorStop(1, 'rgba(227,234,240,0)')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.ellipse(x + dx, baseY + dy, rr, rr * 0.62, 0, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()
    }
  }
  if (kind === 'lightning' && bolt) {
    const a = Math.max(0, Math.min(1, boltLife / 0.34))
    drawBolt(ctx, bolt, { alpha: a * (0.5 + 0.5 * Math.abs(Math.sin(boltLife * 46))), width: 3.2, glowBlur: 20 })
  }
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(flash * 0.5).toFixed(3)})`
    ctx.fillRect(0, 0, 420, 720)
  }
}

onMounted(() => {
  const c = cv.value
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  c.width = 420 * dpr
  c.height = 720 * dpr
  c.getContext('2d').scale(dpr, dpr)
  raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
watch(weather, (v) => { if (v === 'lightning') strike() })
</script>

<style scoped>
.lab {
  min-height: 100vh;
  background: radial-gradient(1200px 700px at 20% -10%, #1d2a44, #0b1020 60%);
  color: #e8f2ff;
  font-family: system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  padding: 22px clamp(14px, 4vw, 46px) 60px;
  box-sizing: border-box;
}
.lab-head h1 { margin: 0 0 6px; font-size: clamp(19px, 2.4vw, 25px); letter-spacing: .4px; }
.lab-head p { margin: 0 0 20px; color: #8fa6c4; font-size: 13px; }
code { background: #ffffff14; padding: 1px 6px; border-radius: 5px; font-size: 12px; }
.lab-body { display: flex; gap: 26px; align-items: flex-start; flex-wrap: wrap; }
.stage-wrap {
  border-radius: 20px; overflow: hidden; flex: 0 0 auto;
  box-shadow: 0 24px 60px #0008, 0 0 0 1px #ffffff1a;
}
.stage { display: block; width: 420px; height: 720px; max-width: 92vw; height: auto; aspect-ratio: 420 / 720; }
.panel { flex: 1 1 320px; min-width: 300px; max-width: 540px; display: flex; flex-direction: column; gap: 18px; }
section {
  background: #ffffff0a; border: 1px solid #ffffff1a; border-radius: 16px; padding: 16px 18px;
}
h2 { margin: 0 0 12px; font-size: 14px; color: #9fd8ff; letter-spacing: .6px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.chip {
  background: #ffffff12; border: 1px solid #ffffff1f; color: #dceaff; border-radius: 999px;
  padding: 7px 14px; font-size: 13px; cursor: pointer; transition: .16s;
}
.chip.sm { padding: 5px 11px; font-size: 12px; }
.chip:hover { background: #ffffff1f; }
.chip.on { background: linear-gradient(135deg, #4b8dff, #6ad6c8); color: #06121f; border-color: transparent; font-weight: 700; }
.slider { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #b7cbe4; margin-bottom: 10px; }
.slider b { color: #9ff2c8; min-width: 46px; font-variant-numeric: tabular-nums; }
.slider input { flex: 1; accent-color: #6ad6c8; }
.check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #b7cbe4; cursor: pointer; }
.act {
  display: block; width: 100%; margin-top: 8px; background: #ffffff12; border: 1px solid #ffffff22;
  color: #e8f2ff; border-radius: 10px; padding: 9px; font-size: 13px; cursor: pointer;
}
.act:hover { background: #ffffff1f; }
.note ul { margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.75; color: #b7cbe4; }
.note b { color: #e8f2ff; }
</style>
