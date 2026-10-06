// 运营中心回归：0005 迁移静态安全检查 + 远程配置解析 + 本地 mock 管理/兑换闭环。
// 运行：npm run test:ops-center（不连接真实 Supabase）。

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sqlSource = readFileSync(join(root, 'supabase/migrations/0005_ops_center.sql'), 'utf8')
const sql = sqlSource.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n').replace(/\s+/g, ' ')
let passed = 0
function ok(cond, label) {
  assert.ok(cond, label)
  passed++
  console.log(`  ✓ ${label}`)
}

function functionBody(name) {
  const marker = `create or replace function public.${name}`
  const start = sql.indexOf(marker)
  if (start < 0) return ''
  const next = sql.indexOf('create or replace function public.', start + marker.length)
  return sql.slice(start, next < 0 ? sql.length : next)
}

function makeLocalStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
    _map: map
  }
}

// ================================================================
console.log('O1 · 0005 schema、安全与幂等性')
// ================================================================
for (const table of ['announcements', 'feature_flags', 'gift_codes', 'gift_code_redemptions']) {
  ok(sql.includes(`create table if not exists public.${table}`), `${table} 使用 create table if not exists`)
  ok(sql.includes(`alter table public.${table} enable row level security`), `${table} 开启 RLS`)
}
ok(sql.includes('on conflict (key) do nothing'), 'ops_demo 示例开关种子可重复执行')
ok(!/\bdrop\s+(table|schema)\b/i.test(sql), '迁移不删除表或 schema')
ok(!/\bcreate\s+function\b/i.test(sql), '函数统一 create or replace，可重复执行')
ok(sql.includes('create index if not exists'), '索引使用 if not exists')

const managementFunctions = [
  'admin_list_announcements', 'admin_get_announcement', 'admin_create_announcement',
  'admin_update_announcement', 'admin_set_announcement_state', 'admin_delete_announcement',
  'admin_list_feature_flags', 'admin_set_feature_flag', 'admin_delete_feature_flag',
  'admin_list_gift_codes', 'admin_create_gift_code', 'admin_set_gift_code_enabled',
  'admin_delete_gift_code', 'admin_grant_coins'
]
for (const name of managementFunctions) {
  const body = functionBody(name)
  ok(body.includes('security definer set search_path = public'), `${name} 为 SECURITY DEFINER`)
  ok(body.includes('if not public.is_admin() then'), `${name} 函数体内调用 is_admin() 鉴权`)
}
ok(functionBody('get_public_ops_config').includes("'announcements'") && functionBody('get_public_ops_config').includes("'flags'"),
  '玩家公开 RPC 一次返回 announcements + flags')
ok(sql.includes('grant execute on function public.get_public_ops_config() to anon, authenticated'), '公开配置 RPC 授权 anon/authenticated 读取')
ok(sql.includes('grant execute on function public.redeem_gift_code(text) to authenticated'), '兑换 RPC 只授予 authenticated')
ok(functionBody('redeem_gift_code').includes('auth.uid()') && functionBody('redeem_gift_code').includes('for update'),
  '兑换校验玩家身份并锁礼包码行，次数检查具备并发保护')
ok(functionBody('redeem_gift_code').includes('gift_code_redemptions') && functionBody('redeem_gift_code').includes("'gift_code'"),
  '兑换写独立去重/审计记录，并以 gift_code 记金币流水')
ok(functionBody('apply_player_reward').includes('public.wallet_ledger') && functionBody('apply_player_reward').includes('client_rev = client_rev + 1'),
  '奖励共用存档版本 + wallet_ledger 写入路径')
ok(functionBody('admin_grant_coins').includes('public.apply_player_reward'), '0001 的管理补金币 RPC 委托共享奖励写入函数')
ok(sql.includes('revoke all on function public.apply_player_reward'), '内部奖励辅助函数不开放 REST 直接调用')
ok(!/create\s+table\s+if\s+not\s+exists\s+public\.(experiments|ab_tests)/i.test(sql), '本次没有创建 A/B 实验模型')

// ================================================================
console.log('O2 · 玩家远程公告 / 开关配置解析与兜底')
// ================================================================
const { parsePublicOpsConfig, fetchPublicOps, remoteOpsState, isRemoteFeatureEnabled } = await import('../src/core/remoteOps.js')
const { OPS_STORE_KEY, writeOpsStore } = await import('../src/core/opsStore.js')
const { normalizeGiftReward } = await import('../src/core/giftRewards.js')

globalThis.localStorage = makeLocalStorage()
const payload = {
  announcements: [{ id: 'ops-1', title: '运维公告', body: '正文', actionLabel: '查看', actionUrl: 'https://example.com', pinned: true }],
  flags: { ops_demo: true, sample_switch: false, malformed: 'true' }
}
const parsed = parsePublicOpsConfig(payload)
ok(parsed?.announcements.length === 1 && parsed.announcements[0].id === 'ops-1', '公开 payload 解析公告字段')
ok(parsed.flags.ops_demo === true && parsed.flags.sample_switch === false && parsed.flags.malformed === undefined,
  'feature flags 严格保留 boolean 值')
ok(parsePublicOpsConfig('{broken') === null && parsePublicOpsConfig({}) === null, '坏 JSON / 缺少配置字段返回 null')

let requestedUrl = ''
let requestOptions = null
const remote = await fetchPublicOps({
  config: { url: 'https://project.example/', anonKey: 'public-anon' },
  fetchImpl: async (url, options) => {
    requestedUrl = url
    requestOptions = options
    return { ok: true, json: async () => payload }
  }
})
ok(remote.ok && remote.source === 'supabase' && requestedUrl.endsWith('/rest/v1/rpc/get_public_ops_config'), '调用单一玩家 RPC 读取公告与开关')
ok(requestOptions.method === 'POST' && requestOptions.headers.apikey === 'public-anon' && requestOptions.body === '{}',
  '公开 RPC 使用 anon key，POST 空参数对象')
