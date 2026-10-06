// 云端同步层回归（Phase 1）：
//   S1 merge.js 纯逻辑（LWW + 保底字段 + 成绩校验）
//   S2 localAdapter（模拟后端的 CAS / 榜单聚合 / 确定性种子）
//   S3 CloudSync 全链路（init → 推送 → 冲突合并 → 保底回填 → 开关）
//   S4 架构规则（cloud 层不 import store.js，与图鉴规则 ⑤ 同源）
// 运行：node scripts/verify-cloud-sync.mjs（已接入 npm run test:all）

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

// —— localStorage mock（多键、Map 语义）——
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
console.log('S1 · merge.js 纯逻辑')
// ================================================================
const {
  perKeyMax, orMerge, mergeSave, sameSave, canonicalJson, validateResult, podiumOrder
} = await import('../src/core/cloud/merge.js')

ok(JSON.stringify(perKeyMax({ a: 1, b: 2 }, { b: 5, c: 0 })) === '{"a":1,"b":5,"c":0}', 'perKeyMax 逐键取最大')
ok(JSON.stringify(orMerge({ a: true }, { a: false, b: true })) === '{"a":true,"b":true}', 'orMerge 只增不减')
ok(canonicalJson({ b: 1, a: 2 }) === '{"a":2,"b":1}', 'canonicalJson 键序无关')
ok(sameSave({ a: 1, b: { x: 1, y: 2 } }, { b: { y: 2, x: 1 }, a: 1 }), 'sameSave 忽略嵌套键序')

// LWW：远端 rev 高 → 远端为主体
const localA = { coins: 500, stars: { 1: 2 }, bestScores: { 1: 800 }, materials: { soil: true, concrete: true }, items: { revive: 3 } }
const remoteA = { coins: 999, stars: { 1: 1 }, bestScores: { 1: 600, 2: 700 }, materials: { soil: true, steel: true }, items: {} }
const mergedA = mergeSave(localA, remoteA, 1, 5)
ok(mergedA.coins === 999, 'LWW 主体字段取 rev 高者（coins=远端）')
ok(mergedA.stars[1] === 2, '保底：stars 逐关取最大（本地 2 > 远端 1）')
ok(mergedA.bestScores[1] === 800 && mergedA.bestScores[2] === 700, '保底：bestScores 逐关取最大并保留对方独有关')
ok(mergedA.materials.concrete === true && mergedA.materials.steel === true, '保底：材质拥有只增不减')
ok(mergedA.items.revive === undefined, '非保底字段跟随 LWW 主体（items 取远端）')

// LWW：本地 rev 高 → 本地为主体，保底仍生效
const mergedB = mergeSave(localA, remoteA, 9, 5)
ok(mergedB.coins === 500 && mergedB.stars[1] === 2 && mergedB.materials.steel === true, '本地 rev 高时主体为本地、保底字段照常叠加')

// 成绩校验（与 Supabase report_result SQL 同规则）
ok(validateResult({ levelId: 3, stars: 9, score: 1000, target: 30 }).ok === true, '合法成绩通过')
ok(validateResult({ levelId: 3, stars: 9, score: 1000, target: 30 }).value.stars === 3, '星级钳制到 0~3')
ok(validateResult({ levelId: 3, score: 30 * 300 + 1, target: 30 }).ok === false, '超理论满分被拒（target×300 硬顶）')
ok(validateResult({ levelId: 0, score: 1, target: 30 }).ok === false, '非法关卡 ID 被拒')
ok(validateResult({ levelId: -1, score: 1, target: 30 }).ok === false, '负数关卡 ID 被拒')

// 领奖台排序：云端真实玩家可能只有 1~2 人，绝不能把 undefined 送进模板
ok(JSON.stringify(podiumOrder([{ rank: 1, name: 'a' }])) === JSON.stringify([{ rank: 1, name: 'a' }]), 'podiumOrder：1 人只出 1 个席位')
ok(JSON.stringify(podiumOrder([{ rank: 1 }, { rank: 2 }]).map((e) => e.rank)) === '[2,1]', 'podiumOrder：2 人出 2/1 席位')
ok(JSON.stringify(podiumOrder([{ rank: 1 }, { rank: 2 }, { rank: 3 }, { rank: 4 }]).map((e) => e.rank)) === '[2,1,3]', 'podiumOrder：≥3 人出 2/1/3 席位且截断到前三')
ok(podiumOrder(undefined).length === 0 && podiumOrder(null).length === 0, 'podiumOrder：空输入安全')

