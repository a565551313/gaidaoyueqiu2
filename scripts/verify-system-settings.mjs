// 系统设置回归：审计迁移 / RPC 鉴权与签名 / 页面接线和只读边界。
// 运行：node scripts/verify-system-settings.mjs（独立 npm script，不串入 test:all）。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'supabase/migrations')
const oldMigrations = ['0001_init.sql', '0002_display_name.sql', '0003_content.sql', '0004_ops.sql', '0005_ops_center.sql']
const oldSql = oldMigrations.map((name) => readFileSync(join(migrationsDir, name), 'utf8')).join('\n')
const opsSql = readFileSync(join(migrationsDir, '0005_ops_center.sql'), 'utf8')
const sql = readFileSync(join(migrationsDir, '0006_system_settings.sql'), 'utf8')
const view = readFileSync(join(root, 'src/admin/views/SystemSettingsView.vue'), 'utf8')
const api = readFileSync(join(root, 'src/admin/api/system.js'), 'utf8')
const app = readFileSync(join(root, 'src/admin/AdminApp.vue'), 'utf8')
let passed = 0

function ok(condition, label) {
  assert.ok(condition, label)
  passed += 1
  console.log(`  ✓ ${label}`)
}

function functionBlock(source, name) {
  const start = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, 'i').exec(source)
  assert.ok(start, `missing function ${name}`)
  const bodyStart = source.indexOf('as $$', start.index)
  const end = source.indexOf('$$;', bodyStart + 5)
  assert.ok(bodyStart > start.index && end > bodyStart, `could not extract function ${name}`)
  return source.slice(start.index, end + 3)
}

function functionSignature(source, name) {
  const block = functionBlock(source, name)
  const header = block.slice(0, block.indexOf('as $$'))
  const match = header.match(/\(([\s\S]*?)\)\s*returns\s+([\s\S]*?)\s+language\b/i)
  assert.ok(match, `could not parse signature for ${name}`)
  const normalize = (value) => value.replace(/\s+/g, ' ').trim().toLowerCase()
  return { args: normalize(match[1]), result: normalize(match[2]) }
}

console.log('S1 · 读取 0001–0005 的基线审计状态')
ok(!/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.admin_audit\b/i.test(oldSql), '0001–0005 尚未创建 admin_audit 表')
ok(!/insert\s+into\s+public\.admin_audit\b/i.test(oldSql), '0001–0005 的 admin_* RPC 尚无审计写入')

console.log('\nS2 · 幂等迁移与 append-only 审计表')
ok(/create\s+table\s+if\s+not\s+exists\s+public\.admin_audit/i.test(sql), '审计表使用 CREATE TABLE IF NOT EXISTS')
const tableStart = sql.indexOf('create table if not exists public.admin_audit')
const tableEnd = sql.indexOf(');', tableStart)
const tableDefinition = sql.slice(tableStart, tableEnd)
for (const column of ['admin_id', 'admin_email', 'action', 'object_type', 'object_id', 'parameters', 'created_at']) {
  ok(new RegExp(`\\b${column}\\b`, 'i').test(tableDefinition), `审计表含 ${column} 字段`)
}
ok(/alter\s+table\s+public\.admin_audit\s+enable\s+row\s+level\s+security/i.test(sql), '审计表启用 RLS')
ok(/revoke\s+all\s+on\s+table\s+public\.admin_audit\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i.test(sql), '审计表不向 PUBLIC / anon / authenticated 授予直连权限')
ok(/drop\s+trigger\s+if\s+exists\s+admin_audit_append_only/i.test(sql) && /before\s+update\s+or\s+delete\s+on\s+public\.admin_audit/i.test(sql), '审计表禁止 UPDATE / DELETE，且触发器可幂等重建')

