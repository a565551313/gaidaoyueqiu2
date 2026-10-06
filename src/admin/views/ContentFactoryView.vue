<template>
  <section class="ad-page cf-page">
    <header class="ad-page-head">
      <h2>内容工厂</h2>
      <span class="cf-mode-chip" :class="modeClass">{{ modeTitle }}</span>
    </header>

    <!-- 顶部常驻模式提示（mock / supabase 行为差异一眼可见） -->
    <p class="cf-mode-hint">{{ modeHint }}</p>

    <!-- 7 包 tab（冻结清单，不可增删） -->
    <nav class="cf-tabs">
      <button
        v-for="p in tabList"
        :key="p.key"
        :class="{ on: activeTab === p.key }"
        @click="switchTab(p.key)"
      >
        <span>{{ p.label }}</span>
        <em v-if="statusOf(p.key)" class="cf-status" :class="statusOf(p.key).status">
          {{ statusText(statusOf(p.key)) }}
        </em>
        <i v-if="dirtyMap[p.key]" class="cf-dot" title="有未保存修改">●</i>
      </button>
    </nav>

    <p v-if="error" class="ad-error">{{ error }}</p>
    <p v-if="notice" class="ad-ok">{{ notice }}</p>

    <template v-if="current">
      <!-- 工具栏：草稿状态 + 操作 -->
      <div class="ad-panel cf-toolbar">
        <div class="cf-toolbar-info">
          <h3>{{ PACK_META[activeTab].label }} <code>{{ activeTab }}</code></h3>
          <p class="cf-toolbar-desc">{{ PACK_META[activeTab].desc }}</p>
          <p class="cf-toolbar-state">
            <template v-if="current.loading">载入中…</template>
            <template v-else-if="current.baseline">
              当前展示为<b>打包默认值</b>（与线上等效，尚未落库）<span v-if="dirtyMap[activeTab]" class="cf-warn-text"> · 有未保存修改</span>——改完点「保存草稿」生成草稿 v1
            </template>
            <template v-else>
              草稿 v{{ current.version }}
              <span v-if="dirtyMap[activeTab]" class="cf-warn-text"> · 有未保存修改</span>
              <span v-else> · 已保存</span>
            </template>
          </p>
          <p v-if="activeTab === 'levels'" class="cf-toolbar-note">
            此包也可用左侧导航「关卡设计」（T5 专用关卡编辑器）编辑；本页为通用编辑器。
          </p>
        </div>
        <div class="cf-toolbar-actions">
          <button class="ad-btn sm" :disabled="current.loading || busy" @click="resetPack">重置</button>
          <button class="ad-btn cf-btn-save" :disabled="!canSave" @click="saveDraft">
            {{ busy === 'save' ? '保存中…' : '保存草稿' }}
          </button>
          <button class="ad-btn cf-btn-publish" :disabled="!canPublish" @click="confirmingPublish = true">
            发布
          </button>
          <button class="ad-btn sm" :disabled="current.loading" @click="toggleHistory">
            {{ historyOpen ? '收起历史' : '历史版本' }}
          </button>
        </div>
      </div>

      <!-- 发布二次确认 -->
      <div v-if="confirmingPublish" class="cf-confirm ad-panel">
        <b>确认发布「{{ PACK_META[activeTab].label }}」？</b>
        <p>
          将把当前草稿 v{{ current.version }} 复制进已发布区。<b>发布后玩家下次启动生效。</b>
          <template v-if="isMock">（本地模拟模式：发布会同步写入本机玩家内容缓存，刷新游戏首页 / 立即可验证）</template>
        </p>
        <div class="cf-confirm-actions">
          <button class="ad-btn cf-btn-publish" :disabled="busy === 'publish'" @click="doPublish">
            {{ busy === 'publish' ? '发布中…' : '确认发布' }}
          </button>
          <button class="ad-btn" @click="confirmingPublish = false">取消</button>
        </div>
      </div>

      <!-- 历史版本 -->
      <div v-if="historyOpen" class="ad-panel cf-history">
        <h3>{{ PACK_META[activeTab].label }} · 历史版本</h3>
        <p class="cf-history-hint">{{ historyHint }}</p>
        <p v-if="historyError" class="ad-error">{{ historyError }}</p>
        <p v-else-if="!historyRows.length" class="ad-empty">还没有任何版本记录</p>
        <table v-else class="ad-table">
          <thead>
            <tr><th>版本</th><th>时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in historyRows" :key="row.version + ':' + row.updated_at">
              <td class="ad-mono">v{{ row.version }}</td>
              <td>{{ fmtTime(row.updated_at) }}</td>
              <td class="cf-history-op">
                <button class="ad-btn sm" @click="previewHistory(row)">
                  {{ historyPreviewKey === row ? '收起' : '查看' }}
                </button>
                <button class="ad-btn sm" @click="loadHistory(row)">载入编辑器</button>
              </td>
            </tr>
          </tbody>
        </table>
        <pre v-if="historyPreviewKey" class="ad-json cf-history-json">{{ historyPreviewJson }}</pre>
      </div>

      <!-- 编辑器主体：按包字段分区，形状自适应渲染 -->
      <div v-if="!current.loading && drafts[activeTab]" class="cf-editor">
        <section v-for="field in PACK_FIELDS[activeTab]" :key="field" class="ad-panel cf-field">
          <header class="cf-field-head">
            <h3>{{ fieldTitle(field) }} <code>{{ field }}</code></h3>
            <span class="cf-kind-badge">{{ kindLabel(drafts[activeTab][field]) }}</span>
          </header>
          <ValueEditor :val="drafts[activeTab][field]" :path="field" :depth="0" />
        </section>
      </div>
      <p v-else-if="current.loading" class="ad-empty">载入中…</p>
    </template>
  </section>
