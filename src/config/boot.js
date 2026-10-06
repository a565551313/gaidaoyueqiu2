// 启动链路配置（docs/BOOT_FLOW_DESIGN.md §7.1）。
// 纯常量：不含函数逻辑，改这里不需要动任何组件。

export const BOOT_CONFIG = Object.freeze({
  // LOGO 展示页时长（毫秒）；点击/按键可随时跳过
  splashMsFirst: 1800, // 首次（本机无任何云端会话记忆）
  splashMsReturning: 1200, // 回访
  // 唯一服务器时自动跳过选服页（更新页仍会闪现服务器名）
  autoSkipServerWhenSingle: true,
  // 远端 app-config 地址（版本检查/公告/服务器状态）。null = 跳过版本检查步骤
  appConfigUrl: null,
  // 合规链接（docs/legal/ 占位，发行前补真实文本）
  legal: Object.freeze({
    agreementUrl: '/legal/agreement.html',
    privacyUrl: '/legal/privacy.html'
  })
})
