<template>
  <el-config-provider :locale="zhCn">
  <div class="ad-root">
    <div v-if="needLogin && !adminState.loggedIn" class="ad-login">
      <form class="ad-login-card" @submit.prevent="doLogin">
        <div class="ad-login-brand"><span class="ad-brand-mark"><AdminIcon name="moon" /></span><span>MOONBASE <b>CONTROL ROOM</b></span></div>
        <div class="ad-login-title"><p>OPERATOR ACCESS / 01</p><h1>进入运营控制台</h1><span>{{ adminModeLabel() }}</span></div>
        <label>管理员邮箱<input v-model="loginEmail" type="email" required autocomplete="username" /></label>
        <label>密码<input v-model="loginPassword" type="password" required autocomplete="current-password" /></label>
        <AdminError :error="adminState.error" context="登录" />
        <button class="ad-login-submit" type="submit" :disabled="loginBusy">{{ loginBusy ? '正在验证…' : '进入控制台' }}<span aria-hidden="true">↗</span></button>
        <p class="ad-login-hint">管理员账号需先在管理控制台创建并授权。</p>
      </form>
      <div class="ad-login-aside" aria-hidden="true"><span>G2</span><i></i><small>LIVE OPERATIONS<br />DATA · CONTENT · PLAYERS</small></div>
    </div>

    <div v-else class="ad-shell" :class="{ 'is-collapsed': desktopNavCollapsed }">
      <header class="ad-mobile-head">
        <button class="ad-menu-toggle" type="button" :aria-expanded="mobileNavOpen" aria-controls="admin-navigation" @click="mobileNavOpen = !mobileNavOpen">
          <span aria-hidden="true">{{ mobileNavOpen ? '×' : '☰' }}</span><span>{{ mobileNavOpen ? '关闭' : '菜单' }}</span>
        </button>
        <div class="ad-mobile-brand"><span class="ad-brand-mark"><AdminIcon name="moon" /></span><strong>MOONBASE</strong></div>
        <span class="ad-mobile-current">{{ currentNavLabel }}</span>
      </header>

      <button v-if="mobileNavOpen" class="ad-nav-scrim" type="button" aria-label="关闭导航" @click="mobileNavOpen = false"></button>

      <aside id="admin-navigation" class="ad-side" :class="{ open: mobileNavOpen }">
        <div class="ad-brand">
          <span class="ad-brand-mark"><AdminIcon name="moon" /></span>
          <div class="ad-brand-copy"><strong>MOONBASE</strong><small>盖到月球2 · CONTROL ROOM</small></div>
          <button class="ad-collapse-toggle" type="button" :aria-label="desktopNavCollapsed ? '展开侧边导航' : '收起侧边导航'" :aria-expanded="!desktopNavCollapsed" :title="desktopNavCollapsed ? '展开导航' : '收起导航'" @click="desktopNavCollapsed = !desktopNavCollapsed">{{ desktopNavCollapsed ? '›' : '‹' }}</button>
        </div>

        <div class="ad-side-caption"><span>OPERATIONS</span><span>G2 / 01</span></div>
        <nav id="admin-navigation-list" aria-label="后台主导航">
          <div v-for="group in navGroups" :key="group.label" class="ad-nav-group">
            <p class="ad-nav-label">{{ group.label }}</p>
            <button v-for="item in group.items" :key="item.key" type="button" :class="{ on: activeNavKey === item.key }" :aria-current="activeNavKey === item.key ? 'page' : undefined" :title="desktopNavCollapsed ? item.label : undefined" @click="go(item.key)">
              <span class="ad-nav-icon"><AdminIcon :name="item.icon" /></span>
              <span class="ad-nav-text">{{ item.label }}</span>
              <span v-if="activeNavKey === item.key" class="ad-nav-active-mark" aria-hidden="true"></span>
            </button>
          </div>
        </nav>

        <div class="ad-side-foot">
          <div class="ad-side-foot-top"><span class="ad-node-indicator" :class="adminState.mode"></span><span>{{ adminState.mode === 'supabase' ? 'CLOUD NODE' : 'LOCAL NODE' }}</span></div>
          <p class="ad-mode-chip" :class="adminState.mode">{{ adminModeLabel() }}</p>
          <p v-if="adminState.userEmail" class="ad-user">{{ adminState.userEmail }}</p>
        </div>
      </aside>

      <main class="ad-main">
        <header class="ad-topbar">
          <div class="ad-topbar-left">
            <span class="ad-topbar-kicker">MOONBASE <i>/</i> OPERATIONS</span>
            <div class="ad-breadcrumb" aria-label="当前位置"><span>工作台</span><span class="ad-separator" aria-hidden="true">/</span><strong>{{ currentNavLabel }}</strong></div>
          </div>
          <div class="ad-topbar-meta">
            <span class="ad-connection" :class="adminState.mode"><i aria-hidden="true"></i><span>{{ adminState.mode === 'supabase' ? '云端已连接' : '本地演练环境' }}</span></span>
            <span v-if="adminState.userEmail" class="ad-topbar-user"><span class="ad-user-avatar">{{ adminState.userEmail.slice(0, 1).toUpperCase() }}</span>{{ adminState.userEmail }}</span>
          </div>
        </header>

        <div class="ad-main-content">
          <DashboardView v-if="view === 'dashboard'" @navigate="go" />
          <UsersView v-else-if="view === 'users'" @open-user="openUser" />
          <UserDetailView v-else-if="view === 'user'" :user-id="selectedUserId" @back="go('users')" />
          <ContentFactoryView v-else-if="view === 'blocks' || view === 'ants'" :initial-tab="view === 'ants' ? 'ants' : 'blocks'" />
          <LevelEditorView v-else-if="view === 'levels'" />
          <PublishCenterView v-else-if="view === 'publish'" />
          <AnalyticsView v-else-if="view === 'analytics'" />
          <OperationsCenterView v-else-if="view === 'ops'" />
          <SystemSettingsView v-else-if="view === 'system'" />
          <PlaceholderView v-else :title="placeholder.title" :desc="placeholder.desc" />
        </div>
        <footer class="ad-footer"><span>MOONBASE OPERATIONS</span><span>盖到月球2 <i>·</i> 管理控制台</span></footer>
      </main>
    </div>
  </div>
  </el-config-provider>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn.mjs'
