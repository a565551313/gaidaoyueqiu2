// 全局响应式存档状态。所有金币/星级/技能/道具/设置的读写都经过这里，
// 并在变更后写回 Storage，保证刷新后不丢失、也不会重复领奖。

import { reactive, watch } from 'vue'
import { Storage } from './storage.js'
import { LEVELS } from '../data/levels.js'
import { skillUpgradeCost, getSkill } from '../data/skills.js'
import { getItem } from '../data/items.js'
import { getMaterial } from '../data/materials.js'
import { Audio } from './audio.js'

const state = reactive(Storage.load())

// 任何变更后持久化
watch(
  state,
  () => {
    Storage.save(state)
  },
  { deep: true }
)

export function useStore() {
  return state
}

export const actions = {
  addCoins(n) {
    state.coins = Math.max(0, Math.floor(state.coins + n))
  },
  spendCoins(n) {
    if (state.coins < n) return false
    state.coins -= n
    return true
  },
  // 购买道具
  buyItem(id) {
    const item = getItem(id)
    if (!item) return false
    if (state.coins < item.price) return false
    state.coins -= item.price
    state.items[id] = (state.items[id] || 0) + 1
    Audio.buy()
    return true
  },
  // 购买建筑材质：材质是永久解锁，不会像消耗型道具一样减少库存。
  buyMaterial(id) {
    const material = getMaterial(id)
    if (!material || material.id === 'soil') return false
    if (state.materials[material.id]) return false
    if (state.coins < material.price) return false
    state.coins -= material.price
    state.materials[material.id] = true
    Audio.buy()
    return true
  },
  // 装备已解锁的建筑材质
  equipMaterial(id) {
    const material = getMaterial(id)
    if (!material || !state.materials[material.id]) return false
    state.equippedMaterial = material.id
    // 装备时直接试听该材质的落地声，方便对比各材质音色差异
    Audio.setMaterial(material.id)
    Audio.drop()
    return true
  },
  // 升级技能
  upgradeSkill(id) {
    const skill = getSkill(id)
    if (!skill) return false
    const cur = state.skills[id] || 0
    if (cur >= skill.max) return false
    const cost = skillUpgradeCost(cur + 1)
    if (state.coins < cost) return false
    state.coins -= cost
    state.skills[id] = cur + 1
    Audio.buy()
    return true
  },
  // 结算：记录星级、解锁下一关、发放金币
  settle(result) {
    // 金币照常发放（失败也发已赚金币）
    actions.addCoins(result.coins)
    if (result.cleared) {
      const lid = result.level.id
      // 历史星级只增不减
      if (result.stars > (state.stars[lid] || 0)) {
        state.stars[lid] = result.stars
      }
      // 解锁下一关
      const next = lid + 1
      if (next <= LEVELS.length && state.unlocked < next) {
        state.unlocked = next
      }
    }
  },
  totalStars() {
    return LEVELS.reduce((s, l) => s + (state.stars[l.id] || 0), 0)
  },
  setSound(v) {
    state.settings.sound = v
    Audio.setEnabled(v)
  },
  setTheme(t) {
    state.settings.theme = t
  }
}
