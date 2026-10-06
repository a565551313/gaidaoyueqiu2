-- ============================================================
-- 0005 · 运营中心（公告 / 远程开关 / 礼包码）
-- 前置：0001_init.sql（players / saves / wallet_ledger / admin_users / is_admin）
-- 执行：Supabase Dashboard → SQL Editor → 粘贴本文件全文 → Run。
-- 幂等：表、索引、函数与种子均允许重复执行；不修改已发布的旧迁移。
--
-- 本次范围明确不含 A/B 实验，也不接管无尽模式 / 排位赛的玩法开关。
-- 玩家公告与 feature flags 合并由 get_public_ops_config() 一次返回；
-- app-config.json 仍负责版本号 / 服务器状态，并作为公告 RPC 不可用时的兜底。
-- ============================================================

-- ============================================================
-- 1. 表与索引
-- ============================================================

create table if not exists public.announcements (
  id            text primary key,
  title         text not null,
  body          text not null,
  action_label  text not null default '',
  action_url    text not null default '',
  pinned        boolean not null default false,
  enabled       boolean not null default false,
  starts_at     timestamptz,
  ends_at       timestamptz,
  created_by    uuid,
  updated_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint announcements_id_nonempty check (length(btrim(id)) > 0),
  constraint announcements_title_nonempty check (length(btrim(title)) > 0),
  constraint announcements_window_valid check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index if not exists idx_announcements_public_order
  on public.announcements (enabled, pinned desc, updated_at desc);

-- 平滑迁移现有 app-config.json 中正在展示的公告：保持原 id，已读设备不会重复弹出。
-- 管理员可在后台编辑或停用；ON CONFLICT DO NOTHING 保证重跑不会覆盖运营修改。
insert into public.announcements (
  id, title, body, action_label, action_url, pinned, enabled, created_at, updated_at
) values (
  '2026-10-06-1',
  '公告通道已上线',
  '这是一条测试公告：从今天起，游戏内可以直接收到版本更新与活动通知。点下方关闭后本条不再重复出现。',
  '知道了', '', false, true, now(), now()
)
on conflict (id) do nothing;

create table if not exists public.feature_flags (
  key           text primary key,
  enabled       boolean not null default false,
  description   text not null default '',
  updated_by    uuid,
  updated_at    timestamptz not null default now(),
  constraint feature_flags_key_format check (key ~ '^[a-z][a-z0-9_]{0,63}$')
);

-- 可操作的示例开关：只验证运营配置读取链路，不绑定任何玩法。
insert into public.feature_flags (key, enabled, description)
values ('ops_demo', false, '框架示例开关：验证客户端远程读取，不连接具体玩法。')
on conflict (key) do nothing;

create table if not exists public.gift_codes (
  code          text primary key,
  reward        jsonb not null,
  use_limit     int not null,
  used_count    int not null default 0,
  expires_at    timestamptz,
  enabled       boolean not null default true,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint gift_codes_code_format check (code ~ '^[A-Z0-9][A-Z0-9-]{3,31}$'),
  constraint gift_codes_reward_object check (jsonb_typeof(reward) = 'object'),
  constraint gift_codes_use_limit_positive check (use_limit between 1 and 1000000),
  constraint gift_codes_used_count_nonnegative check (used_count >= 0)
);
create index if not exists idx_gift_codes_enabled_expiry
  on public.gift_codes (enabled, expires_at);

-- 一名玩家对同一码只可成功兑换一次；该表也是礼包兑换审计记录（含奖励快照）。
create table if not exists public.gift_code_redemptions (
  code          text not null references public.gift_codes(code) on delete restrict,
  player_id     uuid not null references public.players(id) on delete cascade,
  reward        jsonb not null,
  redeemed_at   timestamptz not null default now(),
  primary key (code, player_id)
);
create index if not exists idx_gift_code_redemptions_player
  on public.gift_code_redemptions (player_id, redeemed_at desc);

-- 所有新表开启 RLS 且不创建直读/直写策略：客户端只能走下方 RPC。
alter table public.announcements enable row level security;
alter table public.feature_flags enable row level security;
alter table public.gift_codes enable row level security;
alter table public.gift_code_redemptions enable row level security;

-- ============================================================
-- 2. 公开玩家配置 RPC：公告 + flags 一次读取
-- ============================================================

create or replace function public.get_public_ops_config()
returns jsonb
language sql security definer set search_path = public
stable
as $$
  select jsonb_build_object(
    'announcements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'title', a.title,
          'body', a.body,
          'actionLabel', a.action_label,
          'actionUrl', a.action_url,
          'pinned', a.pinned
        ) order by a.pinned desc, a.updated_at desc, a.id
      )
      from public.announcements a
      where a.enabled
        and (a.starts_at is null or a.starts_at <= now())
        and (a.ends_at is null or a.ends_at > now())
    ), '[]'::jsonb),
    'flags', coalesce((
      select jsonb_object_agg(f.key, f.enabled)
      from public.feature_flags f
    ), '{}'::jsonb)
  );
