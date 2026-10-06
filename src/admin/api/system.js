// 系统设置数据层：只读管理员目录 + 可筛选、分页的审计查询。
// 实际数据只来自 Supabase 受 is_admin() 保护的 RPC；mock 模式没有数据库管理员目录，
// 因此返回空结果并由视图明确提示，不捏造管理员或审计记录。

import { adminState, getSupabaseClient } from '../api.js'

function requireSupabaseClient() {
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase 管理员会话尚未就绪，请重新登录后重试。')
  return client
}

export async function fetchAdminAccounts() {
  if (adminState.mode !== 'supabase') return []
  const client = requireSupabaseClient()
  const { data, error } = await client.rpc('admin_list_admin_users')
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? data : []
}

export async function fetchAdminAudit({
  adminId = null,
  from = null,
  to = null,
  action = null,
  limit = 25,
  offset = 0
} = {}) {
  if (adminState.mode !== 'supabase') {
    return { items: [], totalCount: 0, limit, offset }
  }

  const client = requireSupabaseClient()
  const { data, error } = await client.rpc('admin_list_audit', {
    p_admin_id: adminId || null,
    p_from: from || null,
    p_to: to || null,
    p_action: action || null,
    p_limit: limit,
    p_offset: offset
  })
  if (error) throw new Error(error.message)

  const items = Array.isArray(data?.items) ? data.items : []
  const totalCount = Number(data?.totalCount)
  return {
    items,
    totalCount: Number.isFinite(totalCount) && totalCount >= 0 ? totalCount : 0,
    limit: Number(data?.limit) || limit,
    offset: Number(data?.offset) || 0
  }
}
