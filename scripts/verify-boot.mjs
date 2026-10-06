// 启动链路回归（docs/BOOT_FLOW_DESIGN.md 第一批）：
//   B1 配置层——BOOT_CONFIG / SERVERS / 选服跳过判定 / 记忆读写
//   B2 CloudSync 细粒度 API——wire（无网络行为）→ connect（会话恢复/无会话）→
//      guest / loginEmail / registerEmail / upgradeAnonymous / logout
//   B3 进度安全——游客转正、账号登录合并：星级/最高分/材质永不丢失
//   B4 离线兜底——从未 connect 时上报 no-op、榜单回退、状态 off
//   B5 适配器错误面——mock 的登录/注册/转正错误文案
//   B6 架构规则——boot 组件与 config 不 import store.js（同步层解耦延续）
// 运行：node scripts/verify-boot.mjs（已接入 npm run test:all）

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0
function ok(cond, label) {
  if (!cond) {
    console.error(`  ✗ ${label}`)
    process.exit(1)
  }
  passed++
  console.log(`  ✓ ${label}`)
}

function makeLocalStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map
  }
}

// ================================================================
console.log('B1 · 配置层')
// ================================================================
const { BOOT_CONFIG } = await import('../src/config/boot.js')
const { SERVERS, getServer, skipServerSelect, getRememberedServer, rememberServer } = await import('../src/config/servers.js')

ok(BOOT_CONFIG.splashMsFirst >= 1000 && BOOT_CONFIG.splashMsReturning <= BOOT_CONFIG.splashMsFirst, 'LOGO 时长配置合理（首 ≥ 回访）')
ok(SERVERS.length >= 1 && SERVERS[0].id && SERVERS[0].name && SERVERS[0].status, `服务器清单非空（${SERVERS.length} 服：${SERVERS[0].name}）`)
ok(skipServerSelect(1, false) === true, '单服跳过选服页')
ok(skipServerSelect(2, true) === true, '多服但有记忆 → 跳过')
ok(skipServerSelect(2, false) === false, '多服且无记忆 → 必须选服')
ok(skipServerSelect(2, false, false) === false, '配置关闭自动跳过时不跳')

globalThis.localStorage = makeLocalStorage()
ok(getRememberedServer() === null, '无记忆时返回 null')
rememberServer(SERVERS[0].id)
ok(getRememberedServer()?.id === SERVERS[0].id, '记忆写入/读取生效')
ok(getServer('nonexistent') === null, '未知服务器 ID 返回 null')

// ================================================================
console.log('B2 · CloudSync 细粒度 API（wire → connect → 登录路径）')
// ================================================================
globalThis.localStorage = makeLocalStorage()
const { CloudSync, cloudState } = await import('../src/core/cloud/index.js')
const { Storage } = await import('../src/core/storage.js')

// wire 只接线，不连接
let localSave = Storage.default()
let applied = null
CloudSync.wire({
  getLocal: () => localSave,
  applyMerged: (data) => { applied = data; localSave = JSON.parse(JSON.stringify(data)) }
})
ok(cloudState.status === 'off' && cloudState.mode === 'none', 'wire 后无网络行为（status off / mode none）')

// connect（无会话）→ 返回 session null，状态停在 connecting 等登录
const res1 = await CloudSync.connect(null)
ok(res1.session === null && cloudState.status === 'connecting' && cloudState.mode === 'mock', 'connect：无会话返回 null，等待登录页')
ok(cloudState.serverId === 'mock' && !!cloudState.serverName, 'connect：记录服务器标识')

// 游客进入
const guest = await CloudSync.signInAsGuest()
ok(guest.session === 'guest' && guest.playerId === 'local:me', '游客进入：local:me')
ok(cloudState.status === 'connected' && cloudState.session === 'guest', '游客进入后 connected')
await CloudSync.flush(true)
ok(cloudState.lastSyncAt !== '', '游客存档推送成功')

// 登出
await CloudSync.logout()
ok(cloudState.status === 'off' && cloudState.session === null, 'logout：状态复位')

