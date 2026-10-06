-- ============================================================
-- 0002 · 玩家自助昵称（启动链路 P4 注册流程，docs/BOOT_FLOW_DESIGN.md §7.4）
-- 在 SQL Editor 逐个执行本目录下的迁移文件即可（0001 已执行过则从本文件开始）。
--
-- 为什么走 RPC 而不放开 RLS 直写：players 表的 update 只给管理端
-- （admin_rename_player）；玩家改名是唯一合法的自助写入口，收敛成
-- 一个带校验的函数，避免开放整行更新（status 等字段绝不能被玩家改）。
-- ============================================================

create or replace function public.set_display_name(p_name text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_name text := left(trim(coalesce(p_name, '')), 16);
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if length(v_name) not between 4 and 12 then raise exception '昵称需要 4~12 个字'; end if;

  update public.players set display_name = v_name where id = uid;
  return found;
end;
$$;
