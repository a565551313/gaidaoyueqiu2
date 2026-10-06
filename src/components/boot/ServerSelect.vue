<template>
  <div class="screen game-menu-screen server-screen">
    <div class="hud-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>

    <div class="title-bar">
      <button v-if="canCancel" class="icon-btn" aria-label="返回" @click="emit('cancel')">
        <BackIcon />
      </button>
      <h2>选择航线</h2>
      <span class="season-mark">SELECT SECTOR</span>
    </div>

    <div class="page-context">
      <span class="page-kicker">服务器</span>
      <b>决定你的云端进度与榜单归属</b>
    </div>

    <div class="server-list">
      <button
        v-for="(server, idx) in servers"
        :key="server.id"
        class="server-card"
        :class="{ maintenance: server.status === 'maintenance', current: server.id === currentId }"
        :disabled="server.status === 'maintenance'"
        @click="choose(server)"
      >
        <span class="sv-plate" aria-hidden="true">S{{ idx + 1 }}</span>
        <span class="sv-copy">
          <strong>{{ server.name }}</strong>
          <small>
            <span class="sv-ping" :class="server.status" aria-hidden="true"><i></i><i></i><i></i></span>
            {{ statusText(server.status) }}<template v-if="server.id === currentId"> · 本机已游玩</template>
          </small>
        </span>
        <span v-if="server.tag" class="sv-tag" :class="`t-${server.tag}`">{{ tagText(server.tag) }}</span>
        <span v-else-if="server.status === 'maintenance'" class="sv-tag lock">维护中</span>
        <b class="sv-go" aria-hidden="true">▶</b>
      </button>
    </div>

    <p class="server-foot">
      <template v-if="remembered">上次进入：{{ remembered.name }}</template>
      <template v-else>首次进入，选择一个航线开始</template>
    </p>

    <button class="boot-alt server-offline" @click="emit('offline')">离线继续（单机模式）</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { BackIcon } from '../icons.js'
import { SERVERS, getRememberedServer, rememberServer } from '../../config/servers.js'
import { cloudState } from '../../core/cloud/index.js'

const emit = defineEmits(['chosen', 'cancel', 'offline'])
const props = defineProps({ canCancel: { type: Boolean, default: false } })

const servers = SERVERS
const remembered = getRememberedServer()
const currentId = computed(() => cloudState.serverId || '')

function statusText(status) {
  return status === 'smooth' ? '流畅' : status === 'busy' ? '繁忙' : '维护中'
}
function tagText(tag) {
  return tag === 'recommended' ? '✦ 推荐' : tag === 'new' ? '新服' : tag === 'hot' ? '火爆' : ''
}

function choose(server) {
  if (server.status === 'maintenance') return
  rememberServer(server.id)
  emit('chosen', server)
}
</script>

<style scoped>
/* ================= 选择航线 · 出发航班板 ================= */
.server-screen{display:flex;flex-direction:column;gap:13px;padding:calc(var(--safe-top,0px) + 16px) 20px calc(var(--safe-bottom,0px) + 16px)}

.hud-frame{position:absolute;inset:9px;pointer-events:none;z-index:6}
.hud-frame i{position:absolute;width:16px;height:16px;border:0 solid rgba(82,216,255,.5)}
.hud-frame i:nth-child(1){top:0;left:0;border-top-width:2px;border-left-width:2px}
.hud-frame i:nth-child(2){top:0;right:0;border-top-width:2px;border-right-width:2px}
.hud-frame i:nth-child(3){bottom:0;left:0;border-bottom-width:2px;border-left-width:2px}
.hud-frame i:nth-child(4){bottom:0;right:0;border-bottom-width:2px;border-right-width:2px}

