<template>
  <article class="dashboard-metric" :class="`is-${accent}`">
    <div class="dashboard-metric-top"><span class="dashboard-metric-icon"><AdminIcon :name="icon" /></span><span class="dashboard-metric-caption">{{ caption }}</span><span class="dashboard-metric-serial">{{ serial }}</span></div>
    <div class="dashboard-metric-value"><strong>{{ value }}</strong><small>{{ unit }}</small></div>
    <div class="dashboard-metric-bottom"><span>{{ label }}</span><i></i><span class="dashboard-metric-code">G2 / DATA</span></div>
  </article>
</template>

<script setup>
import AdminIcon from './AdminIcon.vue'

defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  unit: { type: String, required: true },
  caption: { type: String, required: true },
  icon: { type: String, required: true },
  serial: { type: String, required: true },
  accent: { type: String, default: 'lime' }
})
</script>
