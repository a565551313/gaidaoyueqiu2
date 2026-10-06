// 内容包数据层（Phase 2 · T0 脚手架）。
// 契约冻结：本文件导出的函数名 / 包 key 清单 / RPC 名见 docs/PARALLEL_TASKS.md §C1，
// T4（内容工厂 UI）与 T5（关卡编辑器）都依赖这里；改签名 = 破坏并行任务，需走集成会话。
//
// 模型：7 个内容包（pack），每个包是一份 JSON 文档，草稿与已发布分离：
//   - 草稿（draft）：编辑器正在改的版本，只有后台可见，不影响玩家
//   - 已发布（published）：玩家可见；get_published_content()（T1 的 SQL）在服务端
//     把各包组装成完整 bundle 下发，与 src/core/content.js 的 DEFAULT_BUNDLE 同构
//
// 两种模式（与 api.js 一致）：
//   - mock：localStorage 'gaidaoyueqiu2:content-admin:v1' 存草稿与已发布；
//     发布时把「默认包 + 已发布包覆盖」组装的 bundle 写进玩家缓存键
//     CONTENT_BUNDLE_KEY（同源 dev 下刷新游戏立即生效，端到端可验）
//   - supabase：走 0003 迁移的 admin_* RPC（T1 交付；未落库前调用报错属预期）
//
// 规则：应用层文件，允许 import 游戏的 core / content，但不碰 store.js。

import { adminState, getSupabaseClient } from '../api.js'
import { DEFAULT_BUNDLE, CONTENT_BUNDLE_KEY } from '../../core/content.js'

const ADMIN_STORE_KEY = 'gaidaoyueqiu2:content-admin:v1'

// 仅供本地模拟模式使用。线上历史以 content_pack_versions 为准；本机也保留同样的
// 每次保存快照，让发布中心能完整演示「选择历史版本 → 回滚并立即发布」。
function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

// —— 冻结的包清单：key ↔ 玩家 bundle 字段的映射也一并冻结 ——
export const PACK_KEYS = ['levels', 'materials', 'blocks', 'items', 'skills', 'pets', 'ants']

export const PACK_META = {
  levels: { label: '关卡与章节', desc: '8 章 56 关的目标 / 预算 / 天气 / 解锁编排（T5 关卡编辑器）' },
  materials: { label: '建筑材质', desc: '解锁条件与售价' },
  blocks: { label: '方块与属性', desc: '方块类型与六轴属性表' },
  items: { label: '道具与背包', desc: '道具效果与初始背包' },
  skills: { label: '技能', desc: '技能效果与解锁' },
  pets: { label: '宠物', desc: '宠物属性与星级消耗' },
  ants: { label: '敌人（蚂蚁）', desc: '兵种 / 性格 / 波次 / 耐久 · 专家模式，改错会破坏战斗核心' }
}

// pack data → bundle 字段（与 DEFAULT_BUNDLE 顶层字段一一对应，缺一不可）
const PACK_FIELDS = {
  levels: ['chapters', 'levels'],
  materials: ['materials'],
  blocks: ['blockTypes', 'statSpecs'],
  items: ['items', 'bag'],
  skills: ['skills'],
  pets: ['pets', 'petStarCosts'],
  ants: ['ants']
}

function isPackKey(key) {
  return PACK_KEYS.includes(key)
}

// ---------------- mock 模式存储 ----------------
function readStore() {
  try {
    const raw = localStorage.getItem(ADMIN_STORE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && parsed.packs && parsed.published) {
        // 兼容发布中心接入前已存在的本机数据：首次读取时补上 history 容器，
        // 旧草稿 / 已发布记录会在 packHistory 中作为历史兜底展示。
        return { ...parsed, history: parsed.history && typeof parsed.history === 'object' ? parsed.history : {} }
      }
    }
  } catch (e) { /* 损坏则重建 */ }
  return { packs: {}, published: {}, history: {} }
}

