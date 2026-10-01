<template>
  <main class="screen pet-screen">
    <header class="title-bar">
      <button class="icon-btn" :aria-label="selectedPet ? '返回宠物列表' : '返回基地'" @click="back"><BackIcon /></button>
      <div class="pet-title-copy">
        <span>{{ selectedPet ? selectedPet.codename : 'COMPANION BAY' }}</span>
        <h2>{{ selectedPet ? selectedPet.name : '宠物舱' }}</h2>
      </div>
      <div v-if="!selectedPet" class="pet-collection">{{ ownedCount }}/{{ PETS.length }}</div>
      <div v-else class="pill"><span class="coin-dot"></span>{{ store.coins }}</div>
    </header>

    <!-- 宠物列表 -->
    <template v-if="!selectedPet">
      <section class="active-pet-banner" :class="{ empty: !activePet }">
        <div class="active-orbit" aria-hidden="true"></div>
        <AnimatedPet v-if="activePet" :id="activePet.id" :size="104" :trigger="interactionSeq" interactive @interact="petInteract" />
        <div v-else class="empty-pod"><PetIcon :size="34" /></div>
        <div class="active-copy">
          <span class="page-kicker">当前同行伙伴</span>
          <strong>{{ activePet ? activePet.name : '尚未携带宠物' }}</strong>
          <small v-if="activePet">Lv.{{ activeState.level }} · {{ activePet.role }} · {{ activeState.star }}星阶</small>
          <small v-else>选择一只已拥有的宠物加入远征</small>
        </div>
        <button v-if="activePet" class="detail-arrow" @click="open(activePet.id)" aria-label="查看当前宠物详情">›</button>
      </section>

      <section class="pet-list-head">
        <div><span>COMPANION ARCHIVE</span><strong>伙伴档案</strong></div>
        <small>关卡总星 {{ totalStars }}/18</small>
      </section>

      <div class="scroll pet-list" aria-label="宠物列表">
        <article
          v-for="pet in sortedPets"
          :key="pet.id"
          class="pet-card"
          :class="{ locked: !petState(pet.id).owned, equipped: store.activePetId === pet.id }"
          :style="{ '--pet-color': pet.color, '--pet-accent': pet.accent }"
          @click="open(pet.id)"
        >
          <div class="pet-card-visual">
            <AnimatedPet :id="pet.id" :size="104" />
            <span v-if="store.activePetId === pet.id" class="equipped-tag">同行中</span>
            <span v-else-if="!petState(pet.id).owned" class="locked-tag"><LockIcon :size="12" /> {{ pet.unlockStars }}星解锁</span>
          </div>
          <div class="pet-card-copy">
            <div class="pet-card-kicker">{{ pet.codename }} · {{ pet.role }}</div>
            <h3>{{ pet.name }}</h3>
            <div class="pet-stars" aria-label="宠物星阶">
              <StarIcon v-for="n in 5" :key="n" :size="13" :filled="n <= petState(pet.id).star" :class="{ lit: n <= petState(pet.id).star }" />
            </div>
            <template v-if="petState(pet.id).owned">
              <div class="pet-level-line"><span>Lv.{{ petState(pet.id).level }}</span><small>/ {{ petLevelCap(petState(pet.id).star) }}</small></div>
              <div class="pet-exp-mini"><i :style="{ width: expPct(pet.id) + '%' }"></i></div>
              <p>{{ pet.skills[0].name }} · {{ effectText(pet, pet.skills[0]) }}</p>
            </template>
            <template v-else>
              <p>收集 {{ pet.unlockStars }} 颗关卡星后自动解锁</p>
            </template>
          </div>
          <span class="pet-card-go">›</span>
        </article>
      </div>
    </template>

    <!-- 宠物详情 -->
    <template v-else>
      <div class="scroll pet-detail" :style="{ '--pet-color': selectedPet.color, '--pet-accent': selectedPet.accent }">
        <section class="pet-stage" :class="{ locked: !selectedState.owned }">
          <div class="stage-grid" aria-hidden="true"></div>
          <div class="stage-orbit" aria-hidden="true"></div>
          <AnimatedPet :id="selectedPet.id" :size="226" :trigger="interactionSeq" interactive @interact="petInteract" />
          <div class="stage-status">
            <span>{{ selectedPet.role }}</span>
            <strong v-if="selectedState.owned">Lv.{{ selectedState.level }}</strong>
            <strong v-else>未解锁</strong>
          </div>
        </section>

        <section class="pet-profile-panel">
          <div class="profile-heading">
            <div>
              <small>{{ selectedPet.codename }}</small>
              <h1>{{ selectedPet.name }}</h1>
            </div>
            <div class="detail-stars">
              <StarIcon v-for="n in 5" :key="n" :size="19" :filled="n <= selectedState.star" :class="{ lit: n <= selectedState.star }" />
            </div>
          </div>
          <p>{{ selectedPet.bio }}</p>

          <template v-if="selectedState.owned">
            <div class="exp-row">
              <div class="exp-copy"><b>等级 {{ selectedState.level }}</b><span v-if="selectedState.level < petLevelCap(selectedState.star)">{{ selectedState.exp }} / {{ petExpToNext(selectedState.level) }} EXP</span><span v-else-if="selectedState.star < 5">当前星阶已满级</span><span v-else>已满级</span></div>
              <div class="exp-track"><i :style="{ width: detailExpPct + '%' }"></i></div>
              <small>等级上限 Lv.{{ petLevelCap(selectedState.star) }}</small>
            </div>
          </template>
          <div v-else class="unlock-callout">
            <LockIcon :size="18" />
            <span>还需收集 <b>{{ Math.max(0, selectedPet.unlockStars - totalStars) }}</b> 颗关卡星</span>
          </div>
        </section>

        <section class="pet-skills-panel">
          <div class="section-title"><span>SKILL MATRIX</span><strong>伙伴技能</strong></div>
          <article v-for="skill in selectedPet.skills" :key="skill.key" class="pet-skill" :class="{ locked: selectedState.star < skill.star }">
            <div class="skill-rank"><span>{{ skill.star }}</span><small>STAR</small></div>
            <div class="skill-copy"><h3>{{ skill.name }}</h3><p>{{ skill.desc }}</p><b>{{ effectText(selectedPet, skill) }}</b></div>
            <LockIcon v-if="selectedState.star < skill.star" :size="18" class="skill-lock" />
          </article>
        </section>

        <section v-if="selectedState.owned && selectedState.star < 5" class="star-up-panel">
          <div class="section-title"><span>STAR ASCENSION</span><strong>星阶突破</strong></div>
          <div class="star-up-status">
            <div><span>突破条件</span><b>达到 Lv.{{ petLevelCap(selectedState.star) }}</b></div>
            <div><span>消耗金币</span><b><span class="coin-dot"></span>{{ nextStarCost }}</b></div>
          </div>
          <p>突破后等级上限提升至 Lv.{{ petLevelCap(selectedState.star + 1) }}<template v-if="selectedState.star + 1 === 3">，并解锁协同技能</template><template v-else-if="selectedState.star + 1 === 5">，并解锁终极技能</template>。</p>
          <button class="btn btn-gold btn-block" :disabled="!canStarUp" @click="starUp">
            {{ starUpLabel }}
          </button>
        </section>

        <div class="detail-spacer"></div>
      </div>

      <footer class="pet-actions">
        <template v-if="selectedState.owned">
          <button v-if="store.activePetId !== selectedPet.id" class="btn btn-primary btn-block" @click="equip">携带 {{ selectedPet.name }}</button>
          <button v-else class="btn equipped-btn btn-block" @click="unequip"><CheckIcon :size="18" /> 已携带 · 点击取消</button>
        </template>
        <button v-else class="btn btn-block locked-action" disabled>收集 {{ selectedPet.unlockStars }} 颗关卡星解锁</button>
      </footer>
    </template>

    <transition name="toast-pop"><div v-if="toast" class="pet-toast">{{ toast }}</div></transition>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useStore, actions } from '../core/store.js'
