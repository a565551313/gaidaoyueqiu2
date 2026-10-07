<template>
  <section class="ad-page le-page">
    <header class="ad-page-head le-page-head">
      <div>
        <h2>关卡设计</h2>
        <p class="le-page-subtitle">选章节、选关卡，常用目标参数可直接调整；保存后再发布。</p>
      </div>
      <div class="le-actions">
        <button class="ad-btn" :disabled="loading || saving || publishing" @click="reload">重新载入</button>
        <button class="ad-btn" :disabled="loading || saving || publishing" @click="resetToBaseline">恢复初始配置</button>
      </div>
    </header>

    <AdminToast :message="notice" />
    <AdminError :error="error" context="关卡操作" />
    <AdminError :error="statusError" context="读取版本状态" />

    <div v-if="loading" class="ad-panel placeholder"><p>正在载入关卡内容…</p></div>

    <template v-else-if="pack">
      <div class="ad-panel le-toolbar">
        <span class="le-chip" :class="statusClass">{{ statusLabel }}</span>
        <span class="le-chip">当前版本 <b>{{ draftVersion }}</b></span>
        <span class="le-chip" :class="{ dirty: dirty }">{{ dirty ? '有未保存修改' : '内容已保存' }}</span>
        <span class="le-chip">{{ chaptersSorted.length }} 章 · {{ pack.levels.length }} 关</span>
        <span class="le-chip mode">{{ modeLabel }}</span>
      </div>

      <div class="ad-panel le-check" :class="validation.ok ? 'is-ok' : 'is-bad'">
        <div class="le-check-head">
          <b>{{ validation.ok ? '✓ 内容结构正常，可以保存和发布。' : `暂不能保存或发布：有 ${validation.errors.length} 项配置需要检查。` }}</b>
          <span v-if="validation.warnings.length" class="le-warn-count">还有 {{ validation.warnings.length }} 项提醒（不阻止保存）</span>
        </div>
        <ul v-if="validation.errors.length" class="le-msgs err">
          <li v-for="(e, i) in validation.errors" :key="'e' + i">{{ friendlyValidationMessage(e) }}</li>
        </ul>
        <details v-if="validation.errors.length" class="le-tech-details">
          <summary>查看配置检查详情</summary>
          <pre>{{ validation.errors.join('\n') }}</pre>
        </details>
        <ul v-if="validation.warnings.length" class="le-msgs warn">
          <li v-for="(w, i) in validation.warnings" :key="'w' + i">{{ friendlyValidationMessage(w) }}</li>
        </ul>
      </div>

      <div class="le-body">
        <aside class="ad-panel le-chapters">
          <h3>选择章节</h3>
          <button
            v-for="c in chaptersSorted"
            :key="c.id"
            class="le-ch"
            :class="{ on: c.id === selectedChapterId }"
            :style="{ '--ch-accent': (c.art && c.art.accent) || '#58a6ff' }"
            @click="selectChapter(c.id)"
          >
            <b>第 {{ c.number }} 章 · {{ c.shortName || c.name }}</b>
            <small>{{ weatherLabel(c.weatherKind) }} · {{ chapterLevelsOf(c.id).length }} 关</small>
            <em v-if="changedCountOf(c.id)">{{ changedCountOf(c.id) }} 处修改</em>
          </button>
        </aside>

        <div class="le-main">
          <details v-if="selectedChapter" class="ad-panel le-chapter-info">
            <summary>章节信息 · {{ selectedChapter.shortName || selectedChapter.name }}</summary>
            <p class="le-field-hint">章节顺序和所含关卡固定，修改文案不会改变玩家的解锁进度。</p>
            <div class="le-form-grid">
              <label class="le-field">章节名称<input v-model.trim="selectedChapter.name" type="text" /><small>供玩家在章节选择页识别。</small></label>
              <label class="le-field">章节简称<input v-model.trim="selectedChapter.shortName" type="text" /><small>用于窄屏和小标题。</small></label>
              <label class="le-field le-span2">宣传语<input v-model="selectedChapter.tagline" type="text" /><small>在章节介绍中展示的一句话。</small></label>
              <label class="le-field le-span2">章节简介<textarea v-model="selectedChapter.intro" rows="2" /><small>介绍本章的场景和玩法特色。</small></label>
              <label class="le-field">章节天气
                <select :value="selectedChapter.weatherKind" disabled>
                  <option v-for="option in weatherOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
                <small>章节天气为既有玩法基线，不能在本页面更改。</small>
              </label>
              <div class="le-readonly-info"><small>关卡范围</small><b>第 {{ selectedChapter.firstLevelId }} 至 {{ selectedChapter.lastLevelId }} 关</b><span>章节解锁顺序固定</span></div>
            </div>
          </details>

          <section v-if="selectedChapter" class="ad-panel le-level-list-panel">
            <div class="le-panel-heading">
              <div><h3>{{ selectedChapter.shortName || selectedChapter.name }} · 选择关卡</h3><p>每张卡片显示目标层数和修改状态。</p></div>
              <span>{{ chapterLevels.length }} 关</span>
            </div>
            <div class="le-levels">
              <button
                v-for="lv in chapterLevels"
                :key="lv.id"
                class="le-lv"
                :class="{ on: lv.id === selectedLevelId }"
                @click="selectLevel(lv.id)"
              >
                <b>第 {{ lv.id }} 关 · {{ lv.name }}</b>
                <small>{{ lv.city }} · 目标 {{ lv.target }} 层</small>
                <em v-if="changedLevelIds.has(lv.id)">已修改</em>
              </button>
            </div>
          </section>

          <section v-if="selectedLevel" class="ad-panel le-level-form">
            <div class="le-form-head">
              <div><h3>第 {{ selectedLevel.id }} 关 · {{ selectedLevel.name }}</h3><p>关卡顺序固定；下方只修改关卡体验参数。</p></div>
              <div class="le-form-tools">
                <button class="ad-btn sm" :disabled="!hasPrevLevel" @click="gotoLevel(-1)">上一关</button>
                <button class="ad-btn sm" :disabled="!hasNextLevel" @click="gotoLevel(1)">下一关</button>
                <button class="ad-btn sm" :disabled="!hasPrevLevel" @click="copyPrev">复制上一关参数</button>
              </div>
            </div>

            <section class="le-subsection le-common-fields">
              <div class="le-subsection-heading"><h4>常用参数</h4><p>调整目标层数、移动节奏和充能需求，可直接影响关卡难度。</p></div>
              <div class="le-form-grid">
                <label class="le-field">目标层数 <span class="le-unit">层</span>
                  <input v-model.number="selectedLevel.target" type="number" min="1" step="1" @change="syncSelectedLevel" />
                  <small>玩家需要叠到的楼层数量。</small>
                </label>
                <label class="le-field">基础速度 <span class="le-unit">游戏单位/秒</span>
                  <input v-model.number="selectedLevel.speed" type="number" min="1" step="1" />
                  <small>控制移动方块的基础速度，数值越大节奏越快。</small>
                </label>
                <label class="le-field">充能需求 <span class="le-unit">点</span>
                  <input v-model.number="selectedLevel.chargeNeed" type="number" min="1" step="1" />
                  <small>触发一次充能效果所需的点数。</small>
                </label>
                <div class="le-readonly-info"><small>解锁条件</small><b>{{ selectedLevel.id <= 1 ? '进入游戏即可挑战' : `通关第 ${selectedLevel.id - 1} 关后解锁` }}</b><span>按关卡顺序自动解锁</span></div>
              </div>
              <div class="le-budget-note"><b>资源预算</b><span>当前关卡内容没有单独的金币或道具预算项。可通过目标层数、移动速度和充能需求调整难度；不会额外创建字段。</span></div>
            </section>

            <section class="le-subsection le-weather-fields">
              <div class="le-subsection-heading"><h4>天气与星级</h4><p>天气主题由章节决定；随机天气目前关闭。星级门槛沿用全局规则。</p></div>
              <div class="le-form-grid">
                <label class="le-field">章节天气
                  <select :value="selectedChapter.weatherKind" disabled>
                    <option v-for="option in weatherOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                  <small>随章节设定，不在单关覆盖。</small>
                </label>
                <label class="le-field">随机天气池
                  <select :value="selectedLevel.weather === 0 ? 'off' : 'legacy'" disabled>
                    <option value="off">关闭（固定规则）</option>
                    <option value="legacy">随机天气（已停用）</option>
                  </select>
                  <small>随机天气玩法已停用，保持关闭。</small>
                </label>
                <label class="le-field">三星通关门槛 <span class="le-unit">得分率</span>
                  <input value="85%" type="text" disabled />
                  <small>当前由游戏规则固定，暂不可调整。</small>
                </label>
                <label class="le-field">二星通关门槛 <span class="le-unit">得分率</span>
                  <input value="70%" type="text" disabled />
                  <small>当前由游戏规则固定，暂不可调整。</small>
                </label>
                <label v-if="isWeatherChapter" class="le-field le-span2">天气提示
                  <textarea v-model="selectedLevel.weatherHint" rows="2" @change="syncSelectedLevel" />
                  <small>玩家进入本关时会看到的天气提示。</small>
                </label>
                <label v-else class="le-field le-span2">关卡提示
                  <input v-if="selectedStage" v-model="selectedStage.hint" type="text" />
                  <small>晴天章节中显示给玩家的关卡提示。</small>
                </label>
              </div>
            </section>

            <details class="le-subsection le-advanced">
              <summary>高级参数 · 场景、文案与天气细节</summary>
              <p class="le-field-hint">高级设置用于调整场景展示和细分天气节奏；数值单位已标注，修改前建议先保存草稿验证。</p>
              <div class="le-form-grid">
                <label class="le-field">关卡名称<input v-model.trim="selectedLevel.name" type="text" @change="syncSelectedLevel" /><small>玩家在关卡列表中看到的名称。</small></label>
                <label class="le-field">所在城市<input v-model.trim="selectedLevel.city" type="text" @change="syncSelectedLevel" /><small>用于章节场景介绍。</small></label>
                <label class="le-field">具体地点<input v-model.trim="selectedLevel.place" type="text" @change="syncSelectedLevel" /><small>用于关卡标题和场景说明。</small></label>
                <label class="le-field">场景预设
                  <select v-model="selectedLevel.cityscape" @change="syncSelectedLevel">
                    <option v-for="option in cityscapeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                  <small>选择游戏内置场景，不需要填写代码。</small>
                </label>
                <label v-if="isWeatherChapter" class="le-field">地标场景
                  <select v-model="selectedLevel.landmarkFeature" @change="syncSelectedLevel">
                    <option v-for="option in landmarkOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                  <small>选择本关背景展示的地标。</small>
                </label>
                <label v-if="isWeatherChapter" class="le-field">塔体晃动 <span class="le-unit">系数</span>
                  <input v-model.number="selectedLevel.sway" type="number" min="0" step="0.01" @change="syncSelectedLevel" />
                  <small>天气章节中控制塔体晃动幅度；晴天章节固定为 0。</small>
                </label>
              </div>
              <div v-if="isWeatherChapter && stageParamFields.length" class="le-stage-params">
                <h5>天气节奏参数</h5>
                <div class="le-form-grid">
                  <label v-for="field in stageParamFields" :key="field.key" class="le-field">
                    {{ field.label }} <span v-if="field.unit" class="le-unit">{{ field.unit }}</span>
                    <select v-if="field.kind === 'direction'" :value="String(selectedStage[field.key])" @change="setStageDirection(field.key, $event)">
                      <option value="1">向右</option><option value="-1">向左</option>
                    </select>
                    <input v-else-if="field.kind === 'number'" v-model.number="selectedStage[field.key]" type="number" :step="field.step || '0.01'" />
                    <input v-else-if="field.kind === 'csv'" :value="csvText(selectedStage[field.key])" type="text" @change="setStageArray(field.key, $event)" />
                    <input v-else v-model.trim="selectedStage[field.key]" type="text" />
                    <small>{{ field.hint }}</small>
                  </label>
                </div>
              </div>
            </details>
          </section>
        </div>
      </div>

      <p class="ad-note le-baseline-note">
        基础配置为 {{ chaptersSorted.length }} 章、每章 8 关，共 {{ pack.levels.length }} 关；关卡顺序固定，以保护玩家已有进度。{{ modeNote }}
      </p>

      <footer class="le-sticky-actions">
        <div class="le-sticky-state"><b>{{ dirty ? '有未保存修改' : '当前内容已保存' }}</b><small>发布后玩家下次启动时生效</small></div>
        <div class="le-sticky-buttons">
          <button class="ad-btn le-save" :disabled="!canSave" :title="saveHint" @click="save">{{ saving ? '保存中…' : '保存草稿' }}</button>
          <button class="ad-btn le-publish" :disabled="!canPublish" :title="publishHint" @click="publish">{{ publishing ? '发布中…' : '发布' }}</button>
        </div>
      </footer>
    </template>
  </section>
