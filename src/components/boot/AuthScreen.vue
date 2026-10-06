<template>
  <div class="screen game-menu-screen auth-screen">
    <div class="hud-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>

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
        <span>{{ t.label }}</span>
      </button>
    </div>

    <!-- 游客 -->
    <section v-if="tab === 'guest'" class="auth-panel">
      <p class="auth-hint">无需注册，一点即飞。<br />本机进度自动云端保存，随时可绑定邮箱转正。</p>
      <button class="cta-launch" :disabled="busy" @click="guestEnter">
        {{ busy ? '正在进入…' : '▶ 立即进入' }}
      </button>
      <div class="auth-divider"><i></i><small>已经在玩？把进度存到账号</small><i></i></div>
      <div class="auth-bind">
        <div class="auth-bind-head"><b>游客转正舱</b><span>进度原地保留 · 星级/金币不丢</span></div>
        <div class="auth-form">
          <label>绑定邮箱<input v-model="bindEmail" type="email" placeholder="you@example.com" autocomplete="email" /></label>
          <label>设置密码<input v-model="bindPassword" type="password" placeholder="至少 8 位" autocomplete="new-password" /></label>
          <button class="cta-bind" :disabled="bindBusy || !bindValid" @click="doBind">
            {{ bindBusy ? '绑定中…' : '绑定并转正（进度保留）' }}
          </button>
          <p v-if="bindMsg" :class="['auth-msg', bindErr ? 'err' : 'ok']">{{ bindMsg }}</p>
        </div>
      </div>
    </section>

    <!-- 登录 -->
    <section v-else-if="tab === 'login'" class="auth-panel">
      <div class="auth-form">
        <label>邮箱<input v-model="loginEmail_" type="email" placeholder="you@example.com" autocomplete="email" /></label>
        <label>密码<input v-model="loginPassword" type="password" placeholder="密码" autocomplete="current-password" @keyup.enter="doLogin" /></label>
        <button class="cta-sub" :disabled="loginBusy || !loginValid" @click="doLogin">
          {{ loginBusy ? '核验中…' : '登 录' }}
        </button>
        <p v-if="loginMsg" :class="['auth-msg', loginErr ? 'err' : 'ok']">{{ loginMsg }}</p>
        <button v-if="!showReset" class="auth-link" @click="showReset = true">忘记密码？</button>
        <div v-else class="auth-reset">
          <label>注册邮箱<input v-model="resetEmail" type="email" placeholder="you@example.com" /></label>
          <button class="cta-ghost" :disabled="resetBusy || !resetEmail" @click="doReset">
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
        <button class="cta-sub" :disabled="regBusy || !regValid" @click="doRegister">
          {{ regBusy ? '注册中…' : '注 册' }}
        </button>
        <p v-if="regMsg" :class="['auth-msg', regErr ? 'err' : 'ok']">{{ regMsg }}</p>
      </div>
    </section>

    <footer class="auth-foot">
      <i></i><small>游客与账号的进度合并规则：星级 / 最高分 / 已解锁材质永不丢失</small><i></i>
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
/* ================= 登月执照 · 执照终端 ================= */
.auth-screen{display:flex;flex-direction:column;gap:13px;padding:calc(var(--safe-top,0px) + 16px) 20px calc(var(--safe-bottom,0px) + 16px)}

.hud-frame{position:absolute;inset:9px;pointer-events:none;z-index:6}
.hud-frame i{position:absolute;width:16px;height:16px;border:0 solid rgba(82,216,255,.5)}
.hud-frame i:nth-child(1){top:0;left:0;border-top-width:2px;border-left-width:2px}
.hud-frame i:nth-child(2){top:0;right:0;border-top-width:2px;border-right-width:2px}
.hud-frame i:nth-child(3){bottom:0;left:0;border-bottom-width:2px;border-left-width:2px}
.hud-frame i:nth-child(4){bottom:0;right:0;border-bottom-width:2px;border-right-width:2px}

