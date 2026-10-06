// 道具商店数据层：8 种消耗型道具 + 背包容量常数。
// Phase 0 内容数据化：字面量在 src/content/defaults/items.js（经 src/core/content.js 注入）。
// 商城买到的是卡，放进背包，自己选时间在背包里使用才真正生效（扩容卡），不是买了立刻生效。

import { bundle } from '../core/content.js'

export const ITEMS = bundle.items.map((item) => ({ ...item }))

export function getItem(id) {
  return ITEMS.find((i) => i.id === id)
}

// 背包默认格子数；用掉一张背包扩容卡 +5 格。
export const BAG_DEFAULT_CAPACITY = bundle.bag.defaultCapacity
export const BAG_SLOT_STEP = bundle.bag.slotStep
