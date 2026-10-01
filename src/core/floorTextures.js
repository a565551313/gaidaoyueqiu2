// 楼层 Kenney 贴图：墙砖 + 拱形窗（kenney_platformer-art-buildings，CC0）。
// 5 种建材各一张脸：泥土/混凝土/钢材用原色墙砖，青铜/乌金用 multiply 染色靠向材质色。
// 图片异步预载；没加载完时 getFloorArt 返回 null，调用方走旧的程序化纹理兜底。

const KENNEY_TILES = '/assets/kenney/kenney_platformer-art-buildings/Tiles'

const WALL_TILE = {
  soil: 'houseBeige.png',      // 泥土：米黄墙砖
  concrete: 'houseGray.png',   // 混凝土：灰蓝墙砖
  steel: 'houseDark.png',      // 钢材：深灰蓝墙砖
  bronze: 'houseBeige.png',    // 青铜：米黄墙砖 + 暖橙染色
  blackgold: 'houseDark.png'   // 乌金：深灰蓝墙砖 + 紫染色
}

// multiply 染色（白色 = 不染色），把墙砖往材质色上靠
const WALL_TINT = {
  bronze: '#ffc890',
  blackgold: '#c9a8ff'
}

const WINDOW_TILE = 'window.png'
// window.png 内窗体实际包围盒（70x70 tile 内）
export const WINDOW_SRC = { x: 4, y: 0, w: 61, h: 70 }

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

let artCache = null
let loadingPromise = null

export function loadFloorTextures() {
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    const files = new Set([...Object.values(WALL_TILE), WINDOW_TILE])
    const loaded = {}
    await Promise.all([...files].map(async (f) => {
      loaded[f] = await loadImage(`${KENNEY_TILES}/${f}`)
    }))
    if (!loaded[WINDOW_TILE]) {
      artCache = null
      return null
    }
    const art = {}
    for (const [mat, file] of Object.entries(WALL_TILE)) {
      if (!loaded[file]) continue
      art[mat] = {
        wall: loaded[file],
        tint: WALL_TINT[mat] || null,
        window: loaded[WINDOW_TILE]
      }
    }
    artCache = art
    return art
  })()
  return loadingPromise
}

// 同步取贴图；未加载完成返回 null（调用方用旧渲染兜底）
export function getFloorArt(materialId) {
  return (artCache && artCache[materialId]) || null
}
