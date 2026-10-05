<template>
  <div class="screen game-menu-screen shop-screen">
    <div class="title-bar">
      <button class="icon-btn" @click="back"><BackIcon /></button>
      <h2>探险商城</h2>
      <div class="wallet-pill"><span class="coin-dot"></span>{{ store.coins }}</div>
    </div>

    <div class="mall-banner">
      <div class="mall-banner-copy">
        <span class="mall-banner-kicker">本期上架</span>
        <b>带上趁手装备，再出发</b>
      </div>
      <span class="mall-banner-deco" aria-hidden="true">🛍️</span>
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

    <div v-if="shopTab === 'items'" class="scroll shop-grid" role="tabpanel">
      <div v-for="item in ITEMS" :key="item.id" class="goods-card card">
        <span v-if="held(item.id) > 0" class="goods-owned-chip">持有 {{ held(item.id) }}</span>
        <span v-if="isHotItem(item.id)" class="goods-tag hot">人气</span>
        <div class="goods-art" :style="{ background: `linear-gradient(150deg, ${item.color}, #0a1830)` }">
          <ItemGlyph :id="item.id" :size="30" />
        </div>
        <div class="goods-body">
          <span class="goods-name">{{ item.name }}</span>
          <p class="goods-desc">{{ item.desc }}</p>
        </div>
        <button
          class="buy-btn"
          :class="{ afford: store.coins >= item.price }"
          :disabled="store.coins < item.price"
          @click="buy(item)"
        >
          <span class="price"><span class="coin-dot"></span>{{ item.price }}</span>
          <span class="buy-label">购买</span>
        </button>
      </div>
    </div>

    <div v-else class="scroll shop-grid materials-grid" role="tabpanel">
      <div class="mall-tip card">
        <span class="mall-tip-icon">▦</span>
        <div>
          <b>材质皮肤</b>
          <p class="text-soft">永久解锁、随时切换，装备后改变方块外观与落层音效，并针对天气提供加成。点击试试手感。</p>
        </div>
      </div>

      <div
        v-for="material in MATERIALS"
        :key="material.id"
        class="skin-card card"
        :class="{ equipped: isEquipped(material.id) }"
      >
        <div class="skin-preview">
          <CodexCanvas :draw="swatchOf(material.id)" :width="120" :height="92" :animated="false" />
          <span v-if="isEquipped(material.id)" class="skin-ribbon current">使用中</span>
          <span v-else-if="owned(material.id)" class="skin-ribbon owned">已解锁</span>
        </div>
        <div class="goods-body">
          <span class="goods-name">{{ material.name }}</span>
          <p class="goods-desc">{{ material.desc }}</p>
          <div class="skin-effect"><span class="effect-dot"></span>{{ material.effect }}</div>
        </div>
        <button
          v-if="owned(material.id) && !isEquipped(material.id)"
          class="buy-btn equip-btn afford"
          @click="equip(material)"
        >
          <span class="buy-label">装备</span>
        </button>
        <button
          v-else-if="!owned(material.id)"
          class="buy-btn"
          :class="{ afford: store.coins >= material.price }"
          :disabled="store.coins < material.price"
          @click="buyMaterial(material)"
        >
          <span class="price"><span class="coin-dot"></span>{{ material.price }}</span>
          <span class="buy-label">解锁</span>
        </button>
        <div v-else class="owned-footer">当前装备</div>
      </div>
    </div>

    <transition name="pop">
      <div v-if="toast" class="buy-toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
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

