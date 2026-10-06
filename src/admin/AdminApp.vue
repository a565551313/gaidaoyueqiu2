<template>
  <div class="ad-root">
    <!-- 登录门（仅 Supabase 模式；本地模拟直接进入） -->
    <div v-if="needLogin && !adminState.loggedIn" class="ad-login">
      <form class="ad-login-card" @submit.prevent="doLogin">
        <h1>盖到月球2 · 运营后台</h1>
        <p class="ad-login-mode">{{ adminModeLabel() }}</p>
        <label>管理员邮箱<input v-model="loginEmail" type="email" required autocomplete="username" /></label>
        <label>密码<input v-model="loginPassword" type="password" required autocomplete="current-password" /></label>
        <p v-if="adminState.error" class="ad-error">{{ adminState.error }}</p>
        <button type="submit" :disabled="loginBusy">{{ loginBusy ? '登录中…' : '登录' }}</button>
        <p class="ad-login-hint">管理员账号：Supabase Dashboard → Authentication 创建，再在 admin_users 表登记</p>
      </form>
    </div>

    <div v-else class="ad-shell">
      <aside class="ad-side">
        <div class="ad-brand">
          <strong>盖到月球2</strong>
          <small>运营后台 · Phase 1</small>
        </div>
        <nav>
          <button v-for="item in visibleNav" :key="item.key" :class="{ on: view === item.key }" @click="go(item.key)">
            <span>{{ item.label }}</span>
            <em v-if="item.phase">{{ item.phase }}</em>
          </button>
        </nav>
        <div class="ad-side-foot">
          <p class="ad-mode-chip" :class="adminState.mode">{{ adminModeLabel() }}</p>
          <p v-if="adminState.userEmail" class="ad-user">{{ adminState.userEmail }}</p>
        </div>
      </aside>

      <main class="ad-main">
        <DashboardView v-if="view === 'dashboard'" />
        <UsersView v-else-if="view === 'users'" @open-user="openUser" />
        <UserDetailView v-else-if="view === 'user'" :user-id="selectedUserId" @back="go('users')" />
        <ContentFactoryView v-else-if="view === 'blocks' || view === 'ants'" :initial-tab="view === 'ants' ? 'ants' : 'blocks'" />
        <LevelEditorView v-else-if="view === 'levels'" />
        <PublishCenterView v-else-if="view === 'publish'" />
        <AnalyticsView v-else-if="view === 'analytics'" />
        <SystemSettingsView v-else-if="view === 'system'" />
        <PlaceholderView v-else :title="placeholder.title" :desc="placeholder.desc" />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { adminState, adminLogin, restoreSession, adminModeLabel } from './api.js'
import DashboardView from './views/DashboardView.vue'
import UsersView from './views/UsersView.vue'
import UserDetailView from './views/UserDetailView.vue'
import PlaceholderView from './views/PlaceholderView.vue'
import ContentFactoryView from './views/ContentFactoryView.vue'
import LevelEditorView from './views/LevelEditorView.vue'
import PublishCenterView from './views/PublishCenterView.vue'
import AnalyticsView from './views/AnalyticsView.vue'
import SystemSettingsView from './views/SystemSettingsView.vue'

const view = ref('dashboard')
const selectedUserId = ref('')
const loginEmail = ref('')
const loginPassword = ref('')
const loginBusy = ref(false)
const needLogin = computed(() => adminState.mode === 'supabase')

const navItems = [
  { key: 'dashboard', label: '仪表盘' },
  { key: 'users', label: '用户管理' },
  { key: 'blocks', label: '方块工厂', phase: 'P2' },
  { key: 'levels', label: '关卡设计', phase: 'P2' },
  { key: 'ants', label: '敌人配置', phase: 'P2' },
  { key: 'publish', label: '发布中心', phase: 'P2' },
  { key: 'ops', label: '运营中心', phase: 'P3' },
  { key: 'analytics', label: '数据分析', phase: 'P3' },
  { key: 'system', label: '系统设置' }
]
const visibleNav = navItems

const placeholderCopy = {
  publish: { title: '发布中心', desc: '内容包打包 → 内容 CI（复用 11 套 verify 脚本）→ 灰度放量 → 秒级回滚。设计见 docs/ADMIN_DESIGN.md §10，Phase 2 落地。' },
  ops: { title: '运营中心', desc: '公告 / 远程开关（无尽模式、排位赛的解锁开关）/ 礼包码 / A/B 实验。Phase 3 落地。' },
  analytics: { title: '数据分析', desc: '留存 / 关卡漏斗 / 经济看板。Phase 1 已开始积累对局数据（level_results 表）。Phase 3 落地。' }
}
const placeholder = computed(() => placeholderCopy[view.value] || { title: '', desc: '' })

function go(key) {
  view.value = key
  if (key !== 'user') selectedUserId.value = ''
}
function openUser(id) {
  selectedUserId.value = id
  view.value = 'user'
}

async function doLogin() {
  loginBusy.value = true
  try {
    await adminLogin({ email: loginEmail.value, password: loginPassword.value })
  } finally {
    loginBusy.value = false
  }
}

onMounted(() => restoreSession())
</script>
