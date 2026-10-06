# 外部资源与许可证登记

本文件记录仓库中实际打包资源、代码引用和仓库内已有的来源/许可证文字。**“仓库内声明”仅表示项目文件这样记载，不等于对来源真实性、外部页面、许可证适用性或法律状态的独立核验。** 本次只检查了仓库文件和代码引用，没有访问外部来源页面。

## 已打包资源与当前代码引用状态

> **2026-10-04 校订**：`docs/ART_REWORK.md`「第八轮 · 项目整洁度整治」做过一次未引用资源清理（`public/` 从 44 MB 降到约 9.1 MB，删除约 2133 个代码从未引用的文件），其中包含本文件曾经登记的 `kenney_platformer-art-buildings`、`kenney_space-shooter-remastered`、`kenney_ui-pack-space-expansion` 三个 Kenney 子包。以下表格已按当前 `public/assets/` 实际内容校订：楼层材质目前由 `src/core/blockArt.js` 纯 Canvas 绘制，不再依赖任何位图贴图；`src/core/floorTextures.js` 在当前代码库中不存在。

| 资源 | 当前用途与文件路径 | 仓库内来源/许可证记录 |
| --- | --- | --- |
| Kenney Particle Pack | Canvas 粒子精灵：`public/assets/kenney/kenney_particle-pack/PNG (Transparent)/` 下 `flame_01`–`flame_06`、`smoke_01`–`smoke_03`、`spark_01`–`spark_07`、`flare_01`（均为 PNG）；引用见 `src/core/spritePacks.js` | `public/assets/kenney/kenney_particle-pack/License.txt` 将其标为 CC0。来源页记录在 `public/assets/kenney/README.md`；本次未独立核验。 |
| Kenney Simple Space | 星空精灵：`public/assets/kenney/kenney_simple-space/PNG/Default/star_tiny.png`、`star_small.png`、`star_medium.png`、`star_large.png`；引用见 `src/core/spritePacks.js` | `public/assets/kenney/kenney_simple-space/License.txt` 将其标为 CC0。来源页记录在 `public/assets/kenney/README.md`；本次未独立核验。 |
| Kenney Impact Sounds | 游戏冲击音效目录 `public/assets/audio/impact/`；当前代码调用 `impactGeneric_light_000` 等音效，音频 URL 由 `src/core/audio.js` 按分组生成 | `public/assets/audio/impact/License.txt` 将其标为 CC0；旧登记来源页为 [Impact Sounds](https://kenney.nl/assets/impact-sounds)，随包 `Kenney.url` 指向 Kenney 网站。来源页与许可本次未独立核验。 |
| Kenney Interface Sounds | 界面音效目录 `public/assets/audio/interface/`；当前代码调用 `click_001` 等音效，引用见 `src/core/audio.js` | `public/assets/audio/interface/License.txt` 将其标为 CC0；旧登记来源页为 [Interface Sounds](https://kenney.nl/assets/interface-sounds)，随包 `Kenney.url` 指向 Kenney 网站。来源页与许可本次未独立核验。 |
| Kenney Sci-Fi Sounds | 音效目录 `public/assets/audio/scifi/`（独立于已被整体删除的 `kenney_sci-fi-sounds` 原始素材子包）；当前由多种 SFX key 调用（如材质落层音效的 `impactMetal`、充能/护盾的 `forceField`、技能音的 `laserSmall` 等），完整清单见 `src/core/audioTables.js` | `public/assets/audio/scifi/License.txt` 将其标为 CC0；旧登记来源页为 [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds)，随包 `Kenney.url` 指向 Kenney 网站。来源页与许可本次未独立核验。 |
| 落层评价解说语音（真人录音 4 句） | `public/assets/voice/`：`good.mp3`、`great.mp3`、`perfect.mp3`、`unbelievable.mp3`；由 `src/core/audio.js` 的 `voice()` 按 `VOICE_CLIPS` 表（`src/core/audioTables.js`）流式播放，`scripts/verify-gameplay-tweaks.mjs` 断言四个文件随包分发、已退役的长台词剪辑（`perfect2`/`perfect10`）不在包里 | **2026-10-06 补登记：仓库内未找到这四条录音的来源页或许可证文本**（`docs/ART_REWORK.md` 仅记录为“真人录音 4 句”）。对外分发前必须补齐来源与授权记录；若为自制录音，请在下方补登制作说明。 |

上表只列出代码中找到引用的包与文件，不表示逐个资源都做过运行时加载或视觉/听觉验收。各文件路径及其对应的包级许可证文本均可在仓库内检查。

### 已随未引用资源清理一并删除的包（不再随仓库分发）

- `kenney_platformer-art-buildings`（楼层贴图，已被纯 Canvas 绘制的 `blockArt.js` 取代）
- `kenney_space-shooter-remastered`（曾用于空中单位图像，运行时资源表移除后原文件也已删除，而非仅移除引用）
- `kenney_ui-pack-space-expansion`（此前登记为“已打包但未发现引用”，现已随清理一起删除，而不是继续保留占用体积）

这三个包仍是 kenney.nl 上可免费重新下载的公开素材；如果未来需要重新引用，应重新下载并按下方登记规则补登。

## 音乐文件与当前播放方式

| 文件 | 当前状态 | 仓库内来源/许可证记录 |
| --- | --- | --- |
| `public/assets/music/menu-pixelate.mp3` | `src/core/audio.js` 的 `MUSIC_FILES.menu` 当前指向此文件，用作菜单曲。 | `src/core/audio.js` 注释记录曲名为 “Pixelate - pixelated dreams”、作者/账号 `thatlofishow`、来源 Pixabay，并标注 Pixabay Content License。仓库没有为此曲单独列出的许可证正文；来源及许可未在本次独立核验。 |
| `public/assets/music/battle-vastness.mp3` | 文件仍在仓库，但不在当前 `MUSIC_FILES` 映射中；战斗时通过 Web Audio 合成 `battle` 曲目，不默认播放此 MP3。 | `src/core/audio.js` 注释记录曲名为 “Vastness”、作者 Andrew Ev、来源 Mixkit，并标注 Mixkit License 及其使用限制。仓库没有为此曲单独列出的许可证正文；来源及许可未在本次独立核验。 |

## 已打包但未发现当前代码引用的 Kenney 包

- 2026-10-04 复核：`public/assets/kenney/` 目前只剩 `kenney_particle-pack`、`kenney_simple-space` 两个子目录（外加 `README.md`），均已在上表登记为「已引用」。此前登记在此处的 `kenney_ui-pack-space-expansion` 已随未引用资源清理一起删除，不再随仓库分发，见上文「已随未引用资源清理一并删除的包」。
- `public/assets/kenney/README.md` 保存包清单及历史来源链接。链接有效性和当前外部页面内容未核验；请以本登记描述的代码引用状态为准，不要把旧清单中的“候选”当作已使用，也不要把外链或包内声明当作独立审查结论。

## 历史上登记的外部参考（未直接打包）

以下来源和许可标签沿用旧版登记文字，仅表示当时记录为候选；本次未重新检查外部页面或许可，不代表已经下载、使用或取得独立核验。

| 资源 | 旧登记来源 | 旧登记的许可证文字 | 仓库中的状态 |
| --- | --- | --- | --- |
| Kenney Animal Pack Remastered | [Kenney 资源页](https://kenney.nl/assets/animal-pack-remastered) | CC0 1.0 | 宠物造型参考候选；未直接打包 |
| Animal Pack Redux | [OpenGameArt 页面](https://opengameart.org/content/animal-pack-redux) | CC0 1.0 | 旧登记称作造型/帧序列参考；未直接打包 |
| Cat & Dog Free Sprites | [OpenGameArt 页面](https://opengameart.org/content/cat-dog-free-sprites) | CC0 1.0 | 旧登记称作动作节奏参考；未直接打包 |
| Animated Wild Animals | [OpenGameArt 页面](https://opengameart.org/content/animated-wild-animals) | CC0 1.0 | 旧登记称作动作节奏参考；未直接打包 |
| Meca Dog | [OpenGameArt 页面](https://opengameart.org/content/meca-dog) | CC0 1.0 | 旧登记称作动作节奏参考；未直接打包 |
| Bevouliin Free Flying Bird | [OpenGameArt 页面](https://opengameart.org/content/bevouliin-free-flying-bird-game-character-sprite-sheets) | CC0 1.0 | 旧登记称作翅膀帧序列参考；未直接打包 |
| 80 CC0 Creature SFX | [OpenGameArt 页面](https://opengameart.org/content/80-cc0-creature-sfx) | CC0 1.0 | 旧登记称作音效候选；未直接打包 |
| Animals pack | [OpenGameArt 页面](https://opengameart.org/content/animals-pack)；旧登记作者为 Olga Bikmullina | CC-BY 3.0 | 未作为当前项目依赖；如将来采用，应重新核对许可并按要求署名 |
| CC0 1.0 官方说明 | [Creative Commons](https://creativecommons.org/publicdomain/zero/1.0/) | CC0 1.0 | 旧登记中的许可证说明链接；本次未访问 |

## 登记规则

1. 新资源加入 `public/assets/` 时，记录具体文件路径、来源、作者（如仓库资料可确认）、下载日期、包内许可证文件路径及修改情况；不要把待选资源登记成已使用资源。
2. 在作出对外许可或署名承诺前，应单独核验对应资源的来源、适用许可证和署名/使用条件；包内文字和本文件的历史记录不代替该核验。
3. 宠物第一版造型由项目内 `src/components/AnimatedPet.vue` 的 SVG 实现；宠物文档记录其未直接新增外部图像资源。
4. 音效开关或资源播放的代码路径不代表已完成浏览器、设备或法律验收。
