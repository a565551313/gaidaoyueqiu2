# Phase 2 并行任务分工（给多个 AI 同时开工用）

> **本文档的用法**：每张任务卡开头有一句【派活指令】，原样复制发给一个 AI 会话即可开工。
> 卡里写清了目标、独占文件、红线、验收命令——被派工的 AI 只需要照卡执行。
> 多张卡可以同时派（见 §3 波次）；所有卡完成后回到主会话做集成（§6）。

---

## 1. 基线快照（每个任务开工前必读）

| 项 | 值 |
|---|---|
| 仓库 | `github.com/a565551313/gaidaoyueqiu2` |
| **分支基点** | `arena/c3417b52-gaidaoyueqiu2`（PR #11，**由用户手动合并、时机自定**），基点 commit `59291cc`；若 PR #11 已并入 master，则改从 `origin/master` 切分支（内容一致，以先看到的为准） |
| 已完成 | Phase 1 后台骨架 / Phase 0 内容数据化 / 启动链路第一批（含视觉重做）/ T0 并行脚手架 |
| 回归基线 | `npm run test:all` **15 套全绿**（约 4 分钟，跑前先 `npm install`） |
| Supabase 线上 | 项目 `sptaayelyiqrbppgvjcv`；迁移 0001/0002 已执行；**邮箱确认已关**；匿名登录已开 |
| Vercel | env `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`（Config 类型），已部署 |
| 管理员账号 | **未建**（三步建号见本文档 §7 之后「附：管理员账号建号步骤」，同 docs/ADMIN_SETUP.md） |
| 线上 SQL | 一律由**用户在 Supabase SQL Editor 手动执行**，AI 没有线上库权限 |

## 2. 通用纪律（派活时原样贴在指令后面）

1. 从 `arena/c3417b52-gaidaoyueqiu2` 切出自己的分支（命名 `arena/T<编号>-<任意后缀>`；若 PR #11 已并入 master 则从 `origin/master` 切），**只推自己的分支**；禁止动 `master`、禁止合并 PR #11、禁止切换到别人的分支。
2. 只修改任务卡「独占文件」列出的文件；其余文件一律只读。发现别的文件有问题 → 在 PR 描述里报告，不要顺手修。
3. 不新增 npm 依赖；不改 `vite.config.js`；不动 `.gitignore`。
4. 新增测试脚本时：在 `package.json` 加**独立单行** script（不串联进 `test:all`，串联由集成会话统一做）。
5. 完成标准：卡内「验收」全部通过 **且** `npm run test:all` 15 套全绿（约 4 分钟）。
6. 提交信息格式 `<T编号>: <做了什么>`；一个任务一个 PR，PR 的 base 选 `arena/c3417b52-gaidaoyueqiu2`。
7. 对契约（§4）有异议 → 停下来在 PR 描述里说明，不得单方面改契约。
8. 文档/注释里声明的事实必须基于源码实测，不许臆测。

## 3. 依赖图与波次

```
T0 脚手架 ✅ 已完成（846ce8d，含内容层契约冻结 + verify-admin）

Wave 1（三张卡互不接触，可同时派）：
  T1 内容域数据库迁移（纯 SQL）
  T2 启动链第二批·公告与强更（玩家侧）
  T3 玩家侧远端内容握手

Wave 2（随时可开工写代码；联调需要 T1 的 SQL 已由用户执行）：
  T4 管理端·内容工厂 UI（7 个内容包编辑器）
  T5 管理端·关卡编辑器（8 章 56 关）

Wave 3（可选 / 暂缓，等用户配合）：
  T6 发布中心 + 运营看板（可选）
  T7 第三方登录 + 测试服（暂缓：需用户先在 Supabase 开 OAuth provider）
```

集成顺序（§6）：T1 → T3 → T2 → T4 → T5。

---

## 4. 冻结契约（任何任务不得单方面修改）

### C1 · 内容域数据模型（T1 实现；T3/T4/T5 消费）