function writeStore(store) {
  localStorage.setItem(ADMIN_STORE_KEY, JSON.stringify(store))
}

function appendHistory(store, key, snapshot) {
  if (!store.history || typeof store.history !== 'object') store.history = {}
  if (!Array.isArray(store.history[key])) store.history[key] = []
  store.history[key].push({
    version: snapshot.version,
    data: cloneJson(snapshot.data),
    updatedAt: snapshot.updatedAt
  })
}

// 把「默认包 + 已发布包覆盖」组装成玩家 bundle（未发布的字段保持打包默认值，
// 保证 bundle 永远完整 —— content.js 的 pickBundle 是整体替换不做逐字段兜底）
function assembleBundle(published) {
  const bundle = JSON.parse(JSON.stringify(DEFAULT_BUNDLE))
  delete bundle.version // 版本号由发布时刻决定
  let maxVersion = 0
  for (const key of PACK_KEYS) {
    const pub = published[key]
    if (!pub) continue
    for (const field of PACK_FIELDS[key]) bundle[field] = pub.data[field]
    maxVersion = Math.max(maxVersion, pub.version)
  }
  bundle.version = maxVersion || bundle.version || 1
  return bundle
}

// ---------------- 对外 API（冻结签名） ----------------

// 包列表（编辑器左侧导航用）
export async function listPacks() {
  if (adminState.mode === 'supabase') {
    const sb = getSupabaseClient()
    if (!sb) throw new Error('尚未登录管理员')
    const { data, error } = await sb.rpc('admin_list_packs')
    if (error) throw new Error(error.message)
    return data // [{ key, status, version, updated_at }]
  }
  const store = readStore()
  const now = Date.now()
  return PACK_KEYS.map((key) => {
    const draft = store.packs[key]
    const pub = store.published[key]
    return {
      key,
      status: pub ? (draft && draft.version > pub.version ? 'draft' : 'published') : draft ? 'draft' : 'empty',
      version: Math.max(draft?.version || 0, pub?.version || 0),
      updated_at: draft?.updatedAt || pub?.publishedAt || now
    }
  })
}

// 取草稿；未初始化的包返回 null（调用方用默认包打底展示）
export async function getPack(key) {
  if (!isPackKey(key)) throw new Error(`未知内容包：${key}`)
  if (adminState.mode === 'supabase') {
    const sb = getSupabaseClient()
    if (!sb) throw new Error('尚未登录管理员')
    const { data, error } = await sb.rpc('admin_get_pack', { p_key: key })
    if (error) throw new Error(error.message)
    return data // { data, version } | null
  }
  const draft = readStore().packs[key]
  return draft ? { data: draft.data, version: draft.version } : null
}

// 保存草稿（version+1，不影响玩家）
export async function savePack(key, data) {
  if (!isPackKey(key)) throw new Error(`未知内容包：${key}`)
  if (adminState.mode === 'supabase') {
    const sb = getSupabaseClient()
    if (!sb) throw new Error('尚未登录管理员')
    const { data: version, error } = await sb.rpc('admin_save_pack', { p_key: key, p_data: data })
    if (error) throw new Error(error.message)
    return version
  }
  const store = readStore()
  const prev = store.packs[key]
  const version = (prev?.version || 0) + 1
  const snapshot = { data: cloneJson(data), version, updatedAt: Date.now() }
  store.packs[key] = snapshot
  appendHistory(store, key, snapshot)
  writeStore(store)
  return version
}

// 发布：草稿快照 → 已发布；mock 模式同步写玩家缓存键（刷新游戏即生效）
export async function publishPack(key) {
  if (!isPackKey(key)) throw new Error(`未知内容包：${key}`)
  if (adminState.mode === 'supabase') {
    const sb = getSupabaseClient()
    if (!sb) throw new Error('尚未登录管理员')
    const { data: version, error } = await sb.rpc('admin_publish_pack', { p_key: key })
    if (error) throw new Error(error.message)
    return version
  }
  const store = readStore()
  const draft = store.packs[key]
  if (!draft) throw new Error('该包还没有草稿，先保存再发布')
  const version = draft.version
  store.published[key] = { data: cloneJson(draft.data), version, publishedAt: Date.now() }
  writeStore(store)
  // 写玩家缓存（组装始终完整），同源 dev 下刷新 / 即看到新内容
  localStorage.setItem(CONTENT_BUNDLE_KEY, JSON.stringify(assembleBundle(store.published)))
  return version
}

