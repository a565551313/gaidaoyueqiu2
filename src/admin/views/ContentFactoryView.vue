<template>
  <section class="ad-page cf-page">
    <header class="ad-page-head">
      <h2>内容工厂</h2>
      <span class="cf-mode-chip" :class="modeClass">{{ modeTitle }}</span>
    </header>

    <!-- 顶部常驻模式提示（mock / supabase 行为差异一眼可见） -->
    <p class="cf-mode-hint">{{ modeHint }}</p>

    <!-- 7 包 tab（冻结清单，不可增删） -->
    <el-tabs class="cf-tabs" :model-value="activeTab" @tab-change="switchTab">
      <el-tab-pane v-for="p in tabList" :key="p.key" :name="p.key">
        <template #label>
          <span>{{ p.label }}</span>
          <el-tag v-if="statusOf(p.key)" size="small" effect="plain" :type="statusOf(p.key).status === 'published' ? 'success' : statusOf(p.key).status === 'draft' ? 'warning' : 'info'">{{ statusText(statusOf(p.key)) }}</el-tag>
          <i v-if="dirtyMap[p.key]" class="cf-dot" title="有未保存修改">●</i>
        </template>
      </el-tab-pane>
    </el-tabs>

    <AdminToast :message="notice" />
    <AdminError :error="error" context="内容操作" />

    <template v-if="current">
      <!-- 工具栏：草稿状态 + 操作 -->
      <div class="ad-panel cf-toolbar">
        <div class="cf-toolbar-info">
          <h3>{{ PACK_META[activeTab].label }}</h3>
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
            此内容也可在左侧「关卡设计」页面编辑；本页保留完整配置入口。
          </p>
        </div>
        <div class="cf-toolbar-actions">
          <el-button class="ad-btn sm" :disabled="current.loading || busy" @click="resetPack">重置</el-button>
          <el-button class="ad-btn cf-btn-save" :disabled="!canSave" @click="saveDraft">
            {{ busy === 'save' ? '保存中…' : '保存草稿' }}
          </el-button>
          <el-button v-if="activeTab === 'materials'" class="ad-btn cf-btn-publish cf-save-publish" :disabled="!canSaveAndPublish" @click="confirmingPublish = true">
            {{ busy === 'publish' && (dirtyMap[activeTab] || current.baseline) ? '保存并发布中…' : '保存并发布' }}
          </el-button>
          <el-button class="ad-btn cf-btn-publish" :disabled="!canPublish" @click="confirmingPublish = true">
            {{ busy === 'publish' ? '发布中…' : '发布' }}
          </el-button>
          <el-button class="ad-btn sm" :disabled="current.loading" @click="toggleHistory">
            {{ historyOpen ? '收起历史' : '历史版本' }}
          </el-button>
        </div>
      </div>

      <!-- 发布二次确认 -->
      <div v-if="confirmingPublish" class="cf-confirm ad-panel">
        <b>确认发布「{{ PACK_META[activeTab].label }}」？</b>
        <p>
          <template v-if="activeTab === 'materials' && (dirtyMap[activeTab] || current.baseline)">会先将当前材质设置保存为草稿，再立即发布。</template>
          <template v-else>将把当前草稿第 {{ current.version }} 版复制进已发布区。</template>
          <b>发布后玩家下次启动生效。</b>
          <template v-if="isMock">（本地模拟：发布后刷新游戏首页即可查看。）</template>
        </p>
        <div class="cf-confirm-actions">
          <el-button class="ad-btn cf-btn-publish" :disabled="busy === 'publish'" @click="doPublish">
            {{ busy === 'publish' ? ((dirtyMap[activeTab] || current.baseline) ? '保存并发布中…' : '发布中…') : '确认发布' }}
          </el-button>
          <el-button class="ad-btn" :disabled="busy === 'publish'" @click="confirmingPublish = false">取消</el-button>
        </div>
      </div>

      <!-- 历史版本 -->
      <div v-if="historyOpen" class="ad-panel cf-history">
        <h3>{{ PACK_META[activeTab].label }} · 历史版本</h3>
        <p class="cf-history-hint">{{ historyHint }}</p>
        <el-empty v-if="historyLoading" description="正在读取版本记录…" />
        <AdminError v-else-if="historyError" :error="historyError" context="读取历史版本" />
        <el-empty v-else-if="!historyRows.length" description="还没有任何版本记录；保存草稿后会显示在这里。" />
        <div v-else class="cf-history-table-wrap">
          <el-table :data="historyRows" row-key="updated_at" class="ad-table">
            <el-table-column label="版本" width="110"><template #default="{ row }"><span class="ad-mono">v{{ row.version }}</span></template></el-table-column>
            <el-table-column label="时间" min-width="180"><template #default="{ row }">{{ fmtTime(row.updated_at) }}</template></el-table-column>
            <el-table-column label="操作" min-width="190"><template #default="{ row }"><div class="cf-history-op"><el-button class="ad-btn sm" @click="previewHistory(row)">{{ historyPreviewKey === row ? '收起' : '查看' }}</el-button><el-button class="ad-btn sm" @click="loadHistory(row)">载入编辑器</el-button></div></template></el-table-column>
          </el-table>
        </div>
        <p v-if="historyPreviewKey" class="cf-history-summary">{{ historyPreviewSummary }}</p>
      </div>

      <!-- 高频材质参数：把玩家最常感知的售价放在高级配置之前 -->
      <section v-if="!current.loading && activeTab === 'materials' && drafts.materials" class="cf-materials-quick">
        <div class="cf-section-intro">
          <div>
            <h3>材质售价</h3>
            <p>售价单位为金币；0 表示免费。外观与六项属性收在下方的高级参数中。</p>
          </div>
          <span>{{ drafts.materials.materials.length }} 种材质</span>
        </div>
        <article v-for="material in drafts.materials.materials" :key="material.id" class="ad-panel cf-material-card">
          <div class="cf-material-title">
            <i class="cf-material-swatch" :style="{ background: material.color || '#42566c' }"></i>
            <div><h4>{{ material.name || '未命名材质' }}</h4><small>建筑材质</small></div>
          </div>
          <label class="cf-semantic-field">
            <span>售价 <b>金币</b></span>
            <el-input-number v-model="material.price" :min="0" :step="1" :precision="0" controls-position="right" @change="normalizeMaterialPrice(material)" />
            <small>玩家在商店购买此材质需要消耗的金币。</small>
          </label>
        </article>
      </section>

      <!-- 高级参数始终折叠；字段标题和枚举值均翻译为面向运营的中文 -->
      <details v-if="!current.loading && drafts[activeTab]" class="ad-panel cf-advanced">
        <summary>高级参数 · {{ advancedTitle }}</summary>
        <p class="cf-advanced-hint">用于调整外观、属性和规则细节。字段均附中文说明；不确定时请保持默认值。</p>
        <div class="cf-editor">
          <section v-for="field in PACK_FIELDS[activeTab]" :key="field" class="cf-field">
            <header class="cf-field-head">
              <h3>{{ fieldTitle(field) }}</h3>
              <span class="cf-kind-badge">{{ kindLabel(drafts[activeTab][field]) }}</span>
            </header>
            <ValueEditor :val="drafts[activeTab][field]" :path="field" :depth="0" />
          </section>
        </div>
      </details>
      <p v-else-if="current.loading" class="ad-empty">正在载入内容，请稍候…</p>
    </template>
  </section>
