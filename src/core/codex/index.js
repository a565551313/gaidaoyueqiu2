// 图鉴总入口。
//
// 页面只跟这个文件打交道，不认识方块/蚂蚁/宠物中的任何一个。
// 加一组新的（道具、关卡、天气…）＝ 写一个适配器 + 在下面登记一行。
import { blockEntries } from './blocks.js'
import { enemyEntries } from './enemies.js'
import { companionEntries } from './companions.js'
import { sortEntries, unifyStatAxes, barRatios } from './contract.js'

export { CODEX_STATES, unifyStatAxes, barRatios, sortEntries } from './contract.js'

export const CODEX_GROUPS = [
  { id: 'blocks', label: '方块', kicker: 'STRUCTURE', adapter: blockEntries, countLabel: '已解锁' },
  { id: 'enemies', label: '敌人', kicker: 'HOSTILES', adapter: enemyEntries, countLabel: '已遭遇' },
  { id: 'companions', label: '伙伴', kicker: 'COMPANIONS', adapter: companionEntries, countLabel: '已解锁' }
]

export function codexGroup(id) {
  return CODEX_GROUPS.find((g) => g.id === id) || CODEX_GROUPS[0]
}

// 某一组的全部条目，附带统一的属性轴和条长换算函数。
export function groupData(groupId, store) {
  const group = codexGroup(groupId)
  const entries = sortEntries(group.adapter(store))
  const axes = unifyStatAxes(entries)
  return {
    group,
    entries,
    axes,
    ratioOf: barRatios(entries, axes),
    unlocked: entries.filter((e) => e.state !== 'locked').length,
    total: entries.length
  }
}

// 全部组的解锁进度，给主菜单入口上的角标用。
export function codexProgress(store) {
  let unlocked = 0
  let total = 0
  for (const group of CODEX_GROUPS) {
    const entries = group.adapter(store)
    total += entries.length
    unlocked += entries.filter((e) => e.state !== 'locked').length
  }
  return { unlocked, total }
}