**7 个内容包**，包 key 与玩家 bundle 字段的映射（`src/core/content.js` 的 `DEFAULT_BUNDLE` 顶层字段）：

| 包 key | 覆盖的 bundle 字段 | 编辑器归属 |
|---|---|---|
| `levels` | `chapters`, `levels` | T5 |
| `materials` | `materials` | T4 |
| `blocks` | `blockTypes`, `statSpecs` | T4 |
| `items` | `items`, `bag` | T4 |
| `skills` | `skills` | T4 |
| `pets` | `pets`, `petStarCosts` | T4 |
| `ants` | `ants`（兵种/性格/波次/耐久） | T4 |

**表结构**（T1 照此写 `supabase/migrations/0003_content.sql`，可补充索引/注释，表名与列名不得改）：

```sql
-- 草稿区：每包一行（编辑器正在改的版本，玩家不可见）
create table public.content_packs (
  key text primary key
    check (key in ('levels','materials','blocks','items','skills','pets','ants')),
  data jsonb not null default '{}'::jsonb,
  version int not null default 0,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- 已发布区：每包一行（玩家可见）
create table public.content_published (
  key text primary key
    check (key in ('levels','materials','blocks','items','skills','pets','ants')),
  data jsonb not null,
  version int not null,
  published_by uuid,
  published_at timestamptz not null default now()
);

-- 历史快照：每次保存草稿落一条（回滚用）
create table public.content_pack_versions (
  id bigint generated always as identity primary key,
  key text not null,
  version int not null,
  data jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
-- 三张表全部 enable row level security；anon/authenticated 无任何直读直写权限（一切走 RPC）
```

**RPC 签名**（名字与参数冻结；`admin_*` 全部 `security definer` + 沿用 0001 的 `is_admin()` 鉴权，开工前先读 `supabase/migrations/0001_init.sql` 确认其用法）：

```sql
-- 玩家侧（anon / authenticated 可执行）：返回 { version, packs: { key: data } }
get_published_content() returns jsonb

-- 管理侧（全部要求 is_admin()，否则 raise exception 'not admin'）
admin_list_packs()                        returns table(key text, status text, version int, updated_at timestamptz)
                                          -- status: 'empty' 无草稿 | 'draft' 有未发布修改 | 'published' 草稿即已发布
admin_get_pack(p_key text)                returns jsonb   -- { data, version } | null（无草稿）
admin_save_pack(p_key text, p_data jsonb) returns int     -- 新草稿版本号；upsert content_packs + 落 content_pack_versions
admin_publish_pack(p_key text)            returns int     -- 把当前草稿复制进 content_published，返回发布版本号
admin_pack_history(p_key text, p_limit int default 20)
                                          returns table(version int, data jsonb, updated_at timestamptz)
```

**玩家 bundle 组装规则**：`{ ...DEFAULT_BUNDLE 各字段, ...已发布包覆盖其字段, version: 最大发布版本 }`——组装在**客户端**做（T3），未发布的字段保持打包默认值，bundle 永远完整。

### C2 · app-config（T2）

`BOOT_CONFIG.appConfigUrl` 指向一个 HTTPS JSON（默认 `null` = 跳过版本检查，保持现状）。文件格式：

```json
{
  "latestVersion": "1.2.0",
  "minVersion": "1.0.0",
  "notice": { "id": "2026-10-06-1", "title": "标题", "body": "正文", "actionLabel": "查看", "actionUrl": "https://…" },
  "servers": [ { "id": "chuhe-1", "status": "smooth" } ]
}
```

语义：本地版本 `< minVersion` → 强更拦截（只能「前往更新」）；`notice.id` 与本地记录不同 → 展示一次公告；`servers` 按 `id` 合并覆盖内置 `SERVERS` 的 `status`（**不新增**服务器，清单以客户端为准）；fetch 超时 3 秒，任何失败一律「跳过（离线）」不阻断。

