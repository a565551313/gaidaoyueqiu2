# 图鉴（Codex）

跨模块的资料库。第一批接入方块、敌人、伙伴三组，之后再加组不需要改页面。

入口：主菜单底部导航栏 →「更多」→「图鉴」。路由名 `codex`，独立页面。

底部导航栏固定五格：角色 / 背包 / 宠物 / 技能 / **更多**。
往后新增的入口一律收进「更多」展开的第二行，不要再去挤主栏——
挤到第六格每格只剩 53px，再加就该换行了。加一个入口 = 在
`MainMenu.vue` 的 `MORE_ITEMS` 数组里加一行：

```js
const MORE_ITEMS = [
  { label: '图鉴', icon: BookIcon, run: () => emit('nav', 'codex') },
  { label: '设置', icon: SettingsIcon, run: () => { showSettings.value = true } }
]
```

`verify-navigation.mjs` 断言主栏恰好是那五格、第二行必须由数组渲染。

---

## 1. 为什么不做统一 schema

最直觉的做法是定义一张大表，所有模块都往里填：名字、图标、属性 1～6、描述。
这个做法在第三个模块就会崩——方块有「耐久」「打滑」，蚂蚁有「血量」「啃咬间隔」，
宠物有「星级」「技能」，三者没有公共属性集。强行统一的结果是一张全是空列的表，
以及一堆 `if (group === 'blocks')` 的特判。

所以采用**条目契约 + 每模块一个适配器**：

```
src/core/codex/
  contract.js     条目形状、属性轴合并、条长计算、排序
  blocks.js       方块适配器
  enemies.js      敌人适配器
  companions.js   伙伴适配器
  index.js        注册表 CODEX_GROUPS + groupData()
```

页面只认识契约，不认识任何一个模块。加一组 = 新增一个适配器文件 + 在
`CODEX_GROUPS` 里加一行，`Codex.vue` 一个字都不用动。

### 条目契约

```js
{
  id, group, order,
  name, subtitle, blurb,
  state: 'owned' | 'seen' | 'locked',
  lockedHint,
  stats:  [{ key, label, value, base, text, better, isDefault }],
  extras: [{ label, value }],
  skills,                       // 可选
  preview: { kind, ... },       // 卡片缩略图
  scene:   { kind, label, ... },// 详情页大图
  sounds:  [{ label, key, play() }]
}
```

`preview` / `scene` 支持两种 kind：

- `{ kind: 'canvas', draw(ctx, w, h, t) }` — 方块和敌人用。`t` 是秒，页面按帧喂。
- `{ kind: 'component', name, props }` — 伙伴用。只声明**组件名**，不把 `.vue`
  import 进 `src/core/`；页面负责 name → 组件的映射。

---

## 2. 四条防漂移规则

图鉴真正的失败方式不是写不出来，是**慢慢和游戏本体对不上**：预览自己画一套、
属性手抄一份、音效另拼一个播放逻辑。这三件事发生的时候页面照样好看，没人会发现。

所以定了四条硬规则，每条都有测试盯着（`npm run test:codex`）：

| # | 规则 | 怎么保证 |
|---|------|---------|
| ① | 预览必须调真实渲染器 | `blocks.js` 只能 `import { drawBlockFace }`，`enemies.js` 只能 `import { drawAnt }`；适配器里出现 `ctx.createLinearGradient` 之类的绘制原语即判失败 |
| ② | 属性必须由 `statsOf` 从 mods 生成 | 测试逐条比对 `MATERIALS[*].mods` 和图鉴显示值 |
| ③ | 音效必须是真实 SFX key + 真实播放入口 | key 来自 `MATERIAL_SFX`，播放走 `Audio.setMaterial()` + `Audio.drop()/cut()`，禁止碰私有 `_sample` |
| ④ | 解锁状态必须来自存档 | `groupData(groupId, store)` 显式收存档作参数 |

规则 ① 还有一条配套检查：**渲染器的选项名必须对得上**。
`drawAnt` 内部是 `o.walk || 0`，传成 `state: 'walk'` 既不抛错也不产生 NaN，
只是蚂蚁从此一动不动。测试直接从 `antArt.js` 源码里抽出所有 `o.xxx` 读取，
和适配器实际传的 key 做集合比对。（这个 bug 实际发生过，就是这么抓出来的。）

---

## 3. 两个设计决定

### 同组共用统一属性轴

