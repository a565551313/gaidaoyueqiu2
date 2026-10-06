-- ============================================================
-- 0004 · 发布中心 + 运营看板（Phase 2 · T6，docs/PARALLEL_TASKS.md T6 任务卡）
-- 用法：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run。
-- 可重复执行：create or replace function，不建表、不改已有表结构。
--
-- 背景：T6 任务卡写明「发布中心一键回滚需要 T1 补 admin_rollback_pack RPC，
-- 走集成会话加契约」——0001/0002/0003 均已随各自任务交付并可能已在线上执行，
-- 按 Supabase 迁移惯例不回头改已发布的迁移文件，因此本次新增的两个 RPC
-- 单独放一个新文件，而不是编辑 0003_content.sql。
--
-- 本文件新增两个管理侧 RPC（均 security definer + is_admin() 鉴权，未通过
-- raise exception 'not admin'，与 0001/0003 的管理端 RPC 同一套安全模型）：
--   1. admin_rollback_pack(p_key, p_version)
--      —— 内容域（0003 的 content_pack_versions）回滚：把历史快照立即变成
--         新草稿并同步发布，返回新版本号。语义 = admin_save_pack + admin_publish_pack
--         的一次性组合，草稿与已发布的版本号始终单调递增，不覆盖/删除历史行。
--   2. admin_level_funnel()
--      —— 运营看板关卡漏斗：对 0001 的 level_results 按关卡聚合
--         尝试次数 / 通关次数 / 到达人数（去重）/ 平均星级，供发布中心旁边的
--         「数据分析」页做每关流失可视化（流失率在客户端用相邻关卡到达人数算）。
-- ============================================================

-- ----------------------------------------------------------------
-- 1. 内容域：一键回滚（依赖 0003 的 content_packs / content_published /
--    content_pack_versions 三张表；若 0003 尚未执行，本函数调用时会报表不存在，
--    与 admin_save_pack/admin_publish_pack 要求的前置条件一致）。
-- ----------------------------------------------------------------
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

  -- 回滚出的内容本身也是一次「保存」：落新草稿 + 追加历史快照，版本号继续单调递增
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

  -- 一键回滚 = 回滚后立即发布，玩家下次启动经 get_published_content 拿到旧内容
  insert into public.content_published (key, data, version, published_by, published_at)
  values (p_key, v_snapshot.data, v_new_version, auth.uid(), now())
  on conflict (key) do update
  set data         = excluded.data,
      version      = excluded.version,
      published_by = auth.uid(),
      published_at = now();

  return v_new_version;
end;
$$;

-- ----------------------------------------------------------------
-- 2. 运营看板：关卡漏斗（依赖 0001 的 level_results，表已存在于线上）
-- ----------------------------------------------------------------
create or replace function public.admin_level_funnel()
returns table (
  level_id int,
  attempts bigint,
  clears bigint,
  players bigint,
  avg_stars numeric
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  return query
  select lr.level_id,
         count(*)::bigint as attempts,
         count(*) filter (where lr.cleared)::bigint as clears,
         count(distinct lr.player_id)::bigint as players,
         round(avg(lr.stars)::numeric, 2) as avg_stars
  from public.level_results lr
  group by lr.level_id
  order by lr.level_id;
end;
$$;
