// 内容数据 Provider（Phase 0 内容数据化，docs/ADMIN_DESIGN.md §12.1）。
//
// 职责：给 src/data/* 一个**同步**的数据源接缝，替代原先写死在各文件里的字面量。
//
// 取数优先级（与 ADMIN_DESIGN 的「远端 → 本地缓存包 → 打包默认包」一致）：
//   1. localStorage 里缓存的内容包（gaidaoyueqiu2:content:v1）—— Phase 2 的远端
//      握手写入这里，本阶段尚无写入方，读到的永远是 null；
//   2. 打包内置默认包（src/content/defaults/*，纯数据文件）。
//
// 为什么是同步读取而不是 async init：store.js 在模块加载时就执行
// reactive(Storage.load())，而 Storage 又要读 LEVELS —— 数据必须在任何
// 模块求值时已经就位。localStorage 恰好是同步 API，所以这个接缝不需要
// 异步初始化，也不会改变任何模块的加载顺序。
//
// 约束：src/content/defaults/* 不许出现函数或派生逻辑（纯字面量）；
// 结构等价性由 scripts/verify-content.mjs 的快照基线锁定。

import { chapters as defaultChapters, levels as defaultLevels } from '../content/defaults/levels.js'
import { materials as defaultMaterials } from '../content/defaults/materials.js'
import { blockTypes as defaultBlockTypes } from '../content/defaults/blockTypes.js'
import { statSpecs as defaultStatSpecs } from '../content/defaults/blockStats.js'
import { items as defaultItems, bag as defaultBag } from '../content/defaults/items.js'
import { skills as defaultSkills } from '../content/defaults/skills.js'
import { pets as defaultPets, starCosts as defaultPetStarCosts } from '../content/defaults/pets.js'
import {
  species as defaultAntSpecies, personalities as defaultAntPersonalities,
  prototype as defaultAntPrototype, durabilityConfig as defaultDurabilityConfig,
  nonAntDurabilityScale as defaultNonAntScale, floorWidthMin as defaultFloorWidthMin,
  waveTiers as defaultWaveTiers
} from '../content/defaults/ants.js'

export const CONTENT_BUNDLE_KEY = 'gaidaoyueqiu2:content:v1'
export const CONTENT_BUNDLE_VERSION = 1

// 打包默认包（不可变）。远端包与此同构，字段见 ADMIN_DESIGN §16.2。
export const DEFAULT_BUNDLE = Object.freeze({
  version: CONTENT_BUNDLE_VERSION,
  chapters: defaultChapters,
  levels: defaultLevels,
  materials: defaultMaterials,
  blockTypes: defaultBlockTypes,
  statSpecs: defaultStatSpecs,
  items: defaultItems,
  bag: defaultBag,
  skills: defaultSkills,
  pets: defaultPets,
  petStarCosts: defaultPetStarCosts,
  ants: Object.freeze({
    species: defaultAntSpecies,
    personalities: defaultAntPersonalities,
    prototype: defaultAntPrototype,
    durabilityConfig: defaultDurabilityConfig,
    nonAntDurabilityScale: defaultNonAntScale,
    floorWidthMin: defaultFloorWidthMin,
    waveTiers: defaultWaveTiers
  })
})

// 最小形状校验：远端/缓存包必须至少长得像一个内容包才允许注入。
// Phase 2 接入内容 CI 后这里会换成强 schema 校验（56 关参数、天气字段随 kind 匹配等）。
function isValidBundle(value) {
  if (!value || typeof value !== 'object') return false
  if (!Array.isArray(value.chapters) || value.chapters.length === 0) return false
  if (!Array.isArray(value.levels) || value.levels.length === 0) return false
  if (!Array.isArray(value.materials) || value.materials.length === 0) return false
  return true
}

function pickBundle() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CONTENT_BUNDLE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (isValidBundle(parsed)) return parsed
      }
    }
  } catch (e) {
    // 读取/解析失败一律回落默认包，内容层永远不抛错
  }
  return DEFAULT_BUNDLE
}

export const bundle = pickBundle()

export function getContentBundle() {
  return bundle
}

// Phase 2 在这里扩展远端握手（不改变本文件的同步取数语义）：
//   fetch('/api/v1/content?cur=<版本>') → isValidBundle → localStorage 写缓存 → reload 注入
