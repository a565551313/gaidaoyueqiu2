// jsdom 环境 + 浏览器 API 打桩。
//
// 必须在 import 任何 vue 代码**之前**调用 setupDom()：
// @vue/runtime-dom 在模块加载时就 `const doc = typeof document !== 'undefined' ? document : null`，
// 晚一步注入就永远是 null，报 `Cannot read properties of null (reading 'createComment')`。
import { JSDOM } from 'jsdom'

export function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true
  })
  const { window } = dom
  globalThis.window = window
  for (const k of ['document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'CustomEvent',
    'Event', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
    'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'navigator']) {
    try { Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true }) } catch { /* Node 自带的只读全局，跳过 */ }
  }
  globalThis.devicePixelRatio = 2

  // canvas：记录调用但不真画
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({
    canvas: { width: 300, height: 200 },
    measureText: () => ({ width: 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} })
  }, { get(o, k) { if (k in o) return o[k]; return () => {} }, set() { return true } })

  // WebAudio：桩必须足够完整。
  // 桩缺一个方法 → Audio.click() 抛错 → 点击处理函数在播音效那一行就中断，
  // 后面的导航永远不执行。这会让测试报出假的「按钮没反应」。
  const param = () => new Proxy({ value: 1 }, {
    get(o, k) { return k === 'value' ? o.value : () => {} },
    set(o, k, v) { o[k] = v; return true }
  })
  const node = () => new Proxy({
    gain: param(), frequency: param(), detune: param(), Q: param(),
    type: 'sine', buffer: null, playbackRate: param(), onended: null
  }, { get(o, k) { return k in o ? o[k] : () => node() }, set(o, k, v) { o[k] = v; return true } })

  class FakeAudioContext {
    constructor() { this.destination = node(); this.state = 'running'; this.sampleRate = 44100; this.listener = {} }
    get currentTime() { return 0 }
    createBuffer(c = 1, l = 8) {
      return { length: l, duration: 0, sampleRate: 44100, numberOfChannels: c, getChannelData: () => new Float32Array(l), copyToChannel() {}, copyFromChannel() {} }
    }
    decodeAudioData() { return Promise.resolve(this.createBuffer()) }
    resume() { return Promise.resolve() }
    suspend() { return Promise.resolve() }
    close() { return Promise.resolve() }
  }
  for (const m of ['createGain', 'createOscillator', 'createBufferSource', 'createBiquadFilter',
    'createDynamicsCompressor', 'createStereoPanner', 'createPanner', 'createConvolver',
    'createDelay', 'createWaveShaper', 'createAnalyser', 'createChannelMerger',
    'createChannelSplitter', 'createPeriodicWave']) {
    FakeAudioContext.prototype[m] = function () { return node() }
  }
  globalThis.AudioContext = window.AudioContext = window.webkitAudioContext = FakeAudioContext
  globalThis.Audio = window.Audio = class {
    play() { return Promise.resolve() }
    pause() {}
    load() {}
    addEventListener() {}
    removeEventListener() {}
    get currentTime() { return 0 }
    set currentTime(v) {}
  }
  globalThis.fetch = () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })

  return window
}
