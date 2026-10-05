<template>
  <main class="screen game-menu-screen inventory-screen">
    <header class="title-bar">
      <button class="icon-btn" aria-label="返回基地" @click="navigate('menu')"><BackIcon /></button>
      <h2>我的背包</h2>
      <span class="inventory-total">{{ totalItems }} 件</span>
    </header>

    <section class="page-context">
      <span class="page-kicker">远征载荷 / INVENTORY</span>
      <b>已拥有的消耗道具</b>
    </section>

    <div class="scroll bag-body">
      <div v-if="totalItems === 0" class="empty-state">
        <span class="empty-mark" aria-hidden="true">＋</span>
        <strong>背包暂为空</strong>
        <p>前往补给商店，准备下一次月面远征。</p>
      </div>

      <div class="bag-grid" role="listbox" aria-label="消耗道具库存">
        <button
          v-for="item in ITEMS"
          :key="item.id"
          type="button"
          class="bag-slot"
          :class="{ empty: quantity(item.id) === 0, active: selectedId === item.id }"
          role="option"
          :aria-selected="selectedId === item.id"
          :aria-label="`${item.name}，持有 ${quantity(item.id)} 件`"
          @click="select(item.id)"
        >
          <span class="slot-icon" :style="{ background: item.color }" aria-hidden="true">
            <ItemGlyph :id="item.id" :size="22" />
          </span>
          <span class="slot-qty" :class="{ 'slot-qty-empty': quantity(item.id) === 0 }">
            × {{ quantity(item.id) }}
          </span>
        </button>
        <!-- 预留空格位，暗示背包还有扩容空间，更接近真实背包网格 -->
        <div v-for="n in emptySlotCount" :key="'blank-' + n" class="bag-slot blank" aria-hidden="true">
          <span class="slot-lock">🔒</span>
        </div>
      </div>
    </div>

    <transition name="pop">
      <div v-if="selected" class="item-detail card">
        <div class="item-detail-icon" :style="{ background: selected.color }" aria-hidden="true">
          <ItemGlyph :id="selected.id" :size="26" />
        </div>
        <div class="item-detail-copy">
          <div class="item-detail-head">
            <h3>{{ selected.name }}</h3>
            <span class="quantity" :class="{ 'quantity-empty': quantity(selected.id) === 0 }">
              × {{ quantity(selected.id) }}
            </span>
          </div>
          <p>{{ selected.desc }}</p>
        </div>
        <button class="item-detail-close" aria-label="关闭说明" @click="selectedId = ''">×</button>
      </div>
    </transition>

    <footer class="inventory-footer">
      <p v-if="!selected">点一个格子看道具说明；道具仍按原有准备阶段与对局规则使用。</p>
      <button class="btn btn-primary btn-block" @click="navigate('shop')">前往补给商店 <span aria-hidden="true">›</span></button>
    </footer>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useStore } from '../core/store.js'
import { ITEMS } from '../data/items.js'
import { Audio } from '../core/audio.js'
import { BackIcon } from './icons.js'
import ItemGlyph from './ItemGlyph.vue'

const emit = defineEmits(['nav'])
const store = useStore()
const totalItems = computed(() => ITEMS.reduce((total, item) => total + quantity(item.id), 0))
const selectedId = ref('')
const selected = computed(() => ITEMS.find((item) => item.id === selectedId.value) || null)

// 网格按 4 列铺满到至少两整行，不够的格子用「未解锁」占位格补齐，
// 看起来像一个还留有扩容空间的真实背包，而不是刚好卡着道具数量的列表。
const COLUMNS = 4
const emptySlotCount = computed(() => {
  const minSlots = COLUMNS * 2
  const need = Math.max(minSlots, Math.ceil(ITEMS.length / COLUMNS) * COLUMNS) - ITEMS.length
  return need
})

function quantity(id) {
  return Math.max(0, Number(store.items[id]) || 0)
}

function select(id) {
  Audio.click()
  selectedId.value = selectedId.value === id ? '' : id
}

function navigate(route) {
  Audio.click()
  emit('nav', route)
}
</script>

