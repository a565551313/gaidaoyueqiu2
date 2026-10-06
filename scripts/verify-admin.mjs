// 管理后台结构回归（Phase 2 · T0 起）：
//   A1 admin 全量 SFC 可编译（子进程 vite build，与 uiflow 同法）
//   A2 导航接线：blocks/ants → 内容工厂、levels → 关卡编辑器（并行任务的公共接缝）
//   A3 架构规则：src/admin/** 递归不许 import store.js
//   A4 契约冻结：api/content.js 必须导出 T4/T5 依赖的六个名字，PACK_KEYS 与冻结清单一致
// 运行：node scripts/verify-admin.mjs（已接入 npm run test:all）

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0
function ok(cond, label) {
  if (!cond) {
    console.error(`  ✗ ${label}`)
    process.exit(1)
  }
  passed++
  console.log(`  ✓ ${label}`)
}

// ================================================================
console.log('A1 · admin 全量编译（vite build）')
// ================================================================
execFileSync(process.execPath, ['scripts/uiflow/admin-build.mjs'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
const bundle = join(root, '.admin-out/e.mjs')
ok(existsSync(bundle), 'admin bundle 构建成功（所有 SFC 可编译）')
ok(readFileSync(bundle, 'utf8').includes('内容工厂'), 'bundle 内含内容工厂视图')

// ================================================================
console.log('A2 · 导航接线（并行任务公共接缝）')
// ================================================================
const appSrc = readFileSync(join(root, 'src/admin/AdminApp.vue'), 'utf8')
ok(/view === 'blocks' \|\| view === 'ants'/.test(appSrc), 'blocks/ants 两个入口都路由到内容工厂')
ok(/view === 'levels'/.test(appSrc), 'levels 入口路由到关卡编辑器')
ok(appSrc.includes("from './views/ContentFactoryView.vue'") && appSrc.includes("from './views/LevelEditorView.vue'"), '两个编辑器视图均已接线')

// ================================================================
console.log('A3 · 架构规则（admin 不 import store.js）')
// ================================================================
function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(js|vue)$/.test(name)) out.push(p)
  }
  return out
}
for (const file of walk(join(root, 'src/admin'))) {
  const src = readFileSync(file, 'utf8')
  ok(!/from\s+['"].*store\.js['"]/.test(src), `${file.split('/').pop()} 不 import store.js`)
}

// ================================================================
console.log('A4 · 内容层契约（T4/T5 依赖面）')
// ================================================================
const contentSrc = readFileSync(join(root, 'src/admin/api/content.js'), 'utf8')
for (const name of ['PACK_KEYS', 'PACK_META', 'listPacks', 'getPack', 'savePack', 'publishPack', 'packHistory']) {
  ok(new RegExp(`export (async )?(function|const) ${name}\\b`).test(contentSrc), `content.js 导出 ${name}`)
}
const frozenKeys = ['levels', 'materials', 'blocks', 'items', 'skills', 'pets', 'ants']
const keysLine = contentSrc.match(/export const PACK_KEYS = \[([^\]]*)\]/)
ok(keysLine && frozenKeys.every((k) => keysLine[1].includes(`'${k}'`)) && keysLine[1].split(',').length === 7,
  `PACK_KEYS 与冻结清单一致（${frozenKeys.join('/')}）`)
for (const rpc of ['admin_list_packs', 'admin_get_pack', 'admin_save_pack', 'admin_publish_pack', 'admin_pack_history']) {
  ok(contentSrc.includes(`'${rpc}'`), `RPC 名冻结：${rpc}`)
}

// 清理构建产物
rmSync(join(root, '.admin-out'), { recursive: true, force: true })
rmSync(join(root, '.admin-entry.mjs'), { force: true })

console.log(`管理后台结构回归通过：A1-A4 共 ${passed} 条断言。`)
