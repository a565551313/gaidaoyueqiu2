<template>
  <div
    class="animated-pet"
    :class="[`pet-${id}`, { blinking, reacting, 'skill-burst': skillBurst, interactive, reduced: reduceMotion }]"
    :style="{ '--pet-size': `${size}px`, '--pet-color': pet?.color || '#82e7ff', '--pet-accent': pet?.accent || '#ffd66e' }"
    :role="interactive ? 'button' : undefined"
    :tabindex="interactive ? 0 : undefined"
    :aria-label="interactive ? `和${pet?.name || '宠物'}互动` : undefined"
    @click="interact"
    @keydown.enter.prevent="interact"
    @keydown.space.prevent="interact"
  >
    <svg viewBox="0 0 160 160" aria-hidden="true">
      <defs>
        <linearGradient :id="`${uid}-body`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" :stop-color="pet?.color || '#82e7ff'" />
          <stop offset="1" stop-color="#27345f" />
        </linearGradient>
        <linearGradient :id="`${uid}-accent`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="pet?.accent || '#ffd66e'" />
          <stop offset="1" stop-color="#d06142" />
        </linearGradient>
        <filter :id="`${uid}-glow`" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <ellipse class="pet-shadow" cx="80" cy="142" rx="39" ry="8" />
      <circle class="pet-aura" cx="80" cy="78" r="57" />

      <!-- 月岩兔 -->
      <g v-if="id === 'moonRabbit'" class="pet-rig">
        <g class="pet-tail"><circle cx="123" cy="111" r="15" fill="#d9eff8" stroke="#152746" stroke-width="5" /></g>
        <g class="pet-body">
          <ellipse cx="80" cy="105" rx="43" ry="37" :fill="`url(#${uid}-body)`" stroke="#152746" stroke-width="6" />
          <path d="M55 119c14 10 36 12 52 0" fill="none" stroke="#b8efff" stroke-width="5" stroke-linecap="round" opacity=".55" />
        </g>
        <g class="pet-ear pet-ear-left">
          <path d="M54 62C41 43 42 12 55 8c13 11 20 34 17 53z" fill="#d9eff8" stroke="#152746" stroke-width="6" />
          <path d="M55 48c-5-12-4-24 0-29 6 8 9 18 10 30z" fill="#8bd6e9" />
        </g>
        <g class="pet-ear pet-ear-right">
          <path d="M88 59c1-25 10-48 24-50 9 13 3 40-7 57z" fill="#d9eff8" stroke="#152746" stroke-width="6" />
          <path d="M97 49c3-14 8-24 13-28 2 10-1 21-6 31z" fill="#8bd6e9" />
        </g>
        <g class="pet-head">
          <ellipse cx="80" cy="78" rx="39" ry="33" fill="#eaf8ff" stroke="#152746" stroke-width="6" />
          <path d="M46 69c18-13 50-15 68 0l-5 15c-18-8-40-8-58 0z" fill="#263b68" opacity=".95" />
          <path d="M52 68c18-10 39-10 57 0" fill="none" stroke="#7ff0ff" stroke-width="3" :filter="`url(#${uid}-glow)`" />
          <g class="eyes-open" fill="#efffff"><ellipse cx="65" cy="76" rx="4" ry="6" /><ellipse cx="95" cy="76" rx="4" ry="6" /></g>
          <g class="eyes-closed" fill="none" stroke="#efffff" stroke-width="3" stroke-linecap="round"><path d="M60 77q5 4 10 0" /><path d="M90 77q5 4 10 0" /></g>
          <path d="M76 91l4 3 4-3" fill="#ff9b8b" />
          <path d="M69 101q11 7 22 0" fill="none" stroke="#405273" stroke-width="3" stroke-linecap="round" />
          <circle class="scan-light" cx="80" cy="68" r="4" :fill="pet?.accent" />
        </g>
      </g>

      <!-- 云母精灵 -->
      <g v-else-if="id === 'cloudWisp'" class="pet-rig">
        <g class="pet-wing pet-wing-left">
          <path d="M51 78C27 58 12 66 17 86c5 18 23 25 39 22-10-8-13-19-5-30z" fill="#d7efff" stroke="#20305a" stroke-width="5" />
          <path d="M43 78c-12-7-19-2-17 8 2 8 10 12 20 12" fill="none" stroke="#8ecfff" stroke-width="4" />
        </g>
        <g class="pet-wing pet-wing-right">
          <path d="M109 78c24-20 39-12 34 8-5 18-23 25-39 22 10-8 13-19 5-30z" fill="#d7efff" stroke="#20305a" stroke-width="5" />
          <path d="M117 78c12-7 19-2 17 8-2 8-10 12-20 12" fill="none" stroke="#8ecfff" stroke-width="4" />
        </g>
        <g class="pet-body">
          <path d="M42 111c-13-2-18-16-9-25-3-17 14-29 29-22 8-17 32-18 40-1 17-5 31 10 25 26 10 10 3 26-11 27-17 17-58 16-74-5z" :fill="`url(#${uid}-body)`" stroke="#20305a" stroke-width="6" />
          <ellipse cx="80" cy="90" rx="31" ry="27" fill="#e9f8ff" opacity=".95" />
          <g class="eyes-open" fill="#26365c"><ellipse cx="67" cy="88" rx="4" ry="7" /><ellipse cx="93" cy="88" rx="4" ry="7" /></g>
          <g class="eyes-closed" fill="none" stroke="#26365c" stroke-width="3" stroke-linecap="round"><path d="M61 89q6 4 12 0" /><path d="M87 89q6 4 12 0" /></g>
          <path d="M72 103q8 7 16 0" fill="none" stroke="#56698f" stroke-width="3" stroke-linecap="round" />
          <path d="M80 47v12M65 52l6 10M95 52l-6 10" stroke="#d7c7ff" stroke-width="4" stroke-linecap="round" />
        </g>
        <g class="pet-halo">
          <ellipse cx="80" cy="45" rx="27" ry="8" fill="none" :stroke="pet?.accent" stroke-width="4" :filter="`url(#${uid}-glow)`" />
          <circle cx="106" cy="45" r="4" :fill="pet?.color" />
        </g>
      </g>

      <!-- 铆钉犬 -->
      <g v-else-if="id === 'rivetHound'" class="pet-rig">
        <g class="pet-tail"><path d="M116 111c25 4 29-12 20-19" fill="none" stroke="#ffae5f" stroke-width="8" stroke-linecap="round" /><circle cx="137" cy="90" r="6" fill="#6ce5ff" /></g>
        <g class="pet-body">
          <path d="M42 96q8-24 30-23h23q23 2 27 28l-6 30H45z" :fill="`url(#${uid}-body)`" stroke="#142540" stroke-width="6" />
          <path d="M59 113h42" stroke="#82e8ff" stroke-width="4" opacity=".55" />
          <circle cx="58" cy="125" r="8" fill="#172843" stroke="#91edff" stroke-width="3" /><circle cx="105" cy="125" r="8" fill="#172843" stroke="#91edff" stroke-width="3" />
        </g>
        <g class="pet-ear pet-ear-left"><path d="M48 65L31 41l31 9z" fill="#52749a" stroke="#142540" stroke-width="6" /><circle cx="43" cy="51" r="4" fill="#ffb15e" /></g>
        <g class="pet-ear pet-ear-right"><path d="M108 52l28-11-14 28z" fill="#52749a" stroke="#142540" stroke-width="6" /><circle cx="122" cy="52" r="4" fill="#ffb15e" /></g>
        <g class="pet-head">
          <path d="M45 63q35-25 70 0l-3 42q-32 25-65 0z" fill="#6b88a8" stroke="#142540" stroke-width="6" />
          <path d="M51 69q29-17 58 0l-5 21H56z" fill="#142540" />
          <g class="eyes-open" fill="#72eeff"><rect x="61" y="75" width="12" height="6" rx="3" /><rect x="87" y="75" width="12" height="6" rx="3" /></g>
          <g class="eyes-closed" stroke="#72eeff" stroke-width="3"><path d="M61 78h12" /><path d="M87 78h12" /></g>
          <path d="M70 94h20l8 10-18 10-18-10z" fill="#334b68" stroke="#142540" stroke-width="4" />
          <circle cx="80" cy="101" r="4" fill="#ffb15e" />
          <path class="scan-light" d="M55 69h50" stroke="#70ecff" stroke-width="3" />
        </g>
      </g>

      <!-- 燧星狐 -->
      <g v-else-if="id === 'emberFox'" class="pet-rig">
        <g class="pet-tail">
          <path d="M105 118c35 12 48-8 34-28-8-12-21-13-31-5 13 1 19 11 14 19-5 7-12 7-21 3z" :fill="`url(#${uid}-accent)`" stroke="#3d2341" stroke-width="6" />
          <path class="flame-tip" d="M131 96c11-13 17-2 8 8 13-2 11 14-5 15-11-1-16-12-9-21z" fill="#ffe570" />
        </g>
        <g class="pet-body"><ellipse cx="79" cy="108" rx="40" ry="32" :fill="`url(#${uid}-accent)`" stroke="#3d2341" stroke-width="6" /><path d="M62 120q18 10 35-1" fill="none" stroke="#ffe5ba" stroke-width="7" stroke-linecap="round" /></g>
        <g class="pet-ear pet-ear-left"><path d="M53 65L39 25l35 24z" fill="#e97146" stroke="#3d2341" stroke-width="6" /><path d="M51 42l14 10-10 6z" fill="#4b2943" /></g>
        <g class="pet-ear pet-ear-right"><path d="M90 49l33-24-13 42z" fill="#e97146" stroke="#3d2341" stroke-width="6" /><path d="M99 53l14-11-5 17z" fill="#4b2943" /></g>
        <g class="pet-head">
          <path d="M43 65q37-27 74 0l-8 41-29 16-29-16z" fill="#f08a52" stroke="#3d2341" stroke-width="6" />
          <path d="M80 72c-7 17-19 28-31 31l31 19 31-19c-13-3-24-14-31-31z" fill="#fff0ce" />
          <g class="eyes-open" fill="#3c2946"><ellipse cx="65" cy="78" rx="4" ry="7" /><ellipse cx="95" cy="78" rx="4" ry="7" /></g>
          <g class="eyes-closed" fill="none" stroke="#3c2946" stroke-width="3" stroke-linecap="round"><path d="M59 79q6 4 12 0" /><path d="M89 79q6 4 12 0" /></g>
          <path d="M76 96l4 4 4-4" fill="#3c2946" /><path d="M70 106q10 7 20 0" fill="none" stroke="#7b4250" stroke-width="3" />
        </g>
      </g>

      <!-- 星辉猫 -->
      <g v-else class="pet-rig">
        <g class="pet-tail"><path d="M111 111c28 13 34-7 25-20-6-9-16-9-22-4" fill="none" stroke="#9e79c9" stroke-width="14" stroke-linecap="round" /><path d="M136 91c7 8 7 15 1 21" fill="none" stroke="#ffd46a" stroke-width="4" stroke-linecap="round" /></g>
        <g class="pet-body"><ellipse cx="78" cy="108" rx="41" ry="34" :fill="`url(#${uid}-body)`" stroke="#292444" stroke-width="6" /><path d="M64 126h29" stroke="#efdfff" stroke-width="6" stroke-linecap="round" opacity=".6" /></g>
        <g class="pet-ear pet-ear-left"><path d="M49 67L38 31l32 21z" fill="#9876be" stroke="#292444" stroke-width="6" /><path d="M48 45l13 9-10 5z" fill="#d5b6ef" /></g>
        <g class="pet-ear pet-ear-right"><path d="M91 52l31-21-10 37z" fill="#9876be" stroke="#292444" stroke-width="6" /><path d="M100 55l13-10-4 16z" fill="#d5b6ef" /></g>
        <g class="pet-head">
          <path d="M43 64q37-25 74 0l-6 43q-31 25-62 0z" fill="#a988ce" stroke="#292444" stroke-width="6" />
          <path d="M52 69q28-15 56 0" fill="none" stroke="#d7baff" stroke-width="5" opacity=".55" />
          <g class="eyes-open" fill="#ffe274"><ellipse cx="65" cy="80" rx="5" ry="8" /><ellipse cx="95" cy="80" rx="5" ry="8" /><path d="M65 75v10M95 75v10" stroke="#5b426f" stroke-width="2" /></g>
          <g class="eyes-closed" fill="none" stroke="#ffe274" stroke-width="3" stroke-linecap="round"><path d="M58 80q7 5 14 0" /><path d="M88 80q7 5 14 0" /></g>
          <path d="M76 96l4 4 4-4" fill="#f3c1d9" /><path d="M69 107q11 7 22 0" fill="none" stroke="#5b426f" stroke-width="3" />
          <path d="M80 52l3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z" fill="#ffd46a" />
        </g>
        <g class="pet-orbit"><ellipse cx="80" cy="80" rx="62" ry="25" fill="none" stroke="#ffd46a" stroke-width="2" stroke-dasharray="5 8" opacity=".7" /><circle cx="136" cy="88" r="7" fill="#ffd46a" stroke="#6d4b37" stroke-width="3" /></g>
      </g>
    </svg>
    <span v-if="interactive" class="pet-interact-hint">点击互动</span>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { getPet } from '../data/pets.js'

