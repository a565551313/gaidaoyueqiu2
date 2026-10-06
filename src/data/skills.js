// 技能学院数据层：8 项永久技能。
// 升级到新等级所需金币 = 100 × 新等级
//
// Phase 0 内容数据化：id/名称/上限/说明/配色在 src/content/defaults/skills.js；
// effect 是**文案函数**（消费当前等级生成展示串），属于逻辑，留在本文件按 id 挂接。
// 内容包里新增技能时，没有对应文案函数的条目回退到通用文案，不会崩。

import { bundle } from '../core/content.js'

// 各技能的效果展示文案（等级 → 展示串）。
const EFFECT_TEXT = {
  foundation: (lv) => `开局宽度 +${lv}%`,
  goldenBell: (lv) => `免切概率 ${lv}%`,
  unity: (lv) => `直接完美概率 ${lv}%`,
  pursuit: (lv) => `追击概率 ${lv}%`,
  stillness: (lv) => `移动速度 -${lv}% · 晃动 -${Math.min(40, lv * 8)}%`,
  midas: (lv) => `金币获取 +${lv * 2}%`,
  insight: (lv) => `完美窗口 +${lv}%`,
  preemptive: (lv) => `开局充能 ${Math.floor(lv * 5)}% 上限`
}
const genericEffect = (skill) => (lv) => `${skill.name} Lv.${lv}`

export const SKILLS = bundle.skills.map((skill) => ({
  ...skill,
  effect: EFFECT_TEXT[skill.id] || genericEffect(skill)
}))

export function skillUpgradeCost(newLevel) {
  return 100 * newLevel
}

export function getSkill(id) {
  return SKILLS.find((s) => s.id === id)
}
