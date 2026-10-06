<template>
  <section class="ad-page">
    <header class="ad-page-head">
      <h2>关卡设计 <span class="le-packkey">levels 包</span></h2>
      <div class="le-actions">
        <button class="ad-btn" :disabled="loading || saving || publishing" @click="reload">放弃修改</button>
        <button class="ad-btn" :disabled="loading || saving || publishing" @click="resetToBaseline">重置为基线</button>
        <button class="ad-btn le-save" :disabled="!canSave" :title="saveHint" @click="save">{{ saving ? '保存中…' : '保存草稿' }}</button>
        <button class="ad-btn le-publish" :disabled="!canPublish" :title="publishHint" @click="publish">{{ publishing ? '发布中…' : '发布' }}</button>
      </div>
    </header>

    <p v-if="error" class="ad-error">{{ error }}</p>
    <p v-if="notice" class="ad-ok">{{ notice }}</p>

    <div v-if="loading" class="ad-panel placeholder"><p>加载中…</p></div>

    <template v-else-if="pack">
      <!-- 状态条 -->
      <div class="ad-panel le-toolbar">
        <span class="le-chip" :class="statusClass">{{ statusLabel }}</span>
        <span class="le-chip">草稿 <b>v{{ draftVersion }}</b></span>
        <span class="le-chip" :class="{ dirty: dirty }">{{ dirty ? '有未保存修改' : '与草稿一致' }}</span>
        <span class="le-chip">{{ chaptersSorted.length }} 章 · {{ pack.levels.length }} 关</span>
        <span class="le-chip mode">{{ modeLabel }}</span>
      </div>

      <!-- 结构校验 -->
      <div class="ad-panel le-check" :class="validation.ok ? 'is-ok' : 'is-bad'">
        <div class="le-check-head">
          <b>{{ validation.ok ? '✓ 结构校验通过（章数 / 每章关数 / id 连续 / 引用 / 天气池均与基线一致）' : `✗ 结构校验未通过：${validation.errors.length} 项阻断（保存与发布均被拦截）` }}</b>
          <span v-if="validation.warnings.length" class="le-warn-count">△ {{ validation.warnings.length }} 项提醒（不阻断）</span>
        </div>
        <ul v-if="validation.errors.length" class="le-msgs err">
          <li v-for="(e, i) in validation.errors" :key="'e' + i">{{ e }}</li>
        </ul>
        <ul v-if="validation.warnings.length" class="le-msgs warn">
          <li v-for="(w, i) in validation.warnings" :key="'w' + i">{{ w }}</li>
        </ul>
      </div>

      <div class="le-body">
        <!-- 章节列表 -->
        <aside class="ad-panel le-chapters">
          <h3>章节（{{ chaptersSorted.length }}）</h3>
          <button
            v-for="c in chaptersSorted"
            :key="c.id"
            class="le-ch"
            :class="{ on: c.id === selectedChapterId }"
            :style="{ '--ch-accent': (c.art && c.art.accent) || '#58a6ff' }"
            @click="selectChapter(c.id)"
          >
            <b>{{ c.number }} · {{ c.shortName || c.name }}</b>
            <small>{{ weatherLabel(c.weatherKind) }} · {{ chapterLevelsOf(c.id).length }} 关 · #{{ c.firstLevelId }}–{{ c.lastLevelId }}</small>
            <em v-if="changedCountOf(c.id)">{{ changedCountOf(c.id) }} 处修改</em>
          </button>
        </aside>

        <!-- 主区 -->
        <div class="le-main">
          <!-- 章节信息 -->
          <div v-if="selectedChapter" class="ad-panel">
            <h3>章节信息 · {{ selectedChapter.name }}</h3>
            <div class="le-form-grid">
              <label class="le-field">名称<input v-model.trim="selectedChapter.name" type="text" /></label>
              <label class="le-field">简称<input v-model.trim="selectedChapter.shortName" type="text" /></label>
              <label class="le-field le-span2">宣传语<input v-model="selectedChapter.tagline" type="text" /></label>
              <label class="le-field le-span2">简介<textarea v-model="selectedChapter.intro" rows="2" /></label>
            </div>
            <p class="le-meta-line">
              id <code>{{ selectedChapter.id }}</code> · 天气种类
              <code>{{ selectedChapter.weatherKind }}</code>（随基线冻结，关卡 weatherKind 必须与之一致）·
              stages <code>{{ (selectedChapter.stages || []).length }}</code> ·
              解锁链 <code>#{{ selectedChapter.firstLevelId }}–{{ selectedChapter.lastLevelId }}</code>（ChapterSelect 依据）
            </p>
          </div>

          <!-- 关卡列表 -->
          <div v-if="selectedChapter" class="ad-panel">
            <h3>{{ selectedChapter.shortName || selectedChapter.name }} · 关卡（{{ chapterLevels.length }}）</h3>
            <div class="le-levels">
              <button
                v-for="lv in chapterLevels"
                :key="lv.id"
                class="le-lv"
                :class="{ on: lv.id === selectedLevelId }"
                @click="selectLevel(lv.id)"
              >
                <b>#{{ lv.id }} {{ lv.name }}</b>
                <small>{{ lv.city }} · 目标 {{ lv.target }} 层<template v-if="lv.sway"> · 晃动 {{ lv.sway }}</template></small>
                <em v-if="changedLevelIds.has(lv.id)">已改</em>
              </button>
            </div>
          </div>

          <!-- 关卡参数表单 -->
          <div v-if="selectedLevel" class="ad-panel le-level-form">
            <div class="le-form-head">
              <h3>第 {{ selectedLevel.id }} 关 · {{ selectedLevel.name }}</h3>
              <div class="le-form-tools">
                <button class="ad-btn sm" :disabled="!hasPrevLevel" @click="gotoLevel(-1)">‹ 上一关</button>
                <button class="ad-btn sm" :disabled="!hasNextLevel" @click="gotoLevel(1)">下一关 ›</button>
                <button class="ad-btn sm" :disabled="!hasPrevLevel" title="拷贝上一关的目标/速度/充能/晃动与天气参数（不拷贝名称等身份字段）" @click="copyPrev">复制上一关参数</button>
                <button class="ad-btn sm" @click="selectedLevelId = null">✕ 关闭</button>
              </div>
            </div>

            <p class="le-meta-line">
              全局 id <code>{{ selectedLevel.id }}</code>（存档锚点，锁定）·
              第 {{ selectedChapterNumber }} 章
              <template v-if="isWeatherChapter">第 {{ selectedLevel.chapterStage }} 关（chapterStage）</template>·
              <template v-if="isWeatherChapter">weatherKind <code>{{ selectedLevel.weatherKind }}</code>（随章节）·</template>
              章内目标节奏 <code>{{ chapterTargetsLine }}</code>
            </p>

            <div class="le-form-grid">
              <label class="le-field">名称<input v-model.trim="selectedLevel.name" type="text" @change="syncSelectedLevel" /></label>
              <label class="le-field">城市<input v-model.trim="selectedLevel.city" type="text" @change="syncSelectedLevel" /></label>
              <label class="le-field">地点<input v-model.trim="selectedLevel.place" type="text" @change="syncSelectedLevel" /></label>
              <label class="le-field">场景 cityscape<input v-model.trim="selectedLevel.cityscape" type="text" @change="syncSelectedLevel" /></label>
              <label v-if="isWeatherChapter" class="le-field">地标 landmarkFeature<input v-model.trim="selectedLevel.landmarkFeature" type="text" @change="syncSelectedLevel" /></label>

              <label class="le-field">目标层数 target<input v-model.number="selectedLevel.target" type="number" min="1" step="1" @change="syncSelectedLevel" /></label>
              <label class="le-field">基础速度 speed<input v-model.number="selectedLevel.speed" type="number" min="1" step="1" /></label>
              <label class="le-field">充能需求 chargeNeed<input v-model.number="selectedLevel.chargeNeed" type="number" min="1" step="1" /></label>
              <label class="le-field">晃动系数 sway<input v-model.number="selectedLevel.sway" type="number" min="0" step="0.01" :disabled="!isWeatherChapter" @change="syncSelectedLevel" /></label>
              <label class="le-field">随机天气池 weather<input class="le-locked" :value="String(selectedLevel.weather)" type="text" readonly title="verify-chapter 既有规则：随机天气已停用，恒为 0" /></label>
            </div>
            <p v-if="!isWeatherChapter" class="le-field-hint">晴章关卡 sway 锁定为 0（第一章保持晴天静塔，verify-chapter 既有规则）。</p>

            <!-- 天气区 -->
            <div v-if="isWeatherChapter" class="le-sec">
              <h4>天气 · {{ weatherLabel(selectedChapter.weatherKind) }}（参数存于本章 stages[{{ selectedLevel.chapterStage }}]）</h4>
              <label class="le-field le-span2">天气提示 weatherHint（同步 stage.hint 与 chapterCue）<textarea v-model="selectedLevel.weatherHint" rows="2" @change="syncSelectedLevel" /></label>
              <div class="le-form-grid">
                <label v-for="f in stageParamFields" :key="f.key" class="le-field">
                  {{ f.label }}
                  <input
                    v-if="f.kind === 'number'"
                    v-model.number="selectedStage[f.key]"
                    type="number"
                    step="0.01"
                  />
                  <input
                    v-else-if="f.kind === 'csv'"
                    :value="csvText(selectedStage[f.key])"
                    type="text"
                    @change="setStageArray(f.key, $event)"
                  />
                  <input v-else v-model.trim="selectedStage[f.key]" type="text" />
                </label>
              </div>
              <p v-if="!stageParamFields.length" class="le-field-hint">本章 stage 无天气参数（与基线一致）。</p>
            </div>
            <div v-else class="le-sec">
              <h4>天气 · 晴（本章无天气参数）</h4>
              <label class="le-field le-span2">章节提示 stage.hint<input v-if="selectedStage" v-model="selectedStage.hint" type="text" /></label>
            </div>

            <p class="le-field-hint">
              星级阈值为引擎常量（3★ 需得分率 ≥ 85%、2★ ≥ 70%，见 src/core/gameEngine.js 的 _win），不在关卡包数据内，本编辑器不可调。
            </p>
          </div>
        </div>
      </div>

      <p class="ad-note">
        结构基准 src/content/defaults/levels.js：{{ chaptersSorted.length }} 章 × 每章 8 关 = {{ pack.levels.length }} 关；章节/关卡数量与全局 id 是旧存档兼容锚点（禁止重排），编辑器锁定结构、只调参数。
        {{ modeNote }}
      </p>
    </template>
  </section>