// ================================================================
console.log('S2 · localAdapter（本地模拟后端）')
// ================================================================
globalThis.localStorage = makeLocalStorage()
const { createLocalAdapter, readStore } = await import('../src/core/cloud/localAdapter.js')

const adapterA = createLocalAdapter()
await adapterA.signIn() // 游戏真实流程：init 先 signIn，本人进入玩家表
const board1 = await adapterA.leaderboard(20)
ok(board1.length === 5, `种子 4 个演示玩家 + 本人（共 5，实际 ${board1.length}）`)
ok(board1.every((row) => Number.isFinite(row.score) && row.score >= 0), '榜单分数全部合法')
ok(board1.every((row, i) => i === 0 || board1[i - 1].score >= row.score), '榜单按分数降序')

// 确定性：换一份全新 localStorage 再种一次，演示玩家分数完全一致
const firstDemoScores = board1.filter((r) => String(r.playerId).startsWith('demo:')).map((r) => r.score).join(',')
globalThis.localStorage = makeLocalStorage()
const adapterB = createLocalAdapter()
await adapterB.signIn() // 任何入口的第一步都会完成种子（signIn / 后台的 fetchDashboard 都会）
const board2 = await adapterB.leaderboard(20)
const secondDemoScores = board2.filter((r) => String(r.playerId).startsWith('demo:')).map((r) => r.score).join(',')
ok(firstDemoScores === secondDemoScores, '演示数据确定性：固定种子两次生成完全一致')

const signIn = await adapterB.signIn()
ok(signIn.playerId === 'local:me', '本机玩家 ID 固定为 local:me')

// CAS：同 rev 重复推送被拒，返回服务端版本
const sampleSave = { coins: 100, stars: { 1: 1 }, bestScores: { 1: 3000 }, materials: { soil: true }, items: {} }
ok((await adapterB.pushSave('local:me', sampleSave, 1)).accepted === true, '首次推送（rev 1）被接受')
const rejected = await adapterB.pushSave('local:me', { ...sampleSave, coins: 50 }, 1)
ok(rejected.accepted === false && rejected.serverRev === 1, '旧 rev 推送被拒（CAS）')
ok((await adapterB.pushSave('local:me', sampleSave, 2)).accepted === true, '更高 rev 推送被接受')
const pulled = await adapterB.pullSave('local:me')
ok(pulled.clientRev === 2 && pulled.data.coins === 100, '拉取返回最新 rev 与数据')

// 榜单聚合：每玩家各关最高分求和
await adapterB.reportResult('local:me', { levelId: 1, stars: 3, score: 3200, coins: 320, target: 30, cleared: true, durationS: 60 })
await adapterB.reportResult('local:me', { levelId: 1, stars: 3, score: 2900, coins: 290, target: 30, cleared: true, durationS: 55 }) // 更低分不覆盖
await adapterB.reportResult('local:me', { levelId: 2, stars: 2, score: 4100, coins: 410, target: 40, cleared: true, durationS: 90 })
const board3 = await adapterB.leaderboard(20)
const me = board3.find((row) => row.playerId === 'local:me')
ok(me.score === 3200 + 4100, `榜单 = 各关最高分求和（${me.score} = 3200 + 4100）`)
const storeNow = readStore()
ok(storeNow.ledger.some((row) => row.reason === 'level_clear' && row.deltaCoins === 320), '对局金币写入流水账本')

// ================================================================
console.log('S3 · CloudSync 全链路')
// ================================================================
globalThis.localStorage = makeLocalStorage()
const { CloudSync, cloudState } = await import('../src/core/cloud/index.js')
const { Storage } = await import('../src/core/storage.js')

// 本地存档（走真实 defaultSave 骨架，保证结构与游戏一致）
let localSave = Storage.default()
localSave.coins = 500
localSave.stars = { 1: 2 }
localSave.bestScores = { 1: 800 }
localSave.materials = { soil: true, concrete: true }
let applied = null

await CloudSync.init({
  getLocal: () => localSave,
  applyMerged: (data) => { applied = data; localSave = JSON.parse(JSON.stringify(data)) }
})
ok(cloudState.status === 'connected' && cloudState.mode === 'mock', 'init：无 Supabase 配置时进入本地模拟模式并连上')
ok(applied === null, '服务端为空时 init 不回填（本地即最新）')

await CloudSync.flush(true)
let serverSave = readStore().saves['local:me']
ok(serverSave && serverSave.clientRev === 1 && serverSave.data.coins === 500, 'flush：整档推送成功（rev 1）')

