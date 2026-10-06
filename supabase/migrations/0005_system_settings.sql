-- ============================================================
-- 0005 · 系统设置：管理员账号只读清单 + 管理端审计
-- 用法：Supabase Dashboard → SQL Editor → 在 0001–0004 后执行本文件。
-- 可重复执行：表 / 索引使用 if not exists，函数使用 create or replace，
-- 触发器先 drop if exists；重复执行迁移不会重复写审计记录。
--
-- 0001–0004 的实际源码没有 admin_audit 表，也没有任何 admin_* 审计写入。
-- 本迁移为所有现存管理端写操作 RPC 补上同事务审计：
--   admin_grant_coins / admin_rename_player / admin_save_pack /
--   admin_publish_pack / admin_rollback_pack。
-- 只读查询 RPC（包括 admin_level_funnel）不记审计；管理员账号管理 UI 不提供写操作。
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

-- 补发金币：签名与 0001 完全一致。
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

  insert into public.admin_audit (admin_id, admin_email, action, object_type, object_id, parameters)
  values (
    auth.uid(),
    (select au.email from public.admin_users au where au.id = auth.uid()),
    'player.grant_coins',
    'player',
    p_id::text,
    jsonb_build_object(
      'amount', p_amount,
      'reason', left(coalesce(nullif(p_reason, ''), 'cs_grant'), 120),
      'coins_after', new_coins
    )
  );

  return jsonb_build_object('ok', true, 'coins', new_coins);
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
    insert into public.admin_audit (admin_id, admin_email, action, object_type, object_id, parameters)
    values (
      auth.uid(),
      (select au.email from public.admin_users au where au.id = auth.uid()),
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

  insert into public.admin_audit (admin_id, admin_email, action, object_type, object_id, parameters)
  values (
    auth.uid(),
    (select au.email from public.admin_users au where au.id = auth.uid()),
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

  insert into public.admin_audit (admin_id, admin_email, action, object_type, object_id, parameters)
  values (
    auth.uid(),
    (select au.email from public.admin_users au where au.id = auth.uid()),
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

  insert into public.admin_audit (admin_id, admin_email, action, object_type, object_id, parameters)
  values (
    auth.uid(),
    (select au.email from public.admin_users au where au.id = auth.uid()),
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
