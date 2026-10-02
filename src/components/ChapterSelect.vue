<template>
  <main class="screen game-menu-screen chapter-screen">
    <div class="title-bar">
      <button class="icon-btn" type="button" aria-label="返回主菜单" @click="back"><BackIcon /></button>
      <h2>章节选择</h2>
      <div class="pill chapter-status">当前开放</div>
    </div>

    <div class="chapter-intro">
      <span class="chapter-kicker">远征航线 · CHAPTER SELECT</span>
      <strong>选择一段城市旅程</strong>
      <small>从第一座城出发，逐关解锁前行</small>
    </div>

    <button
      class="chapter-card"
      type="button"
      :aria-label="`第一章 · ${CHAPTER.name}，选择关卡`"
      @click="openLevels"
    >
      <div class="chapter-card-head">
        <span>CHAPTER 01</span>
        <i>已开放</i>
      </div>
      <h3>第一章 · {{ CHAPTER.name }}</h3>

      <div class="city-art">
        <svg viewBox="0 0 360 220" role="img" aria-label="澄河都会圈原创城市天际线插画" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="chapter-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#184d70" />
              <stop offset="1" stop-color="#101c39" />
            </linearGradient>
            <linearGradient id="chapter-river" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#43c5d2" stop-opacity=".78" />
              <stop offset="1" stop-color="#326bc0" stop-opacity=".35" />
            </linearGradient>
            <linearGradient id="chapter-glow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#ffd575" stop-opacity="0" />
              <stop offset=".5" stop-color="#ffd575" stop-opacity=".8" />
              <stop offset="1" stop-color="#ffd575" stop-opacity="0" />
            </linearGradient>
          </defs>
          <rect width="360" height="220" rx="16" fill="url(#chapter-sky)" />
          <circle cx="278" cy="45" r="23" fill="#ffd575" opacity=".12" />
          <circle cx="278" cy="45" r="12" fill="#ffd575" opacity=".88" />
          <g fill="#bcefff" opacity=".78">
            <circle cx="42" cy="40" r="1.5" /><circle cx="91" cy="27" r="1" />
            <circle cx="143" cy="50" r="1.3" /><circle cx="226" cy="24" r="1" />
            <circle cx="326" cy="73" r="1.3" /><circle cx="185" cy="32" r="1" />
          </g>
          <path d="M0 144 28 128 45 137 68 111 91 131 112 119 135 139 158 105 179 126 201 111 224 132 244 101 265 126 287 110 310 132 334 112 360 130V220H0Z" fill="#1b3658" opacity=".86" />
          <g fill="#254a70">
            <path d="M15 117h27v54H15zM45 102h34v69H45zM84 126h25v45H84z" />
            <path d="M111 91h31v80h-31zM146 111h27v60h-27zM177 79h38v92h-38z" />
            <path d="M219 104h30v67h-30zM253 88h35v83h-35zM292 112h24v59h-24zM320 99h29v72h-29z" />
          </g>
          <g fill="#82d9e8" opacity=".68">
            <path d="M120 101h5v7h-5zm13 0h5v7h-5zm-13 15h5v7h-5zm13 0h5v7h-5z" />
            <path d="M188 91h6v8h-6zm14 0h6v8h-6zm-14 16h6v8h-6zm14 0h6v8h-6zm-14 16h6v8h-6zm14 0h6v8h-6z" />
            <path d="M263 100h5v7h-5zm13 0h5v7h-5zm-13 15h5v7h-5zm13 0h5v7h-5z" />
          </g>
          <path d="M190 78 196 61 202 78M196 62V48" fill="none" stroke="#8fe9ee" stroke-width="2" stroke-linecap="round" />
          <path d="M0 163c52-14 89 12 137 2s84-3 117 9 72 5 106-5v51H0Z" fill="url(#chapter-river)" />
          <path d="M0 171c55-13 91 11 139 1s82-2 116 9 72 5 105-4" fill="none" stroke="#94f2ed" stroke-opacity=".72" stroke-width="2" />
          <path d="M0 194c64-10 96 7 145 0s91-4 132 7 56 3 83-3" fill="none" stroke="#b1f8ed" stroke-opacity=".35" stroke-width="1.5" />
          <path d="M18 182h66M239 187h55" stroke="url(#chapter-glow)" stroke-width="2" />
          <path d="M0 164h360" stroke="#80e4ed" stroke-opacity=".32" />
        </svg>
        <span class="city-art-caption">澄河都会圈 <i>·</i> 城市远征</span>
      </div>

      <div class="chapter-card-foot">
        <span><b>选择关卡</b><small>8 个小关 · 按序解锁，已通关可重玩</small></span>
        <i aria-hidden="true">›</i>
      </div>
    </button>

    <p class="chapter-footnote">目前开放第一章，更多章节尚未开放。</p>
  </main>