</template>

<script setup>
// 内容工厂（T4）：7 个内容包的通用编辑器。
// 数据层只调用 ../api/content.js 的六个导出（§C3 冻结依赖面），不自己发 RPC、
// 不自己读写 localStorage；打包默认值只从 core/content.js 的 DEFAULT_BUNDLE 读取做展示打底。
import { computed, reactive, ref, watch, onMounted, h, provide, inject } from 'vue'
import AdminError from '../components/AdminError.vue'
import AdminToast from '../components/AdminToast.vue'
import { useAutoNotice, fieldInfo, enumLabel } from '../ui.js'
import {
  PACK_KEYS, PACK_META,
  listPacks, getPack, savePack, publishPack, packHistory
} from '../api/content.js'
import { adminState } from '../api.js'
import { DEFAULT_BUNDLE } from '../../core/content.js'
import { ElButton, ElInputNumber, ElInput, ElSelect, ElOption, ElSwitch, ElColorPicker } from 'element-plus'

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
  if (k === 'scalarArray') return `选项列表 · ${v.length} 项`
  if (k === 'objectArray') return `配置列表 · ${v.length} 项`
  if (k === 'object') return `分组设置 · ${Object.keys(v).length} 项`
  return '单项设置'
}

const cloneJson = (v) => JSON.parse(JSON.stringify(v))
const isColorString = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v)
const SYSTEM_KEYS = new Set(['id', 'key', 'codename'])
const BASE_SCENES = ['launchField', 'riversideHomes', 'oldFerry', 'inlandPort', 'crossRiverBridge', 'sciencePark', 'financeCore', 'centralTower']
const CITYSCAPE_CHAPTER_KEYS = ['lanhe', 'yunxiu', 'tingchuan', 'yuting', 'xuecen', 'lichuan']
const CITYSCAPE_OPTIONS = [
  ...BASE_SCENES,
  ...CITYSCAPE_CHAPTER_KEYS.flatMap((chapter) => Array.from({ length: 8 }, (_, i) => `${chapter}-metropolitan-${i + 1}`))
]
const ENUM_OPTIONS = {
  weatherKind: ['clear', 'wind', 'cloud', 'lightning', 'rain', 'snow', 'hail'],
  theme: ['clear', 'wind', 'cloud', 'lightning', 'rain', 'snow', 'hail'],
  motif: ['river', 'wind', 'cloud', 'lightning', 'rain', 'snow', 'hail'],
  cityscape: CITYSCAPE_OPTIONS,
  landmark: BASE_SCENES,
  landmarkFeature: BASE_SCENES,
  preference: ['random', 'high', 'damaged'],
  better: ['high', 'low'],
  edge: ['flame'],
  species: ['worker', 'scout', 'soldier', 'queen']
}