// 「人气」标：按价格从低到高取最便宜的两件消耗品当作入门爆款，
// 纯展示用的商城氛围标签，不影响购买逻辑或数值。
const hotItemIds = computed(() => {
  return [...ITEMS]
    .sort((a, b) => a.price - b.price)
    .slice(0, 2)
    .map((i) => i.id)
})
function isHotItem(id) {
  return hotItemIds.value.includes(id)
}

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
.wallet-pill {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  font-weight: 900;
  font-size: 14px;
  color: #3a2608;
  background: linear-gradient(135deg, #ffe49a, #ffc24d);
  box-shadow: 0 4px 12px rgba(255, 180, 60, 0.35), inset 0 1px rgba(255, 255, 255, 0.6);
}
.mall-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-radius: 16px;
  background: linear-gradient(120deg, #ff8a4c, #ffb23e 55%, #ffd36e);
  box-shadow: 0 10px 24px rgba(255, 138, 76, 0.3);
  flex-shrink: 0;
}
.mall-banner-copy { display: flex; flex-direction: column; gap: 3px; color: #3a2004; }
.mall-banner-kicker { font-size: 11px; font-weight: 800; letter-spacing: .08em; opacity: .75; }
.mall-banner-copy b { font-size: 17px; font-weight: 900; }
.mall-banner-deco { font-size: 30px; filter: drop-shadow(0 4px 6px rgba(0,0,0,.2)); }
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

/* 商城货架：2 列卡片网格，像真实的手游内购商店 */
.shop-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-content: start;
}
.mall-tip {
  grid-column: 1 / -1;
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 13px 14px;
  line-height: 1.45;
}
.mall-tip-icon {
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
.mall-tip b { display: block; margin-bottom: 2px; }
.mall-tip p { margin: 0; font-size: 12px; }

.goods-card,
.skin-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 12px 10px 10px;
  overflow: hidden;
}
.goods-owned-chip {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  color: var(--success);
  background: color-mix(in srgb, var(--success) 18%, rgba(5,13,29,.9));
}
.goods-tag {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
  padding: 3px 10px 3px 12px;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .04em;
  color: #3a2004;
  border-bottom-left-radius: 12px;
}
.goods-tag.hot { background: linear-gradient(120deg, #ffe49a, #ffb23e); }
.goods-art {
  width: 100%;
  aspect-ratio: 1.5 / 1;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: var(--shadow-sm), inset 0 1px rgba(255,255,255,.25);
  margin-bottom: 9px;
}
.goods-body { flex: 1; min-width: 0; margin-bottom: 10px; }
.goods-name {
  display: block;
  font-size: 14.5px;
  font-weight: 900;
  letter-spacing: .02em;
  margin-bottom: 3px;
}
.goods-desc {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-soft);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.buy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 9px 6px;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 900;
  color: #8a98ab;
  background: color-mix(in srgb, var(--panel-border) 60%, transparent);
}
.buy-btn.afford {
  color: #3a2608;
  background: linear-gradient(135deg, #ffe49a, #ffc24d);
  box-shadow: 0 6px 14px rgba(255, 180, 60, 0.32);
}
.buy-btn .price { display: inline-flex; align-items: center; gap: 4px; }
.equip-btn.afford { background: linear-gradient(135deg, var(--primary-2), var(--primary)); color: #fff; box-shadow: 0 6px 14px rgba(106, 91, 255, 0.3); }

/* 材质皮肤卡：大预览图 + 右上角使用状态飘带 */
.skin-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 1.3 / 1;
  border-radius: 12px;
  overflow: hidden;
  background: #0a1830;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 9px;
  box-shadow: inset 0 1px rgba(255,255,255,.25), var(--shadow-sm);
}
.skin-ribbon {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
}
.skin-ribbon.current { color: #fff; background: var(--primary); }
.skin-ribbon.owned { color: var(--success); background: color-mix(in srgb, var(--success) 20%, rgba(5,13,29,.9)); }
.skin-effect {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 6px;
  padding: 6px 8px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  color: var(--text);
  font-size: 11px;
  line-height: 1.4;
  font-weight: 700;
}
.effect-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  margin-top: 4px;
  border-radius: 50%;
  background: var(--primary);
}
.owned-footer {
  text-align: center;
  padding: 9px 6px;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 800;
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
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
.shop-screen::after { content:'SUPPLY MALL / AUTHORIZED LOADOUT'; position:absolute; top:88px; right:18px; color:#ffd36b55; font:900 9px/1 'Trebuchet MS'; letter-spacing:.18em; writing-mode:vertical-rl; pointer-events:none; }
.shop-tabs { margin-top:4px; background:#061328; border:1px solid #68ddff55; clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,0 100%); }
.shop-tab { letter-spacing:.08em; }
.shop-grid { gap:12px; padding-top:10px; padding-bottom: 6px; }
.goods-card,.skin-card { background:linear-gradient(160deg,rgba(9,37,64,.96),rgba(5,13,29,.96)); border:1px solid #69ddff44; box-shadow:0 12px 26px #0008,inset 0 1px #fff2; border-radius: 16px; }
.goods-name,.mall-tip b { letter-spacing:.04em; }
.buy-toast { border-radius:2px; border:1px solid #ffd36b; background:#07182deF; box-shadow:0 0 20px #55ddff33; }
</style>