</template>

<script setup>
// 内容工厂（T4）：7 个内容包的通用编辑器。
// 数据层只调用 ../api/content.js 的六个导出（§C3 冻结依赖面），不自己发 RPC、
// 不自己读写 localStorage；打包默认值只从 core/content.js 的 DEFAULT_BUNDLE 读取做展示打底。
import { computed, reactive, ref, watch, onMounted, h, provide, inject } from 'vue'
import {
  PACK_KEYS, PACK_META,
  listPacks, getPack, savePack, publishPack, packHistory
} from '../api/content.js'
import { adminState } from '../api.js'
import { DEFAULT_BUNDLE } from '../../core/content.js'

const props = defineProps({ initialTab: { type: String, default: 'blocks' } })

// §C1 冻结的「包 key ↔ 玩家 bundle 字段」映射（与 api/content.js 内部一致；契约冻结）。
const PACK_FIELDS = {
  levels: ['chapters', 'levels'],
  materials: ['materials'],
  blocks: ['blockTypes', 'statSpecs'],
  items: ['items', 'bag'],
  skills: ['skills'],
  pets: ['pets', 'petStarCosts'],
  ants: ['ants']
}

// 字段展示名（仅为 UI 文案，不影响数据）。
const FIELD_TITLES = {
  chapters: '章节', levels: '关卡', materials: '材质列表', blockTypes: '方块类型',
  statSpecs: '六轴属性表', items: '道具', bag: '背包容量', skills: '技能',
  pets: '宠物', petStarCosts: '升星金币消耗', ants: '蚂蚁参数（兵种 / 性格 / 原型 / 耐久 / 波次）'
}

// ---------------------------------------------------------------------------
// 自适应渲染的辅助函数 & 递归编辑器组件
//   形状分派规则（任务卡要求）：
//     标量          → 数字 / 文本 / 布尔 对应控件（hex 颜色带色板预览）
//     标量数组       → chips + 增删
//     对象数组       → 表格行 + 增删 / 复制，嵌套结构在行内展开编辑
//     嵌套对象       → 分组折叠
// ---------------------------------------------------------------------------
const EDIT_NOTIFY = 'cf-edit-notify'

const isScalar = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v)
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function kindOf(v) {
  if (Array.isArray(v)) {
    if (v.every(isScalar)) return 'scalarArray'
    if (v.every(isPlainObject)) return 'objectArray'
    return 'mixedArray'
  }
  if (isPlainObject(v)) return 'object'
  return 'scalar'
}

function kindLabel(v) {
  const k = kindOf(v)
  if (k === 'scalarArray') return `数组 × ${v.length}`
  if (k === 'objectArray') return `列表 × ${v.length}`
  if (k === 'object') return `对象 · ${Object.keys(v).length} 键`
  return String(v)
}

const cloneJson = (v) => JSON.parse(JSON.stringify(v))
const isColorString = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v)

