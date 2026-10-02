<template>
  <div class="screen game-menu-screen level-screen" :class="`theme-${chapter.theme}`">
    <div class="title-bar">
      <button class="icon-btn" type="button" aria-label="返回章节选择" @click="back"><BackIcon /></button>
      <h2>小关选择</h2>
      <div class="pill" style="margin-left:auto"><span class="coin-dot"></span>{{ store.coins }}</div>
    </div>

    <div class="page-context">
      <span class="page-kicker">第{{ chapter.number }}章 · {{ chapter.name }}</span>
      <b>{{ chapter.tagline }}</b>
      <small>8 个独立小关 · 按序解锁 · 已通关可重玩</small>
    </div>

    <div class="scroll level-list" :aria-label="`${chapter.name}小关列表`">
      <button
        type="button"
        v-for="lv in levels"
        :key="lv.id"
        class="level-card card"
        :class="{ locked: !unlocked(lv.id), cleared: (store.stars[lv.id] || 0) > 0 }"
        :aria-label="levelAccessibleName(lv)"
        :aria-disabled="!unlocked(lv.id)"
        @click="pick(lv)"
      >
        <div class="lv-badge" :style="badgeStyle(lv)">
          <span v-if="unlocked(lv.id)">{{ lv.chapterStage }}</span>
          <LockIcon v-else :size="22" />
        </div>
        <div class="lv-info">
          <div class="lv-name">第 {{ lv.chapterStage || lv.id }} 关 · {{ lv.city }}</div>
          <div class="lv-meta text-soft">{{ lv.place }} · 目标 {{ lv.target }} 层 · 固定速度</div>
          <div class="lv-hint">{{ lv.weatherHint || '晴天 · 静塔 · 固定速度' }}</div>
          <div class="lv-stars">
            <StarIcon
              v-for="n in 3"
              :key="n"
              :size="18"
              :filled="(store.stars[lv.id] || 0) >= n"
              :style="{ color: (store.stars[lv.id] || 0) >= n ? 'var(--gold)' : 'var(--panel-border)' }"
            />
          </div>
        </div>
        <div class="lv-go">
          <PlayIcon v-if="unlocked(lv.id)" :size="20" />
          <span v-else class="lock-text">未解锁</span>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useStore } from '../core/store.js'
import { CHAPTER, getChapter, getChapterLevels } from '../data/levels.js'
import { Audio } from '../core/audio.js'
import { BackIcon, StarIcon, LockIcon, PlayIcon } from './icons.js'

const props = defineProps({ chapterId: { type: String, default: CHAPTER.id } })
const emit = defineEmits(['nav', 'play'])
const store = useStore()
const chapter = computed(() => getChapter(props.chapterId))
const levels = computed(() => getChapterLevels(chapter.value.id))

function unlocked(id) {
  return Number(id) <= store.unlocked
}
function levelAccessibleName(lv) {
  const stars = store.stars[lv.id] || 0
  const localId = lv.chapterStage || lv.id
  const status = unlocked(lv.id) ? '已解锁，可开始或重玩' : '已锁定，不可开始'
  return `${chapter.value.name}，第 ${localId} 关，${lv.city}，${lv.place}，目标 ${lv.target} 层，固定速度，${lv.weatherHint || '晴天静塔'}，${stars} 颗星，${status}`
}
function back() {
  Audio.click()
  emit('nav', 'chapters')
}
function pick(lv) {
  if (!unlocked(lv.id)) return
  Audio.click()
  emit('play', lv.id)
}
function badgeStyle(lv) {
  const hue = (196 + chapter.value.number * 26 + (lv.chapterStage || lv.id) * 11) % 360
  return { background: `linear-gradient(135deg, hsl(${hue},70%,66%), hsl(${hue},65%,42%))` }
}
</script>

