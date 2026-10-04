# 方块属性模型（已实施）

> 这份文档只定义**属性怎么存、怎么读、怎么加**。视觉（第 3/4 步）和图鉴（第 5/7 步）另开。
> 表里每个数字都来自现有代码，文末列了逐条出处。
>
> **状态：第 2 步已落地。** A/B/C 三项全做。差分对拍 515 行签名里 511 行逐字节相同，
> 4 行差异全是有意改的展示文案；4 套 verify 全 PASS。

---

## 1. 一句话模型

一个方块 = **两个正交的配方引用** + **一组运行时状态**。

```js
// 运行时实例（塔上真实存在的东西）
{ id, index, cx, width, durability, maxDurability, scorePts, damageFlash,
  typeId,        // 方块类型：base / normal / flame / pursuit / ...（配方）
  materialId,    // 建筑材质：soil / concrete / steel / bronze / blackgold（配方）
  tags }         // 运行时标记：['perfect'] / ['shield'] —— 落层结果，不是类型
```

属性不存在实例上，**实例只存会变的东西**（宽度、耐久、闪白）。
任何"这块方块的 X 是多少"都现查配方：

```js
modOf(block, 'widthDamage')   // = 类型.mods.widthDamage × 材质.mods.widthDamage × tags 的
```

---

## 2. 今天属性散在 4 个地方

| 在哪 | 存了什么 | 问题 |
|---|---|---|
| `data/materials.js` → `effects{}` | antiSlip / antiWind / antiBreak / lightningMaxFloors | 只有 4 个效果 |
| `data/ants.js` → `MATERIAL_DURABILITY_MULTIPLIERS` | 第 5 个效果（耐久倍率） | **材质数据住在蚂蚁文件里** |
| `gameEngine.js` 107-111 | 摊平成 `this.antiSlip` 等 4 个引擎字段 | 方块的属性挂在引擎上 |
| `data/materials.js` → `effect` 字符串 | 给玩家看的文案 | **人肉同步的第 3 份副本，已经漂了**（见第 7 节） |

`kind` 字段**不携带任何属性**——全库 8 个读取点全在 `gameRender.js` 里，纯画画用。
而且它混了两件事：出身（`base`/`flame`/`pursuit`，谁放的）和落层结果（`perfect`/`shield`/`normal`，怎么落的）。

---

## 3. 属性表（核心）

**不写即默认，不需要注册。** 下面 9 个是**今天就有消费点**的；加第 10 个不需要改这张表的任何基础设施。

### 受击

| key | 默认 | 多来源合并 | 含义 | 今天谁用 |
|---|---|---|---|---|
| `widthDamage` | `1` | 相乘 | 削宽倍率 | 青铜 `0.75`（抗冰雹） |
| `durabilityDamage` | `1` | 相乘 | 耐久伤害倍率 | —— |
| `durabilityMax` | `1` | 相乘 | 耐久池上限倍率 | 全部 5 个材质 |
| `lightningFloors` | `3` | **取小** | 雷击最多劈几层 | 乌金 `1` |
| `sinkResist` | `1` | 相乘 | 坍塌下陷层数倍率 | —— |

### 操作

| key | 默认 | 合并 | 含义 | 今天谁用 |
|---|---|---|---|---|
| `slip` | `1` | 相乘 | 暴雨打滑距离倍率 | 混凝土 `0.7` |
| `windPush` | `1` | 相乘 | 风力推偏／额外晃动倍率 | 钢材 `0.75` |
| `speed` | `1` | 相乘 | 横移速度倍率 | —— |

### 结算

| key | 默认 | 合并 | 含义 | 今天谁用 |
|---|---|---|---|---|
| `scoreMult` | `1` | 相乘 | 得分倍率 | —— |
| `cutRetain` | `0` | **取大** | 落偏时保住多少比例的边缘 | 青铜 `0.25` |

**合并规则只有三种**：相乘（削弱型，叠加越多越强）、取小（上限型）、取大（保底型）。
选哪种写在表里，`modOf` 一处实现，调用方不用关心。

**来源系数不是属性。** `NON_ANT_DURABILITY_SCALE = 0.4`（非蚂蚁来源的耐久伤害打四折）是**全局平衡旋钮**，
留在 `_floorMod` 里，和方块属性相乘：

```js
_floorMod(block, channel, source) {
  return modOf(block, CHANNEL_MOD[channel]) * sourceScale(channel, source)
}
```

