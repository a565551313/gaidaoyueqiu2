# Phase 1 后台接入指南（Supabase）

> **状态**：Phase 1 骨架已实施（2026-10-06）——云存档 + 成绩上报 + 线上排行榜 + 管理后台骨架。
> 选型 Supabase 托管（免费档够用），部署先境外/本地跑通。
> 完整设计见 [`ADMIN_DESIGN.md`](ADMIN_DESIGN.md)；本文只讲怎么把它跑起来。

---

## 一、零配置也能跑：本地模拟模式

**什么都不配置，`npm run dev` 之后一切已经可用：**

- 游戏内「更多 → 设置 → 云端进度」显示「本地模拟 · 数据保存在本机，链路与云端一致」；
- 排行榜页显示云端榜单（本地模拟），4 个种子演示玩家 + 你；
- 打开 **`http://localhost:5173/admin.html`** 进管理后台：仪表盘、用户列表、用户详情、补发金币、改名，全部真实可用。

原理：`src/core/cloud/localAdapter.js` 把"服务器"模拟在 localStorage 的独立键空间
（`gaidaoyueqiu2:cloud-mock:v1`），与游戏存档（`gaidaoyueqiu2:save:v1`）完全隔离。
游戏页和后台页同源共享这份数据——**玩一关，回后台点刷新，立刻能看到**；对 `local:me`
补发金币，刷新游戏页立刻到账。

模拟模式与 Supabase 模式走**同一套适配器接口和合并逻辑**，所以演示即预演：
LWW 冲突、保底字段、成绩校验在两种模式下行为完全一致（回归锁定在
`npm run test:cloud-sync`，48 条断言）。

## 二、接入真实 Supabase（约 10 分钟）

