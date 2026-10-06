<template>
  <div class="screen game-menu-screen auth-screen">
    <div class="title-bar">
      <button v-if="canCancel" class="icon-btn" aria-label="返回" @click="emit('cancel')">
        <BackIcon />
      </button>
      <h2>登月执照</h2>
      <span class="season-mark">PILOT LICENSE</span>
    </div>

    <div class="page-context">
      <span class="page-kicker">账号</span>
      <b>{{ serverName }} · 核验你的飞行员身份</b>
    </div>

    <div class="auth-tabs" role="tablist">
      <button v-for="t in tabs" :key="t.key" role="tab" :aria-selected="tab === t.key" :class="{ on: tab === t.key }" @click="switchTab(t.key)">
        {{ t.label }}
      </button>
    </div>

    <!-- 游客 -->
    <section v-if="tab === 'guest'" class="auth-panel">
      <p class="auth-hint">无需注册，一点即飞。<br />本机进度自动云端保存，随时可绑定邮箱转正。</p>
      <button class="btn btn-primary btn-lg btn-block" :disabled="busy" @click="guestEnter">
        {{ busy ? '正在进入…' : '▶ 立即进入' }}
      </button>
      <div class="auth-divider"><i></i><small>已经在玩？把进度存到账号</small><i></i></div>
      <div class="auth-form">
        <label>绑定邮箱<input v-model="bindEmail" type="email" placeholder="you@example.com" autocomplete="email" /></label>
        <label>设置密码<input v-model="bindPassword" type="password" placeholder="至少 8 位" autocomplete="new-password" /></label>
        <button class="btn btn-gold btn-block" :disabled="bindBusy || !bindValid" @click="doBind">
          {{ bindBusy ? '绑定中…' : '绑定并转正（进度保留）' }}
        </button>
        <p v-if="bindMsg" :class="['auth-msg', bindErr ? 'err' : 'ok']">{{ bindMsg }}</p>
      </div>
    </section>

    <!-- 登录 -->
    <section v-else-if="tab === 'login'" class="auth-panel">
      <div class="auth-form">
        <label>邮箱<input v-model="loginEmail_" type="email" placeholder="you@example.com" autocomplete="email" /></label>
        <label>密码<input v-model="loginPassword" type="password" placeholder="密码" autocomplete="current-password" @keyup.enter="doLogin" /></label>
        <button class="btn btn-primary btn-lg btn-block" :disabled="loginBusy || !loginValid" @click="doLogin">
          {{ loginBusy ? '核验中…' : '登 录' }}
        </button>
        <p v-if="loginMsg" :class="['auth-msg', loginErr ? 'err' : 'ok']">{{ loginMsg }}</p>
        <button v-if="!showReset" class="auth-link" @click="showReset = true">忘记密码？</button>
        <div v-else class="auth-reset">
          <label>注册邮箱<input v-model="resetEmail" type="email" placeholder="you@example.com" /></label>
          <button class="btn btn-ghost btn-block" :disabled="resetBusy || !resetEmail" @click="doReset">
            {{ resetBusy ? '发送中…' : '发送重置邮件' }}
          </button>
          <p v-if="resetMsg" :class="['auth-msg', 'ok']">{{ resetMsg }}</p>
        </div>
      </div>
    </section>

    <!-- 注册 -->
    <section v-else class="auth-panel">
      <div class="auth-form">
        <label>昵称<input v-model="regName" type="text" maxlength="12" placeholder="4~12 个字" /></label>
        <label>邮箱<input v-model="regEmail" type="email" placeholder="you@example.com" autocomplete="email" /></label>
        <label>密码<input v-model="regPassword" type="password" placeholder="至少 8 位" autocomplete="new-password" /></label>
        <label>确认密码<input v-model="regPassword2" type="password" placeholder="再输一次" autocomplete="new-password" /></label>
        <label class="auth-agree">
          <input v-model="agreed" type="checkbox" />
          <span>我已阅读并同意 <a :href="legal.agreementUrl" target="_blank">《用户协议》</a><a :href="legal.privacyUrl" target="_blank">《隐私政策》</a></span>
        </label>
        <button class="btn btn-primary btn-lg btn-block" :disabled="regBusy || !regValid" @click="doRegister">
          {{ regBusy ? '注册中…' : '注 册' }}
        </button>
        <p v-if="regMsg" :class="['auth-msg', regErr ? 'err' : 'ok']">{{ regMsg }}</p>
      </div>
    </section>

    <footer class="auth-foot">
      <small>游客与账号的进度合并规则：星级 / 最高分 / 已解锁材质永不丢失</small>
    </footer>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { BackIcon } from '../icons.js'
import { CloudSync, cloudState } from '../../core/cloud/index.js'
import { BOOT_CONFIG } from '../../config/boot.js'

const emit = defineEmits(['done', 'cancel'])
const props = defineProps({ canCancel: { type: Boolean, default: false } })

const tabs = [
  { key: 'guest', label: '游客' },
  { key: 'login', label: '登录' },
  { key: 'register', label: '注册' }
]
const tab = ref('guest')
const serverName = computed(() => cloudState.serverName || '云端服务器')
const legal = BOOT_CONFIG.legal

// —— 游客 / 转正 ——
const busy = ref(false)
const bindEmail = ref('')
const bindPassword = ref('')
const bindBusy = ref(false)
const bindMsg = ref('')
const bindErr = ref(false)
const bindValid = computed(() => /.+@.+\..+/.test(bindEmail.value) && bindPassword.value.length >= 8)