import { PETS, getPet, petLevelCap, petExpToNext, petStarCost } from '../data/pets.js'
import { petSkillEffectText } from '../core/petSystem.js'
import { Audio } from '../core/audio.js'
import { BackIcon, StarIcon, LockIcon, CheckIcon, PetIcon } from './icons.js'
import AnimatedPet from './AnimatedPet.vue'

const emit = defineEmits(['nav'])
const store = useStore()
const selectedId = ref('')
const toast = ref('')
const interactionSeq = ref(0)
let toastTimer = 0

const selectedPet = computed(() => getPet(selectedId.value))
const selectedState = computed(() => selectedPet.value ? petState(selectedPet.value.id) : null)
const activePet = computed(() => getPet(store.activePetId))
const activeState = computed(() => activePet.value ? petState(activePet.value.id) : null)
const totalStars = computed(() => actions.totalStars())
const ownedCount = computed(() => PETS.filter((pet) => petState(pet.id).owned).length)
const sortedPets = computed(() => [...PETS].sort((a, b) => {
  if (a.id === store.activePetId) return -1
  if (b.id === store.activePetId) return 1
  const ownedDiff = Number(petState(b.id).owned) - Number(petState(a.id).owned)
  return ownedDiff || a.unlockStars - b.unlockStars
}))
const detailExpPct = computed(() => {
  const state = selectedState.value
  if (!state || state.level >= petLevelCap(state.star)) return 100
  return Math.min(100, state.exp / petExpToNext(state.level) * 100)
})
const nextStarCost = computed(() => petStarCost((selectedState.value?.star || 1) + 1))
const canStarUp = computed(() => {
  const state = selectedState.value
  return !!state?.owned && state.star < 5 && state.level >= petLevelCap(state.star) && store.coins >= nextStarCost.value
})
const starUpLabel = computed(() => {
  const state = selectedState.value
  if (!state) return '无法突破'
  if (state.level < petLevelCap(state.star)) return `需要达到 Lv.${petLevelCap(state.star)}`
  if (store.coins < nextStarCost.value) return `金币不足 · 需要 ${nextStarCost.value}`
  return `突破至 ${state.star + 1} 星阶`
})

