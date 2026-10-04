# 敌人系统 / 天气系统 现状审计

> 日期：2026-10-02 · 分支 `arena/01a0fee5-gaidaoyueqiu2` · 基线 `084f57d`
> 方法：阅读 `src/core/antSystem.js`、`src/core/weather.js`、`src/data/ants.js`、`src/data/levels.js`、`src/core/gameEngine.js`，
> 并用无头 `GameEngine` 把全部 56 关 × 2 种玩家水平（完美落点 / 偶尔失准）各跑一遍共 112 局，统计实际发生的咬击、伤害、天气窗口。
> 现有 4 套回归脚本（271 + 56 关 + 22 + 导航）在修改前全部通过——下面的问题都不是“测试红了”，而是**测试覆盖不到的端到端层面**。

---

## 一、一句话结论

两套系统的**代码都写完了，但在真实对局里几乎不发生**：蚂蚁在 56 关里有 35 关一次都咬不到塔，整个砺川冰雹章（8 关）的冰雹从头到尾不会落下一次。同时还有一整套**永远执行不到的旧天气系统**（约 300 行）和与之绑定的乌金材质效果。

---

## 二、实测数据

### 2.1 全campaign扫描（56 关 × 完美 / 失准 两种玩法 = 112 局）

| 天气章节 | 关数 | 蚁咬击合计 | 蚁造成伤害合计 | 冰雹命中 | 天气活跃时间占比 |
|---|---:|---:|---:|---:|---:|
| 澄河 clear | 8 | 5 | 10 | 0 | 0%（设计如此）|
| 岚河 wind | 8 | 1 | 2 | 0 | 35% |
| 云岫 cloud | 8 | 7 | 14 | 0 | 37% |
| 霆川 lightning | 8 | 5 | 10 | 0 | 23% |
| 雨汀 rain | 8 | 2 | 5 | 0 | 35% |
| 雪岑 snow | 8 | 3 | 8 | 0 | 0%（纯视觉）|
| 砺川 hail | 8 | 4 | 8 | **2** | **0%** |

- **蚂蚁全程 0 次咬击的关卡：35 / 56**
- 112 局合计只有 27 次咬击、57 点伤害、**0 次楼层坍塌**
- 砺川章（主打冰雹）天气活跃 0%，16 局里只蹭到 2 次冰雹

### 2.2 单关细查（第 8 关，100 层）

| 玩家水平 | 时长 | 咬击 | 耐久伤 | 宽度伤 | 坍塌 | 蚂蚁被震击 |
|---|---:|---:|---:|---:|---:|---:|
| 完美落点 | 108s | **0** | 0 | 0 | 0 | 15 |
| 偶尔失准 | 18s（失败）| 0 | 0 | 0 | 0 | 0 |
| 慢速（每 6s 才落一层）| 683s | 132 | 169 | 192 | 0 | 25 |

> 只有把节奏放慢到正常速度的 6 倍，蚂蚁才开始产生存在感。

---

## 三、敌人系统（`antSystem.js` 994 行 + `ants.js` 90 行）

### 3.1 根因：攻击循环比玩家节奏慢一个数量级

一只蚂蚁从锁定到**第一次真正扣血**需要：

```
攀爬 + 预告 1.2s（暴躁 +0.8s，同层错峰每只再 +0.55s）+ 第一段间隔 1.8s
≈ 实测 5.23s
```

而玩家**每一次有效落层**都会触发扫描震击：Perfect 扫 4 层 / Great 3 / Good 2 / Bad 1，命中的蚂蚁 `-2HP`、**清空目标**、进入 `stunned` 0.45s，然后要从「选目标 → 攀爬 → 预告 → 咬击」整轮重来。

实测正常玩家 **1.1 秒落一层**。5.2 秒的起手 vs 1.1 秒的打断周期 → 蚂蚁永远停在 `climb`/`windup`，`bite` 阶段活不过第一段。

### 3.2 根因：即使不被打断，数值也咬不动

| 兵种 | HP | 一轮耐久伤 | 一轮耗时 | 等效 DPS |
|---|---:|---:|---:|---:|
| 工蚁 | 12 | 4 | 4.8s | 0.83 |
| 斥候 | 10 | 6 | 6.6s | 0.91 |
| 钳甲兵 | 16 | 12 | 6.6s | 1.82 |
| 蚁后 | 24 | 8 | 4.8s | 1.67 |

满宽楼层耐久（泥土）= **46**，乌金 = 62。

- 单只工蚁啃塌一层需要 **约 55 秒不被打断**
- 同层限伤 `6 点 / 2 秒`，即使 3 只同时啃，**理论最快也要 15 秒**
- 而玩家每 1.1 秒就会把它们全部重置

→ 耐久系统（`durabilityForWidth`、`MATERIAL_DURABILITY_MULTIPLIERS`、`damageState`、`collapseFrom('ant')`、地基坍塌全塔）在正常对局中**从未被触发过**。

### 3.3 内容：56 关只有 8 套敌人配置