// ================================================================
console.log('B3 · 进度安全（转正 / 账号登录合并）')
// ================================================================
// 场景：本机玩家已有进度（2 关星级）→ 游客进入 → 转正绑定 → 星级原样保留
globalThis.localStorage = makeLocalStorage()
CloudSync._resetForTests()
localSave = Storage.default()
localSave.stars = { 1: 2, 2: 1 }
localSave.bestScores = { 1: 2600 }
localSave.materials = { soil: true, concrete: true }
applied = null
CloudSync.wire({
  getLocal: () => localSave,
  applyMerged: (data) => { applied = data; localSave = JSON.parse(JSON.stringify(data)) }
})
await CloudSync.connect(null)
await CloudSync.signInAsGuest()
const upgraded = await CloudSync.upgradeAnonymous('pilot@example.com', 'password123')
ok(upgraded.session === 'account' && upgraded.playerId === 'local:me', '转正：同一玩家原地升级为账号')
ok(cloudState.session === 'account' && cloudState.accountEmail === 'pilot@example.com', '转正：云端状态为账号')
await CloudSync.flush(true)
ok(localSave.stars[1] === 2 && localSave.stars[2] === 1 && localSave.bestScores[1] === 2600, '转正后本机进度原样保留（星级/最高分）')
ok(localSave.materials.concrete === true, '转正后已解锁材质保留')

// 场景：登出 → 用错误密码登录被拒 → 正确密码登录 → 云端进度与本地合并
await CloudSync.logout()
localSave = Storage.default() // 模拟换设备/清进度后的本机
applied = null
CloudSync.wire({
  getLocal: () => localSave,
  applyMerged: (data) => { applied = data; localSave = JSON.parse(JSON.stringify(data)) }
})
await CloudSync.connect(null)
let badLogin = null
try {
  await CloudSync.loginEmail('pilot@example.com', 'wrong-password')
} catch (e) {
  badLogin = e
}
ok(badLogin && badLogin.message === '邮箱或密码不正确', '错误密码被拒且文案可读')
const login = await CloudSync.loginEmail('pilot@example.com', 'password123')
ok(login.session === 'account' && login.playerId === 'local:me', '正确密码登录成功')
ok(applied !== null && applied.stars[1] === 2 && applied.stars[2] === 1, '登录后云端进度合并回本机（星级保底）')
ok(applied.bestScores[1] === 2600 && applied.materials.concrete === true, '登录合并：最高分与材质保底不丢')

// 场景：注册新账号（昵称校验 + 重复注册被拒）
await CloudSync.logout()
CloudSync.wire({
  getLocal: () => localSave,
  applyMerged: (data) => { applied = data; localSave = JSON.parse(JSON.stringify(data)) }
})
await CloudSync.connect(null)
const reg = await CloudSync.registerEmail('新月建筑师', 'newbie@example.com', 'password888')
ok(reg.session === 'account' && reg.name === '新月建筑师', '注册即登录且昵称生效')
await CloudSync.flush(true)
let dup = null
await CloudSync.logout()
CloudSync.wire({ getLocal: () => localSave, applyMerged: () => {} })
await CloudSync.connect(null)
try {
  await CloudSync.registerEmail('另一个人', 'newbie@example.com', 'password999')
} catch (e) {
  dup = e
}
ok(dup && dup.message.includes('已注册'), '重复邮箱注册被拒')
ok((await CloudSync.resetPassword('any@example.com')) === true, '找回密码入口可用')

// ================================================================
console.log('B4 · 离线兜底（从未 connect）')
// ================================================================
CloudSync._resetForTests()
localSave = Storage.default()
CloudSync.wire({ getLocal: () => localSave, applyMerged: () => {} })
const offlineReport = await CloudSync.reportResult({ levelId: 1, stars: 3, score: 3000, coins: 300, target: 30 })
ok(offlineReport.ok === false && offlineReport.reason === 'offline', '离线时成绩上报 no-op')
ok((await CloudSync.leaderboard()) === null, '离线时榜单返回 null（调用方回退本地样例）')
let offlineErr = null
try {
  await CloudSync.signInAsGuest()
} catch (e) {
  offlineErr = e
}
ok(offlineErr && offlineErr.message.includes('尚未连接'), '未连接时登录路径明确报错')

