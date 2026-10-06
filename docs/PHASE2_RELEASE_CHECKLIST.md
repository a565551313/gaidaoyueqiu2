# Phase 2 上线收口 · 验收清单

> 执行日期：2026-10-06 ｜ 分支：`arena/b02732c5-gaidaoyueqiu2` ｜ 基点：`0047d13`（master）
> 记录规则：**通过 / 失败 / 待人工**（需要真实凭据或浏览器登录的步骤标「待人工」，并写明怎么补）。
> 一切以代码实测为准；与文档不符处在最后一节「与文档不符」列出。

---

## 一、全链路验收

| # | 步骤 | 结果 | 实测记录 |
|---|---|---|---|
| 1.1 | `npm install` | ✅ 通过 | 无报错，未新增依赖（package.json 依赖项未动） |
| 1.2 | `npm run test:all` | ✅ 通过（全绿） | 退出码 0。**实际跑了 18 套**（收口前 17 套 + 本次新增 `verify-notice`）。耗时约 4 分 10 秒 |
| 1.3 | `npm run dev` → `/` 与 `/admin.html` 可打开 | ✅ 通过 | vite 5.4.21，`/` 200、`/admin.html` 200、`/app-config.json` 200(application/json) |
| 1.4 | 管理员账号登录 `/admin.html`，左下角显示 Supabase 云端模式 | ⏳ 待人工 | 沙箱里**没有 `.env.local`**（`.gitignore` 忽略，不随仓库分发），缺 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` → 当前只能进 mock（本地模拟）模式；且管理员密码不该经由对话传递。补法见下方「怎么补完 1.4–1.7」 |
| 1.5 | 内容工厂：改材质售价 → 保存 → 发布 → 游戏商店售价变化 | 🟡 数据链路已实测通过（mock），真库端到端待人工 | 直接驱动 `src/admin/api/content.js`：`materials` 包把「混凝土」price 650 → 1427，`savePack` 返回 v1、`publishPack` 返回 v1，玩家缓存键 `gaidaoyueqiu2:content:v1` 内该材质 price = 1427，且 bundle 通过 `isValidBundle`、未发布的 `levels` 字段保持打包默认 —— 「保存→发布→玩家侧读到新值」这一环路本身是通的 |
| 1.6 | 关卡设计：改第 1 关目标 → 保存 → 发布 → 游戏第 1 关目标变化 | 🟡 同上 | 第 1 关 `target` 30 → 35，`validateLevelsPack` 返回 valid=true，发布后玩家缓存里第 1 关 target = 35。注意 stage 同步：编辑器保存时会 `syncLevelIntoStage` 把 target 回写 stage（verify-admin-levels L2 已锁），手工改 JSON 不同步只会出软警告、不阻断 |
| 1.7 | 每步记录通过/失败 | ✅ 本表即记录 | — |

### 怎么补完 1.4–1.7（需要你/真库，约 10 分钟）

1. 仓库根目录建 `.env.local`（已被 .gitignore 忽略）：
   ```
   VITE_SUPABASE_URL=https://sptaayelyiqrbppgvjcv.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon public key>
   ```
2. 重启 `npm run dev` → 打开 `/admin.html`，左下角应显示 **Supabase 云端模式**（显示「本地模拟」= env 没进构建，重启 dev server）。
3. 前置：`supabase/migrations/0003_content.sql` 必须已在 SQL Editor 执行过，管理员账号必须已登记进 `admin_users`（`status='active'`）。否则登录后调 `admin_*` 会报 `not admin` 或表不存在。
4. 按 1.5 / 1.6 的路径在 UI 上各走一遍，回到本表把 🟡 改成 ✅/❌。

---

## 二、管理后台部署上线

| # | 步骤 | 结果 | 实测记录 |
|---|---|---|---|
| 2.1 | `vite.config.js` 的 `rollupOptions.input` 加 admin 条目 | ✅ 通过 | `input: { main: 'index.html', admin: 'admin.html' }`；commit `f222c92` |
| 2.2 | `npm run build` 产出 `dist/admin.html` | ✅ 通过 | `dist/` 含 `admin.html` + 独立 chunk `assets/admin-*.js`(60.4 kB) / `assets/admin-*.css`(17.2 kB)；后台代码不进游戏首屏包。构建 3.7s 无错（只有一条 content.js 动静态混合导入的既有 warning，非本次引入） |
| 2.3 | 提交推送触发 Vercel 部署 | ✅ 已推送 | 分支 `arena/b02732c5-gaidaoyueqiu2` 已 push。注意 Vercel 默认只有 `master` 发 Production，本分支会出 **Preview URL**；要上生产需把本分支合进 master |
| 2.4 | 访问 `https://<域名>/admin.html` 登录并看到真实玩家数据 | ⏳ 待人工 | 需要你的 Vercel 域名 + 管理员账号；另需确认 Vercel 的 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` 两个变量对该环境（Production/Preview）都已勾选，否则后台会落回 mock 模式 |

> 文档同步：`docs/ADMIN_SETUP.md` §4.3 原文是「admin.html 不部署（刻意设计）」，已改写为「已进生产构建」并补上安全边界说明（鉴权在服务端 `is_admin()`，页面公开不等于数据公开）。

---

## 三、公告能力上线