</template>

<script setup>
import { CHAPTER } from '../data/levels.js'
import { Audio } from '../core/audio.js'
import { BackIcon } from './icons.js'

const emit = defineEmits(['nav'])

function back() {
  Audio.click()
  emit('nav', 'menu')
}

function openLevels() {
  Audio.click()
  emit('nav', 'levels')
}
</script>

<style scoped>
.chapter-screen {
  background:
    radial-gradient(circle at 78% 22%, rgba(68, 203, 255, .15), transparent 31%),
    linear-gradient(180deg, #081a32, #050a18 76%);
}
.chapter-intro {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 5px;
  padding: 6px 2px 14px;
}
.chapter-kicker {
  color: #72dff8;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .19em;
}
.chapter-intro strong { color: #f2f8ff; font-size: 17px; }
.chapter-intro small { color: #91acc6; font-size: 11px; }
.chapter-status { margin-left: auto; color: #8de6d1 !important; }
.chapter-card {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: 100%;
  min-height: 340px;
  max-height: 590px;
  overflow: hidden;
  padding: 16px;
  color: #f0f8ff;
  text-align: left;
  background: linear-gradient(145deg, rgba(16, 45, 76, .98), rgba(5, 14, 32, .98));
  border: 1px solid rgba(116, 226, 255, .43);
  border-radius: 18px;
  box-shadow: inset 0 1px rgba(255,255,255,.1), 0 16px 35px rgba(0,0,0,.42), 0 0 28px rgba(57,190,239,.1);
  cursor: pointer;
  transition: transform .14s ease, border-color .14s ease, filter .14s ease;
}
.chapter-card:hover { transform: translateY(-2px); border-color: rgba(139, 238, 255, .75); filter: brightness(1.06); }
.chapter-card:active { transform: scale(.99); }
.chapter-card:focus-visible { outline: 3px solid #ffe08a; outline-offset: 3px; }
.chapter-card-head { display: flex; align-items: center; justify-content: space-between; color: #81e4fa; font-size: 9px; font-weight: 900; letter-spacing: .18em; }
.chapter-card-head i { padding: 5px 8px; color: #a4f0d9; background: rgba(62,193,155,.12); border: 1px solid rgba(116,230,192,.35); border-radius: 999px; font-size: 9px; font-style: normal; letter-spacing: .02em; }
.chapter-card h3 { flex: 0 0 auto; margin: 12px 0 13px; font-size: clamp(18px, 5vw, 23px); letter-spacing: .035em; }
.city-art { position: relative; display: flex; flex: 1 1 auto; min-height: 170px; overflow: hidden; border: 1px solid rgba(120,224,248,.3); border-radius: 13px; background: #0c1c36; }
.city-art svg { display: block; width: 100%; height: 100%; min-height: 170px; }
.city-art-caption { position: absolute; right: 10px; bottom: 9px; padding: 5px 8px; color: #c5eaf2; background: rgba(3,13,28,.72); border: 1px solid rgba(126,220,235,.22); border-radius: 7px; font-size: 9px; font-weight: 800; }
.city-art-caption i { color: #ffd575; font-style: normal; }
.chapter-card-foot { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 2px 1px; }
.chapter-card-foot span { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.chapter-card-foot b { color: #ffe092; font-size: 17px; }
.chapter-card-foot small { color: #9db7cf; font-size: 10px; }
.chapter-card-foot > i { display: grid; flex: 0 0 38px; width: 38px; height: 38px; place-items: center; color: #10253b; background: linear-gradient(145deg,#ffe58d,#f2ab4d); border-radius: 12px; box-shadow: 0 3px #9a6332; font-size: 28px; font-style: normal; line-height: 1; }
.chapter-footnote { flex: 0 0 auto; margin: 12px 2px 0; color: #718ba5; font-size: 10px; text-align: center; }
@media (max-height: 660px) {
  .chapter-intro { gap: 3px; padding-bottom: 9px; }
  .chapter-card { min-height: 290px; padding: 12px; }
  .chapter-card h3 { margin: 8px 0 9px; }
  .city-art, .city-art svg { min-height: 135px; }
  .chapter-card-foot { padding-top: 10px; }
  .chapter-footnote { margin-top: 8px; }
}
</style>
