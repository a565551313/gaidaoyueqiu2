// 第二批 Kenney 资源：粒子 / 星空精灵。
// Particle Pack 的透明版是白色可染色精灵，用 tinted(key, color) 按需染色并缓存。

const BASE = '/assets/kenney'
const DEFS = {
  // 星空（Simple Space）
  'star-tiny': `${BASE}/kenney_simple-space/PNG/Default/star_tiny.png`,
  'star-small': `${BASE}/kenney_simple-space/PNG/Default/star_small.png`,
  'star-medium': `${BASE}/kenney_simple-space/PNG/Default/star_medium.png`,
  'star-large': `${BASE}/kenney_simple-space/PNG/Default/star_large.png`
}
// Particle Pack：flame_01..06 / smoke_01..03 / spark_01..07 / flare_01
for (let i = 1; i <= 6; i++) DEFS[`flame${i}`] = `${BASE}/kenney_particle-pack/PNG (Transparent)/flame_0${i}.png`
for (let i = 1; i <= 3; i++) DEFS[`smoke${i}`] = `${BASE}/kenney_particle-pack/PNG (Transparent)/smoke_0${i}.png`
for (let i = 1; i <= 7; i++) DEFS[`spark${i}`] = `${BASE}/kenney_particle-pack/PNG (Transparent)/spark_0${i}.png`
DEFS['flare1'] = `${BASE}/kenney_particle-pack/PNG (Transparent)/flare_01.png`

const cache = new Map()
const tintCache = new Map()
let preloadPromise = null

function loadOne(key) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve()
    const img = new Image()
    img.onload = () => {
      cache.set(key, img)
      resolve()
    }
    img.onerror = () => resolve() // 单张失败不阻塞整体
    img.src = DEFS[key]
  })
}

// 预载全部精灵；失败的单张会被跳过，调用方走程序化兜底。
export function preloadSpritePacks() {
  if (!preloadPromise) {
    preloadPromise = Promise.all(Object.keys(DEFS).map(loadOne)).then(() => true)
  }
  return preloadPromise
}

// 取已加载的精灵；未加载完返回 null。
export function sprite(key) {
  const img = cache.get(key)
  return img && img.naturalWidth ? img : null
}

// 白色精灵按颜色染色（source-in 保留 alpha），结果缓存。
export function tinted(key, color) {
  const img = sprite(key)
  if (!img || typeof document === 'undefined') return null
  const ck = `${key}|${color}`
  if (tintCache.has(ck)) return tintCache.get(ck)
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, c.width, c.height)
  tintCache.set(ck, c)
  return c
}
