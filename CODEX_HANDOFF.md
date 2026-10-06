# Codex Handoff

> 状态快照：2026-10-04；基于本次只读检查 + 实际运行 build/dev/全部回归脚本 + 新增端到端回归测试时可见的仓库状态。不是在线服务或设备状态承诺。

- **代码基线**：分支 `arena/01a10663-gaidaoyueqiu2`，从 `master` 的 `4e18283`（`fix: sync pnpm lockfile for deployment (#9)`）切出。本次新增了一个回归脚本（`scripts/verify-campaign-cadence.mjs`）并重写了 README.md / CODEX_HANDOFF.md / `docs/ENEMY_WEATHER_AUDIT.md` / `docs/PET_SYSTEM.md` / `docs/CODEX.md` 的部分内容，使其与当前源码一致；未改动任何玩法/引擎代码。
- **当前项目规模**：Vue 3 + Vite 的手机优先堆叠游戏。已从早期的「第一章 8 关」扩展为 **7 个都会圈章节 × 8 关 = 56 关**（`src/data/levels.js`），每章绑定唯一天气主题（晴/风/云/雷/雨/雪/雹）。主菜单路由包括章节选择、选关、商店、背包、宠物中心、技能学院、图鉴（Codex）、排行榜和游戏页；主菜单“角色”仍是提示占位；无尽模式和排位赛按钮禁用。排行榜在本地按各关历史最高分合计玩家成绩，并与静态样例分数一起显示；未发现线上榜单服务实现。
- **已验证修复（此前文档记录为未修复，本次复核确认已修复）**：`docs/ENEMY_WEATHER_AUDIT.md`（2026-10-02 快照）记录的两个 P0 问题——① 冰雹预警在落块时被整轮重置导致砺川章冰雹实测从未命中、② 蚂蚁攻击节奏比玩家落块节奏慢一个数量级导致 35/56 关全程 0 次咬击——均已在代码中修复（修复细节与前后实测数据见 `docs/ART_REWORK.md` 第二、三、五轮）。本次用相同方法论复核：完美节奏跑满 56 关整局，蚁群咬击 0 关变为 0 次咬击关卡（此前 35 关）、砺川章冰雹命中从 0 变为约 64 次（8 关全部 > 0）。新增 `scripts/verify-campaign-cadence.mjs` 把这个结果锁进回归测试，已接入 `npm run test:campaign-cadence` 和新增的 `npm run test:all`。
- **仍未处理的已知问题**：
  - 旧版「不依赖章节、随机抽取天气」的通用天气系统（`src/core/weather.js` 里的 `_tryStart/_onStart/_end/_tick/_strike/_resolveStrike/_strikeTower/_pool/fogStrength` 等约 300 行）在当前 56 关里完全不可达（只有第一章——全部 `weather:0`——会走这条代码路径），但仍被 `scripts/verify.mjs` 的部分用例当通用引擎能力测试。去留未决（删除 vs. 接入霆川章节作为雷击高潮机制）。
  - 「乌金」材质（1700 金币）的卖点“雷击时最能守住楼体”对应的正是上一条里的旧雷击系统，在当前真实关卡里永远不会触发，属于误导性描述，尚未修正。
  - 岚河（风）、雨汀（雨）两章里蚁群约 35%~37% 的时间因天气威胁窗口被暂停攻击（`hasGameplayThreat` 覆盖整个 active 窗口），是刻意的公平性设计但也削弱了蚂蚁存在感，尚未调优。
  - 云岫（云）、霆川（雷）、雪岑（雪）三章（24 关）的天气目前对玩法零影响，纯氛围演出。
  - `antWavesForLevel` 仍只按“章节内第几关”取波次配置，未按章节本身做难度递增。
  - 详细清单见 `docs/ENEMY_WEATHER_AUDIT.md` 更新后的 P1/P2 分组。
- **主题与设置**：启动时固定设置为深色主题，主题已取消切换且不写入存档。设置页提供声音开关、音乐音量和音效音量；存档基于 `localStorage`。
- **音频 API（按当前源码）**：`src/core/audio.js`（已拆分出 `src/core/audioTables.js` 存放素材清单）定义 `startMusic()`、`setScene()` 和 `setBattleIntensity()`；后者在战斗曲播放时会触发重新排程。菜单曲文件为 `public/assets/music/menu-pixelate.mp3`；战斗曲由 Web Audio 合成，`public/assets/music/battle-vastness.mp3` 仍在目录中但不作为默认播放曲目。局内落层评价、材质音色、解说语音等已统一到同一条音频总线（音乐 < 音效 < 语音），细节见 `docs/ART_REWORK.md` 第六、七轮。
- **依赖与可运行命令**：检查时 `npm install`、`npm run build`、`npm run dev` 均一次性成功。`package.json` 新增了 `test:campaign-cadence` 与 `test:all`（一次跑完全部 8 套回归脚本）。本次启动过一次 `npm run dev` 用于人工预览，未发现错误。
- **自动化验证**：本次重新运行全部 8 套脚本（`verify.mjs` 286 条、`verify-chapter.mjs` 56 关、`verify-navigation.mjs`、`verify-gameplay-tweaks.mjs` 60 条、`verify-block-art.mjs` 41 条、`verify-codex.mjs` 205 条、`verify-ui-flow.mjs` 13 步、新增的 `verify-campaign-cadence.mjs`）全部通过。覆盖范围仍是部分引擎规则，不覆盖完整浏览器交互、真实设备或外部资产许可核验。
- **资源体积**：`public/` 目录当前约 9.1 MB（`docs/ART_REWORK.md` 第八轮记录了一次从 44 MB 到 9.1 MB 的未引用资源清理，删除了约 2133 个未被代码引用的文件）。`ASSET_LICENSES.md` 的部分资源行仍引用已被该轮清理删除的包（如 Kenney Platformer Art Buildings、Space Shooter Remastered 的 Kenney 原始子包、UI Pack Space Expansion），属于遗留但尚未逐条核对更新的登记条目，下一次检查时应一并校订。
- **未验证**：本次没有运行浏览器全流程、真实手机触控/安全区检查，也没有核对外部资产来源页面的当前可用性。没有据此声称在线环境、运行服务器或外部许可已验证。
