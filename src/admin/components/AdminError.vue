<template>
  <div v-if="raw" class="ad-error-box" role="alert">
    <span>{{ friendlyError(error, context) }}</span>
    <details>
      <summary>查看详情</summary>
      <pre>{{ raw }}</pre>
    </details>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { friendlyError } from '../ui.js'

const props = defineProps({
  error: { type: [String, Error, Object], default: '' },
  context: { type: String, default: '操作' }
})
const raw = computed(() => String(props.error?.message || props.error || '').trim())
</script>
