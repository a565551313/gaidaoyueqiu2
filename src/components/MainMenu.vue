<template>
  <div class="screen menu">
    <div class="hero">
      <HeroArt />
      <div class="hero-title">
        <h1>盖到月球<span class="two">2</span></h1>
        <p class="subtitle">MOONBOUND TOWER</p>
      </div>
    </div>

    <div class="top-hud">
      <div class="resource-readout"><span class="coin-mark">●</span><b>{{ store.coins }}</b></div>
      <div class="hud-divider"></div>
      <div class="resource-readout stars"><StarIcon :size="17" /><b>{{ totalStars }}<small>/{{ TOTAL_STARS }}</small></b></div>
      <span class="version-tag">v{{ version }}</span>
    </div>

    <div class="mode-heading"><span>选择模式</span><b>第 {{ store.unlocked }} 区已解锁</b></div>
    <nav class="mode-grid" aria-label="游戏模式">
      <button class="mode-card challenge-card" @click="tap('levels')">
        <span class="mode-emblem"><PlayIcon :size="24" /></span>
        <span class="mode-copy"><b>挑战模式</b><small>逐关登顶，冲击三星</small></span>
        <span class="mode-arrow">›</span>
      </button>
      <button class="mode-card locked-mode" disabled aria-disabled="true">
        <span class="mode-emblem infinity-mark">∞</span>
        <span class="mode-copy"><b>无尽模式</b><small>层数不设上限</small></span>
        <span class="mode-status">暂未开放</span>
      </button>
      <button class="mode-card locked-mode" disabled aria-disabled="true">
        <span class="mode-emblem"><MedalIcon :size="24" /></span>
        <span class="mode-copy"><b>排位赛</b><small>挑战更高段位</small></span>
        <span class="mode-status">暂未开放</span>
      </button>
      <button class="mode-card leaderboard-card" @click="tap('leaderboard')">
        <span class="mode-emblem"><TrophyIcon :size="24" /></span>
        <span class="mode-copy"><b>排行榜</b><small>查看远征排名</small></span>
        <span class="mode-arrow">›</span>
      </button>
    </nav>

    <nav class="utility-nav" aria-label="其他菜单">
      <button @click="tap('shop')"><BagIcon :size="17" /> 补给</button>
      <button @click="tap('skills')"><SkillIcon :size="17" /> 技能</button>
      <button @click="showHelp = true"><HelpIcon :size="17" /> 玩法</button>
      <button @click="showSettings = true"><span class="gear-mark">⚙</span> 设置</button>
    </nav>

    <transition name="pop">
      <div v-if="showSettings" class="overlay" @click.self="showSettings = false">
        <div class="modal settings-modal">
          <h2>游戏设置</h2>
          <div class="setting-row">
            <span>音效与音乐</span>
            <button class="sound-switch" role="switch" :aria-checked="store.settings.sound" @click="toggleSound">
              {{ store.settings.sound ? '开启' : '关闭' }}
            </button>
          </div>
          <label class="volume-setting" for="master-volume"><span>总音量</span><b>{{ Math.round(store.settings.volume * 100) }}%</b></label>
          <input id="master-volume" v-model.number="store.settings.volume" class="volume-slider" type="range" min="0" max="1" step="0.01" @input="actions.setVolume(store.settings.volume)" />
          <button class="btn btn-primary btn-block" @click="showSettings = false">完成</button>
        </div>
      </div>
    </transition>

    <transition name="pop">
      <div v-if="showHelp" class="overlay" @click.self="showHelp = false">
        <div class="modal help-modal">
          <h2>玩法说明</h2>
          <div class="help-body scroll">
            <p><b>目标：</b>楼层左右移动，点击画面或按空格让它落到上一层，一路盖到月球。</p>
            <p><b>完美：</b>中心几乎对齐即判定“完美”，宽度不减少；连续完美会累积连击，每 3 连击恢复部分宽度。</p>
            <p><b>切除：</b>没对齐时只保留重叠部分，其余被切掉；完全没重叠则失败。</p>
            <p><b>充能：</b>亲手落层积攒充能，充满后点右下角火焰按钮释放“烈焰三连叠”，连叠 3 层且不会失败。</p>
            <p><b>道具：</b>复活、自动、双倍金币、慢慢、加宽、护盾、连击保护，用金币在商店购买。</p>
            <p><b>材质：</b>在商店的建筑材质分类中永久解锁并装备，不同材质可以针对打滑、强风、碎裂或雷劈提供帮助。</p>
            <p><b>技能：</b>在技能学院用金币永久升级 8 项能力。</p>
            <p><b>星级：</b>通关按得分给 1~3 星，得分越接近满分星越多。</p>
          </div>
          <button class="btn btn-primary btn-block" @click="showHelp = false">我知道了</button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import HeroArt from './HeroArt.vue'