// 标量叶子控件（直接改 obj[key] —— 整棵草稿树是 reactive 的，页级靠 notify 置脏）。
// 数字用 change（blur/回车）提交，避免输入中间态被打断；非法输入回退为原值。
function leafVNode(obj, key, notify) {
  const v = obj[key]
  if (typeof v === 'boolean') {
    return h('label', { class: 'cf-bool' }, [
      h('input', {
        type: 'checkbox', checked: v,
        onChange: (e) => { obj[key] = e.target.checked; notify() }
      }),
      h('span', { class: 'cf-bool-text' }, v ? '是' : '否')
    ])
  }
  if (typeof v === 'number') {
    return h('input', {
      class: 'cf-input cf-num', type: 'number', step: 'any', value: v,
      onChange: (e) => {
        const n = e.target.valueAsNumber
        if (Number.isNaN(n)) e.target.value = v
        else { obj[key] = n; notify() }
      }
    })
  }
  if (typeof v === 'string') {
    return h('span', { class: 'cf-str' }, [
      isColorString(v) ? h('i', { class: 'cf-swatch', style: { background: v }, title: v }) : null,
      h('input', {
        class: 'cf-input cf-text', type: 'text', value: v,
        onInput: (e) => { obj[key] = e.target.value; notify() }
      })
    ])
  }
  return h('span', { class: 'cf-null' }, 'null')
}

// 标量数组 → chips
const ScalarChips = {
  name: 'ScalarChips',
  props: { arr: { type: Array, required: true } },
  setup(props) {
    const notify = inject(EDIT_NOTIFY, () => {})
    const input = ref('')
    function add() {
      const raw = input.value.trim()
      if (!raw) return
      const sample = props.arr[0]
      let val = raw
      if (typeof sample === 'number') {
        const n = Number(raw)
        if (Number.isNaN(n)) return
        val = n
      } else if (typeof sample === 'boolean') {
        val = raw === 'true'
      }
      props.arr.push(val)
      input.value = ''
      notify()
    }
    return () => h('div', { class: 'cf-chips' }, [
      ...props.arr.map((v, i) => h('span', { class: 'cf-chip', key: i }, [
        isColorString(v) ? h('i', { class: 'cf-swatch', style: { background: v } }) : null,
        String(v),
        h('button', {
          class: 'cf-chip-x', title: '删除',
          onClick: () => { props.arr.splice(i, 1); notify() }
        }, '×')
      ])),
      h('span', { class: 'cf-chip-add' }, [
        h('input', {
          class: 'cf-input', value: input.value, placeholder: '新增',
          onInput: (e) => { input.value = e.target.value },
          onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }
        }),
        h('button', { class: 'ad-btn sm', onClick: add }, '＋')
      ]),
      props.arr.length === 0 ? h('span', { class: 'cf-chip-hint' }, '空数组' ) : null
    ])
  }
}