$$;

-- ============================================================
-- 3. 管理端公告 RPC（所有 admin_* 均 is_admin() 鉴权）
-- ============================================================

create or replace function public.admin_list_announcements()
returns table (
  id text, title text, body text, action_label text, action_url text,
  pinned boolean, enabled boolean, starts_at timestamptz, ends_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  return query
  select a.id, a.title, a.body, a.action_label, a.action_url,
         a.pinned, a.enabled, a.starts_at, a.ends_at, a.created_at, a.updated_at
  from public.announcements a
  order by a.pinned desc, a.updated_at desc, a.id;
end;
$$;

create or replace function public.admin_get_announcement(p_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  select jsonb_build_object(
    'id', a.id, 'title', a.title, 'body', a.body,
    'action_label', a.action_label, 'action_url', a.action_url,
    'pinned', a.pinned, 'enabled', a.enabled,
    'starts_at', a.starts_at, 'ends_at', a.ends_at,
    'created_at', a.created_at, 'updated_at', a.updated_at
  ) into v_result
  from public.announcements a where a.id = p_id;
  return v_result;
end;
$$;

create or replace function public.admin_create_announcement(
  p_id text,
  p_title text,
  p_body text,
  p_action_label text default '',
  p_action_url text default '',
  p_pinned boolean default false,
  p_enabled boolean default false,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.announcements%rowtype;
  v_id text := btrim(coalesce(p_id, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_action_url text := btrim(coalesce(p_action_url, ''));
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  if v_id = '' or length(v_id) > 80 then raise exception 'bad announcement id'; end if;
  if v_title = '' or length(v_title) > 120 then raise exception 'title must be 1..120 characters'; end if;
  if v_body = '' or length(v_body) > 4000 then raise exception 'body must be 1..4000 characters'; end if;
  if length(coalesce(p_action_label, '')) > 80 then raise exception 'action label too long'; end if;
  if v_action_url <> '' and v_action_url !~* '^https://[^[:space:]]+$' then raise exception 'action URL must use https'; end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'end time must be after start time';
  end if;

  insert into public.announcements (
    id, title, body, action_label, action_url, pinned, enabled,
    starts_at, ends_at, created_by, updated_by, created_at, updated_at
  ) values (
    v_id, v_title, v_body, btrim(coalesce(p_action_label, '')), v_action_url,
    coalesce(p_pinned, false), coalesce(p_enabled, false), p_starts_at, p_ends_at,
    auth.uid(), auth.uid(), now(), now()
  ) returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_update_announcement(
  p_id text,
  p_title text,
  p_body text,
  p_action_label text default '',
  p_action_url text default '',
  p_pinned boolean default false,
  p_enabled boolean default false,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.announcements%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_action_url text := btrim(coalesce(p_action_url, ''));
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  if p_id is null or btrim(p_id) = '' then raise exception 'bad announcement id'; end if;
  if v_title = '' or length(v_title) > 120 then raise exception 'title must be 1..120 characters'; end if;
  if v_body = '' or length(v_body) > 4000 then raise exception 'body must be 1..4000 characters'; end if;
  if length(coalesce(p_action_label, '')) > 80 then raise exception 'action label too long'; end if;
  if v_action_url <> '' and v_action_url !~* '^https://[^[:space:]]+$' then raise exception 'action URL must use https'; end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'end time must be after start time';
  end if;

  update public.announcements a
  set title = v_title,
      body = v_body,
      action_label = btrim(coalesce(p_action_label, '')),
      action_url = v_action_url,
      pinned = coalesce(p_pinned, false),
      enabled = coalesce(p_enabled, false),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      updated_by = auth.uid(),
      updated_at = now()
  where a.id = p_id
  returning * into v_row;
  if not found then raise exception 'announcement not found'; end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_set_announcement_state(p_id text, p_pinned boolean, p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  update public.announcements
  set pinned = coalesce(p_pinned, false),
      enabled = coalesce(p_enabled, false),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_id;
  return found;
end;
$$;

create or replace function public.admin_delete_announcement(p_id text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  delete from public.announcements where id = p_id;
  return found;
end;
$$;

-- ============================================================
-- 4. 管理端 feature flags RPC
-- ============================================================

create or replace function public.admin_list_feature_flags()
returns table (key text, enabled boolean, description text, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  return query
  select f.key, f.enabled, f.description, f.updated_at
  from public.feature_flags f
  order by f.key;
end;
$$;

create or replace function public.admin_set_feature_flag(p_key text, p_enabled boolean, p_description text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_key text := lower(btrim(coalesce(p_key, '')));
  v_enabled boolean;
  v_description text;
  v_updated_at timestamptz;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  if v_key !~ '^[a-z][a-z0-9_]{0,63}$' then raise exception 'bad feature flag key'; end if;
  if length(coalesce(p_description, '')) > 500 then raise exception 'description too long'; end if;

  insert into public.feature_flags (key, enabled, description, updated_by, updated_at)
  values (v_key, coalesce(p_enabled, false), btrim(coalesce(p_description, '')), auth.uid(), now())
  on conflict (key) do update
  set enabled = excluded.enabled,
      description = case when p_description is null then feature_flags.description else excluded.description end,
      updated_by = auth.uid(),
      updated_at = now()
  returning enabled, description, updated_at into v_enabled, v_description, v_updated_at;
  return jsonb_build_object(
    'key', v_key, 'enabled', v_enabled, 'description', v_description, 'updated_at', v_updated_at
  );
end;
$$;

create or replace function public.admin_delete_feature_flag(p_key text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  delete from public.feature_flags where key = lower(btrim(coalesce(p_key, '')));
  return found;
end;
$$;

-- ============================================================
-- 5. 礼包码奖励验证与统一奖励入账
-- ============================================================

-- 仅支持当前游戏已有的金币与道具库存字段；玩法效果仍由客户端既有逻辑处理。
create or replace function public.is_valid_gift_reward(p_reward jsonb)
returns boolean
language plpgsql immutable set search_path = public
as $$
declare
  v_coins numeric;
  v_item record;
  v_amount numeric;
  v_has_reward boolean := false;
begin
  if p_reward is null or jsonb_typeof(p_reward) <> 'object' then return false; end if;
  if (p_reward - 'coins' - 'items') <> '{}'::jsonb then return false; end if;
  if not (p_reward ? 'coins' or p_reward ? 'items') then return false; end if;

  if p_reward ? 'coins' then
    if jsonb_typeof(p_reward->'coins') <> 'number' then return false; end if;
    v_coins := (p_reward->>'coins')::numeric;
    if v_coins < 1 or v_coins > 1000000 or trunc(v_coins) <> v_coins then return false; end if;
    v_has_reward := true;
  end if;

  if p_reward ? 'items' then
    if jsonb_typeof(p_reward->'items') <> 'object' then return false; end if;
    for v_item in select key, value from jsonb_each(p_reward->'items') loop
      if v_item.key not in ('revive', 'auto', 'double', 'slow', 'widen', 'shield', 'comboGuard', 'bagExpand') then
        return false;
      end if;
      if jsonb_typeof(v_item.value) <> 'number' then return false; end if;
      v_amount := (v_item.value #>> '{}')::numeric;
      if v_amount < 1 or v_amount > 999 or trunc(v_amount) <> v_amount then return false; end if;
      v_has_reward := true;
    end loop;
  end if;

  return v_has_reward;
exception when others then
  return false;
end;
$$;

-- 唯一的存档奖励写入路径：锁定 saves、更新存档和 client_rev、金币写 wallet_ledger。
-- admin_grant_coins（0001 原 RPC）与 redeem_gift_code 共用本函数；对局上报继续遵循
-- 0001 report_result 的既有语义（结算金币流水 append-only，客户端已先更新本地存档）。
create or replace function public.apply_player_reward(
  p_player_id uuid, p_reward jsonb, p_reason text, p_ref_id text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_coins numeric := 0;
  v_item record;
  v_item_amount numeric;
  v_items jsonb;
  v_data jsonb;
  v_new_coins bigint;
  v_new_data jsonb;
  v_client_rev bigint;
begin
  if p_player_id is null then raise exception 'player id required'; end if;
  if p_reward is null or jsonb_typeof(p_reward) <> 'object' then raise exception 'bad reward'; end if;
  if (p_reward - 'coins' - 'items') <> '{}'::jsonb then raise exception 'unsupported reward field'; end if;
  if not (p_reward ? 'coins' or p_reward ? 'items') then raise exception 'empty reward'; end if;

  if p_reward ? 'coins' then
    if jsonb_typeof(p_reward->'coins') <> 'number' then raise exception 'bad coin reward'; end if;
    v_coins := (p_reward->>'coins')::numeric;
    if abs(v_coins) > 1000000 or trunc(v_coins) <> v_coins then raise exception 'bad coin reward'; end if;
  end if;
  if p_reward ? 'items' and jsonb_typeof(p_reward->'items') <> 'object' then raise exception 'bad item reward'; end if;

  select s.data into v_data
  from public.saves s
  where s.player_id = p_player_id
  for update;
  if not found then raise exception 'save not found'; end if;

  v_new_coins := greatest(0, coalesce((v_data->>'coins')::bigint, 0) + v_coins::bigint);
  v_new_data := jsonb_set(v_data, '{coins}', to_jsonb(v_new_coins), true);
  v_items := coalesce(v_new_data->'items', '{}'::jsonb);
  if jsonb_typeof(v_items) <> 'object' then v_items := '{}'::jsonb; end if;

  if p_reward ? 'items' then
    for v_item in select key, value from jsonb_each(p_reward->'items') loop
      if v_item.key not in ('revive', 'auto', 'double', 'slow', 'widen', 'shield', 'comboGuard', 'bagExpand') then
        raise exception 'unsupported item reward';
      end if;
      if jsonb_typeof(v_item.value) <> 'number' then raise exception 'bad item reward'; end if;
      v_item_amount := (v_item.value #>> '{}')::numeric;
      if v_item_amount < 1 or v_item_amount > 999 or trunc(v_item_amount) <> v_item_amount then
        raise exception 'bad item reward';
      end if;
      v_items := jsonb_set(
        v_items,
        array[v_item.key],
        to_jsonb(coalesce((v_items->>v_item.key)::int, 0) + v_item_amount::int),
        true
      );
    end loop;
  end if;
  v_new_data := jsonb_set(v_new_data, '{items}', v_items, true);

  update public.saves
  set data = v_new_data,
      client_rev = client_rev + 1,
      updated_at = now()
  where player_id = p_player_id
  returning data, client_rev into v_new_data, v_client_rev;

  if v_coins <> 0 then
    insert into public.wallet_ledger (player_id, delta_coins, reason, ref_id)
    values (p_player_id, v_coins::bigint, coalesce(nullif(p_reason, ''), 'reward'), p_ref_id);
  end if;
  update public.players set last_seen_at = now() where id = p_player_id;

  return jsonb_build_object(
    'ok', true,
    'coins', coalesce((v_new_data->>'coins')::bigint, 0),
    'save', v_new_data,
    'client_rev', v_client_rev
  );
end;
$$;

-- 保持 0001 的 admin_grant_coins RPC 契约，只把存档 + wallet_ledger 写入委托给共享路径。
create or replace function public.admin_grant_coins(p_id uuid, p_amount int, p_reason text default 'cs_grant')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_amount = 0 or abs(p_amount::bigint) > 1000000 then raise exception 'bad amount'; end if;

  v_result := public.apply_player_reward(
    p_id,
    jsonb_build_object('coins', p_amount),
    coalesce(nullif(p_reason, ''), 'cs_grant'),
    'admin'
  );
  return jsonb_build_object('ok', true, 'coins', v_result->'coins');
end;
$$;

-- ============================================================
-- 6. 管理端礼包码 RPC（所有 admin_* 均 is_admin() 鉴权）
-- ============================================================

create or replace function public.admin_list_gift_codes()
returns table (
  code text, reward jsonb, use_limit int, used_count int,
  expires_at timestamptz, enabled boolean, created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  return query
  select g.code, g.reward, g.use_limit, g.used_count,
         g.expires_at, g.enabled, g.created_at, g.updated_at
  from public.gift_codes g
  order by g.created_at desc, g.code;
end;
$$;

create or replace function public.admin_create_gift_code(
  p_code text, p_reward jsonb, p_use_limit int,
  p_expires_at timestamptz default null, p_enabled boolean default true
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_row public.gift_codes%rowtype;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  if v_code !~ '^[A-Z0-9][A-Z0-9-]{3,31}$' then raise exception 'bad gift code'; end if;
  if p_use_limit is null or p_use_limit < 1 or p_use_limit > 1000000 then raise exception 'bad use limit'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'expiry must be in the future'; end if;
  if not public.is_valid_gift_reward(p_reward) then raise exception 'bad gift reward'; end if;

  insert into public.gift_codes (
    code, reward, use_limit, used_count, expires_at, enabled,
    created_by, created_at, updated_at
  ) values (
    v_code, p_reward, p_use_limit, 0, p_expires_at, coalesce(p_enabled, true),
    auth.uid(), now(), now()
  ) returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_set_gift_code_enabled(p_code text, p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  update public.gift_codes
  set enabled = coalesce(p_enabled, false), updated_at = now()
  where code = upper(btrim(coalesce(p_code, '')));
  return found;
end;
$$;

create or replace function public.admin_delete_gift_code(p_code text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  if exists (
    select 1 from public.gift_code_redemptions r
    where r.code = upper(btrim(coalesce(p_code, '')))
  ) then
    raise exception 'cannot delete a redeemed gift code; disable it instead';
  end if;
  delete from public.gift_codes where code = upper(btrim(coalesce(p_code, '')));
  return found;
end;
$$;

-- ============================================================
-- 7. 玩家礼包兑换 RPC
-- ============================================================

create or replace function public.redeem_gift_code(p_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_status text;
  v_gift public.gift_codes%rowtype;
  v_result jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select p.status into v_status from public.players p where p.id = uid;
  if not found then raise exception 'player not found'; end if;
  if v_status <> 'active' then raise exception 'player unavailable'; end if;
  if v_code = '' or v_code !~ '^[A-Z0-9][A-Z0-9-]{3,31}$' then raise exception 'invalid gift code'; end if;

  -- 同一码兑换串行化：次数上限、重复兑换校验与发奖在同一事务中完成。
  select * into v_gift
  from public.gift_codes g
  where g.code = v_code
  for update;
  if not found then raise exception 'invalid gift code'; end if;
  if not v_gift.enabled then raise exception 'gift code disabled'; end if;
  if v_gift.expires_at is not null and v_gift.expires_at <= now() then raise exception 'gift code expired'; end if;
  if v_gift.used_count >= v_gift.use_limit then raise exception 'gift code usage limit reached'; end if;
  if exists (
    select 1 from public.gift_code_redemptions r
    where r.code = v_code and r.player_id = uid
  ) then
    raise exception 'gift code already redeemed';
  end if;
  if not public.is_valid_gift_reward(v_gift.reward) then raise exception 'gift reward is invalid'; end if;

  v_result := public.apply_player_reward(uid, v_gift.reward, 'gift_code', v_code);
  insert into public.gift_code_redemptions (code, player_id, reward, redeemed_at)
  values (v_code, uid, v_gift.reward, now());
  update public.gift_codes set used_count = used_count + 1, updated_at = now() where code = v_code;

  return jsonb_build_object(
    'ok', true,
    'code', v_code,
    'reward', v_gift.reward,
    'coins', v_result->'coins',
    'save', v_result->'save',
    'client_rev', v_result->'client_rev'
  );
end;
$$;

-- ============================================================
-- 8. 函数权限
-- ============================================================

-- 公告 + flags 是公开配置；游客/匿名 Supabase Auth 与登录玩家均可读。
revoke all on function public.get_public_ops_config() from public;
grant execute on function public.get_public_ops_config() to anon, authenticated;

-- 玩家兑换必须有 auth.uid()；匿名 Supabase 登录用户的 JWT role 为 authenticated。
revoke all on function public.redeem_gift_code(text) from public, anon;
grant execute on function public.redeem_gift_code(text) to authenticated;

-- 内部奖励辅助函数不可被 REST 直接调用，只能由受控的 SECURITY DEFINER RPC 使用。
revoke all on function public.apply_player_reward(uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.is_valid_gift_reward(jsonb) from public, anon, authenticated;

-- 所有运营管理 RPC 限 authenticated 角色，并在函数体内再次用 is_admin() 授权。
revoke all on function public.admin_list_announcements() from public;
grant execute on function public.admin_list_announcements() to authenticated;
revoke all on function public.admin_get_announcement(text) from public;
grant execute on function public.admin_get_announcement(text) to authenticated;
revoke all on function public.admin_create_announcement(text, text, text, text, text, boolean, boolean, timestamptz, timestamptz) from public;
grant execute on function public.admin_create_announcement(text, text, text, text, text, boolean, boolean, timestamptz, timestamptz) to authenticated;
revoke all on function public.admin_update_announcement(text, text, text, text, text, boolean, boolean, timestamptz, timestamptz) from public;
grant execute on function public.admin_update_announcement(text, text, text, text, text, boolean, boolean, timestamptz, timestamptz) to authenticated;
revoke all on function public.admin_set_announcement_state(text, boolean, boolean) from public;
grant execute on function public.admin_set_announcement_state(text, boolean, boolean) to authenticated;
revoke all on function public.admin_delete_announcement(text) from public;
grant execute on function public.admin_delete_announcement(text) to authenticated;

revoke all on function public.admin_list_feature_flags() from public;
grant execute on function public.admin_list_feature_flags() to authenticated;
revoke all on function public.admin_set_feature_flag(text, boolean, text) from public;
grant execute on function public.admin_set_feature_flag(text, boolean, text) to authenticated;
revoke all on function public.admin_delete_feature_flag(text) from public;
grant execute on function public.admin_delete_feature_flag(text) to authenticated;

revoke all on function public.admin_list_gift_codes() from public;
grant execute on function public.admin_list_gift_codes() to authenticated;
revoke all on function public.admin_create_gift_code(text, jsonb, int, timestamptz, boolean) from public;
grant execute on function public.admin_create_gift_code(text, jsonb, int, timestamptz, boolean) to authenticated;
revoke all on function public.admin_set_gift_code_enabled(text, boolean) from public;
grant execute on function public.admin_set_gift_code_enabled(text, boolean) to authenticated;
revoke all on function public.admin_delete_gift_code(text) from public;
grant execute on function public.admin_delete_gift_code(text) to authenticated;

-- 0001 的客服补金币 RPC 也改为使用统一写入路径；仍要求 is_admin()。
revoke all on function public.admin_grant_coins(uuid, int, text) from public;
grant execute on function public.admin_grant_coins(uuid, int, text) to authenticated;
