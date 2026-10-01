# 外部资源与许可证登记

本文件记录仓库中实际打包资源、代码引用和仓库内已有的来源/许可证文字。**“仓库内声明”仅表示项目文件这样记载，不等于对来源真实性、外部页面、许可证适用性或法律状态的独立核验。** 本次只检查了仓库文件和代码引用，没有访问外部来源页面。

## 已打包且当前代码有引用的资源

| 资源 | 当前用途与文件路径 | 仓库内来源/许可证记录 |
| --- | --- | --- |
| Kenney Platformer Art Buildings | 楼层材质贴图：`public/assets/kenney/kenney_platformer-art-buildings/Tiles/houseBeige.png`、`houseGray.png`、`houseDark.png`、`window.png`；引用见 `src/core/floorTextures.js` | `public/assets/kenney/kenney_platformer-art-buildings/license.txt` 将其标为 CC0，并称个人及商业项目可用、署名非强制。来源页记录在 `public/assets/kenney/README.md`；本次未独立核验。 |
| Kenney Particle Pack | Canvas 粒子精灵：`public/assets/kenney/kenney_particle-pack/PNG (Transparent)/` 下 `flame_01`–`flame_06`、`smoke_01`–`smoke_03`、`spark_01`–`spark_07`、`flare_01`（均为 PNG）；引用见 `src/core/spritePacks.js` | `public/assets/kenney/kenney_particle-pack/License.txt` 将其标为 CC0。来源页记录在 `public/assets/kenney/README.md`；本次未独立核验。 |
| Kenney Space Shooter Remastered | 捣乱飞行物精灵：`public/assets/kenney/kenney_space-shooter-remastered/PNG/Enemies/enemyGreen1.png`、`enemyRed3.png`、`enemyBlue2.png`、`enemyBlack5.png`，以及 `PNG/ufoBlue.png`；引用见 `src/core/spritePacks.js`、`src/core/gameEngine.js` | `public/assets/kenney/kenney_space-shooter-remastered/license.txt` 将图像标为 CC0。来源页记录在 `public/assets/kenney/README.md`；本次未独立核验。 |
| Kenney Simple Space | 星空精灵：`public/assets/kenney/kenney_simple-space/PNG/Default/star_tiny.png`、`star_small.png`、`star_medium.png`、`star_large.png`；引用见 `src/core/spritePacks.js` | `public/assets/kenney/kenney_simple-space/License.txt` 将其标为 CC0。来源页记录在 `public/assets/kenney/README.md`；本次未独立核验。 |
| Kenney Impact Sounds | 游戏冲击音效目录 `public/assets/audio/impact/`；当前代码调用 `impactGeneric_light_000` 等音效，音频 URL 由 `src/core/audio.js` 按分组生成 | `public/assets/audio/impact/License.txt` 将其标为 CC0；旧登记来源页为 [Impact Sounds](https://kenney.nl/assets/impact-sounds)，随包 `Kenney.url` 指向 Kenney 网站。来源页与许可本次未独立核验。 |
| Kenney Interface Sounds | 界面音效目录 `public/assets/audio/interface/`；当前代码调用 `click_001` 等音效，引用见 `src/core/audio.js` | `public/assets/audio/interface/License.txt` 将其标为 CC0；旧登记来源页为 [Interface Sounds](https://kenney.nl/assets/interface-sounds)，随包 `Kenney.url` 指向 Kenney 网站。来源页与许可本次未独立核验。 |
| Kenney Sci-Fi Sounds | 科幻音效目录 `public/assets/audio/scifi/`；当前代码调用 `engineCircular_001`、`forceField_001` 等音效，引用见 `src/core/audio.js` | `public/assets/audio/scifi/License.txt` 将其标为 CC0；旧登记来源页为 [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds)，随包 `Kenney.url` 指向 Kenney 网站。来源页与许可本次未独立核验。 |

上表只列出代码中找到引用的包与文件，不表示逐个资源都做过运行时加载或视觉/听觉验收。各文件路径及其对应的包级许可证文本均可在仓库内检查。

## 音乐文件与当前播放方式

| 文件 | 当前状态 | 仓库内来源/许可证记录 |
| --- | --- | --- |
| `public/assets/music/menu-pixelate.mp3` | `src/core/audio.js` 的 `MUSIC_FILES.menu` 当前指向此文件，用作菜单曲。 | `src/core/audio.js` 注释记录曲名为 “Pixelate - pixelated dreams”、作者/账号 `thatlofishow`、来源 Pixabay，并标注 Pixabay Content License。仓库没有为此曲单独列出的许可证正文；来源及许可未在本次独立核验。 |
| `public/assets/music/battle-vastness.mp3` | 文件仍在仓库，但不在当前 `MUSIC_FILES` 映射中；战斗时通过 Web Audio 合成 `battle` 曲目，不默认播放此 MP3。 | `src/core/audio.js` 注释记录曲名为 “Vastness”、作者 Andrew Ev、来源 Mixkit，并标注 Mixkit License 及其使用限制。仓库没有为此曲单独列出的许可证正文；来源及许可未在本次独立核验。 |

## 已打包但未发现当前代码引用的 Kenney 包

- `public/assets/kenney/kenney_ui-pack-space-expansion/` 随包保留，内含 `License.txt`；本次在源码引用检查中未发现该包资源被当前代码使用。该许可证文件将资源标为 CC0，但未作独立核验。
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
