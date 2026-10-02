<template>
  <main class="screen game-menu-screen chapter-screen">
    <div class="title-bar">
      <button class="icon-btn" type="button" aria-label="返回主菜单" @click="back"><BackIcon /></button>
      <h2>章节选择</h2>
      <div class="pill chapter-status">{{ unlockedChapterCount }} / {{ CHAPTERS.length }} 已开放</div>
    </div>

    <div class="chapter-intro">
      <span class="chapter-kicker">远征航线 · CHAPTER SELECT</span>
      <strong>选择一段城市旅程</strong>
      <small>完成当前章节的关卡，解锁下一段都会圈</small>
    </div>

    <div class="scroll chapter-list" aria-label="章节列表">
      <button
        v-for="chapter in CHAPTERS"
        :key="chapter.id"
        class="chapter-card"
        :class="[`theme-${chapter.theme}`, { locked: !chapterUnlocked(chapter) }]"
        type="button"
        :disabled="!chapterUnlocked(chapter)"
        :aria-label="chapterAccessibleName(chapter)"
        :aria-disabled="!chapterUnlocked(chapter)"
        @click="openChapter(chapter)"
      >
        <div class="chapter-card-head">
          <span>CHAPTER {{ String(chapter.number).padStart(2, '0') }} · {{ chapter.shortName }}</span>
          <i>{{ chapterUnlocked(chapter) ? (chapter.number === 1 ? '已开放' : '已解锁') : '完成前章解锁' }}</i>
        </div>
        <h3>第{{ chapter.number }}章 · {{ chapter.name }}</h3>

        <div class="city-art">
          <svg viewBox="0 0 360 170" role="img" :aria-label="`${chapter.name}原创都会区主题插画`" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient :id="`sky-${chapter.id}`" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" :stop-color="chapter.art.sky[0]" />
                <stop offset="1" :stop-color="chapter.art.sky[1]" />
              </linearGradient>
              <linearGradient :id="`river-${chapter.id}`" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" :stop-color="chapter.art.accent" stop-opacity=".78" />
                <stop offset="1" :stop-color="chapter.art.ground" stop-opacity=".45" />
              </linearGradient>
            </defs>
            <rect width="360" height="170" :fill="`url(#sky-${chapter.id})`" />
            <circle v-if="chapter.theme === 'clear' || chapter.theme === 'wind'" cx="286" cy="38" r="17" fill="#ffe8a2" opacity=".85" />
            <g v-if="chapter.theme === 'cloud' || chapter.theme === 'lightning'" fill="#d5e0e8" opacity=".55">
              <ellipse cx="84" cy="43" rx="48" ry="16" /><ellipse cx="111" cy="40" rx="27" ry="19" />
              <ellipse cx="254" cy="54" rx="57" ry="18" /><ellipse cx="284" cy="50" rx="30" ry="22" />
            </g>
            <g v-if="chapter.theme === 'lightning'" fill="none" :stroke="chapter.art.accent" stroke-width="3" opacity=".8">
              <path d="M276 48l-13 23h12l-8 22 25-30h-13l10-15" />
            </g>
            <g v-if="chapter.theme === 'wind'" fill="none" :stroke="chapter.art.accent" stroke-width="2.5" opacity=".74">
              <path d="M17 54h94q14 0 14-10t-12-8" /><path d="M235 81h83q12 0 12-9t-11-8" />
            </g>
            <g v-if="chapter.theme === 'rain'" :stroke="chapter.art.accent" stroke-width="2" opacity=".65">
              <path v-for="x in [28, 59, 92, 226, 261, 302, 335]" :key="x" :d="`M${x} 20l-10 19`" />
            </g>
            <g v-if="chapter.theme === 'snow'" fill="#f0f7f8" opacity=".8">
              <circle v-for="x in [28, 80, 145, 218, 321]" :key="x" :cx="x" :cy="(x * 7) % 65 + 18" r="2" />
            </g>
            <g v-if="chapter.theme === 'hail'" fill="#e5f2f4" stroke="#91b5c3" stroke-width="1" opacity=".9">
              <circle v-for="x in [42, 103, 172, 247, 314]" :key="x" :cx="x" :cy="(x * 5) % 45 + 18" r="4" />
            </g>
            <path d="M0 111 30 94 55 105 77 82 100 105 127 91 149 110 178 73 199 98 222 84 246 105 269 79 292 101 319 83 340 104 360 94V170H0Z" fill="#233b55" opacity=".78" />
            <g fill="#314e6c">
              <rect v-for="(building, i) in skyline(chapter)" :key="i" :x="building.x" :y="building.y" :width="building.w" :height="170 - building.y" />
            </g>
            <g :fill="chapter.art.accent" opacity=".65">
              <rect v-for="(win, i) in windows(chapter)" :key="i" :x="win.x" :y="win.y" width="4" height="6" />
            </g>
            <path d="M0 137c48-12 81 8 127 1s78-10 119 2 73 5 114-4v34H0Z" :fill="`url(#river-${chapter.id})`" opacity=".8" />
            <path d="M0 144c46-9 86 7 127 1s83-8 121 4 72 4 112-3" fill="none" :stroke="chapter.art.accent" stroke-opacity=".8" stroke-width="2" />
            <path d="M180 70 185 56 190 70M185 57V44" fill="none" :stroke="chapter.art.accent" stroke-width="2" />
            <text x="328" y="48" text-anchor="middle" fill="#fff" opacity=".78" font-size="21" font-weight="900">{{ chapter.art.mark }}</text>
          </svg>
          <span class="city-art-caption">{{ chapter.tagline }} <i>·</i> 8 个独立小关</span>
        </div>

        <div class="chapter-card-foot">
          <span><b>{{ chapterUnlocked(chapter) ? '选择关卡' : '章节未解锁' }}</b><small>{{ chapter.intro }}</small></span>
          <i aria-hidden="true">{{ chapterUnlocked(chapter) ? '›' : 'Ⅱ' }}</i>
        </div>
      </button>
    </div>
  </main>