// 对象数组 → 表格；列 = 各行标量键的并集，嵌套键在行内展开成递归编辑器
const ObjectArrayEditor = {
  name: 'ObjectArrayEditor',
  props: { arr: { type: Array, required: true }, path: { type: String, default: '' }, depth: { type: Number, default: 0 } },
  setup(props) {
    const notify = inject(EDIT_NOTIFY, () => {})
    const expanded = ref(new Set())
    const columns = computed(() => {
      const seen = []
      for (const row of props.arr) {
        for (const k of Object.keys(row)) if (isScalar(row[k]) && !seen.includes(k)) seen.push(k)
      }
      return seen
    })
    const nestedKeys = computed(() => {
      const seen = []
      for (const row of props.arr) {
        for (const k of Object.keys(row)) if (!isScalar(row[k]) && !seen.includes(k)) seen.push(k)
      }
      return seen
    })
    function sampleFor(key) {
      const row = props.arr.find((r) => r[key] !== undefined)
      return row ? row[key] : undefined
    }
    function defaultForScalar(sample) {
      if (typeof sample === 'number') return 0
      if (typeof sample === 'boolean') return false
      return ''
    }
    function newRow() {
      const tpl = {}
      for (const c of columns.value) tpl[c] = defaultForScalar(sampleFor(c))
      for (const k of nestedKeys.value) tpl[k] = cloneJson(sampleFor(k))
      if (typeof tpl.id === 'string') tpl.id = tpl.id ? `${tpl.id}_new` : 'new'
      if (typeof tpl.name === 'string' && tpl.name) tpl.name = `${tpl.name}（新）`
      return tpl
    }
    function addRow() {
      if (!props.arr.length) { props.arr.push({}); notify(); return }
      props.arr.push(newRow())
      expanded.value = new Set([...expanded.value, props.arr.length - 1])
      notify()
    }
    function toggle(i) {
      const s = new Set(expanded.value)
      if (s.has(i)) s.delete(i); else s.add(i)
      expanded.value = s
    }
    function missingKeysOf(row) {
      return [...columns.value, ...nestedKeys.value].filter((k) => row[k] === undefined)
    }
    function addKey(row, key) {
      const sample = sampleFor(key)
      row[key] = isScalar(sample) ? defaultForScalar(sample) : cloneJson(sample)
      notify()
    }
    return () => {
      const totalCols = columns.value.length + nestedKeys.value.length + 1
      return h('div', { class: 'cf-oa' }, [
        h('div', { class: 'cf-oa-scroll' }, [
          h('table', { class: 'ad-table cf-table' }, [
            h('thead', [
              h('tr', [
                ...columns.value.map((c) => h('th', { key: c }, c)),
                ...nestedKeys.value.map((k) => h('th', { key: k }, `${k} ▸`)),
                h('th', { class: 'cf-op' }, '操作')
              ])
            ]),
            h('tbody', props.arr.flatMap((row, i) => {
              const missing = missingKeysOf(row)
              const rows = [h('tr', { key: `r${i}` }, [
                ...columns.value.map((c) => h('td', { key: c, class: 'cf-cell' },
                  row[c] === undefined ? h('span', { class: 'cf-missing' }, '—') : leafVNode(row, c, notify))),
                ...nestedKeys.value.map((k) => h('td', { key: k, class: 'cf-cell' },
                  row[k] === undefined
                    ? h('span', { class: 'cf-missing' }, '—')
                    : h('button', { class: 'ad-btn sm cf-ghost', onClick: () => toggle(i) }, kindLabel(row[k])))),
                h('td', { class: 'cf-op' }, [
                  h('button', {
                    class: 'ad-btn sm', title: '复制此行', onClick: () => {
                      props.arr.splice(i + 1, 0, cloneJson(row)); notify()
                    }
                  }, '复制'),
                  h('button', {
                    class: 'ad-btn sm cf-del', title: '删除此行', onClick: () => {
                      props.arr.splice(i, 1); notify()
                    }
                  }, '删除')
                ])
              ])]
              if (expanded.value.has(i)) {
                rows.push(h('tr', { key: `d${i}`, class: 'cf-detail' }, [
                  h('td', { colspan: totalCols }, [
                    ...nestedKeys.value.filter((k) => row[k] !== undefined).map((k) => h('section', { class: 'cf-nested', key: k }, [
                      h('header', { class: 'cf-nested-head' }, [
                        h('b', k),
                        h('span', { class: 'cf-kind-badge' }, kindLabel(row[k]))
                      ]),
                      h(ValueEditor, { val: row[k], path: `${props.path}[${i}].${k}`, depth: props.depth + 1 })
                    ])),
                    missing.length ? h('div', { class: 'cf-missing-add' }, [
                      h('span', '可选字段：'),
                      ...missing.map((k) => h('button', {
                        class: 'ad-btn sm cf-ghost', key: k,
                        title: '该行暂缺此字段，点击按其他行的形状补齐',
                        onClick: () => addKey(row, k)
                      }, `＋ ${k}`))
                    ]) : null
                  ])
                ]))
              }
              return rows
            }))
          ])
        ]),
        h('div', { class: 'cf-oa-foot' }, [
          h('button', { class: 'ad-btn sm', onClick: addRow }, '＋ 新增一行'),
          h('span', { class: 'cf-count' }, `${props.arr.length} 行`)
        ])
      ])
    }
  }
}

// 嵌套对象 → 标量表单栅格 + 复合值分组折叠
const PlainObjectEditor = {
  name: 'PlainObjectEditor',
  props: { obj: { type: Object, required: true }, path: { type: String, default: '' }, depth: { type: Number, default: 0 } },
  setup(props) {
    const notify = inject(EDIT_NOTIFY, () => {})
    // 深层（depth ≥ 1）的分组默认收起，避免蚂蚁/关卡包一页过长
    const collapsed = ref(new Set(
      props.depth >= 1 ? Object.keys(props.obj).filter((k) => !isScalar(props.obj[k])) : []
    ))
    const scalarKeys = computed(() => Object.keys(props.obj).filter((k) => isScalar(props.obj[k])))
    const groupKeys = computed(() => Object.keys(props.obj).filter((k) => !isScalar(props.obj[k])))
    function toggle(k) {
      const s = new Set(collapsed.value)
      if (s.has(k)) s.delete(k); else s.add(k)
      collapsed.value = s
    }
    return () => h('div', { class: 'cf-obj' }, [
      scalarKeys.value.length ? h('div', { class: 'cf-form' }, scalarKeys.value.map((k) => h('label', { class: 'cf-form-item', key: k }, [
        h('span', { class: 'cf-form-label' }, [k, isColorString(props.obj[k]) ? h('i', { class: 'cf-swatch', style: { background: props.obj[k] } }) : null]),
        leafVNode(props.obj, k, notify)
      ]))) : null,
      ...groupKeys.value.map((k) => h('section', { class: 'cf-group', key: k }, [
        h('header', { class: 'cf-group-head', onClick: () => toggle(k) }, [
          h('span', { class: 'cf-caret' }, collapsed.value.has(k) ? '▸' : '▾'),
          h('b', k),
          h('span', { class: 'cf-kind-badge' }, kindLabel(props.obj[k]))
        ]),
        collapsed.value.has(k) ? null : h('div', { class: 'cf-group-body' }, [
          h(ValueEditor, { val: props.obj[k], path: `${props.path}.${k}`, depth: props.depth + 1 })
        ])
      ]))
    ])
  }
}