function petState(id) { return store.pets[id] }
function expPct(id) {
  const state = petState(id)
  if (state.level >= petLevelCap(state.star)) return 100
  return Math.min(100, state.exp / petExpToNext(state.level) * 100)
}
function effectText(pet, skill) { return petSkillEffectText(pet.id, skill.key, petState(pet.id)) }
function showToast(text) {
  toast.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 1800)
}
function open(id) { Audio.click(); selectedId.value = id }
function back() {
  Audio.click()
  if (selectedId.value) selectedId.value = ''
  else emit('nav', 'menu')
}
function equip() {
  const previous = activePet.value?.name
  if (!actions.equipPet(selectedPet.value.id)) return
  Audio.skill()
  showToast(previous ? `已将 ${previous} 替换为 ${selectedPet.value.name}` : `${selectedPet.value.name} 已加入远征`)
}
function unequip() {
  if (!actions.unequipPet(selectedPet.value.id)) return
  Audio.click()
  showToast('已取消携带')
}
function starUp() {
  const before = selectedState.value.star
  if (!actions.starUpPet(selectedPet.value.id)) return
  interactionSeq.value += 1
  Audio.skill()
  showToast(`${selectedPet.value.name} 突破至 ${before + 1} 星阶`)
}
function petInteract() {
  interactionSeq.value += 1
  Audio.click()
  const lines = {
    moonRabbit: '校准完成，随时可以出发！',
    cloudWisp: '云层很安静，适合继续登高。',
    rivetHound: '锁敌模块在线。',
    emberFox: '尾焰状态良好！',
    starCat: '它好像又发现了闪闪发光的东西。'
  }
  showToast(lines[selectedPet.value?.id || activePet.value?.id] || '伙伴回应了你')
}

onMounted(() => actions.syncPetUnlocks())
</script>