这样"乌金抗雷"（属性）和"冰雹整体打四折"（平衡）互不污染，调平衡不用碰材质数据。

---

## 4. 5 个现有效果怎么迁（零行为变化对照）

| 现在 | 消费点 | 现在的算式 | 迁移后 | 迁移后的算式 |
|---|---|---|---|---|
| `antiSlip: 0.3` | `weather.js:291,298` | `base * (1 - 0.3)` | `slip: 0.7` | `base * 0.7` |
| `antiWind: 0.25` | `gameEngine.js:529`<br>`weather.js:239,240` | `windX * (1 - 0.25)`<br>`1 + 1.15k * (1 - 0.25)` | `windPush: 0.75` | `windX * 0.75`<br>`1 + 1.15k * 0.75` |
| `antiBreak: 0.25` | `gameEngine.js:429` | `1 - 0.25` | `widthDamage: 0.75` | `0.75` |
| 同上 | `gameEngine.js:744` | `rawCut * 0.25` | `cutRetain: 0.25` | `rawCut * 0.25` |
| `lightningMaxFloors: 1` | `weather.js:707` | `min(1, floors)` | `lightningFloors: 1` | `min(1, floors)` |
| `MATERIAL_DURABILITY_MULTIPLIERS` | `ants.js:94` | `round(base * 1.35)` | `durabilityMax: 1.35` | `round(base * 1.35)` |

全是代数恒等，没有一个数字变。会用第 1 步同样的差分探针证明。

**注意第 3、4 行**：青铜的 `antiBreak: 0.25` 现在**一个数同时管两件语义不同的事**——
在冰雹那边是"伤害 ×0.75"，在落偏那边是"保住 25% 的边"。拆成两个 key 后对青铜行为完全一致，
但以后可以做"抗冰雹但不保边"或者反过来的方块。

---

## 5. 迁移后的 `materials.js`

```js
{
  id: 'blackgold',
  name: '乌金',
  price: 1700,
  desc: '吸收雷光的稀有材质，雷击时最能守住楼体。',   // 风味，手写
  art: { color: '#6d5c98', colors: ['#777099', '#211b35'] },
  mods: {
    lightningFloors: 1,
    durabilityMax: 1.35
  }
}
```

和今天比：`effects{}` → `mods{}`（同形），耐久倍率从 `ants.js` **搬回来**，
`effect` 展示字符串**删掉**，改由 `mods` 自动生成（见第 7 节）。

---

## 6. 加一个新属性要动几行

还是那个例子：**"加固块：受到的宽度伤害减半"**。

| | 现在 | 迁移后 |
|---|---|---|
| 定义数值 | `materials.js` + `ants.js` 两处 | `blockTypes.js` 一行 |
| 摊平到引擎 | `gameEngine.js` 构造函数加字段 | 不需要 |
| 蚂蚁啃宽路径 | 改 | 不需要 |
| 冰雹削宽路径 | 改（**第 1 步之前这里必漏**） | 不需要 |
| 落偏切边路径 | 改 | 不需要 |
| 展示文案 | 手写一句，以后靠人记得同步 | 自动生成 |
| **合计** | **3 文件 7 处** | **1 文件 1 行** |

```js
// data/blockTypes.js
{ id: 'reinforced', name: '加固块', mods: { widthDamage: 0.5 } }
```

第 1 步已经把削宽的 3 条路径收口成 1 条，所以上表右列才可能是 1 行。

---

## 7. 顺带查出来的问题：商店少报了 4 个材质的加成

`effect` 字符串是人肉维护的，**已经和实际数值漂开了**。4 个付费材质全都有耐久加成，
商店里一个字都没提：

| 材质 | 商店写的 | 实际还有 | 宽 120 时的耐久 |
|---|---|---|---|
| 混凝土 | 抗滑 +30% | **耐久 +18%** | 18 → 21 |
| 钢材 | 抗风 +25% | **耐久 +28%** | 18 → 23 |
| 青铜 | 抗碎 +25% | **耐久 +12%** | 18 → 20 |
| 乌金 | 抗雷劈：最多劈 1 层 | **耐久 +35%** | 18 → **24** |

路线①之后蚂蚁专咬耐久，这个隐藏加成现在是**乌金最大的实际收益**——
宽 120 的楼层蚂蚁要多咬 6 口才啃穿（+33%），而玩家花 1700 买它的时候完全不知道。

