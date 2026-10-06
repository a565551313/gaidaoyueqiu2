-- ============================================================
-- 0004 · 发布中心与运营看板（Phase 2 · T6）
-- 用法：在已执行 0001_init.sql 与 0003_content.sql 的 Supabase 项目中，
-- 将本文件全文粘进 SQL Editor 执行。
--
-- 新增两个只经 admin_* RPC 暴露的能力：
--   1) admin_rollback_pack：从内容历史快照创建一个新的草稿版本并立即发布；
--      绝不把版本号倒退，保证玩家端「远端版本严格大于缓存才覆盖」仍能接收回滚。
--   2) admin_level_funnel：按关聚合 level_results，供运营后台展示通关人数 / 尝试次数 / 流失。
--
-- 两个函数均 security definer + 0001 的 is_admin() 鉴权，且可重复执行。
-- ============================================================

-- ============================================================
-- 1. 内容包一键回滚
-- ============================================================
create or replace function public.admin_rollback_pack(p_key text, p_version int)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_data jsonb;
  v_version int;
  v_global_version int;
  v_pack_version int;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  if p_key not in ('levels', 'materials', 'blocks', 'items', 'skills', 'pets', 'ants') then
    raise exception 'unknown pack';
  end if;
  if p_version is null or p_version < 1 then
    raise exception 'invalid history version';
  end if;

  -- 每次 admin_save_pack 都会写历史；同一 key/version 理应唯一。
  select h.data into v_data
  from public.content_pack_versions h
  where h.key = p_key and h.version = p_version
  order by h.updated_at desc, h.id desc
  limit 1;

  if v_data is null then raise exception 'history version not found'; end if;

  -- 将旧快照保存成一个"新的"草稿版本，而不是将版本号回退。
  -- get_published_content 的 bundle version 是所有已发布包版本的最大值；因此回滚时
  -- 必须越过这个全局高水位，而不能只把当前 pack 的局部版本 +1。否则另一个包的
  -- 更高版本会使玩家端把本次回滚误判为旧缓存而忽略。
  select coalesce(max(version), 0) into v_global_version from public.content_published;
  select version into v_pack_version from public.content_packs where key = p_key;
  v_version := greatest(v_global_version, coalesce(v_pack_version, 0)) + 1;

  insert into public.content_packs (key, data, version, updated_by, updated_at)
  values (p_key, v_data, v_version, auth.uid(), now())
  on conflict (key) do update
  set data       = excluded.data,
      version    = v_version,
      updated_by = auth.uid(),
      updated_at = now()
  returning version into v_version;

  insert into public.content_pack_versions (key, version, data, updated_by, updated_at)
  values (p_key, v_version, v_data, auth.uid(), now());

  -- 回滚是一个原子操作：同一事务中让新草稿立即成为玩家可见版本。
  insert into public.content_published (key, data, version, published_by, published_at)
  values (p_key, v_data, v_version, auth.uid(), now())
  on conflict (key) do update
  set data         = excluded.data,
      version      = excluded.version,
      published_by = auth.uid(),
      published_at = now();

  return v_version;
end;
$$;

-- ============================================================
-- 2. 关卡漏斗（level_results 是 append-only 对局事实源）
-- ============================================================
-- 流失口径：在统计期内尝试过此关、但在同一统计期内没有任何 cleared=true 对局的去重玩家。
-- attempts 保留所有对局记录，因而反复挑战会准确体现在尝试次数上。
create or replace function public.admin_level_funnel(p_days int default 30)
returns table (
  level_id int,
  started_players bigint,
  attempts bigint,
  cleared_players bigint,
  dropoffs bigint,
  clear_rate numeric
)
language plpgsql security definer set search_path = public
stable
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 3650));
begin
  if not public.is_admin() then raise exception 'not admin'; end if;

  return query
  select
    lr.level_id,
    count(distinct lr.player_id)::bigint as started_players,
    count(*)::bigint as attempts,
    (count(distinct lr.player_id) filter (where lr.cleared))::bigint as cleared_players,
    greatest(
      count(distinct lr.player_id) - (count(distinct lr.player_id) filter (where lr.cleared)),
      0
    )::bigint as dropoffs,
    case when count(distinct lr.player_id) = 0 then 0::numeric
      else round(
        (count(distinct lr.player_id) filter (where lr.cleared))::numeric
        / count(distinct lr.player_id)::numeric,
        4
      )
    end as clear_rate
  from public.level_results lr
  where lr.created_at >= now() - make_interval(days => v_days)
  group by lr.level_id
  order by lr.level_id;
end;
$$;