import { adminState, adminLogin, restoreSession, adminModeLabel } from './api.js'
import AdminError from './components/AdminError.vue'
import AdminIcon from './components/AdminIcon.vue'
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
const desktopNavCollapsed = ref(false)
const needLogin = computed(() => adminState.mode === 'supabase')

const navGroups = [
  { label: '工作台', items: [{ key: 'dashboard', label: '运营总览', icon: 'dashboard' }] },
  { label: '内容与发布', items: [
    { key: 'blocks', label: '内容工厂', icon: 'factory' },
    { key: 'levels', label: '关卡编辑器', icon: 'levels' },
    { key: 'ants', label: '敌人配置', icon: 'enemy' },
    { key: 'publish', label: '发布与回滚', icon: 'publish' }
  ] },
  { label: '线上运营', items: [{ key: 'ops', label: '运营中心', icon: 'broadcast' }] },
  { label: '玩家服务', items: [{ key: 'users', label: '玩家档案', icon: 'players' }] },
  { label: '数据与系统', items: [
    { key: 'analytics', label: '数据分析', icon: 'analytics' },
    { key: 'system', label: '系统设置', icon: 'settings' }
  ] }
]
const navItems = navGroups.flatMap((group) => group.items)
const activeNavKey = computed(() => view.value === 'user' ? 'users' : view.value)
const currentNavLabel = computed(() => navItems.find((item) => item.key === activeNavKey.value)?.label || '管理后台')
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
