// Supabase 真后端适配器。
//
// 只在配置了 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 时才会被动态 import
// （见 index.js），所以不配置 Supabase 的构建里它是独立 chunk，不进首屏。
//
// 认证模型（Phase 1）：Supabase 匿名登录（signInAnonymously），auth.users 插入时由
// 数据库触发器在 public.players 建行 —— 玩家无感知、无注册墙，后续可平滑升级
// 手机号/微信绑定（升级路径见 docs/ADMIN_DESIGN.md §6.1）。
//
// 服务端规则（CAS 冲突检测、成绩上限校验、榜单聚合）全部在
// server/supabase/migrations/0001_init.sql 的 RPC 里实现，客户端只透传。

export async function createSupabaseAdapter({ url, anonKey }) {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, anonKey, {
    auth: { autoRefreshToken: true, persistSession: true }
  })

  let session = (await sb.auth.getSession()).data.session
  if (!session) {
    const { error } = await sb.auth.signInAnonymously()
    if (error) throw new Error(`匿名登录失败: ${error.message}`)
  }
  const { data: userData, error: userErr } = await sb.auth.getUser()
  if (userErr || !userData?.user) throw new Error(`无法取得用户身份: ${userErr?.message || 'empty'}`)
  const playerId = userData.user.id

  return {
    mode: 'supabase',

    async signIn() {
      // 确保 players 行存在（触发器兜底）并刷新 last_seen
      await sb.rpc('touch_player')
      const { data } = await sb.from('players').select('display_name').eq('id', playerId).maybeSingle()
      return { playerId, name: data?.display_name || '' }
    },

    async pullSave() {
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
