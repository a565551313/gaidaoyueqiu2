<template>
  <section class="ad-page">
    <header class="ad-page-head">
      <h2>关卡设计</h2>
      <span class="le-tag">T5 施工位</span>
    </header>
    <div class="ad-panel placeholder">
      <p><b>任务 T5 未实施</b> —— 本页将填充：8 章 56 关的章节编排与关卡参数编辑（目标 / 预算 / 天气池 / 解锁 / 星级阈值），草稿保存与发布。</p>
      <p>关卡包是 7 个内容包中的 <code>levels</code>（chapters + levels 两个字段），数据层走 <code>src/admin/api/content.js</code> 的通用接口。</p>
      <small>结构基准：<code>src/content/defaults/levels.js</code> · 契约见 <code>docs/PARALLEL_TASKS.md §C1</code> · 设计见 <code>docs/ADMIN_DESIGN.md §9</code></small>
    </div>
  </section>
</template>

<script setup>
// T5 施工位：本文件为 T5（关卡编辑器）独占，其他任务不得修改。
// 依赖面（冻结）：import { getPack, savePack, publishPack, packHistory } from '../api/content.js'
</script>

<style scoped>
.le-tag{padding:3px 9px;border-radius:3px;border:1px solid #ffd36e55;color:#ffd36e;font-size:10px;font-weight:900;letter-spacing:.1em}
</style>
