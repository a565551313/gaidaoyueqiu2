# 《盖到月球2》后台系统完整设计方案

> **文档定位**：分阶段可落地的施工图，基于 2026-10-06 的仓库实况编写（全部数据文件、
> 存档结构、回归脚本逐一对过源码）。
>
> **落地状态（2026-10-06 更新）**：
> - **Phase 1 骨架已实施并合入**：云端同步层（`src/core/cloud/`，LWW+保底合并）、
>   对局成绩上报、线上排行榜、设置页「云端进度」开关；Supabase 数据库脚本
>   （`supabase/migrations/0001_init.sql`，标准 Supabase 迁移路径，含 RLS 与全部 RPC）；管理后台骨架
>   （`admin.html`：仪表盘/用户列表/用户详情/补发金币/改名，Phase 2 模块留占位）。
>   回归锁定：`scripts/verify-cloud-sync.mjs`（48 条断言，已接入 `test:all`）。
>   **选型按用户拍板：Supabase 托管 + 先境外/本地跑通**，接入步骤见 [`ADMIN_SETUP.md`](ADMIN_SETUP.md)。
> - **Phase 0 已实施（2026-10-06 第二批）**：8 组配置字面量抽至 `src/content/defaults/`（纯数据守卫：不许 import/函数），
>   `src/core/content.js` 作为同步 Provider 注入 `src/data/*`（localStorage 内容包覆盖接缝已通，远端握手 Phase 2 接入）。
>   验收：既有 12 套回归断言零改动全绿 + 新增 `verify-content.mjs` 60 条（快照等价/冻结语义/导出面/回退链）。
>   数据文件采用 .js 纯字面量模块而非 .json（规避 Node import attributes 与打包差异，编辑体验等价）。
> - **Phase 2/3 未实施**：方块/关卡编辑器（§8/§9）、内容 CI 与发布流水线（§10）、运营与数据看板（§13）仍为设计。
> - 方案中「三层保底字段」「CAS 冲突」「成绩硬顶」等规则在实施中如有出入，
>   以 `src/core/cloud/merge.js` 与 `verify-cloud-sync.mjs` 为准（代码即真相）。

---

## 目录