function fieldControl(obj, key, notify) {
  const value = obj[key]
  const meta = fieldInfo(key)
  if (SYSTEM_KEYS.has(key)) return h('span', { class: 'cf-system-value' }, '系统自动识别')
  if (typeof value === 'boolean') {
    return h(ElSwitch, { modelValue: value, 'aria-label': meta.label, inlinePrompt: true, activeText: '是', inactiveText: '否', 'onUpdate:modelValue': (next) => { obj[key] = next; notify() } })
  }
  if (typeof value === 'number') {
    const fractionalDigits = Math.min(8, (String(value).split('.')[1] || '').length)
    const step = fractionalDigits ? 10 ** -fractionalDigits : 1
    return h(ElInputNumber, { modelValue: value, step, controlsPosition: 'right', 'aria-label': meta.label, 'onUpdate:modelValue': (next) => { if (next !== null && !Number.isNaN(Number(next))) { obj[key] = Number(next); notify() } } })
  }
  if (typeof value === 'string') {
    const choices = ENUM_OPTIONS[key]
    if (choices) {
      return h(ElSelect, { modelValue: value, class: 'cf-input cf-select', 'aria-label': meta.label, 'onUpdate:modelValue': (next) => { obj[key] = next; notify() } }, () => choices.map((choice) => h(ElOption, { value: choice, label: enumLabel(choice, key), key: choice })))
    }
    // 内部英文代号不作为可编辑文本暴露；可识别的枚举都使用上面的中文下拉。
    if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) return h('span', { class: 'cf-system-value' }, '使用游戏内置预设')
    if (isColorString(value)) {
      return h('span', { class: 'cf-str' }, [
        h('i', { class: 'cf-swatch', style: { background: value } }),
        h(ElColorPicker, { modelValue: value, 'aria-label': meta.label, 'onUpdate:modelValue': (next) => { if (next) { obj[key] = next; notify() } } })
      ])
    }
    return h(ElInput, { modelValue: value, class: 'cf-input cf-text', type: 'text', 'aria-label': meta.label, 'onUpdate:modelValue': (next) => { obj[key] = next; notify() } })
  }
  return h('span', { class: 'cf-system-value' }, '未设置')
}

function leafVNode(obj, key, notify) {
  const meta = fieldInfo(key)
  const label = meta.unit ? `${meta.label}（${meta.unit}）` : meta.label
  return h('div', { class: 'cf-leaf-control' }, [
    fieldControl(obj, key, notify),
    h('small', { class: 'cf-field-help' }, meta.hint),
    h('span', { class: 'cf-sr-only' }, label)
  ])
}

