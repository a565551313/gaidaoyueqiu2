-- ============================================================
-- 《盖到月球2》Phase 1 数据库初始化（Supabase / PostgreSQL 15+）
-- 用法：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run。
-- 设计文档：docs/ADMIN_DESIGN.md（数据模型 §5 / API §6 / 防作弊 §11）
--
-- 与客户端的契约（改动必须两边同步）：
--   - 存档结构与 src/core/storage.js 的 defaultSave() 同构（整档 JSONB）
--   - CAS 冲突规则：src/core/cloud/merge.js（push_save RPC 实现同一语义）
--   - 成绩校验规则：merge.js 的 validateResult（report_result 实现同一套数值）
--     理论满分 ≈ 目标层数 × 初始宽度（宽度上限含加宽卡/磐石根基约 144），
--     服务端留余量取 ×300 作硬顶，只拦“物理上不可能”的成绩。
-- ============================================================

-- ---------- 扩展 ----------
create extension if not exists pgcrypto;

-- ============================================================
-- 1. 表
-- ============================================================

-- 玩家：Supabase 匿名认证的 auth.users 一一对应
create table if not exists public.players (
  id            uuid primary key,                    -- = auth.users.id（触发器写入）
  display_name  text not null default '月球访客',
  status        text not null default 'active',      -- active | banned | deleted
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

-- 云存档：整档快照 + 单调 client_rev（LWW 的比较依据）
create table if not exists public.saves (
  player_id     uuid primary key references public.players(id) on delete cascade,
  data          jsonb not null,
  client_rev    bigint not null default 0,
  updated_at    timestamptz not null default now()
);

-- 对局结果：榜单与漏斗分析的数据源（append-only）
create table if not exists public.level_results (
  id            bigserial primary key,
  player_id     uuid not null references public.players(id) on delete cascade,
  level_id      int  not null check (level_id > 0),
  stars         smallint not null check (stars between 0 and 3),
  score         bigint  not null check (score >= 0),
  coins         bigint  not null default 0,
  duration_s    int     not null default 0,
  cleared       boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_results_player on public.level_results (player_id, created_at desc);
create index if not exists idx_results_level  on public.level_results (level_id, created_at desc);

-- 金币流水（append-only，客服补发/对局获得的唯一事实源；Phase 2 对账用）
create table if not exists public.wallet_ledger (
  id            bigserial primary key,
  player_id     uuid not null references public.players(id) on delete cascade,
  delta_coins   bigint not null,
  reason        text not null,
  ref_id        text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_ledger_player on public.wallet_ledger (player_id, created_at desc);

-- 行为埋点（Phase 1 建表备用；客户端批量上报在 Phase 1 末接入）
create table if not exists public.events (
  id            bigserial primary key,
  player_id     uuid references public.players(id) on delete set null,
  name          text not null,
  props         jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists idx_events_name on public.events (name, created_at desc);

-- 管理员名单：允许哪些 Supabase 账号调用 admin_* RPC
-- （管理员账号 = Authentication → Users 里创建的 email/password 用户，再把其 uid 登记到这里）
create table if not exists public.admin_users (
  id            uuid primary key,                    -- = auth.users.id
  email         text not null,
  role          text not null default 'viewer',      -- super | designer | ops | cs | viewer
  status        text not null default 'active',
  created_at    timestamptz not null default now()
);

-- ---------- auth.users → players 触发器 ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.players (id, display_name)
  values (new.id, '月球访客#' || right(new.id::text, 4))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 2. RLS（玩家只能读写自己的数据；榜单聚合走 security definer RPC）
-- ============================================================

alter table public.players       enable row level security;
alter table public.saves         enable row level security;
alter table public.level_results enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.events        enable row level security;
alter table public.admin_users   enable row level security;

drop policy if exists players_select_own on public.players;
create policy players_select_own on public.players
  for select using (id = auth.uid());

drop policy if exists players_update_own_name on public.players;
create policy players_update_own_name on public.players
  for update using (id = auth.uid()) with check (id = auth.uid());
-- 注：display_name 之外的字段（status 等）只有 admin RPC（security definer）能改。

drop policy if exists saves_own on public.saves;
create policy saves_own on public.saves
  for all using (player_id = auth.uid()) with check (player_id = auth.uid());

drop policy if exists results_insert_own on public.level_results;
create policy results_insert_own on public.level_results
  for insert with check (player_id = auth.uid());

drop policy if exists results_select_own on public.level_results;
create policy results_select_own on public.level_results
  for select using (player_id = auth.uid());

drop policy if exists ledger_insert_own on public.wallet_ledger;
create policy ledger_insert_own on public.wallet_ledger
  for insert with check (player_id = auth.uid());

drop policy if exists ledger_select_own on public.wallet_ledger;
create policy ledger_select_own on public.wallet_ledger
  for select using (player_id = auth.uid());

drop policy if exists events_insert_own on public.events;
create policy events_insert_own on public.events
  for insert with check (player_id = auth.uid() or player_id is null);

-- ============================================================
-- 3. 玩家端 RPC（src/core/cloud/supabaseAdapter.js 调用）
-- ============================================================

-- 刷新 last_seen（并兜底确保 players 行存在）
create or replace function public.touch_player()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.players (id) values (auth.uid())
  on conflict (id) do update set last_seen_at = now();
end;
$$;

-- 整档推送（CAS）：client_rev 不大于服务端已有 rev 即拒绝，返回服务端版本
-- 语义与 src/core/cloud/localAdapter.js 的 pushSave 完全一致。
create or replace function public.push_save(p_data jsonb, p_rev bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing_rev bigint;
  existing_data jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select client_rev, data into existing_rev, existing_data
  from public.saves where player_id = uid;

  if existing_rev is not null and p_rev <= existing_rev then
    return jsonb_build_object(
      'accepted', false,
      'server_data', existing_data,
      'server_rev', existing_rev
    );
  end if;

  insert into public.saves (player_id, data, client_rev)
  values (uid, p_data, p_rev)
  on conflict (player_id)
  do update set data = p_data, client_rev = p_rev, updated_at = now();

  update public.players set last_seen_at = now() where id = uid;

  return jsonb_build_object('accepted', true, 'server_rev', p_rev);
end;
$$;

-- 对局结果上报（服务端校验：merge.js validateResult 同一套数值规则）
create or replace function public.report_result(
  p_level_id int, p_stars int, p_score bigint, p_target int,
  p_coins bigint, p_duration_s int, p_cleared boolean
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_stars smallint;
  v_score bigint;
  v_target int;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  v_stars := greatest(0, least(3, coalesce(p_stars, 0)));
  v_score := greatest(0, coalesce(p_score, 0));
  v_target := greatest(1, coalesce(p_target, 1));

  -- 理论满分硬顶（SCORE_CAP_PER_TARGET = 300，见 merge.js）
  if v_score > v_target * 300 then
    return jsonb_build_object('ok', false, 'reason', 'score over theoretical cap');
  end if;

  insert into public.level_results (player_id, level_id, stars, score, coins, duration_s, cleared)
  values (uid, p_level_id, v_stars, v_score, greatest(0, coalesce(p_coins, 0)),
          greatest(0, coalesce(p_duration_s, 0)), coalesce(p_cleared, false));

  if coalesce(p_coins, 0) > 0 then
    insert into public.wallet_ledger (player_id, delta_coins, reason, ref_id)
    values (uid, p_coins, 'level_clear', p_level_id::text);
  end if;

  update public.players set last_seen_at = now() where id = uid;

  return jsonb_build_object('ok', true);
end;
$$;

-- 线上榜单：每玩家各关最高分求和（与游戏本地口径一致）
create or replace function public.get_leaderboard(p_limit int default 20)
returns table (player_id uuid, name text, score bigint)
language sql security definer set search_path = public
stable
as $$
  select best.player_id,
         p.display_name as name,
         sum(best.score)::bigint as score
  from (
    select player_id, level_id, max(score) as score
    from public.level_results
    group by player_id, level_id
  ) best
  join public.players p on p.id = best.player_id and p.status = 'active'
  group by best.player_id, p.display_name
  order by sum(best.score) desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

-- ============================================================
-- 4. 管理端 RPC（src/admin/api.js 调用；is_admin() 鉴权 + 全部可审计）
--    生产加固（VPN/白名单/操作审计表）见 ADMIN_DESIGN §15，Phase 3 落地。
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_users
    where id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.admin_list_users(p_q text default '', p_limit int default 50)
returns table (
  id uuid, name text, coins bigint, total_stars bigint,
  unlocked int, results bigint, last_seen_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select p.id,
         p.display_name as name,
         coalesce((s.data->>'coins')::bigint, 0) as coins,
         coalesce((
           select sum((kv.value)::int) from jsonb_each_text(coalesce(s.data->'stars', '{}'::jsonb)) kv
         ), 0) as total_stars,
         coalesce((s.data->>'unlocked')::int, 1) as unlocked,
         (select count(*) from public.level_results lr where lr.player_id = p.id) as results,
         p.last_seen_at
  from public.players p
  left join public.saves s on s.player_id = p.id
  where p_q = ''
     or p.display_name ilike '%' || p_q || '%'
     or p.id::text ilike '%' || p_q || '%'
  order by p.last_seen_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

create or replace function public.admin_get_user(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'player', row_to_json(p),
    'save', s.data,
    'clientRev', s.client_rev,
    'results', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select level_id as "levelId", stars, score, coins, cleared, created_at as "at"
        from public.level_results where player_id = p_id
        order by created_at desc limit 30
      ) x
    ),
    'ledger', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select delta_coins as "deltaCoins", reason, created_at as "at"
        from public.wallet_ledger where player_id = p_id
        order by created_at desc limit 20
      ) x
    )
  ) into result
  from public.players p
  left join public.saves s on s.player_id = p.id
  where p.id = p_id;

  if result is null then raise exception 'player not found'; end if;
  return result;
end;
$$;

-- 补发金币：改云存档副本 + 抬 rev + 记流水（客户端下次同步按 LWW 拿到新余额）
create or replace function public.admin_grant_coins(p_id uuid, p_amount int, p_reason text default 'cs_grant')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  new_coins bigint;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_amount = 0 or abs(p_amount) > 1000000 then raise exception 'bad amount'; end if;

  update public.saves
  set data = jsonb_set(data, '{coins}', to_jsonb(greatest(0, coalesce((data->>'coins')::int, 0) + p_amount))),
      client_rev = client_rev + 1,
      updated_at = now()
  where player_id = p_id
  returning (data->>'coins')::bigint into new_coins;

  if new_coins is null then raise exception 'save not found'; end if;

  insert into public.wallet_ledger (player_id, delta_coins, reason, ref_id)
  values (p_id, p_amount, coalesce(nullif(p_reason, ''), 'cs_grant'), 'admin');

  return jsonb_build_object('ok', true, 'coins', new_coins);
end;
$$;

create or replace function public.admin_rename_player(p_id uuid, p_name text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.players set display_name = left(nullif(p_name, ''), 16) where id = p_id;
  return found;
end;
$$;

create or replace function public.admin_dashboard()
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'playerCount', (select count(*) from public.players where status = 'active'),
    'resultCount', (select count(*) from public.level_results),
    'totalCoins', (select coalesce(sum((data->>'coins')::bigint), 0) from public.saves),
    'top', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select player_id as "playerId", name, score from public.get_leaderboard(5)
      ) x
    ),
    'recent', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select p.display_name as player, lr.level_id as "levelId", lr.stars, lr.score, lr.created_at as "at"
        from public.level_results lr join public.players p on p.id = lr.player_id
        order by lr.created_at desc limit 8
      ) x
    )
  );
end;
$$;

-- ============================================================
-- 5. 管理员登记（示例：把自己的 Supabase 账号设为超管）
--    ① Dashboard → Authentication → Add user → 创建 email/password 账号
--    ② 复制该账号的 UID，替换下面注释里的 <ADMIN_UID> 并执行：
--
--    insert into public.admin_users (id, email, role)
--    values ('<ADMIN_UID>'::uuid, 'you@example.com', 'super');
-- ============================================================
