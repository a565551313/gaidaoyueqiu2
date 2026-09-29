<template>
  <div class="screen">
    <div class="title-bar">
      <button class="icon-btn" @click="back"><BackIcon /></button>
      <h2>道具商店</h2>
      <div class="pill" style="margin-left:auto"><span class="coin-dot"></span>{{ store.coins }}</div>
    </div>

    <div class="scroll item-list">
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

    <transition name="pop">
      <div v-if="toast" class="buy-toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useStore, actions } from '../core/store.js'
import { ITEMS } from '../data/items.js'
import { Audio } from '../core/audio.js'
import { BackIcon } from './icons.js'
import ItemGlyph from './ItemGlyph.vue'

const emit = defineEmits(['nav'])
const store = useStore()
const toast = ref('')
let toastTimer = null

function held(id) {
  return store.items[id] || 0
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
function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 1400)
}
</script>

<style scoped>
.item-list {
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
.item-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
}
</style>