`antWavesForLevel(level)` 只读 `chapterStage`（1–8），**完全不读 `chapterId`**。
→ 砺川第 3 关和澄河第 3 关的蚁群**一模一样**；7 个章节之间敌人**零成长**：没有 HP 缩放、没有伤害缩放、没有新兵种、没有新行为。

其它内容缺口：
- 只有 4 个兵种，钳甲兵在 stage 8 的波次里反而不出现（stage 8 用蚁后）
- `_rollPersonality()` 有 **28% 概率返回空字符串** → 该蚂蚁没有任何性格，HUD 显示「无战斗性格」
- 蚁后唯一的 Boss 机制是半血叫一次工蚁增援；没有阶段转换、没有特殊技

### 3.4 配置与文档不一致

| 项 | README 写的 | `ANT_PROTOTYPE_CONFIG` 实际 |
|---|---|---|
| 最多同时存活 | 3 只 | **5 只**（实测跑到 5）|
| 同层最多被锁定 | 2 只 | **3 只** |

### 3.5 算力花在看不见的地方

`AntSystem.hudState()` 每帧为每只蚂蚁构造 20 个字段（兵种、性格、分段伤害预览、`segmentInterval`、`accelerationCount`、`expectedLoss`、扫描游标、候选层、`hitCapacity`、`pauseReason`、`queenReinforcement`…），
`_emitHudIfChanged()` 每帧再对它做一次 `JSON.stringify` 做差分。

**GameView 实际只用了一个字段**：`hud.ants.lastQuality`（一行 Perfect/Great/… 提示）。其余全部算完即弃。
核心的「扫描游标」机制也只在**有屏外目标时**才会被 `_renderOffscreenProfile` 画出来——绝大多数时候玩家完全看不到这套规则。

（开销本身不大：HUD 约 0.9 ms/s、update 2.2 ms/s、render 7.9 ms/s@81 层；属于可优化项，不是瓶颈。）

---

## 四、天气系统（`weather.js` 1025 行）

### 4.1 整套「旧天气系统」是死代码

```js
this.scale = engine.level.weather != null ? engine.level.weather : 1
...
_tryStart(p) { if (engine.status !== 'playing' || this.scale <= 0) { this.timer = 3; return } }
```

`BASE_LEVEL = { speed: 150, chargeNeed: 8, weather: 0 }`，且第一章 8 关也逐条写死 `weather: 0`
→ **全部 56 关 `weather === 0` → `scale === 0` → `_tryStart` 永远提前返回。**

实测 112 局中 `_tryStart` 成功启动天气 **0 次**。随之永不执行的有：

- `WEATHER_DEFS` 的 `unlock` / `weight` / `dur` 三组字段（按高度解锁 16%/30%/45%/58%/74% 的整套节奏）
- `_pool` / `_tryStart` / `_onStart` / `_end` / `_tick`
- `_strike` / `_resolveStrike` / **`_strikeTower`（雷击劈掉 1–3 层）**
- `fogStrength()`（章节模式直接 `return 0`）→ 乌云遮挡视线的玩法不存在
- 经典分支的 `renderBack` / `renderFront` / `swayMult` / `swayFreqMult` / `modifiers` / `slipVelocity`

**连带后果：乌金材质（1700 金币）的卖点「抗雷劈：雷击最多劈掉 1 层」永远不会生效**——`lightningMaxFloors` 只被 `_strikeTower` 读取。
README 第七节那张天气表（强风 16% / 暴雨 30% / 冰雹 45% / 乌云 58% / 雷暴 74%）描述的也是这套永不运行的系统。

### 4.2 砺川冰雹章：8 关的核心玩法从不触发

状态机：

```
chapterTimer → warning(3s) → active(3.6~4.6s，每 interval 削一次顶层宽度) → calm → 循环
```

但 `_updateChapter` 里有：

```js
if (kind === 'hail' && this.engine.dropping) { ... this.current.phase = 'warning'; this.current.phaseTimer = 3; this.current.t = 0; return }
if (this.dropPaused) { this.dropPaused = false; ... this.current.phaseTimer = 3; this.current.t = 0; return }
```

**每落一次方块，3 秒预警就被完整重置。** 实测玩家 **1.1 秒落一层** → 预警永远走不完 → `active` 永远不到。

40 秒追踪里 `phaseTimer` 在 2.1 ↔ 3.0 之间反复横跳，一次都没归零。

> 这不是有人写漏了：`verify-chapter.mjs:212/215` **明确把这个重置断言为正确行为**（「落块期间不结算宽度，保证所见即所得」的公平性规则是对的）。
> 真正的问题是**公平性规则与真实落层节奏的参数冲突**没人算过——测试是靠 `weather.chapterTimer = 0` 手动推进到 active 来验证的，绕开了这个冲突。

另外 `_hitHail` 的章节分支把伤害写死成 `HAIL_DAMAGE`，**完全忽略 `stageConfig.intensity`**，8 关配置的 0.26→0.53 强度曲线只影响 `interval`，不影响削宽。

### 4.3 天气不再随高度变化

