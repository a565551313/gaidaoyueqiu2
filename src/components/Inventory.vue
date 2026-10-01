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

    <div class="scroll inventory-list" aria-label="消耗道具库存">
      <div v-if="totalItems === 0" class="empty-state">
        <span class="empty-mark" aria-hidden="true">＋</span>
        <strong>背包暂为空</strong>
        <p>前往补给商店，准备下一次月面远征。</p>
      </div>

      <article v-for="item in ITEMS" :key="item.id" class="inventory-item card">
        <div class="item-icon" :style="{ background: item.color }" aria-hidden="true">
          <ItemGlyph :id="item.id" />
        </div>
        <div class="item-copy">
          <div class="item-heading">
            <h3>{{ item.name }}</h3>
            <span class="quantity" :class="{ 'quantity-empty': quantity(item.id) === 0 }">
              × {{ quantity(item.id) }}
            </span>
          </div>
          <p>{{ item.desc }}</p>
        </div>
      </article>
    </div>

    <footer class="inventory-footer">
      <p>道具仍按原有准备阶段与对局规则使用；背包仅查看库存。</p>
      <button class="btn btn-primary btn-block" @click="navigate('shop')">前往补给商店 <span aria-hidden="true">›</span></button>
    </footer>
  </main>
</template>

<script setup>
import { computed } from 'vue'
import { useStore } from '../core/store.js'
import { ITEMS } from '../data/items.js'
import { Audio } from '../core/audio.js'
import { BackIcon } from './icons.js'
import ItemGlyph from './ItemGlyph.vue'

const emit = defineEmits(['nav'])
const store = useStore()
const totalItems = computed(() => ITEMS.reduce((total, item) => total + quantity(item.id), 0))

function quantity(id) {
  return Math.max(0, Number(store.items[id]) || 0)
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
.inventory-list { display: flex; flex-direction: column; gap: 9px; padding: 2px 2px 12px; }
.inventory-item {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  min-height: 82px;
  padding: 11px;
  background: linear-gradient(110deg, rgba(9, 37, 64, .96), rgba(5, 13, 29, .96));
  border: 1px solid rgba(105, 221, 255, .27);
  border-left: 3px solid rgba(255, 181, 77, .72);
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%);
}
.item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, .2);
  box-shadow: 0 0 16px rgba(92, 220, 255, .2), inset 0 1px rgba(255,255,255,.35);
}
.item-copy { flex: 1; min-width: 0; }
.item-heading { display: flex; align-items: center; gap: 8px; }
.item-heading h3 { flex: 1; margin: 0; color: #edf8ff; font-size: 15px; letter-spacing: .04em; }
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
.item-copy p { margin: 5px 0 0; color: #a9bfd1; font-size: 11px; line-height: 1.45; }
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  margin: 2px 0 4px;
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
  .inventory-list { gap: 6px; }
  .inventory-item { min-height: 70px; padding: 8px; }
  .item-icon { flex-basis: 42px; width: 42px; height: 42px; }
  .item-copy p { font-size: 10px; line-height: 1.3; }
  .empty-state { padding: 10px; }
}
</style>
