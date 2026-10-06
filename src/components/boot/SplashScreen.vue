<template>
  <div class="screen splash-screen" @pointerdown="skip" @keydown="skip">
    <div class="splash-backdrop" aria-hidden="true"></div>
    <div class="splash-hero" aria-hidden="true">
      <img src="/assets/art/hero-scene.svg" alt="" />
    </div>
    <div class="splash-copy">
      <p class="splash-kicker">MOONWARD · ASCENT</p>
      <h1>盖到月球<span>2</span></h1>
      <p class="splash-sub">逐层登月 · 建到天际线之上</p>
    </div>
    <div class="splash-stars" aria-hidden="true">
      <i v-for="i in 3" :key="i" :style="{ animationDelay: `${(i - 1) * 0.22}s` }"></i>
    </div>
    <footer class="splash-foot">
      <small>v{{ version }} · 官方</small>
    </footer>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import packageInfo from '../../../package.json'

const emit = defineEmits(['done'])
const props = defineProps({
  duration: { type: Number, default: 1600 }
})

// 首次交互在此页完成音频解锁：App.vue 在 window 上挂了 pointerdown/keydown
// 一次性解锁监听（见 App.vue onMounted），启动页任意点击/按键即触发，无需本组件重复处理
const version = packageInfo.version
const done = ref(false)
let timer = null

function finish() {
  if (done.value) return
  done.value = true
  timer && clearTimeout(timer)
  emit('done')
}
function skip() {
  finish()
}

onMounted(() => {
  timer = setTimeout(finish, props.duration)
})
onBeforeUnmount(() => {
  timer && clearTimeout(timer)
})
</script>

<style scoped>
.splash-screen{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;overflow:hidden;background:#050817;color:#eef7ff;cursor:pointer}
.splash-backdrop{position:absolute;inset:0;z-index:-2;background:url('/assets/art/orbit-bg.svg') center/cover no-repeat;transform:scale(1.06);animation:splash-drift 14s ease-in-out infinite alternate;opacity:.9}
.splash-screen::after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(3,6,18,.25),rgba(3,6,18,.55) 60%,#050817 100%)}
.splash-hero{width:min(72vw,320px);filter:drop-shadow(0 16px 30px #06070fcc);animation:splash-zoom 1.3s cubic-bezier(.2,.7,.3,1) both}
.splash-hero img{width:100%;height:auto;display:block}
.splash-copy{text-align:center;text-shadow:0 4px 18px #0009;animation:splash-rise .8s .25s cubic-bezier(.2,.7,.3,1) both}
.splash-kicker{margin:0;color:#75ddff;font-size:10px;letter-spacing:.34em;font-weight:900}
.splash-copy h1{margin:6px 0 0;font-size:clamp(40px,11vw,60px);letter-spacing:.05em;line-height:1;color:#f5fbff;text-shadow:0 3px 0 #20527e,0 0 30px #55dfff66}
.splash-copy h1 span{color:#ffd466}
.splash-sub{margin:8px 0 0;color:#b1cee3;font-size:12px;font-weight:700;letter-spacing:.12em}
.splash-stars{display:flex;gap:8px;margin-top:14px}
.splash-stars i{width:7px;height:7px;border-radius:50%;background:#ffd466;box-shadow:0 0 8px #ffd46699;animation:splash-blink 1s ease-in-out infinite}
.splash-foot{position:absolute;bottom:calc(var(--safe-bottom,0px) + 14px);color:#5c7288;font-size:10px;font-weight:700;letter-spacing:.08em}
@keyframes splash-drift{from{transform:scale(1.06) translate3d(0,0,0)}to{transform:scale(1.12) translate3d(-10px,-8px,0)}}
@keyframes splash-zoom{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}
@keyframes splash-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes splash-blink{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
</style>
