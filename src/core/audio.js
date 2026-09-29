// 统一音效管理：使用 Web Audio 合成，轻量、无需资源文件。
// 支持静音开关。切换页面/暂停不会产生叠加或失控的声音。
//
// 背景音乐为“曲目制”：
// - menu   ：主菜单/准备页的轻快循环（原有曲目）
// - battle ：局内战斗曲，136BPM 小调电子风，按 battleIntensity 0/1/2 三层升级
// 切换曲目时交叉淡化；暂停时通过 duckMusic 压低音量。

const TRACKS = {
  menu: {
    bpm: 92,
    len: 16,
    volume: 0.22,
    fadeIn: 1.2,
    step(am, i, t, sd) {
      const melody = [523.25, 0, 659.25, 0, 783.99, 659.25, 587.33, 0, 523.25, 587.33, 659.25, 0, 440, 493.88, 523.25, 0]
      const bass = [130.81, 0, 0, 0, 196, 0, 0, 0, 174.61, 0, 0, 0, 196, 0, 0, 0]
      const chime = [0, 1046.5, 0, 0, 0, 987.77, 0, 0, 0, 880, 0, 0, 0, 783.99, 0, 0]
      if (melody[i]) am._musicNote(melody[i], t, sd * 0.82, 0.07, 'triangle')
      if (bass[i]) am._musicNote(bass[i], t, sd * 1.7, 0.05, 'sine')
      if (chime[i]) am._musicNote(chime[i], t + sd * 0.15, sd * 0.9, 0.035, 'sine')
    }
  },
  battle: {
    bpm: 136,
    len: 16,
    volume: 0.24,
    fadeIn: 0.8,
    step(am, i, t, sd) {
      const L = am.battleIntensity || 0
      // A 小调驱动型进行：A - G - A - C/G
      const bass = [55, 110, 55, 110, 55, 110, 49, 98, 55, 110, 55, 110, 65.41, 130.81, 49, 98]
      const arp = [220, 261.63, 329.63, 392, 440, 392, 329.63, 261.63, 220, 261.63, 329.63, 392, 523.25, 440, 392, 329.63]
      const sparse = [440, 0, 392, 0, 329.63, 0, 392, 0, 440, 0, 523.25, 0, 392, 0, 329.63, 0]
      // 低音：八分音符锯齿波（各层都在，越往后越狠）
      am._musicNote(bass[i], t, sd * 0.9, L === 0 ? 0.05 : 0.072, 'sawtooth')
      // 鼓组
      if (L >= 1) {
        if (i % 2 === 0) am._musicKick(t, 0.5)
        else am._musicHat(t, 0.05)
        if (L === 2 && (i === 4 || i === 12)) am._musicSnare(t)
      } else if (i === 0 || i === 8) {
        am._musicKick(t, 0.32)
      }
      // 旋律层
      if (L === 0) {
        // 起步段：稀疏回声感长音，暗流涌动
        if (sparse[i]) am._musicNote(sparse[i], t, sd * 1.7, 0.05, 'sine')
      } else if (L === 1) {
        am._musicNote(arp[i], t, sd * 0.85, 0.055, 'triangle')
      } else {
        // 冲刺段：八分琶音 + 十六度回声 + 密集踩镲
        am._musicNote(arp[i], t, sd * 0.8, 0.07, 'triangle')
        am._musicNote(arp[i] * 2, t + sd / 2, sd * 0.4, 0.026, 'square')
        if (i % 2 === 0) am._musicHat(t + sd / 2, 0.038)
      }
    }
  }
}

class AudioManager {
  constructor() {
    this.ctx = null
    this.master = null
    this.enabled = true
    this._unlocked = false

    // 音乐总线：所有曲目增益挂到 bus 上，方便暂停时整体压音量（duck）。
    this.musicBus = null
    // 当前曲目对象 { track, playing, gain, timer, nextTime, step }
    this.music = null
    this.lastTrack = 'menu'
    // 战斗曲强度层级 0/1/2（起飞 / 交战 / 冲刺），由游戏引擎随高度推进。
    this.battleIntensity = 0
    // 复用的白噪声缓冲（鼓/风声等）
    this._noiseBuf = null
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
      this.musicBus = this.ctx.createGain()
      this.musicBus.gain.value = 1
      this.musicBus.connect(this.master)
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
    if (this.enabled) this.startMusic(this.lastTrack)
  }

