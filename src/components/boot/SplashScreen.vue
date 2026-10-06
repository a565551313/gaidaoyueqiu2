<template>
  <div class="screen splash-screen" @pointerdown="skip" @keydown="skip">
    <div class="splash-backdrop" aria-hidden="true">
      <i class="splash-planet"></i>
    </div>
    <div class="splash-stars" aria-hidden="true">
      <i v-for="i in 3" :key="i" :style="{ animationDelay: `${(i - 1) * 1.1}s` }"></i>
    </div>
    <div class="splash-hero" aria-hidden="true">
      <div class="splash-sweep"></div>
      <img src="/assets/art/hero-scene.svg" alt="" />
    </div>
    <div class="splash-copy">
      <p class="splash-kicker">MOONWARD · ASCENT</p>
      <h1>盖到月球<span>2</span></h1>
      <p class="splash-sub">逐层登月 · 建到天际线之上</p>
    </div>
    <div class="splash-tap" aria-hidden="true"><i></i><span>点击任意处 · 起飞</span></div>
    <footer class="splash-foot">
      <span class="splash-ver">BUILD v{{ version }}</span>
      <span class="splash-official">OFFICIAL · 官方</span>
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

/* —— 背景：星云贴图 + 底部星球弧光地平线 —— */
.splash-backdrop{position:absolute;inset:0;z-index:-2;background:url('/assets/art/orbit-bg.svg') center/cover no-repeat;transform:scale(1.06);animation:splash-drift 14s ease-in-out infinite alternate;opacity:.9}
.splash-planet{position:absolute;left:50%;bottom:-58vw;width:130vw;height:130vw;transform:translateX(-50%);border-radius:50%;
  background:
    radial-gradient(circle at 50% 12%, rgba(82,216,255,.28), rgba(37,104,219,.12) 30%, transparent 58%),
    radial-gradient(circle at 50% 0%, #10305c 0%, #081d3c 54%, transparent 55.5%);
  box-shadow:0 -10px 80px rgba(82,216,255,.28), 0 -2px 0 rgba(180,240,255,.5)}
.splash-screen::after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(3,6,18,.3),rgba(3,6,18,.45) 55%,rgba(4,7,20,.9) 92%)}

/* —— 星空：微闪星点层 + 三道流星 —— */
.splash-stars{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.splash-stars::before{content:'';position:absolute;inset:-60%;
  background-image:
    radial-gradient(1.5px 1.5px at 22% 31%, #cfeaff 50%, transparent 51%),
    radial-gradient(1px 1px at 68% 12%, #9fd4ff 50%, transparent 51%),
    radial-gradient(2px 2px at 84% 62%, #fff 50%, transparent 51%),
    radial-gradient(1px 1px at 45% 74%, #bfe9ff 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 8% 58%, #eaf7ff 50%, transparent 51%);
  background-size:290px 210px;opacity:.7;animation:star-drift 26s linear infinite}
.splash-stars i{position:absolute;top:20%;left:-14%;width:96px;height:1px;background:linear-gradient(90deg,transparent,#cfeeff,transparent);transform:rotate(-24deg);opacity:0;animation:shoot 3.4s ease-in infinite}
.splash-stars i:nth-child(2){top:42%;width:64px;animation-delay:1.2s}
.splash-stars i:nth-child(3){top:9%;width:130px;animation-delay:2.3s}

/* —— 主视觉：贴图 + 掠光 —— */
.splash-hero{position:relative;width:min(72vw,320px);filter:drop-shadow(0 16px 30px #06070fcc);animation:splash-zoom 1.3s cubic-bezier(.2,.7,.3,1) both}
.splash-hero img{width:100%;height:auto;display:block}
.splash-sweep{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2}
.splash-sweep::after{content:'';position:absolute;top:-20%;left:-40%;width:34%;height:140%;transform:rotate(18deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.15),transparent);animation:hero-sweep 2.9s ease-in-out infinite}

/* —— 标题组：金箔小字 + 街机厚阴影大字 —— */
.splash-copy{text-align:center;animation:splash-rise .8s .25s cubic-bezier(.2,.7,.3,1) both}
.splash-kicker{margin:0;display:inline-flex;align-items:center;gap:10px;color:#ffd36e;font-size:10px;font-weight:900;letter-spacing:.34em;text-shadow:0 0 12px rgba(255,211,110,.4)}
.splash-kicker::before,.splash-kicker::after{content:'';width:26px;height:2px;background:linear-gradient(90deg,transparent,#ffd36e)}
.splash-kicker::after{background:linear-gradient(90deg,#ffd36e,transparent)}
.splash-copy h1{margin:8px 0 0;font-size:clamp(42px,11.5vw,62px);font-weight:900;letter-spacing:.05em;line-height:1;color:#f5fbff;text-shadow:0 3px 0 #1d4f7d,0 6px 0 #0b2440,0 0 34px rgba(85,223,255,.45)}
.splash-copy h1 span{margin-left:2px;color:#ffd36e;text-shadow:0 3px 0 #8f5a12,0 6px 0 #4d2c05,0 0 28px rgba(255,211,110,.55)}
.splash-sub{margin:10px 0 0;color:#9fc6e8;font-size:12px;letter-spacing:.28em;text-indent:.28em}

/* —— 起飞提示（脉动） —— */
.splash-tap{position:absolute;bottom:calc(var(--safe-bottom,0px) + 68px);left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:9px;color:#8fd4ff;font-size:11px;font-weight:900;letter-spacing:.22em;animation:tap-pulse 1.8s ease-in-out infinite}
.splash-tap i{width:9px;height:9px;border:2px solid #8fd4ff;border-radius:50%;box-shadow:0 0 0 0 rgba(143,212,255,.45)}
.splash-tap span{text-shadow:0 0 12px rgba(82,216,255,.5)}

/* —— 底栏：版本铭牌（斜切角） + 官方标 —— */
.splash-foot{position:absolute;bottom:calc(var(--safe-bottom,0px) + 18px);left:20px;right:20px;display:flex;align-items:center;justify-content:space-between}
.splash-ver{padding:4px 10px;font-size:10px;font-weight:900;letter-spacing:.14em;color:#ffd36e;background:#241b0c;border:1px solid rgba(255,211,110,.45);clip-path:polygon(0 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%)}
.splash-official{color:#5c7288;font-size:10px;font-weight:900;letter-spacing:.3em}

@keyframes splash-drift{0%{transform:scale(1.06) translateX(0)}100%{transform:scale(1.09) translateX(-9px)}}
@keyframes star-drift{0%{transform:translate(0,0)}100%{transform:translate(-290px,-105px)}}
@keyframes shoot{0%{transform:translateX(0) rotate(-24deg);opacity:0}6%{opacity:.9}24%{transform:translateX(125vw) rotate(-24deg);opacity:0}100%{transform:translateX(125vw) rotate(-24deg);opacity:0}}
@keyframes hero-sweep{0%{left:-45%}55%,100%{left:135%}}
@keyframes splash-zoom{from{transform:scale(.82);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes splash-rise{from{transform:translateY(18px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes tap-pulse{0%,100%{opacity:.45}50%{opacity:1}}

@media (prefers-reduced-motion: reduce){
  .splash-backdrop,.splash-stars::before,.splash-stars i,.splash-sweep::after,.splash-tap{animation:none}
}
</style>