</template>

<script setup>
// T5 关卡编辑器：章节列表 → 每章关卡列表 → 关卡参数表单 + 草稿保存 + 发布。
// 数据存取只经 src/admin/api/levels.js（它包着 api/content.js 的通用接口，levels 包
// data = { chapters, levels }）；结构校验 / 排序 / 复制 / 基线对照的纯函数也在那里，
// 由 scripts/verify-admin-levels.mjs 直接覆盖。字段结构以 src/content/defaults/levels.js 为唯一基准。
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import AdminError from '../components/AdminError.vue'
import AdminToast from '../components/AdminToast.vue'
import { useAutoNotice, friendlyValidationMessage, enumLabel } from '../ui.js'
import { adminState } from '../api.js'
import {
  cloneBaselinePack, sortChapters, sortLevels, groupLevelsByChapter, levelStageOf,
  syncLevelIntoStage, copyFromPreviousLevel, validateLevelsPack, STAGE_META_KEYS,
  getLevelsPack, saveLevelsDraft, publishLevelsDraft, levelsPackStatus
} from '../api/levels.js'

const WEATHER_LABELS = { clear: '晴天', wind: '大风', cloud: '乌云', lightning: '雷电', rain: '暴雨', snow: '降雪', hail: '冰雹' }
const weatherOptions = Object.entries(WEATHER_LABELS).map(([value, label]) => ({ value, label }))
const baseSceneIds = ['launchField', 'riversideHomes', 'oldFerry', 'inlandPort', 'crossRiverBridge', 'sciencePark', 'financeCore', 'centralTower']
const chapterScenePrefixes = ['lanhe', 'yunxiu', 'tingchuan', 'yuting', 'xuecen', 'lichuan']
const cityscapeOptions = [
  ...baseSceneIds,
  ...chapterScenePrefixes.flatMap((chapter) => Array.from({ length: 8 }, (_, index) => `${chapter}-metropolitan-${index + 1}`))
].map((value) => ({ value, label: enumLabel(value, 'cityscape') }))
const landmarkOptions = baseSceneIds.map((value) => ({ value, label: enumLabel(value, 'landmark') }))
const STAGE_PARAM_LABELS = {
  intensity: { label: '天气强度', unit: '0–1', hint: '数值越大，天气效果越明显。' },
  directions: { label: '风向顺序', unit: '方向值', hint: '用逗号分隔方向：向右填 1，向左填 -1。' },
  active: { label: '天气持续时长', unit: '秒', hint: '单次天气连续生效的时间。' },
  calm: { label: '静歇时长', unit: '秒', hint: '两次天气效果之间的平静时间。' },
  density: { label: '云层密度', unit: '0–1', hint: '控制场景中云层的覆盖程度。' },
  strikeChance: { label: '雷击概率', unit: '0–1', hint: '每次判定发生雷击的概率。' },
  rainDir: { label: '降雨方向', unit: '', hint: '选择雨滴从哪一侧落下。' },
  coverage: { label: '积雪覆盖比例', unit: '0–1', hint: '控制场景中积雪覆盖的范围。' },
  interval: { label: '冰雹间隔', unit: '秒', hint: '两次冰雹落下之间的时间。' },
  warning: { label: '危险预警时长', unit: '秒', hint: '危险天气发生前留给玩家的反应时间。' }
}

