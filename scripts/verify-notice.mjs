// 公告通道运行期回归（N1-N3）。
//
// verify-boot 的 B7 是**源码/纯函数**层面的断言，证明不了「启动页真的会把公告显示出来、
// 关掉之后真的不再出现、版本检查真的不拦人」。这里用 jsdom 真挂载 BootUpdate.vue，
// 用 public/app-config.json 的真实内容作为 fetch 响应，断言屏幕上实际渲染出了什么。
//
// 跑法：node scripts/verify-notice.mjs（会先在子进程里打一次 bundle）
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { setupDom } from './uiflow/dom.mjs'

const root = new URL('..', import.meta.url).pathname
let passed = 0
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; console.log('  ✓ ' + msg) }

// 1) 子进程打包（同进程 build 之后再 import vue 会拿到 document=null 的 runtime-dom）
if (!process.env.NOTICE_SKIP_BUILD) {
  execFileSync(process.execPath, ['scripts/uiflow/notice-build.mjs'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
}
const bundle = new URL('../.notice-out/e.mjs', import.meta.url)
assert.ok(existsSync(bundle), 'bundle 没打出来')

// 2) 装 DOM，再 import vue 代码
const window = setupDom()

// 3) fetch 打桩：只认 BOOT_CONFIG.appConfigUrl，返回 public/app-config.json 的真实内容
const liveConfigText = readFileSync(new URL('../public/app-config.json', import.meta.url), 'utf8')
const liveConfig = JSON.parse(liveConfigText)
const fetchLog = []
globalThis.fetch = async (url) => {
  fetchLog.push(String(url))
  return { ok: true, status: 200, json: async () => JSON.parse(liveConfigText) }
}

const mod = await import(bundle.href)
const { createApp, BootUpdate, BOOT_CONFIG, NOTICE_KEY } = mod

const tick = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 25)) }

async function mountBoot() {
  const hostEl = window.document.createElement('div')
  window.document.body.appendChild(hostEl)
  const problems = []
  const app = createApp(BootUpdate)
  app.config.errorHandler = (e) => problems.push('运行期异常: ' + e.message)
  app.config.warnHandler = (m) => problems.push('Vue 警告: ' + String(m).slice(0, 140))
  app.mount(hostEl)
  await tick()
  return { app, hostEl, problems }
}

// ================================================================
console.log('N1 · 启动页真的拉到了 app-config 并渲染公告条')
// ================================================================
globalThis.localStorage.clear()
const first = await mountBoot()
ok(first.problems.length === 0, '挂载 BootUpdate 无运行期异常/警告' + (first.problems[0] ? '：' + first.problems[0] : ''))
ok(fetchLog.includes(BOOT_CONFIG.appConfigUrl), `真的请求了 ${BOOT_CONFIG.appConfigUrl}（不再跳过版本检查）`)

const card = first.hostEl.querySelector('.boot-notice-card')
ok(!!card, '公告条出现在启动页上')
ok(card.textContent.includes(liveConfig.notice.title), `公告标题已渲染：${liveConfig.notice.title}`)
ok(card.textContent.includes(liveConfig.notice.body.slice(0, 12)), '公告正文已渲染')
ok(first.hostEl.querySelectorAll('.boot-notice-card').length === 1, '公告条同屏只有一条')

// ================================================================
console.log('N2 · 版本检查不拦截（current == minVersion == latestVersion）')
// ================================================================
const versionRow = [...first.hostEl.querySelectorAll('.boot-steps li')][0]
ok(/检查版本/.test(versionRow.textContent), '第一行就是「检查版本」步骤')
ok(versionRow.className.includes('st-done'), '版本检查步骤为 done（未进入强更 error 态）')
ok(versionRow.textContent.includes('已是最新'), '版本检查结果显示「已是最新」')
const cta = first.hostEl.querySelector('.boot-cta')
ok(cta && !/前往更新/.test(cta.textContent), '主按钮不是「前往更新」= 没有被强更拦住')
ok(!!first.hostEl.querySelector('.boot-alt'), '「离线继续」仍可见（强更时才会被隐藏）')

// ================================================================
console.log('N3 · 关掉后只出现一次（notice.id 落盘去重）')
// ================================================================
card.querySelector('.notice-close').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await tick(8)
ok(!first.hostEl.querySelector('.boot-notice-card'), '点 × 后公告条消失')
ok(globalThis.localStorage.getItem(NOTICE_KEY) === String(liveConfig.notice.id), `已读 ID 落盘：${liveConfig.notice.id}`)
first.app.unmount()

const second = await mountBoot()
ok(!second.hostEl.querySelector('.boot-notice-card'), '再次进入启动页：同一条公告不再出现（只出现一次）')
ok(second.problems.length === 0, '二次挂载同样无异常')
second.app.unmount()

// 换一个 id → 应当重新出现，证明不是「公告功能坏了」
const nextId = String(liveConfig.notice.id).replace(/-(\d+)$/, (m, n) => '-' + (Number(n) + 1))
globalThis.localStorage.setItem(NOTICE_KEY, nextId === liveConfig.notice.id ? 'other' : nextId)
const third = await mountBoot()
ok(!!third.hostEl.querySelector('.boot-notice-card'), '换一个 notice.id 后公告重新出现（去重键按 id 生效）')
third.app.unmount()

console.log(`公告通道运行期回归通过：N1-N3 共 ${passed} 条断言。`)
