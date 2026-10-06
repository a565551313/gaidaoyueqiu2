// 玩家端远程运营配置：一条 RPC 同时读取公告与 feature flags。
// Supabase 失败 / 迁移尚未执行时 BootUpdate 继续使用 app-config.json 公告兜底；
// 无 Supabase 的本地开发则读取后台共享的同源 mock localStorage。

import { reactive } from 'vue'
import { OPS_STORE_KEY, normalizeOpsStore } from './opsStore.js'

const DEFAULT_FLAGS = Object.freeze({ ops_demo: false })

export const remoteOpsState = reactive({
  loaded: false,
  source: 'none', // none | supabase | mock | offline
  announcements: [],
  flags: { ...DEFAULT_FLAGS }
})

function envConfig() {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}
  return env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
    ? { url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY }
    : null
}

function normalizeAnnouncement(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || !row.id || !row.title) return null
  const actionUrl = String(row.actionUrl ?? row.action_url ?? '')
  return {
    id: String(row.id),
    title: String(row.title),
    body: String(row.body || ''),
    actionLabel: String(row.actionLabel ?? row.action_label ?? ''),
    actionUrl: actionUrl === '' || /^https:\/\//i.test(actionUrl) ? actionUrl : '',
    pinned: !!row.pinned
  }
}

export function parsePublicOpsConfig(input) {
  let payload = input
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload) } catch (e) { return null }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  if (!Array.isArray(payload.announcements) || !payload.flags || typeof payload.flags !== 'object' || Array.isArray(payload.flags)) {
    return null
  }

  const announcements = payload.announcements.map(normalizeAnnouncement).filter(Boolean)
  const flags = { ...DEFAULT_FLAGS }
  for (const [key, enabled] of Object.entries(payload.flags)) {
    if (/^[a-z][a-z0-9_]{0,63}$/.test(key) && typeof enabled === 'boolean') flags[key] = enabled
  }
  return { announcements, flags }
}

function setRuntimeOps(data, source) {
  remoteOpsState.announcements = data.announcements
  remoteOpsState.flags = data.flags
  remoteOpsState.source = source
  remoteOpsState.loaded = true
}

function setOffline() {
  setRuntimeOps({ announcements: [], flags: { ...DEFAULT_FLAGS } }, 'offline')
}

function localMockPayload(storage) {
  if (!storage || typeof storage.getItem !== 'function') return null
  const raw = storage.getItem(OPS_STORE_KEY)
  if (!raw) return null
  const store = normalizeOpsStore(JSON.parse(raw))
  const now = Date.now()
  const announcements = store.announcements
    .filter((row) => row.enabled
      && (!row.startsAt || Date.parse(row.startsAt) <= now)
      && (!row.endsAt || Date.parse(row.endsAt) > now))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)
      || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .map(normalizeAnnouncement)
    .filter(Boolean)
  const flags = Object.fromEntries(store.featureFlags.map((flag) => [String(flag.key), !!flag.enabled]))
  return { announcements, flags }
}

/**
 * 读取 get_public_ops_config()。本函数永不抛错，不阻塞离线游玩。
 * opts: config / fetchImpl / storage / timeoutMs 仅供回归脚本注入。
 */
export async function fetchPublicOps(opts = {}) {
  const config = Object.hasOwn(opts, 'config') ? opts.config : envConfig()
  const storage = Object.hasOwn(opts, 'storage')
    ? opts.storage
    : (typeof localStorage !== 'undefined' ? localStorage : null)

  if (!config || !config.url || !config.anonKey) {
    try {
      const mock = parsePublicOpsConfig(localMockPayload(storage))
      if (mock) {
        setRuntimeOps(mock, 'mock')
        return { ok: true, source: 'mock', data: mock }
      }
    } catch (e) { /* mock localStorage 损坏时回 app-config.json */ }
    setOffline()
    return { ok: false, reason: 'no-config' }
  }

  const fetchImpl = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null)
  if (!fetchImpl) {
    setOffline()
    return { ok: false, reason: 'no-fetch' }
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timeoutMs = Math.max(250, Number(opts.timeoutMs) || 3000)
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const url = String(config.url).replace(/\/+$/, '') + '/rest/v1/rpc/get_public_ops_config'
    const response = await fetchImpl(url, {
      method: 'POST',
      cache: 'no-store',
      signal: controller?.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: config.anonKey,
        Authorization: 'Bearer ' + config.anonKey
      },
      body: '{}'
    })
    if (!response || !response.ok) {
      setOffline()
      return { ok: false, reason: 'http' }
    }
    const parsed = parsePublicOpsConfig(await response.json())
    if (!parsed) {
      setOffline()
      return { ok: false, reason: 'bad-payload' }
    }
    setRuntimeOps(parsed, 'supabase')
    return { ok: true, source: 'supabase', data: parsed }
  } catch (e) {
    setOffline()
    return { ok: false, reason: 'network' }
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export function isRemoteFeatureEnabled(key, fallback = false) {
  const value = remoteOpsState.flags?.[String(key)]
  return typeof value === 'boolean' ? value : !!fallback
}