// 形状分派器（递归入口）
const ValueEditor = {
  name: 'ValueEditor',
  props: { val: {}, path: { type: String, default: '' }, depth: { type: Number, default: 0 } },
  setup(props) {
    return () => {
      const k = kindOf(props.val)
      if (k === 'scalarArray') return h(ScalarChips, { arr: props.val })
      if (k === 'objectArray') return h(ObjectArrayEditor, { arr: props.val, path: props.path, depth: props.depth })
      if (k === 'object') return h(PlainObjectEditor, { obj: props.val, path: props.path, depth: props.depth })
      // mixedArray / 顶层标量不属任何已知包形状：只读展示，防误改
      return h('pre', { class: 'ad-json cf-readonly' }, JSON.stringify(props.val, null, 2))
    }
  }
}

// ---------------------------------------------------------------------------
// 页面状态
// ---------------------------------------------------------------------------
function normalizeTab(t) {
  return PACK_KEYS.includes(t) ? t : 'blocks'
}

const activeTab = ref(normalizeTab(props.initialTab))
const tabList = PACK_KEYS.map((key) => ({ key, ...PACK_META[key] }))

const statusMap = ref({})               // key → { status, version, updated_at }（listPacks）
const drafts = reactive({})             // key → 正在编辑的草稿数据（reactive 树）
const packStates = reactive({})         // key → { version, baseline, loading, loaded }
const dirtyMap = reactive({})           // key → bool（独立于草稿树，避免深度 watch 副作用）
const busy = ref('')                    // '' | 'save' | 'publish'
const error = ref('')
const notice = ref('')
const confirmingPublish = ref(false)
const historyOpen = ref(false)
const historyRows = ref([])
const historyError = ref('')
const historyPreviewKey = ref(null)
const historyPreviewJson = ref('')

function stateOf(key) {
  if (!packStates[key]) {
    packStates[key] = { version: 0, baseline: false, loading: false, loaded: false }
  }
  return packStates[key]
}
const current = computed(() => stateOf(activeTab.value))

const isMock = computed(() => adminState.mode !== 'supabase')
const modeClass = computed(() => (isMock.value ? 'mock' : 'supabase'))
const modeTitle = computed(() => (isMock.value ? '本地模拟（mock）' : 'Supabase 云端'))
const modeHint = computed(() => (isMock.value
  ? '本地模拟模式：草稿与已发布都只存在本机；发布会同步写入玩家内容缓存 —— 改完刷新游戏首页（/）立即可验证，适合端到端自测。'
  : 'Supabase 云端模式：草稿 / 发布 / 历史全部走 admin_* RPC（0003 迁移）；发布后对全部玩家下次启动生效。'))
const historyHint = computed(() => (isMock.value
  ? '本地模拟模式仅保留「当前草稿 + 当前已发布」两个版本（见 api/content.js）；完整历史快照在 Supabase 模式（0003 已执行）下每次保存自动累积。'
  : '每次保存草稿都会在 content_pack_versions 落一条快照。'))

const canSave = computed(() => {
  const st = current.value
  return !!st && st.loaded && !st.loading && busy.value === '' && (dirtyMap[activeTab.value] || st.baseline)
})
const canPublish = computed(() => {
  const st = current.value
  // mock：无草稿时 publishPack 会抛错，这里前置拦截
  return !!st && st.loaded && !st.loading && busy.value === '' && !st.baseline && st.version > 0 && !dirtyMap[activeTab.value]
})

function markDirty() {
  dirtyMap[activeTab.value] = true
}
provide(EDIT_NOTIFY, markDirty)

// ---------------------------------------------------------------------------
// 数据流（全部经 api/content.js 六个导出）
// ---------------------------------------------------------------------------
function setDraft(key, data, { dirty = false } = {}) {
  drafts[key] = data
  dirtyMap[key] = dirty
}

