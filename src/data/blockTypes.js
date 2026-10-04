// 方块类型 = 「这块方块是谁放的」。和建筑材质（玩家买的皮肤+属性）正交：
// 同一个类型可以是任意材质，同一个材质可以出现在任意类型上。
//
// art 里只放「类型自己决定的外观」。没写 colors 就跟随材质配色，
// 这正是普通层/完美层和地基、技能层的区别所在。
export const BLOCK_TYPES = [
  {
    id: 'normal',
    name: '标准层',
    desc: '玩家手动落下的楼层，外观跟随当前建筑材质。',
    art: {},
    stats: {}
  },
  {
    id: 'base',
    name: '地基',
    desc: '开局就在的那一层，永远不会被蚁群选为目标。',
    art: { colors: ['#3b577d', '#17253f'] },
    stats: {}
  },
  {
    id: 'flame',
    name: '烈焰层',
    desc: '烈焰技能连续铺三层，沿顶边燃烧。不计分。',
    art: { colors: ['#ffc857', '#ee6c32'], tint: '#ffc890', edge: 'flame' },
    stats: {}
  },
  {
    id: 'pursuit',
    name: '追击层',
    desc: '追击技能补的一层，直接盖在塔顶。不计分。',
    art: { colors: ['#7df3d2', '#2b8fe8'], tint: '#bfe8ff' },
    stats: {}
  }
]

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
