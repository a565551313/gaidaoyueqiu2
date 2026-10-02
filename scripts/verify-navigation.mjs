// 七章章节与小关选择页流回归测试。
// 运行：node scripts/verify-navigation.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CHAPTERS, LEVELS, getChapterLevels } from '../src/data/levels.js'

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const app = source('../src/App.vue')
const menu = source('../src/components/MainMenu.vue')
const chapters = source('../src/components/ChapterSelect.vue')
const levels = source('../src/components/LevelSelect.vue')
const game = source('../src/components/GameView.vue')

assert.equal(CHAPTERS.length, 7)
assert.equal(LEVELS.length, 56)
assert.ok(CHAPTERS.every((chapter) => getChapterLevels(chapter.id).length === 8))
assert.ok(CHAPTERS.every((chapter) => chapter.firstLevelId <= chapter.lastLevelId))

// The main story entry enters the chapter gallery, never bypasses it.
assert.match(menu, /tap\('chapters'\)/, '主菜单挑战模式进入章节选择')
assert.doesNotMatch(menu, /tap\('levels'\)/, '主菜单不存在绕过章节页直达小关列表的入口')
assert.match(app, /<ChapterSelect[\s\S]*?v-else-if="route\.name === 'chapters'"[\s\S]*?@nav="go"[\s\S]*?@select-chapter="selectChapter"/, '章节页通过真实选择事件进入目标小关列表')
assert.match(app, /<LevelSelect[\s\S]*?v-else-if="route\.name === 'levels'"[\s\S]*?:chapter-id="route\.chapterId"[\s\S]*?@nav="go"[\s\S]*?@play="startPrep"/, '小关页接收所选章节并沿用原准备流程')

// All seven chapter cards have distinct identities/art and are gated by first-level unlock.
assert.match(chapters, /v-for="chapter in CHAPTERS"/, '章节页动态呈现完整章节目录')
assert.match(chapters, /:disabled="!chapterUnlocked\(chapter\)"/, '尚未解锁的章节卡不能进入')
assert.match(chapters, /chapter\.firstLevelId <= store\.unlocked/, '章节解锁取决于对应首关的全局顺序解锁')
assert.match(chapters, /chapter\.art\.sky\[0\]/, '每章使用独立城市视觉配色')
assert.match(chapters, /chapter\.theme === 'lightning'/, '卡片按天气主题绘制不同的城市天气视觉')
assert.match(chapters, /emit\('select-chapter', chapter\.id\)/, '打开章节会把章节 ID 交给路由')
assert.match(chapters, /emit\('nav', 'menu'\)/, '章节页可返回主菜单')

// Each chapter reuses eight sequential global IDs, displays level-specific hints, and preserves replay.
assert.match(levels, /defineProps\(\{ chapterId:/, '小关页接收 chapterId')
assert.match(levels, /getChapterLevels\(chapter\.value\.id\)/, '小关页只列出当前章节八关')
assert.match(levels, /return Number\(id\) <= store\.unlocked/, '沿用全局顺序解锁，跨章连续')
assert.match(levels, /if \(!unlocked\(lv\.id\)\) return/, '锁定小关不能被选择')
assert.match(levels, /emit\('play', lv\.id\)/, '已解锁和已通关小关均进入原准备流程')
assert.match(levels, /emit\('nav', 'chapters'\)/, '小关页可返回章节画廊')
assert.match(levels, /lv\.weatherHint \|\| '晴天 · 静塔 · 固定速度'/, '每关显式展示其天气规则或第一章晴天静塔提示')

// Selected chapter follows the selected global level, including next-level transition across boundaries.
assert.match(app, /const route = reactive\(\{ name: 'menu', levelId: 1, chapterId: CHAPTER\.id \}\)/, '默认旧存档入口仍回到第一章')
assert.match(app, /function selectChapter\(chapterId\)[\s\S]*?route\.chapterId = chapterId[\s\S]*?route\.name = 'levels'/, '选中章节后打开对应小关列表')
assert.match(app, /function startPrep\(levelId\)[\s\S]*?route\.levelId = levelId[\s\S]*?route\.chapterId = getChapterForLevel\(levelId\)\.id[\s\S]*?route\.name = 'game'/, '跨章下一关会同步更新 route.chapterId')
assert.match(app, /:level-id="route\.levelId"[\s\S]*?@play="startPrep"/, '准备页沿用原 GameView 流程')
assert.match(game, /function retry\(\)[\s\S]*?phase\.value = 'prep'/, '再来一局仍回到同一关准备状态')
assert.match(game, /function nextLevel\(\)[\s\S]*?emit\('play', nextId\)/, '通关后下一关沿用全局 ID 顺序推进')
assert.match(game, /function exitToLevels\(\)[\s\S]*?emit\('nav', 'levels'\)/, '局内退出仍返回当前章节小关列表')

console.log('导航回归通过：主菜单 → 七章卡片 → 目标章节八关 → 原准备/单局流程；章节和小关顺序解锁、重玩、跨章下一关及返回路径均接通。')