</template>

<script setup>
import { computed } from 'vue'
import { CHAPTERS } from '../data/levels.js'
import { useStore } from '../core/store.js'
import { Audio } from '../core/audio.js'
import { BackIcon } from './icons.js'

const emit = defineEmits(['nav', 'select-chapter'])
const store = useStore()
const WEATHER_LABELS = { wind: '风', cloud: '乌云', lightning: '电闪雷鸣', rain: '雨', snow: '雪', hail: '冰雹' }
const unlockedChapterCount = computed(() => CHAPTERS.filter(chapterUnlocked).length)

function chapterUnlocked(chapter) {
  return chapter.firstLevelId <= store.unlocked
}
function chapterAccessibleName(chapter) {
  const themeName = chapter.theme === 'clear' ? '晴天' : WEATHER_LABELS[chapter.weatherKind] || '天气'
  return `第 ${chapter.number} 章，${chapter.name}，${themeName}主题，${chapterUnlocked(chapter) ? '已解锁，选择关卡' : '未解锁'}`
}
function skyline(chapter) {
  const seed = chapter.number * 17
  return Array.from({ length: 12 }, (_, i) => {
    const h = 35 + ((seed + i * 29) % 62)
    const w = 17 + ((seed + i * 7) % 13)
    return { x: i * 31 - 2, y: 111 - h, w }
  })
}
function windows(chapter) {
  const seed = chapter.number * 9
  return Array.from({ length: 20 }, (_, i) => ({
    x: 8 + (i * 47 + seed) % 342,
    y: 82 + (i * 23 + seed) % 36
  }))
}
function back() {
  Audio.click()
  emit('nav', 'menu')
}
function openChapter(chapter) {
  if (!chapterUnlocked(chapter)) return
  Audio.click()
  emit('select-chapter', chapter.id)
}
</script>