迁移后 `effect` 从 `mods` 自动生成，这类漂移在结构上不可能再发生：

```
乌金   雷击最多劈 1 层 · 耐久 +35%
青铜   冰雹削宽 -25% · 落偏保边 25% · 耐久 +12%
钢材   风力推偏 -25% · 耐久 +28%
混凝土 暴雨打滑 -30% · 耐久 +18%
泥土   无特殊效果
```

`desc`（风味句）仍然手写，自动生成的只是数值那一行。

---

## 8. 三个决策（已拍板：全做）

### A. 青铜的 `antiBreak` 拆成 `widthDamage` + `cutRetain`
对青铜行为零变化，但从"一个数两种语义"变成两个独立轴。
**我的建议：拆。** 不拆的话以后做"抗冰雹但不保边"的方块就得再加特例。

### B. 耐久倍率从 `ants.js` 搬到 `materials.js`
纯搬家，零行为变化。搬完材质数据只有一处。
**我的建议：搬。**

### C. `kind` 拆成 `typeId` + `tags`
`perfect`/`shield` 是**落层结果**（怎么落的），`base`/`flame`/`pursuit` 是**出身**（谁放的），
现在挤在一个字段里。拆开后 `typeId` 才能挂 `mods`。
代价：要动 `gameRender.js` 的 8 个读取点（纯渲染，无玩法风险）。
**我的建议：这轮拆。** 第 3 步要重做视觉，反正要动这些行；分两次动等于改两遍。

三项均已实施。

---

## 9. 落地后的文件布局

```
data/blockMods.js    属性词汇表：有哪些属性、默认值、合并规则、怎么翻成人话
                     刻意零 import —— 它和解析器分开，依赖图才是一棵树
data/blockTypes.js   类型配方：normal / base / flame / pursuit + BLOCK_TAGS
data/materials.js    材质配方：art（皮肤）+ mods（属性），effect 文案自动生成
data/blocks.js       唯一解析点 modOf(ref, key)
```

消费端的变化：

| 位置 | 之前 | 现在 |
|---|---|---|
| `gameEngine` 构造 | 摊平出 4 个引擎字段 | `this.runSpec = { typeId, materialId }` |
| 任意属性查询 | `this.antiWind` 等 | `this.mod(key, block)` |
| `_floorMod` | 两条硬编码规则 | 方块抗性 × 来源系数 |
| `gameRender._blockColors` | 6 个 `block.kind ===` 分支 | 查 `blockTypes.art` + `hasTag` |
| `weather` 三处 | `engine.anti*` | `engine.mod(key)` |
| `ants.durabilityForWidth` | 查 `MATERIAL_DURABILITY_MULTIPLIERS` | `modOf(..., 'durabilityMax')` |

顺带清掉的死字段：方块上的 `hue`（只写不读）、`damageState`（只写不读）、
`weather.LIGHTNING_MAX_FLOORS`（默认值的第二份定义）。

### 一处刻意没动的疑似 bug

深色主题 + 泥土时，**完美层用的是材质原色，普通层用的是深色变体**——
旧 `_blockColors` 把 `perfect` 分支写在了深色泥土分支之前。看着像写漏了，
但第 2 步是纯重构，不该顺手改画面。代码里标了注释，留给第 3 步视觉重做处理。

---

## 附：出处

| 断言 | 出处 |
|---|---|
| 4 个效果的定义 | `src/data/materials.js` `effects{}` |
| 第 5 个效果（耐久倍率） | `src/data/ants.js:86` |
| 摊平成引擎字段 | `src/core/gameEngine.js:107-111` |
| antiSlip 消费 | `src/core/weather.js:291,298` |
| antiWind 消费 | `src/core/gameEngine.js:529`、`src/core/weather.js:239,240` |
| antiBreak 消费 | `src/core/gameEngine.js:429`（第 1 步收口后）、`:744` |
| lightningMaxFloors 消费 | `src/core/weather.js:707` |
| 耐久倍率消费 | `src/data/ants.js:94` `durabilityForWidth` |
| `kind` 只用于渲染 | `gameRender.js:260,263,266,270,383,484,485,494,584` |
| 耐久数值表 | `durabilityForWidth(w, id)` 实算 |
| `NON_ANT_DURABILITY_SCALE = 0.4` | `src/data/ants.js:3` |
