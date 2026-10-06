// CloudSync：云存档同步单例。
//
// Phase 1（docs/ADMIN_DESIGN.md §12.2）：storage.js 的本地存档（永远是同步源，离线可玩）
//   与云端双向同步：init / enqueue / flush / reportResult / leaderboard。
// 启动链路（docs/BOOT_FLOW_DESIGN.md §8，2026-10-06 第一批）：init 拆为细粒度方法，
//   由 boot 流程（更新页 → 登录页）显式驱动：
//     wire(opts)           应用层接线（main.js），不产生任何网络行为
//     connect(server)      连接选定服务器；恢复已有会话（游客/账号）并完成拉取合并
//     signInAsGuest()      游客进入（匿名注册）
//     loginEmail / registerEmail / upgradeAnonymous / resetPassword / logout
//   init(opts) 保留为「wire + connect + 自动游客」的复合便捷入口
//   （verify-cloud-sync 的全部既有断言依赖该语义，行为不变）。
//
// 架构约束（沿用图鉴规则 ⑤）：本文件不 import store.js ——
// getLocal / applyMerged 由应用层（main.js）注入，回归脚本可无头 import。
//
// 状态机：status = off（未启用/未初始化）→ connecting → connected | error

import { reactive } from 'vue'
import { mergeSave, sameSave, canonicalJson, validateResult } from './merge.js'

const PREFS_KEY = 'gaidaoyueqiu2:cloud:prefs'
const REV_KEY = 'gaidaoyueqiu2:cloud:rev'
export const PUSH_THROTTLE_MS = 15000

export const cloudState = reactive({
  mode: 'none', // none | mock | supabase —— 当前后端形态
  status: 'off', // off | connecting | connected | error
  enabled: true, // 玩家开关（写入 PREFS_KEY，不进游戏存档 schema）
  session: null, // null | 'guest' | 'account'（启动链路登录态）
  serverId: '',
  serverName: '',
  accountEmail: '',
  playerId: '',
  playerName: '',
  lastSyncAt: '',
  lastError: ''
})

let adapter = null
let wiring = null // { getLocal, applyMerged }
let localRev = 0
let applying = false // applyMerged 期间屏蔽 enqueue，防止同步回环
let lastPushHash = '' // 内容未变时跳过推送
let pushTimer = null
let initPromise = null

function readPrefs() {
  try {
    return { enabled: true, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }
  } catch (e) {
    return { enabled: true }
  }
}
function writePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch (e) { /* 忽略：隐私模式等场景下允许丢失 */ }
}
function readRev() {
  try {
    return Number(localStorage.getItem(REV_KEY)) || 0
  } catch (e) {
    return 0
  }
}
function writeRev(rev) {
  try {
    localStorage.setItem(REV_KEY, String(rev))
  } catch (e) { /* 同上 */ }
}
function snapshot() {
  // getLocal 给的是 store 的响应式代理；推送/比较用纯数据快照
  return JSON.parse(JSON.stringify(wiring.getLocal()))
}
function envConfig() {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}
  return env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
    ? { url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY }
    : null
}

// 登录完成后的收尾：拉云端 → 合并回填 → connected（各登录路径共用）
async function completeLogin(info) {
  cloudState.session = info.session || null
  cloudState.playerId = info.playerId || ''
  cloudState.playerName = info.name || ''
  cloudState.accountEmail = info.email || ''

  localRev = readRev()
  const remote = await adapter.pullSave(cloudState.playerId)
  if (remote) {
    const local = snapshot()
    const merged = mergeSave(local, remote.data, localRev, remote.clientRev)
    if (!sameSave(merged, local)) {
      applying = true
      try {
        wiring.applyMerged(merged)
      } finally {
        applying = false
      }
      localRev = Math.max(localRev, remote.clientRev) + 1
      writeRev(localRev)
    } else if (remote.clientRev > localRev) {
      localRev = remote.clientRev
      writeRev(localRev)
    }
  }
  cloudState.status = 'connected'
  cloudState.lastError = ''
}