| # | 步骤 | 结果 | 实测记录 |
|---|---|---|---|
| 3.1 | 新建 `public/app-config.json`（格式按 §C2） | ✅ 通过 | `latestVersion` = `minVersion` = **1.0.0**（= package.json 当前 version，不会误触发强更）；`notice.id` = `2026-10-06-1`；`servers: []`（空数组 = 不覆盖内置服务器状态） |
| 3.2 | `appConfigUrl` 从 null 改为 `/app-config.json` | ✅ 通过 | `src/config/boot.js`；配置随 `public/` 进 dist，线上同源可取（`dist/app-config.json` 已确认产出） |
| 3.3 | 本地验证：拉到配置 | ✅ 通过 | dev server `GET /app-config.json` → 200 `application/json`；新增 `scripts/verify-notice.mjs` 用 jsdom 真挂载 `BootUpdate.vue`，断言真的发出了对 `/app-config.json` 的请求 |
| 3.4 | 本地验证：公告条出现，且只出现一次 | ✅ 通过 | 运行期断言：首次挂载 `.boot-notice-card` 出现且标题/正文渲染正确（同屏仅 1 条）→ 点 × 后消失且 `gaidaoyueqiu2:notice:v1` 落盘 `2026-10-06-1` → 再次挂载不再出现；把本地已读 id 换成别的值，公告又会出现（证明去重按 id 生效，而不是功能坏了） |
| 3.5 | 本地验证：版本检查不拦截 | ✅ 通过 | 「检查版本」步骤为 `st-done`、文案「已是最新」，主按钮不是「前往更新」，「离线继续」仍在 → 未进入强更拦截分支 |
| 3.6 | 提交推送 | ✅ 通过 | commit `906c65f` |
| 3.7 | 线上再验一遍 | ⏳ 待人工 | 部署完成后：打开线上首页 → 启动页应出现公告条、「检查版本 ✓ 已是最新」；DevTools Network 里能看到 `/app-config.json` 200。想重复验证：控制台 `localStorage.removeItem('gaidaoyueqiu2:notice:v1')` 再刷新 |

---

## 四、本次新增的回归（防止以后改坏）

| 套件 | 内容 | 断言数 |
|---|---|---|
| `npm run test:notice`（新增，已串进 `test:all`） | N1 真实拉取 + 公告渲染 / N2 版本检查不拦截 / N3 关掉只出现一次 + 换 id 再现 | 16 |
| `npm run test:boot`（B7 段改写） | 原「appConfigUrl 默认 null」断言 → 改为「指向 `/app-config.json`」+ 线上配置合法、latest/min 与 package.json 版本一致、不触发强更、公告 id 为日期串 | 46 → 89（+8） |

`npm run test:all` 现为 **18 套，全绿**（退出码 0）。

---

## 五、与文档不符 / 需要注意的地方（以代码实测为准）

1. **`docs/PARALLEL_TASKS.md` §1 写「`test:all` 15 套」，§附录写「17 套」** —— 实测收口前是 **17 套**（verify / chapter / navigation / gameplay-tweaks / block-art / codex / ui-flow / campaign-cadence / lightning / runstats / pet-weather / cloud-sync / content / content-sql / boot / admin / admin-levels），本次 +`notice` = **18 套**。
2. **「8 章 56 关」是笔误** —— `src/content/defaults/levels.js` 实际是 **7 章 × 8 关 = 56 关**，verify-admin-levels L1 已把这点写死成基线断言。
3. **verify-boot 的 B7 原本断言 `appConfigUrl === null`** —— 这与第三件事（改成 `/app-config.json`）直接冲突，不改测试就不可能 test:all 全绿。处理：没有删断言，而是把它改写成「已上线」语义并补了 7 条新断言（配置文件必须存在、版本号必须与 package.json 同步、不得触发强更）。即**约束反转为更强**：以后谁把 `latestVersion` 写高于 package.json，CI 会红。
4. **`docs/ADMIN_SETUP.md` §4.3「admin.html 不部署」已过期** —— 本次按你的要求上线，文档已同步改写。
5. **`public/app-config.example.json` 保留不动** —— 它是 §C2 的字段样例，verify-boot B7 有逐字段断言盯着；真正生效的是新建的 `app-config.json`。两者并存不冲突（示例文件也会被发布到线上，内容是占位样例，无副作用；如果不想让它出现在线上，可以后续删掉，但要同步改 verify-boot 的那 4 条断言）。
6. **`servers` 写成空数组而不是示例里的 `chuhe-1`** —— §C2 规定 servers 只能按 id 覆盖内置清单的 status，不新增；内置清单里没有 `chuhe-1`，照抄示例会是一条被忽略的无效数据，所以留空。
7. **关卡包的 stage 同步** —— 关卡 target 同时存在于 `levels[].target` 与章节 stage 的 `target`，两边不同步只出软警告不阻断；编辑器保存走 `syncLevelIntoStage` 自动回写，**不要手工改 JSON 发布**。
8. **约束遵守情况** —— 未改 `src/admin/**`、未改任何玩法代码、未新增依赖；三件事分别是 commit `f222c92`（部署）/ `906c65f`（公告）/ 本文件（验收清单）。第一件事不含代码改动，只产出本清单。
