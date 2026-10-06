// 内容域迁移静态回归（Phase 2 · T1）：
// 纯文本检查 supabase/migrations/0003_content.sql 是否按 docs/PARALLEL_TASKS.md
// §C1 冻结契约交付——不连数据库、不执行 SQL，node 直跑：
//   S1 三张表（content_packs / content_published / content_pack_versions）
//   S2 玩家侧 RPC get_published_content（签名 + 下发形状）
//   S3 五个管理侧 admin_* RPC（冻结签名逐字核对）
//   S4 RLS 三连（三张表全部 enable row level security）
//   S5 security definer（六个 RPC 全覆盖）
//   S6 check 约束七包 key（levels/materials/blocks/items/skills/pets/ants）
//   S7 可重复执行（create table if not exists / create or replace function）
//   S8 管理侧鉴权（每个 admin_* 体内 is_admin() + raise 'not admin'，且文件零策略）
// 运行：node scripts/verify-content-sql.mjs（npm run test:content-sql）

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sql = readFileSync(join(root, 'supabase/migrations/0003_content.sql'), 'utf8')
// 先剥掉 -- 行注释再做空白归一化：注释里的字样不参与结构断言
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

// 截取单个函数定义片段（从 create or replace function 到下一个函数/文件尾），
// 用于「某个 RPC 是否带某特性」的局部断言
function fnBody(name) {
  const marker = `create or replace function public.${name}`
  const i = flat.indexOf(marker)
  if (i < 0) return ''
  const j = flat.indexOf('create or replace function', i + marker.length)
  return flat.slice(i, j < 0 ? flat.length : j)
}

// ================================================================
console.log('S1 · 三张表（§C1 冻结表结构）')
// ================================================================
ok(flat.includes('create table if not exists public.content_packs ('), 'content_packs（草稿区）已建')
ok(flat.includes('create table if not exists public.content_published ('), 'content_published（已发布区）已建')
ok(flat.includes('create table if not exists public.content_pack_versions ('), 'content_pack_versions（历史快照）已建')
// 冻结列的关键形态抽查（列名/默认值/identity 与 §C1 字面一致）
ok(/create table if not exists public\.content_packs \( key text primary key/.test(flat), 'content_packs 以 key text primary key 建表')
ok(flat.includes('version int not null default 0'), '草稿 version 默认 0（§C1 冻结默认值）')
ok(flat.includes('id bigint generated always as identity primary key'), '历史快照 id 为 identity 主键（§C1 冻结）')

// ================================================================
console.log('S2 · 玩家侧 RPC：get_published_content')
// ================================================================
const pubBody = fnBody('get_published_content')
ok(pubBody.startsWith('create or replace function public.get_published_content() returns jsonb'), '签名冻结：get_published_content() returns jsonb')
ok(/jsonb_build_object\( 'version', .* 'packs', /.test(pubBody), '下发形状 { version, packs }（§C1 冻结）')
ok(/max\(version\) from public\.content_published/.test(pubBody), 'version 取 content_published 最大发布版本')

// ================================================================
console.log('S3 · 五个管理侧 RPC（签名冻结，逐字核对）')
// ================================================================
ok(fnBody('admin_list_packs').startsWith('create or replace function public.admin_list_packs() returns table (key text, status text, version int, updated_at timestamptz)'),
  '签名冻结：admin_list_packs() returns table(key, status, version, updated_at)')
ok(fnBody('admin_get_pack').startsWith('create or replace function public.admin_get_pack(p_key text) returns jsonb'),
  '签名冻结：admin_get_pack(p_key text) returns jsonb')
ok(fnBody('admin_save_pack').startsWith('create or replace function public.admin_save_pack(p_key text, p_data jsonb) returns int'),
  '签名冻结：admin_save_pack(p_key text, p_data jsonb) returns int')
ok(fnBody('admin_publish_pack').startsWith('create or replace function public.admin_publish_pack(p_key text) returns int'),
  '签名冻结：admin_publish_pack(p_key text) returns int')
ok(fnBody('admin_pack_history').startsWith('create or replace function public.admin_pack_history(p_key text, p_limit int default 20) returns table (version int, data jsonb, updated_at timestamptz)'),
  '签名冻结：admin_pack_history(p_key text, p_limit int default 20) returns table(version, data, updated_at)')

// ================================================================
console.log('S4 · RLS 三连（三表全开、零直读直写）')
// ================================================================
ok(flat.includes('alter table public.content_packs enable row level security'), 'content_packs enable row level security')
ok(flat.includes('alter table public.content_published enable row level security'), 'content_published enable row level security')
ok(flat.includes('alter table public.content_pack_versions enable row level security'), 'content_pack_versions enable row level security')

// ================================================================
console.log('S5 · security definer（六 RPC 全覆盖）')
// ================================================================
const rpcs = ['get_published_content', 'admin_list_packs', 'admin_get_pack', 'admin_save_pack', 'admin_publish_pack', 'admin_pack_history']
for (const name of rpcs) {
  ok(fnBody(name).includes('security definer set search_path = public'), `${name} 为 security definer（set search_path = public）`)
}

// ================================================================
console.log('S6 · check 约束七包 key（§C1 冻结清单）')
// ================================================================
const checks = [...flat.matchAll(/check \(key in \(([^)]*)\)\)/g)].map((m) => m[1])
ok(checks.length >= 2, 'check (key in (...)) 约束覆盖草稿区与已发布区两张表')
const frozenKeys = ['levels', 'materials', 'blocks', 'items', 'skills', 'pets', 'ants']
for (const key of frozenKeys) {
  ok(checks.length > 0 && checks.every((c) => c.includes(`'${key}'`)), `check 约束含包 key：${key}`)
}
ok(checks.every((c) => c === "'levels','materials','blocks','items','skills','pets','ants'"), '七包 key 清单与 §C1 逐字一致（无多无少）')

// ================================================================
console.log('S7 · 可重复执行（红线：不假设线上库状态）')
// ================================================================
ok(!/create table (?!(if not exists))/.test(flat), '全部 create table 均带 if not exists')
ok(!/ create function /.test(flat) && (flat.match(/create or replace function/g) || []).length === 6, '六个函数全部 create or replace（无裸 create function）')

// ================================================================
console.log('S8 · 管理侧鉴权（is_admin() 把关，文件零策略）')
// ================================================================
for (const name of rpcs.slice(1)) {
  const body = fnBody(name)
  ok(body.includes('if not public.is_admin() then') && body.includes("raise exception 'not admin'"), `${name} 体内 is_admin() 鉴权（raise 'not admin'）`)
}
ok(!/create policy .* on public\.content_/.test(flat), '内容域三表零策略（anon/authenticated 无直读直写，一切走 RPC）')

console.log(`内容域迁移静态回归通过：S1-S8 共 ${passed} 条断言。`)
