<template>
  <div class="ad-root">
    <!-- 登录门（仅云端模式；本地模拟直接进入） -->
    <div v-if="needLogin && !adminState.loggedIn" class="ad-login">
      <form class="ad-login-card" @submit.prevent="doLogin">
        <h1>盖到月球2 · 运营后台</h1>
        <p class="ad-login-mode">{{ adminModeLabel() }}</p>
        <label>管理员邮箱<input v-model="loginEmail" type="email" required autocomplete="username" /></label>
        <label>密码<input v-model="loginPassword" type="password" required autocomplete="current-password" /></label>
        <AdminError :error="adminState.error" context="登录" />
        <button type="submit" :disabled="loginBusy">{{ loginBusy ? '登录中…' : '登录' }}</button>
        <p class="ad-login-hint">管理员账号需先在管理控制台创建并授权。</p>
      </form>
    </div>

    <div v-else class="ad-shell">
      <header class="ad-mobile-head">
        <button
          class="ad-menu-toggle"
          type="button"
          :aria-expanded="mobileNavOpen"
          aria-controls="admin-navigation"
          @click="mobileNavOpen = !mobileNavOpen"
        >
          <span aria-hidden="true">{{ mobileNavOpen ? '×' : '☰' }}</span>
          <span>{{ mobileNavOpen ? '收起导航' : '打开导航' }}</span>
        </button>
        <strong>盖到月球2 · 后台</strong>
        <span class="ad-mobile-current">{{ currentNavLabel }}</span>
      </header>

      <button v-if="mobileNavOpen" class="ad-nav-scrim" type="button" aria-label="关闭导航" @click="mobileNavOpen = false"></button>

      <aside id="admin-navigation" class="ad-side" :class="{ open: mobileNavOpen }">
        <div class="ad-brand">
          <strong>盖到月球2</strong>
          <small>运营后台 · 第一阶段</small>
        </div>
        <nav aria-label="后台主导航">
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
        <OperationsCenterView v-else-if="view === 'ops'" />
        <SystemSettingsView v-else-if="view === 'system'" />
        <PlaceholderView v-else :title="placeholder.title" :desc="placeholder.desc" />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { adminState, adminLogin, restoreSession, adminModeLabel } from './api.js'
import AdminError from './components/AdminError.vue'
import DashboardView from './views/DashboardView.vue'
import UsersView from './views/UsersView.vue'
import UserDetailView from './views/UserDetailView.vue'
import PlaceholderView from './views/PlaceholderView.vue'
import ContentFactoryView from './views/ContentFactoryView.vue'
import LevelEditorView from './views/LevelEditorView.vue'
import PublishCenterView from './views/PublishCenterView.vue'
import AnalyticsView from './views/AnalyticsView.vue'
import OperationsCenterView from './views/OperationsCenterView.vue'
import SystemSettingsView from './views/SystemSettingsView.vue'

const view = ref('dashboard')
const selectedUserId = ref('')
const loginEmail = ref('')
const loginPassword = ref('')
const loginBusy = ref(false)
const mobileNavOpen = ref(false)
const needLogin = computed(() => adminState.mode === 'supabase')

const navItems = [
  { key: 'dashboard', label: '仪表盘' },
  { key: 'users', label: '用户管理' },
  { key: 'blocks', label: '内容工厂', phase: '内容配置' },
  { key: 'levels', label: '关卡设计', phase: '内容配置' },
  { key: 'ants', label: '敌人配置', phase: '内容配置' },
  { key: 'publish', label: '发布中心', phase: '内容配置' },
  { key: 'ops', label: '运营中心' },
  { key: 'analytics', label: '数据分析' },
  { key: 'system', label: '系统设置' }
]
const visibleNav = navItems
const currentNavLabel = computed(() => navItems.find((item) => item.key === view.value)?.label || '管理后台')

const placeholderCopy = {
  publish: { title: '发布中心', desc: '内容包管理、质量检查、逐步发布与版本回退。' },
  ops: { title: '运营中心', desc: '公告、远程开关与礼包码管理。' },
  analytics: { title: '数据分析', desc: '玩家留存、关卡漏斗与经济数据。' }
}
const placeholder = computed(() => placeholderCopy[view.value] || { title: '', desc: '' })

function go(key) {
  view.value = key
  mobileNavOpen.value = false
  if (key !== 'user') selectedUserId.value = ''
}
function openUser(id) {
  selectedUserId.value = id
  view.value = 'user'
  mobileNavOpen.value = false
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