.auth-screen .title-bar{margin-bottom:2px;padding-bottom:10px}
.auth-screen .title-bar h2{font-size:23px;letter-spacing:.08em;text-shadow:0 2px 0 rgba(4,16,34,.9),0 0 20px rgba(82,216,255,.28)}
.season-mark{margin-left:auto;padding:4px 9px;font-size:9px;font-weight:900;letter-spacing:.22em;color:#52d8ff;background:rgba(6,20,42,.85);border:1px solid rgba(82,216,255,.4);clip-path:polygon(0 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%)}

/* 分段 tab：斜切平行四边形，激活=金色厚块 */
.auth-tabs{flex:none;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:7px;background:rgba(4,13,29,.9);border:1px solid rgba(99,210,255,.28);border-radius:4px}
.auth-tabs button{padding:10px 0;transform:skewX(-8deg);border-radius:2px;background:transparent;color:#7ea3c4;font-size:14px;font-weight:900;letter-spacing:.12em;border:1px solid transparent;transition:color .15s,background .15s}
.auth-tabs button span{display:inline-block;transform:skewX(8deg)}
.auth-tabs button:not(.on):hover{color:#bcd9f2}
.auth-tabs button.on{background:linear-gradient(180deg,#ffe48a,#f0a742);color:#231604;border-color:#ffe9a8;box-shadow:0 3px 0 #8f5a12,0 8px 18px rgba(255,180,60,.25)}

.auth-panel{flex:1;min-height:0;display:flex;flex-direction:column;gap:13px;overflow-y:auto;padding:2px}
.auth-hint{margin:2px 0;color:#b1cee3;font-size:12px;line-height:1.9;text-align:center;letter-spacing:.04em}

/* 起飞主键：大金块 + 脉冲辉光 */
.cta-launch{min-height:58px;border-radius:5px;font-size:19px;font-weight:900;letter-spacing:.16em;color:#231604;background:linear-gradient(180deg,#ffe48a,#f0a742);border:1px solid #ffe9a8;box-shadow:0 6px 0 #8f5a12,0 16px 32px rgba(255,180,60,.26),inset 0 2px 0 rgba(255,255,255,.6);animation:cta-pulse 2.4s ease-in-out infinite;transition:transform .08s ease,box-shadow .08s ease,filter .2s}
.cta-launch:active{transform:translateY(4px);box-shadow:0 2px 0 #8f5a12,inset 0 2px 0 rgba(255,255,255,.6)}
.cta-launch:disabled{filter:grayscale(.55) brightness(.75);animation:none;cursor:not-allowed}

/* 次级键：蓝 3D */
.cta-sub{min-height:48px;border-radius:4px;font-size:15px;font-weight:900;letter-spacing:.18em;color:#04202f;background:linear-gradient(180deg,#51d9ff,#2467db);border:1px solid #9fdcff;box-shadow:0 5px 0 #123b89,0 12px 24px rgba(28,110,255,.26),inset 0 1px 0 rgba(255,255,255,.35);transition:transform .08s ease,box-shadow .08s ease,filter .2s}
.cta-sub:active{transform:translateY(3px);box-shadow:0 2px 0 #123b89,inset 0 1px 0 rgba(255,255,255,.35)}
.cta-sub:disabled{filter:grayscale(.55) brightness(.7);cursor:not-allowed}
.cta-bind{min-height:46px;border-radius:4px;font-size:13px;font-weight:900;letter-spacing:.1em;color:#231604;background:linear-gradient(180deg,#ffd88f,#e89535);border:1px solid #ffe0a0;box-shadow:0 4px 0 #7f4818,0 10px 20px rgba(255,157,50,.2),inset 0 1px 0 rgba(255,255,255,.45);transition:transform .08s ease,box-shadow .08s ease,filter .2s}
.cta-bind:active{transform:translateY(2px);box-shadow:0 2px 0 #7f4818,inset 0 1px 0 rgba(255,255,255,.45)}
.cta-bind:disabled{filter:grayscale(.55) brightness(.72);cursor:not-allowed}
.cta-ghost{min-height:42px;border-radius:4px;font-size:13px;font-weight:800;letter-spacing:.08em;color:#9fc6e8;background:linear-gradient(180deg,rgba(20,44,78,.92),rgba(9,22,44,.95));border:1px solid rgba(99,210,255,.38);box-shadow:0 4px 0 rgba(4,14,30,.95),inset 0 1px 0 rgba(255,255,255,.08);transition:transform .08s ease,box-shadow .08s ease,filter .2s}
.cta-ghost:active{transform:translateY(2px);box-shadow:0 2px 0 rgba(4,14,30,.95),inset 0 1px 0 rgba(255,255,255,.08)}
.cta-ghost:disabled{opacity:.45;cursor:not-allowed}

/* 表单：字距小标 + 终端输入框（聚焦青光） */
.auth-form{display:flex;flex-direction:column;gap:11px}
.auth-form label{display:flex;flex-direction:column;gap:6px;color:#7ea3c4;font-size:10px;font-weight:900;letter-spacing:.16em}
.auth-form input{min-height:46px;padding:0 12px;border-radius:3px;border:1px solid #24425f;background:#081426;color:#e6f2ff;font-size:15px;font-weight:600;letter-spacing:.02em;transition:border-color .15s,box-shadow .15s}
.auth-form input::placeholder{color:#44607c;font-weight:500}
.auth-form input:focus{outline:none;border-color:#52d8ff;box-shadow:0 0 0 3px rgba(82,216,255,.14),inset 0 0 14px rgba(82,216,255,.05)}
.auth-agree{flex-direction:row!important;align-items:flex-start;gap:9px!important;font-size:11px!important;font-weight:600!important;letter-spacing:.02em!important;color:#8da9c8!important;line-height:1.7}
.auth-agree input{min-height:0!important;width:17px;height:17px;margin-top:2px;accent-color:#ffd36e;cursor:pointer}
.auth-agree a{color:#52d8ff;text-decoration:none;border-bottom:1px dashed rgba(82,216,255,.4)}

/* 转正舱：虚线金框 */
.auth-divider{display:flex;align-items:center;gap:10px}
.auth-divider i{flex:1;height:0;border-top:1px dashed rgba(99,210,255,.35)}
.auth-divider small{color:#7ea3c4;font-size:10px;font-weight:800;letter-spacing:.1em}
.auth-bind{padding:13px;background:rgba(8,21,43,.55);border:1px dashed rgba(255,211,110,.45);border-radius:4px}
.auth-bind-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:11px}
.auth-bind-head b{color:#ffd36e;font-size:13px;font-weight:900;letter-spacing:.14em;text-shadow:0 0 12px rgba(255,211,110,.35)}
.auth-bind-head span{color:#8da9c8;font-size:10px;font-weight:700}

/* 消息行：终端色条 */
.auth-msg{margin:0;padding:8px 11px;font-size:12px;font-weight:700;line-height:1.6;border-radius:2px;background:rgba(4,13,29,.75)}
.auth-msg.err{color:#ff9f9f;border-left:3px solid #ff8f8f}
.auth-msg.ok{color:#8fd4a0;border-left:3px solid #8fd4a0}

.auth-link{border:0;background:none;color:#52d8ff;font-size:12px;font-weight:800;letter-spacing:.06em;cursor:pointer;text-align:right;padding:2px}
.auth-link:hover{color:#7be3ff;text-shadow:0 0 10px rgba(82,216,255,.6)}
.auth-reset{display:flex;flex-direction:column;gap:9px;margin-top:4px;padding-top:12px;border-top:1px dashed rgba(99,210,255,.3)}

.auth-foot{flex:none;display:flex;align-items:center;justify-content:center;gap:9px}
.auth-foot i{flex:none;width:26px;height:1px;background:repeating-linear-gradient(90deg,rgba(99,210,255,.4) 0 4px,transparent 4px 8px)}
.auth-foot small{color:#5c7288;font-size:10px;letter-spacing:.06em}

@keyframes cta-pulse{0%,100%{box-shadow:0 6px 0 #8f5a12,0 16px 32px rgba(255,180,60,.24),inset 0 2px 0 rgba(255,255,255,.6)}50%{box-shadow:0 6px 0 #8f5a12,0 18px 44px rgba(255,190,70,.52),inset 0 2px 0 rgba(255,255,255,.6)}}

@media (prefers-reduced-motion: reduce){
  .cta-launch{animation:none}
}
</style>
