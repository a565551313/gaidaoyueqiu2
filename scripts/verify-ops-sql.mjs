// 发布中心 + 运营看板迁移静态回归（Phase 2 · T6）：
// 纯文本检查 supabase/migrations/0004_ops.sql —— 不连数据库、不执行 SQL，node 直跑：
//   O1 admin_rollback_pack(p_key text, p_version int) returns int（签名 + security definer + is_admin 鉴权）
//   O2 admin_level_funnel() returns table(level_id, attempts, clears, players, avg_stars)（签名 + security definer + is_admin 鉴权）
//   O3 可重复执行（全部 create or replace function，不建表）
// 运行：node scripts/verify-ops-sql.mjs（npm run test:ops-sql）

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sql = readFileSync(join(root, 'supabase/migrations/0004_ops.sql'), 'utf8')
const flat = sql.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n').replace(/\s+/g, ' ')

let passed = 0
function ok(cond, label) {
  if (!cond) {
    console.error(`  ✗ ${label}`)
    process.exit(1)
  }
  passed++
  console.log(`  ✓ ${label}`)
}

function fnBody(name) {
  const marker = `create or replace function public.${name}`
  const i = flat.indexOf(marker)
  if (i < 0) return ''
  const j = flat.indexOf('create or replace function', i + marker.length)
  return flat.slice(i, j < 0 ? flat.length : j)
}

// ================================================================
console.log('O1 · admin_rollback_pack（内容域一键回滚）')
// ================================================================
const rollbackBody = fnBody('admin_rollback_pack')
ok(rollbackBody.startsWith('create or replace function public.admin_rollback_pack(p_key text, p_version int) returns int'),
  '签名：admin_rollback_pack(p_key text, p_version int) returns int')
ok(rollbackBody.includes('security definer set search_path = public'), 'admin_rollback_pack 为 security definer')
ok(rollbackBody.includes('if not public.is_admin() then') && rollbackBody.includes("raise exception 'not admin'"),
  'admin_rollback_pack 体内 is_admin() 鉴权')
ok(rollbackBody.includes('from public.content_pack_versions'), '从历史快照表取版本（content_pack_versions）')
ok(rollbackBody.includes('insert into public.content_packs'), '回滚落新草稿（content_packs）')
ok(rollbackBody.includes('insert into public.content_published'), '回滚即发布（content_published）')

// ================================================================
console.log('O2 · admin_level_funnel（运营看板关卡漏斗）')
// ================================================================
const funnelBody = fnBody('admin_level_funnel')
ok(funnelBody.startsWith('create or replace function public.admin_level_funnel() returns table ( level_id int, attempts bigint, clears bigint, players bigint, avg_stars numeric )'),
  '签名：admin_level_funnel() returns table(level_id, attempts, clears, players, avg_stars)')
ok(funnelBody.includes('security definer set search_path = public'), 'admin_level_funnel 为 security definer')
ok(funnelBody.includes('if not public.is_admin() then') && funnelBody.includes("raise exception 'not admin'"),
  'admin_level_funnel 体内 is_admin() 鉴权')
ok(funnelBody.includes('from public.level_results'), '聚合自 level_results（0001 已建表）')
ok(funnelBody.includes('group by lr.level_id'), '按 level_id 分组聚合')

// ================================================================
console.log('O3 · 可重复执行（红线：不假设线上库状态）')
// ================================================================
ok(!/ create function /.test(flat), '无裸 create function（全部 create or replace function）')
ok((flat.match(/create or replace function/g) || []).length === 2, '恰好两个函数（本迁移独占文件职责单一）')
ok(!/create table/.test(flat), '不建表（复用 0001/0003 既有表）')

console.log(`发布中心 + 运营看板迁移静态回归通过：O1-O3 共 ${passed} 条断言。`)
