// 章节与小关选择页流回归测试。
// 运行：node scripts/verify-navigation.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const app = source('../src/App.vue')
const menu = source('../src/components/MainMenu.vue')
const chapters = source('../src/components/ChapterSelect.vue')
const levels = source('../src/components/LevelSelect.vue')
const game = source('../src/components/GameView.vue')

// The main story/selection entry must go through the real ChapterSelect route.
assert.match(menu, /tap\('chapters'\)/, '主菜单挑战模式进入章节选择')
assert.doesNotMatch(menu, /tap\('levels'\)/, '主菜单不存在绕过章节页直达小关列表的入口')
assert.match(app, /<ChapterSelect[\s\S]*?v-else-if="route\.name === 'chapters'"[\s\S]*?@nav="go"/, 'App 挂载章节选择页并接通导航')
assert.match(app, /<LevelSelect[\s\S]*?v-else-if="route\.name === 'levels'"[\s\S]*?@nav="go"[\s\S]*?@play="startPrep"/, '章节卡片后的八关列表仍接入原有选关与准备流程')

// Only the implemented first chapter is represented; its art is authored inline.
assert.equal((chapters.match(/class="chapter-card"/g) || []).length, 1, '章节页只展示一个真实章节卡片')
assert.match(chapters, /第一章 · \{\{ CHAPTER\.name \}\}/, '卡片顶部显示第一章及项目章节名')
assert.match(chapters, /第一章 · \$\{CHAPTER\.name\}，选择关卡/, '章节卡片有可访问名称')
assert.match(chapters, /viewBox="0 0 360 220"/, '卡片包含原创内嵌城市插画，不依赖外部图片')
assert.match(chapters, /选择关卡/, '卡片底部提供选择关卡入口')
assert.match(chapters, /emit\('nav', 'levels'\)/, '点击章节卡片进入小关选择')
assert.match(chapters, /emit\('nav', 'menu'\)/, '章节页可返回主菜单')
assert.doesNotMatch(chapters, /第二章|第三章|v-for/, '不展示尚未实现或虚构的章节')

// Small levels keep sequential unlock/replay behavior and return to the chapter card.
assert.match(levels, /v-for="lv in LEVELS"/, '小关页仍按本章关卡数据逐关展示')
assert.match(levels, /return id <= store\.unlocked/, '沿用顺序解锁进度')
assert.match(levels, /if \(!unlocked\(lv\.id\)\) return/, '锁定关卡不能被选择')
assert.match(levels, /emit\('play', lv\.id\)/, '已解锁关卡进入所选关卡的既有准备页')
assert.match(levels, /emit\('nav', 'chapters'\)/, '小关页返回章节卡片页')

// The selected ID still reaches the existing game route; in-game resume/next/exit semantics stay intact.
assert.match(app, /function startPrep\(levelId\)[\s\S]*?route\.levelId = levelId[\s\S]*?route\.name = 'game'/, '所选小关 ID 进入既有 game/准备页')
assert.match(app, /:level-id="route\.levelId"[\s\S]*?@play="startPrep"/, '准备页继续使用原 GameView 流程')
assert.match(game, /function retry\(\)[\s\S]*?phase\.value = 'prep'/, '再来一局仍回到同一关准备状态')
assert.match(game, /function nextLevel\(\)[\s\S]*?emit\('play', nextId\)/, '通关后下一关仍沿用既有顺序推进语义')
assert.match(game, /function exitToLevels\(\)[\s\S]*?emit\('nav', 'levels'\)/, '局内选关/退出仍回到当前章节小关列表')

console.log('导航回归通过：主菜单 → 第一章卡片 → 小关选择 → 原准备/单局流程，返回、顺序解锁及已通关重玩入口均保持连通。')
