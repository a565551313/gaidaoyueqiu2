-- ============================================================
-- 0003 · 内容域（Phase 2 · T1，docs/PARALLEL_TASKS.md §C1 冻结契约）
-- 用法：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run。
-- 可重复执行：create table if not exists / create or replace function，
-- 幂等地补建缺失对象，不假设线上库当前状态。
--
-- 模型（与 src/admin/api/content.js 的冻结注释一致）：
--   7 个内容包（levels / materials / blocks / items / skills / pets / ants），
--   每包一份 JSONB 文档，草稿与已发布分离：
--   - content_packs          草稿区：每包一行，编辑器正在改，玩家不可见
--   - content_published      已发布区：每包一行，玩家可见
--   - content_pack_versions  历史快照：每次保存草稿落一条，回滚用
--
-- 玩家 bundle 组装在客户端做（T3）：DEFAULT_BUNDLE 打底 + 已发布包按
-- §C1 字段映射覆盖 + version 取最大发布版本；未发布字段保持打包默认。
--
-- 安全模型（沿用 0001 的 Phase 1 基线）：
--   - 三张表全部 enable RLS，且**不开任何策略**——anon / authenticated
--     无任何直读直写权限，读写一律走 RPC；
--   - 玩家侧 get_published_content 为 security definer，内容是公开数据，
--     无需鉴权（函数 EXECUTE 沿用 Postgres 默认 PUBLIC 授权，与 0001 相同）；
--   - 管理侧 admin_* 全部 security definer + 函数体内 is_admin() 把关
--     （is_admin 只认 admin_users 里 status='active' 的行，见 0001）。
-- ============================================================

-- ============================================================
-- 1. 表（§C1 冻结：表名 / 列名 / check 约束不得改）
-- ============================================================

-- 草稿区：每包一行（编辑器正在改的版本，玩家不可见）
create table if not exists public.content_packs (
  key text primary key
    check (key in ('levels','materials','blocks','items','skills','pets','ants')),
  data jsonb not null default '{}'::jsonb,
  version int not null default 0,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- 已发布区：每包一行（玩家可见）
create table if not exists public.content_published (
  key text primary key
    check (key in ('levels','materials','blocks','items','skills','pets','ants')),
  data jsonb not null,
  version int not null,
  published_by uuid,
  published_at timestamptz not null default now()
);

-- 历史快照：每次保存草稿落一条（回滚用）
create table if not exists public.content_pack_versions (
  id bigint generated always as identity primary key,
  key text not null,
  version int not null,
  data jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create index if not exists idx_content_pack_versions_key
  on public.content_pack_versions (key, version desc);

-- ============================================================
-- 2. RLS：三表全开、零策略 = anon/authenticated 无任何直读直写
--    （security definer RPC 以表主身份执行，天然绕过 RLS——
--      与 0001 的 push_save / admin_* 同一机制）
-- ============================================================

alter table public.content_packs         enable row level security;
alter table public.content_published     enable row level security;
alter table public.content_pack_versions enable row level security;

-- ============================================================
-- 3. 玩家侧 RPC（src/core/contentRemote.js 由 T3 调用）
-- ============================================================

-- 已发布内容下发：{ version, packs: { key: data } }
-- version = content_published 的最大发布版本（无发布记录时为 0，packs 为空对象，
-- 客户端按「远端 version 严格大于缓存 version 才覆盖」处理）。
create or replace function public.get_published_content()
returns jsonb
language sql security definer set search_path = public
stable
as $$
  select jsonb_build_object(
    'version', coalesce((select max(version) from public.content_published), 0),
    'packs',   coalesce((select jsonb_object_agg(key, data) from public.content_published), '{}'::jsonb)
  );
$$;

-- ============================================================
-- 4. 管理侧 RPC（src/admin/api/content.js 调用；签名冻结）
--    全部 is_admin() 鉴权，未通过 raise exception 'not admin'。
-- ============================================================

-- 包列表：7 个 key 恒全部返回（编辑器导航用）
--   status: 'empty' 无草稿 | 'draft' 草稿版本 > 已发布版本 | 'published' 草稿即已发布
--   version 取草稿/已发布中较大者；empty 行 updated_at 为 null
create or replace function public.admin_list_packs()
returns table (key text, status text, version int, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  return query
  select k.pack_key as key,
         case
           when d.key is null then 'empty'
           when d.version > coalesce(p.version, 0) then 'draft'
           else 'published'
         end as status,
         greatest(coalesce(d.version, 0), coalesce(p.version, 0)) as version,
         coalesce(d.updated_at, p.published_at) as updated_at
  from (values ('levels'), ('materials'), ('blocks'), ('items'),
               ('skills'), ('pets'), ('ants')) as k(pack_key)
  left join public.content_packs d on d.key = k.pack_key
  left join public.content_published p on p.key = k.pack_key
  order by k.pack_key;
end;
$$;

-- 取草稿：{ data, version }；无草稿返回 null（调用方用默认包打底展示）
create or replace function public.admin_get_pack(p_key text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  return (
    select jsonb_build_object('data', d.data, 'version', d.version)
    from public.content_packs d
    where d.key = p_key
  );
end;
$$;

-- 保存草稿：upsert content_packs（version+1）+ 落 content_pack_versions 快照，
-- 返回新草稿版本号；不影响已发布区。非法 key 由表上 check 约束拒绝。
create or replace function public.admin_save_pack(p_key text, p_data jsonb)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_version int;
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

  return v_version;
end;
$$;

-- 发布：当前草稿快照复制进 content_published（upsert），返回发布版本号
-- （= 草稿版本号；发布后玩家下次启动经 get_published_content 取到新内容）
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

  return v_draft.version;
end;
$$;

-- 历史版本：草稿快照按版本倒序（回滚选版用）
create or replace function public.admin_pack_history(p_key text, p_limit int default 20)
returns table (version int, data jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  return query
  select v.version, v.data, v.updated_at
  from public.content_pack_versions v
  where v.key = p_key
  order by v.version desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;
