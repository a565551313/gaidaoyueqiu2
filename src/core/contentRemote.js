// 玩家侧远端内容握手（Phase 2 · T3，docs/PARALLEL_TASKS.md §C1 + T3 任务卡）。
//
// 职责：游戏启动时在后台拉取已发布内容包（content_published 表 → RPC
// get_published_content），组装校验后写入 localStorage 缓存键 CONTENT_BUNDLE_KEY，
// 落实「远端 → 本地缓存 → 打包默认」的内容优先级（接缝定义见 src/core/content.js
// 头注释：本文件只写缓存，pickBundle 在**下一次**页面加载时注入；本次对局继续用
// 启动时已注入的 bundle，不存在中途换数据）。
//
// 任务卡红线：
//   - fire-and-forget：main.js 不 await、不进启动链路（回访 <3s 指标不受影响）；
//   - 任何失败（无环境变量 / 网络错 / HTTP 非 2xx / 坏 payload / 版本不前进 /
//     存储不可写）一律静默回落，本模块永不抛错，游戏永远可玩；
//   - localStorage 缓存只在「远端 version 严格大于当前缓存 version 且组装后通过
//     isValidBundle 形状校验」时覆盖；
//   - 未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 时整体 no-op
//     （本地 mock 模式下内容包由后台发布直接写缓存，见 src/admin/api/content.js，
//     玩家侧不需要也不应该再发请求）。
//
// 实现方式：原生 fetch POST Supabase 的 PostgREST RPC 端点，鉴权只需
// apikey + Authorization Bearer <anonKey>（get_published_content 对 anon 开放），
// 不引入 supabase-js；与 cloud/index.js 同一架构规则——不 import store.js，
// 回归脚本（verify-content C6）可无头 import 并注入 fetch / storage 桩做断言。

import { DEFAULT_BUNDLE, CONTENT_BUNDLE_KEY, isValidBundle } from './content.js'

// §C1 冻结映射：包 key → 覆盖的玩家 bundle 顶层字段。
// 与 docs/PARALLEL_TASKS.md §C1 表、src/admin/api/content.js 的 PACK_FIELDS 一致。
const PACK_FIELD_MAP = {
  levels: ['chapters', 'levels'],
  materials: ['materials'],
  blocks: ['blockTypes', 'statSpecs'],
  items: ['items', 'bag'],
  skills: ['skills'],
  pets: ['pets', 'petStarCosts'],
  ants: ['ants']
}

// 与 cloud/index.js、admin/api.js 相同的 env 判定（Node 无头运行时恒为 null）
function envConfig() {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}
  return env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
    ? { url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY }
    : null
}

// 字段级形状兼容（判据实测自 src/data/* 在模块求值期的访问方式）：
//   数组字段（chapters/levels/materials/blockTypes/items/skills/pets）被 data 层
//     直接 .map —— 远端值必须是数组；
//   对象字段（statSpecs/bag/petStarCosts/ants）被直接按键取值
//     （bundle.statSpecs.*、bundle.bag.defaultCapacity、bundle.ants.species 等）
//     —— 远端值必须是对象，且默认包的每个顶层键都还得在（缺键 = data 层当场
//     undefined 或抛 TypeError，宁可整体拒绝）。
// 只做结构兼容，不校验元素内部字段（那是 isValidBundle 与后续内容 CI 的层级）。
function fieldShapeOk(defaultValue, value) {
  if (value === null || value === undefined) return false
  if (Array.isArray(defaultValue)) return Array.isArray(value)
  if (defaultValue && typeof defaultValue === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) return false
    return Object.keys(defaultValue).every((key) => value[key] !== undefined)
  }
  return typeof value === typeof defaultValue
}