</template>

<script setup>
// T5 关卡编辑器：章节列表 → 每章关卡列表 → 关卡参数表单 + 草稿保存 + 发布。
// 数据存取只经 src/admin/api/levels.js（它包着 api/content.js 的通用接口，levels 包
// data = { chapters, levels }）；结构校验 / 排序 / 复制 / 基线对照的纯函数也在那里，
// 由 scripts/verify-admin-levels.mjs 直接覆盖。字段结构以 src/content/defaults/levels.js 为唯一基准。
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { adminState } from '../api.js'
import {
  cloneBaselinePack, sortChapters, sortLevels, groupLevelsByChapter, levelStageOf,
  syncLevelIntoStage, copyFromPreviousLevel, validateLevelsPack, STAGE_META_KEYS,
  getLevelsPack, saveLevelsDraft, publishLevelsDraft, levelsPackStatus
} from '../api/levels.js'

const WEATHER_LABELS = { clear: '晴', wind: '强风', cloud: '乌云', lightning: '雷暴', rain: '暴雨', snow: '降雪', hail: '冰雹' }
const STAGE_PARAM_LABELS = {
  intensity: '天气强度 intensity',
  directions: '风向 directions（逗号分隔 1/-1）',
  active: '活跃时长 active（秒）',
  calm: '静歇时长 calm（秒）',
  density: '云密度 density',
  strikeChance: '雷击概率 strikeChance（0–1）',
  rainDir: '雨向 rainDir（1/-1）',
  coverage: '积雪覆盖 coverage（0–1）',
  interval: '雹击间隔 interval（秒）',
  warning: '预警时长 warning（秒）'
}

