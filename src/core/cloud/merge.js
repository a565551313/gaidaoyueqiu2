// 云端存档的纯逻辑层：合并策略 + 成绩校验规则。
//
// 这个文件刻意零依赖（不 import 任何东西）：
//  - 回归脚本（scripts/verify-cloud-sync.mjs）直接测这里
//  - Supabase 端的 SQL 校验（server/supabase/migrations/0001_init.sql）
//    必须与本文件保持同一套数值规则 —— 改动任何一条要两边同步改
//
// 合并策略来自 docs/ADMIN_DESIGN.md §11.3：
//   整档 LWW（clientRev 高者为主体）
//   + 三类字段保底不回退：stars / bestScores 逐关取最大，materials.owned 只增不减。

// —— 逐键取最大（stars、bestScores）——
export function perKeyMax(a = {}, b = {}) {
  const out = { ...a }
  for (const key of Object.keys(b)) {
    out[key] = Math.max(Number(out[key]) || 0, Number(b[key]) || 0)
  }
  return out
}

// —— 布尔或合并（materials.owned：一旦拥有不因同步丢失）——
export function orMerge(a = {}, b = {}) {
  const out = { ...a }
  for (const key of Object.keys(b)) {
    out[key] = !!out[key] || !!b[key]
  }
  return out
}

// —— 整档合并：以 rev 高者为主体，再叠加保底字段 ——
export function mergeSave(localData, remoteData, localRev = 0, remoteRev = 0) {
  const baseIsRemote = remoteRev > localRev
  const base = baseIsRemote ? remoteData : localData
  const other = baseIsRemote ? localData : remoteData
  const out = JSON.parse(JSON.stringify(base))
  out.stars = perKeyMax(base.stars, other.stars)
  out.bestScores = perKeyMax(base.bestScores, other.bestScores)
  out.materials = orMerge(base.materials, other.materials)
  return out
}

// —— 忽略键序的稳定序列化（判断“内容是否真的变了”）——
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
}

export function sameSave(a, b) {
  return canonicalJson(a) === canonicalJson(b)
}

// —— 对局成绩上报校验（防刷第一层，与 Supabase report_result SQL 同规则）——
// 理论满分 ≈ 目标层数 × 本局初始宽度。宽度基准 100，加宽卡 +10%、磐石根基满级 +20%，
// 上限约 144 —— 服务端留足余量取 ×300 作硬顶，只拦“物理上不可能”的成绩。
export const SCORE_CAP_PER_TARGET = 300

export function validateResult(r) {
  const levelId = Math.floor(Number(r?.levelId))
  const score = Math.floor(Number(r?.score) || 0)
  const target = Math.max(1, Math.floor(Number(r?.target) || 0))
  if (!Number.isFinite(levelId) || levelId <= 0) return { ok: false, reason: 'bad levelId' }
  if (score < 0) return { ok: false, reason: 'negative score' }
  if (score > target * SCORE_CAP_PER_TARGET) return { ok: false, reason: 'score over theoretical cap' }
  return {
    ok: true,
    value: {
      levelId,
      stars: Math.max(0, Math.min(3, Math.floor(Number(r?.stars) || 0))),
      score,
      coins: Math.max(0, Math.floor(Number(r?.coins) || 0)),
      durationS: Math.max(0, Math.round(Number(r?.durationS) || 0)),
      cleared: !!r?.cleared,
      target
    }
  }
}
