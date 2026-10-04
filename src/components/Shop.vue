<template>
  <div class="screen game-menu-screen shop-screen">
    <div class="title-bar">
      <button class="icon-btn" @click="back"><BackIcon /></button>
      <h2>探险补给</h2>
      <div class="pill" style="margin-left:auto"><span class="coin-dot"></span>{{ store.coins }}</div>
    </div>

    <div class="page-context">
      <span class="page-kicker">营地商贩</span>
      <b>带上趁手装备，再出发</b>
    </div>

    <div class="shop-tabs" role="tablist" aria-label="商店分类">
      <button
        class="shop-tab"
        :class="{ active: shopTab === 'items' }"
        role="tab"
        :aria-selected="shopTab === 'items'"
        @click="shopTab = 'items'"
      >
        消耗道具
      </button>
      <button
        class="shop-tab"
        :class="{ active: shopTab === 'materials' }"
        role="tab"
        :aria-selected="shopTab === 'materials'"
        @click="shopTab = 'materials'"
      >
        建筑材质
      </button>
    </div>

    <div v-if="shopTab === 'items'" class="scroll item-list" role="tabpanel">
      <div v-for="item in ITEMS" :key="item.id" class="item-card card">
        <div class="item-icon" :style="{ background: item.color }">
          <ItemGlyph :id="item.id" />
        </div>
        <div class="item-info">
          <div class="item-head">
            <span class="item-name">{{ item.name }}</span>
            <span class="item-count" v-if="held(item.id) > 0">持有 {{ held(item.id) }}</span>
          </div>
          <div class="item-desc text-soft">{{ item.desc }}</div>
          <div class="item-foot">
            <span class="price"><span class="coin-dot"></span>{{ item.price }}</span>
            <button
              class="btn btn-gold buy-btn"
              :disabled="store.coins < item.price"
              @click="buy(item)"
            >
              购买
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="scroll material-list" role="tabpanel">
      <div class="material-tip card">
        <span class="material-tip-icon">▦</span>
        <div>
          <b>建筑材质</b>
          <p class="text-soft">材质永久解锁，装备后会改变本局方块外观与落层音效，并针对不同天气提供帮助。点击「装备」即可试听该材质的落地声。</p>
        </div>
      </div>

      <div
        v-for="material in MATERIALS"
        :key="material.id"
        class="material-card card"
        :class="{ equipped: isEquipped(material.id) }"
      >
        <div class="material-card-top">
          <div class="material-swatch" aria-hidden="true">
            <CodexCanvas :draw="swatchOf(material.id)" :width="64" :height="52" :animated="false" />
          </div>
          <div class="material-info">
            <div class="material-head">
              <span class="material-name">{{ material.name }}</span>
              <span v-if="isEquipped(material.id)" class="material-status current">使用中</span>
              <span v-else-if="owned(material.id)" class="material-status">已解锁</span>
            </div>
            <div class="material-desc text-soft">{{ material.desc }}</div>
          </div>
        </div>
        <div class="material-effect">
          <span class="effect-dot"></span>{{ material.effect }}
        </div>
        <div class="material-foot">
          <span v-if="owned(material.id)" class="material-owned">
            {{ isEquipped(material.id) ? '当前装备' : '永久拥有' }}
          </span>
          <span v-else class="price"><span class="coin-dot"></span>{{ material.price }}</span>
          <button
            v-if="owned(material.id) && !isEquipped(material.id)"
            class="btn btn-primary material-btn"
            @click="equip(material)"
          >
            装备
          </button>
          <button
            v-else-if="!owned(material.id)"
            class="btn btn-gold material-btn"
            :disabled="store.coins < material.price"
            @click="buyMaterial(material)"
          >
            解锁
          </button>
          <span v-else class="material-equipped-label">已装备</span>
        </div>
      </div>
    </div>

    <transition name="pop">
      <div v-if="toast" class="buy-toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useStore, actions } from '../core/store.js'
import { ITEMS } from '../data/items.js'
import { MATERIALS } from '../data/materials.js'
import { Audio } from '../core/audio.js'
import { BackIcon } from './icons.js'
import ItemGlyph from './ItemGlyph.vue'
import CodexCanvas from './CodexCanvas.vue'
import { materialSwatch } from '../core/codex/blocks.js'

// 缓存：draw 身份变了 CodexCanvas 就会重启，模板里不能每次渲染都新建一个
const swatchCache = new Map()
function swatchOf(id) {
  if (!swatchCache.has(id)) swatchCache.set(id, materialSwatch(id))
  return swatchCache.get(id)
}

const emit = defineEmits(['nav'])
const store = useStore()
const shopTab = ref('items')
const toast = ref('')
let toastTimer = null

function held(id) {
  return store.items[id] || 0
}
function owned(id) {
  return !!store.materials[id]
}
function isEquipped(id) {
  return store.equippedMaterial === id
}
function back() {
  Audio.click()
  emit('nav', 'menu')
}
function buy(item) {
  if (actions.buyItem(item.id)) {
    showToast(`已购买 ${item.name}`)
  }
}
function buyMaterial(material) {
  if (actions.buyMaterial(material.id)) {
    showToast(`已解锁 ${material.name}`)
  }
}
function equip(material) {
  if (actions.equipMaterial(material.id)) {
    showToast(`已装备 ${material.name}`)
  }
}
function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 1400)
}
</script>