<style scoped>
.level-screen { background:radial-gradient(circle at 84% 14%,rgba(69,205,255,.16),transparent 28%),linear-gradient(180deg,#061a31,#030711 72%); }
.theme-wind { --chapter-glow:#a1e8d6; }
.theme-cloud { --chapter-glow:#b5c9db; }
.theme-lightning { --chapter-glow:#e9d788; }
.theme-rain { --chapter-glow:#7bc7e5; }
.theme-snow { --chapter-glow:#d6edf0; }
.theme-hail { --chapter-glow:#c8dde0; }
.page-context { display:flex; flex:0 0 auto; flex-direction:column; gap:4px; padding:4px 3px 2px; }
.page-kicker { color:var(--chapter-glow,#63dfff); font-size:9px; font-weight:900; letter-spacing:.15em; }
.page-context b { color:#e5f2fa; font-size:13px; }
.page-context small { color:#91acc6; font-size:10px; }
.level-list { display:flex; flex-direction:column; gap:12px; padding:10px 0 28px 10px; position:relative; }
.level-list::before { content:''; position:absolute; left:31px; top:20px; bottom:28px; width:1px; background:linear-gradient(var(--chapter-glow,#64e5ff88),#64e5ff12); }
.level-card {
  appearance:none; width:100%; font:inherit; text-align:left; cursor:pointer; display:flex; align-items:center; gap:12px;
  min-height:108px; position:relative; padding:12px 10px 12px 0;
  background:linear-gradient(100deg,rgba(9,39,67,.96),rgba(5,15,32,.96)); border:1px solid color-mix(in srgb,var(--chapter-glow,#66e1ff) 37%,transparent);
  border-left:3px solid color-mix(in srgb,var(--chapter-glow,#5bdcff) 68%,transparent); clip-path:polygon(0 0,calc(100% - 13px) 0,100% 13px,100% 100%,0 100%);
  box-shadow:0 12px 24px #0008,inset 0 1px #fff2; transition:transform .08s;
}
.level-card:active { transform:scale(.985); }
.level-card:focus-visible { outline:3px solid #ffe08a; outline-offset:2px; box-shadow:inset 0 0 0 3px #ffe08a; z-index:1; }
.level-card.locked { opacity:.55; filter:grayscale(.6); background:linear-gradient(100deg,rgba(25,28,53,.84),rgba(8,11,23,.92)); border-left-color:#7a6d9a; }
.level-card.cleared { border-left-color:#ffd36b; }
.level-card::before { content:''; position:absolute; left:-13px; top:38px; width:17px; height:17px; border:2px solid var(--chapter-glow,#61e2ff); background:#07182c; transform:rotate(45deg); z-index:2; }
.level-card.locked::before { border-color:#716a92; }
.lv-badge { display:flex; flex:0 0 52px; width:52px; height:52px; margin-left:4px; align-items:center; justify-content:center; color:#fff; font-size:23px; font-weight:900; clip-path:polygon(0 0,84% 0,100% 16%,100% 100%,0 100%); box-shadow:0 0 18px rgba(70,210,255,.3); }
.lv-info { flex:1; min-width:0; padding-left:1px; }
.lv-name { overflow:hidden; color:#f4f7fa; font-size:16px; font-weight:850; letter-spacing:.03em; text-overflow:ellipsis; white-space:nowrap; }
.lv-meta { margin:3px 0 2px; color:#9cbad0; font-size:10px; }
.lv-hint { overflow:hidden; color:var(--chapter-glow,#8ddcf2); font-size:9px; line-height:1.35; text-overflow:ellipsis; white-space:nowrap; }
.lv-stars { display:flex; gap:3px; margin-top:4px; }
.lv-go { flex-shrink:0; padding-right:3px; color:#ffd467; }
.lock-text { color:#91a0b2; font-size:10px; }
@media (max-width:380px) { .level-card { gap:9px; min-height:104px; } .lv-badge { flex-basis:46px; width:46px; height:46px; } .lv-name { font-size:14px; } .lv-meta,.lv-hint { font-size:9px; } }
</style>