<style scoped>
.chapter-screen {
  background:
    radial-gradient(circle at 78% 22%, rgba(68, 203, 255, .15), transparent 31%),
    linear-gradient(180deg, #081a32, #050a18 76%);
}
.chapter-intro { display:flex; flex:0 0 auto; flex-direction:column; gap:5px; padding:6px 2px 12px; }
.chapter-kicker { color:#72dff8; font-size:9px; font-weight:900; letter-spacing:.19em; }
.chapter-intro strong { color:#f2f8ff; font-size:17px; }
.chapter-intro small { color:#91acc6; font-size:11px; }
.chapter-status { margin-left:auto; color:#8de6d1 !important; white-space:nowrap; }
.chapter-list { display:flex; flex:1 1 auto; flex-direction:column; gap:13px; padding:4px 2px 24px; }
.chapter-card {
  --chapter-accent:#72dff8;
  appearance:none; display:flex; flex:0 0 auto; flex-direction:column; width:100%; min-height:272px;
  overflow:hidden; padding:14px; color:#f0f8ff; text-align:left; font:inherit;
  background:linear-gradient(145deg,rgba(16,45,76,.98),rgba(5,14,32,.98));
  border:1px solid color-mix(in srgb,var(--chapter-accent) 46%,transparent); border-radius:16px;
  box-shadow:inset 0 1px rgba(255,255,255,.1),0 13px 29px rgba(0,0,0,.38); cursor:pointer;
  transition:transform .14s ease,border-color .14s ease,filter .14s ease;
}
.chapter-card:hover:not(:disabled) { transform:translateY(-2px); border-color:var(--chapter-accent); filter:brightness(1.06); }
.chapter-card:active:not(:disabled) { transform:scale(.99); }
.chapter-card:focus-visible { outline:3px solid #ffe08a; outline-offset:3px; }
.chapter-card.locked { opacity:.56; filter:saturate(.48); cursor:not-allowed; }
.theme-clear { --chapter-accent:#50c6d3; }
.theme-wind { --chapter-accent:#a1e8d6; }
.theme-cloud { --chapter-accent:#b5c9db; }
.theme-lightning { --chapter-accent:#e9d788; }
.theme-rain { --chapter-accent:#7bc7e5; }
.theme-snow { --chapter-accent:#d6edf0; }
.theme-hail { --chapter-accent:#c8dde0; }
.chapter-card-head { display:flex; align-items:center; justify-content:space-between; gap:8px; color:var(--chapter-accent); font-size:9px; font-weight:900; letter-spacing:.14em; }
.chapter-card-head i { max-width:48%; padding:5px 7px; color:#d7e9ec; background:rgba(62,193,155,.1); border:1px solid color-mix(in srgb,var(--chapter-accent) 42%,transparent); border-radius:999px; font-size:8px; font-style:normal; letter-spacing:0; text-align:center; }
.chapter-card h3 { flex:0 0 auto; margin:10px 0; font-size:clamp(17px,4.6vw,22px); letter-spacing:.025em; }
.city-art { position:relative; display:flex; flex:1 1 auto; min-height:132px; overflow:hidden; border:1px solid color-mix(in srgb,var(--chapter-accent) 35%,transparent); border-radius:12px; background:#0c1c36; }
.city-art svg { display:block; width:100%; height:100%; min-height:132px; }
.city-art-caption { position:absolute; right:7px; bottom:7px; max-width:calc(100% - 14px); padding:4px 7px; color:#e0f1f5; background:rgba(3,13,28,.8); border:1px solid color-mix(in srgb,var(--chapter-accent) 30%,transparent); border-radius:6px; font-size:8px; font-weight:800; }
.city-art-caption i { color:#ffd575; font-style:normal; }
.chapter-card-foot { display:flex; flex:0 0 auto; align-items:center; justify-content:space-between; gap:10px; padding:11px 2px 0; }
.chapter-card-foot span { display:flex; min-width:0; flex-direction:column; gap:4px; }
.chapter-card-foot b { color:#ffe092; font-size:15px; }
.chapter-card-foot small { display:-webkit-box; overflow:hidden; color:#9db7cf; font-size:9px; line-height:1.4; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
.chapter-card-foot > i { display:grid; flex:0 0 34px; width:34px; height:34px; place-items:center; color:#10253b; background:linear-gradient(145deg,#ffe58d,#f2ab4d); border-radius:10px; box-shadow:0 3px #9a6332; font-size:25px; font-style:normal; line-height:1; }
.locked .chapter-card-foot > i { color:#dce7ef; background:linear-gradient(145deg,#8794a0,#485468); box-shadow:0 3px #333c4b; font-size:17px; }
@media (max-height:700px) {
  .chapter-intro { gap:3px; padding-bottom:8px; }
  .chapter-card { min-height:246px; padding:11px; }
  .chapter-card h3 { margin:7px 0; }
  .city-art,.city-art svg { min-height:112px; }
  .chapter-card-foot { padding-top:8px; }
}
</style>