console.log('\nS3 · 写操作审计与既有签名兼容')
const legacyWriteRpcs = [
  'admin_grant_coins', 'admin_rename_player', 'admin_save_pack',
  'admin_publish_pack', 'admin_rollback_pack'
]
const opsWriteRpcs = [
  'admin_create_announcement', 'admin_update_announcement',
  'admin_set_announcement_state', 'admin_delete_announcement',
  'admin_set_feature_flag', 'admin_delete_feature_flag',
  'admin_create_gift_code', 'admin_set_gift_code_enabled', 'admin_delete_gift_code'
]
for (const name of legacyWriteRpcs) {
  // 0005_ops_center replaced admin_grant_coins with the shared reward writer; compare to that latest signature.
  const source = name === 'admin_grant_coins' ? opsSql : oldSql
  assert.deepEqual(functionSignature(sql, name), functionSignature(source, name), `${name} external signature changed`)
  ok(true, `${name} 保持原参数 / 返回类型签名`)
  const body = functionBlock(sql, name).toLowerCase()
  ok(body.includes('public.is_admin()'), `${name} 保留 is_admin() 鉴权`)
  ok(body.includes('public.admin_write_audit('), `${name} 成功写入审计日志`)
}
for (const name of opsWriteRpcs) {
  assert.deepEqual(functionSignature(sql, name), functionSignature(opsSql, name), `${name} external signature changed`)
  ok(true, `${name} 保持 0005_ops_center 原参数 / 返回类型签名`)
  const body = functionBlock(sql, name).toLowerCase()
  ok(body.includes('public.is_admin()'), `${name} 保留 is_admin() 鉴权`)
  ok(body.includes('public.admin_write_audit('), `${name} 成功写入审计日志`)
}
for (const action of [
  'player.grant_coins', 'player.rename', 'content.pack.save', 'content.pack.publish', 'content.pack.rollback',
  'ops.announcement.create', 'ops.announcement.update', 'ops.announcement.state', 'ops.announcement.delete',
  'ops.feature_flag.set', 'ops.feature_flag.delete', 'ops.gift_code.create', 'ops.gift_code.state', 'ops.gift_code.delete'
]) {
  ok(sql.includes(`'${action}'`), `审计操作类型定义：${action}`)
}
const saveAuditSection = functionBlock(sql, 'admin_save_pack').split("perform public.admin_write_audit(\n    'content.pack.save'")[1]
ok(saveAuditSection.includes('payload_bytes') && saveAuditSection.includes('top_level_keys') && !/'data'\s*,\s*p_data\b/.test(saveAuditSection), '内容包审计只存摘要，不复制完整 JSON 内容')
const announcementAuditSection = functionBlock(sql, 'admin_create_announcement').split("perform public.admin_write_audit(\n    'ops.announcement.create'")[1]
ok(announcementAuditSection.includes('body_chars') && !announcementAuditSection.includes('v_body'), '公告审计记录正文长度而非正文内容')
const giftAuditSection = functionBlock(sql, 'admin_create_gift_code').split("perform public.admin_write_audit(\n    'ops.gift_code.create'")[1]
ok(giftAuditSection.includes('reward_keys') && giftAuditSection.includes('reward_bytes') && !giftAuditSection.includes('p_reward,'), '礼包码审计记录奖励摘要而非完整奖励 JSON')

console.log('\nS4 · 新 RPC 均鉴权且查询分页')
for (const name of ['admin_list_admin_users', 'admin_list_audit', 'admin_write_audit']) {
  const block = functionBlock(sql, name).toLowerCase()
  ok(block.includes('security definer'), `${name} 使用 SECURITY DEFINER`)
  ok(block.includes('if not public.is_admin()'), `${name} 在函数体内执行 is_admin() 鉴权`)
}
ok(/revoke\s+all\s+on\s+function\s+public\.admin_write_audit\(text,\s*text,\s*text,\s*jsonb\)\s+from\s+public,\s*anon,\s*authenticated/i.test(sql), '内部审计辅助 RPC 不开放给 API 角色直接调用')
const auditQuery = functionBlock(sql, 'admin_list_audit')
for (const filter of ['p_admin_id', 'p_from', 'p_to', 'p_action', 'p_limit', 'p_offset', 'totalCount', 'items']) {
  ok(auditQuery.includes(filter), `审计查询支持 ${filter}`)
}
ok(!/insert\s+into\s+public\.admin_audit/i.test(functionBlock(oldSql, 'admin_level_funnel')), '纯读 admin_level_funnel 不写审计')

console.log('\nS5 · 系统设置页面与只读边界')
ok(app.includes("view === 'system'") && app.includes("from './views/SystemSettingsView.vue'"), '系统设置页面已接入后台导航路由')
ok(app.includes("view === 'ops'") && app.includes("from './views/OperationsCenterView.vue'"), '合并后运营中心路由仍保留')
ok(api.includes("rpc('admin_list_admin_users')") && api.includes("rpc('admin_list_audit'"), '页面数据只通过新增的受保护 RPC 获取')
ok(/adminId[\s\S]*from[\s\S]*to[\s\S]*action[\s\S]*limit[\s\S]*offset/.test(api), '审计 API 支持管理员 / 时间 / 操作类型过滤与分页参数')
for (const field of ['admin.email', 'admin.role', 'admin.status', 'admin.created_at']) {
  ok(view.includes(field), `管理员只读列表展示 ${field}`)
}
for (const filter of ['filters.adminId', 'filters.from', 'filters.to', 'filters.action']) {
  ok(view.includes(filter), `审计界面含筛选器 ${filter}`)
}
ok(view.includes('上一页') && view.includes('下一页') && view.includes('currentPage'), '审计界面含分页控制')
ok(view.includes('暂不做角色权限管理界面') && view.includes('Supabase Dashboard + SQL'), '界面说明账号登记流程，并明确不做角色权限管理')
const accountPanelStart = view.indexOf('<section class="ad-panel ss-panel">')
const accountPanelEnd = view.indexOf('</section>', accountPanelStart)
assert.ok(accountPanelStart >= 0 && accountPanelEnd > accountPanelStart, 'administrator panel boundaries')
ok(!/<button\b/i.test(view.slice(accountPanelStart, accountPanelEnd)), '管理员账号面板不含增删改操作按钮')
ok(!/\.(?:insert|update|delete)\s*\(/i.test(api), '系统设置 API 不暴露数据写操作')

console.log(`\n系统设置回归通过：S1–S5 共 ${passed} 条断言。`)
