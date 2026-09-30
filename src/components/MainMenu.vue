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
      <div class="player-chip">
        <span class="avatar">月</span>
        <span class="player-meta"><span class="rank-line"><MedalIcon :size="14" /> 青铜 I</span><b>月面建筑师</b></span>
      </div>
      <div class="resource-chip"><span class="coin-mark">●</span><b>{{ store.coins }}</b></div>
      <div class="resource-chip stars"><StarIcon :size="16" /><b>{{ totalStars }}<small>/{{ TOTAL_STARS }}</small></b></div>
    </div>
    <button class="shop-float" aria-label="打开补给商店" @click="tap('shop')"><BagIcon :size="23" /><span>商店</span></button>

    <div class="mission-strip">
      <span class="mission-sigil">✦</span>
      <span class="mission-text"><small>今日远征目标</small><b>连续完美落层 3 次</b></span>
      <span class="mission-progress"><i></i><i></i><i></i></span>
      <span class="mission-reward">+120 <span>金币</span></span>
    </div>

    <nav class="mode-grid" aria-label="游戏模式">
      <button class="mode-card challenge-card" @click="tap('levels')">
        <span class="mode-emblem"><PlayIcon :size="24" /></span>
        <span class="mode-copy"><small class="mode-kicker">MAIN QUEST</small><b>挑战模式</b><small>逐关登顶，冲击三星</small></span>
        <span class="mode-action">出发 <span>›</span></span>
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

    <nav class="bottom-menu" aria-label="底部菜单">
      <button class="bottom-menu-item" @click="openStub('角色')"><UserIcon :size="23" /><span>角色</span></button>
      <button class="bottom-menu-item" @click="tap('shop')"><BagIcon :size="23" /><span>背包</span></button>
      <button class="bottom-menu-item" @click="openStub('宠物')"><PetIcon :size="23" /><span>宠物</span></button>
      <button class="bottom-menu-item" @click="tap('skills')"><SkillIcon :size="23" /><span>技能</span></button>
      <button class="bottom-menu-item" @click="showSettings = true"><SettingsIcon :size="23" /><span>设置</span></button>
    </nav>

    <transition name="toast-pop"><div v-if="stubLabel" class="stub-toast">{{ stubLabel }}系统 · 敬请期待</div></transition>

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
          <div class="version-line">版本 <b>v{{ version }}</b></div>
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
import { StarIcon, PlayIcon, BagIcon, SkillIcon, HelpIcon, MedalIcon, TrophyIcon, UserIcon, PetIcon, SettingsIcon } from './icons.js'