`unifyStatAxes()` 取组内所有条目属性 key 的并集，让每个条目都带齐全部轴。
方块组实际 6 轴：削宽伤害 / 耐久 / 雷击上限 / 打滑 / 风力推偏 / 落偏保边。

不这么做的话，泥土只显示 0 条、黑金显示 2 条，两张卡片的条数不一样，
根本没法横着比。

### 条长 = 相对默认值的优势 ÷ 组内最大优势

`barRatios()`。每条轴在 `MOD_SPECS` 里声明 `better: 'high' | 'low'`，
决定往哪个方向算优势——「打滑 0.7」是优点（越低越好），
「耐久 1.35」也是优点（越高越好），两者都该填出条来。

**默认值 = 空条。** 空条的含义是「这条轴没有加成」，不是「这个值很小」。
泥土六条全空是正确显示，不是渲染失败。

---

## 4. 各组接入状态

| 组 | 条目 | 状态来源 | 预览 | 场景 | 属性 | 音效 |
|----|------|---------|------|------|------|------|
| 方块 | 5 种材质 | `store.materials` → owned / locked | `drawBlockFace` 单块 | 7 层堆叠，带摇摆 | `statsOf(material.mods)` | 落层 / 切除，各材质一套 |
| 敌人 | 4 个兵种 | `store.seen.enemies` → seen / locked | `drawAnt` 行走 | 三只趴在**真方块楼层**上啃咬 | 血量 / 速度 / 啃咬 等 | — |
| 伙伴 | 全部宠物 | `store.pets[*].owned` | `AnimatedPet` 组件 | 同上，放大 | 等级 / 星级 | — |

敌人组**没有 `owned` 状态**——你不会「拥有」一只蚂蚁。只有「遭遇过」和「没见过」。

敌人场景里蚂蚁啃的是 `drawBlockFace` 画的真钢材楼层，不是随手一条灰方块：
蚂蚁和 `BLOCK_H=28` 的比例必须和局内一致，否则图鉴会让人误判这玩意儿有多大。
坐标原点也和 `antSystem._renderAnt` 对齐（落在楼层正面中心，开 `onSurface`），
所以图鉴里看到的姿态就是局内会看到的姿态。

---

## 5. 遭遇记录为什么走引擎回调

蚂蚁出生时要记一笔「见过了」。最直接的写法是 `antSystem.js` 里
`import { actions } from './store.js'` 然后调一下。**这个写法会炸测试。**

`store.js` 在模块加载时就执行 `reactive(Storage.load())`。
任何 `scripts/verify*.mjs` 只要先 import 了引擎链，store 就会在 mock localStorage
装好之前初始化并被 ESM 缓存，之后再 `await import('../src/core/store.js')`
拿到的是空存档 —— `verify-chapter.mjs` 就是这么挂的（`restored.unlocked` 1 !== 6）。

正确做法是**引擎暴露回调，应用层接线**：

```js
// gameEngine.js
this.onSeen = opts.onSeen || (() => {})
// antSystem.js spawn()
this.engine.onSeen('enemies', speciesId)
// GameView.vue
onSeen: (group, id) => actions.markSeen(group, id)
```

规则：**`src/core/` 和 `src/data/` 下任何文件都不许 import `store.js`。**
`verify-codex.mjs` 第 8 节在守这条。

---

## 6. 顺带修掉的：商店橱窗

商店的材质卡以前是五条手写 CSS 色块（`.material-swatch-steel` 之类的
`repeating-linear-gradient`）。方块画法一改，橱窗里的样子和落到塔上的样子就是
两份独立维护的东西，而且没有任何东西会提醒你它们已经对不上了。

现在改成 `materialSwatch(id)` —— 和图鉴预览同一个入口，同一个 `drawBlockFace`。
五条手写 CSS 已删除，测试断言它们不许回来。

---

## 7. 测试

```
npm run test:codex      # 205 checks
```

八节：注册表 / 预览调真渲染器 / 堆叠场景 / 属性自动生成 / 音效真实 /
商店同源 / 解锁状态 / 锁住条目不泄漏 / 核心不依赖存档层。

每条规则都做过反向验证——把属性改成手抄、把音效 key 乱填、把蚂蚁改成「可拥有」、
把预览换成自己画的色块、把 `walk` 写成 `state`、把 CSS 色块放回去，
六种退化全部被对应断言抓住。
