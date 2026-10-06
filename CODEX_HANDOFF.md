# Codex Handoff

> 状态快照：2026-10-06（第二版，含 Phase 1 后台骨架实施）；基于本次只读检查 + 实际运行 build/dev/全部回归脚本时可见的仓库状态。不是在线服务或设备状态承诺。

- **代码基线**：`master` 的 `f796efd`（Merge PR #10，2026-10-06 合入）。本分支两次提交：① 文档全量校订 + 新增 `docs/ADMIN_DESIGN.md` 后台设计方案；② **Phase 1 后台骨架实施**（见下）。游戏玩法/引擎代码未改动（仅 GameView 结算处新增一处 fire-and-forget 上报调用）。
- **当前项目规模**：Vue 3 + Vite 的手机优先堆叠游戏。**7 个都会圈章节 × 8 关 = 56 关**（`src/data/levels.js`），每章绑定唯一天气主题（晴/风/云/雷/雨/雪/雹）。主菜单路由包括章节选择、选关、商店、背包、宠物中心、技能学院、图鉴（Codex）、排行榜和游戏页；主菜单“角色”仍是提示占位；无尽模式和排位赛按钮禁用。排行榜在本地按各关历史最高分合计玩家成绩，并与静态样例分数一起显示；未发现线上榜单服务实现。
- **2026-10-06 复核发现并已同步进文档的变化**（此前文档未覆盖）：
  - 新增第 8 种消耗道具**背包扩容卡**（`bagExpand`，500 金币）：买回背包放着，在背包页使用，一张永久 +5 格；存档新增 `bagCapacity` 字段（默认 20，`BAG_DEFAULT_CAPACITY`/`BAG_SLOT_STEP` 见 `src/data/items.js`）。背包页从“纯查看”变为“查看 + 使用扩容卡”。
  - 方块属性模型已从文档记录的 `mods` 倍率中间方案**演进为六轴基础值模型**（`src/data/blockStats.js` 的 `STAT_SPECS` + `src/data/blocks.js` 的 `EFFECT_FROM_STATS` 唯一换算）；材质效果文案由 `describeStats()` 现算。`docs/BLOCK_ATTRS.md` 与 `docs/CODEX.md` 已按此校订。
  - 自动化回归共 **11 套**（此前文档写 8 套，漏了 `verify-lightning` / `verify-runstats` / `verify-pet-weather`）；`verify.mjs` 当前 **285 条**（此前写 286）。全部脚本本次实跑通过。
  - `docs/ART_REWORK.md` 代码地图行数已按当前文件复核更新（`gameRender.js` 拆出 `blockArt.js` 后 729 → 533，新增 `runStats.js` 162 行等）。
- **已验证修复（历史 P0，本次复核确认仍被回归锁定）**：① 冰雹预警曾被落块整轮重置导致砺川章冰雹从不命中 → 现修复，`verify-campaign-cadence.mjs` 实测 8 关全部 > 0（本次总命中 64 次）；② 蚂蚁攻击节奏曾比落块节奏慢一个数量级、35/56 关 0 咬击 → 现修复，本次两次实测总咬击 493 / 501 次、0 咬击关卡 0 个；③ 霆川章雷击接回真实对局（乌金 `lightningFloors`、云母精灵 5★ 挡雷均可达），`verify-lightning.mjs` 实测 8 关总雷击 207 次、乌金场均损失 1.00 层 < 泥土 1.98 层。
- **仍未处理的已知问题**：
  - 旧版「不依赖章节、随机抽取天气」的通用天气系统（`src/core/weather.js` 的 `_tryStart/_onStart/_end/_tick` 等约 300 行）在当前 56 关里完全不可达（只有第一章会走这条路径，而第一章全部 `weather:0`），但仍被 `scripts/verify.mjs` 部分用例当通用引擎能力测试。去留未决。
  - 岚河（风）、雨汀（雨）两章里蚁群约 35%~37% 的时间因天气威胁窗口被暂停攻击（`hasGameplayThreat`），是刻意的公平性设计但也削弱蚂蚁存在感，尚未调优。
  - 云岫（云）、雪岑（雪）两章（16 关）的天气对玩法零影响，纯氛围演出。
  - `antWavesForLevel` 仍只按“章节内第几关”（`chapterStage`）取波次，同一关卡号在 7 个章节里波次配置完全相同，未随章节推进加难。
  - **`public/assets/voice/` 的 4 句解说录音未登记来源与许可证**（本次已在 `ASSET_LICENSES.md` 补登记为待核项），对外分发前必须补齐。
  - 详细清单见 `docs/ENEMY_WEATHER_AUDIT.md` 的 P1/P2 分组。
