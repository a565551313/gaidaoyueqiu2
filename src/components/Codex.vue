<template>
  <main class="screen codex-screen">
    <header class="title-bar">
      <button class="icon-btn" :aria-label="selected ? '返回图鉴列表' : '返回基地'" @click="back"><BackIcon /></button>
      <div class="codex-title-copy">
        <span>{{ selected ? selected.subtitle : 'ARCHIVE / 图鉴' }}</span>
        <h2>{{ selected ? selected.name : '资料库' }}</h2>
      </div>
      <div class="codex-count">{{ data.unlocked }}/{{ data.total }}</div>
    </header>

    <!-- 分组标签页 -->
    <nav v-if="!selected" class="codex-tabs" aria-label="图鉴分组">
      <button
        v-for="g in CODEX_GROUPS"
        :key="g.id"
        :class="{ on: g.id === groupId }"
        @click="switchGroup(g.id)"
      >
        <small>{{ g.kicker }}</small>
        <strong>{{ g.label }}</strong>
      </button>
    </nav>

    <!-- 列表 -->
    <section v-if="!selected" class="codex-grid">
      <button
        v-for="entry in data.entries"
        :key="entry.id"
        class="codex-card"
        :class="entry.state"
        @click="open(entry)"
      >
        <div class="card-art">
          <template v-if="entry.state === 'locked'">
            <div class="card-locked"><LockIcon :size="26" /></div>
          </template>
          <CodexCanvas
            v-else-if="entry.preview.kind === 'canvas'"
            :draw="entry.preview.draw"
            :width="148"
            :height="64"
          />
          <AnimatedPet v-else :id="entry.preview.props.id" :size="62" />
        </div>
        <strong>{{ entry.state === 'locked' ? '???' : entry.name }}</strong>
        <small>{{ entry.state === 'locked' ? (entry.lockedHint || '未解锁') : entry.subtitle }}</small>
        <i class="state-dot" :class="entry.state"></i>
      </button>
    </section>

    <!-- 详情 -->
    <section v-else class="codex-detail">
      <div class="detail-scene">
        <CodexCanvas
          v-if="selected.scene.kind === 'canvas'"
          :draw="selected.scene.draw"
          :width="sceneW"
          :height="190"
        />
        <AnimatedPet v-else :id="selected.scene.props.id" :size="150" />
        <span class="scene-label">{{ selected.scene.label }}</span>
      </div>

      <p class="detail-blurb">{{ selected.blurb }}</p>
      <p v-if="selected.effect" class="detail-effect"><span class="effect-dot"></span>{{ selected.effect }}</p>

      <div v-if="selected.extras?.length" class="detail-extras">
        <div v-for="x in selected.extras" :key="x.label"><small>{{ x.label }}</small><strong>{{ x.value }}</strong></div>
      </div>

      <h3 class="detail-head">属性</h3>
      <ul class="stat-list">
        <li v-for="axis in data.axes" :key="axis.key" :class="{ muted: statOf(selected, axis.key)?.isDefault }">
          <span class="stat-label">{{ axis.label }}</span>
          <span class="stat-bar"><i :style="{ width: (data.ratioOf(statOf(selected, axis.key)) * 100) + '%' }"></i></span>
          <span class="stat-value">{{ statOf(selected, axis.key)?.text ?? '—' }}</span>
        </li>
      </ul>

      <template v-if="selected.skills?.length">
        <h3 class="detail-head">技能</h3>
        <ul class="skill-list">
          <li v-for="s in selected.skills" :key="s.name">
            <b>{{ s.star }}★</b><span><strong>{{ s.name }}</strong><small>{{ s.desc }}</small></span>
          </li>
        </ul>
      </template>

      <template v-if="selected.sounds?.length">
        <h3 class="detail-head">音效</h3>
        <div class="sound-row">
          <button v-for="s in selected.sounds" :key="s.key" class="sound-btn" @click="playSound(s)">
            <SoundIcon :size="17" /><span>{{ s.label }}</span>
          </button>
        </div>
      </template>
    </section>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useStore } from '../core/store.js'
import { CODEX_GROUPS, groupData } from '../core/codex/index.js'
import { Audio } from '../core/audio.js'
import { BackIcon, LockIcon, SoundIcon } from './icons.js'
import CodexCanvas from './CodexCanvas.vue'
import AnimatedPet from './AnimatedPet.vue'

const emit = defineEmits(['nav'])
const store = useStore()
const groupId = ref('blocks')
const selectedId = ref('')
const sceneW = ref(Math.min(320, (typeof window !== 'undefined' ? window.innerWidth : 360) - 72))

const data = computed(() => groupData(groupId.value, store))
const selected = computed(() => data.value.entries.find((e) => e.id === selectedId.value && e.state !== 'locked') || null)

