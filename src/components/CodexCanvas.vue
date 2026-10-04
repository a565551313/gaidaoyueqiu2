<template>
  <canvas ref="el" class="codex-canvas" :style="{ width: width + 'px', height: height + 'px' }"></canvas>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'

// 图鉴的 canvas 预览。只做三件事：按 DPR 开画布、按帧推进时间、调条目给的 draw。
// draw 是适配器从真实渲染器拿来的，这里不知道画的是方块还是蚂蚁。
const props = defineProps({
  draw: { type: Function, required: true },
  width: { type: Number, default: 160 },
  height: { type: Number, default: 90 },
  animated: { type: Boolean, default: true }
})

const el = ref(null)
let raf = 0
let start = 0

function frame(now) {
  const canvas = el.value
  if (!canvas) return
  if (!start) start = now
  const t = (now - start) / 1000
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
  const w = props.width
  const h = props.height
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  try { props.draw(ctx, w, h, t) } catch (err) { /* 预览不该让页面崩 */ }
  if (props.animated) raf = requestAnimationFrame(frame)
}

function restart() {
  cancelAnimationFrame(raf)
  start = 0
  raf = requestAnimationFrame(frame)
}

onMounted(restart)
onBeforeUnmount(() => cancelAnimationFrame(raf))
watch(() => [props.draw, props.width, props.height], restart)
</script>

<style scoped>
.codex-canvas{display:block;image-rendering:auto}
</style>