// ---- 状态 ----
const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const error = ref('')
const statusError = ref('')
const { notice, showNotice } = useAutoNotice()
const pack = ref(null) // { chapters, levels }（草稿或基线打底）
const savedSnapshot = ref('') // 最近一次落库内容的 JSON（脏检查基准）
const draftVersion = ref(0)
const statusRow = ref(null) // listPacks 里 levels 那行：{ status, version, updated_at }
const selectedChapterId = ref('')
const selectedLevelId = ref(null)

const modeLabel = computed(() => (adminState.mode === 'supabase' ? '云端模式' : '本地模拟'))
const modeNote = computed(() => adminState.mode === 'supabase'
  ? '云端模式：保存的草稿仅后台可见；发布后玩家下次启动时生效。'
  : '本地模拟：发布后刷新游戏首页即可查看效果。')

// ---- 派生 ----
const chaptersSorted = computed(() => sortChapters(pack.value?.chapters || []))
const grouped = computed(() => groupLevelsByChapter(pack.value?.levels || []))
const sortedLevels = computed(() => sortLevels(pack.value?.levels || []))
const selectedChapter = computed(() => chaptersSorted.value.find((c) => c.id === selectedChapterId.value) || null)
const chapterLevels = computed(() => grouped.value[selectedChapterId.value] || [])
const selectedLevel = computed(() => (pack.value?.levels || []).find((l) => l.id === selectedLevelId.value) || null)
const selectedStage = computed(() => (pack.value && selectedLevel.value ? levelStageOf(pack.value, selectedLevel.value) : null))
const selectedChapterNumber = computed(() => selectedChapter.value?.number ?? '—')
const isWeatherChapter = computed(() => !!selectedChapter.value && selectedChapter.value.weatherKind !== 'clear')
const chapterTargetsLine = computed(() => chapterLevels.value.map((l) => l.target).join(' / '))
const validation = computed(() => (pack.value ? validateLevelsPack(pack.value) : { ok: false, errors: [], warnings: [] }))
const dirty = computed(() => !!pack.value && JSON.stringify(pack.value) !== savedSnapshot.value)

