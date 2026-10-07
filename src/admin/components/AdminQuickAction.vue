<template>
  <el-button class="admin-quick-action" native-type="button" @click="emit('navigate', action)">
    <span class="admin-quick-action-icon"><AdminIcon :name="icon" /></span>
    <span class="admin-quick-action-copy"><b>{{ label }}</b><small>{{ description }}</small></span>
    <span class="admin-quick-action-arrow" aria-hidden="true">↗</span>
  </el-button>
</template>

<script setup>
import { ElButton } from 'element-plus'
import AdminIcon from './AdminIcon.vue'

defineProps({
  label: { type: String, required: true },
  description: { type: String, required: true },
  icon: { type: String, required: true },
  action: { type: String, required: true }
})

const emit = defineEmits(['navigate'])
</script>

<style scoped>
.admin-quick-action {
  display: flex; align-items: center; gap: 9px; min-width: 0; min-height: 64px; padding: 10px 11px;
  border: 1px solid var(--ad-line); border-radius: 3px; color: var(--ad-text); background: var(--ad-surface);
  box-shadow: 0 2px 0 #18201605; cursor: pointer; text-align: left; transition: border-color .15s, background .15s, transform .15s;
}
.admin-quick-action :deep(.el-button__text) { display: flex; align-items: center; gap: 9px; width: 100%; min-width: 0; text-align: left; }
.admin-quick-action:hover { border-color: var(--ad-line-strong); background: #fff; transform: translateY(-1px); }
.admin-quick-action:focus-visible { outline: 3px solid var(--ad-lime); outline-offset: 2px; }
.admin-quick-action-icon { display: grid; place-items: center; flex: none; width: 29px; height: 29px; color: #47543c; background: #edf0e3; border-radius: 2px; }
.admin-quick-action-icon :deep(.ad-icon) { width: 16px; height: 16px; }
.admin-quick-action-copy { display: flex; flex: 1; flex-direction: column; gap: 4px; min-width: 0; }
.admin-quick-action-copy b { overflow: hidden; color: var(--ad-ink); font-size: 10px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.admin-quick-action-copy small { overflow: hidden; color: var(--ad-muted); font-size: 8px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.admin-quick-action-arrow { flex: none; align-self: flex-start; color: #8a927e; font-size: 12px; line-height: 1; }
@media (max-width: 480px) {
  .admin-quick-action { gap: 7px; min-height: 58px; padding: 8px; }
  .admin-quick-action-icon { width: 26px; height: 26px; }
  .admin-quick-action-copy b { font-size: 9px; }
  .admin-quick-action-copy small { font-size: 7px; }
}
</style>