  setEnabled(v) {
    this.enabled = v
    if (!v) {
      this.stopMusic()
    } else if (this._unlocked) {
      this.startMusic(this.lastTrack)
    }
  }

  // ---------------- 背景音乐 ----------------

  startMusic(trackId = 'menu') {
    // 无论是否静音都记住目标曲目，便于中途开声音时恢复正确的曲子
    this.lastTrack = trackId
    if (!this.enabled) return
    this._ensure()
    if (!this.ctx || !this.musicBus) return
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
    if (this.music && this.music.playing) {
      if (this.music.track === trackId) return
      // 交叉淡化：旧曲目淡出，新曲目同时淡入
      this._fadeOutMusic(this.music, 0.7)
    }

    const track = TRACKS[trackId] || TRACKS.menu
    const gain = this.ctx.createGain()
    const now = this.ctx.currentTime
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(track.volume, now + track.fadeIn)
    gain.connect(this.musicBus)

    this.music = {
      track: trackId,
      playing: true,
      gain,
      timer: null,
      nextTime: now + 0.08,
      step: 0
    }
    this._scheduleMusic()
    this.music.timer = window.setInterval(() => this._scheduleMusic(), 200)
  }

  stopMusic(fade = 0.3) {
    if (!this.music) return
    this._fadeOutMusic(this.music, fade)
    this.music = null
  }