<style scoped>
.inventory-screen {
  gap: 10px;
  background:
    radial-gradient(ellipse at 85% 0, rgba(44, 154, 190, .14), transparent 38%),
    linear-gradient(180deg, #07182e, #030711 78%);
}
.title-bar h2 { color: #f1f8ff; }
.inventory-total {
  margin-left: auto;
  padding: 6px 9px;
  color: #ffd36e;
  background: rgba(7, 28, 51, .9);
  border: 1px solid rgba(99, 210, 255, .28);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: .05em;
}
.page-context { padding-top: 5px; padding-bottom: 9px; }
.page-context b { color: #f1f8ff; }
.bag-body { padding: 2px 2px 12px; }

/* 格子背包：经典 RPG 网格，道具图标 + 右下角数量角标 */
.bag-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.bag-slot {
  position: relative;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, rgba(9, 37, 64, .96), rgba(5, 13, 29, .96));
  border: 1px solid rgba(105, 221, 255, .32);
  border-radius: 14px;
  box-shadow: inset 0 1px rgba(255, 255, 255, .12), 0 6px 14px #0006;
  transition: transform .12s ease, border-color .12s ease;
}
.bag-slot:active { transform: scale(.95); }
.bag-slot.active {
  border-color: #ffd36e;
  box-shadow: 0 0 0 2px rgba(255, 211, 110, .5), 0 6px 14px #0006;
}
.bag-slot.empty .slot-icon { filter: grayscale(1) brightness(.6); opacity: .55; }
.bag-slot.empty .slot-qty { color: #6f8398; }
.bag-slot.blank {
  border-style: dashed;
  border-color: rgba(129, 158, 181, .22);
  background: rgba(5, 15, 30, .5);
  box-shadow: none;
}
.slot-lock { font-size: 15px; opacity: .3; }
.slot-icon {
  width: 56%;
  height: 56%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  border-radius: 10px;
  box-shadow: 0 0 12px rgba(92, 220, 255, .2), inset 0 1px rgba(255, 255, 255, .3);
}
.slot-qty {
  position: absolute;
  right: 4px;
  bottom: 4px;
  padding: 1px 5px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 900;
  color: #ffd36e;
  background: rgba(6, 15, 30, .92);
  border: 1px solid rgba(255, 211, 110, .35);
}
.slot-qty-empty { color: #7488a0; border-color: rgba(129, 158, 181, .3); }

/* 点开格子后的说明卡：浮在网格下方，不占用格子本身的空间 */
.item-detail {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  flex-shrink: 0;
  padding: 11px;
  background: linear-gradient(110deg, rgba(9, 37, 64, .96), rgba(5, 13, 29, .96));
  border: 1px solid rgba(255, 211, 110, .35);
  border-left: 3px solid rgba(255, 181, 77, .85);
}
.item-detail-icon {
  flex: 0 0 44px;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  border-radius: 10px;
  box-shadow: 0 0 16px rgba(92, 220, 255, .2), inset 0 1px rgba(255,255,255,.35);
}
.item-detail-copy { flex: 1; min-width: 0; }
.item-detail-head { display: flex; align-items: center; gap: 8px; }
.item-detail-head h3 { flex: 1; margin: 0; color: #edf8ff; font-size: 15px; letter-spacing: .04em; }
.item-detail-copy p { margin: 5px 0 0; color: #a9bfd1; font-size: 11px; line-height: 1.45; }
.item-detail-close { align-self: flex-start; color: #ffd36e; font-size: 18px; line-height: 1; padding: 0 2px; }
.quantity {
  min-width: 52px;
  padding: 3px 7px;
  color: #ffd36e;
  background: rgba(255, 211, 110, .09);
  border: 1px solid rgba(255, 211, 110, .28);
  text-align: center;
  font-size: 13px;
  font-weight: 900;
}
.quantity-empty { color: #8ca3b8; background: rgba(129, 158, 181, .06); border-color: rgba(129, 158, 181, .16); }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  margin: 2px 0 12px;
  padding: 17px 12px;
  color: #b7cde0;
  background: rgba(5, 19, 39, .72);
  border: 1px dashed rgba(103, 216, 255, .35);
  text-align: center;
}
.empty-mark { color: #ffd36e; font-size: 25px; line-height: 1; }
.empty-state strong { color: #e8f5ff; font-size: 14px; }
.empty-state p { margin: 0; font-size: 11px; }
.inventory-footer { flex: 0 0 auto; padding-top: 8px; border-top: 1px solid rgba(99, 210, 255, .2); }
.inventory-footer p { margin: 0 0 10px; color: #91acc6; font-size: 11px; line-height: 1.5; text-align: center; }
.inventory-footer .btn { min-height: 46px; font-size: 15px; }
.inventory-footer .btn span { margin-left: 3px; font-size: 21px; line-height: 0; }
@media (max-height: 700px) {
  .bag-grid { gap: 7px; }
  .item-detail { padding: 8px; }
  .item-detail-icon { flex-basis: 38px; width: 38px; height: 38px; }
}
</style>
