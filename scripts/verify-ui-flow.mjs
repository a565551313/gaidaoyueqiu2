// 真实点击流程回归。
//
// 为什么需要这一套：前面所有的 verify 脚本都是**读源码做正则断言**，
// 它们能证明「代码里写了这一行」，但证明不了「点下去会发生什么」。
//
// 实际漏掉的 bug：图鉴的返回键 emit 了对象而不是字符串。
// App.vue 的 go(name) 是 `route.name = name`，route.name 变成对象后
// 所有 v-else-if 分支都不匹配 —— 页面一个组件都不渲染，只剩 body 的
// 蓝色渐变。这个错误不抛异常、不打警告、构建照过、源码正则也看不出问题。
//
// 这里用 jsdom 真的挂载整个 App，真的派发 click 事件，断言每一步之后
// 屏幕上确实有东西。任何一步渲染成空，都会被抓住。
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { rmSync, existsSync, readFileSync } from 'node:fs'
import { setupDom } from './uiflow/dom.mjs'

const root = new URL('..', import.meta.url).pathname

// 1) 先在**另一个进程**里打 bundle。
//    vite 会加载 vue 的 runtime-dom，它在模块加载时就把 document 缓存成 null，
//    同进程里再注入 jsdom 已经来不及。
if (!process.env.UIFLOW_SKIP_BUILD) {
  execFileSync(process.execPath, ['scripts/uiflow/build.mjs'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
}
const bundle = new URL('../.uiflow-out/e.mjs', import.meta.url)
assert.ok(existsSync(bundle), 'bundle 没打出来')

// 2) 装 DOM，然后才 import vue 代码
const window = setupDom()
const mod = await import(bundle.href)
const { createApp } = mod

// —— 与 main.js 完全一致的接线（2026-10-06 起启动链路要求 App 挂载前 wire CloudSync）——
// 这里手动复刻而非直接跑 main.js，是为了保留 errorHandler/warnHandler 收集。
// 守卫：main.js 的接线一旦变化，这里必须同步改（一切以项目实际为准）。
{
  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  for (const frag of ['setCloudHook(', 'CloudSync.wire(', 'applyMerged: (data) => actions.hydrate(data)', 'preloadSpritePacks()']) {
    assert.ok(mainSrc.includes(frag), `src/main.js 接线已变化（找不到 ${JSON.stringify(frag)}），请同步更新本测试的接线复刻`)
  }
}
const store = mod.useStore()
mod.setCloudHook(() => mod.CloudSync.enqueue())
mod.CloudSync.wire({
  getLocal: () => store,
  applyMerged: (data) => mod.actions.hydrate(data)
})
mod.preloadSpritePacks()

const problems = []
const app = createApp(mod.App)
app.config.errorHandler = (e) => problems.push('运行期异常: ' + e.message)
app.config.warnHandler = (m) => problems.push('Vue 警告: ' + String(m).slice(0, 140))
app.mount('#app')

const host = window.document.querySelector('#app')
const tick = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 25)) }
await tick()

const screen = () => host.firstElementChild
const text = () => host.textContent.replace(/\s+/g, ' ').trim()
const byText = (sel, label) => [...host.querySelectorAll(sel)].find((b) => (b.textContent || '').includes(label))

function assertNotBlank(step) {
  const el = screen()
  // 这正是 bug 当时的样子：host 里只有一个 <!----> 注释占位
  assert.ok(el, `${step}：屏幕上什么都没有，只剩 body 背景（route.name 没匹配上任何分支？）`)
  assert.ok(text().length > 10, `${step}：渲染了容器但没有任何内容`)
  assert.equal(problems.length, 0, `${step}：\n  ` + problems.join('\n  '))
}

async function click(el, label) {
  assert.ok(el, `找不到「${label}」按钮`)
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await tick()
}

let steps = 0
const step = (name) => { steps++; return name }

const waitFor = async (fn, label, timeoutMs = 8000) => {
  const t0 = Date.now()
  for (;;) {
    await tick(2)
    if (fn()) return
    if (Date.now() - t0 > timeoutMs) assert.fail(`等待超时：${label}`)
  }
}

