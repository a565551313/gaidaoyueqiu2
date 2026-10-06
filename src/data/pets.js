// 宠物数据层：只保存不会随存档变化的定义。
// 玩家成长状态（等级、经验、星阶、是否拥有）由 storage/store 管理。
//
// Phase 0 内容数据化：五只宠物档案与升星费用表在 src/content/defaults/pets.js
//（经 src/core/content.js 注入）；成长公式与默认存档结构留在本文件。

import { bundle } from '../core/content.js'

export const PETS = bundle.pets.map((pet) => ({ ...pet }))

export const PET_MAX_STAR = 5
export const PET_MAX_LEVEL = 50

// key 为升星后的新星级。
export const PET_STAR_COSTS = { ...bundle.petStarCosts }

export function getPet(id) {
  return PETS.find((pet) => pet.id === id) || null
}

export function petLevelCap(star) {
  return Math.max(10, Math.min(PET_MAX_LEVEL, (Number(star) || 1) * 10))
}

export function petExpToNext(level) {
  return 50 + Math.max(1, Number(level) || 1) * 10
}

export function petStarCost(nextStar) {
  return PET_STAR_COSTS[nextStar] || 0
}

export function makeDefaultPets() {
  const out = {}
  for (const pet of PETS) {
    out[pet.id] = {
      owned: pet.unlockStars === 0,
      level: 1,
      exp: 0,
      star: 1
    }
  }
  return out
}