### C3 · 管理端文件边界（T0 已铺好，不得改公共接缝）

- `src/admin/AdminApp.vue`、`src/admin/api.js`、`src/admin/api/content.js`、`scripts/verify-admin.mjs`：**冻结**（要改走集成会话）。
- T4 独占：`src/admin/views/ContentFactoryView.vue`。
- T5 独占：`src/admin/views/LevelEditorView.vue`、`src/admin/api/levels.js`（T5 自建）。
- 样式写各自 SFC 的 `<style scoped>`，**不改 `src/admin/admin.css`**。
- `content.js` 对编辑器的依赖面：`PACK_KEYS / PACK_META / listPacks / getPack / savePack / publishPack / packHistory`（verify-admin A4 已锁定这些导出）。

### C4 · npm script 协议

新增测试只加独立单行（如 `"test:boot2": "node scripts/verify-boot2.mjs"`）；`test:all` 的串联只由集成会话改。合并时 `package.json` 的单行冲突由集成会话解决。

---

## 5. 任务卡

### T1 · 内容域数据库迁移（纯 SQL）

> **【派活指令】** 克隆 a565551313/gaidaoyueqiu2，从 `arena/c3417b52-gaidaoyueqiu2` 切出新分支，按 `docs/PARALLEL_TASKS.md` 的 **T1 任务卡** 执行（含 §2 通用纪律），验收全绿后推分支并开 PR（base = `arena/c3417b52-gaidaoyueqiu2`）。

- **目标**：交付 `supabase/migrations/0003_content.sql`，实现 §C1 冻结的全部表与 RPC（含 RLS、`is_admin()` 鉴权、`get_published_content` 对 anon 开放）。
- **独占文件**：`supabase/migrations/0003_content.sql`（新增）、`docs/PARALLEL_TASKS.md` 不许动。
- **红线**：不碰 `src/**`、不碰 0001/0002 两个迁移文件、不假设线上库状态（0003 必须可重复执行：`create table if not exists` / `create or replace function`）。
- **实现要点**：先读 `supabase/migrations/0001_init.sql` 学鉴权与命名习惯；`admin_save_pack` 用 `insert … on conflict (key) do update set version = content_packs.version + 1`；`admin_list_packs` 的 status 按「草稿版本 > 已发布版本 → draft」计算；`get_published_content` 里 `version` 取 `content_published` 的最大值。
- **验收**：
  1. 新增 `scripts/verify-content-sql.mjs`（纯文本静态检查，node 直跑）：断言 0003 文件含三张表、五个 admin RPC、`get_published_content`、RLS 三连、`security definer`、check 约束七包 key —— 每项一条断言并打印 ✓；
  2. `package.json` 加单行 `"test:content-sql": "node scripts/verify-content-sql.mjs"`；
  3. `node scripts/verify-content-sql.mjs` 与 `npm run test:all` 全绿；
  4. PR 描述里附「用户执行清单」：把 0003 全文粘进 Supabase SQL Editor 执行。
- **联调依赖**：无（纯交付物）。用户执行 SQL 后 Wave 2 才能联调。

### T2 · 启动链第二批：公告与强更（玩家侧）

> **【派活指令】** 同上格式，把 T1 换成 **T2 任务卡**。