  _fadeOutMusic(m, fade = 0.3) {
    m.playing = false
    if (m.timer) window.clearInterval(m.timer)
    if (this.ctx && m.gain) {
      const now = this.ctx.currentTime
      try {
        m.gain.gain.cancelScheduledValues(now)
        m.gain.gain.setValueAtTime(Math.max(0.0001, m.gain.gain.value || 0.0001), now)
        m.gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.05, fade))
        window.setTimeout(() => {
          try { m.gain.disconnect() } catch (e) {}
        }, fade * 1000 + 200)
      } catch (e) {
        try { m.gain.disconnect() } catch (err) {}
      }
    }
  }

  // 暂停/恢复时压低/恢复音乐音量
  duckMusic(on) {
    if (!this.ctx || !this.musicBus) return
    const now = this.ctx.currentTime
    try {
      this.musicBus.gain.cancelScheduledValues(now)
      this.musicBus.gain.setValueAtTime(Math.max(0.0001, this.musicBus.gain.value || 1), now)
      this.musicBus.gain.linearRampToValueAtTime(on ? 0.18 : 1, now + 0.25)
    } catch (e) {}
  }

  // 战斗曲强度：0 起步 / 1 交战 / 2 冲刺（引擎随楼层进度调用）
  setBattleIntensity(v) {
    this.battleIntensity = v | 0
  }

  _scheduleMusic() {
    if (!this.music || !this.music.playing || !this.ctx) return
    const lookahead = 1.2
    const def = TRACKS[this.music.track]
    if (!def) return
    const beat = 60 / def.bpm
    const stepDur = beat / 2

    while (this.music.nextTime < this.ctx.currentTime + lookahead) {
      const i = this.music.step % def.len
      const t = this.music.nextTime
      def.step(this, i, t, stepDur)
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
    // 极轻的滑音，避免循环太机械。
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

  _musicKick(t, gain = 0.5) {
    if (!this.music || !this.music.gain || !this.ctx) return
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, t)
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12)
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)
    osc.connect(g)
    g.connect(this.music.gain)
    osc.start(t)
    osc.stop(t + 0.18)
  }

  _musicHat(t, gain = 0.05) {
    this._musicNoise(t, 0.04, gain, 7000, 'highpass')
  }

  _musicSnare(t) {
    this._musicNoise(t, 0.1, 0.09, 1800, 'bandpass')
    this._musicNote(190, t, 0.08, 0.05, 'triangle')
  }

  _musicNoise(t0, dur, gain, filterFreq, type = 'highpass') {
    if (!this.music || !this.music.gain || !this.ctx) return
    const src = this.ctx.createBufferSource()
    src.buffer = this._getNoiseBuf()
    src.loop = true
    const filter = this.ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = filterFreq
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(filter)
    filter.connect(g)
    g.connect(this.music.gain)
    src.start(t0)
    src.stop(t0 + dur + 0.02)
  }

  _getNoiseBuf() {
    if (this._noiseBuf) return this._noiseBuf
    const len = this.ctx.sampleRate * 0.5
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this._noiseBuf = buf
    return buf
  }

  // ---------------- 通用合成原语 ----------------

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

  // ---------------- 具体音效 ----------------
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

  // ---------------- 高空威胁音效 ----------------

  // 楼体晃动的木质吱呀声（很轻，只做氛围）
  creak() {
    if (!this.enabled) return
    this._tone({ from: 95, sweepTo: 62, type: 'sawtooth', dur: 0.28, gain: 0.045 })
    this._noise({ dur: 0.2, gain: 0.028, filterFreq: 320 })
  }

  // 敌人登场提示（按类型）
  enemyCue(type) {
    if (!this.enabled) return
    if (type === 'bird') {
      this._tone({ from: 1400, sweepTo: 2100, type: 'sine', dur: 0.08, gain: 0.11 })
      this._tone({ from: 1700, sweepTo: 1100, type: 'sine', dur: 0.09, gain: 0.09, delay: 0.1 })
    } else if (type === 'eagle') {
      this._tone({ from: 1900, sweepTo: 620, type: 'sawtooth', dur: 0.34, gain: 0.08 })
    } else if (type === 'drone') {
      this._tone({ from: 210, sweepTo: 235, type: 'square', dur: 0.32, gain: 0.05 })
      this._tone({ from: 315, sweepTo: 350, type: 'square', dur: 0.32, gain: 0.04, delay: 0.03 })
    } else if (type === 'plane') {
      this._noise({ dur: 0.75, gain: 0.13, filterFreq: 420 })
      this._tone({ from: 95, sweepTo: 68, type: 'sawtooth', dur: 0.75, gain: 0.05 })
    } else if (type === 'ufo') {
      this._tone({ from: 480, sweepTo: 920, type: 'sine', dur: 0.5, gain: 0.09 })
      this._tone({ from: 720, sweepTo: 1380, type: 'triangle', dur: 0.5, gain: 0.06, delay: 0.06 })
    }
  }

  // 被飞行物撞/顶到移动方块
  knock(heavy = false) {
    if (heavy) {
      this._tone({ from: 200, sweepTo: 58, type: 'square', dur: 0.22, gain: 0.22 })
      this._noise({ dur: 0.26, gain: 0.15, filterFreq: 700 })
    } else {
      this._tone({ from: 480, sweepTo: 210, type: 'triangle', dur: 0.12, gain: 0.17 })
      this._noise({ dur: 0.1, gain: 0.1, filterFreq: 1200 })
    }
  }

  // 老鹰扇风的持续风声（登场时一次性提示）
  windGust() {
    this._noise({ dur: 0.85, gain: 0.09, filterFreq: 850 })
  }

  // UFO 牵引光束
  beam() {
    this._tone({ from: 190, sweepTo: 720, type: 'sine', dur: 0.85, gain: 0.075 })
    this._tone({ from: 285, sweepTo: 1080, type: 'triangle', dur: 0.85, gain: 0.05, delay: 0.05 })
  }

  // 砸中敌人（未致死）
  hitEnemy() {
    this._tone({ from: 300, sweepTo: 175, type: 'square', dur: 0.07, gain: 0.15 })
    this._noise({ dur: 0.06, gain: 0.11, filterFreq: 2600, type: 'highpass' })
  }

  // 击杀敌人
  killEnemy() {
    this._noise({ dur: 0.24, gain: 0.18, filterFreq: 1700, type: 'highpass' })
    this._tone({ from: 480, sweepTo: 1250, type: 'square', dur: 0.15, gain: 0.13 })
    this._tone({ freq: 1560, type: 'sine', dur: 0.12, gain: 0.11, delay: 0.09 })
  }
}

export const Audio = new AudioManager()