export const CloudSync = {
  get state() {
    return cloudState
  },

  // —— 应用层接线（main.js）。只存引用，不连接、不登录。 ——
  wire(opts) {
    wiring = opts
  },

  // —— 连接服务器（启动链路 P2「连接服务器」步骤） ——
  // server: { id, name, url, anonKey } | null（null → 环境变量 → 本地模拟）
  // 返回 { session }：session 非空 = 已恢复会话并完成合并（可直接进主菜单）；
  // session 为 null = 需要走登录页。
  async connect(server) {
    if (!wiring) return { session: null }
    cloudState.status = 'connecting'
    try {
      const cfg = server && server.url && server.anonKey ? { url: server.url, anonKey: server.anonKey } : envConfig()
      if (cfg) {
        const { createSupabaseAdapter } = await import('./supabaseAdapter.js')
        adapter = await createSupabaseAdapter(cfg)
        cloudState.mode = 'supabase'
      } else {
        const { createLocalAdapter } = await import('./localAdapter.js')
        adapter = createLocalAdapter()
        cloudState.mode = 'mock'
      }
      cloudState.serverId = (server && server.id) || (cfg ? 'default' : 'mock')
      cloudState.serverName = (server && server.name) || (cfg ? '云端服务器' : '本地模拟')

      const prefs = readPrefs()
      cloudState.enabled = prefs.enabled
      if (!prefs.enabled) {
        cloudState.status = 'off'
        return { session: null }
      }

      const info = adapter.restoreSession ? await adapter.restoreSession() : null
      if (info && info.session) {
        await completeLogin(info)
        CloudSync._bindLifecycle()
        return { session: info.session }
      }
      // 无会话：停在 connecting，等登录页选择方式（此时榜单等只读操作不可用）
      cloudState.session = null
      cloudState.playerId = ''
      cloudState.playerName = ''
      cloudState.accountEmail = ''
      return { session: null }
    } catch (e) {
      cloudState.status = 'error'
      cloudState.lastError = String(e?.message || e)
      return { session: null, error: cloudState.lastError }
    }
  },

  // —— 四条登录路径（P4）；成功后自动完成拉取合并 ——
  async signInAsGuest() {
    if (!adapter) throw new Error('尚未连接服务器')
    const info = await adapter.guest()
    await completeLogin(info)
    CloudSync._bindLifecycle()
    return info
  },

  async loginEmail(email, password) {
    if (!adapter) throw new Error('尚未连接服务器')
    const info = await adapter.loginEmail(email, password)
    await completeLogin(info)
    CloudSync._bindLifecycle()
    return info
  },

  async registerEmail(name, email, password) {
    if (!adapter) throw new Error('尚未连接服务器')
    const info = await adapter.registerEmail(name, email, password)
    await completeLogin(info)
    CloudSync._bindLifecycle()
    return info
  },

  async upgradeAnonymous(email, password) {
    if (!adapter) throw new Error('尚未连接服务器')
    const info = await adapter.upgradeAnonymous(email, password)
    await completeLogin(info)
    return info
  },

  async resetPassword(email) {
    if (!adapter) throw new Error('尚未连接服务器')
    return adapter.resetPassword(email)
  },

  async logout() {
    try {
      if (adapter?.signOut) await adapter.signOut()
    } catch (e) { /* 登出失败也复位本地状态 */ }
    adapter = null
    initPromise = null
    cloudState.status = 'off'
    cloudState.session = null
    cloudState.playerId = ''
    cloudState.playerName = ''
    cloudState.accountEmail = ''
    if (pushTimer) {
      clearTimeout(pushTimer)
      pushTimer = null
    }
  },

  // —— 复合便捷入口：wire + connect + 无会话则自动游客（Phase 1 行为，回归依赖） ——
  init(opts) {
    wiring = opts
    if (!wiring) return Promise.resolve()
    if (initPromise) return initPromise
    initPromise = CloudSync._init()
    return initPromise
  },

  async _init() {
    const res = await CloudSync.connect(null)
    if (res.session) return res
    if (cloudState.status === 'error' || cloudState.status === 'off') return res
    // 无会话 → 自动以游客进入（保持 Phase 1 的 init 语义）
    try {
      await CloudSync.signInAsGuest()
    } catch (e) {
      cloudState.status = 'error'
      cloudState.lastError = String(e?.message || e)
    }
    return { session: cloudState.session }
  },

  _bindLifecycle() {
    if (typeof window === 'undefined' || CloudSync._bound) return
    CloudSync._bound = true
    window.addEventListener('pagehide', () => CloudSync.flush(true))
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') CloudSync.flush(true)
    })
  },

  // Storage.save 钩子入口：节流排队一次推送。
  enqueue() {
    if (applying || !adapter || cloudState.status !== 'connected') return
    if (pushTimer) return
    pushTimer = setTimeout(() => {
      pushTimer = null
      CloudSync.flush(false)
    }, PUSH_THROTTLE_MS)
  },

  async flush(force) {
    if (!adapter || cloudState.status !== 'connected') return
    if (!force && Date.now() - Number(CloudSync._lastPushAt || 0) < PUSH_THROTTLE_MS) return
    CloudSync._lastPushAt = Date.now()

    const data = snapshot()
    const hash = canonicalJson(data)
    if (hash === lastPushHash) return // 内容没变，不推

    let rev = Math.max(localRev, 0) + 1
    let payload = data
    let res = await adapter.pushSave(cloudState.playerId, payload, rev)
    if (!res.accepted && res.serverData) {
      // CAS 冲突：与服务端版本合并 → 回填本地 → 带新 rev 重试一次
      const merged = mergeSave(payload, res.serverData, rev, res.serverRev)
      applying = true
      try {
        wiring.applyMerged(merged)
      } finally {
        applying = false
      }
      payload = merged
      rev = Math.max(rev, res.serverRev) + 1
      res = await adapter.pushSave(cloudState.playerId, payload, rev)
    }
    if (res.accepted) {
      localRev = rev
      writeRev(rev)
      lastPushHash = canonicalJson(payload)
      cloudState.lastSyncAt = new Date().toISOString()
    }
  },

  // 兑换礼包码：先把本地进度推到服务端，再由兑换 RPC 原子写入奖励/账本；
  // 返回的服务端存档与新 rev 立即回填本地，避免后续 CAS 把奖励覆盖掉。
  async redeemGiftCode(rawCode) {
    if (!adapter || cloudState.status !== 'connected') throw new Error('请先连接云端并登录后再兑换')
    const code = String(rawCode || '').trim().toUpperCase()
    if (!/^[A-Z0-9][A-Z0-9-]{3,31}$/.test(code)) throw new Error('礼包码格式不正确')
    if (typeof adapter.redeemGiftCode !== 'function') throw new Error('当前服务器不支持礼包码兑换')

    await CloudSync.flush(true)
    const result = await adapter.redeemGiftCode(cloudState.playerId, code)
    if (!result?.ok) throw new Error('礼包码兑换未完成')

    const serverRev = Number(result.clientRev ?? result.client_rev) || 0
    if (result.save && serverRev > 0 && wiring) {
      const local = snapshot()
      const merged = mergeSave(local, result.save, localRev, serverRev)
      applying = true
      try {
        wiring.applyMerged(merged)
      } finally {
        applying = false
      }
      localRev = serverRev
      writeRev(localRev)
      lastPushHash = canonicalJson(snapshot())
      cloudState.lastSyncAt = new Date().toISOString()
    }
    return result
  },

  // 对局结算上报（GameView.onGameEnd 接线；未连接时 no-op，永不抛错影响本地结算）
  async reportResult(result) {
    if (!adapter || cloudState.status !== 'connected') return { ok: false, reason: 'offline' }
    const v = validateResult(result)
    if (!v.ok) return { ok: false, reason: v.reason }
    try {
      return await adapter.reportResult(cloudState.playerId, v.value)
    } catch (e) {
      cloudState.lastError = String(e?.message || e)
      return { ok: false, reason: 'report failed' }
    }
  },

  // 线上榜单；未连接/失败返回 null，调用方回退本地样例
  async leaderboard(limit = 20) {
    if (!adapter || cloudState.status === 'error') return null
    try {
      return await adapter.leaderboard(limit)
    } catch (e) {
      return null
    }
  },

  // 玩家开关（设置页）。关闭立即断开；重新开启重新走 init。
  async setEnabled(on) {
    const enabled = !!on
    writePrefs({ enabled })
    cloudState.enabled = enabled
    if (!enabled) {
      cloudState.status = 'off'
      adapter = null
      initPromise = null
      if (pushTimer) {
        clearTimeout(pushTimer)
        pushTimer = null
      }
      return
    }
    if (wiring) {
      initPromise = null
      return CloudSync.init(wiring)
    }
  },

  // 仅供回归测试：复位单例（业务代码不要调用）。
  _resetForTests() {
    adapter = null
    wiring = null
    localRev = 0
    applying = false
    lastPushHash = ''
    CloudSync._lastPushAt = 0
    CloudSync._bound = false
    if (pushTimer) {
      clearTimeout(pushTimer)
      pushTimer = null
    }
    initPromise = null
    cloudState.mode = 'none'
    cloudState.status = 'off'
    cloudState.enabled = true
    cloudState.session = null
    cloudState.serverId = ''
    cloudState.serverName = ''
    cloudState.accountEmail = ''
    cloudState.playerId = ''
    cloudState.playerName = ''
    cloudState.lastSyncAt = ''
    cloudState.lastError = ''
  }
}
