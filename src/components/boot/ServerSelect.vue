<template>
  <div class="screen game-menu-screen server-screen">
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
        v-for="server in servers"
        :key="server.id"
        class="server-card"
        :class="{ maintenance: server.status === 'maintenance', current: server.id === currentId }"
        :disabled="server.status === 'maintenance'"
        @click="choose(server)"
      >
        <span class="sv-status" :class="server.status" aria-hidden="true"></span>
        <span class="sv-copy">
          <strong>{{ server.name }}</strong>
          <small>{{ statusText(server.status) }}<template v-if="server.id === currentId"> · 本机已游玩</template></small>
        </span>
        <span v-if="server.tag" class="sv-tag">{{ tagText(server.tag) }}</span>
        <span v-else-if="server.status === 'maintenance'" class="sv-tag lock">维护中</span>
        <b class="sv-go">›</b>
      </button>
    </div>

    <p class="server-foot">
      <template v-if="remembered">上次进入：{{ remembered.name }}</template>
      <template v-else>首次进入，选择一个航线开始</template>
    </p>

    <button class="btn btn-ghost btn-block server-offline" @click="emit('offline')">离线继续（单机模式）</button>
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
.server-screen{display:flex;flex-direction:column;gap:14px;padding:calc(var(--safe-top,0px) + 18px) 20px calc(var(--safe-bottom,0px) + 18px)}
.server-list{display:flex;flex-direction:column;gap:10px;overflow-y:auto}
.server-card{display:flex;align-items:center;gap:12px;padding:14px;text-align:left;color:#edf7ff;background:#102956bb;border:1px solid #70deff3b;border-radius:12px;cursor:pointer;transition:transform .14s,filter .14s}
.server-card:hover:not(:disabled){filter:brightness(1.16);transform:translateY(-2px)}
.server-card.current{border-color:#ffd36eaa;background:linear-gradient(100deg,#2a221088,#154a77e6)}
.server-card.maintenance{opacity:.55;cursor:not-allowed}
.sv-status{width:10px;height:10px;flex:none;border-radius:50%}
.sv-status.smooth{background:#7be3ff;box-shadow:0 0 8px #7be3ffaa}
.sv-status.busy{background:#ffd466;box-shadow:0 0 8px #ffd466aa}
.sv-status.maintenance{background:#8da9c8}
.sv-copy{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0}
.sv-copy strong{font-size:16px}
.sv-copy small{color:#8da9c8;font-size:11px}
.sv-tag{flex:none;padding:3px 7px;border-radius:5px;background:#ffd36e;color:#35230e;font-size:10px;font-weight:900}
.sv-tag.lock{background:#2a3548;color:#8da9c8}
.sv-go{font-size:20px;color:#7be3ff}
.server-foot{margin:0;color:#8da9c8;font-size:11px;text-align:center}
.server-offline{margin-top:auto}
</style>