function baselineFor(key) {
  const data = {}
  for (const f of PACK_FIELDS[key]) data[f] = cloneJson(DEFAULT_BUNDLE[f])
  return data
}

async function refreshStatus() {
  try {
    const rows = await listPacks()
    const m = {}
    for (const r of rows) m[r.key] = r
    statusMap.value = m
  } catch (e) {
    error.value = `读取包列表失败：${e?.message || e}`
  }
}

async function loadPack(key) {
  const st = stateOf(key)
  if (st.loading) return
  st.loading = true
  error.value = ''
  try {
    const res = await getPack(key)
    if (res && res.data) {
      setDraft(key, cloneJson(res.data))
      st.version = res.version
      st.baseline = false
    } else {
      // 无草稿：用打包默认值打底展示（管理员第一眼看到的就是当前线上等效内容）
      setDraft(key, baselineFor(key))
      st.version = 0
      st.baseline = true
    }
    st.loaded = true
  } catch (e) {
    error.value = `读取「${key}」失败：${e?.message || e}`
  } finally {
    st.loading = false
  }
}

function switchTab(key) {
  if (key === activeTab.value) return
  if (dirtyMap[activeTab.value]) {
    if (!window.confirm('当前包有未保存修改，切换将丢弃这些修改。确定切换？')) return
    const st = stateOf(activeTab.value)
    st.loaded = false // 丢弃未保存修改，回到已存版本
  }
  activeTab.value = key
  confirmingPublish.value = false
  historyOpen.value = false
  historyPreviewKey.value = null
  notice.value = ''
  error.value = ''
  if (!stateOf(key).loaded) loadPack(key)
}

watch(() => props.initialTab, (t) => {
  // AdminApp 在 blocks / ants 两个入口间复用本组件实例，靠 prop 切 tab
  const key = normalizeTab(t)
  if (key !== activeTab.value) switchTab(key)
})

function resetPack() {
  const key = activeTab.value
  if (dirtyMap[key] && !window.confirm('重置将丢弃未保存修改，回到最近一次保存的草稿。继续？')) return
  stateOf(key).loaded = false
  confirmingPublish.value = false
  notice.value = ''
  loadPack(key)
}

// 保存前结构自检：字段齐全、无 undefined / 非法数值、顶层类型与默认包一致
function validatePack(key, data) {
  const issues = []
  if (!isPlainObject(data)) return ['包数据必须是对象']
  for (const f of PACK_FIELDS[key]) {
    if (!(f in data)) { issues.push(`缺少字段 ${f}`); continue }
    if (data[f] === undefined) { issues.push(`字段 ${f} 为 undefined`); continue }
    const want = DEFAULT_BUNDLE[f]
    const got = data[f]
    if (Array.isArray(want) !== Array.isArray(got) || typeof want !== typeof got) {
      issues.push(`字段 ${f} 的类型与默认包不一致`)
    }
  }
  const bad = findInvalid(data)
  if (bad) issues.push(`存在非法值：${bad}`)
  try {
    JSON.parse(JSON.stringify(data))
  } catch (e) {
    issues.push('数据无法序列化为 JSON')
  }
  return issues
}

function findInvalid(v, path = '$') {
  if (v === undefined) return path
  if (typeof v === 'number' && !Number.isFinite(v)) return `${path}（非有限数值）`
  if (typeof v === 'function') return `${path}（函数不可入包）`
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const r = findInvalid(v[i], `${path}[${i}]`)
      if (r) return r
    }
  } else if (isPlainObject(v)) {
    for (const k of Object.keys(v)) {
      const r = findInvalid(v[k], `${path}.${k}`)
      if (r) return r
    }
  }
  return ''
}

async function saveDraft() {
  const key = activeTab.value
  const st = stateOf(key)
  const issues = validatePack(key, drafts[key])
  if (issues.length) {
    error.value = `结构自检未通过：${issues.join('；')}`
    notice.value = ''
    return
  }
  busy.value = 'save'
  error.value = ''
  try {
    const version = await savePack(key, cloneJson(drafts[key]))
    st.version = version
    st.baseline = false
    dirtyMap[key] = false
    notice.value = `已保存草稿 v${version}（玩家暂不受影响，发布后生效）`
    refreshStatus()
  } catch (e) {
    error.value = `保存失败：${e?.message || e}`
    notice.value = ''
  } finally {
    busy.value = ''
  }
}