1. **建项目**：[supabase.com](https://supabase.com) 注册 → New project（免费档，区域选离玩家近的境外节点，如新加坡）。
2. **建表**：Dashboard → **SQL Editor** → 粘贴 [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) 全文 → Run。
   一次性完成：6 张表（players / saves / level_results / wallet_ledger / events / admin_users）+ RLS 行级安全 + 全部 RPC（推送存档、成绩上报、榜单聚合、管理端查询/补发）。
   > 文件已放在 Supabase 标准迁移路径 `supabase/migrations/` 并附 `supabase/config.toml`：
   > 如果你把 GitHub 集成连好（Dashboard → Settings → Integrations → GitHub，并在 config.toml
   > 里填上 project ref），以后合并到主分支的**新增迁移会自动执行**；本次初始化直接 SQL Editor
   > 手动粘贴最直接，文件幂等，重复执行安全。
3. **拿密钥**：Project Settings → API → 复制 **Project URL** 和 **anon public** key。
4. **配环境**：仓库根目录复制 `.env.example` 为 `.env.local`（已被 .gitignore 忽略），填入两个值。
5. **重启** `npm run dev`：
   - 游戏设置页显示「已连接云端 · 进度双端同步」；
   - `/admin.html` 出现登录框（本地模拟不再直进）。

> anon key 是设计上就暴露给客户端的公开密钥，可以放进前端代码；真正的写权限由
> RLS 策略约束（玩家只能读写自己的行）。**service_role key 绝对不要填进 .env**。

### 创建管理员账号（Supabase 模式的后台登录）

1. Dashboard → **Authentication → Users → Add user**：创建 email/password 账号（比如 `admin@yourgame.com`）。
2. 复制该用户的 **UID**。
3. SQL Editor 执行（文件末尾也有此模板）：
   ```sql
   insert into public.admin_users (id, email, role)
   values ('<UID>'::uuid, 'admin@yourgame.com', 'super');
   ```
4. 用该邮箱密码登录 `/admin.html`。管理端 RPC 内部用 `is_admin()` 鉴权，
   非管理员账号即使能登录 Supabase，调用 `admin_*` 也会被拒绝。

### 双设备进度同步怎么验证

1. 浏览器 A（正常窗口）玩几关；
2. 浏览器 B（无痕窗口，等于"新设备"）打开游戏 → 自动匿名注册 → 拉取云端存档 →
   关卡进度/金币/星级与 A 一致（星级与最高分保底不回退，A 落后也不会覆盖 B）。

## 三、架构速览（改动都发生在哪里）

```
src/core/cloud/            ← 同步层（新增，与存档层/引擎解耦）
  merge.js                   纯逻辑：LWW+保底合并、成绩校验（与 SQL 同规则）
  localAdapter.js            本地模拟后端（零配置模式 + 无头测试）
  supabaseAdapter.js         Supabase 适配器（动态加载，不配置不进首屏）
  index.js                   CloudSync 单例：init/flush/reportResult/leaderboard
src/core/storage.js         ← 加了 setCloudHook（存档层与同步层正交）
src/core/store.js           ← 加了 actions.hydrate（云端合并结果回填）
src/main.js                 ← 接线：钩子注入 + CloudSync.init
src/components/
  GameView.vue               结算时上报成绩（fire-and-forget）
  Leaderboard.vue            云端榜单，静态样例自动降级兜底
  MainMenu.vue               设置页「云端进度」开关/状态/立即同步
admin.html + src/admin/     ← 管理后台（独立入口，同 lab.html 模式，不进生产包）
supabase/migrations/     ← 数据库 schema + RPC + RLS（唯一需要手工执行的 SQL）
scripts/verify-cloud-sync.mjs ← 回归：48 条断言，已接入 test:all
```

**关键设计约束**（有测试盯着）：
- `src/core/cloud/*` 与 `src/admin/api.js` **不许 import store.js**（沿用图鉴规则 ⑤ 的解耦思路）；
- 本地 localStorage 永远是同步源，断网/未配置 = 原来的单机体验，一行行为不变；
- 12 套回归（`npm run test:all`）必须全绿才算改完。

## 四、生产部署（Vercel）

游戏本体是纯静态产物（`npm run build` → `dist/`），Supabase 是托管服务，Vercel 免费档即可，**不需要自己买服务器**。

### 4.1 部署步骤

1. Vercel → **Add New → Project** → 导入 GitHub 仓库 `gaidaoyueqiu2`（框架自动识别为 **Vite**，构建命令 `npm run build`、输出目录 `dist` 保持默认即可，无需 vercel.json）。
2. **先配环境变量再部署**：Project → Settings → **Environment Variables**，添加
   `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`（Production + Preview 都勾上）。
   > ⚠️ 这两个变量是**构建期**注入的（Vite 的 `import.meta.env`）——先加变量再触发部署；
   > 如果已经部署过，加完变量后必须 **Redeploy** 才会生效。
3. Deploy。完成后打开 `https://<你的项目>.vercel.app`，进「更多 → 设置」：
   - 显示「**已连接云端 · 进度双端同步**」= 环境变量已生效；
   - 显示「本地模拟 · 数据保存在本机」= 变量没进构建（90% 是忘了 Redeploy）。
4. 每次推送到 `master` 自动发 Production；推其他分支自动发 Preview URL（Vercel 默认行为，不用配）。

### 4.2 分支注意（重要）

- Phase 1 代码合入 `master` 之前，线上跑的是旧版（无云端功能）——合并 PR #11 后 Vercel 会自动部署新版。
- 想先在 Preview 域名验收：不动 master，直接用 Vercel 给 `arena/*` 分支生成的 Preview URL 测试（环境变量对 Preview 同样生效）。

### 4.3 admin.html 不部署（刻意设计）

`admin.html`（管理后台）**不在生产构建里**——`vite.config.js` 只打包 `index.html`，所以
`https://<你的域名>/admin.html` 是 404，这是刻意的：管理后台不该暴露在公开域名上。

日常用法：本地 `npm run dev` → `localhost:5173/admin.html`，配同一套 `.env.local`
（Supabase 是同一个，数据实时互通——本地后台看到的玩家就是线上真实玩家）。
Phase 3 再做带访问口令的独立部署（见 ADMIN_DESIGN §15）。

### 4.4 Vercel 排障速查

| 现象 | 处理 |
|---|---|
| 设置页显示「本地模拟」 | 环境变量没进构建：确认变量名拼写（区分大小写）→ Redeploy |
| 设置页显示「连接失败」 | URL/key 抄错；或 Supabase 项目暂停（免费档一周无活动会暂停，Dashboard 里 Restore） |
| 排行榜只有演示玩家和自己 | 正常现象（本地模拟模式）；接通 Supabase 后就是全服真实玩家 |
| 构建 succeeds 但页面空白 | 检查是否改过 `vite.config.js` 的 `base`（默认 `/` 即可，无需改） |

## 五、已知边界（Phase 1 的"骨架"含义）

- 管理后台的 Supabase 模式 RPC（admin_*）已实现但**未对线上项目实测**——本地模拟模式是
  本次验证的主路径；首次接真实项目时按上面步骤走一遍，遇到问题以 SQL Editor 的报错为准。
- 金币目前只在**上报对局时**走服务端账本（wallet_ledger）；商店购买仍是纯客户端结算，
  服务端对账（经济防刷闭环）在 Phase 2。
- 埋点 events 表已建好，客户端批量上报在 Phase 1 末/Phase 2 接入。
- 排行榜没有按赛季分段（页面上的 "SEASON 01" 目前是装饰文案）。

## 六、常见问题

| 现象 | 原因/处理 |
|---|---|
| 设置页显示「连接失败：…」 | `.env.local` 没生效（改完要重启 dev server）；或 URL/key 抄错 |
| 后台登录提示 forbidden | 该账号的 UID 没登记进 `admin_users` 表，或 status 不是 active |
| 换设备进度没过来 | 确认两个页面都显示「已连接云端」；无痕窗口默认也是匿名登录，但属于**新**匿名用户——双设备验证要用同一个浏览器的正常窗口 + 另一个已登录过云端的设备配置 |
| 想重置本地模拟数据 | 控制台执行 `localStorage.removeItem('gaidaoyueqiu2:cloud-mock:v1')` 后刷新 |
| 想回到纯单机 | 设置 → 云端进度 → 关闭（写入本机偏好，不影响游戏其他功能） |