// 历史版本（回滚用）。线上来自 content_pack_versions；本地模拟每次保存也会落一条快照。
export async function packHistory(key, limit = 20) {
  if (!isPackKey(key)) throw new Error(`未知内容包：${key}`)
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100))
  if (adminState.mode === 'supabase') {
    const sb = getSupabaseClient()
    if (!sb) throw new Error('尚未登录管理员')
    const { data, error } = await sb.rpc('admin_pack_history', { p_key: key, p_limit: safeLimit })
    if (error) throw new Error(error.message)
    return data || []
  }

  const store = readStore()
  const byVersion = new Map()
  for (const row of store.history?.[key] || []) {
    if (row && Number.isFinite(Number(row.version)) && row.data != null) {
      byVersion.set(Number(row.version), row)
    }
  }
  // 兼容发布中心上线前的旧 localStorage：它们没有 history 字段，仍可回滚现存版本。
  for (const row of [store.packs[key], store.published[key]]) {
    if (row && Number.isFinite(Number(row.version)) && row.data != null && !byVersion.has(Number(row.version))) {
      byVersion.set(Number(row.version), {
        version: row.version,
        data: row.data,
        updatedAt: row.updatedAt || row.publishedAt
      })
    }
  }
  return [...byVersion.values()]
    .sort((a, b) => Number(b.version) - Number(a.version) || Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, safeLimit)
    .map((row) => ({ version: Number(row.version), data: cloneJson(row.data), updated_at: row.updatedAt }))
}

// 一键回滚：历史数据永不直接降版本，而是以「新的草稿版本」保存并立即发布。
// 这样已启动客户端的严格递增版本检查也能在下次握手时收到回滚内容。
export async function rollbackPack(key, version) {
  if (!isPackKey(key)) throw new Error(`未知内容包：${key}`)
  const targetVersion = Number(version)
  if (!Number.isInteger(targetVersion) || targetVersion < 1) throw new Error('历史版本号不合法')

  if (adminState.mode === 'supabase') {
    const sb = getSupabaseClient()
    if (!sb) throw new Error('尚未登录管理员')
    const { data, error } = await sb.rpc('admin_rollback_pack', { p_key: key, p_version: targetVersion })
    if (error) throw new Error(error.message)
    return data
  }

  const row = (await packHistory(key, 100)).find((item) => item.version === targetVersion)
  if (!row) throw new Error(`找不到历史版本 v${targetVersion}`)

  // get_published_content 的 bundle version 是所有已发布包的最大版本。回滚必须跨过
  // 这个全局高水位（而不是只给当前包 +1），否则另一个包的较高版本会让玩家缓存
  // 把这次内容变更误判为旧版本。云端 admin_rollback_pack 使用同一规则。
  const store = readStore()
  const maxPublishedVersion = Math.max(0, ...Object.values(store.published)
    .map((pack) => Number(pack?.version) || 0))
  const nextVersion = Math.max(maxPublishedVersion, Number(store.packs[key]?.version) || 0) + 1
  const snapshot = { data: cloneJson(row.data), version: nextVersion, updatedAt: Date.now() }
  store.packs[key] = snapshot
  appendHistory(store, key, snapshot)
  store.published[key] = { data: cloneJson(row.data), version: nextVersion, publishedAt: Date.now() }
  writeStore(store)
  localStorage.setItem(CONTENT_BUNDLE_KEY, JSON.stringify(assembleBundle(store.published)))
  return nextVersion
}