async function doPublish() {
  confirmingPublish.value = false
  const key = activeTab.value
  busy.value = 'publish'
  error.value = ''
  try {
    const version = await publishPack(key)
    notice.value = isMock.value
      ? `已发布 v${version}。已写入本机玩家内容缓存，刷新游戏首页（/）即可看到新内容。`
      : `已发布 v${version}，玩家下次启动生效。`
    refreshStatus()
  } catch (e) {
    error.value = `发布失败：${e?.message || e}`
    notice.value = ''
  } finally {
    busy.value = ''
  }
}

async function toggleHistory() {
  historyOpen.value = !historyOpen.value
  historyPreviewKey.value = null
  if (!historyOpen.value) return
  historyError.value = ''
  try {
    historyRows.value = await packHistory(activeTab.value, 20)
  } catch (e) {
    historyError.value = `读取历史失败：${e?.message || e}`
    historyRows.value = []
  }
}

function previewHistory(row) {
  if (historyPreviewKey.value === row) {
    historyPreviewKey.value = null
    historyPreviewJson.value = ''
  } else {
    historyPreviewKey.value = row
    historyPreviewJson.value = JSON.stringify(row.data, null, 2)
  }
}

function loadHistory(row) {
  const key = activeTab.value
  if (dirtyMap[key] && !window.confirm('载入历史版本会覆盖当前未保存修改。继续？')) return
  // 恢复为该版本内容，但要再点「保存草稿」才会成为新的草稿版本
  setDraft(key, cloneJson(row.data), { dirty: true })
  stateOf(key).baseline = false
  notice.value = `已载入 v${row.version} 的内容到编辑器（未落库）——确认无误后点「保存草稿」生成新版本`
  historyOpen.value = false
  historyPreviewKey.value = null
}

// ---------------------------------------------------------------------------
// 展示辅助
// ---------------------------------------------------------------------------
function statusOf(key) {
  return statusMap.value[key] || null
}
function statusText(s) {
  if (s.status === 'draft') return `草稿 v${s.version}`
  if (s.status === 'published') return `已发布 v${s.version}`
  return '未初始化'
}
function fieldTitle(f) {
  return FIELD_TITLES[f] || f
}
function fmtTime(v) {
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v))
  return Number.isNaN(+d) ? String(v) : d.toLocaleString('zh-CN', { hour12: false })
}

onMounted(() => {
  refreshStatus()
  loadPack(activeTab.value)
})
</script>

<style scoped>
/* 视觉遵循 admin.css（石墨底 + 青蓝高亮 + #2f81f7 主色），此处只补内容工厂特有布局 */
.cf-page { max-width: 1120px; }