// —— 登录 ——
const loginEmail_ = ref('')
const loginPassword = ref('')
const loginBusy = ref(false)
const loginMsg = ref('')
const loginErr = ref(false)
const loginValid = computed(() => /.+@.+\..+/.test(loginEmail_.value) && loginPassword.value.length >= 6)
const showReset = ref(false)
const resetEmail = ref('')
const resetBusy = ref(false)
const resetMsg = ref('')

// —— 注册 ——
const regName = ref('')
const regEmail = ref('')
const regPassword = ref('')
const regPassword2 = ref('')
const agreed = ref(false)
const regBusy = ref(false)
const regMsg = ref('')
const regErr = ref(false)
const regValid = computed(() =>
  regName.value.trim().length >= 4 &&
  regName.value.trim().length <= 12 &&
  /.+@.+\..+/.test(regEmail.value) &&
  regPassword.value.length >= 8 &&
  regPassword.value === regPassword2.value &&
  agreed.value
)

function switchTab(key) {
  tab.value = key
}

function fail(e, msgRef, errRef) {
  msgRef.value = String(e?.message || e || '操作失败')
  errRef.value = true
}

async function guestEnter() {
  busy.value = true
  try {
    await CloudSync.signInAsGuest()
    emit('done')
  } catch (e) {
    fail(e, bindMsg, bindErr) // 游客主按钮的错误也展示在可见位置
  } finally {
    busy.value = false
  }
}

async function doBind() {
  bindBusy.value = true
  bindMsg.value = ''
  try {
    await CloudSync.upgradeAnonymous(bindEmail.value.trim(), bindPassword.value)
    bindErr.value = false
    bindMsg.value = '✓ 绑定成功，进度已永久保存'
    setTimeout(() => emit('done'), 700)
  } catch (e) {
    fail(e, bindMsg, bindErr)
  } finally {
    bindBusy.value = false
  }
}

async function doLogin() {
  loginBusy.value = true
  loginMsg.value = ''
  try {
    await CloudSync.loginEmail(loginEmail_.value.trim(), loginPassword.value)
    emit('done')
  } catch (e) {
    fail(e, loginMsg, loginErr)
  } finally {
    loginBusy.value = false
  }
}

async function doReset() {
  resetBusy.value = true
  resetMsg.value = ''
  try {
    await CloudSync.resetPassword(resetEmail.value.trim())
    resetMsg.value = '重置邮件已发送，请到邮箱查收'
  } catch (e) {
    resetMsg.value = String(e?.message || e)
  } finally {
    resetBusy.value = false
  }
}

async function doRegister() {
  regBusy.value = true
  regMsg.value = ''
  try {
    await CloudSync.registerEmail(regName.value.trim(), regEmail.value.trim(), regPassword.value)
    emit('done')
  } catch (e) {
    fail(e, regMsg, regErr)
  } finally {
    regBusy.value = false
  }
}
</script>

<style scoped>
.auth-screen{display:flex;flex-direction:column;gap:14px;padding:calc(var(--safe-top,0px) + 18px) 20px calc(var(--safe-bottom,0px) + 18px)}
.auth-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:5px;background:#0a1d3bcc;border:1px solid #70deff33;border-radius:11px}
.auth-tabs button{padding:9px 0;border:0;border-radius:8px;background:transparent;color:#8da9c8;font-size:13px;font-weight:900;cursor:pointer}
.auth-tabs button.on{background:#1b2c41;color:#fff;box-shadow:inset 0 -2px 0 #2f81f7}
.auth-panel{display:flex;flex-direction:column;gap:12px;overflow-y:auto}
.auth-hint{margin:2px 0;color:#b1cee3;font-size:12px;line-height:1.8;text-align:center}
.auth-form{display:flex;flex-direction:column;gap:10px}
.auth-form label{display:flex;flex-direction:column;gap:5px;color:#9db4cc;font-size:11px;font-weight:800;letter-spacing:.05em}
.auth-form input{min-height:40px;padding:0 12px;border-radius:9px;border:1px solid #2b3d52;background:#0d1520;color:#dce6f2;font-size:14px}
.auth-form input:focus{outline:none;border-color:#58a6ff}
.auth-agree{flex-direction:row!important;align-items:flex-start;gap:8px!important;font-size:11px!important;font-weight:600!important;color:#8da9c8!important}
.auth-agree input{min-height:0!important;width:15px;height:15px;margin-top:1px}
.auth-agree a{color:#58a6ff;text-decoration:none}
.auth-divider{display:flex;align-items:center;gap:8px;margin-top:4px}
.auth-divider i{flex:1;height:1px;background:#70deff33}
.auth-divider small{color:#5c7288;font-size:10px}
.auth-msg{margin:0;font-size:12px;line-height:1.6}
.auth-msg.err{color:#ff8f8f}
.auth-msg.ok{color:#8fd4a0}
.auth-link{border:0;background:none;color:#58a6ff;font-size:12px;cursor:pointer;text-align:right;padding:0}
.auth-reset{display:flex;flex-direction:column;gap:8px;margin-top:6px;padding-top:10px;border-top:1px dashed #2b3d52}
.auth-foot{margin-top:auto;text-align:center;color:#5c7288;font-size:10px;line-height:1.6}
</style>
