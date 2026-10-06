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
        // 兼容旧版本机数据（T4 时期无 versions 字段）：缺失则按空补齐，不影响既有草稿/已发布。
        if (!parsed.versions || typeof parsed.versions !== 'object') parsed.versions = {}
        return parsed
      }
    }
  } catch (e) { /* 损坏则重建 */ }
  return { packs: {}, published: {}, versions: {} }
}

function writeStore(store) {
  localStorage.setItem(ADMIN_STORE_KEY, JSON.stringify(store))
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
  store.packs[key] = { data, version, updatedAt: Date.now() }
  // 落一条历史快照（T6 发布中心·回滚依赖这份记录；与 content_pack_versions 同语义）
  if (!store.versions[key]) store.versions[key] = []
  store.versions[key].push({ version, data, updatedAt: Date.now() })
  if (store.versions[key].length > 50) store.versions[key] = store.versions[key].slice(-50)
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
  store.published[key] = { data: draft.data, version, publishedAt: Date.now() }
  writeStore(store)
  // 写玩家缓存（组装始终完整），同源 dev 下刷新 / 即看到新内容
  localStorage.setItem(CONTENT_BUNDLE_KEY, JSON.stringify(assembleBundle(store.published)))
  return version
}

// 历史版本（回滚用）
export async function packHistory(key, limit = 20) {
  if (!isPackKey(key)) throw new Error(`未知内容包：${key}`)
  if (adminState.mode === 'supabase') {
    const sb = getSupabaseClient()
    if (!sb) throw new Error('尚未登录管理员')
    const { data, error } = await sb.rpc('admin_pack_history', { p_key: key, p_limit: limit })
    if (error) throw new Error(error.message)
    return data
  }
  // mock 模式：每次 savePack 落一条快照（见上），按版本倒序返回，与 admin_pack_history 同形状
  const store = readStore()
  const rows = [...(store.versions[key] || [])]
    .sort((a, b) => b.version - a.version)
    .slice(0, Math.max(1, limit))
    .map((v) => ({ version: v.version, data: v.data, updated_at: v.updatedAt }))
  // 兜底：老数据没有落过快照时，退回当前草稿 / 已发布两个版本（T4 时期行为）
  if (!rows.length) {
    if (store.packs[key]) rows.push({ version: store.packs[key].version, data: store.packs[key].data, updated_at: store.packs[key].updatedAt })
    if (store.published[key]) rows.push({ version: store.published[key].version, data: store.published[key].data, updated_at: store.published[key].publishedAt })
  }
  return rows
}

// 回滚（T6 发布中心）：把某个历史版本一键变成新草稿并立即发布，返回新版本号。
// supabase 模式走 admin_rollback_pack RPC（0004 迁移补的契约，T1 的 admin_* 系列延伸）；
// mock 模式等价地把历史快照写成新草稿 + 同步发布，语义与 supabase 端一致。
export async function rollbackPack(key, version) {
  if (!isPackKey(key)) throw new Error(`未知内容包：${key}`)
  if (adminState.mode === 'supabase') {
    const sb = getSupabaseClient()
    if (!sb) throw new Error('尚未登录管理员')
    const { data: newVersion, error } = await sb.rpc('admin_rollback_pack', { p_key: key, p_version: version })
    if (error) throw new Error(error.message)
    return newVersion
  }
  const store = readStore()
  const snapshot = (store.versions[key] || []).find((v) => v.version === version)
    || (store.packs[key]?.version === version ? store.packs[key] : null)
    || (store.published[key]?.version === version ? store.published[key] : null)
  if (!snapshot) throw new Error('该版本不存在')

  const newVersion = (store.packs[key]?.version || 0) + 1
  store.packs[key] = { data: snapshot.data, version: newVersion, updatedAt: Date.now() }
  if (!store.versions[key]) store.versions[key] = []
  store.versions[key].push({ version: newVersion, data: snapshot.data, updatedAt: Date.now() })
  store.published[key] = { data: snapshot.data, version: newVersion, publishedAt: Date.now() }
  writeStore(store)
  localStorage.setItem(CONTENT_BUNDLE_KEY, JSON.stringify(assembleBundle(store.published)))
  return newVersion
}