<style scoped>
.shop-screen {
  gap: 12px;
}
.shop-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 4px;
  border-radius: 15px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  flex-shrink: 0;
}
.shop-tab {
  padding: 10px 8px;
  border-radius: 11px;
  color: var(--text-soft);
  font-size: 14px;
  font-weight: 800;
}
.shop-tab.active {
  color: #fff;
  background: linear-gradient(135deg, var(--primary-2), var(--primary));
  box-shadow: 0 4px 12px rgba(106, 91, 255, 0.28);
}
.item-list,
.material-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.item-card {
  display: flex;
  gap: 14px;
  padding: 14px;
}
.item-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}
.item-info {
  flex: 1;
  min-width: 0;
}
.item-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.item-name {
  font-size: 17px;
  font-weight: 800;
}
.item-count {
  font-size: 12px;
  font-weight: 700;
  color: var(--success);
  background: color-mix(in srgb, var(--success) 16%, transparent);
  padding: 2px 8px;
  border-radius: 999px;
}
.item-desc {
  font-size: 13px;
  line-height: 1.5;
  margin: 4px 0 10px;
}
.item-foot,
.material-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.price {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 800;
  font-size: 16px;
}
.buy-btn {
  padding: 9px 22px;
  font-size: 15px;
}

/* 建筑材质 */
.material-tip {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 13px 14px;
  line-height: 1.45;
}
.material-tip-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: var(--primary);
  font-size: 20px;
  font-weight: 900;
}
.material-tip b {
  display: block;
  margin-bottom: 2px;
}
.material-tip p {
  margin: 0;
  font-size: 12px;
}
.material-card {
  padding: 14px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.material-card.equipped {
  border-color: color-mix(in srgb, var(--primary) 58%, var(--panel-border));
  box-shadow: 0 6px 18px rgba(106, 91, 255, 0.18);
}
.material-card-top {
  display: flex;
  gap: 13px;
  align-items: center;
}
.material-swatch {
  width: 64px;
  height: 52px;
  position: relative;
  flex: 0 0 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0a1830;
  overflow: hidden;
  border-radius: 14px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42), var(--shadow-sm);
}
.material-info {
  min-width: 0;
  flex: 1;
}
.material-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}
.material-name {
  font-size: 17px;
  font-weight: 900;
}
.material-status {
  padding: 2px 7px;
  border-radius: 999px;
  color: var(--success);
  background: color-mix(in srgb, var(--success) 16%, transparent);
  font-size: 11px;
  font-weight: 800;
}
.material-status.current {
  color: #fff;
  background: var(--primary);
}
.material-desc {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.45;
}
.material-effect {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 13px 0 12px;
  padding: 9px 10px;
  border-radius: 11px;
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  color: var(--text);
  font-size: 13px;
  line-height: 1.4;
  font-weight: 750;
}
.effect-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--primary);
}
.material-owned,
.material-equipped-label {
  color: var(--text-soft);
  font-size: 13px;
  font-weight: 700;
}
.material-equipped-label {
  color: var(--primary);
}
.material-btn {
  min-width: 82px;
  padding: 9px 16px;
  font-size: 14px;
}
.buy-toast {
  position: absolute;
  bottom: calc(var(--safe-bottom) + 24px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--text);
  color: var(--panel-solid);
  padding: 11px 22px;
  border-radius: 999px;
  font-weight: 700;
  box-shadow: var(--shadow);
  z-index: 30;
  white-space: nowrap;
}
</style>

<style scoped>
.shop-screen { background: radial-gradient(circle at 12% 10%,rgba(255,171,74,.13),transparent 28%), linear-gradient(180deg,#071a30,#030711 76%); }
.shop-screen::after { content:'SUPPLY DECK / AUTHORIZED LOADOUT'; position:absolute; top:88px; right:18px; color:#ffd36b55; font:900 9px/1 'Trebuchet MS'; letter-spacing:.18em; writing-mode:vertical-rl; pointer-events:none; }
.shop-tabs { margin-top:4px; background:#061328; border:1px solid #68ddff55; clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,0 100%); }
.shop-tab { letter-spacing:.08em; }
.item-list,.material-list { gap:14px; padding-top:10px; }
.item-card,.material-card { position:relative; padding:15px 12px; background:linear-gradient(110deg,rgba(9,37,64,.96),rgba(5,13,29,.96)); border:1px solid #69ddff44; border-left:3px solid #ffb54d99; clip-path:polygon(0 0,calc(100% - 13px) 0,100% 13px,100% 100%,0 100%); box-shadow:0 12px 26px #0008,inset 0 1px #fff2; }
.item-icon,.material-swatch { border-radius:3px; box-shadow:0 0 18px rgba(92,220,255,.25),inset 0 1px #fff5; }
.item-name,.material-name { letter-spacing:.06em; }
.buy-btn,.material-btn { min-height:38px; clip-path:polygon(0 0,calc(100% - 7px) 0,100% 7px,100% 100%,0 100%); }
.material-effect { border-left:2px solid #67e1ff; background:#0a2b45aa; }
.buy-toast { border-radius:2px; border:1px solid #ffd36b; background:#07182deF; box-shadow:0 0 20px #55ddff33; }
</style>
