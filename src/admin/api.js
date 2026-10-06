// 管理后台数据层（Phase 1 骨架）。
//
// 两种模式，与游戏侧 src/core/cloud 的判定完全一致：
//   - mock   ：直接读写游戏本地模拟后端的同一份 localStorage 键空间
//              （gaidaoyueqiu2:cloud-mock:v1）。同源 dev 下与游戏互通：
//              在 5173 玩一关，这里立刻能看到进度与对局记录。
//   - supabase：走 server/supabase/migrations/0001_init.sql 里的 admin_* RPC
//              （需要管理员账号登录；RPC 内部用 is_admin() 鉴权）。
//
// 规则：本文件属于应用层，允许 import 游戏的 core（但同样不碰 store.js）。

import { reactive } from 'vue'
import { readStore, writeStore, seedIfNeeded, aggregateLeaderboard } from '../core/cloud/localAdapter.js'
import { Storage } from '../core/storage.js'

const ADMIN_SESSION_KEY = 'gaidaoyueqiu2:admin:session'

function envConfig() {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}
  return env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
    ? { url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY }
    : null
}

export const adminState = reactive({
  mode: envConfig() ? 'supabase' : 'mock',
  loggedIn: false,
  userEmail: '',
  error: ''
})

let sb = null // supabase client

// ---------------------------------------------------------------
// 通用
// ---------------------------------------------------------------
export function adminModeLabel() {
  return adminState.mode === 'supabase' ? 'Supabase 云端' : '本地模拟（与游戏共用本机数据）'
}

// ---------------------------------------------------------------
// Supabase 模式：登录（管理员账号在 Supabase Dashboard → Authentication 里创建，
// 再在 admin_users 表登记该账号的 auth uid）
// ---------------------------------------------------------------
export async function adminLogin({ email, password }) {
  if (adminState.mode !== 'supabase') {
    adminState.loggedIn = true // 本地模拟模式无需登录
    return true
  }
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const cfg = envConfig()
    sb = createClient(cfg.url, cfg.anonKey)
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    adminState.loggedIn = true
    adminState.userEmail = email
    adminState.error = ''
    sessionStorage.setItem(ADMIN_SESSION_KEY, email)
    return true
  } catch (e) {
    adminState.error = String(e?.message || e)
    return false
  }
}

export function getSupabaseClient() {
  return sb
}

export async function restoreSession() {
  if (adminState.mode !== 'supabase') {
    adminState.loggedIn = true
    return
  }
  const saved = sessionStorage.getItem(ADMIN_SESSION_KEY)
  if (!saved) return
  try {
    // 刷新后 sb 为 null（Phase 1 遗留：此前只恢复 UI 状态，supabase 调用会静默落回
    // mock 数据）。这里重建 client 并用 persistSession 的会话校验。
    const { createClient } = await import('@supabase/supabase-js')
    const cfg = envConfig()
    sb = createClient(cfg.url, cfg.anonKey)
    const { data } = await sb.auth.getSession()
    if (data?.session) {
      adminState.userEmail = saved
      adminState.loggedIn = true
    } else {
      sessionStorage.removeItem(ADMIN_SESSION_KEY)
    }
  } catch (e) {
    // 网络异常保持未登录，走登录门
  }
}

// ---------------------------------------------------------------
// 仪表盘
// ---------------------------------------------------------------
export async function fetchDashboard() {
  if (adminState.mode === 'supabase' && sb) {
    const { data, error } = await sb.rpc('admin_dashboard')
    if (error) throw new Error(error.message)
    return data
  }
  const store = seedIfNeeded()
  const players = Object.values(store.players)
  const totalCoins = players.reduce((sum, p) => {
    const save = store.saves[p.id]
    return sum + (Number(save?.data?.coins) || 0)
  }, 0)
  return {
    playerCount: players.length,
    resultCount: store.results.length,
    totalCoins,
    top: aggregateLeaderboard(store, 5),
    recent: store.results.slice(-8).reverse().map((r) => ({
      player: store.players[r.playerId]?.name || r.playerId,
      levelId: r.levelId,
      stars: r.stars,
      score: r.score,
      at: r.at
    }))
  }
}

// ---------------------------------------------------------------
// 数据分析 · 关卡漏斗
// ---------------------------------------------------------------
// 「流失」的口径：在时间范围内至少尝试过本关、但从未 cleared 的去重玩家数。
// 尝试次数保留全部对局记录，所以同一玩家反复挑战会同时反映在 attempts 里。
export function buildLevelFunnel(results, days = 30, now = Date.now()) {
  const safeDays = Math.max(1, Math.min(Number(days) || 30, 3650))
  const cutoff = Number(now) - safeDays * 24 * 60 * 60 * 1000
  const buckets = new Map()

  for (const row of results || []) {
    const levelId = Number(row?.level_id ?? row?.levelId)
    const playerId = row?.player_id ?? row?.playerId
    const rawAt = row?.created_at ?? row?.at
    const at = typeof rawAt === 'number' ? rawAt : Date.parse(rawAt)
    if (!Number.isInteger(levelId) || levelId < 1 || playerId == null || (Number.isFinite(at) && at < cutoff)) continue

    if (!buckets.has(levelId)) buckets.set(levelId, { starters: new Set(), clearers: new Set(), attempts: 0 })
    const bucket = buckets.get(levelId)
    const playerKey = String(playerId)
    bucket.starters.add(playerKey)
    bucket.attempts += 1
    if (row.cleared === true || row.cleared === 'true') bucket.clearers.add(playerKey)
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level_id, bucket]) => {
      const started_players = bucket.starters.size
      const cleared_players = bucket.clearers.size
      return {
        level_id,
        started_players,
        attempts: bucket.attempts,
        cleared_players,
        dropoffs: Math.max(0, started_players - cleared_players),
        clear_rate: started_players ? cleared_players / started_players : 0
      }
    })
}