import { useStore, actions } from '../core/store.js'
import { TOTAL_STARS } from '../data/levels.js'
import packageInfo from '../../package.json'
import { Audio } from '../core/audio.js'
import { StarIcon, PlayIcon, BagIcon, SkillIcon, HelpIcon, MedalIcon, TrophyIcon } from './icons.js'

const emit = defineEmits(['nav'])
const store = useStore()
const showHelp = ref(false)
const showSettings = ref(false)

const totalStars = computed(() => actions.totalStars())
const version = packageInfo.version

function tap(name) {
  Audio.click()
  emit('nav', name)
}
function toggleSound() {
  actions.setSound(!store.settings.sound)
  Audio.click()
}
</script>

<style scoped>
.menu{gap:0;overflow:hidden;position:relative;isolation:isolate;width:100%;max-width:none;padding:calc(var(--safe-top) + 18px) max(22px,calc((100vw - 460px)/2)) calc(var(--safe-bottom) + 20px);color:#fff1d1;background:#10292c}
.menu::before,.menu::after{content:'';position:fixed;pointer-events:none;z-index:-1}
.menu::before{inset:0;background:linear-gradient(180deg,rgba(8,20,25,.22),transparent 32%,rgba(8,20,25,.04) 52%,#10292c 88%)}
.menu::after{inset:auto 0 0;height:24%;opacity:.34;background:repeating-linear-gradient(90deg,transparent 0 31px,rgba(255,220,150,.09) 32px 33px)}
.menu>*{position:relative;z-index:1}
.hero{position:absolute;inset:0;z-index:0!important;overflow:hidden;pointer-events:none}
.hero::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(9,26,31,.2),transparent 23%,transparent 52%,#10292c 87%)}
.hero-title{position:absolute;top:12%;left:0;width:100%;text-align:center;pointer-events:none;z-index:1}
.hero-title h1{margin:0;font-size:clamp(40px,10vw,58px);font-weight:1000;color:#fff;text-shadow:0 3px 0 #55331e,0 6px 0 rgba(33,27,22,.55),0 10px 22px rgba(0,0,0,.4)}
.hero-title .two{color:#ffd65c;text-shadow:0 3px 0 #8f531b,0 6px 16px rgba(0,0,0,.45);margin-left:2px}
.subtitle{margin:3px 0 0;color:rgba(255,241,209,.86);font-size:11px;font-weight:900;letter-spacing:3px;text-shadow:0 2px 8px #000}
.top-hud{display:flex;align-items:center;gap:12px;align-self:flex-start;z-index:2!important;min-height:44px;padding:0 0 0 2px;text-shadow:0 2px 4px #10292c}
.resource-readout{display:flex;align-items:center;gap:7px;font-size:16px;color:#fff4d0}.resource-readout b{font-weight:900}.coin-mark{color:#ffd45f;font-size:18px;text-shadow:0 1px #9b5427}.stars{color:#ffda69}.stars small{font-size:11px;color:#fff1d1;margin-left:2px}.hud-divider{height:18px;width:1px;background:rgba(255,241,209,.4)}
.version-tag{margin-left:auto;color:rgba(255,241,209,.7);font-size:11px;font-weight:800}
.mode-heading{position:absolute;left:50%;bottom:calc(var(--safe-bottom) + 242px);transform:translateX(-50%);width:min(calc(100% - 36px),480px);display:flex;align-items:center;justify-content:space-between;color:#fff1d1;text-shadow:0 2px 5px #10292c;font-size:14px;font-weight:900}
.mode-heading b{color:#ffdc76;font-size:12px}
.mode-grid{position:absolute;left:50%;bottom:calc(var(--safe-bottom) + 58px);transform:translateX(-50%);width:min(calc(100% - 36px),480px);display:grid;grid-template-columns:1fr 1fr;gap:9px}
.mode-card{position:relative;display:flex;align-items:center;gap:10px;min-width:0;min-height:82px;padding:10px;color:#fff1d1;text-align:left;background:linear-gradient(145deg,rgba(20,57,59,.94),rgba(11,34,39,.96));border:1px solid rgba(255,223,157,.32);border-bottom:3px solid rgba(0,0,0,.3);box-shadow:0 5px 12px rgba(0,0,0,.25);border-radius:5px;overflow:hidden}
.mode-card::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,rgba(255,255,255,.07),transparent 44%)}
.challenge-card{grid-column:1/-1;min-height:76px;background:linear-gradient(110deg,rgba(135,74,32,.96),rgba(50,49,39,.96));border-color:rgba(255,219,117,.64);box-shadow:0 0 0 1px rgba(255,211,107,.15),0 6px 18px rgba(0,0,0,.32)}
.mode-emblem{flex:0 0 42px;width:42px;height:42px;display:grid;place-items:center;color:#ffdc76;background:rgba(255,214,114,.12);border:1px solid rgba(255,226,162,.28);border-radius:4px}.challenge-card .mode-emblem{color:#fff0b2;background:rgba(255,220,125,.18);border-color:rgba(255,235,168,.42)}
.mode-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:4px}.mode-copy b{font-size:15px;font-weight:950}.mode-copy small{color:rgba(255,241,209,.72);font-size:11px;font-weight:700}.mode-arrow{font-size:27px;color:#ffdc76;line-height:1}.mode-status{padding:4px 6px;color:#9aa49f;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.1);font-size:10px;font-weight:800;white-space:nowrap}.locked-mode{filter:saturate(.64);opacity:.78}.locked-mode:disabled{cursor:not-allowed}.infinity-mark{font-size:30px;font-weight:700;line-height:1}
.utility-nav{position:absolute;left:50%;bottom:calc(var(--safe-bottom) + 15px);transform:translateX(-50%);width:min(calc(100% - 36px),430px);display:flex;justify-content:space-around;border-top:1px solid rgba(255,226,162,.22);padding-top:5px}
.utility-nav button{min-width:58px;min-height:40px;display:flex;align-items:center;justify-content:center;gap:5px;color:rgba(255,241,209,.82);font-size:12px;font-weight:800}.utility-nav svg,.gear-mark{color:#ffd36b}.gear-mark{font-size:19px;line-height:18px}
.setting-row,.volume-setting{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;font-weight:800}.sound-switch{min-width:70px;min-height:40px;color:#fff1d1;background:#226f66;border:1px solid #65c4a2;border-radius:4px;font-weight:900}.volume-setting{margin:18px 0 5px}.volume-setting b{color:#bd812b}.volume-slider{width:100%;height:38px;margin:0 0 20px;accent-color:#e49a38;cursor:pointer}
.settings-modal h2{margin:0 0 20px}
.settings-modal h2 { margin: 0 0 18px; }
.theme-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.theme-label { font-weight: 700; }
.theme-seg {
  display: flex;
  background: #e6e9de;
  border-radius: 6px;
  padding: 3px;
  border: 1px solid #c7cfbd;
}
.seg-btn {
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  color: #40524c;
}
.seg-btn.active {
  background: #226f66;
  color: #fff;
}

.help-modal h2 {
  margin: 0 0 12px;
}
.help-body {
  max-height: 50vh;
  margin-bottom: 14px;
}
.help-body p {
  margin: 0 0 12px;
  line-height: 1.6;
  font-size: 15px;
  color: var(--text);
}
.help-body b {
  color: #226f66;
}

@media (max-height:700px){.hero-title{top:8%}.mode-heading{bottom:calc(var(--safe-bottom) + 204px)}.mode-grid{bottom:calc(var(--safe-bottom) + 48px);gap:6px}.mode-card{min-height:64px;padding:7px}.challenge-card{min-height:58px}.mode-emblem{width:36px;height:36px;flex-basis:36px}.utility-nav{bottom:calc(var(--safe-bottom) + 7px)}.utility-nav button{min-height:34px}}
@media (min-width:700px){.hero-title{top:7%}.hero-title h1{font-size:64px}.mode-heading{bottom:270px}.mode-grid{bottom:86px;max-width:560px;gap:12px}.mode-card{min-height:90px;padding:14px}.challenge-card{min-height:86px}.utility-nav{bottom:28px;max-width:500px}}
</style>
