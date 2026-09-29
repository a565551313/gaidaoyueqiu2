<script>
import { h } from 'vue'

const paths = {
  revive: () => [
    h('path', {
      d: 'M12 20s-7-4.6-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.6C19 15.4 12 20 12 20z',
      fill: 'currentColor'
    }),
    h('path', { d: 'M12 10.5v4M10 12.5h4', stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round' })
  ],
  auto: () => [
    h('circle', { cx: 12, cy: 12, r: 3.2, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }),
    h('path', {
      d: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round'
    })
  ],
  double: () => [
    h('circle', { cx: 9.5, cy: 11, r: 6, fill: 'currentColor', opacity: 0.5 }),
    h('circle', { cx: 14, cy: 13, r: 6, fill: 'currentColor' }),
    h(
      'text',
      { x: 14, y: 15.8, 'font-size': 6.5, 'font-weight': 800, fill: '#fff', 'text-anchor': 'middle' },
      '×2'
    )
  ],
  slow: () => [
    h('circle', { cx: 12, cy: 13, r: 8, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }),
    h('path', { d: 'M12 8v5l3 2', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }),
    h('path', { d: 'M6 5L4 3M18 5l2-2', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' })
  ],
  widen: () => [
    h('rect', { x: 8, y: 8, width: 8, height: 8, rx: 1.5, fill: 'currentColor', opacity: 0.5 }),
    h('path', { d: 'M2 12h20', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }),
    h('path', {
      d: 'M5 9l-3 3 3 3M19 9l3 3-3 3',
      stroke: 'currentColor',
      'stroke-width': 2,
      fill: 'none',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    })
  ],
  shield: () => [
    h('path', { d: 'M12 3l7 3v5c0 4.2-3 7.5-7 9-4-1.5-7-4.8-7-9V6z', fill: 'currentColor' }),
    h('path', {
      d: 'M9 12l2 2 4-4',
      stroke: '#fff',
      'stroke-width': 1.8,
      fill: 'none',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    })
  ],
  comboGuard: () => [
    h('path', { d: 'M12 3l7 3v5c0 4.2-3 7.5-7 9-4-1.5-7-4.8-7-9V6z', fill: 'currentColor' }),
    h('path', {
      d: 'M12 8l1.1 2.3 2.5.3-1.8 1.7.5 2.5L12 13.9 9.7 15l.5-2.5-1.8-1.7 2.5-.3z',
      fill: '#fff'
    })
  ]
}

export default {
  name: 'ItemGlyph',
  props: {
    id: { type: String, required: true },
    size: { type: Number, default: 30 }
  },
  render() {
    const build = paths[this.id]
    return h(
      'svg',
      { width: this.size, height: this.size, viewBox: '0 0 24 24', fill: 'none' },
      build ? build() : []
    )
  }
}
</script>