- **目标**：`BootUpdate` 的版本检查步骤从「占位（appConfigUrl 为 null 跳过）」升级为真实实现：拉取 §C2 的 app-config JSON，支持强更拦截、公告展示、服务器状态合并。
- **独占文件**：`src/components/boot/BootUpdate.vue`、`src/config/boot.js`、`src/config/servers.js`、`public/app-config.example.json`（新增）、`scripts/verify-boot.mjs`（**只允许在文件末尾追加 B7 段**，不改既有 B1-B6）。
- **红线**：不改 `AuthScreen/ServerSelect/SplashScreen/MainMenu/App.vue/main.js/cloud/**`；`BOOT_CONFIG.appConfigUrl` 默认值保持 `null`（不配置时行为与现在完全一致）；强更拦截只在 `forceUpdate` 为真时生效，其余失败一律不阻断。
- **实现要点**：公告条做在 BootUpdate 页内（顶部滑入条 + 关闭即记录 `notice.id` 到 localStorage `gaidaoyueqiu2:notice:v1`）；`servers.js` 加纯函数 `mergeServerStatus(builtin, remote)`（verify-boot B7 可直接断言）；版本比较写纯函数 `cmpVersion(a, b)`。
- **验收**：
  1. verify-boot 追加 B7 段：`mergeServerStatus` 覆盖/忽略未知 id、`cmpVersion` 三态、notice 去重键读写、app-config 解析容错（缺字段/坏 JSON → null）；
  2. `npm run test:boot` + `npm run test:all` 全绿；
  3. `public/app-config.example.json` 与 §C2 逐字段一致。
- **联调依赖**：无（默认 null 不拉远端；上线公告时用户把 JSON 放到任意 HTTPS 地址并改 `appConfigUrl`）。

### T3 · 玩家侧远端内容握手

> **【派活指令】** 同上格式，把 T1 换成 **T3 任务卡**。

