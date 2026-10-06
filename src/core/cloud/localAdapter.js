// 本地模拟后端：把“服务端”完整地模拟在 localStorage 的一个独立键空间里。
//
// 为什么要有它：
//   1. 未配置 Supabase 时全链路可跑 —— 游戏的云端同步、排行榜、管理后台（admin.html）
//      在本地模拟模式下全部真实工作，只是“服务器”搬进了同一个浏览器的 localStorage。
//   2. 管理后台与游戏同源（dev 下都在 5173 端口），共用这份数据：
//      玩一关 → 打开 /admin.html → 立刻能在用户列表里看到自己的进度与对局记录。
//   3. 回归脚本（scripts/verify-cloud-sync.mjs）的无头测试后端。
//
// 约束：
//   - 零导入期副作用：只在函数调用时读写 localStorage，保证被 verify 脚本 import 时安全。
//   - 演示玩家用固定种子生成，数据确定性可复现（测试断言不抖动）。
//   - 键空间 'gaidaoyueqiu2:cloud-mock:v1' 与游戏存档 'gaidaoyueqiu2:save:v1' 完全隔离，
//     清空游戏存档不会动“服务器”，反之亦然。

import { LEVELS } from '../../data/levels.js'
import { Storage } from '../storage.js'

const STORE_KEY = 'gaidaoyueqiu2:cloud-mock:v1'

function emptyStore() {
  return { seeded: false, players: {}, saves: {}, results: [], ledger: [] }
}

export function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return { ...emptyStore(), ...parsed }
    }
  } catch (e) {
    console.warn('读取本地模拟后端失败', e)
  }
  return emptyStore()
}

export function writeStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch (e) {
    console.warn('写入本地模拟后端失败', e)
  }
}

// 确定性伪随机（LCG）：种子固定 → 演示数据每次生成都一样。
function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const DEMO_PLAYERS = [
  { id: 'demo:1', name: '星际面包', seed: 11 },
  { id: 'demo:2', name: '月兔号', seed: 22 },
  { id: 'demo:3', name: '轨道漫游者', seed: 33 },
  { id: 'demo:4', name: '小行星矿工', seed: 44 }
]

// 演示存档：以真实 defaultSave() 为骨架，保证结构与玩家存档完全同构。
function makeDemoSave(rand) {
  const save = Storage.default()
  const stars = {}
  const bestScores = {}
  let coins = 0
  let unlocked = 1
  for (const level of LEVELS) {
    if (rand() < 0.72) {
      const grade = rand()
      const starsGot = grade > 0.68 ? 3 : grade > 0.3 ? 2 : 1
      bestScores[level.id] = Math.floor(level.target * 100 * (0.62 + rand() * 0.3))
      if (rand() < 0.82) stars[level.id] = starsGot
      coins += Math.floor(bestScores[level.id] / 10)
      unlocked = Math.min(LEVELS.length, level.id + 1)
    } else {
      break // 顺序解锁：没打到的关后面也不会有
    }
  }
  save.stars = stars
  save.bestScores = bestScores
  save.coins = coins + Math.floor(rand() * 900)
  save.unlocked = unlocked
  save.items = { revive: 1, widen: 2, double: 1, bagExpand: 1 }
  save.skills = { foundation: Math.floor(rand() * 9), midas: Math.floor(rand() * 6) }
  if (rand() < 0.5) save.materials.concrete = true
  if (rand() < 0.3) save.materials.steel = true
  return save
}

function resultsFromSave(playerId, save) {
  const rows = []
  for (const level of LEVELS) {
    const best = save.bestScores[level.id]
    if (!best) continue
    rows.push({
      playerId,
      levelId: level.id,
      stars: save.stars[level.id] || 0,
      score: best,
      coins: Math.floor(best / 10),
      cleared: true,
      durationS: Math.floor(best / 6),
      at: Date.now() - Math.floor(Math.random() * 0) // 保持确定性：由调用方排序即可
    })
  }
  return rows
}