1. [现状基线：后台要接管的到底是什么](#一现状基线后台要接管的到底是什么)
2. [目标与范围](#二目标与范围)
3. [总体架构](#三总体架构)
4. [技术选型](#四技术选型)
5. [数据模型设计](#五数据模型设计)
6. [API 设计](#六api-设计)
7. [管理后台功能与页面设计](#七管理后台功能与页面设计)
8. [方块编辑器详细设计](#八方块编辑器详细设计)
9. [关卡编辑器详细设计](#九关卡编辑器详细设计)
10. [内容发布流水线与内容 CI](#十内容发布流水线与内容-ci)
11. [用户数据与防作弊](#十一用户数据与防作弊)
12. [客户端改造方案](#十二客户端改造方案)
13. [实施路线图](#十三实施路线图)
14. [工作量估算与团队配置](#十四工作量估算与团队配置)
15. [风险与对策](#十五风险与对策)
16. [附录](#十六附录)

---

## 一、现状基线：后台要接管的到底是什么

先盘清楚家底。当前项目是**纯前端单机**：Vue 3 + Vite + Canvas 2D，无任何后端、账号、网络请求。
所有「配置」都是打包进 JS 的静态数据文件，所有「用户数据」都在 `localStorage` 一份存档里。

### 1.1 内容数据（后台要变成「可编辑」的部分）

| 文件 | 内容 | 规模 | 现状 |
|---|---|---|---|
| `src/data/levels.js` | 7 章节 × 8 关 = 56 关；章节含天气主题/美术/宣传文案，关卡含城市、目标层数、速度、充能、晃动、天气参数、蚂蚁波次索引 | 7 章 / 56 关 | 写死在代码里，改一个数字要重新构建发版 |
| `src/data/blockTypes.js` | 方块类型（标准层/地基/烈焰层/追击层…），「谁放的」 | 4+ 种 | 写死 |
| `src/data/materials.js` | 5 种建筑材质（泥土/混凝土/钢材/青铜/乌金），六轴基础属性 + 外观配色 + 价格 | 5 种 | 写死；`effect` 文案由 `describeStats()` 现算 |
| `src/data/blockStats.js` | 六条属性轴的定义（基础宽度/耐久/重量/硬度/摩擦/韧性） | 6 轴 | 写死 |
| `src/data/blocks.js` | `EFFECT_FROM_STATS`：基础值 → 引擎效果（风力推偏/打滑/雷击层数/落偏保边/削宽）的唯一换算 | ~10 条换算 | 写死，**这是平衡核心，建议留在代码里不进后台** |
| `src/data/items.js` | 8 种消耗道具（价格/说明/颜色）+ 背包容量常数 | 8 种 | 写死 |
| `src/data/skills.js` | 8 项永久技能（上限/说明/效果文案函数） | 8 项 | 写死；效果数值散在 `runStats.js` |
| `src/data/pets.js` | 5 只宠物（解锁星数/技能组/文案） | 5 只 | 写死；效果在 `petSystem.js` |
| `src/data/ants.js` | 4 兵种 + 5 性格 + 蚁群原型参数（maxAlive=5、同层上限 3 等）+ 耐久池配置 + 按 `chapterStage` 的波次表 | 4 兵种 / 5 档波次 | 写死 |

**关键事实**：这些文件不是孤立数据，而是被 11 套回归脚本（`npm run test:all`，285+60+41+205+… 条断言）
直接 import 校验的。任何「内容后台化」方案必须连同**校验链**一起迁移，否则等于把现在防漂移的
安全网全部拆掉——这个项目历史上就发生过「代码写了但实际不发生」的 P0（见
`docs/ENEMY_WEATHER_AUDIT.md`），回归脚本就是为此建的。

### 1.2 用户数据（后台要「有数据」的部分）

`src/core/storage.js` 的存档结构（`localStorage` key `gaidaoyueqiu2:save:v1`）：

```js
{
  coins,                       // 金币
  stars,        // { [levelId]: 0~3 } 每关最高星级
  bestScores,   // { [levelId]: number } 每关历史最高分（排行榜数据源）
  unlocked,     // 已解锁到第几关（顺序解锁）
  skills,       // { [skillId]: level }
  items,        // { [itemId]: count }
  bagCapacity,  // 背包格子（默认 20，扩容卡 +5）
  materials,    // { [materialId]: owned }
  equippedMaterial,
  pets,         // { [petId]: { owned, level, exp, star } }
  seen,         // { enemies: { [speciesId]: true } } 图鉴遭遇记录
  activePetId,
  settings      // { musicOn, sfxOn, musicVolume, effectsVolume }
}
```

读取时有 `mergeDeep`（旧档补默认值）和 `normalizePets`（按总星数补解锁、字段范围收敛），
这两个函数是**云端存档迁移必须复用**的兼容层。

其它「行为数据」目前完全不存在：没有对局上报、没有漏斗、没有经济流水，排行榜是本机
`bestScores` 合计 + 8 个写死的样例角色（`Leaderboard.vue`）。主菜单的段位「青铜 I」、
「在线」等是纯界面文案。

### 1.3 已有的架构缝隙（方案可以直接利用）

- `storage.js` 里 **`backend` 对象已经抽象了 `read/write/remove`**，注释写明「抽象后端接口（当前为 localStorage 实现）」——云存档的接缝是现成的。
- `src/core/` 与 `src/data/` **不许 import `store.js`**（图鉴规则 ⑤，`verify-codex.mjs` 监守），引擎靠 `onSeen` 之类回调外抛事件——这套回调正好可以扩成「行为埋点出口」，不需要动核心。
- 图鉴/商店预览**强制复用真实渲染器**（`drawBlockFace` / `drawAnt` / `AnimatedPet`，规则见 `docs/CODEX.md`）——后台的方块/敌人编辑器沿用同一条规则即可保证「后台看到的 = 玩家看到的」。
- 逻辑画布固定 420×720、`BLOCK_H = 28px`，引擎不依赖 DOM——`verify-campaign-cadence.mjs` 已证明**引擎可以无头跑完整局**，这就是关卡编辑器「后台试玩/自动校验」的基础。
- `vite.config.js` 已经把 lab.html 做成独立入口的美术检阅台——关卡编辑器可以走同样的「开发工具独立入口」模式。

---

## 二、目标与范围

### 2.1 业务目标（按优先级）

1. **用户数据上云**：玩家换设备/清缓存不丢进度；运营能看到真实的玩家分布（DAU、进度、经济）。
2. **内容后台化**：加方块（类型/材质）、配数值、做关卡、调天气和蚂蚁波次，全部在后台完成，
   **不改代码、不发版**；改错有校验拦截，可灰度、可回滚。
3. **运营能力**：线上排行榜（把假样例换成真人）、公告/活动开关、礼包码、A/B 实验。
4. **决策支持**：关卡难度漏斗（哪里弃坑）、经济平衡（金币产出/消耗）、留存。

### 2.2 明确不做（第一期）

- 不做支付/内购（游戏当前是金币单币种，无付费）；
- 不做多语言后台（游戏本身只有中文）；
- 不做实时对战（无尽模式/排位赛按钮当前就是禁用占位，等玩法定了再说）；
- 不动 `EFFECT_FROM_STATS` 换算公式和引擎判定逻辑——后台只喂参数，不改物理（原因见 §8.3）。

### 2.3 角色与权限总览

| 角色 | 用后台干什么 |
|---|---|
| 超级管理员 | 账号/权限、发布审批、全部操作 |
| 策划 | 编辑方块/材质/道具/技能/宠物/关卡/波次，提交并自测 |
| 运营 | 公告、活动、礼包码、排行榜运营、灰度放量 |
| 客服 | 查用户、看存档、补发金币/道具（受限额度） |
| 数据/只读 | 看板与导出，无写权限 |

---

## 三、总体架构

```
┌──────────────────────────────────────────────────────────────────┐
│  玩家端（现有 Vue3 + Vite 客户端，改造点见 §12）                      │
│  · 内容加载器 ContentLoader：内置默认(打包 JSON) + 远端覆盖 + 版本握手  │
│  · 存档双写：localStorage（离线可玩） ⇄ 云存档（登录后同步）            │
│  · 行为埋点：复用引擎回调（onSeen 模式）批量上报                       │
└───────────────┬──────────────────────────────────────────────────┘
                │ HTTPS / JSON（JWT 或设备令牌）
┌───────────────▼──────────────────────────────────────────────────┐
│  API 层（Node.js 服务，双面）                                        │
│                                                                    │
│  玩家 API                          管理 API（内网/VPN + 2FA）        │
│  /api/v1/auth                     /admin/api/v1/...                │
│  /api/v1/content  (内容包)          · users / saves                 │
│  /api/v1/save     (云存档)          · blocks / materials / items    │
│  /api/v1/levels   (成绩上报)        · skills / pets                 │
│  /api/v1/leaderboard               · chapters / levels / waves      │
│  /api/v1/events   (埋点)            · publish（草稿→校验→灰度→全量）  │
│                                   · ops（公告/开关/礼包码/AB）        │
│                                   · analytics（看板查询）            │
│                                   · audit（全操作留痕）              │
└───────┬──────────────────────┬─────────────────────┬──────────────┘
        │                      │                     │
┌───────▼────────┐   ┌─────────▼─────────┐   ┌───────▼────────┐
│ PostgreSQL     │   │ Redis             │   │ 对象存储(S3兼容) │
│ 用户/存档/内容/  │   │ 榜单 ZSET、限流、  │   │ 内容包快照、     │
│ 流水/审计       │   │ 会话、灰度规则     │   │ 导出文件        │
└────────────────┘   └───────────────────┘   └────────────────┘
        │
┌───────▼──────────────────────────────────────────────────────────┐
│  内容 CI Worker（无头跑现有 verify 链）                              │
│  草稿内容包 → 生成临时 src/data → 跑 11 套 verify → 通过才允许发布     │
└──────────────────────────────────────────────────────────────────┘
```

三个原则：

1. **内容即数据（Content as Data）**：所有可配置内容以「内容包」（版本化 JSON bundle）形式发布，
   客户端打包内置一份默认包做离线兜底，启动时向服务端握手拿增量。
2. **玩家端永远可离线**：断网时用内置包 + 本地存档照玩；登录后双向同步。单机体验是这款游戏的底，
   云端是增强，不能变成强依赖。
3. **后台预览 = 真实渲染**：编辑器里的方块/蚂蚁预览直接 import 游戏本体的 `drawBlockFace`/`drawAnt`
   （打进同一个 monorepo 即可），沿用图鉴四条防漂移规则，禁止后台自己画一套。

---

## 四、技术选型

| 层 | 推荐 | 理由 | 轻量替代（MVP） |
|---|---|---|---|
| 管理后台前端 | Vue 3 + Vite + Element Plus | 与游戏同栈，团队零切换成本；Element Plus 的表单/表格最省事 | 同左（无替代必要） |
| API 服务 | Node.js 22 + Fastify + TypeScript | 与前端同语言，`blocks.js`/`storage.js` 的校验逻辑可直接复用跑在服务端 | NestJS（团队偏 OOP/大项目时） |
| 主库 | PostgreSQL 16 | JSONB 存内容包、行级锁、分区表存事件 | SQLite（单机 MVP，Prisma 可平滑迁移） |
| 缓存/榜 | Redis 7 | 排行榜 ZSET、限流、灰度规则命中 | 同左（量小可先 PG 物化视图顶着） |
| 对象存储 | S3 兼容（OSS/COS/R2） | 内容包快照、CSV 导出 | 先存 PG，量大再搬 |
| 认证 | 玩家：设备令牌 → 可升级手机号/微信；管理端：账号密码 + TOTP | 手游匿名先行是标准做法，避免注册墙 | 同左 |
| 部署 | Docker Compose（API + PG + Redis + Admin）单机起，量级上来再拆 | 这个体量（休闲小游戏）单机足够 | 云托管（Render/Fly/国内对应物） |
| 埋点 | 自采事件表 + 每日物化 | 事件种类少、总量可控，不值得先上第三方 | 友盟/GA4 先顶着 |

**不建议**一上来用 Supabase/Firebase 全家桶：内容版本化、灰度、内容 CI 这三件事是本方案的核心价值，
BaaS 的通用模型反而要绕着写；但如果只有 1 个人、只做 Phase 1（云存档+榜），用 Supabase 两周能上线，
后面再迁——两条路在 §13 路线图里都标了。

---

## 五、数据模型设计

三大域：**用户域**（谁在玩）、**内容域**（玩什么）、**行为域**（玩得怎么样）。
内容域的表结构刻意「薄」：结构化列只放检索/排序字段，**完整游戏配置放 JSONB**——
因为关卡参数随章节天气类型变化很大（风关有 `directions`、雨关有 `rainDir`、雷关有 `strikeChance`、
雹关有冰雹曲线），强行拆列会每加一种天气改一次表结构。

### 5.1 用户域

```sql
-- 玩家（匿名优先，可后绑定）
CREATE TABLE players (
  id            BIGSERIAL PRIMARY KEY,
  device_id     TEXT UNIQUE NOT NULL,        -- 首次安装生成的 UUID，匿名凭据
  display_name  TEXT,                        -- 默认 "月球访客#<id后4位>"，可改
  account       JSONB DEFAULT '{}',          -- { phone?, wechat?, apple? } 绑定信息
  region        TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  last_seen_at  TIMESTAMPTZ,
  status        TEXT DEFAULT 'active'        -- active | banned | deleted
);

-- 云存档：整档快照 + 版本号（Last-Write-Wins，见 §11.3 冲突策略）
CREATE TABLE saves (
  player_id     BIGINT PRIMARY KEY REFERENCES players(id),
  data          JSONB NOT NULL,              -- 与 storage.js defaultSave() 同构
  schema_rev    INT NOT NULL DEFAULT 1,      -- 对应 STORAGE_KEY 'v1'
  client_rev    BIGINT NOT NULL,             -- 客户端单调递增，用于 LWW
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 经济流水（append-only，防刷与对账的唯一事实源）
CREATE TABLE wallet_ledger (
  id            BIGSERIAL PRIMARY KEY,
  player_id     BIGINT NOT NULL REFERENCES players(id),
  delta_coins   INT NOT NULL,
  reason        TEXT NOT NULL,               -- level_clear / cs_grant / shop_refund / ...
  ref_id        TEXT,                        -- 关卡ID / 工单ID / 礼包码
  meta          JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON wallet_ledger (player_id, created_at DESC);
```

### 5.2 内容域（核心）

统一模式：`draft → published` 双状态 + 全量内容包快照。

```sql
-- 内容实体通用字段（以 materials 为例，其余同构）
CREATE TABLE materials (
  id            TEXT PRIMARY KEY,            -- 'soil' / 'steel' / ...（与代码同 ID）
  chapter_scope TEXT,                        -- NULL=全局
  data          JSONB NOT NULL,              -- 完整配置：name/price/desc/colors/stats{6轴}
  sort_order    INT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'draft',   -- draft | published | retired
  created_by    BIGINT REFERENCES admin_users(id),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 关卡（levels.js 一行的镜像 + 关卡详情）
CREATE TABLE levels (
  id            INT PRIMARY KEY,             -- 全局连续 1~56，兼容旧存档 stars/bestScores 键
  chapter_id    TEXT NOT NULL REFERENCES chapters(id),
  city          TEXT NOT NULL,
  place         TEXT NOT NULL,
  landmark      TEXT,                        -- cityscape 枚举
  target        INT NOT NULL,                -- 30~100
  speed         NUMERIC NOT NULL DEFAULT 150,
  charge_need   INT NOT NULL DEFAULT 8,
  sway          NUMERIC NOT NULL DEFAULT 0,
  weather       JSONB NOT NULL DEFAULT '{}', -- { kind, intensity, active, calm, directions/rainDir/strikeChance/coverage... }
  ant_waves     TEXT,                        -- 引用 wave_sets.key，或内联覆盖
  hint          TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 章节
CREATE TABLE chapters (
  id            TEXT PRIMARY KEY,            -- 'chenghe-metropolitan' ...
  number        INT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  weather_kind  TEXT NOT NULL,               -- clear|wind|cloud|lightning|rain|snow|hail
  art           JSONB NOT NULL,              -- sky/accent/ground/motif/mark/scenery
  tagline       TEXT, intro TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
);

-- 蚂蚁波次表（ants.js antWavesForLevel 的数据化；当前 7 章共用 5 档，后台化后可按章节分化）
CREATE TABLE wave_sets (
  key           TEXT PRIMARY KEY,            -- 'default-stage-1' ... 
  rules         JSONB NOT NULL,              -- [{ at: 0.18, species: ['worker'] }, ...]
  note          TEXT
);

-- 兵种/性格/全局常数（ants.js 其余部分的镜像）
CREATE TABLE ant_configs (
  key           TEXT PRIMARY KEY,            -- 'species:worker' | 'personality:timid' | 'prototype' | 'durability'
  data          JSONB NOT NULL
);

-- 其它内容表同构：block_types / items / skills / pets / balance_consts（如 SWAY_START_P、
-- 星级阈值 0.85/0.70、金币公式常数、连击恢复档位表）

-- 内容包：发布的最小单位，整包快照、不可变
CREATE TABLE content_bundles (
  id            BIGSERIAL PRIMARY KEY,
  version       TEXT UNIQUE NOT NULL,        -- 语义化 '2.4.0' + 自增
  bundle        JSONB NOT NULL,              -- { chapters, levels, materials, blockTypes, items, skills, pets, ants, balance }
  built_from    JSONB,                       -- 各表当时的 published 版本快照（审计）
  stats         JSONB,                       -- { levels: 56, materials: 5, ... } 供发布页展示
  created_by    BIGINT REFERENCES admin_users(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  ci_result     JSONB                        -- 内容 CI 的 11 套 verify 结果摘要
);

-- 灰度规则：谁能看到哪个版本
CREATE TABLE release_rules (
  id            BIGSERIAL PRIMARY KEY,
  bundle_id     BIGINT NOT NULL REFERENCES content_bundles(id),
  rollout       INT NOT NULL DEFAULT 100,    -- 0~100 按设备 hash 放量
  allowlist     JSONB DEFAULT '[]',          -- 白名单 device_id/player_id
  created_at    TIMESTAMPTZ DEFAULT now(),
  revoked_at    TIMESTAMPTZ
);
```

**为什么关卡保留整数 `id` 做主键**：旧存档 `stars`/`bestScores` 的键就是关卡 ID，
全局连续 ID 是 levels.js 里明确的兼容承诺（「新章节继续使用全局连续 ID，便于旧存档无损扩展」）。
后台建关卡时必须延续这条 ID 序列，禁止重排。

### 5.3 行为域

```sql
-- 对局结果（成绩上报，一次一行）
CREATE TABLE level_results (
  id            BIGSERIAL PRIMARY KEY,
  player_id     BIGINT NOT NULL REFERENCES players(id),
  level_id      INT NOT NULL,
  stars         SMALLINT NOT NULL,           -- 0~3
  score         INT NOT NULL,
  coins_earned  INT,
  duration_s    INT,
  revives_used  SMALLINT DEFAULT 0,
  max_combo     SMALLINT,
  bundle_ver    TEXT,                        -- 用哪个内容包打的（平衡改动后数据可比）
  client_sig    TEXT,                        -- §11.4 的成绩签名
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON level_results (level_id, created_at);
CREATE INDEX ON level_results (player_id, level_id, stars DESC);

-- 埋点事件（批量上报，append-only，按月分区）
CREATE TABLE events (
  id            BIGSERIAL,
  player_id     BIGINT,
  name          TEXT NOT NULL,               -- session_start / level_start / level_fail / shop_buy / ...
  props         JSONB DEFAULT '{}',
  bundle_ver    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (created_at);

-- 管理端审计（所有写操作留痕，不可删）
CREATE TABLE admin_audit (
  id            BIGSERIAL PRIMARY KEY,
  admin_id      BIGINT NOT NULL REFERENCES admin_users(id),
  action        TEXT NOT NULL,               -- 'material.update' / 'bundle.publish' / 'player.grant' ...
  entity_before JSONB, entity_after JSONB,
  ip            INET, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE admin_users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,               -- argon2id
  role          TEXT NOT NULL,               -- super | designer | ops | cs | viewer
  totp_secret   TEXT,                        -- 强制开启
  status        TEXT DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

### 5.4 实体关系总览

```
players 1──1 saves            players 1──* wallet_ledger
players 1──* level_results    players 1──* events
chapters 1──* levels ──*── wave_sets
materials / block_types / items / skills / pets / ant_configs / balance_consts（独立配置表）
content_bundles 1──* release_rules（灰度）
admin_users 1──* admin_audit
```

---

## 六、API 设计

REST + JSON，`/api/v1` 玩家端、`/admin/api/v1` 管理端。玩家端只暴露**最小面**——客户端是不可信的。

### 6.1 玩家端

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/auth/device` | 首启注册：客户端生成 device_id，换 JWT（含 bundle 版本协商） |
| POST | `/api/v1/auth/upgrade` | 匿名 → 手机号/微信绑定（保留原进度） |
| GET  | `/api/v1/content?cur=<ver>` | 内容握手：携带本地版本，未变返回 304，变了返回全量包 + 新版本号（内容包整包一般 < 200KB，无需增量协议） |
| GET  | `/api/v1/save` | 拉云存档（含 `client_rev`） |
| PUT  | `/api/v1/save` | 推云存档（LWW，见 §11.3） |
| POST | `/api/v1/levels/:id/result` | 上报对局结果（服务端校验 + 记 `level_results` + 更新榜单） |
| GET  | `/api/v1/leaderboard?scope=global\|chapter\|level` | 线上榜单（Redis ZSET） |
| POST | `/api/v1/events` | 埋点批量上报（≤50 条/批，客户端 30s 或退后台时冲刷） |
| POST | `/api/v1/redeem` | 兑换礼包码 |

刻意**不做**的玩家端接口：金币直改、道具直发、存档字段级 patch（全走整档 + 服务端流水）；
关卡解锁状态修改（服务端按 `level_results` 推导，不信任客户端 `unlocked`）。

### 6.2 管理端（全部走 RBAC + 审计）

| 分组 | 端点（代表） | 说明 |
|---|---|---|
| 登录 | `POST /admin/auth/login`（密码+TOTP） | 会话 2h 滑动过期 |
| 用户 | `GET /admin/users?q=`、`GET /admin/users/:id` | 检索 + 详情（存档、成绩、流水、封禁） |
| 用户 | `POST /admin/users/:id/grant` | 补发金币/道具（写 wallet_ledger，客服有日限额） |
| 用户 | `GET /admin/users/:id/save/history` | 存档历史版本，可一键回滚 |
| 内容 | `GET/PUT /admin/content/{materials\|blockTypes\|items\|skills\|pets\|antConfigs\|balance}` | 逐表 CRUD，写即存 draft |
| 内容 | `GET/PUT /admin/content/chapters[/:id]`、`/admin/content/levels[/:id]` | 章节/关卡编辑 |
| 内容 | `POST /admin/content/validate` | 手动触发内容 CI（发布前必过） |
| 内容 | `POST /admin/publish`（body: 范围 + rollout + 备注） | 从 published 实体打包 → CI → 出 bundle |
| 内容 | `POST /admin/releases/:id/rollback` | 秒级回滚到历史 bundle |
| 运营 | `/admin/ops/{announcements\|switches\|giftcodes\|experiments}` | 公告、远程开关、礼包码、A/B |
| 数据 | `GET /admin/analytics/dashboard?range=` | 看板聚合 |
| 数据 | `GET /admin/analytics/levels` | 关卡漏斗/难度分布 |
| 审计 | `GET /admin/audit?admin_id=&action=` | 只读 |

### 6.3 通用约定

- 玩家端错误码三段：`AUTH_*` / `CONTENT_*` / `RATE_*`；管理端直接 4xx + message。
- 限流：玩家端按 device 60 req/min；上报类 10 req/min；管理端按账号 300 req/min。
- 所有时间 ISO8601 UTC；所有 ID 与游戏内字符串保持一致（`'soil'`、`'chenghe-metropolitan'`）。

---

## 七、管理后台功能与页面设计

### 7.1 信息架构（左侧导航）

```
📊 仪表盘          核心指标、今日概览、异常告警
👥 用户管理        列表 / 详情（存档·成绩·流水·封禁）
🧱 方块工厂        ├ 方块类型（谁放的）
                   ├ 建筑材质（皮肤+六轴属性）   ← 方块编辑器，见 §8
                   └ 属性轴定义（STAT_SPECS，只读+超管可改基准值）
🎨 关卡设计        ├ 章节管理（7 章 · 天气主题 · 美术）
                   ├ 关卡列表（56 关，表格视图）
                   └ 关卡编辑器（表单+预览+模拟）  ← 见 §9
🐜 敌人配置        兵种 / 性格 / 波次表 / 耐久池
🎒 道具与技能      道具（8 种）/ 技能（8 项）/ 宠物（5 只）
⚖️ 平衡常数        星级阈值、金币公式、连击恢复档位、SWAY_START_P…
🚀 发布中心        内容包列表 / CI 结果 / 灰度放量 / 回滚
📣 运营中心        公告 / 远程开关（无尽模式、排位赛的占位开关）/ 礼包码 / A/B
📈 数据分析        留存 / 关卡漏斗 / 经济产出消耗 / 排行榜运营
🛡️ 系统设置        管理员账号 / 角色 / 审计日志
```

### 7.2 仪表盘

- **第一屏四卡**：DAU、新增、次留（D1/D7）、人均对局数。
- **进度健康**：56 关的「尝试人数 → 通关人数」漏斗条形图，一眼看出弃坑关；
  每关平均尝试次数 / 平均星级 / 复玩率（对应现有 `level_results` 聚合）。
- **经济**：金币产出（对局+星级加成）vs 消耗（商店）曲线，产出/消耗比 < 1 要预警通胀。
- **异常**：CI 失败、`RATE_*` 限流飙升（疑似刷分）、上报 score 超出理论上限（见 §11.4）的条数。

### 7.3 用户详情页

头部：昵称/设备/注册与最近活跃/状态。四个标签页：
1. **进度**：金币、总星 X/168、每章通关矩阵（复用游戏章节色板）、装备材质、携带宠物。
2. **存档**：当前云存档 JSON 树视图（按 `defaultSave()` 的结构渲染）+ 最近 20 个历史版本 + 回滚按钮。
3. **对局**：`level_results` 分页，可按关卡过滤。
4. **干预**：补发金币/道具（弹窗填数量与理由 → 写流水与审计）、封禁/解封、重置存档（需超管二次确认）。

---

## 八、方块编辑器详细设计

### 8.1 交互布局（材质编辑页为例）

```
┌────────────────────────────────────────────────────────────┐
│ 材质列表(左栏)   │  编辑区(中栏)              │ 实时预览(右栏) │
│ ● 泥土  已发布   │  名称 [乌金]  价格 [1700]   │ ┌──────────┐ │
│ ● 混凝土 草稿    │  描述 [吸收雷光的…]         │ │ 单块预览  │ │
│ ● 钢材          │  配色 亮[#777099] 暗[#211b35]│ │(drawBlock │ │
│ ● 青铜          │  ── 六轴属性（滑杆+数值）──  │ │  Face)   │ │
│ ● 乌金          │  基础宽度   [100]  (基准100) │ └──────────┘ │
│                 │  基础耐久   [24.3] (基准18)  │ ┌──────────┐ │
│ [+ 新建材质]     │  基础重量   [10]  (基准10)  │ │7层堆叠场景│ │
│                 │  基础硬度   [20]  (基准5)   │ │(带摇摆)   │ │
│                 │  基础摩擦   [10]  (基准10)  │ └──────────┘ │
│                 │  基础韧性   [0]   (基准0)   │ 换算效果实时: │
│                 │                            │ ·雷击上限1层 │
│                 │  [保存草稿] [试听落地音]     │ ·打滑×1.0    │
└────────────────────────────────────────────────────────────┘
```

### 8.2 关键设计决策

1. **编辑的是基础值，展示的是换算结果**。右栏实时跑 `EFFECT_FROM_STATS`（直接 import
   `src/data/blocks.js`）显示「雷击上限 1 层 / 落偏保边 25% / 风推 ×0.75」，策划改「硬度 20」
   立刻看到「雷击从 3 层降到 1 层」。**换算公式本身不进后台**（§2.2 边界），编辑器只读调用。
2. **预览复用真实渲染器**：右栏 `<canvas>` 直接调 `drawBlockFace(ctx, rect, { colors, materialId, theme }, opts)`，
   堆叠场景照抄图鉴 `sceneDraw()`（`docs/CODEX.md` 规则①，后台与玩家看到的一像素不差）。
   材质配色编辑时预览立即重绘，无需保存。
3. **音色试听**：材质落层/切除音走 `Audio.setMaterial() + drop()/cut()`（规则③同款），
   商店「装备即试听」的既有交互在后台原样保留。
4. **数值护栏**：六轴各设软区间（如耐久 7~46、价格 0~9999），出界只警告不阻断；
   但**雷击/雹伤这类直接改通关率的轴**联动显示「影响关卡：霆川 8 关 / 砺川 8 关」，
   提醒策划跑一遍这两章的节奏模拟（§9.4）。
5. **新建材质的上线流程**：草稿 → `content validate`（CI 全量跑）→ 灰度（如 10% 设备）
   → 全量。**材质 ID 一旦发布不可改名**（存档 `materials`/`equippedMaterial` 按字符串引用），
   下架走 `retired`（存量玩家保留拥有状态，商店隐藏）。
6. **方块类型（blockTypes）编辑器同构**，但默认只读 + 超管解锁：类型（标准层/地基/烈焰层/追击层）
   与引擎技能耦合太深（烈焰层「不计分不产金币」是写死在结算里的），后台改外观配色安全，
   改行为字段风险高，第一期限编辑 `art` 与 `stats`，行为字段走代码评审。

---

## 九、关卡编辑器详细设计

这是后台的皇冠。设计目标：**策划不写代码、不看 JSON，也能造出一关，并且发布前机器替他试玩验证。**

### 9.1 关卡列表 → 编辑器

列表按章节分组（用各章 `art.accent` 着色），列：ID / 城市·地点 / 目标层数 / 天气 / 晃动 / 状态 / 星均分。
点进单关 → 编辑器三栏：

```
┌────────────────────────────────────────────────────────────────┐
│ 参数区(左)          │ 画布预览(中,420×720 逻辑画布等比)   │ 校验(右) │
│ 城市 [中澜市]       │ ┌─────────────────────────────┐  │ ✓ 通过  │
│ 地点 [中央高塔区]   │ │      ⛅ 天气:暴雨 intensity   │  │ △ 2 警告 │
│ 地标 [centralTower] │ │   ▓▓▓▓ 塔顶(实时层数)        │  │  ·雨歇比 │
│ 目标层数 [100]      │ │  ▓▓▓▓▓▓   < 预设5.2s        │  │   例偏短 │
│ 基础速度 [150]      │ │ ▓▓▓▓▓▓▓▓    低于章均值-38%   │  │ ✗ 0 阻断 │
│ 充能需求 [8]        │ │ 🐜🐜 工蚁×2 锁定第3层        │  │  ·咬击0次│
│ 晃动 sway [0.14]    │ │ ═══地基═══                   │  │ [重跑模拟]│
│ ── 天气(按章节kind) │ │  [▶试玩] [⏩ 模拟完美局]      │  │           │
│ 强度 [0.42] 活跃[5] │ └─────────────────────────────┘  │ [保存草稿] │
│ 静歇[5.2] 方向[1,-1]│                                    │ [提交CI]  │
│ ── 蚂蚁波次         │                                    │           │
│ 波次表 [default-5]  │                                    │           │
│ (可展开逐波编辑)     │                                    │           │
└────────────────────────────────────────────────────────────────┘
```

### 9.2 参数表单的「按章节变形」

天气参数组随 `chapter.weatherKind` 动态渲染（这正对应 levels.js 里各章 stages 字段的差异）：

| 章节 weatherKind | 表单字段 |
|---|---|
| clear | 无天气组 |
| wind | intensity / directions[] / active / calm |
| cloud | density / active / calm |
| lightning | intensity / active / calm / strikeChance |
| rain | rainDir / intensity / active / calm |
| snow | coverage（+可选 intensity） |
| hail | intensity / active / calm（雹伤曲线读全局平衡常数） |

表单校验直接移植 `verify-chapter.mjs` 的规则：target ∈ [10, 200]、`active+calm` 合理区间、
雨方向量归一化、strikeChance ∈ [0,1] 等。

### 9.3 画布预览（所见即所得）

- 中栏就是游戏本体：`new GameEngine({ canvas, level: draftLevel, ... })`，
  引擎本来就接受外部传入的 level 对象（verify 脚本全是这么用的）。
- **[▶试玩]**：真实可玩，落地/切宽/蚂蚁/天气全部真实发生——策划在后台就能手感测试。
- **[⏩ 模拟完美局]**：接一个自动玩家（`verify-campaign-cadence.mjs` 的完美节奏落块器抽成公共模块），
  30 秒内跑完整关，产出：通关与否、总咬击数、冰雹/雷击命中数、天气活跃占比、预计时长。
- 预览器读**草稿内容包**（不是线上包），材质/蚂蚁若也在草稿态，联动生效。

### 9.4 自动校验（发布阻断线）

对单关/整包，服务端无头跑现有 verify 链 + 新增关卡健康规则：

**硬阻断（失败禁止发布）**——全部从现有脚本移植：
1. `verify-chapter`：关卡参数合法性、天气字段随 kind 匹配、安全操作区、跨章解锁链完整。
2. `verify-campaign-cadence`（新增关卡必须跑）：完美节奏整局，**0 咬击关 = 阻断**（历史 P0 复发线）、
   砺川类冰雹关命中数必须 > 0、雷击关 strikeChance > 0 时雷击必须真的发生。
3. `verify-lightning` 同理覆盖新增雷电关。
4. 关卡 ID 唯一且不与历史 ID 冲突；章节内连续；新增章节 number 递增。

**软警告（提示不阻断）**：
- 雨歇/静歇时长低于同章均值 30%+（手感风险）；
- 目标层数偏离章内节奏曲线（当前 30→100 等差）2σ；
- 蚂蚁波次与章节难度不匹配（如第 8 关还在用 stage-1 波次表——正是现在已知的「波次不随章节分化」问题，后台化后顺手解决）；
- 单关模拟时长 > 3 分钟（休闲游戏节奏线）。

**CI 产出物**：每关一段 10 秒 GIF/序列帧 + 指标 JSON，存对象存储，附在 bundle 上供发布审批人看。

### 9.5 关卡上线与兼容

- 新关卡 = 新 bundle 版本；客户端握手发现新版本拉全量包。
- **老玩家兼容**：新关 ID 延续全局序列（57、58…）；存档 `stars`/`bestScores` 缺键由
  `mergeDeep` 自动补 0（现有机制，零改造）；删关卡**不允许物理删除**，只 `retired`
  （已获星的保留成绩，选关列表隐藏）——否则总星数 168 的分母变化会引发榜单口径混乱。
- 「无尽模式 / 排位赛」当前是禁用按钮，正好用后台「远程开关」控制解锁时机，不用发版。

---

## 十、内容发布流水线与内容 CI

```
策划改内容(草稿) ──▶ 保存(draft) ──▶ 提交校验 ──▶ CI Worker
                                                   │ 无头跑 11 套 verify
                                                   │ + 新关卡健康规则(§9.4)
                                                   ▼
                                              通过？──否──▶ 打回，附失败断言清单
                                                   │是
                                                   ▼
                              打包 content_bundle v2.5.0（不可变快照 + CI 摘要 + GIF）
                                                   │
                                                   ▼
                              发布审批(超管) ──▶ 灰度 10%(按 device hash) ──▶ 观察 KPanel
                                                   │ 指标正常（崩率/时长/通关率）
                                                   ▼
                                              全量 100% ──▶ 归档
                              
任何时刻可 ──▶ rollback 到任意历史 bundle（客户端下次握手即回退，秒级生效）
```

- **CI Worker 实现**：一个 Node 容器，checkout 游戏仓库的引擎层（`src/core` + `src/data` 的代码逻辑），
  把草稿 JSON 生成成临时 `src/data` 模块（内容与代码同构，见 §12.1），跑 `npm run test:all`。
  现有 11 套脚本**原封不动复用**——这是本方案里性价比最高的一条：几百条断言的白嫖。
- **内容包体积控制**：56 关 JSON 实测 < 100KB，整包下发 + ETag 足够；不做差量。
- **客户端兜底**：握手失败/超时 3s → 用本地缓存包（上次成功的）→ 再没有 → 用打包内置默认包。
  内容包永远双写本地，保证离线可玩。

---

## 十一、用户数据与防作弊

### 11.1 信任模型

休闲单机游戏，风险等级中等。原则：**不追求绝对防作弊，追求「榜单可信 + 经济不崩」**。
单人数据（自己进度）放宽，**公共可见物**（排行榜、未来排位）和**经济**（金币→道具）从严。

### 11.2 金币与道具：服务端账本

- 对局结束上报 `level_results` 时，服务端**按同一套公式重算**金币：
  公式代码（`width/10` 取整 + 星级加成 + 双倍卡 + 点石成金 + 星辉猫倍率）就在 `runStats.js`/`gameEngine.js`，
  抽成 `shared/economy.js` 供客户端与服务端共同 import——**同一份代码，不存在两套公式漂移**。
- 金币入账写 `wallet_ledger`；客服补发也走同一条账本。客户端金币数只是显示层，登录同步时以账本+存档对账。
- 道具购买在服务端校验「金币够不够」再扣（防内存改器刷商店）；离线购买允许本地先行，上线对账冲正。

### 11.3 存档同步：LWW + 字段级保底

- `client_rev` 单调递增，整档 Last-Write-Wins（换设备冲突时取 rev 高的）。
- 三类字段**服务端强制保底不回退**：`stars`（逐关取 max）、`bestScores`（逐关取 max）、
  `materials.owned`（一旦 true 永不 false）——防止旧设备同步把新进度覆盖回去了。
- 同步前先跑 `normalizePets` + `mergeDeep`（直接复用 `storage.js` 现有函数，逻辑同源）。

### 11.4 成绩可信（排行榜专用）

上报分数做三层廉价校验：
1. **理论上限**：score ≤ target × 本局初始宽度（README 记录的满分公式），超限直接丢弃并计数告警；
2. **节奏合理性**：duration_s 与 层数/落块节奏下限比对（一秒落 20 层不可能）；
3. **签名**：客户端用会话密钥对 `(player_id, level_id, score, ts)` 做 HMAC（密钥握手下发、定期轮换），
   防脚本裸调 API。被拒样本进「可疑上报」看板，人工复核后封禁。

第一版不做录像回放（过度设计），但 `level_results.meta` 预留落层时序数组字段，未来排位赛要证据链时再启用。

### 11.5 隐私合规

- 只收必要数据：设备号、进度、对局指标；不收通讯录/位置等。
- 提供存档导出与账号删除接口（个保法要求）；`players.status='deleted'` 软删 + 匿名化 events。
- 管理后台展示用户数据默认脱敏，导出需二次审批并写审计。

---

## 十二、客户端改造方案

### 12.1 第一步：内容与代码分离（Phase 0，纯前端，不发后端也能做）

现状 `src/data/*.js` 是「数据 + 少量派生函数」混住。拆法：

```
src/content/
  defaults/          ← 从 src/data 抽出的纯 JSON（构建时打包内置）
    levels.json  materials.json  blockTypes.json  items.json
    skills.json  pets.json  ants.json  balance.json
src/data/            ← 保留全部函数与解析逻辑（getMaterial/statsOf/modOf/antWavesForLevel…），
                        但数据源改为 ContentProvider 注入，不再硬编码字面量
src/core/content.js  ← 新增 ContentLoader：
                        init() → 握手远端 → 校验版本 → 注入 data 层
                        失败回退链：远端 → localStorage 缓存包 → 打包默认包
```

- 关键约束：`data/*.js` 对外导出的函数签名**一个都不变**（`levels.js` 仍导出 `LEVELS` 常量，
  只是它变成 ContentLoader 填充后的视图），引擎、组件、11 套 verify 全部零改动。
- verify 脚本在本阶段照常跑（默认包就是数据），CI Worker 在 Phase 2 用「生成临时数据文件」的方式复用同一批脚本。

### 12.2 第二步：存档云同步（Phase 1）

`storage.js` 的 `backend` 抽象扩成双写：

```js
// 现有：read/write/remove 指向 localStorage
// 扩展：CloudBackend 装饰器
const backend = cloudEnabled
  ? cloudTandem(localStorageBackend, apiClient, { onConflict: lwwWithFloor })  // 本地立刻写，云端异步同步
  : localStorageBackend
```

- 本地写永远即时（离线可玩），云端同步 30s 节流 + 退后台/结算时冲刷。
- 登录态：首启静默 `auth/device`；玩家无感知，「更多 → 设置」里给「云端进度」开关与手动同步按钮。
- 排行榜页替换数据源：`Leaderboard.vue` 的 `samplePilots` 换成 `/api/v1/leaderboard`，
  失败回退本地样例（现状代码原样保留作离线兜底）。

### 12.3 第三步：埋点（Phase 1 末）

复用「核心不 import store、引擎回调外抛」的既有架构：

```js
// gameEngine.js 已有 this.onSeen = opts.onSeen || (()=>{})
// 同模式新增（只是加回调出口，核心零依赖）：
this.onLevelEnd   = opts.onLevelEnd   || (() => {})   // 对局结束（结算数据已在）
this.onShopBuy    = opts.onShopBuy    || (() => {})
// GameView.vue / App.vue 接线 → 批量缓冲 → POST /api/v1/events
```

埋点清单（MVP）：`session_start/end`、`level_start/fail/complete`（带 max_combo、失败层数）、
`shop_view/buy`、`skill_upgrade`、`charge_burst`（烈焰释放）、`settings_change`。
每个事件都在 App 层接线，`src/core` 保持纯净（图鉴规则 ⑤ 的延续）。

### 12.4 改造量评估

| 模块 | 改动 | 风险 |
|---|---|---|
| `src/data/*` 数据字面量 → JSON 注入 | 机械搬移，函数不动 | 低；verify 全量护航 |
| `storage.js` | +CloudBackend 装饰器（~120 行） | 低；接口不变 |
| `store.js` | +同步状态字段（syncing/lastSyncAt） | 低 |
| `Leaderboard.vue` | 数据源换接口 + 兜底 | 低 |
| `GameView.vue`/`App.vue` | 埋点接线（~80 行） | 低 |
| 引擎 `gameEngine.js` | **零改动**（回调已有） | — |

---

## 十三、实施路线图

四个 Phase，每个结束都是**可上线的独立增量**，随时可停在任一阶段。

### Phase 0 · 内容数据化（纯客户端，~1 周）

- 抽 `src/content/defaults/*.json`，`data/*.js` 改为 ContentProvider 注入（§12.1）。
- 验收：`npm run test:all` 11 套全绿（零断言改动）；构建体积差 < +2KB。
- **价值**：从此「改内容」=「改 JSON」，后台化的一半地基打好；即使永远不做后端，
  改数值也不用碰代码了。

### Phase 1 · 最小后端：账号 + 云存档 + 线上排行（~2 周）

- Fastify + PG（或 Supabase 捷径）+ Docker Compose。
- 玩家端 6 个接口：auth/content/save/result/leaderboard/events。
- 管理后台骨架 + 用户列表/详情 + 存档历史回滚（Vue3 + Element Plus，先只做这一块）。
- 验收：双端进度互同步、断网可玩、排行榜显示真人、删档恢复演示。

### Phase 2 · 内容后台（~3~4 周，核心价值）

- 方块/材质编辑器（§8）、道具/技能/宠物/蚂蚁配置表单。
- 关卡编辑器：表单 + 真实引擎预览 + 完美局模拟（§9）。
- 内容 CI Worker：草稿包 → 生成临时 data → `npm run test:all` → 报告（§10）。
- 发布中心：bundle 打包、灰度、回滚、审批。
- 验收：策划全程不碰代码新增 1 关 + 1 材质，CI 拦截一个故意做坏的关卡（如 0 咬击），
  灰度 10% → 100% → 回滚全流程演练。

### Phase 3 · 运营与数据（~2 周）

- 公告/远程开关（含无尽模式、排位赛占位按钮的解锁开关）/ 礼包码 / A/B。
- 仪表盘 + 关卡漏斗 + 经济看板；审计日志页。
- 埋点扩充与留存分析。

### Phase 4 · 进阶（按需排期）

- 防作弊强化（HMAC 升级、可疑榜单独立）、赛季榜、好友榜；
- 无尽模式/排位赛玩法上线时配套的实时服务；
- 多内容包并行实验（同关卡不同参数的 A/B 到达关卡层）。

**依赖关系**：Phase 1、2 可并行开工（2 不依赖 1 的账号体系，编辑器先对着默认包跑）；
Phase 3 依赖 1+2。总计核心路径 **~8 周**（1 全栈 + 1 策划兼职）。

---

## 十四、工作量估算与团队配置

| Phase | 后端 | 前端/后台UI | 测试/验收 | 合计(人日) |
|---|---|---|---|---|
| 0 内容数据化 | — | 4 | 2 | 6 |
| 1 账号+云存档+榜 | 8 | 5（后台骨架+用户页） | 3 | 16 |
| 2 内容后台+CI+发布 | 10（CI/打包/灰度） | 12（编辑器×2） | 4 | 26 |
| 3 运营+数据 | 6 | 5 | 3 | 14 |
| **合计** | **24** | **26** | **12** | **~62 人日** |

- 最小可行团队：1 全栈（Node+Vue）+ 策划兼职验收；Phase 2 编辑器 UI 重的两周建议借 1 名前端。
- 运维：单台 4C8G（Docker Compose：API×2 + PG + Redis + Admin + CI Worker）足够支撑
  **日活数万级**；内容包与静态资源上 CDN。

---

## 十五、风险与对策

| 风险 | 概率 | 对策 |
|---|---|---|
| 内容后台化后，配置与引擎能力脱节（后台配了引擎不支持的天气 kind） | 高 | CI 硬阻断 + 表单枚举直接从代码常量生成（`weatherKind` 列表 import 自 `weather.js`） |
| 云存档覆盖丢进度（玩家最痛事故） | 中 | LWW + 三类字段保底不回退（§11.3）+ 服务端存 20 版历史可回滚 + 灰度期双写观察 |
| 灰度发布出坏平衡（某材质过强） | 中 | 灰度按设备 hash 固定分组（同一玩家不会反复横跳）；KPanel 监控该组通关率/经济异常自动告警 |
| 刷榜/改分 | 中 | 理论上限 + 节奏校验 + HMAC 三层（§11.4），休闲游戏不追绝对安全 |
| `src/data` 重构破坏 11 套回归 | 低 | Phase 0 验收线就是「断言零改动全绿」；CI 逐 PR 跑 |
| 后台自身安全（管理端被打穿） | 低但致命 | 独立域名 + VPN/白名单 + TOTP 强制 + 全操作审计 + 敏感操作双人审批 |
| 单人维护精力分散 | 高 | 严格按 Phase 停点交付；Phase 1 可用 Supabase 砍掉一半后端工作量 |

---

## 十六、附录

### 16.1 管理后台菜单树（完整）

```
/admin
├── /dashboard                 仪表盘
├── /users                     用户列表
│   └── /users/:id             用户详情（进度|存档|对局|干预）
├── /content
│   ├── /blocks/types          方块类型
│   ├── /blocks/materials      建筑材质（六轴编辑器）
│   ├── /blocks/stats          属性轴基准（超管）
│   ├── /levels                关卡列表（按章节分组）
│   │   └── /levels/:id/edit   关卡编辑器
│   ├── /chapters              章节管理
│   ├── /ants                  兵种/性格/波次/耐久
│   ├── /economy               道具/技能/宠物
│   └── /balance               平衡常数
├── /publish                   发布中心（bundles/灰度/回滚）
├── /ops                       运营（公告/开关/礼包码/AB）
├── /analytics                 数据（漏斗/留存/经济/榜单）
└── /system                    管理员/角色/审计
```

### 16.2 内容包 JSON 顶层结构

```jsonc
{
  "version": "2.5.0",
  "generatedAt": "2026-10-06T00:00:00Z",
  "balance": { "starThresholds": [0.7, 0.85], "swayStartP": 0.3, "...": "…" },
  "chapters": [ { "id": "chenghe-metropolitan", "number": 1, "weatherKind": "clear", "art": {}, "...": "…" } ],
  "levels":   [ { "id": 1, "chapterId": "chenghe-metropolitan", "target": 30, "weather": {}, "...": "…" } ],
  "blockTypes": [], "materials": [], "items": [], "skills": [], "pets": [],
  "ants": { "species": {}, "personalities": {}, "prototype": {}, "durability": {}, "waveSets": {} }
}
```

与 `src/data/*.js` 逐字段同构——这是「CI 直接复用现有 verify」的前提。

### 16.3 从游戏现状到后台字段的映射总表

| 游戏内概念 | 代码出处 | 后台位置 |
|---|---|---|
| 56 关卡参数 | `levels.js` LEVELS | 内容 → 关卡编辑器 |
| 章节天气主题/美术 | `levels.js` CHAPTERS | 内容 → 章节管理 |
| 六轴属性基准 | `blockStats.js` STAT_SPECS | 内容 → 方块 → 属性轴 |
| 材质（皮肤+属性+价格） | `materials.js` | 内容 → 方块 → 材质 |
| 方块类型 | `blockTypes.js` | 内容 → 方块 → 类型 |
| 道具 8 种 | `items.js` | 内容 → 经济 → 道具 |
| 技能 8 项 | `skills.js`（效果值在 `runStats.js`） | 内容 → 经济 → 技能 |
| 宠物 5 只 | `pets.js`（效果在 `petSystem.js`） | 内容 → 经济 → 宠物 |
| 蚂蚁兵种/性格/波次/耐久 | `ants.js` | 内容 → 敌人 |
| 星级阈值/金币公式等常数 | README §三 + `gameEngine.js` | 内容 → 平衡常数 |
| 存档 14 类字段 | `storage.js` defaultSave | 用户详情 → 存档 |
| 图鉴遭遇记录 | `storage.js` seen | 用户详情 → 存档（子树） |
| 排行榜样例 8 角色 | `Leaderboard.vue` | 运营 → 榜单（Phase 1 后由真人榜替代） |
| 无尽模式/排位赛占位 | `MainMenu.vue` 禁用按钮 | 运营 → 远程开关 |
| 11 套回归断言 | `scripts/verify*.mjs` | 发布中心 → 内容 CI |

### 16.4 第一周就能开工的任务清单

1. 抽 `levels.json`（先只抽 levels/chapters，最小闭环）→ data 层注入 → 全量 verify 绿。
2. `storage.js` 加 `cloudTandem` 装饰器骨架（先本地 mock API）。
3. Fastify 脚手架 + `players/saves/content` 三表 + `POST /api/v1/auth/device`。
4. 管理后台脚手架 + 用户列表页（此时库里还没有真人，先造 seed 数据）。

---

## 与现有文档的关系

- 现状部分与 `README.md`（2026-10-06 校订版）一致；冲突时以源码为准。
- 方块属性模型细节见 `docs/BLOCK_ATTRS.md`；图鉴预览复用规则见 `docs/CODEX.md`；
  敌人/天气历史问题与回归线见 `docs/ENEMY_WEATHER_AUDIT.md`；宠物系统见 `docs/PET_SYSTEM.md`。
