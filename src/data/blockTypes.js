// 方块类型数据层：「这块方块是谁放的」。和建筑材质（玩家买的皮肤+属性）正交：
// 同一个类型可以是任意材质，同一个材质可以出现在任意类型上。
//
// Phase 0 内容数据化：类型字面量在 src/content/defaults/blockTypes.js。
// art 里只放「类型自己决定的外观」。没写 colors 就跟随材质配色，
// 这正是普通层/完美层和地基、技能层的区别所在。

import { bundle } from '../core/content.js'

export const BLOCK_TYPES = bundle.blockTypes.map((type) => ({ ...type }))

const BY_ID = new Map(BLOCK_TYPES.map((type) => [type.id, type]))
const FALLBACK = BY_ID.get('normal')

export function getBlockType(id) {
  return BY_ID.get(id) || FALLBACK
}

// 落层结果，挂在方块的 tags 上。和类型是两回事：
// 一个「完美落下的烈焰层」在旧模型里无法表达，因为 kind 只有一个槽。
export const BLOCK_TAGS = Object.freeze({
  perfect: { label: '完美落层', desc: '落点压在安全窗口内，描边转金。' },
  shield: { label: '护盾保住', desc: '本该被切掉，护盾挡下了这一次。' }
})
