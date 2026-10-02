<template>
  <main class="orbit-menu">
    <div class="orbit-backdrop" aria-hidden="true"></div><div class="moon-horizon" aria-hidden="true"></div><div class="scanline" aria-hidden="true"></div>
    <header class="profile-dock"><img class="profile-avatar" src="/assets/art/player-badge.svg" alt="" /><div class="profile-copy"><span class="rank"><MedalIcon :size="14" /> 青铜 I</span><strong>月面建筑师</strong><small>轨道工程站 · 在线</small></div><div class="currency"><span class="currency-icon coin">●</span><b>{{ store.coins }}</b></div><div class="currency"><StarIcon :size="17" /><b>{{ totalStars }}<small>/{{ TOTAL_STARS }}</small></b></div></header>
    <button class="shop-dock" aria-label="打开补给商店" @click="tap('shop')"><BagIcon :size="23" /><span>补给</span></button>
    <section class="hero-copy"><span class="eyebrow">LUNAR CONSTRUCTION COMMAND</span><h1>盖到月球<span>2</span></h1><p>把每一层稳稳送入月光轨道</p><div class="hero-readouts"><span><i></i>轨道同步 98.4%</span><span>月面坐标 04 · 17 · 26</span></div></section><div class="orbital-rings" aria-hidden="true"><i></i><i></i><i></i></div><img class="hero-scene" src="/assets/art/hero-scene.svg" alt="月面高塔与施工危机设备" />
    <section class="launch-console" aria-label="模式选择"><div class="console-head"><span>MISSION CONTROL / 01</span><i></i><small>选择远征航线</small></div><button class="launch-route primary-route" @click="tap('chapters')"><img src="/assets/art/mode-challenge.svg" alt="" /><span class="route-copy"><small>SECTOR 01 · STORY RUN</small><strong>挑战模式</strong><em>逐关登顶，收集三颗月星</em></span><span class="route-go">起飞 <b>›</b></span></button><div class="route-row"><button class="launch-route locked-route" disabled><img src="/assets/art/mode-infinity.svg" alt="" /><span class="route-copy"><strong>无尽模式</strong><em>层数不设上限</em></span><span class="lock-state">暂未开放</span></button><button class="launch-route locked-route" disabled><img src="/assets/art/mode-rank.svg" alt="" /><span class="route-copy"><strong>排位赛</strong><em>挑战更高段位</em></span><span class="lock-state">暂未开放</span></button></div><button class="leaderboard-route" @click="tap('leaderboard')"><TrophyIcon :size="22" /><span><small>COMMUNITY SIGNAL</small><strong>远征排行榜</strong></span><b>›</b></button><button class="help-route" @click="openHelp"><HelpIcon :size="22" /><span><small>FIELD MANUAL</small><strong>玩法说明</strong></span><b>›</b></button></section>
    <nav class="bottom-rail" aria-label="功能菜单"><button @click="openStub('角色')"><UserIcon :size="21" /><span>角色</span></button><button @click="tap('inventory')"><BagIcon :size="21" /><span>背包</span></button><button @click="tap('pets')"><PetIcon :size="21" /><span>宠物</span></button><button @click="tap('skills')"><SkillIcon :size="21" /><span>技能</span></button><button @click="showSettings = true"><SettingsIcon :size="21" /><span>设置</span></button></nav>
    <transition name="toast-pop"><div v-if="stubLabel" class="stub-toast">{{ stubLabel }}系统 · 敬请期待</div></transition>
    <transition name="pop">
      <div v-if="showHelp" class="overlay help-overlay" @click.self="showHelp = false">
        <div class="modal help-modal">
          <div class="modal-kicker">FIELD MANUAL</div><h2>玩法说明</h2>
          <div class="help-scroll">
            <section><h3>目标与操作</h3><p>第一章为<b>澄河都会圈</b>，包含 8 个独立关卡：从晴原市郊区发射场一路走向中澜市中央高塔区。点击画面或按空格落层；未对齐部分会被切掉，完全错开即失败。每关达到目标层数后单独结算。</p></section>
            <section><h3>逐关递增</h3><p>目标高度从 30 层逐关增加到 100 层，基础落层速度保持一致。章节关卡按顺序解锁，已通关的关卡可以重玩。</p></section>
            <section><h3>晴天与稳定塔体</h3><p>第一章全程晴天，天气系统不触发，塔体不摆动。每关的城市天际线固定区分，剪影仅在屏幕底边两侧，中央留给塔体和落点。</p></section>
            <section><h3>结构危机</h3><p>承重切断器、落位封锁器和地基破拆机会公开倒数与预期后果；点中设备可中止事件，点空处或按空格仍只会落层。封锁器影响一次手动落点，破拆机可由承压窗内的手动完美落层阻止。</p></section>
            <section><h3>道具与成长</h3><p>金币可购买道具与升级永久技能。加宽卡、双倍金币卡在开局前勾选；慢慢卡、自动卡在局内使用；护盾、连击保护、复活卡自动装备、触发才消耗。通关按达成率授星，星级与最高得分会记入排行榜。</p></section>
          </div>
          <button class="btn btn-primary btn-block" @click="showHelp = false">明白了，出发</button>
        </div>
      </div>
    </transition>
    <transition name="pop"><div v-if="showSettings" class="overlay" @click.self="showSettings = false"><div class="modal settings-modal"><div class="modal-kicker">SYSTEM CONTROL</div><h2>基地设置</h2><div class="setting-row"><span>音效与音乐</span><button class="sound-switch" role="switch" :aria-checked="store.settings.sound" @click="toggleSound">{{ store.settings.sound ? '开启' : '关闭' }}</button></div><div class="volume-control"><label class="volume-setting" for="music-volume"><span>音乐音量</span><b>{{ Math.round(store.settings.musicVolume * 100) }}%</b></label><input id="music-volume" class="volume-slider" type="range" min="0" max="1" step="0.01" :value="store.settings.musicVolume" @input="actions.setMusicVolume($event.target.value)" /></div><div class="volume-control"><label class="volume-setting" for="effects-volume"><span>音效音量</span><b>{{ Math.round(store.settings.effectsVolume * 100) }}%</b></label><input id="effects-volume" class="volume-slider" type="range" min="0" max="1" step="0.01" :value="store.settings.effectsVolume" @input="actions.setEffectsVolume($event.target.value)" /></div><div class="version-line">BUILD <b>v{{ version }}</b></div><button class="btn btn-primary btn-block" @click="showSettings = false">返回基地</button></div></div></transition>
  </main>
