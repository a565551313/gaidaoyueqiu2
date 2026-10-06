-- ============================================================
-- 0006 · 系统设置：管理员账号只读清单 + 管理端审计
-- 用法：Supabase Dashboard → SQL Editor → 在 0001–0005 后执行本文件。
-- 可重复执行：表 / 索引使用 if not exists，函数使用 create or replace，
-- 触发器先 drop if exists；重复执行迁移不会重复写审计记录。
--
-- 0001–0005 的实际源码没有 admin_audit 表，也没有任何 admin_* 审计写入。
-- 本迁移为所有现存管理端写操作 RPC 补上同事务审计：
--   玩家：admin_grant_coins / admin_rename_player；
--   内容：admin_save_pack / admin_publish_pack / admin_rollback_pack；
--   运营：公告新增/编辑/状态/删除、feature flag 设值/删除、礼包码新增/状态/删除。
-- 只读查询 RPC（包括 admin_level_funnel）不记审计；玩家礼包兑换不记管理员审计。
-- 原有 RPC 的参数、返回类型与对外签名均保持不变，只替换函数体以追加审计写入。
-- ============================================================

-- ============================================================
-- 1. 管理操作审计表（append-only；不给 anon/authenticated 直读直写）
-- ============================================================

create table if not exists public.admin_audit (
  id            bigint generated always as identity primary key,
  admin_id      uuid not null references public.admin_users(id) on delete restrict,
  admin_email   text not null,
  action        text not null,
  object_type   text not null,
  object_id     text,
  parameters    jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_admin_audit_created_at
  on public.admin_audit (created_at desc, id desc);
create index if not exists idx_admin_audit_admin_created_at
  on public.admin_audit (admin_id, created_at desc, id desc);
create index if not exists idx_admin_audit_action_created_at
  on public.admin_audit (action, created_at desc, id desc);

alter table public.admin_audit enable row level security;
revoke all on table public.admin_audit from PUBLIC, anon, authenticated;

-- 即使误加了有写权限的调用代码，也不能通过 UPDATE / DELETE 改写历史记录。
create or replace function public.reject_admin_audit_mutation()
returns trigger
language plpgsql set search_path = public
as $$
begin
  raise exception 'admin audit log is append-only';
end;
$$;

drop trigger if exists admin_audit_append_only on public.admin_audit;
create trigger admin_audit_append_only
  before update or delete on public.admin_audit
  for each row execute function public.reject_admin_audit_mutation();

-- 内部审计辅助函数：所有写 RPC 通过它记录 actor 快照与操作摘要。
-- 撤销 API 角色直接执行权，避免管理员从 PostgREST 伪造审计记录；
-- 调用者函数是 SECURITY DEFINER，因此仍可在同一事务内调用本函数。
create or replace function public.admin_write_audit(
  p_action text,
  p_object_type text,
  p_object_id text,
  p_parameters jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin_email text;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;

  select au.email into v_admin_email
  from public.admin_users au
  where au.id = v_admin_id;

  insert into public.admin_audit (admin_id, admin_email, action, object_type, object_id, parameters)
  values (
    v_admin_id,
    v_admin_email,
    p_action,
    p_object_type,
    p_object_id,
    coalesce(p_parameters, '{}'::jsonb)
  );
end;
$$;
revoke all on function public.admin_write_audit(text, text, text, jsonb) from PUBLIC, anon, authenticated;

-- ============================================================
-- 2. 管理员账号只读列表
-- ============================================================

create or replace function public.admin_list_admin_users()
returns table (
  id uuid,
  email text,
  role text,
  status text,
  created_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  return query
  select au.id, au.email, au.role, au.status, au.created_at
  from public.admin_users au
  order by au.created_at asc, au.email asc;
end;
$$;

-- ============================================================
-- 3. 审计日志分页查询（p_to 为不包含的上界；时间统一按 timestamptz）
-- ============================================================

create or replace function public.admin_list_audit(
  p_admin_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_action text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_action text := nullif(btrim(p_action), '');
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset int := greatest(0, least(coalesce(p_offset, 0), 1000000));
  v_total bigint;
  v_items jsonb;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  if p_from is not null and p_to is not null and p_from >= p_to then
    raise exception 'invalid audit time range';
  end if;

  select count(*)::bigint into v_total
  from public.admin_audit a
  where (p_admin_id is null or a.admin_id = p_admin_id)
    and (p_from is null or a.created_at >= p_from)
    and (p_to is null or a.created_at < p_to)
    and (v_action is null or a.action = v_action);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', page.id,
        'admin_id', page.admin_id,
        'admin_email', page.admin_email,
        'action', page.action,
        'object_type', page.object_type,
        'object_id', page.object_id,
        'parameters', page.parameters,
        'created_at', page.created_at
      ) order by page.created_at desc, page.id desc
    ),
    '[]'::jsonb
  ) into v_items
  from (
    select a.id, a.admin_id, a.admin_email, a.action,
           a.object_type, a.object_id, a.parameters, a.created_at
    from public.admin_audit a
    where (p_admin_id is null or a.admin_id = p_admin_id)
      and (p_from is null or a.created_at >= p_from)
      and (p_to is null or a.created_at < p_to)
      and (v_action is null or a.action = v_action)
    order by a.created_at desc, a.id desc
    limit v_limit offset v_offset
  ) page;

  return jsonb_build_object(
    'items', v_items,
    'totalCount', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

-- ============================================================
-- 4. 既有写操作 RPC：保持原签名与业务语义，仅追加成功操作审计
-- ============================================================

-- 补发金币：保留 0005_ops_center.sql 的奖励共用路径与原 RPC 签名，再写审计。
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

  perform public.admin_write_audit(
    'player.grant_coins',
    'player',
    p_id::text,
    jsonb_build_object(
      'amount', p_amount,
      'reason', left(coalesce(nullif(p_reason, ''), 'cs_grant'), 120),
      'coins_after', (v_result->>'coins')::bigint
    )
  );

  return jsonb_build_object('ok', true, 'coins', v_result->'coins');
end;
$$;

-- 玩家改名：保存 UPDATE 的 FOUND 值后再写审计，保持原 boolean 返回语义。
create or replace function public.admin_rename_player(p_id uuid, p_name text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_updated boolean;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.players set display_name = left(nullif(p_name, ''), 16) where id = p_id;
  v_updated := found;

  if v_updated then
    perform public.admin_write_audit(
      'player.rename',
      'player',
      p_id::text,
      jsonb_build_object('name_after', left(nullif(p_name, ''), 16))
    );
  end if;

  return v_updated;
end;
$$;

-- 保存草稿：审计只记录内容摘要（键名 / 序列化字节数 / 版本），不复制完整包数据。
create or replace function public.admin_save_pack(p_key text, p_data jsonb)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_version int;
  v_top_level_keys jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  if p_data is null then raise exception 'pack data required'; end if;

  insert into public.content_packs (key, data, version, updated_by, updated_at)
  values (p_key, p_data, 1, auth.uid(), now())
  on conflict (key) do update
  set data       = excluded.data,
      version    = content_packs.version + 1,
      updated_by = auth.uid(),
      updated_at = now()
  returning version into v_version;

  insert into public.content_pack_versions (key, version, data, updated_by, updated_at)
  values (p_key, v_version, p_data, auth.uid(), now());

  if jsonb_typeof(p_data) = 'object' then
    select coalesce(jsonb_agg(k.key_name order by k.key_name), '[]'::jsonb)
    into v_top_level_keys
    from jsonb_object_keys(p_data) as k(key_name);
  end if;

  perform public.admin_write_audit(
    'content.pack.save',
    'content_pack',
    p_key,
    jsonb_build_object(
      'version', v_version,
      'payload_bytes', octet_length(p_data::text),
      'top_level_keys', v_top_level_keys
    )
  );

  return v_version;
end;
$$;

-- 发布草稿。
create or replace function public.admin_publish_pack(p_key text)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_draft public.content_packs%rowtype;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;

  select * into v_draft from public.content_packs where key = p_key;
  if not found then raise exception 'no draft to publish'; end if;

  insert into public.content_published (key, data, version, published_by, published_at)
  values (v_draft.key, v_draft.data, v_draft.version, auth.uid(), now())
  on conflict (key) do update
  set data         = excluded.data,
      version      = excluded.version,
      published_by = auth.uid(),
      published_at = now();

  perform public.admin_write_audit(
    'content.pack.publish',
    'content_pack',
    p_key,
    jsonb_build_object('version', v_draft.version, 'payload_bytes', octet_length(v_draft.data::text))
  );

  return v_draft.version;
end;
$$;

-- 回滚：签名与 0004 完全一致；回滚出的新草稿及发布仍在同一事务内审计。
create or replace function public.admin_rollback_pack(p_key text, p_version int)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_snapshot public.content_pack_versions%rowtype;
  v_new_version int;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;

  select * into v_snapshot
  from public.content_pack_versions
  where key = p_key and version = p_version;
  if not found then raise exception 'version not found'; end if;

  insert into public.content_packs (key, data, version, updated_by, updated_at)
  values (p_key, v_snapshot.data, 1, auth.uid(), now())
  on conflict (key) do update
  set data       = excluded.data,
      version    = content_packs.version + 1,
      updated_by = auth.uid(),
      updated_at = now()
  returning version into v_new_version;

  insert into public.content_pack_versions (key, version, data, updated_by, updated_at)
  values (p_key, v_new_version, v_snapshot.data, auth.uid(), now());

  insert into public.content_published (key, data, version, published_by, published_at)
  values (p_key, v_snapshot.data, v_new_version, auth.uid(), now())
  on conflict (key) do update
  set data         = excluded.data,
      version      = excluded.version,
      published_by = auth.uid(),
      published_at = now();

  perform public.admin_write_audit(
    'content.pack.rollback',
    'content_pack',
    p_key,
    jsonb_build_object(
      'source_version', p_version,
      'new_version', v_new_version,
      'payload_bytes', octet_length(v_snapshot.data::text)
    )
  );

  return v_new_version;
end;
$$;

-- ============================================================
-- 5. 运营中心写操作审计（依赖 0005_ops_center.sql）
--    只记录参数摘要，不把公告正文或礼包奖励完整内容复制进日志。
-- ============================================================

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

  perform public.admin_write_audit(
    'ops.announcement.create',
    'announcement',
    v_row.id,
    jsonb_build_object(
      'title_chars', length(v_row.title),
      'body_chars', length(v_row.body),
      'action_label_chars', length(v_row.action_label),
      'action_url_present', v_row.action_url <> '',
      'pinned', v_row.pinned,
      'enabled', v_row.enabled,
      'starts_at', v_row.starts_at,
      'ends_at', v_row.ends_at
    )
  );
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

  perform public.admin_write_audit(
    'ops.announcement.update',
    'announcement',
    v_row.id,
    jsonb_build_object(
      'title_chars', length(v_row.title),
      'body_chars', length(v_row.body),
      'action_label_chars', length(v_row.action_label),
      'action_url_present', v_row.action_url <> '',
      'pinned', v_row.pinned,
      'enabled', v_row.enabled,
      'starts_at', v_row.starts_at,
      'ends_at', v_row.ends_at
    )
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_set_announcement_state(p_id text, p_pinned boolean, p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_updated boolean;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  update public.announcements
  set pinned = coalesce(p_pinned, false),
      enabled = coalesce(p_enabled, false),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_id;
  v_updated := found;

  if v_updated then
    perform public.admin_write_audit(
      'ops.announcement.state',
      'announcement',
      p_id,
      jsonb_build_object('pinned', coalesce(p_pinned, false), 'enabled', coalesce(p_enabled, false))
    );
  end if;
  return v_updated;
end;
$$;

create or replace function public.admin_delete_announcement(p_id text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_deleted boolean;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  delete from public.announcements where id = p_id;
  v_deleted := found;

  if v_deleted then
    perform public.admin_write_audit('ops.announcement.delete', 'announcement', p_id, '{}'::jsonb);
  end if;
  return v_deleted;
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

  perform public.admin_write_audit(
    'ops.feature_flag.set',
    'feature_flag',
    v_key,
    jsonb_build_object('enabled', v_enabled, 'description_chars', length(v_description))
  );
  return jsonb_build_object(
    'key', v_key, 'enabled', v_enabled, 'description', v_description, 'updated_at', v_updated_at
  );
end;
$$;

create or replace function public.admin_delete_feature_flag(p_key text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_deleted boolean;
  v_key text := lower(btrim(coalesce(p_key, '')));
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  delete from public.feature_flags where key = v_key;
  v_deleted := found;

  if v_deleted then
    perform public.admin_write_audit('ops.feature_flag.delete', 'feature_flag', v_key, '{}'::jsonb);
  end if;
  return v_deleted;
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
  v_reward_keys jsonb := '[]'::jsonb;
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

  select coalesce(jsonb_agg(k.key_name order by k.key_name), '[]'::jsonb)
  into v_reward_keys
  from jsonb_object_keys(v_row.reward) as k(key_name);

  perform public.admin_write_audit(
    'ops.gift_code.create',
    'gift_code',
    v_row.code,
    jsonb_build_object(
      'reward_keys', v_reward_keys,
      'reward_bytes', octet_length(v_row.reward::text),
      'use_limit', v_row.use_limit,
      'expires_at', v_row.expires_at,
      'enabled', v_row.enabled
    )
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_set_gift_code_enabled(p_code text, p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_updated boolean;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_enabled boolean := coalesce(p_enabled, false);
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  update public.gift_codes
  set enabled = v_enabled, updated_at = now()
  where code = v_code;
  v_updated := found;

  if v_updated then
    perform public.admin_write_audit(
      'ops.gift_code.state',
      'gift_code',
      v_code,
      jsonb_build_object('enabled', v_enabled)
    );
  end if;
  return v_updated;
end;
$$;

create or replace function public.admin_delete_gift_code(p_code text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_deleted boolean;
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  if exists (
    select 1 from public.gift_code_redemptions r
    where r.code = v_code
  ) then
    raise exception 'cannot delete a redeemed gift code; disable it instead';
  end if;

  delete from public.gift_codes where code = v_code;
  v_deleted := found;
  if v_deleted then
    perform public.admin_write_audit('ops.gift_code.delete', 'gift_code', v_code, '{}'::jsonb);
  end if;
  return v_deleted;
end;
$$;