const report = await CloudSync.reportResult({ levelId: 1, stars: 3, score: 3000, coins: 300, target: 30, cleared: true })
ok(report.ok === true, 'reportResult：合法成绩上报成功')
const overCap = await CloudSync.reportResult({ levelId: 1, stars: 3, score: 99999, coins: 1, target: 30, cleared: true })
ok(overCap.ok === false && overCap.reason === 'score over theoretical cap', 'reportResult：超理论满分在客户端即被拒')
const board4 = await CloudSync.leaderboard(20)
ok(board4.some((row) => row.playerId === 'local:me' && row.score === 3000), '榜单包含本人上报成绩')

// 内容未变时跳过推送（rev 不动）
await CloudSync.flush(true)
ok(readStore().saves['local:me'].clientRev === 1, '内容未变的 flush 被哈希跳过（rev 保持 1）')

// —— 冲突路径：模拟另一台设备先推了更高 rev ——
const otherDevice = createLocalAdapter() // 同一份 localStorage “服务器”
const serverVersion = JSON.parse(JSON.stringify(localSave))
serverVersion.coins = 999
serverVersion.stars = { 1: 1 } // 另一台设备的星比本地低 —— 合并后必须保底回 2
serverVersion.materials = { soil: true, steel: true } // 比本地多钢材 —— 合并后必须保留
serverVersion.bestScores = { 1: 600, 2: 700 }
await otherDevice.pushSave('local:me', serverVersion, 5) // 直接以 rev 5 抢占

localSave.coins = 600 // 本地继续有新进度（触发哈希变化）
await CloudSync.flush(true)
serverSave = readStore().saves['local:me']
ok(serverSave.clientRev === 6, '冲突后合并重试，服务端 rev 前进到 6')
ok(serverSave.data.stars[1] === 2, '冲突合并：stars 保底不回退（2 > 1）')
ok(serverSave.data.materials.concrete === true && serverSave.data.materials.steel === true, '冲突合并：材质拥有只增不减')
ok(serverSave.data.bestScores[1] === 800 && serverSave.data.bestScores[2] === 700, '冲突合并：bestScores 逐关取最大')
ok(serverSave.data.coins === 999, '冲突合并：非保底字段按 LWW 取 rev 高者')
ok(applied !== null && applied.stars[1] === 2, 'applyMerged 收到保底合并后的数据')

// init 时远端更新的场景（换新设备）：远端 rev 更高 → 开机即回填
CloudSync._resetForTests()
globalThis.localStorage = makeLocalStorage()
const { createLocalAdapter: createFreshAdapter } = await import('../src/core/cloud/localAdapter.js')
const seedAdapter = createFreshAdapter()
const freshSave = Storage.default()
freshSave.coins = 1
freshSave.stars = { 1: 1 }
await seedAdapter.pushSave('local:me', freshSave, 1)
const richerRemote = JSON.parse(JSON.stringify(freshSave))
richerRemote.coins = 888
richerRemote.stars = { 1: 3 }
richerRemote.bestScores = { 1: 950 }
await seedAdapter.pushSave('local:me', richerRemote, 2)

let applied2 = null
let localSave2 = Storage.default() // 新设备：空进度
await CloudSync.init({
  getLocal: () => localSave2,
  applyMerged: (data) => { applied2 = data; localSave2 = JSON.parse(JSON.stringify(data)) }
})
ok(applied2 !== null && localSave2.coins === 888 && localSave2.stars[1] === 3, '新设备 init：拉取远端更高 rev 并回填')

// 开关
await CloudSync.setEnabled(false)
ok(cloudState.status === 'off' && cloudState.enabled === false, '关闭云端：状态 off')
const offlineReport = await CloudSync.reportResult({ levelId: 1, stars: 1, score: 100, target: 30 })
ok(offlineReport.ok === false && offlineReport.reason === 'offline', '关闭后成绩上报 no-op')
await CloudSync.setEnabled(true)
ok(cloudState.status === 'connected', '重新开启：自动重连')
CloudSync._resetForTests()

// ================================================================
console.log('S4 · 架构规则（cloud 层不许 import store.js）')
// ================================================================
const cloudDir = join(root, 'src/core/cloud')
const adminDir = join(root, 'src/admin')
const filesToCheck = [
  ...readdirSync(cloudDir).map((f) => join(cloudDir, f)),
  join(adminDir, 'api.js')
]
for (const file of filesToCheck) {
  const src = readFileSync(file, 'utf8')
  ok(!/from\s+['"].*store\.js['"]/.test(src), `${file.split('/').pop()} 不 import store.js（同步层与存档层解耦）`)
}

console.log(`云端同步回归通过：S1-S4 共 ${passed} 条断言。`)