</template>
<script setup>
import { ref, computed } from 'vue'
import { useStore, actions } from '../core/store.js'
import { TOTAL_STARS } from '../data/levels.js'
import packageInfo from '../../package.json'
import { Audio } from '../core/audio.js'
import { StarIcon, BagIcon, SkillIcon, MedalIcon, TrophyIcon, UserIcon, PetIcon, SettingsIcon, HelpIcon } from './icons.js'
const emit = defineEmits(['nav']); const store = useStore(); const showSettings = ref(false); const showHelp = ref(false); const stubLabel = ref(''); let stubTimer = null
const totalStars = computed(() => actions.totalStars()); const version = packageInfo.version
function tap(name) { Audio.click(); emit('nav', name) }
function toggleSound() { actions.setSound(!store.settings.sound); Audio.click() }
function openStub(label) { Audio.click(); stubLabel.value = label; clearTimeout(stubTimer); stubTimer = setTimeout(() => { stubLabel.value = '' }, 1800) }
function openHelp() { Audio.click(); showHelp.value = true }
</script>
<style scoped>
.orbit-menu{position:relative;isolation:isolate;width:100%;height:100dvh;overflow:hidden;color:#eef7ff;background:#050817;padding:calc(var(--safe-top) + 18px) max(18px,calc((100vw - 560px)/2)) calc(var(--safe-bottom) + 18px)}.orbit-backdrop{position:absolute;inset:0;z-index:-3;background:url('/assets/art/orbit-bg.svg') center/cover no-repeat;transform:scale(1.05);animation:drift 18s ease-in-out infinite alternate}.orbit-menu::after{content:'';position:absolute;inset:0;z-index:-2;background:linear-gradient(180deg,rgba(3,6,18,.12),transparent 35%,rgba(3,6,18,.35) 65%,#050817 100%);pointer-events:none}.scanline{position:absolute;inset:0;z-index:-1;opacity:.1;pointer-events:none;background:repeating-linear-gradient(0deg,transparent 0 5px,#b3eaff 6px,transparent 7px)}
.profile-dock{display:flex;align-items:center;gap:9px;width:max-content;max-width:calc(100% - 68px);min-height:58px;padding:5px 10px 5px 5px;background:rgba(5,18,42,.78);border:1px solid rgba(112,222,255,.38);clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,0 100%);box-shadow:0 8px 22px #020611aa,inset 0 1px #ffffff20;backdrop-filter:blur(9px)}.profile-avatar{width:46px;height:46px;flex:none}.profile-copy{display:flex;flex-direction:column;gap:2px;line-height:1}.profile-copy .rank{display:flex;align-items:center;gap:4px;color:#ffd872;font-size:10px;font-weight:900}.profile-copy strong{font-size:14px}.profile-copy small{color:#8da9c8;font-size:9px}.currency{display:flex;align-items:center;gap:5px;margin-left:6px;color:#ffd872;font-size:14px}.currency small{font-size:9px;color:#8da9c8}.currency-icon{font-size:18px}.shop-dock{position:absolute;right:max(18px,calc((100vw - 560px)/2));top:calc(var(--safe-top) + 18px);display:flex;flex-direction:column;align-items:center;gap:3px;width:54px;height:54px;color:#8be6ff;background:rgba(5,18,42,.82);border:1px solid #70deff66;box-shadow:0 8px 20px #02061199;clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)}.shop-dock span{font-size:9px;font-weight:900}.hero-copy{margin:clamp(72px,13vh,126px) auto 0;text-align:center;text-shadow:0 4px 18px #000}.eyebrow{color:#75ddff;font-size:9px;letter-spacing:.18em;font-weight:900}.hero-copy h1{margin:5px 0 0;font-size:clamp(42px,12vw,72px);letter-spacing:.04em;line-height:1;color:#f5fbff;text-shadow:0 3px 0 #20527e,0 0 30px #55dfff66}.hero-copy h1 span{color:#ffd466}.hero-copy p{margin:7px 0 0;color:#b1cee3;font-size:12px;font-weight:700}
.launch-console{position:absolute;left:50%;bottom:calc(var(--safe-bottom) + 104px);transform:translateX(-50%);width:min(calc(100% - 36px),520px);padding:12px 12px 10px;background:linear-gradient(160deg,#0a1a38e8,#050c20ee);border:1px solid #70deff55;box-shadow:0 18px 38px #01030baa,inset 0 1px #ffffff18;clip-path:polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,0 100%)}.console-head{display:flex;align-items:center;gap:8px;color:#82e5ff;font-size:10px;font-weight:900;letter-spacing:.16em}.console-head i{flex:1;height:1px;background:#70deff44}.console-head small{color:#829ab8;font-size:9px;letter-spacing:0}.launch-route{position:relative;display:flex;align-items:center;gap:9px;width:100%;margin-top:9px;padding:7px;color:#edf7ff;text-align:left;background:#102956bb;border:1px solid #70deff3b;clip-path:polygon(0 0,calc(100% - 11px) 0,100% 11px,100% 100%,0 100%);transition:transform .14s,filter .14s}.launch-route:hover{filter:brightness(1.16);transform:translateY(-2px)}.primary-route{min-height:84px;background:linear-gradient(100deg,#9d4e2bd9,#154a77e6);border-color:#ffd36eaa}.launch-route img{width:74px;height:42px;object-fit:contain;filter:drop-shadow(0 5px 7px #0007)}.primary-route img{width:92px;height:58px}.route-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}.route-copy small{color:#7be3ff;font-size:8px;letter-spacing:.12em;font-weight:900}.route-copy strong{font-size:18px}.route-copy em{color:#b4c9dc;font-size:10px;font-style:normal}.route-go{display:flex;align-items:center;gap:4px;padding:8px 8px;color:#35230e;background:#ffd366;font-size:11px;font-weight:950;box-shadow:0 3px #9b5c20}.route-go b{font-size:18px}.route-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.locked-route{min-height:70px;opacity:.65}.locked-route img{width:56px;height:30px}.locked-route .route-copy strong{font-size:13px}.locked-route .route-copy em{font-size:9px}.lock-state{padding:4px 5px;color:#9baec3;border:1px solid #9baec322;font-size:8px;white-space:nowrap}.leaderboard-route{display:flex;align-items:center;gap:10px;width:100%;margin-top:8px;padding:9px 10px;color:#ffe18a;background:#182a4dcc;border:1px solid #ffd36e55;clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)}.leaderboard-route svg{color:#ffd36e}.leaderboard-route span{display:flex;flex:1;flex-direction:column;gap:3px;text-align:left}.leaderboard-route small{color:#a9bed3;font-size:8px;letter-spacing:.14em}.leaderboard-route strong{font-size:13px}.leaderboard-route b{font-size:22px}.bottom-rail{position:absolute;left:50%;bottom:calc(var(--safe-bottom) + 13px);transform:translateX(-50%);width:min(calc(100% - 36px),460px);display:grid;grid-template-columns:repeat(5,1fr);gap:7px;padding:7px;background:#050c1ae8;border:1px solid #70deff55;box-shadow:0 10px 24px #01030baa}.bottom-rail button{aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;color:#8ea6c2;background:#0d2040cc;border:1px solid #70deff22;clip-path:polygon(0 0,calc(100% - 7px) 0,100% 7px,100% 100%,0 100%);font-size:10px;font-weight:900}.bottom-rail button svg{color:#74ddff}.bottom-rail button:hover{color:#fff;background:#1a4770;transform:translateY(-2px)}.stub-toast{position:absolute;left:50%;bottom:calc(var(--safe-bottom) + 94px);transform:translateX(-50%);z-index:5;padding:9px 14px;color:#eaf7ff;background:#07172cef;border:1px solid #70deff77;font-size:12px;font-weight:900}.modal{background:linear-gradient(160deg,#10244a,#071126);border:1px solid #70deff66}.modal-kicker{color:#77ddff;font-size:10px;letter-spacing:.16em;font-weight:900}.settings-modal h2{margin:6px 0 20px}.sound-switch{min-width:70px;min-height:38px;color:#eaf7ff;background:#176182;border:1px solid #74ddff;font-weight:900}.volume-slider{accent-color:#ffd366}.version-line{border-top:1px solid #70deff33;color:#8ea6c2}.version-line b{color:#ffd366}@keyframes drift{from{transform:scale(1.05) translate3d(0,0,0)}to{transform:scale(1.09) translate3d(-10px,-6px,0)}}@media (max-height:700px){.hero-copy{margin-top:72px}.launch-console{bottom:calc(var(--safe-bottom) + 86px);padding:8px}.primary-route{min-height:70px}.bottom-rail{padding:5px;gap:5px}.bottom-rail button{font-size:9px}.route-copy em{display:none}}
</style>

<style scoped>
/* Scene-first pass: controls sit on the world instead of reading as a dashboard. */
.orbit-menu{background:#191127}
.orbit-backdrop{opacity:.92;filter:saturate(1.28) contrast(1.06)}
.hero-copy{pointer-events:none}
.hero-scene{top:clamp(150px,22vh,210px);width:min(104vw,620px);height:min(104vw,620px);filter:drop-shadow(0 20px 26px #120b1ccc) saturate(1.15)}
.launch-console{bottom:calc(var(--safe-bottom) + 108px);width:min(calc(100% - 30px),500px);padding:0;background:transparent;border:0;box-shadow:none;clip-path:none}
.console-head{display:none}
.launch-route{margin-top:8px;border:2px solid rgba(255,224,147,.7);box-shadow:0 7px 0 rgba(62,29,56,.82),0 14px 24px rgba(9,5,22,.35);clip-path:polygon(0 10px,10px 0,calc(100% - 12px) 0,100% 12px,100% calc(100% - 10px),calc(100% - 10px) 100%,10px 100%,0 calc(100% - 10px));backdrop-filter:blur(5px)}
.primary-route{min-height:86px;background:linear-gradient(105deg,rgba(203,84,74,.94),rgba(92,52,106,.92));transform:rotate(-1deg)}
.primary-route:hover{transform:rotate(-1deg) translateY(-3px) scale(1.01)}
.route-copy strong{font-size:21px;text-shadow:0 2px 0 #6d3044}
.route-copy em{font-size:11px;color:#ffe8b4}
.route-go{border:2px solid #6d3044;box-shadow:0 3px 0 #6d3044}
.route-row{gap:10px;transform:rotate(1deg)}
.locked-route{min-height:58px;background:rgba(45,31,69,.82);border-color:rgba(172,132,184,.55);box-shadow:0 5px 0 rgba(31,16,43,.85),0 10px 18px rgba(9,5,22,.3)}
.locked-route .route-copy strong{font-size:14px}
.leaderboard-route{margin-top:10px;background:rgba(35,22,53,.88);border:2px solid rgba(255,205,112,.58);box-shadow:0 5px 0 rgba(49,22,49,.8);transform:rotate(-.5deg)}
.bottom-rail{background:rgba(25,14,39,.75);border:2px solid rgba(255,207,121,.58);box-shadow:0 7px 0 rgba(11,5,22,.55),0 14px 26px rgba(7,3,18,.4);backdrop-filter:blur(8px)}
.bottom-rail button{background:linear-gradient(145deg,rgba(90,48,77,.92),rgba(39,26,65,.95));border:2px solid rgba(255,205,118,.35);box-shadow:inset 0 2px #fff2,0 3px 0 #28152f;clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)}
.bottom-rail button:hover{background:linear-gradient(145deg,#b66359,#553067)}
@media (max-height:700px){.hero-scene{top:140px;width:380px;height:380px}.launch-console{bottom:calc(var(--safe-bottom) + 86px)}}
</style>

<style scoped>
/* Arcade composition pass: the scene is the hero, controls float over it. */
.orbit-backdrop{background-image:url('/assets/art/orbit-bg.svg');filter:saturate(1.18) contrast(1.04)}
.orbit-menu::after{background:linear-gradient(180deg,rgba(4,7,19,.06),transparent 28%,rgba(4,7,19,.08) 58%,#050817 96%)}
.hero-copy{position:relative;z-index:2;margin-top:clamp(56px,9vh,92px)}.hero-copy h1{font-size:clamp(45px,13vw,78px);color:#fff4d3;text-shadow:0 4px 0 #7a3a37,0 0 28px #ffad5d66}.hero-copy h1 span{color:#ffcb61}.eyebrow{color:#ffd774;letter-spacing:.24em}.hero-copy p{color:#ffe3b2}
.hero-scene{position:absolute;z-index:1;left:50%;top:clamp(180px,27vh,250px);width:min(88vw,520px);height:min(88vw,520px);transform:translateX(-50%);object-fit:contain;filter:drop-shadow(0 18px 18px #0008);animation:scene-bob 5s ease-in-out infinite;pointer-events:none}
.launch-console{z-index:3;bottom:calc(var(--safe-bottom) + 110px);padding:9px;background:linear-gradient(180deg,rgba(8,12,33,.58),rgba(5,8,23,.9));border-color:#ffd36e66;box-shadow:0 12px 30px #0008}.console-head{color:#ffd36e}.launch-route{background:rgba(12,27,61,.72);border-color:#ffd36e55}.primary-route{background:linear-gradient(105deg,rgba(156,67,45,.94),rgba(27,66,111,.88));border-color:#ffe09a}.launch-route img{display:none}.primary-route{min-height:76px}.route-copy strong{font-size:19px;color:#fff4d3}.route-copy em{color:#e7cfa8}.route-go{background:#ffd36e}.locked-route{min-height:60px}.leaderboard-route{background:rgba(48,35,68,.86);border-color:#ffcf7266;color:#ffdf96}.bottom-rail{z-index:4;background:rgba(9,10,28,.88);border-color:#ffd36e55}.bottom-rail button{background:rgba(32,28,61,.9);border-color:#ffd36e33;color:#dcc5a8}.bottom-rail button svg{color:#ffd36e}.bottom-rail button:hover{background:#704131;color:#fff3d0}
@keyframes scene-bob{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-7px)}}
@media (max-height:700px){.hero-scene{top:155px;width:330px;height:330px}.hero-copy{margin-top:52px}.launch-console{bottom:calc(var(--safe-bottom) + 86px)}.route-copy em{display:none}}
</style>

<style scoped>
/* Command-deck reconstruction: a layered world composition replaces the old stacked menu. */
.orbit-menu { background: #040711; }
.orbit-backdrop { opacity: .72; filter: saturate(1.55) contrast(1.15) brightness(.72); transform: scale(1.12); }
.moon-horizon { position: absolute; left: -12%; right: -12%; bottom: 24%; height: 27%; z-index: -1; opacity: .72; background: linear-gradient(180deg, transparent, rgba(23, 93, 138, .12) 22%, rgba(6, 24, 47, .82)); border-top: 1px solid rgba(105, 224, 255, .28); transform: perspective(320px) rotateX(58deg); transform-origin: bottom; box-shadow: 0 -28px 70px rgba(46, 196, 255, .1); }
.profile-dock { background: linear-gradient(115deg, rgba(5,20,43,.96), rgba(8,47,70,.76)); border-color: rgba(106,228,255,.7); box-shadow: 0 0 0 1px rgba(255,214,105,.13), 0 16px 40px rgba(0,0,0,.5), inset 0 1px rgba(255,255,255,.2); }
.shop-dock { background: linear-gradient(145deg,#0b3557,#0b1c39); border-color: #84edff; box-shadow: 0 0 18px rgba(71,214,255,.25), 0 10px 26px #000b; }
.hero-copy { margin-top: clamp(52px, 8vh, 82px); position: relative; z-index: 4; }
.hero-copy h1 { font-size: clamp(48px, 14vw, 84px); line-height: .92; letter-spacing: .08em; text-shadow: 0 3px 0 #163e65, 0 0 18px rgba(80,219,255,.8), 0 0 46px rgba(255,180,81,.22); }
.hero-copy h1 span { color: #ffd36a; }
.hero-copy p { font-size: 13px; letter-spacing: .18em; color: #b7dced; }
.hero-readouts { display:flex; justify-content:center; gap:14px; margin-top:12px; color:#7de5ff; font-size:9px; letter-spacing:.09em; font-family: 'Trebuchet MS', sans-serif; }
.hero-readouts span { display:inline-flex; align-items:center; gap:5px; padding:4px 7px; border-left:1px solid #77e6ff66; background:#05182c88; }
.hero-readouts i { width:5px; height:5px; background:#6fffc4; box-shadow:0 0 8px #6fffc4; }
.orbital-rings { position:absolute; z-index:0; top:clamp(160px,23vh,220px); left:50%; width:min(125vw,720px); aspect-ratio:1; transform:translateX(-50%) rotate(-12deg); border:1px solid rgba(95,215,255,.25); border-radius:50%; box-shadow:0 0 0 22px rgba(95,215,255,.025), 0 0 0 58px rgba(95,215,255,.025); pointer-events:none; }
.orbital-rings::after { content:''; position:absolute; inset:10%; border:1px dashed rgba(255,210,103,.24); border-radius:50%; }
.orbital-rings i { position:absolute; width:7px; height:7px; background:#ffd56a; box-shadow:0 0 14px #ffd56a; border-radius:50%; }
.orbital-rings i:nth-child(1){left:11%;top:18%}.orbital-rings i:nth-child(2){right:17%;top:34%;background:#65e8ff;box-shadow:0 0 14px #65e8ff}.orbital-rings i:nth-child(3){left:34%;bottom:4%;}
.hero-scene { top:clamp(178px,26vh,252px); width:min(98vw,600px); height:min(98vw,600px); filter:drop-shadow(0 28px 28px #000d) drop-shadow(0 0 22px rgba(92,223,255,.24)) saturate(1.28); }
.launch-console { bottom:calc(var(--safe-bottom) + 104px); width:min(calc(100% - 28px),540px); padding:11px; background:linear-gradient(145deg,rgba(4,18,38,.94),rgba(5,9,25,.88)); border:1px solid rgba(102,224,255,.54); box-shadow:0 0 0 1px rgba(255,204,103,.1),0 24px 46px #000c,inset 0 1px #fff2; clip-path:polygon(0 0,calc(100% - 18px) 0,100% 18px,100% 100%,0 100%); }
.console-head { display:flex; color:#7fe8ff; letter-spacing:.18em; font-size:10px; }
.launch-route { background:linear-gradient(100deg,rgba(11,42,75,.94),rgba(11,25,54,.9)); border:1px solid rgba(111,226,255,.38); box-shadow:inset 0 1px rgba(255,255,255,.12); }
.primary-route { min-height:92px; background:linear-gradient(105deg,rgba(164,77,41,.94),rgba(16,65,105,.94)); border-color:#ffd66f; box-shadow:inset 0 1px #fff4,0 6px 0 #371e2a,0 14px 26px #0008; }
.primary-route img { display:block; width:96px; height:62px; }
.route-copy strong { font-size:21px; letter-spacing:.06em; }
.route-go { background:#ffd66e; color:#33220c; border:1px solid #fff0a8; box-shadow:0 3px 0 #885521; }
.locked-route { min-height:66px; background:linear-gradient(120deg,rgba(16,30,58,.9),rgba(24,20,49,.86)); border-color:rgba(122,179,216,.3); }
.leaderboard-route { background:linear-gradient(100deg,rgba(28,51,83,.94),rgba(47,35,69,.92)); border-color:#ffd66e88; box-shadow:inset 0 1px #fff2,0 5px 0 #1a1730; }
.bottom-rail { background:rgba(3,13,28,.94); border-color:rgba(100,222,255,.55); box-shadow:0 0 0 1px rgba(255,210,104,.1),0 13px 28px #000b; }
.bottom-rail button { background:linear-gradient(160deg,#102f50,#09182f); border-color:rgba(105,224,255,.35); color:#9bd4e8; }
.bottom-rail button svg { color:#72e4ff; }
.help-route{display:flex;align-items:center;gap:10px;width:100%;margin-top:8px;padding:9px 10px;color:#a8e4ff;background:rgba(16,42,74,.9);border:1px solid #6fdfff66;clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)}.help-route svg{color:#7fdcff}.help-route span{display:flex;flex:1;flex-direction:column;gap:2px;text-align:left}.help-route small{color:#7ba7c4;font-size:8px;letter-spacing:.14em}.help-route strong{font-size:13px}.help-route b{font-size:20px}.help-overlay{z-index:60;align-items:center;padding:18px 10px}.help-modal{width:min(100%,430px);max-height:calc(100dvh - 40px);display:flex;flex-direction:column;gap:12px;padding:18px 16px}.help-modal h2{margin:4px 0 0}.help-scroll{overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-right:4px}.help-scroll section{padding:11px 12px;background:rgba(8,24,46,.75);border:1px solid #6fdfff33;border-left:2px solid #7fdcff}.help-scroll h3{margin:0 0 6px;font-size:14px;color:#9fe8ff}.help-scroll p{margin:0;font-size:12.5px;line-height:1.7;color:#cfe2f2}.help-scroll b{color:#ffd98a}
@media (max-width:420px){.hero-readouts{gap:5px;font-size:8px}.hero-readouts span{padding:3px 4px}.orbital-rings{top:175px;width:135vw}.hero-scene{top:184px;width:112vw;height:112vw}.launch-console{bottom:calc(var(--safe-bottom) + 98px);padding:8px}.console-head{font-size:8px}.primary-route{min-height:78px}.primary-route img{width:72px;height:48px}.route-copy strong{font-size:17px}.route-copy em{font-size:9px}.route-row{gap:5px}.locked-route{min-height:55px}.locked-route img{display:none}.bottom-rail{width:calc(100% - 24px)}}
</style>

<style scoped>
.volume-control { margin-top: 14px; }
.volume-setting { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; color: #d9eaff; font-size: 13px; }
.volume-setting b { color: #ffd366; font-variant-numeric: tabular-nums; }
.volume-slider { width: 100%; height: 22px; cursor: pointer; }
.volume-slider:focus-visible { outline: 2px solid #7fe8ff; outline-offset: 3px; }
.version-line { margin-top: 16px; padding-top: 12px; }
@media (max-height: 700px) {
  .orbit-menu .hero-copy { margin-top: 8px; }
  .orbit-menu .hero-copy h1 { font-size: clamp(38px, 7.5vh, 50px); line-height: 1; }
  .orbit-menu .hero-copy p { margin: 3px 0 0; font-size: 11px; }
  .orbit-menu .hero-readouts { display: none; }
  .orbit-menu .route-copy em { display: block; }
}
</style>
