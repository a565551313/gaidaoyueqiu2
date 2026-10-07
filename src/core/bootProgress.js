import { reactive } from 'vue'

export const bootProgress = reactive({
  version: { state: 'pending', detail: '等待检查' },
  resource: { state: 'pending', loaded: 0, total: 1, detail: '等待加载' },
  server: { state: 'pending', detail: '等待连接' }
})
