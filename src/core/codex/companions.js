// 伙伴（宠物）的图鉴适配器。
//
// 宠物和另外两个模块不一样：它的形象是 AnimatedPet.vue，一个 SVG 组件，
// 不是 canvas 画出来的。契约里 preview 因此有两种 kind，
// 适配器只声明「用哪个组件、传什么 props」，不把组件 import 进 core——
// 否则核心逻辑就会依赖 .vue 文件。
import { PETS } from '../../data/pets.js'

export function companionEntries(store) {
  const sorted = [...PETS].sort((a, b) => a.unlockStars - b.unlockStars)
  return sorted.map((pet, i) => {
    const saved = store?.pets?.[pet.id]
    const owned = Boolean(saved?.owned)
    return {
      id: `companion:${pet.id}`,
      group: 'companions',
      order: i,
      name: pet.name,
      subtitle: `${pet.codename} · ${pet.role}`,
      blurb: pet.bio,
      state: owned ? 'owned' : 'locked',
      lockedHint: `集满 ${pet.unlockStars} 颗月星解锁`,
      stats: [
        { key: 'unlockStars', label: '解锁星数', value: pet.unlockStars, base: 0, text: `${pet.unlockStars} 星`, better: 'low' },
        { key: 'skillCount', label: '技能数', value: pet.skills.length, base: 0, text: String(pet.skills.length), better: 'high' }
      ],
      extras: owned && saved
        ? [
            { label: '等级', value: `Lv.${saved.level}` },
            { label: '星阶', value: `${saved.star} 星` }
          ]
        : [{ label: '定位', value: pet.role }],
      // 技能表是宠物特有的展示块，页面按 entry.skills 存在与否决定画不画
      skills: pet.skills.map((s) => ({ star: s.star, name: s.name, desc: s.desc })),
      preview: { kind: 'component', name: 'AnimatedPet', props: { id: pet.id, size: 96 } },
      scene: { label: '形象', kind: 'component', name: 'AnimatedPet', props: { id: pet.id, size: 150 } },
      sounds: []
    }
  })
}
