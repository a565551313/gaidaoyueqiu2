# Codex Handoff

> 状态快照：2026-10-01；依据本次只读检查及文档更新时可见的仓库状态。不是在线服务或设备状态承诺。

- **代码基线**：分支 `master`，检查时 HEAD 为 `b33c522`（`feat: add pet companion system`），当时与 `origin/master` 指向同一提交。此次修改只涉及 Markdown 文档；尚未提交或推送。
- **工作区**：开始检查时工作区干净；本次文档修改完成后为未提交的文档差异。实际文件以最终 `git status --short` / `git diff --name-only` 为准。
- **当前项目**：Vue 3 + Vite 的手机优先堆叠游戏，主要实现位于 `src/`；资产在 `public/assets/`。当前有主菜单、关卡、商店、背包、宠物、技能、排行榜和游戏路由。主菜单“角色”仍是提示占位；无尽模式和排位赛按钮禁用。排行榜在本地按各关历史最高分合计玩家成绩，并与静态样例分数一起显示；未发现线上榜单服务实现。
- **主题与设置**：启动时固定设置为深色主题，主题已取消切换且不写入存档。设置页提供声音开关、音乐音量和音效音量；存档基于 `localStorage`。
- **音频 API（按当前源码）**：`src/core/audio.js` 定义 `startMusic()`、`setScene()` 和 `setBattleIntensity()`；后者在战斗曲播放时会触发重新排程。游戏入口目前直接调用 `startMusic()`，游戏引擎调用 `setBattleIntensity()`。菜单曲文件为 `public/assets/music/menu-pixelate.mp3`；战斗曲由 Web Audio 合成，`public/assets/music/battle-vastness.mp3` 仍在目录中但不作为默认播放曲目。
- **依赖与可运行命令**：检查时 `node_modules/.bin/vite` 存在。`package.json` 定义 `npm run dev`、`npm run build`、`npm run preview`；本次没有启动服务，也没有运行 Vite 构建。
- **自动化验证**：本次重新运行 `node scripts/verify.mjs`，18 组、84 条断言全部通过。范围是部分引擎规则，不覆盖宠物专项、完整浏览器交互、构建或真实设备。
- **未验证**：本次没有运行浏览器全流程、真实手机触控/安全区检查或 Vite build，也没有检查外部资产来源及许可证页面。没有据此声称在线环境、运行服务器或外部许可已验证。
- **资产登记**：`ASSET_LICENSES.md` 对照当前 Kenney 图像/音效引用及音乐文件状态，区分仓库内许可证声明与外部独立核验；`public/assets/kenney/README.md` 记录实际使用与未发现源码引用的随包资源。