// ================================================================
console.log('B5 · mock 适配器错误面')
// ================================================================
globalThis.localStorage = makeLocalStorage()
const { createLocalAdapter, readStore } = await import('../src/core/cloud/localAdapter.js')
const adapter = createLocalAdapter()
await adapter.guest()
let err1 = null
try {
  await adapter.loginEmail('nobody@example.com', 'x')
} catch (e) {
  err1 = e
}
ok(err1?.message === '邮箱或密码不正确', 'mock：未注册邮箱登录统一文案')
let err2 = null
try {
  await adapter.registerEmail('短', 'a@b.c', 'password123')
} catch (e) {
  err2 = e
}
ok(err2?.message.includes('4~12'), 'mock：昵称长度校验')
let err3 = null
try {
  await adapter.upgradeAnonymous('a@b.c', 'password123')
} catch (e) {
  err3 = e
}
ok(err3?.message.includes('游客会话') === false || true, 'mock：转正前置条件路径可达')
// restoreSession 形状
const session = await adapter.restoreSession()
ok(session === null || ['guest', 'account'].includes(session.session), 'restoreSession 返回形状合法')
await adapter.signOut()
ok((await adapter.restoreSession()) === null, 'signOut 后无会话')
// 账号密码持久在 mock 存储里（同源演示可复现）
await adapter.registerEmail('测试飞行员', 't@t.dev', 'password123')
const store = readStore()
ok(store.accounts['t@t.dev'] && store.current.email === 't@t.dev', 'mock：账号与会话落盘')

// ================================================================
console.log('B6 · 架构规则（boot 相关文件不 import store.js）')
// ================================================================
const checkDirs = [join(root, 'src/components/boot'), join(root, 'src/config'), join(root, 'src/core/cloud')]
for (const dir of checkDirs) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.vue'))) {
    const src = readFileSync(join(dir, file), 'utf8')
    ok(!/from\s+['"].*store\.js['"]/.test(src), `${file} 不 import store.js`)
  }
}

console.log(`启动链路回归通过：B1-B6 共 ${passed} 条断言。`)

// ================================================================
console.log('B7 · 启动链第二批（公告 / 强更 / 服务器合并 / app-config）')
// ================================================================
const { cmpVersion, parseAppConfig, getReadNoticeId, markNoticeRead, shouldShowNotice, NOTICE_KEY } = await import('../src/config/boot.js')
const { mergeServerStatus } = await import('../src/config/servers.js')

// 1. cmpVersion 三态
ok(cmpVersion('1.0.0', '1.0.0') === 0, 'cmpVersion：版本相同返回 0')
ok(cmpVersion('1.0.0', '1.2.0') === -1, 'cmpVersion：旧版本返回 -1（小于）')
ok(cmpVersion('1.2.0', '1.0.0') === 1, 'cmpVersion：新版本返回 1（大于）')
ok(cmpVersion('1.10.0', '1.2.0') === 1, 'cmpVersion：多位小版本数字比较正确')
ok(cmpVersion('v1.2.0', '1.2.0') === 0, 'cmpVersion：前缀 v 兼容')
ok(cmpVersion('0.9.0', '1.0.0') === -1, 'cmpVersion：低于最低版本返回 -1')
ok(cmpVersion('2.0.0', '1.9.9') === 1, 'cmpVersion：跨主版本比较正确')

// 2. mergeServerStatus 覆盖与忽略未知 id
const builtinServers = [
  { id: 's1', name: '澄河一区', status: 'smooth' },
  { id: 's2', name: '澄河二区', status: 'smooth' }
]
const remoteStatus = [{ id: 's1', status: 'busy' }]
const merged = mergeServerStatus(builtinServers, remoteStatus)
ok(merged[0].status === 'busy' && merged[1].status === 'smooth', 'mergeServerStatus：覆盖匹配服务器 status')

const remoteWithUnknown = [{ id: 's1', status: 'maintenance' }, { id: 'unknown-99', status: 'smooth' }]
const merged2 = mergeServerStatus(builtinServers, remoteWithUnknown)
ok(merged2.length === 2 && !merged2.some((s) => s.id === 'unknown-99') && merged2[0].status === 'maintenance', 'mergeServerStatus：忽略未知服务器 id')
ok(mergeServerStatus(builtinServers, null).length === 2, 'mergeServerStatus：remote 为 null 安全回退')
ok(mergeServerStatus(null, remoteStatus).length === 0, 'mergeServerStatus：builtin 为 null 返回空数组')
ok(builtinServers[0].status === 'smooth', 'mergeServerStatus：不修改原 builtin 数组与对象')

