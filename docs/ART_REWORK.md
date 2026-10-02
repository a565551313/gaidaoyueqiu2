# 敌人 / 天气 — 美术表现重做

承接 `docs/ENEMY_WEATHER_AUDIT.md` 的审计结论，本轮**只动渲染，不动玩法数值**。
所有机制、伤害、时序、关卡配置均未改动，4 套回归脚本全绿。

## 1. 蚂蚁 `src/core/antArt.js`（新增）

### 改造前的问题（审计原文）
两个椭圆合并在同一个 `beginPath() + fill()` 里 → 没有细腰、只有 2 节、约 16×6px；
6 条折线腿**完全静态**；单色平涂；**四个兵种几何完全相同，只换颜色**；咬击是一个脉动圆圈。

### 现在
![蚂蚁新旧对比](art/ants-before-after.png)

每行左侧为新造型（5.2× 放大）与实际游戏尺寸，右侧为旧造型（2.4× 放大）作对照。

- **三段式躯体**：腹部（渐变 + 环节纹 + 高光）→ 细腰 → 胸节 → 头（渐变 + 复眼 + 高光）。
- **步态动画**：6 条两段式腿（quadratic + line，末端带抓钩），
  按 `Math.PI * ((i + side) % 2)` 做相位偏移实现**三角步态**——同侧前后腿与对侧中腿同相。
- **兵种差异化**（不再只是换色）：

  | 兵种 | scale | 特征 |
  |---|---|---|
  | 工蚁 worker | 1.12 | 基准比例 |
  | 斥候 scout | 1.05 | 长腿、薄翅、步频 13.5（最快） |
  | 钳甲兵 soldier | 1.36 | 巨颚 5.4、胸节背甲 |
  | 蚁后 queen | 1.58 | 带翅 + 头顶金冠 + 3 道腹纹 |

- **配色**由 `ANT_SPECIES[].color` 主色经 `lighten/darken` 派生，换色方案不用改渲染代码。
- **咬击**改为贴着上颚尖端迸出的碎屑 + 短弧，不再是圆圈。
- 局部坐标 **+X = 朝向**，`antSystem._headingAngle(ant)` 负责 translate + rotate。

调用：`drawAnt(ctx, { speciesId, color, time, seed, walk, bite, flash })`

## 2. 天气 `src/core/weatherFx.js`（新增）

### 改造前的问题（审计原文）
雪花**只有 14 片**；雾带 5 个椭圆；雨是 1.4px 直线、无飞溅；冰雹是白圆点、不旋转；
风在**空中没有任何动态元素**，只有固定在 (62,180) 的静态旗；雷是单条无分叉折线。

### 现在
![六套天气](art/weather-six.png)

| 场 | 内容 |
|---|---|
| `RainField` | 3 层景深（116/104/64 滴）批量 stroke、风切、**落在塔顶时溅开**、雨幕带 |
| `HailField` | 多面冰块翻滚（5–6 面 + 内部棱线）、拖影、迸裂碎片；`impact(x,y,strength)` 供砸中回调 |
| `SnowField` | far 110 / mid 56 / near 22，近景为六角冰晶；`_laneFade(x)` 淡化中央操作通道 |
| `WindField` | 56 条速度线（亮/暗交替，亮天空下也读得出）+ 20 片落叶纸屑 + 阵风脉冲 + 旗 |
| `CloudField` | 多球径向渐变体积云 |
| `makeBolt / drawBolt` | 带分叉的闪电 + 三遍辉光；`drawSkyGlow` 云层背光 |

### 塔顶命中区
原先雨雹的溅射判定写死 `x ∈ (60, 360)`，几乎是整个屏宽 ——
结果所有雨滴都在塔顶高度被回收，**画面下半部分整片空掉**。
现改为 `_impactRect()` 返回真实塔顶矩形（含 `swayOffset`），只有真正落在塔顶上的才溅开。

## 3. 美术检阅台 `lab.html`

`npm run dev` 后访问 **`/lab.html`**。Vite 已配置为第二入口（`vite.config.js` 的 `rollupOptions.input`）。

可调：天气 7 档 / 强度 / 风向 / 手动触发闪电与冰雹 / 四兵种 / 五状态
（climb · windup · bite · stunned · retreat）/ 放大镜 1–5× / `showOld` 并排旧造型。

## 4. 实机效果

![实机](art/ingame.png)

## 5. 性能

真实引擎 + 3 只蚂蚁 + 天气 active，`update + render` 全量 JS 耗时：

| 关卡 | ms/帧 | 占 16.7ms 预算 |
|---|---|---|
| 雨汀（雨） | 0.235 | 1.4% |
| 砺川（雹） | 0.394 | 2.4% |
| 雪岑（雪） | 0.323 | 1.9% |
| 岚河（风） | 0.182 | 1.1% |
| 霆川（雷） | 0.214 | 1.3% |

冰雹与云原本每颗粒子每帧都 `createLinearGradient` / `createRadialGradient`；
改为**单位空间绘制 + 每帧建一次渐变、靠 `scale()` 复用**，冰雹从 0.507 → 0.394 ms/帧。

## 6. 渲染测试的三条硬约束

`scripts/verify-chapter.mjs` 用 mock ctx 追踪绘制调用，重做时必须满足（现均满足）：

1. **云**：`renderFront` 所有 trace 的 `globalAlpha ≤ 0.13`
   —— 前景云的体积感只能靠形状堆叠，不能靠不透明度。
   注意 mock 的 `save()/restore()` **不保存 `globalAlpha`**，
   任何一次绘制前都必须已显式设过值（`undefined <= 0.13` 为 false 会挂测试）。
2. **雪**：`renderFront` 所有 trace 的 `activeClip === null` —— 禁用 `clip()`，
   所以中央通道的淡化靠 `_laneFade(x)` 调 alpha 实现。
3. **雷**：`weather._strike(1)` 之后必须 `flash === 0 && blind === 0`
   —— 章节闪电只写 `this.skyGlow` / `this.skyGlowAt`，不碰 `flash`/`blind`。

另：mock ctx 只追踪
`fillRect/strokeRect/moveTo/lineTo/quadraticCurveTo/bezierCurveTo/arc/ellipse/closePath/fill/stroke`。
改用 `Path2D` / `drawImage` / 离屏 canvas 会让上述断言**静默失效**。

## 7. 本轮未处理（仍待决策）

- **P0 冰雹永不触发**：`_updateChapter` 里落块会把 `phase` 重置为 `'warning'`、`phaseTimer = 3s`，
  40s 一局内 2.1↔3.0 横跳从未归零 ⇒ 砺川冰雹章天气活跃度实测 **0%**。
  冰雹视觉做得再好，真实对局里**一次也看不到**。
  `verify-chapter.mjs:212/215` 把这个重置**断言为正确行为**，修 P0 必须同步改测试。
- **蚂蚁打不到塔**：112 局实测 35/56 关 0 次咬击、合计 0 次坍塌。属数值/时序问题，非美术。

两项都需要改玩法手感，等确认后再动。
