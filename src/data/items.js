// 道具商店配置：7 种消耗型道具
export const ITEMS = [
  {
    id: 'revive',
    name: '复活卡',
    price: 800,
    desc: '失败后可复活一次，恢复本局初始宽度，每局限用一次。',
    color: '#ff6f91'
  },
  {
    id: 'auto',
    name: '自动卡',
    price: 600,
    desc: 'AI 接管 10 秒，自动选择较好的时机落层；期间连击冻结，点击画面可提前结束。',
    color: '#4fc3f7'
  },
  {
    id: 'double',
    name: '双倍金币卡',
    price: 400,
    desc: '开局前选择使用，本局最终结算金币乘 2，每局最多一张。',
    color: '#ffd54f'
  },
  {
    id: 'slow',
    name: '慢慢卡',
    price: 300,
    desc: '游戏中使用，持续 10 秒，楼层移动速度减半（与自动卡互斥）。',
    color: '#81c784'
  },
  {
    id: 'widen',
    name: '加宽卡',
    price: 300,
    desc: '开局前选择使用，本局初始宽度增加 10%，满分与恢复上限同步提高，每局最多一张。',
    color: '#ba9bff'
  },
  {
    id: 'shield',
    name: '护盾卡',
    price: 250,
    desc: '开局自动装备，下一次非完美落点不切除宽度，触发后消耗一张。',
    color: '#4dd0e1'
  },
  {
    id: 'comboGuard',
    name: '连击保护卡',
    price: 200,
    desc: '开局自动装备，下一次非完美落点不清空连击，触发后消耗一张。',
    color: '#ffb74d'
  }
]

export function getItem(id) {
  return ITEMS.find((i) => i.id === id)
}
