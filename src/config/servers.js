// 服务器清单（docs/BOOT_FLOW_DESIGN.md §7.2）。
//
// 「服务器」= 一个 Supabase 项目（URL + anonKey）。这是部署基础设施，
// 不进内容包（与游戏数值/关卡的生命周期不同）。
//   - 配置了 VITE_SUPABASE_URL/KEY → 单服「澄河都会 · 一区」
//   - 未配置（本地开发/零配置演示）→ 单服「本地模拟」，connect 落到 localAdapter
//   - 多服：数组里加一行（或建第二个 Supabase 项目做测试服）；
//     运行时状态可被远端 app-config.json 覆盖（Phase 2 接入）
//
// 记忆（上次进的是哪个服）存 localStorage，独立于游戏存档与云端偏好。

import { BOOT_CONFIG } from './boot.js'

const SERVER_PREFS_KEY = 'gaidaoyueqiu2:prefs:serverId'

function envServer() {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
    return {
      id: 'chenghe-1',
      name: '澄河都会 · 一区',
      tag: 'recommended',
      status: 'smooth',
      url: env.VITE_SUPABASE_URL,
      anonKey: env.VITE_SUPABASE_ANON_KEY
    }
  }
  return {
    id: 'mock-1',
    name: '本地模拟 · 澄河一区',
    tag: 'recommended',
    status: 'smooth',
    url: null, // null = 本地模拟后端（localAdapter）
    anonKey: null
  }
}

export const SERVERS = Object.freeze([envServer()])

export function getServer(id) {
  return SERVERS.find((server) => server.id === id) || null
}

// 上次进入的服务器；无记忆/记忆失效返回 null
export function getRememberedServer() {
  try {
    const id = localStorage.getItem(SERVER_PREFS_KEY)
    return id ? getServer(id) : null
  } catch (e) {
    return null
  }
}

export function rememberServer(id) {
  try {
    localStorage.setItem(SERVER_PREFS_KEY, String(id))
  } catch (e) { /* 隐私模式等场景允许丢失 */ }
}

// 是否应跳过选服页：唯一服（或记忆有效）且配置允许
export function shouldSkipServerSelect() {
  return skipServerSelect(SERVERS.length, !!getRememberedServer(), BOOT_CONFIG.autoSkipServerWhenSingle)
}

// 供 verify-boot.mjs 断言的纯判定（不读 localStorage 的版本）
export function skipServerSelect(serverCount, hasRemembered, autoSkip = true) {
  return !!autoSkip && (serverCount === 1 || !!hasRemembered)
}
