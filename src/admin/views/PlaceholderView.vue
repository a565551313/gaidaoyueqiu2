<template>
  <section class="ad-page">
    <header class="ad-page-head">
      <h2>{{ title }}</h2>
    </header>
    <div class="ad-panel placeholder">
      <el-tag class="placeholder-status" effect="plain" type="info">功能占位</el-tag>
      <el-empty :description="desc" :image-size="96">
        <small>完整设计见仓库 <code>docs/ADMIN_DESIGN.md</code></small>
      </el-empty>
    </div>
  </section>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
  desc: { type: String, default: '' }
})
</script>

<style scoped>
.placeholder-status {
  color: var(--ad-muted);
  border-color: var(--ad-line-strong);
  background: var(--ad-surface-soft);
  letter-spacing: 0.06em;
}

.placeholder :deep(.el-empty) {
  padding: 24px 0 12px;
}

.placeholder :deep(.el-empty__description p) {
  color: var(--ad-text-secondary);
  font-size: 14px;
}

.placeholder small {
  color: var(--ad-muted);
  font-size: 12px;
}

.placeholder code {
  padding: 2px 5px;
  color: var(--ad-text);
  background: var(--ad-surface-soft);
  border: 1px solid var(--ad-line);
  border-radius: 3px;
}
</style>