`WeatherSystem.update(dt, p)` 收了进度 `p`，但 `_updateChapter(dt, p)` **一次都没用它**。
章节天气是固定 `warning / active / calm` 循环，第 1 层和第 99 层强度完全一样。README 宣称的「随高度解锁 / 加剧」在章节模式下不存在。

### 4.4 两套系统互相压制

```js
get hasGameplayThreat() { return !!this.current && this.current.phase === 'active' && ['wind','rain','hail'].includes(kind) }
// AntSystem._pauseReason(): if (e.weather?.hasGameplayThreat) return 'weather'
```

实测岚河（风）/ 雨汀（雨）两章，蚂蚁有 **34%–45% 的时间被天气冻结**。
本来就打不到塔的蚂蚁，在这两章还有近一半时间直接静止。

### 4.5 天气音效只有起手音

`Audio.weatherWind/Rain/Hail/Smog` 都是 1.2–1.8 秒的一次性 burst，**没有循环环境音**。
一段 4–5 秒的 active 窗口里，后 3 秒完全安静。README 承诺的「风啸、雨声、冰雹噼啪」实际只响开头一下。

### 4.6 其它

- 三章（云岫 cloud / 霆川 lightning / 雪岑 snow，共 24 关）天气**纯视觉**，对玩法零影响
- 全 56 关只有 **3 关**（岚河 14/15/16）`sway > 0`，整套鞭式摆动系统也近乎闲置
- README 引用的 `scripts/verify-pet-center.mjs` 不存在

---

## 五、建议的完善方向（按性价比排序）

### P0 — 让两套系统真的发生

1. **冰雹解锁**（砺川 8 关直接从「无天气」变成「有玩法」）
   不要在落块时整轮重置预警，改成**暂停并保留剩余预警时间**（`dropping` 期间冻结 `phaseTimer`，落定后继续倒数）。
   公平性（落块途中不改宽度）由 `_hitHail` 里已有的 `if (engine.dropping) return` 保证，不需要靠重置预警。
   顺带让 `stageConfig.intensity` 真正参与削宽量。

2. **重做蚂蚁攻击循环的时间尺度**
   目标：让一只蚂蚁在**玩家 2–4 次落层的窗口内**能完成一次有意义的伤害。
   - 预告 1.2s → 0.5~0.7s；`SEGMENT_INTERVAL` 1.8s → 0.6~0.9s
   - 震击不再「清空目标 + 整轮重来」，改为**只打断当前这一段**（保留目标与 `segmentIndex`），或按性格决定是否脱锁
   - 楼层耐久从 46 下调到 12–18 量级，或把蚂蚁单段伤害提高 3–4 倍；同层限伤窗口同步放宽

3. **决定旧天气系统的去留**（二选一，不要继续挂着）
   - **删**：移除 `_tryStart/_onStart/_end/_tick/_strike/_resolveStrike/_strikeTower/_pool/fogStrength` 与 `WEATHER_DEFS` 的 `unlock/weight/dur`，`weather.js` 可瘦身约 300 行；同时**重写乌金材质的卖点**（现在是虚假描述）
   - **留**：把雷击劈层接到霆川章第 7–8 关作为高潮机制，让 `lightningMaxFloors` 和乌金重新有意义

### P1 — 让系统有成长曲线

4. **`antWavesForLevel` 接入 `chapterId`**：7 章 × 8 关 = 56 套配置，至少做到「章节越后，兵种越硬 / 波次越密 / HP 与伤害有系数」。
5. **天气接回进度 `p`**：`intensity`、`active`、`calm` 随本局高度插值，低层温和、高层压迫。
6. **解除互相压制**：`hasGameplayThreat` 收窄到真正改变塔层/可读性的瞬间（如冰雹命中结算那一帧、强阵风峰值），而不是整个 active 窗口；让蚁群与天气**同时**构成压力。

### P2 — 表现与一致性

7. **扫描游标常驻可视化**：现在只在有屏外目标时画，玩家学不会这套核心规则。
8. **精简 `hudState()`**：只算 UI 真正消费的字段；`_emitHudIfChanged` 的每帧 `JSON.stringify` 换成轻量版本号/脏标记。
9. **天气环境音循环**：active 期间持续播放风/雨/雹底噪，结束时淡出。
10. **文档对齐**：`maxAlive` 3↔5、`maxTargetsPerFloor` 2↔3、README 天气表（描述的是死代码）、缺失的 `verify-pet-center.mjs`。
11. **补端到端回归**：现有脚本都在「手动把状态推进到 active / 手动 `spawnBite`」后做单元断言。
    需要加一类**完整对局断言**：「以 1.1s/层 的节奏跑完第 N 关，天气至少 active M 次、蚂蚁至少造成 K 点伤害」——这类测试能直接拦住本次发现的全部 P0 问题。

---

## 六、本次未改动任何功能代码

仅新增本审计文档。4 套回归脚本在审计前后均通过：
`verify.mjs` 271 条、`verify-chapter.mjs` 56 关、`verify-navigation.mjs`、`verify-gameplay-tweaks.mjs` 22 条。
（`verify-chapter.mjs` 需要先 `npm install`，它会 import `vue`。）