.server-screen .title-bar{margin-bottom:2px;padding-bottom:10px}
.server-screen .title-bar h2{font-size:23px;letter-spacing:.08em;text-shadow:0 2px 0 rgba(4,16,34,.9),0 0 20px rgba(82,216,255,.28)}
.season-mark{margin-left:auto;padding:4px 9px;font-size:9px;font-weight:900;letter-spacing:.22em;color:#52d8ff;background:rgba(6,20,42,.85);border:1px solid rgba(82,216,255,.4);clip-path:polygon(0 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%)}

.server-list{flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;overflow-y:auto;padding:2px}

/* 航班行：编号铭牌 + 名称/信号 + 斜切标签 + 起飞键 */
.server-card{position:relative;display:flex;align-items:center;gap:12px;min-height:74px;padding:12px 12px 12px 14px;text-align:left;color:#edf7ff;background:linear-gradient(150deg,rgba(16,41,86,.94),rgba(7,19,40,.96));border:1px solid rgba(99,210,255,.3);border-radius:3px;cursor:pointer;overflow:hidden;transition:transform .14s,border-color .14s,box-shadow .14s}
.server-card::before{content:'';position:absolute;top:0;left:14px;right:14px;height:1px;background:linear-gradient(90deg,transparent,rgba(146,231,255,.75),transparent);opacity:.6}
.server-card:hover:not(:disabled){transform:translateY(-2px);border-color:rgba(82,216,255,.75);box-shadow:0 12px 28px rgba(3,10,24,.6),0 0 20px rgba(82,216,255,.2)}
.server-card:active:not(:disabled){transform:translateY(0)}
.server-card.current{border-color:rgba(255,211,110,.6);box-shadow:inset 3px 0 0 #ffd36e,0 10px 24px rgba(3,10,24,.5)}
.server-card.current::after{content:'LAST PLAYED';position:absolute;top:7px;right:52px;padding:2px 6px;font-size:8px;font-weight:900;letter-spacing:.18em;color:#ffd36e;background:#241b0ccc;border:1px solid rgba(255,211,110,.45);border-radius:2px}
.server-card.maintenance{cursor:not-allowed}
.server-card.maintenance .sv-plate,.server-card.maintenance .sv-copy,.server-card.maintenance .sv-go{opacity:.45;filter:grayscale(.6)}
.server-card.maintenance::before{left:0;right:0;background:repeating-linear-gradient(-45deg,transparent 0 8px,rgba(93,114,136,.16) 8px 16px);opacity:1;height:100%}

.sv-plate{flex:none;width:52px;height:52px;display:grid;place-items:center;font-size:19px;font-weight:900;letter-spacing:.03em;color:#7be3ff;text-shadow:0 0 14px rgba(82,216,255,.55);background:linear-gradient(160deg,#123457,#081a33);border:1px solid rgba(99,210,255,.35);border-radius:3px;clip-path:polygon(0 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%)}

.sv-copy{display:flex;flex-direction:column;gap:5px;flex:1;min-width:0}
.sv-copy strong{font-size:16px;font-weight:900;letter-spacing:.04em;color:#f2f9ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sv-copy small{display:flex;align-items:center;gap:6px;color:#7ea3c4;font-size:11px;font-weight:700;letter-spacing:.05em}

/* 信号条：流畅=青波 繁忙=金快闪 维护=灰停 */
.sv-ping{display:inline-flex;align-items:flex-end;gap:2px;height:10px}
.sv-ping i{width:3px;border-radius:1px;transform-origin:bottom;background:#7be3ff}
.sv-ping i:nth-child(1){height:4px}
.sv-ping i:nth-child(2){height:7px}
.sv-ping i:nth-child(3){height:10px}
.sv-ping.smooth i{animation:ping-wave 1.3s ease-in-out infinite}
.sv-ping.smooth i:nth-child(2){animation-delay:.18s}
.sv-ping.smooth i:nth-child(3){animation-delay:.36s}
.sv-ping.busy i{background:#ffd36e;animation:ping-wave .55s ease-in-out infinite}
.sv-ping.busy i:nth-child(2){animation-delay:.09s}
.sv-ping.busy i:nth-child(3){animation-delay:.18s}
.sv-ping.maintenance i{background:#5c7288;opacity:.5;animation:none}

.sv-tag{flex:none;position:relative;z-index:1;padding:5px 9px;font-size:10px;font-weight:900;letter-spacing:.08em;color:#231604;background:linear-gradient(180deg,#ffe48a,#f0a742);clip-path:polygon(0 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%)}
.sv-tag.t-new{background:linear-gradient(180deg,#8fe3ff,#3aa5e8);color:#04202f}
.sv-tag.lock{background:#223046;color:#8da9c8;clip-path:none;border-radius:2px;border:1px solid rgba(141,169,200,.3)}

.sv-go{flex:none;width:34px;height:34px;display:grid;place-items:center;font-size:12px;color:#52d8ff;background:rgba(6,20,42,.9);border:1px solid rgba(99,210,255,.4);border-radius:3px;transition:transform .14s,background .14s,color .14s;position:relative;z-index:1}
.server-card:hover:not(:disabled) .sv-go{background:linear-gradient(180deg,#51d9ff,#2467db);color:#fff;transform:translateX(3px);box-shadow:0 0 14px rgba(82,216,255,.5)}

.server-foot{flex:none;margin:0;display:flex;align-items:center;justify-content:center;gap:9px;color:#7ea3c4;font-size:11px;font-weight:700;letter-spacing:.06em}
.server-foot::before,.server-foot::after{content:'';flex:none;width:34px;height:1px;background:repeating-linear-gradient(90deg,rgba(99,210,255,.4) 0 4px,transparent 4px 8px)}

.server-offline{margin-top:2px;min-height:44px;border-radius:4px;font-size:13px;font-weight:800;letter-spacing:.1em;color:#9fc6e8;background:linear-gradient(180deg,rgba(20,44,78,.92),rgba(9,22,44,.95));border:1px solid rgba(99,210,255,.38);box-shadow:0 4px 0 rgba(4,14,30,.95),inset 0 1px 0 rgba(255,255,255,.08);transition:transform .08s ease,box-shadow .08s ease}
.server-offline:active{transform:translateY(2px);box-shadow:0 2px 0 rgba(4,14,30,.95),inset 0 1px 0 rgba(255,255,255,.08)}

@keyframes ping-wave{0%,100%{transform:scaleY(.55);opacity:.5}50%{transform:scaleY(1);opacity:1}}

@media (prefers-reduced-motion: reduce){
  .sv-ping i{animation:none}
}
</style>