// 已改关卡（对比最近一次落库快照；解析失败视为无参照，不标）
const changedLevelIds = computed(() => {
  const out = new Set()
  if (!pack.value || !savedSnapshot.value) return out
  let saved = null
  try { saved = JSON.parse(savedSnapshot.value) } catch (e) { return out }
  const savedById = new Map((saved.levels || []).map((l) => [l.id, l]))
  for (const l of pack.value.levels || []) {
    const old = savedById.get(l.id)
    if (!old || JSON.stringify(old) !== JSON.stringify(l)) out.add(l.id)
  }
  return out
})

const levelIndex = computed(() => sortedLevels.value.findIndex((l) => l.id === selectedLevelId.value))
const hasPrevLevel = computed(() => levelIndex.value > 0)
const hasNextLevel = computed(() => levelIndex.value >= 0 && levelIndex.value < sortedLevels.value.length - 1)

// 关卡对应 stage 的天气参数字段（按数据形状自适应，结构以基线为准）
const stageParamFields = computed(() => {
  const stage = selectedStage.value
  if (!stage || typeof stage !== 'object') return []
  return Object.entries(stage)
    .filter(([key]) => !STAGE_META_KEYS.includes(key))
    .map(([key, value]) => {
      const meta = STAGE_PARAM_LABELS[key] || { label: '其他天气参数', unit: '', hint: '影响本关的天气节奏，请谨慎调整。' }
      return {
        key,
        label: meta.label,
        unit: meta.unit,
        hint: meta.hint,
        step: ['active', 'calm', 'interval', 'warning'].includes(key) ? '0.1' : '0.01',
        kind: key === 'rainDir' ? 'direction' : Array.isArray(value) ? 'csv' : typeof value === 'number' ? 'number' : 'text',
        value
      }
    })
})