ok(isRemoteFeatureEnabled('ops_demo') === true && remoteOpsState.source === 'supabase', '远程 flags 写入运行态供客户端轻量读取')

writeOpsStore({
  announcements: [{ id: 'mock-notice', title: '本地公告', body: '同源 mock', enabled: true, pinned: true }],
  featureFlags: [{ key: 'ops_demo', enabled: true, description: 'demo' }],
  giftCodes: [], redemptions: {}
})
const mockRead = await fetchPublicOps({ config: null, storage: globalThis.localStorage })
ok(mockRead.ok && mockRead.source === 'mock' && mockRead.data.announcements[0].id === 'mock-notice',
  '无 Supabase 时读取后台同源 mock 公告（RPC 不可用则 app-config JSON 兜底）')
ok(isRemoteFeatureEnabled('ops_demo'), '本地 mock feature flag 可被游戏侧读取')
const bootUpdateSource = readFileSync(join(root, 'src/components/boot/BootUpdate.vue'), 'utf8')
ok(bootUpdateSource.includes('fetchPublicOps({ timeoutMs: 1500 })'), 'BootUpdate 以轻量超时读取运营 RPC，不额外串行等待')
ok(bootUpdateSource.includes('opsResult.data.announcements.find((item) => shouldShowNotice(item))')
  && bootUpdateSource.includes('else if (cfg?.notice && shouldShowNotice(cfg.notice))'),
  'BootUpdate 优先使用 RPC 公告，并保留原 app-config.json 公告兜底 / notice.id 去重')

// ================================================================
console.log('O3 · 后台 mock CRUD 与玩家礼包码兑换闭环')
// ================================================================
const { adminState } = await import('../src/admin/api.js')
const opsApi = await import('../src/admin/api/ops.js')
adminState.mode = 'mock'
const createdNotice = await opsApi.createAnnouncement({
  id: 'test-ops-1', title: '测试公告', body: '公告正文', actionLabel: '', actionUrl: '',
  pinned: false, enabled: false, startsAt: null, endsAt: null
})
ok((await opsApi.getAnnouncement(createdNotice.id))?.title === '测试公告', '公告新建后可读取')
await opsApi.updateAnnouncement(createdNotice.id, { ...createdNotice, title: '更新公告' })
await opsApi.setAnnouncementState(createdNotice.id, { pinned: true, enabled: true })
ok((await opsApi.listAnnouncements()).some((row) => row.id === createdNotice.id && row.pinned && row.enabled && row.title === '更新公告'),
  '公告编辑、置顶、启用停用与列表生效')
await opsApi.deleteAnnouncement(createdNotice.id)
ok(!(await opsApi.listAnnouncements()).some((row) => row.id === createdNotice.id), '公告删除生效')

await opsApi.saveFeatureFlag({ key: 'verify_flag', enabled: true, description: 'test' })
ok((await opsApi.listFeatureFlags()).some((row) => row.key === 'verify_flag' && row.enabled), 'feature flag 可新增、启用并列出')
await opsApi.deleteFeatureFlag('verify_flag')
ok(!(await opsApi.listFeatureFlags()).some((row) => row.key === 'verify_flag'), 'feature flag 可删除')

const invalidReward = (() => { try { normalizeGiftReward({ coins: -1 }); return false } catch { return true } })()
ok(invalidReward && JSON.stringify(normalizeGiftReward({ coins: 50, items: { revive: 1 } })) === '{"coins":50,"items":{"revive":1}}',
  '礼包奖励限定正金币与当前背包道具 JSON')
const gift = await opsApi.createGiftCode({
  code: 'MOON-OPS-TEST', reward: { coins: 125, items: { revive: 1, double: 1 } },
  useLimit: 2, enabled: true
})
ok(gift.code === 'MOON-OPS-TEST' && gift.usedCount === 0 && (await opsApi.listGiftCodes()).length === 1,
  '礼包码可生成并列出奖励、次数上限与已用次数')

const { CloudSync, cloudState } = await import('../src/core/cloud/index.js')
const { Storage } = await import('../src/core/storage.js')
CloudSync._resetForTests()
let localSave = Storage.default()
CloudSync.wire({
  getLocal: () => localSave,
  applyMerged: (data) => { localSave = JSON.parse(JSON.stringify(data)) }
})
await CloudSync.connect(null)
await CloudSync.signInAsGuest()
await CloudSync.flush(true)
const redeemed = await CloudSync.redeemGiftCode(' moon-ops-test ')
ok(redeemed.ok && localSave.coins === 125 && localSave.items.revive === 1 && localSave.items.double === 1,
  '兑换奖励从 mock 服务端回填游戏金币与道具存档')
ok(cloudState.status === 'connected' && cloudState.lastSyncAt, '兑换后 CloudSync rev / 同步状态已更新')
const mockGiftRows = await opsApi.listGiftCodes()
ok(mockGiftRows[0].usedCount === 1, '兑换记录回写礼包码已用次数')
let duplicateError = ''
try { await CloudSync.redeemGiftCode('MOON-OPS-TEST') } catch (e) { duplicateError = e.message }
ok(duplicateError.includes('已兑换'), '同一玩家重复兑换被拒绝（幂等保护）')

await CloudSync.logout()
CloudSync._resetForTests()

console.log(`运营中心回归通过：O1-O3 共 ${passed} 条断言。`)