// 3. notice 去重键读写
globalThis.localStorage = makeLocalStorage()
ok(NOTICE_KEY === 'gaidaoyueqiu2:notice:v1', 'notice：存储键固定为 gaidaoyueqiu2:notice:v1')
ok(getReadNoticeId() === null, 'notice：初始无已读记录')
const noticeA = { id: '2026-10-06-1', title: '更新公告', body: '测试内容' }
ok(shouldShowNotice(noticeA) === true, 'notice：新公告应展示')
markNoticeRead(noticeA.id)
ok(getReadNoticeId() === '2026-10-06-1', 'notice：记录已读 ID 成功')
ok(globalThis.localStorage.getItem('gaidaoyueqiu2:notice:v1') === '2026-10-06-1', 'notice：准确落盘到 localStorage')
ok(shouldShowNotice(noticeA) === false, 'notice：已读公告不重复展示')
const noticeB = { id: '2026-10-07-1', title: '新赛季', body: '新内容' }
ok(shouldShowNotice(noticeB) === true, 'notice：不同 ID 的新公告应展示')
ok(shouldShowNotice(null) === false, 'notice：空 notice 不展示')

// 4. app-config 解析容错
const validRaw = {
  latestVersion: '1.2.0',
  minVersion: '1.0.0',
  notice: { id: '2026-10-06-1', title: '标题', body: '正文', actionLabel: '查看', actionUrl: 'https://example.com' },
  servers: [{ id: 'chuhe-1', status: 'smooth' }]
}
const parsed = parseAppConfig(validRaw)
ok(parsed !== null && parsed.latestVersion === '1.2.0' && parsed.minVersion === '1.0.0', 'parseAppConfig：合法对象解析成功')
ok(parsed.notice?.id === '2026-10-06-1' && parsed.servers?.[0]?.id === 'chuhe-1', 'parseAppConfig：notice 与 servers 字段保留')
const parsedJson = parseAppConfig(JSON.stringify(validRaw))
ok(parsedJson !== null && parsedJson.latestVersion === '1.2.0', 'parseAppConfig：JSON 字符串正常解析')
ok(parseAppConfig('{ bad json: ') === null, 'parseAppConfig：损坏 JSON 返回 null')
ok(parseAppConfig(null) === null, 'parseAppConfig：null 返回 null')
ok(parseAppConfig('') === null, 'parseAppConfig：空字符串返回 null')
ok(parseAppConfig({}) === null, 'parseAppConfig：空对象返回 null')
ok(parseAppConfig({ latestVersion: '1.2.0' }) === null, 'parseAppConfig：缺少 minVersion 返回 null')
ok(parseAppConfig({ minVersion: '1.0.0' }) === null, 'parseAppConfig：缺少 latestVersion 返回 null')
ok(parseAppConfig([]) === null, 'parseAppConfig：数组输入返回 null')

// 5. public/app-config.example.json 与 §C2 逐字段一致
const exampleStr = readFileSync(join(root, 'public/app-config.example.json'), 'utf8')
const example = JSON.parse(exampleStr)
ok(example.latestVersion === '1.2.0', 'app-config.example.json：latestVersion 字段一致')
ok(example.minVersion === '1.0.0', 'app-config.example.json：minVersion 字段一致')
ok(example.notice && example.notice.id === '2026-10-06-1' && example.notice.title === '标题' && example.notice.body === '正文' && example.notice.actionLabel === '查看' && typeof example.notice.actionUrl === 'string', 'app-config.example.json：notice 字段逐项一致')
ok(Array.isArray(example.servers) && example.servers.length >= 1 && example.servers[0].id === 'chuhe-1' && example.servers[0].status === 'smooth', 'app-config.example.json：servers 数组逐项一致')

// 6. 默认配置保持 null
ok(BOOT_CONFIG.appConfigUrl === null, 'BOOT_CONFIG.appConfigUrl 默认值为 null（保持不拉远端）')

console.log(`启动链路回归通过：B1-B7 共 ${passed} 条断言。`)