function statOf(entry, key) {
  return (entry.stats || []).find((s) => s.key === key) || null
}
function switchGroup(id) {
  if (id === groupId.value) return
  Audio.click()
  groupId.value = id
  selectedId.value = ''
}
function open(entry) {
  if (entry.state === 'locked') { Audio.click(); return }
  Audio.click()
  selectedId.value = entry.id
}
function playSound(sound) {
  // 适配器给的是真实播放入口，不是另写一套——图鉴里听到的就是实战里会响的
  sound.play()
}
function back() {
  Audio.click()
  if (selectedId.value) { selectedId.value = ''; return }
  // App.vue 的 go(name) 直接 route.name = name，所以这里必须是字符串。
  // 传对象会让 route.name 变成对象，所有路由分支都不匹配，页面只剩背景。
  emit('nav', 'menu')
}
</script>

<style scoped>
.codex-screen{display:flex;flex-direction:column;gap:11px;padding-bottom:calc(var(--safe-bottom) + 18px);overflow-y:auto}
.codex-title-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}
.codex-title-copy span{color:#7be3ff;font-size:9px;letter-spacing:.14em;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.codex-title-copy h2{margin:0;font-size:20px}
.codex-count{padding:5px 10px;color:#ffd366;background:#0d2040cc;border:1px solid #70deff44;font-size:12px;font-weight:900}

.codex-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.codex-tabs button{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;color:#8ea6c2;background:#0d2040cc;border:1px solid #70deff22;clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)}
.codex-tabs button small{font-size:8px;letter-spacing:.12em;font-weight:900;opacity:.8}
.codex-tabs button strong{font-size:14px}
.codex-tabs button.on{color:#eaf7ff;background:#1a4770;border-color:#70deff88;box-shadow:inset 0 1px #ffffff1a}

.codex-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:9px}
.codex-card{position:relative;display:flex;flex-direction:column;gap:4px;padding:8px;color:#dbe8f7;text-align:left;background:#0b1b36cc;border:1px solid #70deff2b;clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,0 100%);transition:transform .14s,filter .14s}
.codex-card:hover{transform:translateY(-2px);filter:brightness(1.12)}
.codex-card strong{font-size:14px}
.codex-card small{color:#8ea6c2;font-size:10px;line-height:1.3}
.codex-card.locked{opacity:.62}
.card-art{display:flex;align-items:center;justify-content:center;height:68px;background:#05101fcc;border:1px solid #70deff18;overflow:hidden}
.card-locked{color:#5d7a9c}
.state-dot{position:absolute;top:7px;right:9px;width:7px;height:7px;border-radius:50%}
.state-dot.owned{background:#7cf29b;box-shadow:0 0 6px #7cf29b99}
.state-dot.seen{background:#ffd366;box-shadow:0 0 6px #ffd36699}
.state-dot.locked{background:#44576f}

.codex-detail{display:flex;flex-direction:column;gap:10px}
.detail-scene{position:relative;display:flex;align-items:center;justify-content:center;min-height:190px;background:linear-gradient(180deg,#071226,#0d1f3a);border:1px solid #70deff33;overflow:hidden}
.scene-label{position:absolute;left:9px;top:7px;color:#7be3ff;font-size:9px;letter-spacing:.14em;font-weight:900}
.detail-blurb{margin:0;color:#c3d6ea;font-size:12px;line-height:1.6}
.detail-effect{display:flex;align-items:center;gap:6px;margin:0;color:#ffd366;font-size:12px;font-weight:800}
.effect-dot{width:6px;height:6px;border-radius:50%;background:#ffd366;flex:none}
.detail-extras{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}
.detail-extras div{display:flex;flex-direction:column;gap:2px;padding:7px 9px;background:#0d2040aa;border:1px solid #70deff22}
.detail-extras small{color:#8ea6c2;font-size:9px}
.detail-extras strong{color:#eaf7ff;font-size:14px}
.detail-head{margin:4px 0 0;color:#7be3ff;font-size:10px;letter-spacing:.16em;font-weight:900}

.stat-list{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.stat-list li{display:grid;grid-template-columns:72px 1fr 78px;align-items:center;gap:8px}
.stat-list li.muted{opacity:.42}
.stat-label{color:#a9bed3;font-size:11px}
.stat-bar{position:relative;height:7px;background:#0a1830;border:1px solid #70deff22}
.stat-bar i{display:block;height:100%;background:linear-gradient(90deg,#49b7ff,#7cf29b);transition:width .25s}
.stat-value{color:#eaf7ff;font-size:11px;font-weight:800;text-align:right}

.skill-list{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.skill-list li{display:flex;gap:8px;padding:7px 9px;background:#0d2040aa;border:1px solid #70deff22}
.skill-list b{color:#ffd366;font-size:12px;flex:none}
.skill-list span{display:flex;flex-direction:column;gap:2px}
.skill-list strong{color:#eaf7ff;font-size:12px}
.skill-list small{color:#9fb5cc;font-size:10px;line-height:1.45}

.sound-row{display:flex;gap:8px;flex-wrap:wrap}
.sound-btn{display:flex;align-items:center;gap:6px;padding:8px 13px;color:#eaf7ff;background:#176182;border:1px solid #74ddff;font-size:12px;font-weight:900}
.sound-btn:hover{background:#1e7ba3}
.sound-btn svg{color:#bdefff}

@media (max-width:360px){
  .codex-grid{gap:7px}
  .stat-list li{grid-template-columns:62px 1fr 66px}
}
</style>