// 标量数组 → chips
const ScalarChips = {
  name: 'ScalarChips',
  props: { arr: { type: Array, required: true }, path: { type: String, default: '' } },
  setup(props) {
    const notify = inject(EDIT_NOTIFY, () => {})
    const input = ref('')
    const fieldKey = computed(() => props.path.split('.').pop()?.replace(/\[\d+\]/g, '') || '')
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
        typeof v === 'string' ? enumLabel(v, fieldKey.value) : String(v),
        h(ElButton, {
          class: 'cf-chip-x', title: '删除', text: true,
          onClick: () => { props.arr.splice(i, 1); notify() }
        }, () => '×')
      ])),
      h('span', { class: 'cf-chip-add' }, [
        h(ElInput, {
          class: 'cf-input', modelValue: input.value, placeholder: '新增选项',
          'aria-label': `新增${fieldInfo(fieldKey.value).label}`,
          'onUpdate:modelValue': (v) => { input.value = v },
          onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }
        }),
        h(ElButton, { class: 'ad-btn sm', title: '新增选项', onClick: add }, () => '＋')
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
                ...columns.value.map((c) => h('th', { key: c }, fieldInfo(c).label)),
                ...nestedKeys.value.map((k) => h('th', { key: k }, `${fieldInfo(k).label} · 分组`)),
                h('th', { class: 'cf-op' }, '操作')
              ])
            ]),
            h('tbody', props.arr.flatMap((row, i) => {
              const missing = missingKeysOf(row)
              const rows = [h('tr', { key: `r${i}` }, [
                ...columns.value.map((c) => h('td', { key: c, class: 'cf-cell', 'data-label': fieldInfo(c).label },
                  row[c] === undefined ? h('span', { class: 'cf-missing' }, '未设置') : leafVNode(row, c, notify))),
                ...nestedKeys.value.map((k) => h('td', { key: k, class: 'cf-cell', 'data-label': fieldInfo(k).label },
                  row[k] === undefined
                    ? h('span', { class: 'cf-missing' }, '未设置')
                    : h(ElButton, { class: 'ad-btn sm cf-ghost', onClick: () => toggle(i) }, () => kindLabel(row[k])))),
                h('td', { class: 'cf-op', 'data-label': '操作' }, [
                  h(ElButton, {
                    class: 'ad-btn sm', title: '复制此项', onClick: () => {
                      props.arr.splice(i + 1, 0, cloneJson(row)); notify()
                    }
                  }, () => '复制'),
                  h(ElButton, {
                    class: 'ad-btn sm cf-del', title: '删除此项', onClick: () => {
                      if (!window.confirm('删除后该项会从当前草稿中移除；保存后需要从历史版本恢复。确定删除吗？')) return
                      props.arr.splice(i, 1); notify()
                    }
                  }, () => '删除')
                ])
              ])]
              if (expanded.value.has(i)) {
                rows.push(h('tr', { key: `d${i}`, class: 'cf-detail' }, [
                  h('td', { colspan: totalCols }, [
                    ...nestedKeys.value.filter((k) => row[k] !== undefined).map((k) => h('section', { class: 'cf-nested', key: k }, [
                      h('header', { class: 'cf-nested-head' }, [
                        h('b', fieldInfo(k).label),
                        h('span', { class: 'cf-kind-badge' }, kindLabel(row[k])),
                        h('small', { class: 'cf-field-help' }, fieldInfo(k).hint)
                      ]),
                      h(ValueEditor, { val: row[k], path: `${props.path}[${i}].${k}`, depth: props.depth + 1 })
                    ])),
                    missing.length ? h('div', { class: 'cf-missing-add' }, [
                      h('span', '可选字段：'),
                      ...missing.map((k) => h(ElButton, {
                        class: 'ad-btn sm cf-ghost', key: k,
                        title: '该行暂缺此字段，点击按其他行的形状补齐',
                        onClick: () => addKey(row, k)
                      }, () => `＋ ${fieldInfo(k).label}`))
                    ]) : null
                  ])
                ]))
              }
              return rows
            }))
          ])
        ]),
        h('div', { class: 'cf-oa-foot' }, [
          h(ElButton, { class: 'ad-btn sm', onClick: addRow }, () => '＋ 新增一行'),
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
      scalarKeys.value.length ? h('div', { class: 'cf-form' }, scalarKeys.value.map((k) => {
        const meta = fieldInfo(k)
        return h('label', { class: 'cf-form-item', key: k }, [
          h('span', { class: 'cf-form-label' }, [
            meta.unit ? `${meta.label}（${meta.unit}）` : meta.label,
            isColorString(props.obj[k]) ? h('i', { class: 'cf-swatch', style: { background: props.obj[k] } }) : null
          ]),
          leafVNode(props.obj, k, notify)
        ])
      })) : null,
      ...groupKeys.value.map((k) => h('section', { class: 'cf-group', key: k }, [
        h('header', { class: 'cf-group-head', onClick: () => toggle(k) }, [
          h('span', { class: 'cf-caret' }, collapsed.value.has(k) ? '▸' : '▾'),
          h('b', fieldInfo(k).label),
          h('span', { class: 'cf-kind-badge' }, kindLabel(props.obj[k]))
        ]),
        collapsed.value.has(k) ? null : h('div', { class: 'cf-group-body' }, [
          h('small', { class: 'cf-field-help cf-group-help' }, fieldInfo(k).hint),
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
      if (k === 'scalarArray') return h(ScalarChips, { arr: props.val, path: props.path })
      if (k === 'objectArray') return h(ObjectArrayEditor, { arr: props.val, path: props.path, depth: props.depth })
      if (k === 'object') return h(PlainObjectEditor, { obj: props.val, path: props.path, depth: props.depth })
      // 未识别的混合结构不在普通编辑界面展开，避免把内部键和值直接暴露给运营人员。
      return h('p', { class: 'cf-readonly-note' }, '这组配置由系统按预设读取，暂不支持在此修改。')
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
const confirmingPublish = ref(false)
const historyOpen = ref(false)
const historyRows = ref([])
const historyError = ref('')
const historyLoading = ref(false)
const historyPreviewKey = ref(null)
const historyPreviewSummary = ref('')

function stateOf(key) {
  if (!packStates[key]) {
    packStates[key] = { version: 0, baseline: false, loading: false, loaded: false }
  }
  return packStates[key]
}
const current = computed(() => stateOf(activeTab.value))

const isMock = computed(() => adminState.mode !== 'supabase')
const modeClass = computed(() => (isMock.value ? 'mock' : 'supabase'))
const modeTitle = computed(() => (isMock.value ? '本地模拟' : '云端模式'))
const modeHint = computed(() => (isMock.value
  ? '本地模拟：草稿和发布版本保存在本机；发布后刷新游戏首页即可查看效果。'
  : '云端模式：草稿、发布与历史记录同步到服务端，发布后玩家下次启动时生效。'))
const historyHint = computed(() => (isMock.value
  ? '本地模拟会保留最近的版本记录；云端模式会持续保存每次草稿快照。'
  : '每次保存草稿都会保留一份版本记录，可用于查看或恢复。'))
const advancedTitle = computed(() => activeTab.value === 'materials' ? '外观、属性与颜色' : PACK_META[activeTab.value].label)
const { notice, showNotice } = useAutoNotice()

const canSave = computed(() => {
  const st = current.value
  return !!st && st.loaded && !st.loading && busy.value === '' && (dirtyMap[activeTab.value] || st.baseline)
})
const canPublish = computed(() => {
  const st = current.value
  // mock：无草稿时 publishPack 会抛错，这里前置拦截
  return !!st && st.loaded && !st.loading && busy.value === '' && !st.baseline && st.version > 0 && !dirtyMap[activeTab.value]
})
const canSaveAndPublish = computed(() => {
  const st = current.value
  return activeTab.value === 'materials' && !!st && st.loaded && !st.loading && busy.value === ''
    && (st.baseline || dirtyMap[activeTab.value]) && validatePack(activeTab.value, drafts.materials).length === 0
})

function markDirty() {
  dirtyMap[activeTab.value] = true
}
function normalizeMaterialPrice(material) {
  const value = Number(material.price)
  material.price = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
  markDirty()
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
    error.value = e
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
    error.value = e
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
  if (!isPlainObject(data)) return ['内容格式不正确，无法保存。']
  for (const field of PACK_FIELDS[key]) {
    const label = fieldInfo(field).label
    if (!(field in data)) { issues.push(`缺少「${label}」配置`); continue }
    if (data[field] === undefined) { issues.push(`「${label}」中有未填写的内容`); continue }
    const expected = DEFAULT_BUNDLE[field]
    const actual = data[field]
    if (Array.isArray(expected) !== Array.isArray(actual) || typeof expected !== typeof actual) {
      issues.push(`「${label}」的数据结构与默认内容不一致`)
    }
  }
  if (findInvalid(data)) issues.push('存在不支持保存的内容，请检查数值和必填配置。')
  try {
    JSON.parse(JSON.stringify(data))
  } catch {
    issues.push('内容无法保存，请检查是否包含无效配置。')
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
    error.value = `内容检查未通过：${issues.join('；')}`
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
    showNotice(`草稿已保存（第 ${version} 版），玩家将在发布后看到。`)
    refreshStatus()
  } catch (e) {
    error.value = e
    notice.value = ''
  } finally {
    busy.value = ''
  }
}

async function doPublish() {
  const key = activeTab.value
  const state = stateOf(key)
  const needsSave = state.baseline || dirtyMap[key]
  if (busy.value) return
  if (needsSave) {
    const issues = validatePack(key, drafts[key])
    if (issues.length) {
      error.value = `内容检查未通过：${issues.join('；')}`
      notice.value = ''
      return
    }
  }
  busy.value = 'publish'
  error.value = ''
  try {
    if (needsSave) {
      const draftVersion = await savePack(key, cloneJson(drafts[key]))
      state.version = draftVersion
      state.baseline = false
      dirtyMap[key] = false
    }
    const version = await publishPack(key)
    showNotice(isMock.value
      ? `内容已发布（第 ${version} 版）。刷新游戏首页即可查看。`
      : `内容已发布（第 ${version} 版），玩家下次启动时生效。`)
    confirmingPublish.value = false
    await refreshStatus()
  } catch (e) {
    error.value = e
    notice.value = ''
  } finally {
    busy.value = ''
  }
}

async function toggleHistory() {
  historyOpen.value = !historyOpen.value
  historyPreviewKey.value = null
  if (!historyOpen.value) return
  historyLoading.value = true
  historyError.value = ''
  try {
    historyRows.value = await packHistory(activeTab.value, 20)
  } catch (e) {
    historyError.value = e
    historyRows.value = []
  } finally {
    historyLoading.value = false
  }
}

function previewHistory(row) {
  if (historyPreviewKey.value === row) {
    historyPreviewKey.value = null
    historyPreviewSummary.value = ''
  } else {
    historyPreviewKey.value = row
    historyPreviewSummary.value = describePack(row.data)
  }
}

function describePack(data) {
  if (Array.isArray(data?.materials)) return `此版本包含 ${data.materials.length} 种材质设置，涵盖售价、解锁方式、外观与属性。`
  if (Array.isArray(data?.levels)) return `此版本包含 ${data.chapters?.length || 0} 个章节、${data.levels.length} 个关卡。`
  if (Array.isArray(data?.blockTypes)) return `此版本包含 ${data.blockTypes.length} 种方块及其属性说明。`
  if (Array.isArray(data?.items)) return `此版本包含 ${data.items.length} 种道具设置。`
  if (Array.isArray(data?.skills)) return `此版本包含 ${data.skills.length} 项技能设置。`
  if (Array.isArray(data?.pets)) return `此版本包含 ${data.pets.length} 个伙伴设置。`
  if (Array.isArray(data?.ants)) return `此版本包含 ${data.ants.length} 项敌人设置。`
  return '此历史版本包含一组完整配置。'
}

function loadHistory(row) {
  const key = activeTab.value
  if (dirtyMap[key] && !window.confirm('载入历史版本会覆盖当前未保存修改。继续？')) return
  // 恢复为该版本内容，但要再点「保存草稿」才会成为新的草稿版本
  setDraft(key, cloneJson(row.data), { dirty: true })
  stateOf(key).baseline = false
  showNotice(`已载入第 ${row.version} 版内容到编辑区，确认后请保存草稿。`)
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
  return FIELD_TITLES[f] || fieldInfo(f).label
}
function fmtTime(v) {
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v))
  return Number.isNaN(+d) ? '时间暂不可用' : d.toLocaleString('zh-CN', { hour12: false })
}

onMounted(() => {
  refreshStatus()
  loadPack(activeTab.value)
})
</script>

<style scoped>
/* 视觉遵循 admin.css（石墨底 + 青蓝高亮 + #899944 主色），此处只补内容工厂特有布局 */
.cf-page { max-width: 1120px; }

/* 顶部模式提示 */
.cf-mode-chip {
  padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: .04em;
  border: 1px solid #dbe4c9; color: #5c784b; background: #e8efe1;
}
.cf-mode-chip.supabase { border-color: #dbe4c9; color: #8da779; background: #edf1e6; }
.cf-mode-hint { margin: -6px 0 0; color: #838a7b; font-size: 12px; line-height: 1.7; }

/* 包 tab */
.cf-tabs { width: 100%; }
.cf-tabs :deep(.el-tabs__nav-wrap::after) { background: #d8d9cf; }
.cf-tabs :deep(.el-tabs__item) { color: #4d5549; }
.cf-tabs :deep(.el-tabs__item.is-active) { color: #66763b; }
.cf-tabs :deep(.el-tabs__active-bar) { background: #899944; }
.cf-tabs :deep(.el-tabs__label) { display: inline-flex; align-items: center; gap: 6px; }
.cf-tabs button {
  display: flex; align-items: center; justify-content: space-between; gap: 7px; min-width: 0; min-height: 42px;
  padding: 7px 10px; border-radius: 3px; cursor: pointer;
  border: 1px solid #d8d9cf; background: #fbfaf5; color: #4d5549; font-size: 13px; font-weight: 700;
}
.cf-tabs button:hover { background: #efeee8; color: #20251f; }
.cf-tabs button.on { background: #e9ebdd; color: #66763b; border-color: #899944; box-shadow: inset 0 -2px 0 #899944; }
.cf-status { font-style: normal; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 4px; }
.cf-status.empty { background: #e7e6dd; color: #838a7b; }
.cf-status.draft { background: #f5ebdc; color: #98602d; }
.cf-status.published { background: #e8efe1; color: #5c784b; }
.cf-dot { font-style: normal; color: #98602d; font-size: 9px; }

/* 工具栏 */
.cf-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.cf-toolbar-info h3 { margin: 0 0 4px; font-size: 14px; color: #20251f; }
.cf-toolbar-info code { color: #899944; font-size: 12px; }
.cf-toolbar-desc { margin: 0; color: #4d5549; font-size: 12px; }
.cf-toolbar-state { margin: 6px 0 0; color: #737d67; font-size: 12px; }
.cf-toolbar-note { margin: 6px 0 0; color: #838a7b; font-size: 11px; }
.cf-warn-text { color: #98602d; }
.cf-toolbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.cf-btn-save { background: #899944; border-color: #899944; color: #fbfaf5; }
.cf-btn-save:hover { background: #66763b; }
.cf-btn-publish { background: #5c784b; border-color: #5c784b; color: #fbfaf5; }
.cf-btn-publish:hover { background: #5c784b; }
.cf-ghost { opacity: .85; }
.cf-del { color: #b74337; }

/* 发布二次确认 */
.cf-confirm { border-color: #e3d6a7; background: #f5ebdc; }
.cf-confirm b { color: #98602d; }
.cf-confirm p { margin: 8px 0 12px; color: #4d5549; font-size: 12px; line-height: 1.7; }
.cf-confirm-actions { display: flex; gap: 8px; }

/* 历史版本 */
.cf-history h3 { margin: 0 0 6px; }
.cf-history-hint { margin: 0 0 10px; color: #838a7b; font-size: 11px; line-height: 1.7; }
.cf-history-table-wrap { max-width: 100%; min-width: 0; overflow-x: auto; overscroll-behavior-inline: contain; }
.cf-history-table-wrap :deep(.el-table) { min-width: 480px; }
.cf-history-op { display: flex; gap: 6px; }
.cf-history-json { margin-top: 10px; max-height: 420px; }

/* 编辑器分区 */
.cf-editor { display: flex; flex-direction: column; gap: 12px; }
.cf-field-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  margin: -2px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #e7e6dd;
}
.cf-field-head h3 { margin: 0; font-size: 13px; color: #4d5549; }
.cf-field-head code { color: #899944; font-size: 11px; }
.cf-kind-badge { font-size: 10px; color: #737d67; background: #f7f6ef; border: 1px solid #d8d9cf; padding: 1px 7px; border-radius: 4px; white-space: nowrap; }

/* 表单栅格（嵌套对象的标量部分） */
.cf-form { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px 14px; margin-bottom: 4px; }
.cf-form-item { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.cf-form-label { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #737d67; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.cf-input {
  min-height: 30px; padding: 0 8px; border-radius: 6px; width: 100%;
  border: 1px solid #d8d9cf; background: #f7f6ef; color: #20251f; font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.cf-input:focus { outline: none; border-color: #899944; }
.cf-num { min-width: 90px; }
.cf-str { display: inline-flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.cf-swatch {
  display: inline-block; width: 14px; height: 14px; border-radius: 4px; flex: none;
  border: 1px solid #d8d9cf;
}
.cf-bool { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; min-height: 30px; }
.cf-bool input { accent-color: #899944; width: 15px; height: 15px; }
.cf-bool-text { font-size: 12px; color: #4d5549; }
.cf-null { color: #838a7b; font-size: 12px; }
.cf-missing { color: #838a7b; }

/* chips（标量数组） */
.cf-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.cf-chip {
  display: inline-flex; align-items: center; gap: 5px;
  background: #efeee8; border: 1px solid #d8d9cf; border-radius: 6px; padding: 3px 7px;
  font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #41483d;
}
.cf-chip-x {
  border: 0; background: transparent; color: #b74337; cursor: pointer;
  font-size: 13px; line-height: 1; padding: 0 1px;
}
.cf-chip-add { display: inline-flex; align-items: center; gap: 5px; }
.cf-chip-add .cf-input { width: 90px; min-height: 26px; }
.cf-chip-hint { color: #838a7b; font-size: 11px; }

/* 对象数组表格 */
.cf-oa-scroll { overflow-x: auto; border: 1px solid #e7e6dd; border-radius: 8px; }
.cf-table th { white-space: nowrap; position: sticky; top: 0; }
.cf-table td { vertical-align: middle; }
.cf-cell { min-width: 90px; }
.cf-cell .cf-text { min-width: 160px; }
.cf-op { white-space: nowrap; }
.cf-op .ad-btn + .ad-btn { margin-left: 5px; }
.cf-detail td { background: #f7f6ef; padding: 12px 14px; }
.cf-oa-foot { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.cf-count { color: #838a7b; font-size: 11px; }

/* 行内嵌套编辑 */
.cf-nested { border-left: 2px solid #d8d9cf; padding: 8px 0 8px 12px; margin: 8px 0; }
.cf-nested-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; color: #4d5549; }
.cf-missing-add { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 10px; padding-top: 8px; border-top: 1px dashed #d8d9cf; color: #838a7b; font-size: 11px; }

/* 分组折叠（嵌套对象） */
.cf-group { border: 1px solid #d8d9cf; border-radius: 8px; margin-top: 8px; overflow: hidden; }
.cf-group-head {
  display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;
  padding: 8px 10px; background: #f7f6ef; font-size: 12px; color: #4d5549;
}
.cf-group-head:hover { background: #efeee8; }
.cf-caret { color: #899944; font-size: 10px; }
.cf-group-body { padding: 10px 12px 12px; border-top: 1px solid #e7e6dd; }
.cf-readonly { margin: 0; max-height: 240px; }
.cf-readonly-note { margin: 8px 0 0; color: #737b6e; font-size: 12px; line-height: 1.7; }
.cf-system-value { display: inline-flex; align-items: center; min-height: 30px; color: #737b6e; font-size: 11px; }
.cf-leaf-control { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.cf-field-help { display: block; color: #737b6e; font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 10px; line-height: 1.45; }
.cf-select { font-family: inherit; }
.cf-advanced { padding: 12px 14px; }
.cf-advanced > summary { min-height: 42px; display: flex; align-items: center; font-size: 13px; font-weight: 700; }
.cf-advanced-hint { margin: 0 0 12px; color: #838a7b; font-size: 11px; line-height: 1.6; }
.cf-advanced .cf-field { border-top: 1px solid #e7e6dd; padding-top: 12px; }
.cf-history-summary { margin: 10px 0 0; padding: 10px; border-radius: 7px; background: #f7f6ef; color: #4d5549; font-size: 12px; line-height: 1.6; }
.cf-section-intro { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
.cf-section-intro h3 { margin: 0 0 4px; font-size: 15px; color: #20251f; }
.cf-section-intro p { margin: 0; color: #737b6e; font-size: 11px; line-height: 1.6; }
.cf-section-intro > span { flex: none; color: #737d67; font-size: 11px; }
.cf-materials-quick { display: flex; flex-direction: column; gap: 9px; }
.cf-material-card { display: grid; grid-template-columns: minmax(130px, .55fr) minmax(0, 1.45fr); gap: 14px; align-items: center; padding: 12px 14px; }
.cf-material-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
.cf-material-title h4 { margin: 0; font-size: 14px; }
.cf-material-title small { color: #838a7b; font-size: 10px; }
.cf-material-swatch { flex: none; width: 30px; height: 30px; border: 1px solid #d8d9cf; border-radius: 8px; }
.cf-material-fields { display: grid; grid-template-columns: minmax(110px, .75fr) minmax(180px, 1.25fr); gap: 12px; }
.cf-semantic-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; color: #41483d; font-size: 12px; }
.cf-semantic-field > span { display: flex; justify-content: space-between; gap: 8px; }
.cf-semantic-field > span b { color: #737b6e; font-size: 10px; font-weight: 500; }
.cf-semantic-field .el-input-number { width: 100%; }
.cf-page :deep(.el-input__wrapper), .cf-page :deep(.el-select__wrapper), .cf-page :deep(.el-input-number .el-input__wrapper) { background: #f7f6ef; box-shadow: 0 0 0 1px #d8d9cf inset; }
.cf-page :deep(.el-input__inner), .cf-page :deep(.el-input-number .el-input__inner) { color: #20251f; }
.cf-page :deep(.el-button) { --el-button-bg-color: #f7f6ef; --el-button-border-color: #d8d9cf; --el-button-text-color: #41483d; --el-button-hover-bg-color: #efeee8; --el-button-hover-border-color: #899944; --el-button-hover-text-color: #20251f; }
.cf-page :deep(.el-table), .cf-page :deep(.el-table tr), .cf-page :deep(.el-table th.el-table__cell) { background: #fbfaf5; color: #41483d; }
.cf-page :deep(.el-table th.el-table__cell) { background: #efeee8; }
.cf-semantic-field small { color: #737b6e; font-size: 10px; line-height: 1.5; }
.cf-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

@media (min-width: 769px) and (max-width: 1050px) {
  .cf-tabs { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 768px) {
  .cf-toolbar { flex-direction: column; }
  .cf-toolbar-actions { width: 100%; }
  .cf-toolbar-actions .ad-btn { flex: 1 1 auto; min-height: 44px; }
  .cf-tabs { width: 100%; }
  .cf-material-card { grid-template-columns: 1fr; }
  .cf-material-fields { grid-template-columns: 1fr 1fr; }
  .cf-form { grid-template-columns: 1fr; }
  .cf-input { min-height: 44px; font-size: 14px; }
  .cf-bool { min-height: 44px; padding: 4px 0; }
  .cf-bool input { width: 20px; height: 20px; }
  .cf-history-op .ad-btn { min-height: 44px; }
  .cf-oa-scroll { overflow: visible; border: 0; }
  .cf-cell { min-width: 0; }
  .cf-op { white-space: normal; }
  .cf-op .ad-btn + .ad-btn { margin-left: 0; }
  .cf-op { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  .cf-chip-x { min-width: 40px; min-height: 40px; font-size: 18px; }
  .cf-chip-add .cf-input { width: min(58vw, 180px); min-height: 44px; }
  .cf-chips { align-items: flex-start; }
  .cf-nested { padding-left: 8px; }
}
@media (max-width: 480px) {
  .cf-material-fields { grid-template-columns: 1fr; }
  .cf-section-intro { align-items: flex-start; flex-direction: column; }
  .cf-toolbar-actions { display: grid; grid-template-columns: 1fr 1fr; }
  .cf-toolbar-actions .ad-btn { width: 100%; }
  .cf-toolbar-actions .cf-save-publish { grid-column: 1 / -1; }
  .cf-advanced > summary { min-height: 48px; }
  .cf-history-op { flex-wrap: wrap; }
}
</style>
