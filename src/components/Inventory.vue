<template>
  <main class="screen game-menu-screen inventory-screen">
    <header class="title-bar">
      <button class="icon-btn" aria-label="返回基地" @click="navigate('menu')"><BackIcon /></button>
      <h2>我的背包</h2>
      <span class="inventory-total">{{ totalItems }} / {{ bagCapacity }} 格</span>
    </header>

    <section class="page-context">
      <span class="page-kicker">远征载荷 / INVENTORY</span>
      <b>已拥有的消耗道具</b>
    </section>

    <div class="scroll bag-body">
      <div class="bag-grid" role="listbox" aria-label="消耗道具库存">
        <button
          v-for="item in ITEMS"
          :key="item.id"
          type="button"
          class="bag-slot"
          :class="{ filled: quantity(item.id) > 0, active: selectedId === item.id }"
          role="option"
          :aria-selected="selectedId === item.id"
          :aria-label="quantity(item.id) > 0 ? `${item.name}，持有 ${quantity(item.id)} 件` : `${item.name}，未持有`"
          :disabled="quantity(item.id) === 0"
          @click="select(item.id)"
        >
          <template v-if="quantity(item.id) > 0">
            <span class="slot-icon" :style="{ background: item.color }" aria-hidden="true">
              <ItemGlyph :id="item.id" :size="22" />
            </span>
            <span class="slot-qty">× {{ quantity(item.id) }}</span>
          </template>
        </button>
        <!-- 容量范围内还没放东西的格子，纯占位，不可点 -->
        <div v-for="n in blankSlotCount" :key="'blank-' + n" class="bag-slot blank" aria-hidden="true"></div>
      </div>
    </div>

    <transition name="pop">
      <div v-if="selected" class="item-detail">
        <div class="item-detail-icon" :style="{ background: selected.color }" aria-hidden="true">
          <ItemGlyph :id="selected.id" :size="26" />
        </div>
        <div class="item-detail-copy">
          <div class="item-detail-head">
            <h3>{{ selected.name }}</h3>
            <span class="quantity">× {{ quantity(selected.id) }}</span>
          </div>
          <p>{{ selected.desc }}</p>
          <button
            v-if="selected.id === 'bagExpand'"
            type="button"
            class="item-use-btn"
            @click="useBagExpand"
          >
            使用（背包 +{{ BAG_SLOT_STEP }} 格）
          </button>
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
import { useStore, actions } from '../core/store.js'
import { ITEMS, BAG_DEFAULT_CAPACITY, BAG_SLOT_STEP } from '../data/items.js'
import { Audio } from '../core/audio.js'
import { BackIcon } from './icons.js'
import ItemGlyph from './ItemGlyph.vue'

const emit = defineEmits(['nav'])
const store = useStore()
const totalItems = computed(() => ITEMS.reduce((total, item) => total + quantity(item.id), 0))
const selectedId = ref('')
const selected = computed(() => {
  const item = ITEMS.find((i) => i.id === selectedId.value)
  return item && quantity(item.id) > 0 ? item : null
})

// 背包格子总数由存档里的 bagCapacity 决定（默认 20，买扩容道具 +5）；
// 7 种道具各占一格，剩下的格子都是空位，一行铺 5 个（见样式里的 bag-grid）。
const bagCapacity = computed(() => Math.max(BAG_DEFAULT_CAPACITY, Number(store.bagCapacity) || BAG_DEFAULT_CAPACITY))
const blankSlotCount = computed(() => Math.max(0, bagCapacity.value - ITEMS.length))

function quantity(id) {
  return Math.max(0, Number(store.items[id]) || 0)
}

function select(id) {
  if (quantity(id) === 0) return
  Audio.click()
  selectedId.value = selectedId.value === id ? '' : id
}

function navigate(route) {
  Audio.click()
  emit('nav', route)
}

// 背包扩容卡是普通道具：点「使用」才真正生效，买的时候不会自动扩容。
function useBagExpand() {
  if (actions.useBagExpansion()) {
    selectedId.value = ''
  }
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

/* 格子背包：经典 RPG 网格，一行 5 格，可以买扩容道具增加总格数 */
.bag-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 9px;
}
/* 所有格子（已注册但为空的道具位 + 纯填充空位）统一同一套「点亮」底色，
   不再用实线/虚线去区分两种空格——用户看来它们应该是同一种东西。
   只有真的持有数量 > 0 时才叠加更亮的 filled 效果。 */
.bag-slot {
  position: relative;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, rgba(9, 37, 64, .72), rgba(5, 13, 29, .72));
  border: 1px solid rgba(105, 221, 255, .24);
  border-radius: 12px;
  box-shadow: inset 0 1px rgba(255, 255, 255, .08);
  transition: transform .12s ease, border-color .12s ease;
}
.bag-slot.filled {
  background: linear-gradient(160deg, rgba(9, 37, 64, .96), rgba(5, 13, 29, .96));
  border-color: rgba(105, 221, 255, .4);
  box-shadow: inset 0 1px rgba(255, 255, 255, .14), 0 6px 14px #0006;
}
.bag-slot.filled:active { transform: scale(.95); }
.bag-slot.active {
  border-color: #ffd36e;
  box-shadow: 0 0 0 2px rgba(255, 211, 110, .5), 0 6px 14px #0006;
}
.bag-slot:disabled { cursor: default; }
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

/* 点开格子后的说明卡：浮在网格下方，不占用格子本身的空间 */
.item-detail {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  flex-shrink: 0;
  padding: 11px;
  border-radius: 12px;
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
.item-use-btn {
  display: inline-flex;
  align-items: center;
  margin-top: 9px;
  padding: 7px 14px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 900;
  color: #3a2608;
  background: linear-gradient(135deg, #ffe49a, #ffc24d);
  box-shadow: 0 5px 12px rgba(255, 180, 60, .32);
}
.item-use-btn:active { transform: scale(.96); }
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
.inventory-footer { flex: 0 0 auto; padding-top: 8px; border-top: 1px solid rgba(99, 210, 255, .2); }
.inventory-footer p { margin: 0 0 10px; color: #91acc6; font-size: 11px; line-height: 1.5; text-align: center; }
.inventory-footer .btn { min-height: 46px; font-size: 15px; }
.inventory-footer .btn span { margin-left: 3px; font-size: 21px; line-height: 0; }
@media (max-height: 700px) {
  .bag-grid { gap: 6px; }
  .item-detail { padding: 8px; }
  .item-detail-icon { flex-basis: 38px; width: 38px; height: 38px; }
}
</style>
