// Supabase 真后端适配器。
//
// 只在配置了服务器（url + anonKey）时才会被动态 import（见 index.js），
// 所以不配置 Supabase 的构建里它是独立 chunk，不进首屏。
//
// 认证模型（docs/BOOT_FLOW_DESIGN.md §6）：
//   游客   signInAnonymously()                 —— 无注册墙，进度云端保存
//   登录   signInWithPassword({email,password}) —— 会话由 supabase-js 持久化
//   注册   signUp() + set_display_name()        —— 需在 Supabase 关闭邮箱确认（注册即生效）
//   转正   updateUser({email,password})         —— 匿名账号原地升级，进度原样保留
// 服务端规则（CAS 冲突检测、成绩上限校验、榜单聚合）在
// supabase/migrations/ 的 RPC 里实现，客户端只透传。

// Supabase 错误翻译成人话（AuthScreen 直接展示）
function translateAuthError(error) {
  const msg = String(error?.message || error || '')
  if (/Invalid login credentials/i.test(msg)) return '邮箱或密码不正确'
  if (/User already registered/i.test(msg)) return '该邮箱已注册，试试登录或找回密码'
  if (/Password should be at least/i.test(msg)) return '密码长度不足（至少 6 位）'
  if (/Anonymous sign-ins are disabled/i.test(msg)) return '服务器未开放游客登录'
  if (/Email not confirmed/i.test(msg)) return '请先到邮箱点击确认链接'
  if (/unable to validate/i.test(msg)) return '邮箱格式不正确'
  if (/Failed to fetch|NetworkError/i.test(msg)) return '网络连接失败，请检查网络后重试'
  return msg || '未知错误'
}

function translateGiftError(error) {
  const msg = String(error?.message || error || '')
  if (/invalid gift code/i.test(msg)) return '礼包码无效'
  if (/gift code disabled/i.test(msg)) return '礼包码已停用'
  if (/gift code expired/i.test(msg)) return '礼包码已过期'
  if (/usage limit reached/i.test(msg)) return '礼包码兑换次数已用完'
  if (/already redeemed/i.test(msg)) return '该礼包码已兑换过'
  if (/not authenticated/i.test(msg)) return '请先登录后再兑换'
  if (/player unavailable/i.test(msg)) return '当前账号不可兑换'
  if (/save not found/i.test(msg)) return '云端存档尚未初始化，请稍后重试'
  if (/Failed to fetch|NetworkError/i.test(msg)) return '网络连接失败，请检查网络后重试'
  return msg || '兑换失败'
}

export async function createSupabaseAdapter({ url, anonKey }) {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, anonKey, {
    auth: { autoRefreshToken: true, persistSession: true }
  })

  async function currentUser() {
    const { data, error } = await sb.auth.getUser()
    if (error || !data?.user) return null
    return data.user
  }

  async function profileOf(user, session) {
    const { data } = await sb.from('players').select('display_name').eq('id', user.id).maybeSingle()
    return {
      session, // 'guest' | 'account'
      playerId: user.id,
      email: user.email || '',
      name: data?.display_name || ''
    }
  }

  async function ensurePlayerRow() {
    await sb.rpc('touch_player')
  }

  return {
    mode: 'supabase',

    // 恢复持久化会话（不发起任何登录）。无会话返回 null。
    async restoreSession() {
      const user = await currentUser()
      if (!user) return null
      await ensurePlayerRow()
      return profileOf(user, user.is_anonymous ? 'guest' : 'account')
    },

    // 游客进入：已有任意会话则复用，否则匿名注册
    async guest() {
      let user = await currentUser()
      if (!user) {
        const { error } = await sb.auth.signInAnonymously()
        if (error) throw new Error(translateAuthError(error))
        user = await currentUser()
        if (!user) throw new Error('游客登录失败：未取得用户身份')
      }
      await ensurePlayerRow()
      return profileOf(user, user.is_anonymous ? 'guest' : 'account')
    },

    async loginEmail(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw new Error(translateAuthError(error))
      const user = await currentUser()
      if (!user) throw new Error('登录失败：未取得用户身份')
      await ensurePlayerRow()
      return profileOf(user, 'account')
    },

    async registerEmail(name, email, password) {
      const { data, error } = await sb.auth.signUp({ email, password })
      if (error) throw new Error(translateAuthError(error))
      if (!data?.session) throw new Error('请先到邮箱点击确认链接后完成注册')
      const user = await currentUser()
      if (!user) throw new Error('注册失败：未取得用户身份')
      await ensurePlayerRow()
      // 昵称写 players.display_name（SQL 0002 的自助改名 RPC）
      const trimmed = String(name || '').trim()
      if (trimmed) {
        const { error: nameErr } = await sb.rpc('set_display_name', { p_name: trimmed })
        if (nameErr) throw new Error(translateAuthError(nameErr))
      }
      return profileOf(user, 'account')
    },

    // 游客转正：匿名账号原地升级为邮箱账号，进度（本机 + 云端）原样保留
    async upgradeAnonymous(email, password) {
      const user = await currentUser()
      if (!user) throw new Error('当前没有可绑定的会话，请先以游客身份进入')
      const { error } = await sb.auth.updateUser({ email, password })
      if (error) throw new Error(translateAuthError(error))
      return profileOf(user, 'account')
    },

    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email)
      if (error) throw new Error(translateAuthError(error))
      return true
    },

    async signOut() {
      await sb.auth.signOut()
    },

    async pullSave(playerId) {
      const { data, error } = await sb
        .from('saves')
        .select('data, client_rev')
        .eq('player_id', playerId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data ? { data: data.data, clientRev: Number(data.client_rev) } : null
    },

    async pushSave(playerId, saveData, clientRev) {
      const { data, error } = await sb.rpc('push_save', {
        p_data: saveData,
        p_rev: clientRev
      })
      if (error) throw new Error(error.message)
      return {
        accepted: !!data?.accepted,
        serverData: data?.server_data || null,
        serverRev: Number(data?.server_rev || 0)
      }
    },

    async reportResult(playerId, r) {
      const { data, error } = await sb.rpc('report_result', {
        p_level_id: r.levelId,
        p_stars: r.stars,
        p_score: r.score,
        p_target: r.target,
        p_coins: r.coins,
        p_duration_s: r.durationS,
        p_cleared: r.cleared
      })
      if (error) throw new Error(error.message)
      return data || { ok: false }
    },

    async redeemGiftCode(playerId, code) {
      const { data, error } = await sb.rpc('redeem_gift_code', { p_code: code })
      if (error) throw new Error(translateGiftError(error))
      if (!data?.ok) throw new Error('礼包码兑换未完成')
      return {
        ...data,
        clientRev: Number(data.client_rev) || 0,
        save: data.save || null
      }
    },

    async leaderboard(limit = 20) {
      const { data, error } = await sb.rpc('get_leaderboard', { p_limit: limit })
      if (error) throw new Error(error.message)
      return (data || []).map((row) => ({
        playerId: row.player_id,
        name: row.name,
        score: Number(row.score)
      }))
    }
  }
}