export async function fetchLevelFunnel(days = 30) {
  const safeDays = Math.max(1, Math.min(Number(days) || 30, 3650))
  if (adminState.mode === 'supabase') {
    if (!sb) throw new Error('尚未登录管理员')
    const { data, error } = await sb.rpc('admin_level_funnel', { p_days: safeDays })
    if (error) throw new Error(error.message)
    return data || []
  }
  const store = seedIfNeeded()
  return buildLevelFunnel(store.results, safeDays)
}

// ---------------------------------------------------------------
// 用户列表 / 详情
// ---------------------------------------------------------------
export async function fetchUsers(query = '') {
  const q = String(query || '').trim().toLowerCase()
  if (adminState.mode === 'supabase' && sb) {
    const { data, error } = await sb.rpc('admin_list_users', { p_q: q, p_limit: 100 })
    if (error) throw new Error(error.message)
    return data || []
  }
  const store = seedIfNeeded()
  const rows = Object.values(store.players).map((player) => {
    const save = store.saves[player.id]
    const data = save?.data || {}
    const totalStars = Object.values(data.stars || {}).reduce((a, b) => a + (b || 0), 0)
    const results = store.results.filter((r) => r.playerId === player.id).length
    return {
      id: player.id,
      name: player.name,
      coins: data.coins || 0,
      total_stars: totalStars,
      unlocked: data.unlocked || 1,
      results,
      last_seen_at: player.lastSeenAt
    }
  })
  const filtered = q
    ? rows.filter((r) => r.name.toLowerCase().includes(q) || String(r.id).toLowerCase().includes(q))
    : rows
  return filtered.sort((a, b) => (b.last_seen_at || 0) - (a.last_seen_at || 0))
}

export async function fetchUserDetail(id) {
  if (adminState.mode === 'supabase' && sb) {
    const { data, error } = await sb.rpc('admin_get_user', { p_id: id })
    if (error) throw new Error(error.message)
    return data
  }
  const store = seedIfNeeded()
  const player = store.players[id]
  if (!player) return null
  const save = store.saves[id]
  return {
    player,
    save: save ? save.data : null,
    clientRev: save ? save.clientRev : 0,
    results: store.results.filter((r) => r.playerId === id).slice(-30).reverse(),
    ledger: store.ledger.filter((l) => l.playerId === id).slice(-20).reverse()
  }
}

// ---------------------------------------------------------------
// 客服干预：补发金币（写账本；mock 模式同时直接改玩家本机存档，刷新游戏即生效）
// ---------------------------------------------------------------
export async function grantCoins(id, amount, reason = 'cs_grant') {
  const n = Math.floor(Number(amount))
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 1000000) {
    throw new Error('金额不合法（非零，且绝对值不超过 1,000,000）')
  }
  if (adminState.mode === 'supabase' && sb) {
    const { data, error } = await sb.rpc('admin_grant_coins', { p_id: id, p_amount: n, p_reason: reason })
    if (error) throw new Error(error.message)
    return data
  }
  const store = seedIfNeeded()
  // 1) 服务端（模拟）：改存档副本 + 记账本，并抬高 rev 让客户端下次同步时拿到
  const saved = store.saves[id]
  if (saved) {
    saved.data.coins = Math.max(0, (Number(saved.data.coins) || 0) + n)
    saved.clientRev += 1
    saved.updatedAt = Date.now()
  }
  store.ledger.push({ playerId: id, deltaCoins: n, reason, refId: 'admin', at: Date.now() })
  writeStore(store)
  // 2) 本机玩家（local:me）：直接写游戏存档，刷新游戏立即可见
  if (id === 'local:me') {
    const save = Storage.load()
    save.coins = Math.max(0, (Number(save.coins) || 0) + n)
    Storage.save(save)
  }
  return { ok: true, coins: saved ? saved.data.coins : null }
}

// ---------------------------------------------------------------
// 改名
// ---------------------------------------------------------------
export async function renamePlayer(id, name) {
  const trimmed = String(name || '').trim().slice(0, 16)
  if (!trimmed) throw new Error('昵称不能为空')
  if (adminState.mode === 'supabase' && sb) {
    const { error } = await sb.rpc('admin_rename_player', { p_id: id, p_name: trimmed })
    if (error) throw new Error(error.message)
    return true
  }
  const store = seedIfNeeded()
  if (!store.players[id]) throw new Error('玩家不存在')
  store.players[id].name = trimmed
  writeStore(store)
  return true
}
