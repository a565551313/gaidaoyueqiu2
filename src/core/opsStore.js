// 同源本地模拟运营配置（仅开发 / 无 Supabase 时使用）。
// 数据格式刻意与公开 get_public_ops_config() 的 announcements + flags 对齐；
// Supabase 模式始终以服务端 RPC 为准，不把本地配置当作线上数据。

export const OPS_STORE_KEY = 'gaidaoyueqiu2:ops:v1'

export function defaultOpsStore() {
  return {
    announcements: [],
    featureFlags: [{
      key: 'ops_demo',
      enabled: false,
      description: '框架示例开关：验证客户端远程读取，不连接具体玩法。',
      updatedAt: '1970-01-01T00:00:00.000Z'
    }],
    giftCodes: [],
    redemptions: {}
  }
}

export function normalizeOpsStore(value) {
  const defaults = defaultOpsStore()
  const store = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const featureFlags = Array.isArray(store.featureFlags) ? store.featureFlags.filter((row) => row && typeof row === 'object') : []
  if (!featureFlags.some((flag) => flag.key === 'ops_demo')) featureFlags.push(defaults.featureFlags[0])
  return {
    announcements: Array.isArray(store.announcements) ? store.announcements.filter((row) => row && typeof row === 'object') : [],
    featureFlags,
    giftCodes: Array.isArray(store.giftCodes) ? store.giftCodes.filter((row) => row && typeof row === 'object') : [],
    redemptions: store.redemptions && typeof store.redemptions === 'object' && !Array.isArray(store.redemptions)
      ? store.redemptions
      : {}
  }
}

export function readOpsStore(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage || typeof storage.getItem !== 'function') return defaultOpsStore()
  try {
    const raw = storage.getItem(OPS_STORE_KEY)
    return raw ? normalizeOpsStore(JSON.parse(raw)) : defaultOpsStore()
  } catch (e) {
    return defaultOpsStore()
  }
}

export function writeOpsStore(store, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage || typeof storage.setItem !== 'function') throw new Error('本机存储不可用')
  storage.setItem(OPS_STORE_KEY, JSON.stringify(normalizeOpsStore(store)))
}