// ---- 顶部按钮状态 ----
const canSave = computed(() => !!pack.value && !saving.value && !publishing.value && dirty.value && validation.value.ok)
const saveHint = computed(() => {
  if (!dirty.value) return '当前没有未保存的修改'
  if (!validation.value.ok) return '结构校验未通过：先修复上方列出的阻断项'
  return '保存当前修改为草稿，玩家暂时不可见。'
})
const canPublish = computed(() => !!pack.value && !saving.value && !publishing.value && !dirty.value && validation.value.ok && draftVersion.value > 0)
const publishHint = computed(() => {
  if (dirty.value) return '先保存草稿再发布'
  if (!validation.value.ok) return '结构校验未通过'
  if (draftVersion.value <= 0) return '还没有已保存的草稿'
  return '发布当前草稿（玩家下次启动生效）'
})
const statusClass = computed(() => `st-${statusRow.value?.status || (draftVersion.value > 0 ? 'draft' : 'empty')}`)
const statusLabel = computed(() => {
  const map = { empty: '无草稿（展示基线）', draft: '草稿有未发布修改', published: '草稿即已发布' }
  return map[statusRow.value?.status] || map[draftVersion.value > 0 ? 'draft' : 'empty']
})

// ---- 行为 ----
function weatherLabel(kind) {
  return WEATHER_LABELS[kind] || '其他天气'
}
function chapterLevelsOf(chapterId) {
  return grouped.value[chapterId] || []
}
function changedCountOf(chapterId) {
  let n = 0
  for (const l of chapterLevelsOf(chapterId)) if (changedLevelIds.value.has(l.id)) n++
  return n
}
function selectChapter(chapterId) {
  selectedChapterId.value = chapterId
  selectedLevelId.value = null
}
function selectLevel(levelId) {
  selectedLevelId.value = levelId
}
function gotoLevel(delta) {
  const next = sortedLevels.value[levelIndex.value + delta]
  if (next) {
    selectedLevelId.value = next.id
    if (next.chapterId !== selectedChapterId.value) selectedChapterId.value = next.chapterId
  }
}
// 关卡字段改动后，把 city/place/target(/cityscape|landmark|hint) 回写进对应 stage（基线不变式）
function syncSelectedLevel() {
  if (selectedLevel.value && selectedStage.value) syncLevelIntoStage(selectedLevel.value, selectedStage.value)
}
function csvText(value) {
  return Array.isArray(value) ? value.join(',') : String(value ?? '')
}
function setStageArray(key, ev) {
  const stage = selectedStage.value
  if (!stage) return
  const parsed = String(ev.target.value || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n))
  if (parsed.length) stage[key] = parsed
  ev.target.value = csvText(stage[key])
}
function setStageDirection(key, event) {
  if (selectedStage.value) selectedStage.value[key] = Number(event.target.value)
}
function copyPrev() {
  if (!selectedLevelId.value) return
  const idx = sortedLevels.value.findIndex((l) => l.id === selectedLevelId.value)
  const prevId = idx > 0 ? sortedLevels.value[idx - 1].id : null
  const next = copyFromPreviousLevel(pack.value, selectedLevelId.value)
  if (!next) {
    showNotice('当前已是第一关，没有上一关参数可复制。')
    return
  }
  pack.value = next
  showNotice(`已将第 ${prevId} 关的参数复制到第 ${selectedLevelId.value} 关；记得保存草稿。`)
}

async function refreshStatus() {
  statusError.value = ''
  try {
    statusRow.value = await levelsPackStatus()
  } catch (e) {
    statusRow.value = null
    statusError.value = e
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await getLevelsPack()
    pack.value = res.data
    draftVersion.value = res.version
    savedSnapshot.value = JSON.stringify(res.data)
    selectedChapterId.value = chaptersSorted.value[0]?.id || ''
    selectedLevelId.value = null
    await refreshStatus()
  } catch (e) {
    error.value = String(e?.message || e)
  } finally {
    loading.value = false
  }
}

