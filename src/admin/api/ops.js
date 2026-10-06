// 运营中心 API：mock 模式使用与游戏同源共享的 localStorage；Supabase 模式只调
// 0005_ops_center.sql 的 admin_* RPC（服务端每个管理函数都再检查 is_admin()）。

import { adminState, getSupabaseClient } from '../api.js'
import { readOpsStore, writeOpsStore } from '../../core/opsStore.js'
import { readStore as readCloudMockStore } from '../../core/cloud/localAdapter.js'
import { normalizeGiftReward } from '../../core/giftRewards.js'

function supabase() {
  const sb = getSupabaseClient()
  if (!sb) throw new Error('尚未登录管理员')
  return sb
}

function errorMessage(error) {
  return String(error?.message || error || '运营配置请求失败')
}

function cleanAnnouncement(input = {}) {
  const id = String(input.id || '').trim()
  const title = String(input.title || '').trim()
  const body = String(input.body || '').trim()
  const actionLabel = String(input.actionLabel || '').trim()
  const actionUrl = String(input.actionUrl || '').trim()
  if (!id) throw new Error('公告 ID 不能为空')
  if (!title || title.length > 120) throw new Error('公告标题需为 1 到 120 个字符')
  if (!body || body.length > 4000) throw new Error('公告正文需为 1 到 4,000 个字符')
  if (actionLabel.length > 80) throw new Error('按钮文案最多 80 个字符')
  if (actionUrl && !/^https:\/\//i.test(actionUrl)) throw new Error('跳转链接仅支持 https://')
  const startsAt = input.startsAt ? new Date(input.startsAt) : null
  const endsAt = input.endsAt ? new Date(input.endsAt) : null
  if (startsAt && !Number.isFinite(startsAt.getTime())) throw new Error('开始时间无效')
  if (endsAt && !Number.isFinite(endsAt.getTime())) throw new Error('结束时间无效')
  if (startsAt && endsAt && endsAt <= startsAt) throw new Error('结束时间必须晚于开始时间')
  return {
    id, title, body, actionLabel, actionUrl,
    pinned: !!input.pinned,
    enabled: !!input.enabled,
    startsAt: startsAt ? startsAt.toISOString() : null,
    endsAt: endsAt ? endsAt.toISOString() : null
  }
}

function normalizeAnnouncement(row) {
  if (!row) return null
  return {
    id: String(row.id || ''),
    title: String(row.title || ''),
    body: String(row.body || ''),
    actionLabel: String(row.actionLabel ?? row.action_label ?? ''),
    actionUrl: String(row.actionUrl ?? row.action_url ?? ''),
    pinned: !!row.pinned,
    enabled: !!row.enabled,
    startsAt: row.startsAt ?? row.starts_at ?? null,
    endsAt: row.endsAt ?? row.ends_at ?? null,
    createdAt: row.createdAt ?? row.created_at ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? null
  }
}

function normalizeFlag(row) {
  return {
    key: String(row.key || ''),
    enabled: !!row.enabled,
    description: String(row.description || ''),
    updatedAt: row.updatedAt ?? row.updated_at ?? null
  }
}

function normalizeGiftCode(row) {
  return {
    code: String(row.code || ''),
    reward: row.reward && typeof row.reward === 'object' ? row.reward : {},
    useLimit: Number(row.useLimit ?? row.use_limit ?? 0),
    usedCount: Number(row.usedCount ?? row.used_count ?? 0),
    expiresAt: row.expiresAt ?? row.expires_at ?? null,
    enabled: !!row.enabled,
    createdAt: row.createdAt ?? row.created_at ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? null
  }
}

async function rpc(name, params) {
  const { data, error } = await supabase().rpc(name, params)
  if (error) throw new Error(errorMessage(error))
  return data
}

// ---------------- 公告 ----------------
export async function listAnnouncements() {
  if (adminState.mode === 'supabase') return (await rpc('admin_list_announcements')).map(normalizeAnnouncement)
  const store = readOpsStore()
  return store.announcements.map(normalizeAnnouncement)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

export async function getAnnouncement(id) {
  if (adminState.mode === 'supabase') {
    const row = await rpc('admin_get_announcement', { p_id: String(id) })
    return normalizeAnnouncement(row)
  }
  const row = readOpsStore().announcements.find((item) => item.id === id)
  return row ? normalizeAnnouncement(row) : null
}

export async function createAnnouncement(input) {
  const row = cleanAnnouncement(input)
  if (adminState.mode === 'supabase') {
    return normalizeAnnouncement(await rpc('admin_create_announcement', {
      p_id: row.id,
      p_title: row.title,
      p_body: row.body,
      p_action_label: row.actionLabel,
      p_action_url: row.actionUrl,
      p_pinned: row.pinned,
      p_enabled: row.enabled,
      p_starts_at: row.startsAt,
      p_ends_at: row.endsAt
    }))
  }
  const store = readOpsStore()
  if (store.announcements.some((item) => item.id === row.id)) throw new Error('公告 ID 已存在')
  const now = new Date().toISOString()
  const saved = { ...row, createdAt: now, updatedAt: now }
  store.announcements.push(saved)
  writeOpsStore(store)
  return normalizeAnnouncement(saved)
}

export async function updateAnnouncement(id, input) {
  const row = cleanAnnouncement({ ...input, id })
  if (adminState.mode === 'supabase') {
    return normalizeAnnouncement(await rpc('admin_update_announcement', {
      p_id: row.id,
      p_title: row.title,
      p_body: row.body,
      p_action_label: row.actionLabel,
      p_action_url: row.actionUrl,
      p_pinned: row.pinned,
      p_enabled: row.enabled,
      p_starts_at: row.startsAt,
      p_ends_at: row.endsAt
    }))
  }
  const store = readOpsStore()
  const index = store.announcements.findIndex((item) => item.id === id)
  if (index < 0) throw new Error('公告不存在')
  store.announcements[index] = { ...store.announcements[index], ...row, updatedAt: new Date().toISOString() }
  writeOpsStore(store)
  return normalizeAnnouncement(store.announcements[index])
}

export async function setAnnouncementState(id, { pinned, enabled }) {
  if (adminState.mode === 'supabase') {
    const updated = await rpc('admin_set_announcement_state', {
      p_id: String(id), p_pinned: !!pinned, p_enabled: !!enabled
    })
    if (!updated) throw new Error('公告不存在')
    return true
  }
  const store = readOpsStore()
  const row = store.announcements.find((item) => item.id === id)
  if (!row) throw new Error('公告不存在')
  row.pinned = !!pinned
  row.enabled = !!enabled
  row.updatedAt = new Date().toISOString()
  writeOpsStore(store)
  return true
}

export async function deleteAnnouncement(id) {
  if (adminState.mode === 'supabase') {
    const deleted = await rpc('admin_delete_announcement', { p_id: String(id) })
    if (!deleted) throw new Error('公告不存在')
    return true
  }
  const store = readOpsStore()
  const next = store.announcements.filter((item) => item.id !== id)
  if (next.length === store.announcements.length) throw new Error('公告不存在')
  store.announcements = next
  writeOpsStore(store)
  return true
}

// ---------------- feature flags ----------------
export async function listFeatureFlags() {
  if (adminState.mode === 'supabase') return (await rpc('admin_list_feature_flags')).map(normalizeFlag)
  const store = readOpsStore()
  return store.featureFlags.map(normalizeFlag).sort((a, b) => a.key.localeCompare(b.key))
}

export async function saveFeatureFlag({ key, enabled, description = '' }) {
  const normalizedKey = String(key || '').trim().toLowerCase()
  const normalizedDescription = String(description || '').trim()
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(normalizedKey)) throw new Error('开关 key 需符合 [a-z][a-z0-9_]{0,63}')
  if (normalizedDescription.length > 500) throw new Error('说明最多 500 个字符')
  if (adminState.mode === 'supabase') {
    return normalizeFlag(await rpc('admin_set_feature_flag', {
      p_key: normalizedKey, p_enabled: !!enabled, p_description: normalizedDescription
    }))
  }
  const store = readOpsStore()
  const now = new Date().toISOString()
  const current = store.featureFlags.find((flag) => flag.key === normalizedKey)
  const updated = { key: normalizedKey, enabled: !!enabled, description: normalizedDescription, updatedAt: now }
  if (current) Object.assign(current, updated)
  else store.featureFlags.push(updated)
  writeOpsStore(store)
  return normalizeFlag(updated)
}

export async function deleteFeatureFlag(key) {
  if (adminState.mode === 'supabase') {
    const deleted = await rpc('admin_delete_feature_flag', { p_key: String(key) })
    if (!deleted) throw new Error('开关不存在')
    return true
  }
  const store = readOpsStore()
  const next = store.featureFlags.filter((flag) => flag.key !== key)
  if (next.length === store.featureFlags.length) throw new Error('开关不存在')
  store.featureFlags = next
  writeOpsStore(store)
  return true
}

// ---------------- 礼包码 ----------------
export async function listGiftCodes() {
  if (adminState.mode === 'supabase') return (await rpc('admin_list_gift_codes') || []).map(normalizeGiftCode)
  const store = readOpsStore()
  const redemptions = readCloudMockStore().giftRedemptions || {}
  return store.giftCodes.map((row) => normalizeGiftCode({
    ...row,
    usedCount: Math.max(Number(row.usedCount) || 0, (redemptions[row.code] || []).length)
  })).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
}

export async function createGiftCode(input = {}) {
  const code = String(input.code || '').trim().toUpperCase()
  const reward = normalizeGiftReward(input.reward)
  const useLimit = Number(input.useLimit)
  if (!/^[A-Z0-9][A-Z0-9-]{3,31}$/.test(code)) throw new Error('礼包码需为 4 到 32 位大写字母、数字或连字符')
  if (!Number.isInteger(useLimit) || useLimit < 1 || useLimit > 1000000) throw new Error('兑换次数上限需为 1 到 1,000,000')
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
  if (expiresAt && !Number.isFinite(expiresAt.getTime())) throw new Error('过期时间无效')
  if (expiresAt && expiresAt <= new Date()) throw new Error('过期时间必须晚于当前时间')
  const expiry = expiresAt ? expiresAt.toISOString() : null
  if (adminState.mode === 'supabase') {
    return normalizeGiftCode(await rpc('admin_create_gift_code', {
      p_code: code, p_reward: reward, p_use_limit: useLimit,
      p_expires_at: expiry, p_enabled: input.enabled !== false
    }))
  }
  const store = readOpsStore()
  if (store.giftCodes.some((item) => item.code === code)) throw new Error('礼包码已存在')
  const now = new Date().toISOString()
  const saved = {
    code, reward, useLimit, usedCount: 0, expiresAt: expiry,
    enabled: input.enabled !== false, createdAt: now, updatedAt: now
  }
  store.giftCodes.push(saved)
  writeOpsStore(store)
  return normalizeGiftCode(saved)
}

export async function setGiftCodeEnabled(code, enabled) {
  const normalizedCode = String(code || '').trim().toUpperCase()
  if (adminState.mode === 'supabase') {
    const updated = await rpc('admin_set_gift_code_enabled', { p_code: normalizedCode, p_enabled: !!enabled })
    if (!updated) throw new Error('礼包码不存在')
    return true
  }
  const store = readOpsStore()
  const row = store.giftCodes.find((item) => item.code === normalizedCode)
  if (!row) throw new Error('礼包码不存在')
  row.enabled = !!enabled
  row.updatedAt = new Date().toISOString()
  writeOpsStore(store)
  return true
}

export async function deleteGiftCode(code) {
  const normalizedCode = String(code || '').trim().toUpperCase()
  if (adminState.mode === 'supabase') {
    const deleted = await rpc('admin_delete_gift_code', { p_code: normalizedCode })
    if (!deleted) throw new Error('礼包码不存在')
    return true
  }
  const store = readOpsStore()
  const cloudRedemptions = readCloudMockStore().giftRedemptions?.[normalizedCode] || []
  if ((store.redemptions[normalizedCode] || []).length || cloudRedemptions.length) throw new Error('已有玩家兑换，请停用而不要删除')
  const next = store.giftCodes.filter((item) => item.code !== normalizedCode)
  if (next.length === store.giftCodes.length) throw new Error('礼包码不存在')
  store.giftCodes = next
  writeOpsStore(store)
  return true
}