/* 顶部模式提示 */
.cf-mode-chip {
  padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: .04em;
  border: 1px solid #8fb98d55; color: #8fd4a0; background: #14201a;
}
.cf-mode-chip.supabase { border-color: #6fc2b055; color: #6fc2b0; background: #12201f; }
.cf-mode-hint { margin: -6px 0 0; color: #5c7288; font-size: 12px; line-height: 1.7; }

/* 包 tab */
.cf-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.cf-tabs button {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 8px 12px; border-radius: 8px; cursor: pointer;
  border: 1px solid #2b3d52; background: #0f1620; color: #b9c9db; font-size: 13px; font-weight: 700;
}
.cf-tabs button:hover { background: #17222f; color: #fff; }
.cf-tabs button.on { background: #1b2c41; color: #fff; border-color: #2f81f7; box-shadow: inset 0 -2px 0 #2f81f7; }
.cf-status { font-style: normal; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 4px; }
.cf-status.empty { background: #1a2534; color: #5c7288; }
.cf-status.draft { background: #2b2613; color: #ffd36e; }
.cf-status.published { background: #14201a; color: #8fd4a0; }
.cf-dot { font-style: normal; color: #ffd36e; font-size: 9px; }

/* 工具栏 */
.cf-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.cf-toolbar-info h3 { margin: 0 0 4px; font-size: 14px; color: #dce6f2; }
.cf-toolbar-info code { color: #58a6ff; font-size: 12px; }
.cf-toolbar-desc { margin: 0; color: #9db4cc; font-size: 12px; }
.cf-toolbar-state { margin: 6px 0 0; color: #6fa3c8; font-size: 12px; }
.cf-toolbar-note { margin: 6px 0 0; color: #5c7288; font-size: 11px; }
.cf-warn-text { color: #ffd36e; }
.cf-toolbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.cf-btn-save { background: #2f81f7; border-color: #2f81f7; color: #fff; }
.cf-btn-save:hover { background: #3d8bff; }
.cf-btn-publish { background: #238636; border-color: #2ea043; color: #fff; }
.cf-btn-publish:hover { background: #2ea043; }
.cf-ghost { opacity: .85; }
.cf-del { color: #ff8f8f; }

/* 发布二次确认 */
.cf-confirm { border-color: #ffd36e66; background: #17160f; }
.cf-confirm b { color: #ffd36e; }
.cf-confirm p { margin: 8px 0 12px; color: #9db4cc; font-size: 12px; line-height: 1.7; }
.cf-confirm-actions { display: flex; gap: 8px; }

/* 历史版本 */
.cf-history h3 { margin: 0 0 6px; }
.cf-history-hint { margin: 0 0 10px; color: #5c7288; font-size: 11px; line-height: 1.7; }
.cf-history-op { display: flex; gap: 6px; }
.cf-history-json { margin-top: 10px; max-height: 420px; }

/* 编辑器分区 */
.cf-editor { display: flex; flex-direction: column; gap: 12px; }
.cf-field-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  margin: -2px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #1a2534;
}
.cf-field-head h3 { margin: 0; font-size: 13px; color: #9db4cc; }
.cf-field-head code { color: #58a6ff; font-size: 11px; }
.cf-kind-badge { font-size: 10px; color: #6fa3c8; background: #0d1520; border: 1px solid #1e2a3a; padding: 1px 7px; border-radius: 4px; white-space: nowrap; }

/* 表单栅格（嵌套对象的标量部分） */
.cf-form { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px 14px; margin-bottom: 4px; }
.cf-form-item { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.cf-form-label { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #6fa3c8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.cf-input {
  min-height: 30px; padding: 0 8px; border-radius: 6px; width: 100%;
  border: 1px solid #2b3d52; background: #0d1520; color: #dce6f2; font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.cf-input:focus { outline: none; border-color: #2f81f7; }
.cf-num { min-width: 90px; }
.cf-str { display: inline-flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.cf-swatch {
  display: inline-block; width: 14px; height: 14px; border-radius: 4px; flex: none;
  border: 1px solid #ffffff33;
}
.cf-bool { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; min-height: 30px; }
.cf-bool input { accent-color: #2f81f7; width: 15px; height: 15px; }
.cf-bool-text { font-size: 12px; color: #9db4cc; }
.cf-null { color: #5c7288; font-size: 12px; }
.cf-missing { color: #44576b; }

/* chips（标量数组） */
.cf-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.cf-chip {
  display: inline-flex; align-items: center; gap: 5px;
  background: #17222f; border: 1px solid #2b3d52; border-radius: 6px; padding: 3px 7px;
  font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #cfe0f2;
}
.cf-chip-x {
  border: 0; background: transparent; color: #ff8f8f; cursor: pointer;
  font-size: 13px; line-height: 1; padding: 0 1px;
}
.cf-chip-add { display: inline-flex; align-items: center; gap: 5px; }
.cf-chip-add .cf-input { width: 90px; min-height: 26px; }
.cf-chip-hint { color: #5c7288; font-size: 11px; }

/* 对象数组表格 */
.cf-oa-scroll { overflow-x: auto; border: 1px solid #1a2534; border-radius: 8px; }
.cf-table th { white-space: nowrap; position: sticky; top: 0; }
.cf-table td { vertical-align: middle; }
.cf-cell { min-width: 90px; }
.cf-cell .cf-text { min-width: 160px; }
.cf-op { white-space: nowrap; }
.cf-op .ad-btn + .ad-btn { margin-left: 5px; }
.cf-detail td { background: #0d1520; padding: 12px 14px; }
.cf-oa-foot { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.cf-count { color: #5c7288; font-size: 11px; }

/* 行内嵌套编辑 */
.cf-nested { border-left: 2px solid #2b3d52; padding: 8px 0 8px 12px; margin: 8px 0; }
.cf-nested-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; color: #9db4cc; }
.cf-missing-add { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 10px; padding-top: 8px; border-top: 1px dashed #1e2a3a; color: #5c7288; font-size: 11px; }

/* 分组折叠（嵌套对象） */
.cf-group { border: 1px solid #1e2a3a; border-radius: 8px; margin-top: 8px; overflow: hidden; }
.cf-group-head {
  display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;
  padding: 8px 10px; background: #0e1622; font-size: 12px; color: #b9c9db;
}
.cf-group-head:hover { background: #17222f; }
.cf-caret { color: #58a6ff; font-size: 10px; }
.cf-group-body { padding: 10px 12px 12px; border-top: 1px solid #1a2534; }
.cf-readonly { margin: 0; max-height: 240px; }
</style>