const props = defineProps({
  id: { type: String, required: true },
  size: { type: Number, default: 120 },
  interactive: { type: Boolean, default: false },
  trigger: { type: Number, default: 0 }
})
const emit = defineEmits(['interact'])
const pet = computed(() => getPet(props.id))
const uid = `pet-${Math.random().toString(36).slice(2, 9)}`
const blinking = ref(false)
const reacting = ref(false)
const skillBurst = ref(false)
const reduceMotion = ref(false)
let blinkTimer = 0
let reactTimer = 0
let skillTimer = 0

function scheduleBlink() {
  clearTimeout(blinkTimer)
  if (reduceMotion.value) return
  blinkTimer = setTimeout(() => {
    blinking.value = true
    setTimeout(() => { blinking.value = false }, 140)
    scheduleBlink()
  }, 2200 + Math.random() * 3800)
}
function interact() {
  if (!props.interactive) return
  clearTimeout(reactTimer)
  reacting.value = false
  requestAnimationFrame(() => { reacting.value = true })
  reactTimer = setTimeout(() => { reacting.value = false }, 900)
  emit('interact', props.id)
}
watch(() => props.trigger, (next, prev) => {
  if (next === prev) return
  clearTimeout(skillTimer)
  skillBurst.value = false
  requestAnimationFrame(() => { skillBurst.value = true })
  skillTimer = setTimeout(() => { skillBurst.value = false }, 950)
})
onMounted(() => {
  reduceMotion.value = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
  scheduleBlink()
})
onBeforeUnmount(() => {
  clearTimeout(blinkTimer)
  clearTimeout(reactTimer)
  clearTimeout(skillTimer)
})
</script>