// 组装：DEFAULT_BUNDLE 深拷贝 + 已发布包按 §C1 映射覆盖字段；未发布的字段保持打包
// 默认值，bundle 永远完整（pickBundle 是整体替换，不做逐字段兜底）。
// 返回组装后的 bundle；下列情况返回 null（调用方静默放弃本次更新）：
//   payload 不是对象 / version 不是正整数 / packs 不是对象 / 任何已发布的包
//   缺字段或字段形状不兼容 / 组装结果过不了 isValidBundle。
// 单个坏包整体拒绝而不是跳过：避免「新 levels + 旧 materials」这类跨包不一致的
// 混合状态被注入缓存。
export function assembleRemoteBundle(payload, baseBundle = DEFAULT_BUNDLE) {
  if (!payload || typeof payload !== 'object') return null
  const version = Number(payload.version)
  if (!Number.isInteger(version) || version <= 0) return null
  const packs = payload.packs
  if (!packs || typeof packs !== 'object' || Array.isArray(packs)) return null
  for (const key of Object.keys(packs)) {
    const fields = PACK_FIELD_MAP[key]
    if (!fields) continue // 未知包 key：向前兼容，老客户端忽略服务端新增的包
    const data = packs[key]
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    for (const field of fields) {
      if (!fieldShapeOk(baseBundle[field], data[field])) return null
    }
  }
  const assembled = JSON.parse(JSON.stringify(baseBundle))
  for (const key of Object.keys(packs)) {
    const fields = PACK_FIELD_MAP[key]
    if (!fields) continue
    for (const field of fields) assembled[field] = packs[key][field]
  }
  assembled.version = version // §C1：bundle.version = 最大发布版本（RPC 顶层 version）
  return isValidBundle(assembled) ? assembled : null
}

// 当前生效的缓存版本：缓存键里是合法包 → 取其 version；无缓存 / 缓存损坏 → 0。
// 基线取 0 而不是打包默认包的 version=1：首次发布的版本号从 1 起（见 admin 的
// savePack/publishPack 语义），若基线取 1，「严格大于」会让首发内容永远到不了
// 没有缓存的新玩家；基线 0 同时让坏缓存能被远端修复。
function cachedVersion(storage) {
  try {
    if (storage) {
      const raw = storage.getItem(CONTENT_BUNDLE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (isValidBundle(parsed)) {
          const version = Number(parsed.version)
          if (Number.isInteger(version) && version > 0) return version
        }
      }
    }
  } catch (e) { /* 坏缓存视同无缓存 */ }
  return 0
}

// 拉取 + 组装 + 版本门 + 写缓存。fire-and-forget 入口，永不抛错。
// 返回状态对象仅供回归脚本断言/调试，正常运行时调用方不消费。
// opts 仅供测试注入桩（main.js 无参调用）：
//   config    { url, anonKey }，缺省读 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
//   fetchImpl 缺省用全局 fetch
//   storage   缺省用全局 localStorage
export async function syncRemoteContent(opts = {}) {
  const config = 'config' in opts ? opts.config : envConfig()
  if (!config || !config.url || !config.anonKey) return { updated: false, reason: 'no-env' }
  const fetchImpl = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null)
  const storage = 'storage' in opts ? opts.storage : (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!fetchImpl) return { updated: false, reason: 'no-fetch' }
  try {
    const url = String(config.url).replace(/\/+$/, '') + '/rest/v1/rpc/get_published_content'
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: config.anonKey,
        Authorization: 'Bearer ' + config.anonKey
      },
      body: '{}'
    })
    if (!res || !res.ok) return { updated: false, reason: 'http' }
    const payload = await res.json()
    const assembled = assembleRemoteBundle(payload)
    if (!assembled) return { updated: false, reason: 'bad-payload' }
    // 版本门：远端 version 必须严格大于当前缓存 version 才覆盖（相同/回退都不写）
    if (!(assembled.version > cachedVersion(storage))) return { updated: false, reason: 'stale' }
    if (!storage || typeof storage.setItem !== 'function') return { updated: false, reason: 'no-storage' }
    storage.setItem(CONTENT_BUNDLE_KEY, JSON.stringify(assembled))
    return { updated: true, version: assembled.version }
  } catch (e) {
    // 静默回落：网络 / 解析 / 存储任何异常都不上抛；缓存留在原地，下次启动再试
    return { updated: false, reason: 'error' }
  }
}
