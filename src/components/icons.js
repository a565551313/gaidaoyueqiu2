import { h } from 'vue'

// 统一原创矢量图标（无系统表情符号）。
// 用带 props 声明的组件工厂，确保 size / filled / on 等属性生效。

function makeIcon(name, build, opts = {}) {
  return {
    name,
    props: {
      size: { type: Number, default: 22 },
      filled: { type: Boolean, default: true },
      on: { type: Boolean, default: true }
    },
    render() {
      const vb = opts.vb || '0 0 24 24'
      return h(
        'svg',
        {
          width: this.size,
          height: this.size,
          viewBox: vb,
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': opts.sw || 2,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round'
        },
        build.call(this)
      )
    }
  }
}

export const PlayIcon = makeIcon('PlayIcon', () => [
  h('path', { d: 'M7 5.5v13l11-6.5z', fill: 'currentColor', stroke: 'none' })
])

export const BagIcon = makeIcon('BagIcon', () => [
  h('path', { d: 'M6 8h12l-1 12H7z' }),
  h('path', { d: 'M9 8a3 3 0 0 1 6 0' })
])

export const SkillIcon = makeIcon('SkillIcon', () => [
  h('path', { d: 'M12 3l2.4 5 5.6.6-4.2 3.7 1.3 5.5L12 20l-5.1 2.8 1.3-5.5L4 13.6 9.6 13z' })
])

export const MedalIcon = makeIcon('MedalIcon', () => [
  h('circle', { cx: 12, cy: 9, r: 5.5 }),
  h('path', { d: 'M8.5 13.3 7 21l5-2.5 5 2.5-1.5-7.7M10 9l1.3 1.3L14.5 7' })
])

export const TrophyIcon = makeIcon('TrophyIcon', () => [
  h('path', { d: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 13v5m-4 2h8m-7-2h6' })
])

export const HelpIcon = makeIcon('HelpIcon', () => [
  h('circle', { cx: 12, cy: 12, r: 9 }),
  h('path', { d: 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7' }),
  h('circle', { cx: 12, cy: 17, r: 0.6, fill: 'currentColor', stroke: 'none' })
])

export const BackIcon = makeIcon('BackIcon', () => [h('path', { d: 'M15 5l-7 7 7 7' })])

export const StarIcon = makeIcon('StarIcon', function () {
  return [
    h('path', {
      d: 'M12 3.5l2.5 5.1 5.6.8-4 4 1 5.6L12 16.4 6.9 19l1-5.6-4-4 5.6-.8z',
      fill: this.filled ? 'currentColor' : 'none',
      stroke: 'currentColor'
    })
  ]
})

export const LockIcon = makeIcon('LockIcon', () => [
  h('rect', { x: 5, y: 10, width: 14, height: 10, rx: 2 }),
  h('path', { d: 'M8 10V8a4 4 0 0 1 8 0v2' })
])

export const PauseIcon = makeIcon('PauseIcon', () => [
  h('rect', { x: 7, y: 5, width: 3.5, height: 14, rx: 1.2, fill: 'currentColor', stroke: 'none' }),
  h('rect', { x: 13.5, y: 5, width: 3.5, height: 14, rx: 1.2, fill: 'currentColor', stroke: 'none' })
])

export const FlameIcon = makeIcon('FlameIcon', () => [
  h('path', {
    d: 'M12 3c1 3-2 4-2 7a2 2 0 0 0 4 0c1 1.5 2 3 2 5a4 4 0 1 1-8 0c0-3 3-4 4-12z',
    fill: 'currentColor',
    stroke: 'none'
  })
])

export const ClockIcon = makeIcon('ClockIcon', () => [
  h('circle', { cx: 12, cy: 12, r: 8 }),
  h('path', { d: 'M12 8v4l3 2' })
])

export const BoltIcon = makeIcon('BoltIcon', () => [
  h('path', { d: 'M13 3L5 13h5l-1 8 8-11h-5z', fill: 'currentColor', stroke: 'none' })
])

export const CheckIcon = makeIcon('CheckIcon', () => [h('path', { d: 'M5 12l5 5 9-10' })])

export const SoundIcon = makeIcon('SoundIcon', function () {
  const base = [h('path', { d: 'M4 9v6h4l5 4V5L8 9z', fill: 'currentColor', stroke: 'none' })]
  if (this.on) {
    base.push(h('path', { d: 'M16 8.5a5 5 0 0 1 0 7' }), h('path', { d: 'M18.5 6a8 8 0 0 1 0 12' }))
  } else {
    base.push(h('path', { d: 'M17 9.5l4 5m0-5l-4 5' }))
  }
  return base
})