<style scoped>
.animated-pet{position:relative;width:var(--pet-size);height:var(--pet-size);display:inline-grid;place-items:center;filter:drop-shadow(0 12px 12px #02061188);user-select:none}.animated-pet svg{width:100%;height:100%;overflow:visible}.animated-pet.interactive{cursor:pointer;outline:none}.animated-pet.interactive:focus-visible{filter:drop-shadow(0 0 10px var(--pet-color))}.pet-rig{transform-origin:80px 112px;animation:pet-float 3.2s ease-in-out infinite}.pet-body{transform-origin:center;animation:pet-breathe 2.5s ease-in-out infinite}.pet-shadow{fill:#02071566;animation:shadow-breathe 3.2s ease-in-out infinite}.pet-aura{fill:none;stroke:var(--pet-color);stroke-width:2;stroke-dasharray:4 11;opacity:.26;transform-origin:80px 78px;animation:aura-spin 15s linear infinite}.eyes-closed{display:none}.blinking .eyes-open{display:none}.blinking .eyes-closed{display:block}.pet-ear-left,.pet-ear-right{transform-box:fill-box;transform-origin:bottom center}.pet-ear-left{animation:ear-left 4.7s ease-in-out infinite}.pet-ear-right{animation:ear-right 5.1s ease-in-out infinite}.pet-tail{transform-box:fill-box;transform-origin:left center;animation:tail-wave 2.4s ease-in-out infinite}.pet-wing{transform-box:fill-box;transform-origin:center center}.pet-wing-left{transform-origin:right center;animation:wing-left .72s ease-in-out infinite}.pet-wing-right{transform-origin:left center;animation:wing-right .72s ease-in-out infinite}.pet-halo,.pet-orbit{transform-origin:80px 80px;animation:aura-spin 8s linear infinite}.scan-light{filter:drop-shadow(0 0 5px var(--pet-color));animation:scan 2.2s ease-in-out infinite}.flame-tip{transform-box:fill-box;transform-origin:center bottom;animation:flame 0.48s ease-in-out infinite alternate}.reacting .pet-rig{animation:pet-react .85s cubic-bezier(.2,.8,.2,1)}.reacting .pet-ear-left{transform:rotate(-10deg)}.reacting .pet-ear-right{transform:rotate(10deg)}.skill-burst{animation:skill-burst .9s ease-out}.skill-burst .pet-aura{opacity:.9;stroke-width:5;animation:aura-pop .9s ease-out}.skill-burst .pet-wing-left{animation-duration:.18s}.skill-burst .pet-wing-right{animation-duration:.18s}.pet-interact-hint{position:absolute;left:50%;bottom:-2px;transform:translateX(-50%);padding:3px 7px;color:#aeeeff;background:#07162cbb;border:1px solid #6ce4ff55;font-size:9px;font-weight:900;white-space:nowrap;opacity:.72}
@keyframes pet-float{0%,100%{transform:translateY(2px) rotate(-1deg)}50%{transform:translateY(-6px) rotate(1deg)}}@keyframes pet-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.018,.985)}}@keyframes shadow-breathe{0%,100%{transform:scaleX(1);opacity:.55}50%{transform:scaleX(.82);opacity:.35}}@keyframes aura-spin{to{transform:rotate(360deg)}}@keyframes ear-left{0%,82%,100%{transform:rotate(0)}88%{transform:rotate(-8deg)}92%{transform:rotate(4deg)}}@keyframes ear-right{0%,78%,100%{transform:rotate(0)}84%{transform:rotate(7deg)}90%{transform:rotate(-3deg)}}@keyframes tail-wave{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(8deg)}}@keyframes wing-left{0%,100%{transform:rotate(8deg) scaleY(1)}50%{transform:rotate(-24deg) scaleY(.82)}}@keyframes wing-right{0%,100%{transform:rotate(-8deg) scaleY(1)}50%{transform:rotate(24deg) scaleY(.82)}}@keyframes scan{0%,100%{opacity:.35;transform:translateX(-6px)}50%{opacity:1;transform:translateX(6px)}}@keyframes flame{from{transform:scale(.88) rotate(-4deg)}to{transform:scale(1.08) rotate(5deg)}}@keyframes pet-react{0%{transform:translateY(0) scale(1)}25%{transform:translateY(-13px) scale(1.06,.94)}50%{transform:translateY(0) scale(.96,1.05)}72%{transform:translateY(-5px) rotate(4deg)}100%{transform:translateY(0) scale(1)}}@keyframes skill-burst{0%{filter:drop-shadow(0 0 0 var(--pet-color))}35%{filter:drop-shadow(0 0 18px var(--pet-color));transform:scale(1.12)}100%{filter:drop-shadow(0 12px 12px #02061188);transform:scale(1)}}@keyframes aura-pop{0%{transform:scale(.4);opacity:0}45%{transform:scale(1.22);opacity:1}100%{transform:scale(1.5);opacity:0}}
.reduced *{animation-duration:0.001ms!important;animation-iteration-count:1!important}
</style>
