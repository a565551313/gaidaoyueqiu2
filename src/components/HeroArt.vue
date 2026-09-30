<template>
  <canvas ref="cv" class="hero-canvas"></canvas>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const cv = ref(null)
let raf = 0
let t = 0
let ro = null
let meteors = []
let nextMeteorAt = 2.5

function resolvedDark() {
  return true
}

function drawMeteors(ctx, w, h) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  if (t >= nextMeteorAt) {
    const startX = w * (0.35 + Math.random() * 0.65)
    const startY = h * (0.04 + Math.random() * 0.3)
    meteors.push({ x: startX, y: startY, vx: -3.8, vy: 2.6, life: 1 })
    nextMeteorAt = t + 3.5 + Math.random() * 4.5
  }
  meteors = meteors.filter((meteor) => meteor.life > 0)
  for (const meteor of meteors) {
    const tailX = meteor.x - meteor.vx * 8
    const tailY = meteor.y - meteor.vy * 8
    const trail = ctx.createLinearGradient(meteor.x, meteor.y, tailX, tailY)
    trail.addColorStop(0, `rgba(255,247,204,${meteor.life * 0.95})`)
    trail.addColorStop(1, 'rgba(255,196,109,0)')
    ctx.strokeStyle = trail
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(meteor.x, meteor.y)
    ctx.lineTo(tailX, tailY)
    ctx.stroke()
    ctx.fillStyle = `rgba(255,250,220,${meteor.life})`
    ctx.beginPath()
    ctx.arc(meteor.x, meteor.y, 2.2, 0, Math.PI * 2)
    ctx.fill()
    meteor.x += meteor.vx
    meteor.y += meteor.vy
    meteor.life -= 0.018
  }
}

function draw() {
  const canvas = cv.value
  if (!canvas) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr
    canvas.height = h * dpr
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const dark = resolvedDark()

  // 天空渐变
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  if (dark) {
    sky.addColorStop(0, '#102c40')
    sky.addColorStop(0.58, '#245d67')
    sky.addColorStop(1, '#a06054')
  } else {
    sky.addColorStop(0, '#25516b')
    sky.addColorStop(0.56, '#579a91')
    sky.addColorStop(1, '#f0aa68')
  }
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  // 星星
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  const seedStars = 46
  for (let i = 0; i < seedStars; i++) {
    const sx = ((i * 97) % w)
    const sy = ((i * 53) % (h * 0.7))
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + i))
    ctx.globalAlpha = tw * 0.9
    const r = (i % 4 === 0) ? 1.8 : 1.1
    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  drawMeteors(ctx, w, h)

  // 月亮
  const moonX = w * 0.72
  const moonY = h * 0.28
  const moonR = Math.min(w, h) * 0.17
  const glow = ctx.createRadialGradient(moonX, moonY, moonR * 0.5, moonX, moonY, moonR * 2.4)
  glow.addColorStop(0, 'rgba(255,240,190,0.55)')
  glow.addColorStop(1, 'rgba(255,240,190,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(moonX, moonY, moonR * 2.4, 0, Math.PI * 2)
  ctx.fill()
  const mg = ctx.createRadialGradient(moonX - moonR * 0.3, moonY - moonR * 0.3, moonR * 0.2, moonX, moonY, moonR)
  mg.addColorStop(0, '#fffbe9')
  mg.addColorStop(1, '#ecdca6')
  ctx.fillStyle = mg
  ctx.beginPath()
  ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(190,172,120,0.45)'
  const craters = [
    [-0.32, -0.18, 0.2],
    [0.28, 0.12, 0.24],
    [0.02, 0.42, 0.15],
    [-0.42, 0.3, 0.11]
  ]
  for (const [dx, dy, cr] of craters) {
    ctx.beginPath()
    ctx.arc(moonX + dx * moonR, moonY + dy * moonR, cr * moonR, 0, Math.PI * 2)
    ctx.fill()
  }

  // 云
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.22)'
  drawCloud(ctx, w * 0.22 + Math.sin(t * 0.4) * 6, h * 0.5, 1)
  drawCloud(ctx, w * 0.78 + Math.cos(t * 0.3) * 6, h * 0.62, 0.7)

  // 高塔（堆叠方块）
  const baseY = h * 0.98
  const towerX = w * 0.32
  const layers = 12
  const layerH = (h * 0.62) / layers
  for (let i = 0; i < layers; i++) {
    const prog = i / layers
    const bw = (w * 0.26) * (1 - prog * 0.55)
    const y = baseY - (i + 1) * layerH
    const wob = Math.sin(t * 1.2 + i * 0.6) * (2 + i * 0.4)
    const x = towerX - bw / 2 + wob
    const colors = ['#e96850', '#e68d43', '#e9c45a', '#55b894', '#4d9fb2', '#668bd0']
    const color = colors[(i + 1) % colors.length]
    const grd = ctx.createLinearGradient(0, y, 0, y + layerH)
    grd.addColorStop(0, color)
    grd.addColorStop(1, dark ? '#284a51' : '#3d6863')
    ctx.fillStyle = grd
    roundRect(ctx, x, y, bw, layerH - 3, 5)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    roundRect(ctx, x + 2, y + 2, Math.max(0, bw - 4), 3, 2)
    ctx.fill()
  }
  // 塔尖小旗
  const topY = baseY - layers * layerH
  ctx.strokeStyle = dark ? '#cfd6ff' : '#ffffff'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(towerX, topY)
  ctx.lineTo(towerX, topY - 22)
  ctx.stroke()
  ctx.fillStyle = '#ff6a2b'
  ctx.beginPath()
  ctx.moveTo(towerX, topY - 22)
  ctx.lineTo(towerX + 16, topY - 17)
  ctx.lineTo(towerX, topY - 12)
  ctx.closePath()
  ctx.fill()

  // 火箭/星光点缀
  ctx.globalAlpha = 0.9
  drawSpark(ctx, w * 0.5 + Math.sin(t * 2) * 3, h * 0.2, 6 + Math.sin(t * 3), '#ffe08a')
  ctx.globalAlpha = 1

  // 地面
  const gg = ctx.createLinearGradient(0, baseY - 6, 0, h)
  gg.addColorStop(0, dark ? '#2b3f27' : '#79c079')
  gg.addColorStop(1, dark ? '#1a2a17' : '#4e9a4e')
  ctx.fillStyle = gg
  ctx.fillRect(0, baseY - 4, w, h - baseY + 8)
}

function drawCloud(ctx, x, y, s) {
  ctx.beginPath()
  ctx.ellipse(x, y, 34 * s, 18 * s, 0, 0, Math.PI * 2)
  ctx.ellipse(x - 26 * s, y + 5 * s, 20 * s, 13 * s, 0, 0, Math.PI * 2)
  ctx.ellipse(x + 26 * s, y + 5 * s, 24 * s, 15 * s, 0, 0, Math.PI * 2)
  ctx.fill()
}
function drawSpark(ctx, x, y, r, color) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2)
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(r * 0.3, r * 0.3, 0, r)
    ctx.quadraticCurveTo(-r * 0.3, r * 0.3, 0, 0)
  }
  ctx.fill()
  ctx.restore()
}
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function loop() {
  t += 0.016
  draw()
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  ro = new ResizeObserver(() => draw())
  ro.observe(cv.value)
  loop()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  if (ro) ro.disconnect()
})
</script>

<style scoped>
.hero-canvas {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: var(--radius);
}
</style>
