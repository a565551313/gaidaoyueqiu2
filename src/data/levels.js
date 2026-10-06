// 关卡数据层：结构与查找函数。
//
// Phase 0 内容数据化：56 关与 7 章节的字面量已抽到 src/content/defaults/levels.js
//（展开后的最终结构，含各章 stages 的天气参数），经 src/core/content.js 注入。
// 本文件保留：冻结语义（章节与 stages 深冻结）、CHAPTER 快照、查找函数与 TOTAL_STARS。
// 旧存档兼容承诺不变：全局连续关卡 ID（stars/bestScores 的键），新增章节继续递增，禁止重排。
//
// 第一章：澄河都会圈。原有八关 ID、关卡值与旧存档映射保持不变。

import { bundle } from '../core/content.js'

export const CHAPTERS = Object.freeze(bundle.chapters.map((chapter) => Object.freeze({
  ...chapter,
  stages: Object.freeze((chapter.stages || []).map((stage) => Object.freeze({ ...stage })))
})))

const firstChapter = CHAPTERS[0]
// 第一章的常量快照（旧代码与多个组件直接引用）
export const CHAPTER = Object.freeze({
  id: firstChapter.id,
  number: firstChapter.number,
  name: firstChapter.name
})

export const LEVELS = bundle.levels.map((level) => ({ ...level }))

export function getLevel(id) {
  return LEVELS.find((level) => level.id === Number(id)) || LEVELS[0]
}

export function getChapter(chapterId) {
  return CHAPTERS.find((chapter) => chapter.id === chapterId) || CHAPTERS[0]
}

export function getChapterForLevel(levelOrId) {
  const level = typeof levelOrId === 'object' ? levelOrId : getLevel(levelOrId)
  return getChapter(level.chapterId)
}

export function getChapterLevels(chapterId) {
  return LEVELS.filter((level) => level.chapterId === chapterId)
}

export const TOTAL_STARS = LEVELS.length * 3
