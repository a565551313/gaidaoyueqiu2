<template>
  <section class="ad-page">
    <header class="ad-page-head">
      <h2>内容工厂</h2>
      <span class="cf-tag">T4 施工位</span>
    </header>
    <div class="ad-panel placeholder">
      <p><b>任务 T4 未实施</b> —— 本页将填充：7 个内容包的表单化编辑、草稿保存、发布、历史版本回滚。</p>
      <p>数据层已就绪（src/admin/api/content.js），契约见 <code>docs/PARALLEL_TASKS.md §C1</code>。</p>
      <small>包清单（冻结，不可增删）：</small>
      <ul class="cf-list">
        <li v-for="p in packs" :key="p.key">
          <code>{{ p.key }}</code> · {{ p.label }} —— {{ p.desc }}
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup>
import { PACK_META, PACK_KEYS } from '../api/content.js'

defineProps({ initialTab: { type: String, default: 'blocks' } }) // T4 将用作初始 tab（blocks / ants 两个入口）

const packs = PACK_KEYS.map((key) => ({ key, ...PACK_META[key] }))
</script>

<style scoped>
.cf-tag{padding:3px 9px;border-radius:3px;border:1px solid #ffd36e55;color:#ffd36e;font-size:10px;font-weight:900;letter-spacing:.1em}
.cf-list{list-style:none;margin:10px auto 0;padding:0;max-width:520px;text-align:left;display:flex;flex-direction:column;gap:7px;color:#9db4cc;font-size:12px;line-height:1.7}
.cf-list code{color:#58a6ff}
</style>