// ---- 状态 ----
const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const error = ref('')
const notice = ref('')
const pack = ref(null) // { chapters, levels }（草稿或基线打底）
const savedSnapshot = ref('') // 最近一次落库内容的 JSON（脏检查基准）
const draftVersion = ref(0)
const statusRow = ref(null) // listPacks 里 levels 那行：{ status, version, updated_at }
const selectedChapterId = ref('')
const selectedLevelId = ref(null)

const modeLabel = computed(() => (adminState.mode === 'supabase' ? 'Supabase 云端' : '本地模拟'))
const modeNote = computed(() => adminState.mode === 'supabase'
  ? 'Supabase 模式：草稿与发布走 admin_* RPC（需 0003 迁移已执行 + 管理员账号已建），发布后玩家下次启动拉取生效。'
  : '本地模拟模式：发布即把「默认包 + 已发布包」组装的玩家 bundle 写入本机缓存键 gaidaoyueqiu2:content:v1——同浏览器刷新游戏页（/）立即生效，可端到端验证。')

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
    .map(([key, value]) => ({
      key,
      label: STAGE_PARAM_LABELS[key] || key,
      kind: Array.isArray(value) ? 'csv' : typeof value === 'number' ? 'number' : 'text',
      value
    }))
})

// ---- 顶部按钮状态 ----
const canSave = computed(() => !!pack.value && !saving.value && !publishing.value && dirty.value && validation.value.ok)
const saveHint = computed(() => {
  if (!dirty.value) return '当前没有未保存的修改'
  if (!validation.value.ok) return '结构校验未通过：先修复上方列出的阻断项'
  return '保存草稿（version+1，玩家不可见）'
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
  return WEATHER_LABELS[kind] || kind || '—'
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
function copyPrev() {
  if (!selectedLevelId.value) return
  const idx = sortedLevels.value.findIndex((l) => l.id === selectedLevelId.value)
  const prevId = idx > 0 ? sortedLevels.value[idx - 1].id : null
  const next = copyFromPreviousLevel(pack.value, selectedLevelId.value)
  if (!next) {
    notice.value = '没有上一关可复制（这已经是第一关）。'
    return
  }
  pack.value = next
  notice.value = `已把第 ${prevId} 关的参数复制到第 ${selectedLevelId.value} 关（尚未保存）。`
}

async function refreshStatus() {
  try {
    statusRow.value = await levelsPackStatus()
  } catch (e) {
    statusRow.value = null // 状态行失败不阻断编辑
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
  if (dirty.value && !window.confirm('关卡包有未保存的修改，放弃并重新加载已保存的草稿？')) return
  notice.value = ''
  await load()
}

function resetToBaseline() {
  if (!window.confirm('把编辑区重置为打包基线（defaults/levels.js 的当前线上等效内容）？未保存的修改将丢弃，还需点「保存草稿」才会落库。')) return
  pack.value = cloneBaselinePack()
  notice.value = '已重置为打包基线（尚未保存）。'
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
    notice.value = `草稿已保存（v${version}，玩家不可见）。`
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
    ? '确定发布关卡包？发布后玩家下次启动时生效。'
    : '确定发布关卡包？发布后玩家下次启动时生效；本地模拟模式下会立即写入本机玩家缓存，刷新游戏页（/）即可验证。'
  if (!window.confirm(msg)) return
  publishing.value = true
  error.value = ''
  notice.value = ''
  try {
    const version = await publishLevelsDraft()
    notice.value = adminState.mode === 'supabase'
      ? `已发布关卡包 v${version}，玩家下次启动拉取生效。`
      : `已发布关卡包 v${version}，并写入本机玩家缓存——同浏览器刷新游戏页（/）即可看到改动。`
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
</style>
