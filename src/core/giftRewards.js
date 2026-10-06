// 礼包码奖励契约（supabase/migrations/0005_ops_center.sql 同步校验）：
//   { "coins": 100, "items": { "revive": 1 } }
// 目前只支持存档里已有的金币与消耗道具，不增加玩法逻辑。

export const GIFT_ITEM_IDS = Object.freeze([
  'revive', 'auto', 'double', 'slow', 'widen', 'shield', 'comboGuard', 'bagExpand'
])

export function normalizeGiftReward(input) {
  let reward = input
  if (typeof input === 'string') {
    try {
      reward = JSON.parse(input)
    } catch (e) {
      throw new Error('奖励必须是合法 JSON')
    }
  }
  if (!reward || typeof reward !== 'object' || Array.isArray(reward)) {
    throw new Error('奖励必须是 JSON 对象')
  }

  const keys = Object.keys(reward)
  if (!keys.length || keys.some((key) => !['coins', 'items'].includes(key))) {
    throw new Error('奖励仅支持 coins 和 items 字段')
  }

  const normalized = {}
  if (Object.hasOwn(reward, 'coins')) {
    const coins = reward.coins
    if (typeof coins !== 'number' || !Number.isInteger(coins) || coins < 1 || coins > 1000000) {
      throw new Error('coins 必须为 1 到 1,000,000 的整数')
    }
    normalized.coins = coins
  }

  if (Object.hasOwn(reward, 'items')) {
    if (!reward.items || typeof reward.items !== 'object' || Array.isArray(reward.items)) {
      throw new Error('items 必须是道具 ID 到数量的对象')
    }
    const items = {}
    for (const [id, value] of Object.entries(reward.items)) {
      const count = value
      if (!GIFT_ITEM_IDS.includes(id)) throw new Error(`不支持的道具：${id}`)
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 999) {
        throw new Error(`${id} 数量必须为 1 到 999 的整数`)
      }
      items[id] = count
    }
    if (!Object.keys(items).length) throw new Error('items 至少要包含一种道具')
    normalized.items = items
  }

  return normalized
}
