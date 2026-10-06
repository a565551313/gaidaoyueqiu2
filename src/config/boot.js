// 启动链路配置（docs/BOOT_FLOW_DESIGN.md §7.1 与 docs/PARALLEL_TASKS.md §C2）。

export const BOOT_CONFIG = Object.freeze({
  // LOGO 展示页时长（毫秒）；点击/按键可随时跳过
  splashMsFirst: 1800, // 首次（本机无任何云端会话记忆）
  splashMsReturning: 1200, // 回访
  // 唯一服务器时自动跳过选服页（更新页仍会闪现服务器名）
  autoSkipServerWhenSingle: true,
  // 远端 app-config 地址（版本检查/公告/服务器状态）。null = 跳过版本检查步骤
  appConfigUrl: null,
  // 合规链接（docs/legal/ 占位，发行前补真实文本）
  legal: Object.freeze({
    agreementUrl: '/legal/agreement.html',
    privacyUrl: '/legal/privacy.html'
  })
})

export const NOTICE_KEY = 'gaidaoyueqiu2:notice:v1'

/**
 * 版本号比较纯函数 cmpVersion(a, b)
 * 返回值：a > b 返回 1，a === b 返回 0，a < b 返回 -1
 */
export function cmpVersion(a, b) {
  if (a === b) return 0
  const cleanA = String(a || '').trim().replace(/^v/i, '')
  const cleanB = String(b || '').trim().replace(/^v/i, '')
  if (!cleanA && !cleanB) return 0
  if (!cleanA) return -1
  if (!cleanB) return 1
  const pa = cleanA.split('.').map((x) => parseInt(x, 10) || 0)
  const pb = cleanB.split('.').map((x) => parseInt(x, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

/**
 * 解析并校验 app-config JSON / 对象
 * 容错：缺必需字段 (latestVersion / minVersion) 或 JSON 损坏一律返回 null
 */
export function parseAppConfig(input) {
  if (!input) return null
  let data = input
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input)
    } catch (e) {
      return null
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  if (typeof data.latestVersion !== 'string' || typeof data.minVersion !== 'string') {
    return null
  }
  const latestVersion = data.latestVersion.trim()
  const minVersion = data.minVersion.trim()
  if (!latestVersion || !minVersion) return null

  let notice = null
  if (data.notice && typeof data.notice === 'object' && !Array.isArray(data.notice)) {
    if (data.notice.id && data.notice.title) {
      notice = {
        id: String(data.notice.id),
        title: String(data.notice.title),
        body: String(data.notice.body || ''),
        actionLabel: data.notice.actionLabel ? String(data.notice.actionLabel) : '',
        actionUrl: data.notice.actionUrl ? String(data.notice.actionUrl) : ''
      }
    }
  }

  let servers = []
  if (Array.isArray(data.servers)) {
    servers = data.servers
      .filter((s) => s && typeof s === 'object' && s.id && s.status)
      .map((s) => ({ id: String(s.id), status: String(s.status) }))
  }

  return {
    latestVersion,
    minVersion,
    notice,
    servers
  }
}

/**
 * 获取本地已读的公告 ID
 */
export function getReadNoticeId() {
  try {
    return (typeof localStorage !== 'undefined' && localStorage.getItem(NOTICE_KEY)) || null
  } catch (e) {
    return null
  }
}

/**
 * 标记公告已读
 */
export function markNoticeRead(id) {
  try {
    if (typeof localStorage !== 'undefined' && id) {
      localStorage.setItem(NOTICE_KEY, String(id))
    }
  } catch (e) { /* ignore */ }
}

/**
 * 判断公告是否需要展示（notice.id 与本地记录不同）
 */
export function shouldShowNotice(notice) {
  if (!notice || !notice.id) return false
  const readId = getReadNoticeId()
  return readId !== String(notice.id)
}
