// 统一音效管理：使用 Web Audio 合成，轻量、无需资源文件。
// 支持静音开关。切换页面/暂停不会产生叠加或失控的声音。

class AudioManager {
  constructor() {
    this.ctx = null
    this.master = null
    this.enabled = true
    this._unlocked = false

    // 轻量背景音乐：用 Web Audio 合成循环旋律，不依赖外部资源。
    this.music = null
  }

  init(enabled = true) {
    this.enabled = enabled
    // 延迟创建 AudioContext（需用户手势解锁）
  }

  _ensure() {
    if (this.ctx) return
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.5
      this.master.connect(this.ctx.destination)
    } catch (e) {
      this.ctx = null
    }
  }

  // 用户首次交互时调用以解锁移动端音频
  unlock() {
    this._ensure()
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    this._unlocked = true
    if (this.enabled) this.startMusic()
  }

  setEnabled(v) {
    this.enabled = v
    if (!v) {
      this.stopMusic()
    } else if (this._unlocked) {
      this.startMusic()
    }
  }

  startMusic() {
    if (!this.enabled) return
    this._ensure()
    if (!this.ctx || !this.master) return
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
    if (this.music && this.music.playing) return

    const gain = this.ctx.createGain()
    const now = this.ctx.currentTime
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.22, now + 1.2)
    gain.connect(this.master)

    this.music = {
      playing: true,
      gain,
      timer: null,
      nextTime: now + 0.08,
      step: 0
    }
    this._scheduleMusic()
    this.music.timer = window.setInterval(() => this._scheduleMusic(), 260)
  }

  stopMusic() {
    if (!this.music) return
    const m = this.music
    m.playing = false
    if (m.timer) window.clearInterval(m.timer)
    if (this.ctx && m.gain) {
      const now = this.ctx.currentTime
      try {
        m.gain.gain.cancelScheduledValues(now)
        m.gain.gain.setValueAtTime(Math.max(0.0001, m.gain.gain.value || 0.0001), now)
        m.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
        window.setTimeout(() => {
          try { m.gain.disconnect() } catch (e) {}
        }, 450)
      } catch (e) {
        try { m.gain.disconnect() } catch (err) {}
      }
    }
    this.music = null
  }

  _scheduleMusic() {
    if (!this.music || !this.music.playing || !this.ctx) return
    const lookahead = 1.2
    const beat = 60 / 92
    const stepDur = beat / 2
    const melody = [523.25, 0, 659.25, 0, 783.99, 659.25, 587.33, 0, 523.25, 587.33, 659.25, 0, 440, 493.88, 523.25, 0]
    const bass = [130.81, 0, 0, 0, 196, 0, 0, 0, 174.61, 0, 0, 0, 196, 0, 0, 0]
    const chime = [0, 1046.5, 0, 0, 0, 987.77, 0, 0, 0, 880, 0, 0, 0, 783.99, 0, 0]

    while (this.music.nextTime < this.ctx.currentTime + lookahead) {
      const i = this.music.step % melody.length
      const t = this.music.nextTime
      if (melody[i]) this._musicNote(melody[i], t, stepDur * 0.82, 0.07, 'triangle')
      if (bass[i]) this._musicNote(bass[i], t, stepDur * 1.7, 0.05, 'sine')
      if (chime[i]) this._musicNote(chime[i], t + stepDur * 0.15, stepDur * 0.9, 0.035, 'sine')
      this.music.nextTime += stepDur
      this.music.step++
    }
  }

  _musicNote(freq, t0, dur, gain = 0.06, type = 'sine') {
    if (!this.music || !this.music.gain || !this.ctx) return
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    const filter = this.ctx.createBiquadFilter()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    // 极轻的“月光漂浮感”滑音，避免循环太机械。
    osc.frequency.exponentialRampToValueAtTime(freq * 1.005, t0 + dur)
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(type === 'sine' ? 1200 : 1800, t0)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(filter)
    filter.connect(g)
    g.connect(this.music.gain)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  }

  _tone({ freq = 440, type = 'sine', dur = 0.12, gain = 0.3, from, to, delay = 0, sweepTo }) {
    if (!this.enabled) return
    this._ensure()
    if (!this.ctx) return
    const t0 = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from ?? freq, t0)
    if (sweepTo != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + dur)
    } else if (to != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur)
    }
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(this.master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  _noise({ dur = 0.2, gain = 0.25, delay = 0, filterFreq = 1200, type = 'lowpass' }) {
    if (!this.enabled) return
    this._ensure()
    if (!this.ctx) return
    const t0 = this.ctx.currentTime + delay
    const len = Math.floor(this.ctx.sampleRate * dur)
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len)
    }
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    const filter = this.ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = filterFreq
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(filter)
    filter.connect(g)
    g.connect(this.master)
    src.start(t0)
    src.stop(t0 + dur + 0.02)
  }

  // ---- 具体音效 ----
  drop() {
    this._tone({ from: 320, sweepTo: 180, type: 'triangle', dur: 0.12, gain: 0.28 })
    this._noise({ dur: 0.08, gain: 0.12, filterFreq: 800 })
  }

  perfect(combo = 1) {
    const base = 660 + Math.min(combo, 12) * 40
    this._tone({ from: base, sweepTo: base * 1.5, type: 'sine', dur: 0.14, gain: 0.3 })
    this._tone({ freq: base * 2, type: 'sine', dur: 0.1, gain: 0.14, delay: 0.04 })
  }

  cut() {
    this._noise({ dur: 0.22, gain: 0.2, filterFreq: 2200, type: 'highpass' })
    this._tone({ from: 240, sweepTo: 90, type: 'sawtooth', dur: 0.18, gain: 0.14 })
  }

  restore() {
    this._tone({ from: 400, sweepTo: 900, type: 'sine', dur: 0.3, gain: 0.25 })
    this._tone({ from: 600, sweepTo: 1200, type: 'triangle', dur: 0.3, gain: 0.14, delay: 0.05 })
  }

  coin() {
    this._tone({ from: 900, sweepTo: 1300, type: 'square', dur: 0.09, gain: 0.14 })
    this._tone({ freq: 1568, type: 'square', dur: 0.08, gain: 0.1, delay: 0.06 })
  }

  buy() {
    this._tone({ from: 500, sweepTo: 800, type: 'triangle', dur: 0.12, gain: 0.2 })
    this._tone({ freq: 1000, type: 'sine', dur: 0.1, gain: 0.14, delay: 0.08 })
  }

  chargeReady() {
    this._tone({ from: 300, sweepTo: 800, type: 'sawtooth', dur: 0.35, gain: 0.22 })
    this._tone({ from: 500, sweepTo: 1100, type: 'sine', dur: 0.35, gain: 0.12, delay: 0.05 })
  }

  flame(i = 0) {
    this._noise({ dur: 0.18, gain: 0.22, filterFreq: 900 + i * 300, type: 'lowpass' })
    this._tone({ from: 200 + i * 120, sweepTo: 500 + i * 200, type: 'sawtooth', dur: 0.16, gain: 0.16 })
  }

  shield() {
    this._tone({ from: 700, sweepTo: 400, type: 'sine', dur: 0.25, gain: 0.2 })
    this._noise({ dur: 0.12, gain: 0.1, filterFreq: 600 })
  }

  revive() {
    this._tone({ from: 300, sweepTo: 900, type: 'sine', dur: 0.5, gain: 0.25 })
    this._tone({ from: 450, sweepTo: 1350, type: 'triangle', dur: 0.5, gain: 0.14, delay: 0.1 })
  }

  skill() {
    this._tone({ from: 520, sweepTo: 1040, type: 'triangle', dur: 0.2, gain: 0.2 })
  }

  fail() {
    this._tone({ from: 300, sweepTo: 70, type: 'sawtooth', dur: 0.6, gain: 0.28 })
    this._noise({ dur: 0.4, gain: 0.2, filterFreq: 500 })
  }

  star(i = 0) {
    const base = 700 + i * 200
    this._tone({ from: base, sweepTo: base * 1.4, type: 'sine', dur: 0.25, gain: 0.24 })
  }

  win() {
    const notes = [523, 659, 784, 1046]
    notes.forEach((n, i) => {
      this._tone({ freq: n, type: 'triangle', dur: 0.3, gain: 0.22, delay: i * 0.12 })
    })
  }

  click() {
    this._tone({ from: 600, sweepTo: 500, type: 'sine', dur: 0.05, gain: 0.12 })
  }
}

export const Audio = new AudioManager()