const emit = defineEmits(['nav'])
const store = useStore()
const showHelp = ref(false)
const showSettings = ref(false)
const stubLabel = ref('')
let stubTimer = null

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
function openStub(label) {
  Audio.click()
  stubLabel.value = label
  clearTimeout(stubTimer)
  stubTimer = setTimeout(() => { stubLabel.value = '' }, 1800)
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
.top-hud{display:flex;align-items:center;gap:7px;align-self:stretch;z-index:2!important;min-height:56px;padding:0 0 0 2px;text-shadow:0 2px 4px #10292c}
.player-chip,.resource-chip{display:flex;align-items:center;min-height:50px;color:#fff4d0;background:rgba(12,35,40,.68);border:1px solid rgba(255,231,177,.3);border-radius:9px;box-shadow:0 4px 0 rgba(0,0,0,.2),inset 0 1px rgba(255,255,255,.08);backdrop-filter:blur(8px)}
.player-chip{gap:9px;padding:5px 12px 5px 6px}.avatar{display:grid;place-items:center;width:38px;height:38px;color:#4b2d18;background:linear-gradient(145deg,#ffe79a,#cf893a);border:2px solid #fff0bb;border-radius:50%;font-size:18px;font-weight:1000;box-shadow:0 2px 0 #87502a}.player-meta{display:flex;flex-direction:column;gap:3px;line-height:1}.player-meta b{font-size:13px}.rank-line{display:flex;align-items:center;gap:3px;color:#ffd36b;font-size:10px;font-weight:900}.rank-line svg{color:#d6c7a8}
.resource-chip{gap:7px;padding:0 12px;font-size:15px}.resource-chip b{font-weight:950}.coin-mark{color:#ffd45f;font-size:18px;text-shadow:0 1px #9b5427}.stars{color:#ffda69}.stars small{font-size:10px;color:#fff1d1;margin-left:2px}
.shop-float{position:absolute;right:max(22px,calc((100vw - 460px)/2));top:calc(var(--safe-top) + 82px);z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:58px;height:58px;color:#ffd36b;background:rgba(12,35,40,.74);border:1px solid rgba(255,231,177,.38);border-radius:9px;box-shadow:0 4px 0 rgba(0,0,0,.24),inset 0 1px rgba(255,255,255,.1);backdrop-filter:blur(8px);animation:shop-float 3.6s ease-in-out infinite}.shop-float span{color:#fff1d1;font-size:10px;font-weight:900}
.version-line{padding-top:12px;margin:0 0 16px;border-top:1px solid rgba(80,90,82,.22);color:var(--text-soft);font-size:12px;text-align:right}.version-line b{color:var(--text);margin-left:5px}
.mission-strip{position:absolute;left:50%;bottom:calc(var(--safe-bottom) + 398px);transform:translateX(-50%);width:min(calc(100% - 36px),480px);display:flex;align-items:center;gap:10px;min-height:48px;padding:7px 10px;color:#fff1d1;background:linear-gradient(90deg,rgba(14,49,52,.84),rgba(14,49,52,.46));border:1px solid rgba(255,224,157,.24);border-left:3px solid #e9a143;box-shadow:0 5px 18px rgba(0,0,0,.18);clip-path:polygon(0 0,100% 0,100% 78%,97% 100%,0 100%)}
.mission-sigil{display:grid;place-items:center;width:28px;height:28px;color:#ffd36b;font-size:19px;background:rgba(255,211,107,.12);border:1px solid rgba(255,211,107,.32);transform:rotate(45deg)}.mission-sigil::first-letter{transform:rotate(-45deg)}
.mission-text{display:flex;flex:1;flex-direction:column;gap:2px}.mission-text small{color:#a9c7b6;font-size:9px;font-weight:900;letter-spacing:1px}.mission-text b{font-size:12px}.mission-progress{display:flex;gap:3px}.mission-progress i{display:block;width:8px;height:8px;border:1px solid #e9a143;background:#e9a143;transform:skew(-16deg)}.mission-progress i~i{background:transparent}.mission-reward{color:#ffd36b;font-size:12px;font-weight:950;text-align:right}.mission-reward span{display:block;color:#a9c7b6;font-size:9px;font-weight:700}
.mode-grid{position:absolute;left:50%;bottom:calc(var(--safe-bottom) + 112px);transform:translateX(-50%);width:min(calc(100% - 36px),480px);display:grid;grid-template-columns:1fr 1fr;gap:9px}
.mode-card{position:relative;display:flex;align-items:center;gap:10px;min-width:0;min-height:82px;padding:10px;color:#fff1d1;text-align:left;background:linear-gradient(145deg,rgba(20,57,59,.94),rgba(11,34,39,.96));border:1px solid rgba(255,223,157,.32);border-bottom:3px solid rgba(0,0,0,.3);box-shadow:0 5px 12px rgba(0,0,0,.25);border-radius:5px;overflow:hidden}
.mode-card::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,rgba(255,255,255,.07),transparent 44%)}
.challenge-card{grid-column:1/-1;min-height:86px;background:linear-gradient(110deg,rgba(145,76,29,.98),rgba(45,49,42,.96));border-color:rgba(255,219,117,.72);box-shadow:0 0 0 1px rgba(255,211,107,.15),0 6px 18px rgba(0,0,0,.32);animation:challenge-pulse 3.8s ease-in-out infinite}
.mode-emblem{flex:0 0 42px;width:42px;height:42px;display:grid;place-items:center;color:#ffdc76;background:rgba(255,214,114,.12);border:1px solid rgba(255,226,162,.28);border-radius:4px}.challenge-card .mode-emblem{color:#fff0b2;background:rgba(255,220,125,.18);border-color:rgba(255,235,168,.42)}
.mode-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:4px}.mode-copy b{font-size:15px;font-weight:950}.mode-copy small{color:rgba(255,241,209,.72);font-size:11px;font-weight:700}.mode-kicker{color:#ffd36b!important;font-size:9px!important;letter-spacing:1.3px}.mode-arrow{font-size:27px;color:#ffdc76;line-height:1}.mode-action{display:flex;align-items:center;gap:4px;padding:8px 9px;color:#4c2d17;background:#ffd66c;border:1px solid #ffefad;font-size:11px;font-weight:950;box-shadow:0 3px 0 #91501f}.mode-action span{font-size:18px;line-height:10px}.mode-status{padding:4px 6px;color:#9aa49f;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.1);font-size:10px;font-weight:800;white-space:nowrap}.locked-mode{filter:saturate(.64);opacity:.78}.locked-mode:disabled{cursor:not-allowed}.infinity-mark{font-size:30px;font-weight:700;line-height:1}
.bottom-menu{position:absolute;left:50%;bottom:calc(var(--safe-bottom) + 12px);transform:translateX(-50%);width:min(calc(100% - 36px),430px);display:grid;grid-template-columns:repeat(5,1fr);gap:7px;padding:7px;background:rgba(8,27,31,.72);border:1px solid rgba(255,226,162,.28);border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.3),inset 0 1px rgba(255,255,255,.08);backdrop-filter:blur(10px)}
.bottom-menu-item{aspect-ratio:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:rgba(255,241,209,.78);background:rgba(20,57,59,.55);border:1px solid rgba(255,226,162,.12);border-radius:6px;font-size:11px;font-weight:900;transition:transform .12s,background .15s,color .15s,box-shadow .15s}.bottom-menu-item svg{color:#ffd36b}.bottom-menu-item:hover,.bottom-menu-item:focus-visible{color:#fff5d4;background:rgba(141,86,39,.65);border-color:rgba(255,218,122,.62);box-shadow:0 0 14px rgba(255,190,76,.18);transform:translateY(-2px)}.bottom-menu-item:active{transform:translateY(1px)}
.stub-toast{position:absolute;left:50%;bottom:calc(var(--safe-bottom) + 94px);transform:translateX(-50%);z-index:5;padding:9px 14px;color:#fff1d1;background:rgba(9,30,34,.92);border:1px solid rgba(255,211,107,.46);border-radius:6px;box-shadow:0 5px 16px rgba(0,0,0,.32);font-size:12px;font-weight:800;white-space:nowrap}
.toast-pop-enter-active,.toast-pop-leave-active{transition:opacity .18s,transform .18s}.toast-pop-enter-from,.toast-pop-leave-to{opacity:0;transform:translate(-50%,8px)}
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

@keyframes challenge-pulse{0%,100%{box-shadow:0 0 0 1px rgba(255,211,107,.15),0 6px 18px rgba(0,0,0,.32)}50%{box-shadow:0 0 0 1px rgba(255,211,107,.38),0 8px 24px rgba(223,139,52,.24)}}
@keyframes shop-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@media (max-height:700px){.hero-title{top:8%}.mission-strip{bottom:calc(var(--safe-bottom) + 348px);min-height:42px}.mode-grid{bottom:calc(var(--safe-bottom) + 96px);gap:6px}.mode-card{min-height:64px;padding:7px}.challenge-card{min-height:62px}.mode-emblem{width:36px;height:36px;flex-basis:36px}.bottom-menu{bottom:calc(var(--safe-bottom) + 7px);padding:5px;gap:5px}.bottom-menu-item{gap:3px;font-size:10px}}
@media (min-width:700px){.hero-title{top:7%}.hero-title h1{font-size:64px}.mission-strip{bottom:430px}.mode-grid{bottom:112px;max-width:560px;gap:12px}.mode-card{min-height:90px;padding:14px}.challenge-card{min-height:96px}.bottom-menu{bottom:28px;max-width:500px}}
@media (max-width:380px){.top-hud{gap:4px}.player-chip{padding-right:7px}.player-meta b{font-size:11px}.resource-chip{padding:0 8px;font-size:13px}.shop-float{right:18px}}
</style>