- **目标**：游戏启动时后台拉取已发布内容包，校验后写入缓存键，实现「远端 → 本地缓存 → 打包默认」的内容优先级（Phase 0 预留的接缝，见 `src/core/content.js` 头注释）。
- **独占文件**：`src/core/contentRemote.js`（新增）、`src/core/content.js`（只许加导出/加函数，现有行为与导出不得破坏）、`src/main.js`（只许加一行启动调用）、`scripts/verify-content.mjs`（只允许追加新 section）。
- **红线**：不改 `data/**`、`content/defaults/**`、boot 组件、cloud/**；拉取是 fire-and-forget（**不阻塞启动**，`<3s` 回访指标不能退化）；任何失败静默回落，游戏永远可玩；`localStorage` 缓存只在「远端 version 严格大于缓存 version 且组装后通过形状校验」时覆盖。
- **实现要点**：用原生 `fetch` POST `{VITE_SUPABASE_URL}/rest/v1/rpc/get_published_content`（headers `apikey` + `Authorization: Bearer <anonKey>`，不需要 supabase-js）；组装 = `DEFAULT_BUNDLE` 深拷贝 + 已发布包按 §C1 映射覆盖字段；形状校验复用/导出 `content.js` 的 `isValidBundle`；写键 `CONTENT_BUNDLE_KEY`（即 `gaidaoyueqiu2:content:v1`）；无环境变量时整体 no-op。
- **验收**：
  1. verify-content 追加段：纯函数断言——包字段映射覆盖正确、未发布字段保持默认、坏包被拒、version 相同不覆盖、mock 模式（无 env）no-op；
  2. `npm run test:content` + `npm run test:all` 全绿。
- **联调依赖**：与 T1 的 RPC 真正联通需 0003 已执行 + 有已发布包（可在后台 mock 发布后同源验证）。开发期用 fetch 桩即可完成全部断言。

### T4 · 管理端：内容工厂 UI（7 个内容包编辑器）

> **【派活指令】** 同上格式，把 T1 换成 **T4 任务卡**。

- **目标**：把 `src/admin/views/ContentFactoryView.vue` 从施工位变成可用的通用内容包编辑器：7 包 tab（`initialTab` prop 已接线）、表单化编辑、草稿保存、发布、历史版本查看。
- **独占文件**：`src/admin/views/ContentFactoryView.vue`。
- **红线**：不改 `AdminApp.vue / api.js / api/content.js / admin.css / verify-admin.mjs` 及一切 T5 文件；数据层**只准调用** `api/content.js` 的六个导出（§C3），不许自己发 RPC / 自己读写 localStorage。
- **实现要点**：`getPack` 返回 null 时用 `DEFAULT_BUNDLE` 对应字段打底展示（管理员看到的第一眼就是当前线上等效内容）；编辑器按数据形状自适应渲染（对象数组 → 表格行 + 增删，数字/字符串/布尔 → 对应控件，嵌套对象 → 分组折叠）；保存前做结构自检（字段齐全、无 undefined）；发布按钮二次确认（提示「发布后玩家下次启动生效」）；顶部常驻模式提示（mock 模式：发布即写本机玩家缓存，刷新 `/` 立即可验；supabase 模式：走 RPC）。视觉遵循 `admin.css` 现有后台风格，样式写 scoped。
- **验收**：
  1. `npm run test:admin` 全绿（A1 会编译你的 SFC，A4 会锁依赖面）；
  2. 手动路径写进 PR 描述：`npm run dev` → `/admin.html` → 方块工厂 → 改一个材质的售价 → 保存 → 发布 → 刷新 `/` → 游戏内该材质售价已变（mock 端到端）；
  3. `npm run test:all` 全绿。
- **联调依赖**：supabase 模式联调需 0003 已执行 + 管理员账号已建。

### T5 · 管理端：关卡编辑器（8 章 56 关）

> **【派活指令】** 同上格式，把 T1 换成 **T5 任务卡**。

- **目标**：把 `src/admin/views/LevelEditorView.vue` 从施工位变成关卡编辑器：章节列表 → 每章关卡列表 → 关卡参数表单（目标/预算/天气池/解锁/星级阈值，字段结构以 `src/content/defaults/levels.js` 为唯一基准）、草稿保存、发布。
- **独占文件**：`src/admin/views/LevelEditorView.vue`、`src/admin/api/levels.js`（新建：包一层 `content.js` 通用接口 + levels 包专用的结构校验/排序/复制函数）。
- **红线**：不改 `AdminApp.vue / api.js / api/content.js / admin.css / verify-admin.mjs` 及一切 T4 文件；数据存取只经 `api/content.js`（levels 包 key = `'levels'`，data 形状 = `{ chapters, levels }`）。
- **实现要点**：关卡结构校验至少覆盖——8 章齐全、每章关数与 `defaults/levels.js` 现状一致、关卡 id 唯一且递增、`chapterId` 引用存在、星级阈值为非负数、天气池引用合法（对照 verify-chapter.mjs 的既有规则）；「复制上一关参数」快捷键；未保存离开提示。视觉遵循 `admin.css` 现有后台风格，样式写 scoped。
- **验收**：
  1. `npm run test:admin` 全绿；
  2. 新增 `scripts/verify-admin-levels.mjs`（node 直跑，纯函数测试 `api/levels.js` 的结构校验：合法包通过、缺章/重复 id/断号/坏天气池各一条拒绝断言），`package.json` 加单行 script；
  3. 手动路径写进 PR 描述：`/admin.html` → 关卡设计 → 改第 1 关目标 → 保存 → 发布 → 刷新 `/` → 游戏内第 1 关目标已变；
  4. `npm run test:all` 全绿。
- **联调依赖**：同 T4。

### T6 · 发布中心 + 运营看板（Wave 3，可选）

> **【派活指令】** 同上格式，把 T1 换成 **T6 任务卡**。（先与用户确认再派）

- **目标**：`publish` 占位页实装：内容包历史版本列表 + 一键回滚（需 T1 补 `admin_rollback_pack(p_key, p_version)` RPC，走集成会话加契约）；`analytics` 占位页基于 `level_results` 表做关卡漏斗（每关通关人数/尝试次数/流失）。
- **独占文件**：`src/admin/views/PublishCenterView.vue`、`src/admin/views/AnalyticsView.vue`（新建），`AdminApp.vue` 接线由集成会话做。
- **验收**：`npm run test:admin` + `test:all` 全绿；PR 描述附手动路径。

### T7 · 第三方登录 + 测试服（暂缓）

前置条件：用户在 Supabase Authentication 里开 Google/Apple provider 并提供回调域名。届时再细化任务卡（AuthScreen 加第三方按钮 + BOOT_FLOW_DESIGN 第二批剩余项）。

---

## 6. 合并与集成（**用户手动操作**，按此顺序）

各 AI 的 PR 互不接触、可任意顺序合并；唯一可能冲突的文件是 `package.json`（每个任务加一行 script），按下法处理：

1. **先合 PR #11**（Phase 1 + 启动链 + T0 共 12 个 commit，15 套测试全绿）→ master。
2. **改各任务 PR 的 base**：GitHub PR 页 → Edit → 把 base 从 `arena/c3417b52-gaidaoyueqiu2` 改成 `master`（GitHub 会自动重算 diff，各 PR 只剩自己的改动）。
3. **逐个合并**（顺序随意，建议 T1 → T3 → T2 → T4 → T5）。从第二个开始 `package.json` 可能报冲突——不在网页上合，本地处理：
   ```bash
   git checkout master && git pull
   git merge origin/arena/T<x>-<name>   # 冲突时打开 package.json，两边的新增行都保留
   npm run test:all                     # 绿了再推
   git push origin master
   ```
4. **test:all 串联**：各任务的 test script 是独立单行，全部合并后回主会话说一句「把新 test script 串进 test:all」，由主会话统一改并跑全量验收（含构建 + jsdom 冒烟）。
5. **上线动作**：T1 合并后把 0003 粘进 Supabase SQL Editor（§7）；后台要上 Vercel 的话按 docs/ADMIN_SETUP.md 把 admin.html 加进构建再 Redeploy。

## 7. 用户配合清单（按需）

| 时机 | 操作 |
|---|---|
| T1 合并后 | 把 `supabase/migrations/0003_content.sql` 全文粘进 Supabase SQL Editor 执行 |
| T4/T5 联调前 | 建管理员账号：Authentication → Add user → 建号；Table Editor → `admin_users` 登记该账号 uid（详见 docs/ADMIN_SETUP.md） |
| T2 上线公告时 | 把 app-config JSON 放到 HTTPS 地址（如 Vercel 静态文件），改 `src/config/boot.js` 的 `appConfigUrl` 后部署 |
| T7 开工前 | Supabase → Authentication → Providers 开 Google/Apple |

### 附：管理员账号建号步骤（T4/T5 联调前做一次）

依据 `supabase/migrations/0001_init.sql` 的 `admin_users` 表（id = auth.uid，role/status）与 `is_admin()` 鉴权：

1. Supabase Dashboard → **Authentication → Users → Add user**：填邮箱和密码（如 `admin@yourgame.com`），勾选 **Auto Confirm User** → Create。
2. 在 Users 列表点开该用户，复制 **User UID**（一长串 uuid）。
3. SQL Editor 执行（把 UID 和邮箱换成你的）：
   ```sql
   insert into public.admin_users (id, email, role)
   values ('<UID>'::uuid, 'admin@yourgame.com', 'super');
   ```
4. 验证：`npm run dev` → 打开 `/admin.html` → 用该邮箱密码登录。本地 mock 模式（未配 env）不需要账号，只有连真库才走这一步；`is_admin()` 只认 `admin_users` 里 `status='active'` 的行，普通玩家账号即使登录也调不动 `admin_*`。

---

## 附：当前仓库的验证命令对照

| 命令 | 覆盖 |
|---|---|
| `npm run test:all` | 全部 15 套（含 verify-boot 46 断言 / verify-admin 28 断言 / verify-content 等） |
| `npm run test:admin` | 管理后台结构回归（A1-A4） |
| `npm run test:boot` | 启动链路回归（B1-B6） |
| `npm run test:content` | 内容包结构回归 |
| `npm run build` | 生产构建 |
| `npm run dev` → `/` | 游戏；→ `/admin.html` 管理后台 |
