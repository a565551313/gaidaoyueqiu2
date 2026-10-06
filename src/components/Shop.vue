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

    <div v-if="shopTab === 'items'" class="scroll shop-grid">
      <div v-for="item in ITEMS" :key="item.id" class="goods-card">
        <span v-if="held(item.id) > 0" class="goods-owned-chip">持有 {{ held(item.id) }}</span>
        <span v-if="isHotItem(item.id)" class="goods-tag hot">人气</span>
        <div class="goods-art" :style="{ background: `linear-gradient(150deg, ${item.color}, #0a1830)` }">
          <ItemGlyph :id="item.id" :size="30" />
        </div>
        <span class="goods-name">{{ item.name }}</span>
        <p class="goods-desc">{{ item.desc }}</p>
        <button
          type="button"
          class="buy-btn"
          :class="{ afford: store.coins >= item.price }"
          :disabled="store.coins < item.price"
          @click="buy(item)"
        >
          <span class="coin-dot"></span>{{ item.price }} 购买
        </button>
      </div>
    </div>

    <div v-else class="scroll shop-grid">
      <div class="mall-tip">
        <span class="mall-tip-icon">▦</span>
        <div>
          <b>材质皮肤</b>
          <p class="text-soft">永久解锁、随时切换，装备后改变方块外观与落层音效，并针对天气提供加成。点击试试手感。</p>
        </div>
      </div>

      <div
        v-for="material in MATERIALS"
        :key="material.id"
        class="skin-card"
        :class="{ equipped: isEquipped(material.id) }"
      >
        <div class="skin-preview">
          <CodexCanvas :draw="swatchOf(material.id)" :width="112" :height="86" :animated="false" />
          <span v-if="isEquipped(material.id)" class="skin-ribbon current">使用中</span>
          <span v-else-if="owned(material.id)" class="skin-ribbon owned">已解锁</span>
        </div>
        <span class="goods-name">{{ material.name }}</span>
        <p class="goods-desc">{{ material.desc }}</p>
        <div class="skin-effect"><span class="effect-dot"></span>{{ material.effect }}</div>
        <button
          v-if="owned(material.id) && !isEquipped(material.id)"
          type="button"
          class="buy-btn equip-btn afford"
          @click="equip(material)"
        >
          装备
        </button>
        <button
          v-else-if="!owned(material.id)"
          type="button"
          class="buy-btn"
          :class="{ afford: store.coins >= material.price }"
          :disabled="store.coins < material.price"
          @click="buyMaterial(material)"
        >
          <span class="coin-dot"></span>{{ material.price }} 解锁
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
    showToast(item.id === 'bagExpand' ? '已购买背包扩容卡，去背包里使用它' : `已购买 ${item.name}`)
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
  background: radial-gradient(circle at 12% 10%, rgba(255, 171, 74, .13), transparent 28%), linear-gradient(180deg, #071a30, #030711 76%);
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
  box-shadow: 0 4px 12px rgba(255, 180, 60, .35);
}
.mall-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-radius: 16px;
  background: linear-gradient(120deg, #ff8a4c, #ffb23e 55%, #ffd36e);
  box-shadow: 0 10px 24px rgba(255, 138, 76, .3);
  flex-shrink: 0;
}
.mall-banner-copy { display: flex; flex-direction: column; gap: 3px; color: #3a2004; }
.mall-banner-kicker { font-size: 11px; font-weight: 800; letter-spacing: .08em; opacity: .75; }
.mall-banner-copy b { font-size: 17px; font-weight: 900; }
.mall-banner-deco { font-size: 30px; }
.shop-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 4px;
  border-radius: 15px;
  background: #061328;
  border: 1px solid rgba(104, 221, 255, .33);
  flex-shrink: 0;
}
.shop-tab {
  padding: 10px 8px;
  border-radius: 11px;
  color: #91acc6;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: .06em;
}
.shop-tab.active {
  color: #fff;
  background: linear-gradient(135deg, #2568db, #52d8ff);
  box-shadow: 0 4px 12px rgba(82, 216, 255, .28);
}

/* 商城货架：2 列卡片网格。每张卡自己就是一个普通的块级容器
   （没有套 flex / aspect-ratio / 颜色函数），避免在不同手机浏览器上
   出现尺寸计算差异，保证图标、文字、按钮一定都在、一定都显示得出来。 */
.shop-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-content: start;
  padding-top: 10px;
  padding-bottom: 6px;
}
.mall-tip {
  grid-column: 1 / -1;
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 13px 14px;
  line-height: 1.45;
  border-radius: 14px;
  background: linear-gradient(145deg, rgba(14, 36, 68, .94), rgba(5, 14, 31, .96));
  border: 1px solid rgba(99, 210, 255, .24);
}
.mall-tip-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(82, 216, 255, .16);
  color: #52d8ff;
  font-size: 20px;
  font-weight: 900;
}
.mall-tip b { display: block; margin-bottom: 2px; color: #f5fbff; }
.mall-tip p { margin: 0; font-size: 12px; color: #91acc6; }

.goods-card,
.skin-card {
  position: relative;
  padding: 12px 10px 10px;
  border-radius: 16px;
  background: linear-gradient(160deg, #092540f5, #050d1df5);
  border: 1px solid rgba(105, 221, 255, .3);
  box-shadow: 0 10px 22px rgba(0, 0, 0, .35);
}
.skin-card.equipped {
  border-color: rgba(82, 216, 255, .7);
  box-shadow: 0 10px 22px rgba(0, 0, 0, .35), 0 0 0 1px rgba(82, 216, 255, .3) inset;
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
  color: #5fe0ac;
  background: rgba(14, 50, 36, .9);
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
  height: 78px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  margin: 0 0 9px;
}
.goods-name {
  display: block;
  font-size: 14.5px;
  font-weight: 900;
  letter-spacing: .03em;
  color: #ecf7ff;
  margin-bottom: 3px;
}
.goods-desc {
  margin: 0 0 10px;
  font-size: 11px;
  line-height: 1.45;
  color: #91acc6;
}
.buy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  padding: 9px 6px;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 900;
  color: #8a98ab;
  background: rgba(99, 210, 255, .12);
  border: none;
}
.buy-btn.afford {
  color: #3a2608;
  background: linear-gradient(135deg, #ffe49a, #ffc24d);
  box-shadow: 0 6px 14px rgba(255, 180, 60, .32);
}
.equip-btn.afford { background: linear-gradient(135deg, #2568db, #52d8ff); color: #fff; box-shadow: 0 6px 14px rgba(82, 216, 255, .3); }

/* 材质皮肤卡：固定尺寸预览框，和 CodexCanvas 的像素大小完全对齐，
   不靠 aspect-ratio 或拉伸画布，保证预览图不会裁切或留白出错。 */
.skin-preview {
  position: relative;
  width: 112px;
  height: 86px;
  margin: 0 auto 9px;
  border-radius: 12px;
  overflow: hidden;
  background: #0a1830;
  display: flex;
  align-items: center;
  justify-content: center;
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
.skin-ribbon.current { color: #fff; background: #2568db; }
.skin-ribbon.owned { color: #5fe0ac; background: rgba(14, 50, 36, .9); }
.skin-effect {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0 0 10px;
  padding: 6px 8px;
  border-radius: 9px;
  background: rgba(82, 216, 255, .08);
  color: #ecf7ff;
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
  background: #52d8ff;
}
.owned-footer {
  text-align: center;
  padding: 9px 6px;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 800;
  color: #52d8ff;
  background: rgba(82, 216, 255, .1);
}

.buy-toast {
  position: absolute;
  bottom: calc(var(--safe-bottom) + 24px);
  left: 50%;
  transform: translateX(-50%);
  background: #ecf7ff;
  color: #0b1830;
  padding: 11px 22px;
  border-radius: 999px;
  font-weight: 700;
  box-shadow: 0 8px 20px rgba(0, 0, 0, .4);
  z-index: 30;
  white-space: nowrap;
}
</style>
