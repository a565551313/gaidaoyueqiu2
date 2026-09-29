<template>
  <div class="screen">
    <div class="title-bar">
      <button class="icon-btn" @click="back"><BackIcon /></button>
      <h2>技能学院</h2>
      <div class="pill" style="margin-left:auto"><span class="coin-dot"></span>{{ store.coins }}</div>
    </div>

    <div class="scroll skill-list">
      <div v-for="sk in SKILLS" :key="sk.id" class="skill-card card">
        <div class="skill-top">
          <div class="skill-dot" :style="{ background: sk.color }"></div>
          <div class="skill-name">{{ sk.name }}</div>
          <div class="skill-lv">Lv.{{ lv(sk.id) }}<span class="max">/{{ sk.max }}</span></div>
        </div>
        <div class="skill-desc text-soft">{{ sk.desc }}</div>
        <div class="skill-effect">当前：{{ lv(sk.id) > 0 ? sk.effect(lv(sk.id)) : '未激活' }}</div>
        <div class="progress">
          <div class="progress-fill" :style="{ width: (lv(sk.id) / sk.max) * 100 + '%', background: sk.color }"></div>
        </div>
        <div class="skill-foot">
          <template v-if="lv(sk.id) < sk.max">
            <span class="next">下一级 {{ sk.effect(lv(sk.id) + 1) }}</span>
            <button
              class="btn btn-gold up-btn"
              :disabled="store.coins < cost(sk.id)"
              @click="upgrade(sk)"
            >
              <span class="coin-dot"></span>{{ cost(sk.id) }}
            </button>
          </template>
          <template v-else>
            <span class="maxed">已满级</span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useStore, actions } from '../core/store.js'
import { SKILLS, skillUpgradeCost } from '../data/skills.js'
import { Audio } from '../core/audio.js'
import { BackIcon } from './icons.js'

const emit = defineEmits(['nav'])
const store = useStore()

function lv(id) {
  return store.skills[id] || 0
}
function cost(id) {
  return skillUpgradeCost(lv(id) + 1)
}
function back() {
  Audio.click()
  emit('nav', 'menu')
}
function upgrade(sk) {
  actions.upgradeSkill(sk.id)
}
</script>

<style scoped>
.skill-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.skill-card {
  padding: 15px;
}
.skill-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.skill-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}
.skill-name {
  font-size: 17px;
  font-weight: 800;
}
.skill-lv {
  margin-left: auto;
  font-weight: 800;
  color: var(--primary);
}
.skill-lv .max {
  color: var(--text-soft);
  font-weight: 600;
  font-size: 13px;
}
.skill-desc {
  font-size: 13px;
  line-height: 1.5;
  margin: 8px 0 4px;
}
.skill-effect {
  font-size: 13px;
  font-weight: 700;
  color: var(--success);
  margin-bottom: 10px;
}
.progress {
  height: 8px;
  border-radius: 999px;
  background: var(--panel-border);
  overflow: hidden;
  margin-bottom: 12px;
}
.progress-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s ease;
}
.skill-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.next {
  font-size: 13px;
  color: var(--text-soft);
}
.up-btn {
  padding: 9px 18px;
  font-size: 15px;
  gap: 6px;
}
.maxed {
  font-weight: 800;
  color: var(--gold);
  margin-left: auto;
}
</style>