// —— 流程开始：先走启动链（LOGO → 检查更新四步 → 游客进入），2026-10-06 起 App 不再直接落在主菜单 ——
assertNotBlank(step('启动'))
assert.match(screen().className, /splash-screen/, '启动落在 LOGO 页')
host.querySelector('.splash-screen').dispatchEvent(new window.Event('pointerdown', { bubbles: true }))
await waitFor(() => text().includes('登月执照'), '登录页（更新页四步走完 + 自动放行）')
assertNotBlank(step('启动链 · 登录页'))
await click(byText('button', '立即进入'), '游客进入')
await waitFor(() => /orbit-menu/.test(screen()?.className || ''), '游客进入后的主菜单')
assertNotBlank(step('游客进入主菜单'))
assert.match(screen().className, /orbit-menu/, '启动链走完落在主菜单')

await click(byText('.bottom-rail button', '更多'), '更多')
assertNotBlank(step('点开更多'))
const drawer = [...host.querySelectorAll('.rail-more button')].map((b) => b.textContent.trim())
assert.deepEqual(drawer, ['图鉴', '设置'], '第二行是图鉴和设置')

await click(byText('.rail-more button', '图鉴'), '图鉴')
assertNotBlank(step('进入图鉴'))
assert.match(screen().className, /codex-screen/, '进到了图鉴页')
assert.ok(host.querySelectorAll('.codex-card').length >= 5, '图鉴列出了条目')
assert.ok(host.querySelectorAll('.codex-tabs button').length === 3, '三个分组标签页都在')

// 列表 → 详情 → 列表
const firstCard = host.querySelector('.codex-card:not(.locked)')
await click(firstCard, '第一张图鉴卡片')
assertNotBlank(step('打开图鉴详情'))
assert.ok(host.querySelector('.codex-detail'), '详情页打开了')
assert.ok(host.querySelectorAll('.stat-list li').length > 0, '详情页有属性条')
assert.ok(host.querySelectorAll('.sound-btn').length > 0, '详情页有音效按钮')

await click(host.querySelector('.sound-btn'), '音效')
assertNotBlank(step('播放音效'))   // 音效按钮不该把页面点崩

await click(host.querySelector('.title-bar .icon-btn'), '详情页返回')
assertNotBlank(step('从详情返回列表'))
assert.ok(host.querySelector('.codex-grid'), '回到了图鉴列表')
assert.ok(!host.querySelector('.codex-detail'), '详情页关掉了')

// 图鉴 → 主菜单（就是出过 bug 的那一步）
await click(host.querySelector('.title-bar .icon-btn'), '图鉴返回')
await tick(6)
assertNotBlank(step('从图鉴返回主菜单'))
assert.match(screen().className, /orbit-menu/, '真的回到了主菜单，而不是空白屏')
assert.ok(text().includes('月面建筑师'), '主菜单的内容确实渲染出来了')

// 顺带把其它几个底部入口也走一遍，确认返回路径都不空屏
for (const [label, cls] of [['背包', 'inventory'], ['宠物', 'pets'], ['技能', 'skills']]) {
  await click(byText('.bottom-rail button', label), label)
  assertNotBlank(step(`进入${label}`))
  const back = host.querySelector('.title-bar .icon-btn, .screen .icon-btn')
  if (back) {
    await click(back, `${label}返回`)
    await tick(6)
    assertNotBlank(step(`从${label}返回`))
  }
}

rmSync(new URL('../.uiflow-out', import.meta.url), { recursive: true, force: true })
rmSync(new URL('../.uiflow-entry.mjs', import.meta.url), { force: true })

console.log(`真实点击流程通过：${steps} 步，每一步屏幕上都有内容。`)
console.log('覆盖：LOGO → 更新页自动放行 → 游客进入主菜单 → 更多第二行 → 图鉴 → 条目详情 → 音效 → 返回列表 → 返回主菜单 → 背包/宠物/技能往返。')
