# Kenney 资源包清单

本文件依据当前 `src/` 中的资源路径引用整理。这里的“使用中”表示源码有对应路径引用，不代表已完成浏览器加载、视觉/听觉验收。许可证信息仅依据随包文本；本次没有访问 Kenney 外部页面或独立核验许可证。

| 目录 | 包名（随包记录） | 当前代码状态 | 仓库内许可证 |
| --- | --- | --- | --- |
| `kenney_platformer-art-buildings` | Platformer Art Buildings | **使用中**：`src/core/floorTextures.js` 读取 `Tiles/houseBeige.png`、`houseGray.png`、`houseDark.png` 和 `window.png` 作为楼层贴图。 | `license.txt` 将资源标为 CC0。 |
| `kenney_particle-pack` | Particle Pack | **使用中**：`src/core/spritePacks.js` 预载透明 PNG 的火焰、烟、火花和光斑精灵。 | `License.txt` 将资源标为 CC0。 |
| `kenney_space-shooter-remastered` | Space Shooter Remastered | **使用中**：源码引用四种敌机 PNG 与 `ufoBlue.png` 作为捣乱飞行物精灵。 | `license.txt` 将图像标为 CC0。 |
| `kenney_simple-space` | Simple Space | **使用中**：源码引用四种星星 PNG 作为星空精灵。 | `License.txt` 将资源标为 CC0。 |
| `kenney_ui-pack-space-expansion` | UI Pack: Sci-fi / Space Expansion（名称按目录和随包文件记录） | **已打包；未发现当前 `src/` 引用**。此前称为候选，不能视为已接入界面。 | `License.txt` 将资源标为 CC0。 |

Kenney 音效包位于 `public/assets/audio/` 而非本目录，且有当前代码引用；其路径及随包许可证记录见根目录 [`ASSET_LICENSES.md`](../../../ASSET_LICENSES.md)。

## 来源记录说明

本仓库此前记录的包来源页为：

- [Platformer Art Buildings](https://kenney.nl/assets/platformer-art-buildings)
- [Particle Pack](https://kenney.nl/assets/particle-pack)
- [UI Pack: Sci-fi](https://kenney.nl/assets/ui-pack-sci-fi)
- [Space Shooter Remastered](https://kenney.nl/assets/space-shooter-remastered)
- [Simple Space](https://kenney.nl/assets/simple-space)

这些链接是来源记录，不表示本次检查时页面可访问、内容仍相同或许可条款已独立核验。旧版文档中的下载直链和“当前有效”措辞已不作为现状声明。
