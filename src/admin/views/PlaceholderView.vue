<template>
  <section class="ad-page">
    <header class="ad-page-head">
      <h2>{{ title }}</h2>
    </header>
    <div class="ad-panel placeholder">
      <p>{{ desc }}</p>
      <small>完整设计见仓库 <code>docs/ADMIN_DESIGN.md</code></small>
    </div>
  </section>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
  desc: { type: String, default: '' }
})
</script>