<style scoped>
.pet-screen{max-width:560px;gap:10px;overflow:hidden;background:radial-gradient(circle at 75% 8%,rgba(86,210,255,.17),transparent 28%),linear-gradient(180deg,#08152e,#030711 78%);color:#eef8ff}.pet-screen::before{content:'';position:absolute;inset:0;pointer-events:none;opacity:.12;background:linear-gradient(90deg,transparent 49.7%,#75dfff 50%,transparent 50.3%),linear-gradient(transparent 49.7%,#75dfff 50%,transparent 50.3%);background-size:40px 40px}.title-bar{z-index:2;flex:none}.pet-title-copy{display:flex;flex-direction:column;margin-left:3px}.pet-title-copy span{color:#79e4ff;font-size:8px;font-weight:900;letter-spacing:.16em}.pet-title-copy h2{margin:2px 0 0}.pet-collection{margin-left:auto;padding:6px 10px;color:#ffd66e;background:#071b36;border:1px solid #70e0ff55;font-size:13px;font-weight:900}.active-pet-banner{position:relative;z-index:1;display:flex;align-items:center;min-height:114px;overflow:hidden;padding:4px 13px 4px 5px;background:linear-gradient(105deg,rgba(13,53,83,.96),rgba(29,27,66,.94));border:1px solid #72e5ff77;border-left:3px solid #ffd66e;box-shadow:0 13px 30px #0008}.active-pet-banner .animated-pet{flex:0 0 104px}.active-orbit{position:absolute;left:2px;width:108px;height:108px;border:1px dashed #77e8ff66;border-radius:50%;animation:orbit 12s linear infinite}.active-copy{position:relative;display:flex;min-width:0;flex:1;flex-direction:column;gap:4px}.active-copy strong{font-size:20px;letter-spacing:.05em}.active-copy small{color:#9fbcd2;font-size:11px}.detail-arrow,.pet-card-go{color:#ffd66e;font-size:28px}.empty-pod{display:grid;place-items:center;flex:0 0 90px;width:90px;height:90px;color:#77dfff;border:1px dashed #70dfff77;border-radius:50%}.pet-list-head,.section-title{display:flex;align-items:end;justify-content:space-between;padding:5px 2px}.pet-list-head div,.section-title{display:flex;flex-direction:column;gap:2px}.pet-list-head span,.section-title span{color:#77ddff;font-size:8px;font-weight:900;letter-spacing:.18em}.pet-list-head strong,.section-title strong{font-size:15px}.pet-list-head small{color:#91abc2;font-size:10px}.pet-list{display:flex;flex-direction:column;gap:10px;padding:0 2px 20px;z-index:1}.pet-card{position:relative;display:flex;align-items:center;flex:0 0 auto;min-height:126px;overflow:hidden;background:linear-gradient(110deg,rgba(12,37,68,.98),rgba(7,13,31,.98));border:1px solid color-mix(in srgb,var(--pet-color) 45%,transparent);clip-path:polygon(0 0,calc(100% - 13px) 0,100% 13px,100% 100%,0 100%);box-shadow:0 10px 25px #0008;cursor:pointer;transition:transform .14s,filter .14s}.pet-card:hover{transform:translateY(-2px);filter:brightness(1.12)}.pet-card.equipped{border-left:4px solid var(--pet-accent);box-shadow:0 0 22px color-mix(in srgb,var(--pet-color) 20%,transparent),0 10px 25px #0008}.pet-card.locked{filter:saturate(.25);opacity:.67}.pet-card.locked .animated-pet{filter:grayscale(.75) brightness(.55)}.pet-card-visual{position:relative;display:grid;place-items:center;flex:0 0 116px;align-self:stretch;background:radial-gradient(circle,color-mix(in srgb,var(--pet-color) 18%,transparent),transparent 67%)}.equipped-tag,.locked-tag{position:absolute;left:8px;bottom:7px;display:flex;align-items:center;gap:3px;padding:3px 6px;background:#07162ce8;border:1px solid var(--pet-accent);color:var(--pet-accent);font-size:8px;font-weight:900}.pet-card-copy{flex:1;min-width:0;padding:12px 7px}.pet-card-kicker{color:var(--pet-color);font-size:8px;font-weight:900;letter-spacing:.1em}.pet-card h3{margin:3px 0 4px;font-size:19px}.pet-stars{display:flex;color:#496076}.pet-stars .lit,.detail-stars .lit{color:var(--pet-accent);filter:drop-shadow(0 0 5px var(--pet-accent))}.pet-level-line{display:flex;align-items:baseline;gap:3px;margin-top:5px;color:#eff8ff;font-size:12px;font-weight:900}.pet-level-line small{color:#819bb4}.pet-exp-mini,.exp-track{overflow:hidden;height:5px;margin-top:3px;background:#071429;border:1px solid #6ddfff33}.pet-exp-mini i,.exp-track i{display:block;height:100%;background:linear-gradient(90deg,var(--pet-color),var(--pet-accent));box-shadow:0 0 8px var(--pet-color)}.pet-card p{margin:6px 0 0;color:#99b3ca;font-size:9.5px;line-height:1.4}.pet-card-go{padding:10px}.pet-detail{z-index:1;padding:0 2px 120px}.pet-stage{position:relative;display:grid;place-items:center;height:286px;overflow:hidden;background:radial-gradient(circle at 50% 48%,color-mix(in srgb,var(--pet-color) 22%,transparent),transparent 48%),linear-gradient(180deg,#0a2241,#071225);border:1px solid color-mix(in srgb,var(--pet-color) 55%,transparent);clip-path:polygon(0 0,calc(100% - 17px) 0,100% 17px,100% 100%,0 100%)}.pet-stage.locked{filter:saturate(.25)}.stage-grid{position:absolute;inset:0;opacity:.12;background:linear-gradient(90deg,transparent 49.6%,var(--pet-color) 50%,transparent 50.4%),linear-gradient(transparent 49.6%,var(--pet-color) 50%,transparent 50.4%);background-size:32px 32px}.stage-orbit{position:absolute;width:245px;height:245px;border:1px dashed color-mix(in srgb,var(--pet-color) 60%,transparent);border-radius:50%;box-shadow:0 0 0 24px color-mix(in srgb,var(--pet-color) 3%,transparent);animation:orbit 15s linear infinite}.stage-status{position:absolute;left:12px;right:12px;bottom:10px;display:flex;justify-content:space-between;color:#a6bfd5;font-size:10px}.stage-status strong{color:var(--pet-accent);font-size:13px}.pet-profile-panel,.pet-skills-panel,.star-up-panel{margin-top:11px;padding:14px;background:linear-gradient(125deg,rgba(13,38,70,.97),rgba(6,13,30,.97));border:1px solid #6edfff3d;border-left:3px solid var(--pet-color)}.profile-heading{display:flex;align-items:center;justify-content:space-between}.profile-heading small{color:var(--pet-color);font-size:9px;letter-spacing:.15em}.profile-heading h1{margin:2px 0 0;font-size:25px}.detail-stars{display:flex;color:#40566d}.pet-profile-panel>p,.star-up-panel>p{margin:10px 0;color:#a7bed1;font-size:11.5px;line-height:1.65}.exp-row{display:grid;grid-template-columns:1fr auto;align-items:center;gap:6px 10px;margin-top:12px}.exp-copy{display:flex;justify-content:space-between;grid-column:1/-1;font-size:11px}.exp-copy span{color:#96afc5}.exp-track{grid-column:1/2;height:8px;margin:0}.exp-row>small{color:#7ddfff;font-size:9px}.unlock-callout{display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px;color:#b8cee0;background:#07172d;border:1px dashed #74dfff55;font-size:12px}.unlock-callout b{color:#ffd66e}.section-title{align-items:flex-start;padding:0 0 10px}.pet-skill{position:relative;display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid #70ddff22}.pet-skill.locked{opacity:.46}.skill-rank{display:grid;place-items:center;flex:0 0 43px;height:43px;color:#102138;background:linear-gradient(145deg,var(--pet-accent),var(--pet-color));clip-path:polygon(0 0,calc(100% - 7px) 0,100% 7px,100% 100%,0 100%)}.skill-rank span{font-size:17px;font-weight:950;line-height:1}.skill-rank small{font-size:7px;font-weight:900}.skill-copy{flex:1}.skill-copy h3{margin:0;color:#edf8ff;font-size:14px}.skill-copy p{margin:3px 0;color:#95aec4;font-size:10.5px;line-height:1.45}.skill-copy b{color:#6ee6bc;font-size:10.5px}.skill-lock{color:#8095ab}.star-up-status{display:grid;grid-template-columns:1fr 1fr;gap:8px}.star-up-status>div{display:flex;flex-direction:column;gap:3px;padding:9px;background:#07172d;border:1px solid #70dfff2c}.star-up-status span{color:#86a2b9;font-size:9px}.star-up-status b{display:flex;align-items:center;gap:4px;color:#f0f8ff;font-size:12px}.pet-actions{position:absolute;z-index:8;left:18px;right:18px;bottom:calc(var(--safe-bottom) + 15px);padding:9px;background:#061229ee;border:1px solid #71dfff55;box-shadow:0 -12px 25px #020611cc}.equipped-btn{color:#7de7c3;background:#0c3b45;border:1px solid #64e1b7;box-shadow:0 4px 0 #06282d}.locked-action{color:#738ba1;background:#101c2f}.pet-toast{position:absolute;z-index:30;left:50%;bottom:calc(var(--safe-bottom) + 92px);transform:translateX(-50%);max-width:calc(100% - 40px);padding:9px 14px;color:#effaff;background:#06172fed;border:1px solid #75e5ff99;box-shadow:0 9px 24px #000a;font-size:11px;font-weight:900;text-align:center;white-space:nowrap}.detail-spacer{height:10px}@keyframes orbit{to{transform:rotate(360deg)}}@media(max-height:700px){.active-pet-banner{min-height:98px}.active-pet-banner .animated-pet{width:88px!important;height:88px!important;flex-basis:88px}.pet-stage{height:235px}.pet-stage .animated-pet{width:190px!important;height:190px!important}.pet-detail{padding-bottom:105px}}@media(max-width:380px){.pet-card-visual{flex-basis:100px}.pet-card-copy{padding-left:3px}.pet-card h3{font-size:17px}.active-copy strong{font-size:17px}.pet-stars svg{width:11px}.star-up-status{grid-template-columns:1fr}}
</style>
