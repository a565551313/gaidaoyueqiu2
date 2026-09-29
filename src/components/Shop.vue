<template>
  <div class="screen shop-screen">
    <div class="title-bar">
      <button class="icon-btn" @click="back"><BackIcon /></button>
      <h2>商店</h2>
      <div class="pill" style="margin-left:auto"><span class="coin-dot"></span>{{ store.coins }}</div>
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
          <div class="material-swatch" :class="`material-swatch-${material.id}`" aria-hidden="true">
            <span></span>
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
  overflow: hidden;
  border-radius: 14px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42), var(--shadow-sm);
}
.material-swatch::after,
.material-swatch span {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.material-swatch::after {
  background: linear-gradient(115deg, rgba(255,255,255,0.36), transparent 38%, rgba(0,0,0,0.2));
  mix-blend-mode: overlay;
}
.material-swatch-soil {
  background-color: #9c5b36;
  background-image: radial-gradient(circle at 18% 32%, rgba(65,30,17,0.46) 0 2px, transparent 2.5px), radial-gradient(circle at 68% 68%, rgba(240,174,100,0.35) 0 1.5px, transparent 2px);
  background-size: 18px 17px, 23px 21px;
}
.material-swatch-concrete {
  background-color: #8e99a6;
  background-image: radial-gradient(circle at 20% 30%, rgba(255,255,255,0.5) 0 1.5px, transparent 2px), radial-gradient(circle at 70% 68%, rgba(45,53,62,0.4) 0 2px, transparent 2.5px);
  background-size: 17px 15px, 23px 19px;
}
.material-swatch-steel {
  background: repeating-linear-gradient(170deg, #d8e8f2 0 5px, #7095af 6px 9px, #3f6077 10px 12px);
}
.material-swatch-bronze {
  background: repeating-linear-gradient(135deg, #e0b26d 0 7px, #9a6335 8px 12px, #c38a4b 13px 17px);
}
.material-swatch-blackgold {
  background-color: #29203e;
  background-image: radial-gradient(circle at 30% 35%, rgba(255,211,108,0.85) 0 1.5px, transparent 2px), radial-gradient(circle at 75% 65%, rgba(165,126,255,0.62) 0 1.5px, transparent 2px);
  background-size: 19px 18px, 25px 22px;
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
