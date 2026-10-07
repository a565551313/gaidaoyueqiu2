<template>
  <div class="splash-screen" aria-label="盖到月球2启动页" @pointerdown="skip" @keydown="skip">
    <img src="/assets/art/start.png" alt="" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const emit = defineEmits(['done'])
const props = defineProps({
  duration: { type: Number, default: 1600 }
})

const done = ref(false)
let timer = null

function finish() {
  if (done.value) return
  done.value = true
  if (timer) clearTimeout(timer)
  emit('done')
}

function skip() {
  finish()
}

onMounted(() => {
  timer = setTimeout(finish, props.duration)
})

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
.splash-screen{
  position:relative;
  display:flex;
  align-items:center;
  justify-content:center;
  width:100%;
  height:100%;
  overflow:hidden;
  background:#fff;
  cursor:pointer;
}

.splash-screen img{
  display:block;
  width:100%;
  height:100%;
  object-fit:contain;
  object-position:center;
}
</style>
