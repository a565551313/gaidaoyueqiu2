<template>
  <p v-if="message" class="ad-toast" role="status" aria-live="polite">{{ message }}</p>
</template>

<script setup>
defineProps({ message: { type: String, default: '' } })
</script>