async function reload() {
  if (dirty.value && !window.confirm('重新载入会丢弃尚未保存的修改，并恢复最近一次保存的草稿。确定继续吗？')) return
  notice.value = ''
  await load()
}

function resetToBaseline() {
  if (!window.confirm('将恢复为初始关卡配置，并丢弃当前未保存修改；之后仍需保存草稿并发布才会生效。确定继续吗？')) return
  pack.value = cloneBaselinePack()
  showNotice('已恢复初始配置；当前修改尚未保存。')
}

async function save() {
  if (!canSave.value) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const check = validateLevelsPack(pack.value)
    if (!check.ok) {
      error.value = `结构校验未通过（${check.errors.length} 项阻断），已阻止保存。`
      return
    }
    const version = await saveLevelsDraft(pack.value)
    draftVersion.value = version
    savedSnapshot.value = JSON.stringify(pack.value)
    showNotice(`关卡草稿已保存（第 ${version} 版），玩家暂时不可见。`)
    await refreshStatus()
  } catch (e) {
    error.value = String(e?.message || e)
  } finally {
    saving.value = false
  }
}

async function publish() {
  if (!canPublish.value) return
  const msg = adminState.mode === 'supabase'
    ? '确定发布当前关卡内容吗？发布后所有玩家下次启动时生效。'
    : '确定发布当前关卡内容吗？发布后玩家下次启动时生效；本地模拟下刷新游戏首页即可验证。'
  if (!window.confirm(msg)) return
  publishing.value = true
  error.value = ''
  notice.value = ''
  try {
    const version = await publishLevelsDraft()
    showNotice(adminState.mode === 'supabase'
      ? `关卡内容已发布（第 ${version} 版），玩家下次启动时生效。`
      : `关卡内容已发布（第 ${version} 版），刷新游戏首页即可验证。`)
    await refreshStatus()
  } catch (e) {
    error.value = String(e?.message || e)
  } finally {
    publishing.value = false
  }
}