- **主题与设置**：启动时固定深色主题，主题已取消切换且不写入存档。设置页提供声音开关、音乐音量和音效音量；存档基于 `localStorage`（`src/core/storage.js` 的 load/save/clear 抽象，注释已预留替换为服务端的位置）。
- **音频 API（按当前源码）**：`src/core/audio.js`（已拆分出 `src/core/audioTables.js` 存放素材清单）定义 `startMusic()`、`setScene()`、`setBattleIntensity()` 和解说入口 `voice()`；菜单曲 `menu-pixelate.mp3`，战斗曲由 Web Audio 合成（`battle-vastness.mp3` 在仓库但不作默认曲目）。总线层级 音乐 < 音效 < 语音。
- **依赖与可运行命令**：`npm install`、`npm run build`、`npm run dev` 本次一次性成功（vite.config 已配置 `host: 0.0.0.0` 与 `allowedHosts`）。`npm run test:all` 一次跑完 11 套回归，本次全部通过。
- **自动化验证明细（2026-10-06 实跑）**：`verify.mjs` 285 条、`verify-chapter.mjs` 56 关、`verify-navigation.mjs`、`verify-gameplay-tweaks.mjs` 60 条、`verify-block-art.mjs` 41 条、`verify-codex.mjs` 205 条、`verify-ui-flow.mjs` 13 步、`verify-campaign-cadence.mjs`（咬击 493~501 次、冰雹 64 次）、`verify-lightning.mjs`（雷击 207 次）、`verify-runstats.mjs` 7 组、`verify-pet-weather.mjs`。覆盖范围仍是部分引擎规则，不覆盖完整浏览器交互、真实设备或外部资产许可核验。
- **资源体积**：`public/` 当前约 9.1 MB（音乐 6.2 MB 为大头：两首 MP3）。`docs/ART_REWORK.md` 第八轮记录过一次 44 MB → 9.1 MB 的未引用资源清理。`ASSET_LICENSES.md` 已按当前 `public/assets/` 实际内容校订并补登记 voice 目录待核项。
- **后续方向**：后台系统完整设计见 `docs/ADMIN_DESIGN.md`（架构/数据模型/API/编辑器/防作弊/路线图）。**Phase 1 骨架已于 2026-10-06 实施**（用户拍板：Supabase 托管 + 先境外/本地）：
  - 云端同步层 `src/core/cloud/`（merge.js 纯逻辑 / localAdapter 本地模拟后端 / supabaseAdapter 动态加载适配器 / index.js CloudSync 单例），LWW + stars/bestScores/materials 保底不回退，CAS 冲突合并重试；
  - 游戏接线：`storage.js` 新增 `setCloudHook`、`store.js` 新增 `actions.hydrate`、`main.js` 接线、`GameView.vue` 结算上报、`Leaderboard.vue` 云端榜单（静态样例降级兜底）、`MainMenu.vue` 设置页「云端进度」区块；
  - 管理后台骨架 `admin.html` + `src/admin/`（独立入口同 lab.html 模式，不进生产构建）：仪表盘/用户列表/用户详情/补发金币/改名，Phase 2 模块占位；本地模拟模式与游戏页共享数据可完整演示闭环；
  - Supabase 数据库 `supabase/migrations/0001_init.sql`（6 表 + RLS + 玩家端/管理端全部 RPC，成绩硬顶与 merge.js 同规则）——**未对线上项目实测**，接入步骤见 `docs/ADMIN_SETUP.md`；
  - 回归 `scripts/verify-cloud-sync.mjs`（48 条断言，S1 纯逻辑/S2 模拟后端/S3 全链路/S4 架构规则）已接入 `test:all`（现共 12 套）；另做过 jsdom 冒烟：后台全页渲染、游戏 main.js 接线全链路均通过。`@supabase/supabase-js` 为动态加载的独立 chunk（227KB），不配置云端不进首屏。
  - **线上首测修复（2026-10-06）**：云端真实玩家不足 3 人时排行榜领奖台 `[rankings[1], rankings[0], rankings[2]]` 取到 undefined，模板整页崩溃（玩家打开排行榜白屏，仅剩背景色）。修复为纯函数 `podiumOrder()`（merge.js，不足三人只保留现有名次）+ verify-cloud-sync 4 条断言（现 52 条）+ 真实组件 jsdom 冒烟（单真人玩家场景渲染通过）。
  - Phase 0（内容数据化）/ Phase 2（方块与关卡编辑器、内容 CI、发布灰度）/ Phase 3（运营与数据）未实施。
- **未验证**：本次没有运行完整浏览器全流程、真实手机触控/安全区检查，也没有核对外部资产来源页面的当前可用性。没有据此声称在线环境、运行服务器或外部许可已验证。