// 首次使用时种入 4 个演示玩家（幂等）。返回完整 store。
export function seedIfNeeded() {
  const store = readStore()
  if (store.seeded) return store
  for (const demo of DEMO_PLAYERS) {
    const rand = lcg(demo.seed)
    const save = makeDemoSave(rand)
    store.players[demo.id] = {
      id: demo.id,
      name: demo.name,
      createdAt: Date.now(),
      lastSeenAt: Date.now()
    }
    store.saves[demo.id] = { data: save, clientRev: 1, updatedAt: Date.now() }
    store.results.push(...resultsFromSave(demo.id, save))
  }
  store.seeded = true
  writeStore(store)
  return store
}

// 榜单聚合：每个玩家取各关最高分求和 —— 与游戏本地“各关历史最高分合计”同口径，
// 也与 Supabase 端 get_leaderboard() SQL 同口径。
export function aggregateLeaderboard(store, limit = 20) {
  const best = {}
  for (const row of store.results) {
    const key = row.playerId
    if (!best[key]) best[key] = {}
    best[key][row.levelId] = Math.max(best[key][row.levelId] || 0, row.score || 0)
  }
  const rows = Object.values(store.players).map((player) => {
    const scores = best[player.id] || {}
    return {
      playerId: player.id,
      name: player.name,
      score: Object.values(scores).reduce((a, b) => a + b, 0)
    }
  })
  rows.sort((a, b) => b.score - a.score || String(a.playerId).localeCompare(String(b.playerId)))
  return rows.slice(0, limit)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function createLocalAdapter() {
  // 注意：不能把 store 缓存在闭包里 —— 游戏页和后台页（admin.html）同源共享这份数据，
  // 每次操作都必须重新读 localStorage、改完整体写回，否则两个页面的适配器会互相
  // 用过期快照覆盖对方的写入（这正是一次真实服务器按请求读写数据库的语义）。
  return {
    mode: 'mock',

    async signIn() {
      const id = 'local:me'
      const store = seedIfNeeded()
      if (!store.players[id]) {
        store.players[id] = { id, name: '我', createdAt: Date.now(), lastSeenAt: Date.now() }
      } else {
        store.players[id].lastSeenAt = Date.now()
      }
      writeStore(store)
      return { playerId: id, name: store.players[id].name }
    },

    async pullSave(playerId) {
      const saved = readStore().saves[playerId]
      return saved ? { data: clone(saved.data), clientRev: saved.clientRev } : null
    },

    // CAS 语义：clientRev 不大于服务端已有 rev 即拒绝，返回服务端版本让客户端走合并。
    async pushSave(playerId, data, clientRev) {
      const store = readStore()
      const existing = store.saves[playerId]
      if (existing && clientRev <= existing.clientRev) {
        return { accepted: false, serverData: clone(existing.data), serverRev: existing.clientRev }
      }
      store.saves[playerId] = { data: clone(data), clientRev, updatedAt: Date.now() }
      if (store.players[playerId]) store.players[playerId].lastSeenAt = Date.now()
      writeStore(store)
      return { accepted: true, serverRev: clientRev }
    },

    async reportResult(playerId, r) {
      const store = seedIfNeeded()
      store.results.push({
        playerId,
        levelId: r.levelId,
        stars: r.stars,
        score: r.score,
        coins: r.coins,
        cleared: r.cleared,
        durationS: r.durationS,
        at: Date.now()
      })
      if (r.coins > 0) {
        store.ledger.push({
          playerId, deltaCoins: r.coins, reason: 'level_clear', refId: String(r.levelId), at: Date.now()
        })
      }
      if (store.players[playerId]) store.players[playerId].lastSeenAt = Date.now()
      writeStore(store)
      return { ok: true }
    },

    async leaderboard(limit = 20) {
      return aggregateLeaderboard(readStore(), limit)
    }
  }
}