// ---- 未保存离开提示 ----
// 浏览器级：刷新/关闭前确认；应用级：AdminApp 的侧栏导航在目标阶段监听（本组件不能改 AdminApp），
// 捕获阶段拦截侧栏按钮的点击，未确认则阻止事件到达 AdminApp 的 @click。
function onBeforeUnload(e) {
  if (dirty.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
function onNavClickCapture(e) {
  if (!dirty.value) return
  const target = e.target
  if (!target || typeof target.closest !== 'function') return
  const btn = target.closest('.ad-side nav button')
  if (!btn || btn.classList.contains('on')) return
  if (!window.confirm('关卡包有未保存的修改，离开将丢失。确定离开吗？')) {
    e.stopPropagation()
    e.preventDefault()
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  document.addEventListener('click', onNavClickCapture, true)
  load()
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  document.removeEventListener('click', onNavClickCapture, true)
})
</script>

<style scoped>
.le-packkey {
  margin-left: 8px;
  padding: 2px 8px;
  border: 1px solid #2b3d52;
  border-radius: 4px;
  color: #7d94ac;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  vertical-align: 2px;
}
.le-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.le-save { border-color: #2f81f7; color: #9ecbff; }
.le-publish { border-color: #2ea043; color: #9fdca8; }

/* 状态条 */
.le-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding: 10px 16px; }
.le-chip {
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid #2b3d52;
  color: #9db4cc;
  font-size: 11px;
}
.le-chip b { color: #dce6f2; }
.le-chip.dirty { border-color: #d29922; color: #e3b341; }
.le-chip.st-empty { color: #8fb98d; }
.le-chip.st-draft { border-color: #d29922; color: #e3b341; }
.le-chip.st-published { border-color: #2ea043; color: #9fdca8; }
.le-chip.mode { margin-left: auto; color: #6fa3c8; }

/* 校验面板 */
.le-check { padding: 10px 16px; }
.le-check.is-ok { border-color: #234; }
.le-check.is-bad { border-color: #b3413d; }
.le-check-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; font-size: 12px; }
.le-check.is-ok .le-check-head b { color: #8fd4a0; }
.le-check.is-bad .le-check-head b { color: #ff9d9d; }
.le-warn-count { color: #e3b341; font-size: 11px; }
.le-msgs { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow: auto; }
.le-msgs li { font-size: 12px; line-height: 1.6; }
.le-msgs.err li { color: #ff9d9d; }
.le-msgs.warn li { color: #e3b341; }

/* 主体布局 */
.le-body { display: grid; grid-template-columns: 236px 1fr; gap: 12px; align-items: start; }
@media (max-width: 960px) { .le-body { grid-template-columns: 1fr; } }
.le-main { display: flex; flex-direction: column; gap: 12px; min-width: 0; }

/* 章节列表 */
.le-chapters { display: flex; flex-direction: column; gap: 6px; position: sticky; top: 16px; }
.le-ch {
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: left;
  padding: 9px 11px;
  border: 1px solid #1e2a3a;
  border-left: 3px solid var(--ch-accent, #58a6ff);
  border-radius: 8px;
  background: #0d1520;
  color: #b9c9db;
  cursor: pointer;
  font-size: 12px;
}
.le-ch:hover { background: #14202e; }
.le-ch.on { background: #1b2c41; border-color: #2f81f7; border-left-color: var(--ch-accent, #58a6ff); color: #fff; }
.le-ch b { font-size: 13px; }
.le-ch small { color: #6fa3c8; font-size: 11px; }
.le-ch em {
  font-style: normal;
  font-size: 10px;
  font-weight: 800;
  color: #0d1117;
  background: #e3b341;
  border-radius: 4px;
  padding: 1px 6px;
  align-self: flex-start;
}

/* 关卡列表 */
.le-levels { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 8px; }
.le-lv {
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: left;
  padding: 9px 11px;
  border: 1px solid #1e2a3a;
  border-radius: 8px;
  background: #0d1520;
  color: #b9c9db;
  cursor: pointer;
  font-size: 12px;
  position: relative;
}
.le-lv:hover { background: #14202e; }
.le-lv.on { background: #1b2c41; border-color: #58a6ff; color: #fff; }
.le-lv b { font-size: 12.5px; }
.le-lv small { color: #6fa3c8; font-size: 11px; }
.le-lv em {
  position: absolute;
  top: 7px;
  right: 7px;
  font-style: normal;
  font-size: 9px;
  font-weight: 800;
  color: #0d1117;
  background: #e3b341;
  border-radius: 4px;
  padding: 1px 5px;
}

/* 表单 */
.le-form-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.le-form-head h3 { margin: 0; }
.le-form-tools { display: flex; gap: 6px; flex-wrap: wrap; }
.le-form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px 14px; margin-top: 8px; }
.le-field { display: flex; flex-direction: column; gap: 5px; font-size: 11px; color: #9db4cc; min-width: 0; }
.le-span2 { grid-column: span 2; }
@media (max-width: 960px) { .le-span2 { grid-column: span 1; } }
.le-field input, .le-field textarea {
  min-height: 30px;
  padding: 2px 9px;
  border-radius: 7px;
  border: 1px solid #2b3d52;
  background: #0d1520;
  color: #dce6f2;
  font-size: 13px;
  font-family: inherit;
}
.le-field textarea { padding: 6px 9px; line-height: 1.5; resize: vertical; }
.le-field input:focus, .le-field textarea:focus { outline: none; border-color: #2f81f7; }
.le-field input:disabled { opacity: 0.45; }
.le-field input.le-locked { color: #7d94ac; }
.le-meta-line { margin: 10px 0 0; color: #6fa3c8; font-size: 11px; line-height: 1.8; }
.le-meta-line code { color: #58a6ff; font-size: 10.5px; }
.le-field-hint { margin: 8px 0 0; color: #5c7288; font-size: 11px; line-height: 1.7; }
.le-sec { margin-top: 14px; padding-top: 10px; border-top: 1px dashed #1e2a3a; }
.le-sec h4 { margin: 0 0 2px; font-size: 12px; color: #9db4cc; }

.le-page { padding-bottom: 82px; }
.le-page-head { align-items: flex-start; }
.le-page-subtitle { margin: 5px 0 0; color: #8198ae; font-size: 11px; line-height: 1.6; }
.le-actions { justify-content: flex-end; }
.le-actions .ad-btn { min-height: 40px; }
.le-body { grid-template-columns: minmax(210px, 250px) minmax(0, 1fr); }
.le-chapters { position: sticky; top: 14px; max-height: calc(100vh - 28px); overflow: auto; }
.le-ch { min-height: 58px; }
.le-panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.le-panel-heading h3 { margin: 0 0 3px; }
.le-panel-heading p { margin: 0; color: #7890a8; font-size: 11px; }
.le-panel-heading > span { flex: none; color: #91a9c0; font-size: 11px; }
.le-levels { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
.le-lv { min-height: 62px; }
.le-form-head > div:first-child { min-width: 0; }
.le-form-head p { margin: 4px 0 0; color: #7890a8; font-size: 11px; }
.le-form-tools .ad-btn { min-height: 40px; }
.le-form-grid { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
.le-field { font-size: 12px; }
.le-field input, .le-field textarea, .le-field select {
  width: 100%; min-height: 42px; padding: 7px 10px; border-radius: 7px;
  border: 1px solid #2b3d52; background: #0d1520; color: #dce6f2; font-size: 13px; font-family: inherit;
}
.le-field textarea { line-height: 1.55; resize: vertical; }
.le-field input:focus, .le-field textarea:focus, .le-field select:focus { outline: 1px solid #2f81f7; border-color: #2f81f7; }
.le-field input:disabled, .le-field select:disabled { opacity: .65; color: #a1b3c5; }
.le-field small { color: #7890a8; font-size: 10px; line-height: 1.5; font-weight: 400; }
.le-unit { align-self: flex-start; color: #7391ad; font-size: 10px; font-weight: 500; }
.le-readonly-info { display: flex; flex-direction: column; justify-content: center; gap: 4px; min-height: 82px; padding: 10px; border: 1px solid #233349; border-radius: 8px; background: #0e1723; }
.le-readonly-info small, .le-readonly-info span { color: #7890a8; font-size: 10px; }
.le-readonly-info b { color: #d1e0ef; font-size: 13px; }
.le-subsection { margin-top: 14px; padding-top: 12px; border-top: 1px solid #243348; }
.le-subsection-heading { margin-bottom: 8px; }
.le-subsection-heading h4 { margin: 0 0 4px; color: #d2e3f3; font-size: 13px; }
.le-subsection-heading p { margin: 0; color: #8298ae; font-size: 11px; line-height: 1.6; }
.le-budget-note { display: flex; gap: 10px; margin-top: 10px; padding: 9px 11px; border-radius: 7px; background: #0d1723; color: #8da4ba; font-size: 11px; line-height: 1.6; }
.le-budget-note b { flex: none; color: #a9bfd5; }
.le-advanced > summary, .le-chapter-info > summary { display: flex; align-items: center; min-height: 46px; cursor: pointer; color: #b9cfe2; font-size: 12px; font-weight: 700; }
.le-advanced { margin-top: 10px; padding: 10px 12px; border: 1px solid #243348; border-radius: 8px; background: #0f1823; }
.le-advanced[open] > summary, .le-chapter-info[open] > summary { margin-bottom: 8px; }
.le-advanced h5 { margin: 14px 0 6px; color: #bdcfe0; font-size: 12px; }
.le-tech-details { margin-top: 8px; color: #a9bfd5; font-size: 11px; }
.le-tech-details pre { max-height: 180px; overflow: auto; padding: 9px; border-radius: 7px; background: #0d1520; color: #a9bfd5; white-space: pre-wrap; overflow-wrap: anywhere; }
.le-sticky-actions {
  position: fixed; z-index: 50; left: 216px; right: 0; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 10px 24px calc(10px + env(safe-area-inset-bottom)); border-top: 1px solid #2b3d52;
  background: #0f1620f2; box-shadow: 0 -8px 28px #0006; backdrop-filter: blur(10px);
}
.le-sticky-state { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.le-sticky-state b { color: #dce6f2; font-size: 12px; }
.le-sticky-state small { color: #7890a8; font-size: 10px; }
.le-sticky-buttons { display: flex; gap: 8px; }
.le-sticky-buttons .ad-btn { min-width: 116px; min-height: 44px; font-size: 13px; }

@media (max-width: 960px) {
  .le-body { grid-template-columns: 1fr; }
  .le-chapters { position: static; max-height: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
}
@media (max-width: 768px) {
  .le-page { padding-bottom: 142px; }
  .le-page-head { flex-direction: column; }
  .le-actions { width: 100%; }
  .le-actions .ad-btn { flex: 1; min-height: 44px; }
  .le-chapters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .le-ch { min-height: 68px; padding: 10px; }
  .le-levels { grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)); }
  .le-lv { min-height: 70px; padding: 10px; }
  .le-form-tools { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .le-form-tools .ad-btn { min-height: 44px; }
  .le-form-grid { grid-template-columns: 1fr; }
  .le-span2 { grid-column: auto; }
  .le-field input, .le-field textarea, .le-field select { min-height: 44px; }
  .le-sticky-actions { left: 0; padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); }
  .le-sticky-state small { max-width: 130px; line-height: 1.4; }
  .le-sticky-buttons { flex: 1; justify-content: flex-end; }
  .le-sticky-buttons .ad-btn { min-width: 0; min-height: 46px; flex: 1; padding: 0 10px; }
}
@media (max-width: 480px) {
  .le-page { padding-bottom: 150px; }
  .le-chapters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .le-ch { min-height: 76px; }
  .le-panel-heading { align-items: flex-start; }
  .le-budget-note { align-items: flex-start; flex-direction: column; gap: 4px; }
  .le-sticky-actions { gap: 8px; padding-left: 9px; padding-right: 9px; }
  .le-sticky-state { max-width: 104px; }
  .le-sticky-state b { font-size: 10px; }
  .le-sticky-state small { font-size: 9px; }
}
</style>
