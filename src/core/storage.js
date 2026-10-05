// 存档层：默认 localStorage，抽象为 load / save / clear，方便替换为服务端。
// 所有读取都做字段合并与容错，旧存档缺字段时自动补全。

import { LEVELS } from '../data/levels.js'
import { ITEMS } from '../data/items.js'
import { SKILLS } from '../data/skills.js'
import { MATERIALS } from '../data/materials.js'
import { PETS, makeDefaultPets, petLevelCap, petExpToNext } from '../data/pets.js'

const STORAGE_KEY = 'gaidaoyueqiu2:save:v1'

function defaultSave() {
  const items = {}
  ITEMS.forEach((i) => (items[i.id] = 0))
  const skills = {}
  SKILLS.forEach((s) => (skills[s.id] = 0))
  const stars = {}
  LEVELS.forEach((l) => (stars[l.id] = 0))
  // 每关历史最高得分（本地排行榜数据源）
  const bestScores = {}
  LEVELS.forEach((l) => (bestScores[l.id] = 0))
  const materials = {}
  MATERIALS.forEach((material) => (materials[material.id] = !!material.ownedByDefault))
  return {
    coins: 0,
    stars, // 每关最高星级
    bestScores, // 每关历史最高得分
    unlocked: 1, // 已解锁到第几关
    skills, // 技能等级
    items, // 道具库存
    materials, // 已永久解锁的建筑材质
    equippedMaterial: 'soil', // 当前装备的建筑材质
    pets: makeDefaultPets(), // 宠物拥有状态、等级、经验与星阶
    // 图鉴的「遭遇过」记录。方块和宠物有「拥有」的概念，敌人没有——
    // 你不会买一只蚂蚁，只会在关卡里碰上它。按组分开存，以后加新组不用改结构。
    seen: { enemies: {} },
    activePetId: 'moonRabbit', // 当前携带宠物；空字符串表示未携带
    settings: {
      musicOn: true, // 音乐开关，默认开启
      sfxOn: true, // 音效开关，默认开启（与音乐各自独立）
      musicVolume: 0.7,
      effectsVolume: 0.7
      // 主题说明：游戏整体采用固定深色视觉（见 App.vue），
      // 不再保留永不生效的 theme 设置字段。
    }
  }
}

// 深合并：以 def 为骨架，用 data 覆盖存在的字段，缺失字段用默认值
function mergeDeep(def, data) {
  if (data == null || typeof data !== 'object') return def
  const out = Array.isArray(def) ? def.slice() : { ...def }
  for (const key of Object.keys(def)) {
    const dv = def[key]
    const sv = data[key]
    if (dv && typeof dv === 'object' && !Array.isArray(dv)) {
      out[key] = mergeDeep(dv, sv)
    } else if (sv !== undefined && sv !== null) {
      out[key] = sv
    }
  }
  return out
}

// 宠物字段除“补默认值”外还需要范围校验。旧存档会按已有总星数自动解锁伙伴，
// 非法的携带 ID、等级、经验与星阶会被收敛到安全值。
function normalizePets(save) {
  const totalStars = LEVELS.reduce((sum, level) => sum + Math.max(0, Number(save.stars[level.id]) || 0), 0)
  for (const pet of PETS) {
    const state = save.pets[pet.id]
    state.owned = !!state.owned || totalStars >= pet.unlockStars
    state.star = Math.max(1, Math.min(5, Math.floor(Number(state.star) || 1)))
    state.level = Math.max(1, Math.min(petLevelCap(state.star), Math.floor(Number(state.level) || 1)))
    const expMax = state.level >= petLevelCap(state.star) ? 0 : petExpToNext(state.level) - 1
    state.exp = Math.max(0, Math.min(expMax, Math.floor(Number(state.exp) || 0)))
  }
  if (save.activePetId) {
    const active = PETS.find((pet) => pet.id === save.activePetId)
    if (!active || !save.pets[active.id]?.owned) save.activePetId = ''
  }
  return save
}

// 抽象后端接口（当前为 localStorage 实现）
const backend = {
  read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch (e) {
      console.warn('读取存档失败', e)
      return null
    }
  },
  write(obj) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    } catch (e) {
      console.warn('写入存档失败', e)
    }
  },
  remove() {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      console.warn('清空存档失败', e)
    }
  }
}

export const Storage = {
  load() {
    const raw = backend.read()
    if (raw && raw.settings && raw.settings.volume !== undefined) {
      // 旧版本的总音量作为两路音量的初始值，保留原有听感。
      if (raw.settings.musicVolume === undefined) raw.settings.musicVolume = raw.settings.volume
      if (raw.settings.effectsVolume === undefined) raw.settings.effectsVolume = raw.settings.volume
    }
    if (raw && raw.settings && raw.settings.sound !== undefined) {
      // 旧版本只有一个合并开关：迁移时音乐、音效都沿用原来的开关状态。
      if (raw.settings.musicOn === undefined) raw.settings.musicOn = raw.settings.sound
      if (raw.settings.sfxOn === undefined) raw.settings.sfxOn = raw.settings.sound
    }
    return normalizePets(mergeDeep(defaultSave(), raw))
  },
  save(state) {
    // 只持久化需要的字段，做一次容错合并
    const clean = normalizePets(mergeDeep(defaultSave(), state))
    backend.write(clean)
  },
  clear() {
    backend.remove()
  },
  default: defaultSave
}
