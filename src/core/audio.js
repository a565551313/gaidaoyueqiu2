// 统一音效管理：使用 Web Audio 合成，轻量、无需资源文件。
// 支持静音开关。切换页面/暂停不会产生叠加或失控的声音。
//
// 背景音乐为“曲目制”：
// - menu   ：主菜单/准备页的轻快循环（原有曲目）
// - battle ：局内战斗曲，148BPM 小调电子风（实时合成），按 battleIntensity 0/1/2 三层升级
// 切换曲目时交叉淡化；暂停时通过 duckMusic 压低音量。

const TRACKS = {
  menu: {
    bpm: 104,
    len: 16,
    volume: 0.22,
    fadeIn: 1.2,
    step(am, i, t, sd) {
      const melody = [659.25, 0, 783.99, 987.77, 880, 0, 783.99, 659.25, 587.33, 0, 659.25, 783.99, 1046.5, 0, 987.77, 783.99]
      const bass = [110, 0, 110, 0, 146.83, 0, 146.83, 0, 98, 0, 98, 0, 130.81, 0, 130.81, 0]
      const chime = [0, 1318.5, 0, 0, 1174.66, 0, 0, 987.77, 0, 1174.66, 0, 0, 1318.5, 0, 1567.98, 0]
      if (melody[i]) am._musicNote(melody[i], t, sd * 0.68, 0.075, 'square')
      if (bass[i]) am._musicNote(bass[i], t, sd * 1.6, 0.06, 'sine')
      if (chime[i]) am._musicNote(chime[i], t + sd * 0.12, sd * 0.7, 0.04, 'triangle')
      if (i % 4 === 0) am._musicKick(t, 0.24)
    }
  },
  battle: {
    bpm: 148,
    len: 16,
    volume: 0.24,
    fadeIn: 0.8,
    step(am, i, t, sd) {
      const L = am.battleIntensity || 0
      // A 小调驱动型进行：A - G - A - C/G
      const bass = [55, 55, 82.41, 55, 65.41, 65.41, 98, 65.41, 55, 55, 82.41, 55, 73.42, 73.42, 110, 73.42]
      const arp = [220, 329.63, 440, 659.25, 261.63, 392, 523.25, 783.99, 220, 329.63, 440, 659.25, 293.66, 440, 587.33, 880]
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

// ---------------------------------------------------------------
// 文件型背景音乐：配了文件的曲目走 HTMLAudio 循环播放，没配的走 Web Audio 合成。
// menu：Pixabay - Pixelate - pixelated dreams（thatlofishow），Pixabay Content License，免版税可商用。
// battle：Mixkit - Vastness（Andrew Ev），Mixkit License，免费可商用（禁转售/禁自注册 Content ID）。
//
// 注意：战斗曲必须走 Web Audio 合成（不放文件），因为只有合成轨道支持
// battleIntensity 三层推进（起步/交战/冲刺）；文件播放无法分层。
// battle-vastness.mp3 保留在资源目录中备用，但不再默认播放。
// ---------------------------------------------------------------
const MUSIC_FILES = {
  menu: '/assets/music/menu-pixelate.mp3'
}

// ---------------------------------------------------------------
// 落层评价喊话（解说员语音）
// ---------------------------------------------------------------
// 只喊单词，不喊长句：Good / Great / Perfect，连击 7 连以上才换成 Unbelievable。
// 整句长喊（"Perfect again! Two in a row!" 之类）要念 2.7~4.7 秒，而塔每 1~2 秒长一层，
// 一句没念完下两层都落好了，喊话和画面必然对不上，因此全部砍掉。
//
// gain   相对音量，档位越高喊得越满。
// length 实测时长（秒），用来判断「这句还在念」。
// holdToEnd 同一句重复触发时不自打断（见下）。
export const VOICE_CLIPS = {
  good: { gain: 0.78, length: 1.10 },
  great: { gain: 0.9, length: 1.04 },
  perfect: { gain: 1.0, length: 1.12 },
  // 7 连以上会一层接一层地反复触发 unbelievable，而这句 2.04 秒、比落层间隔还长。
  // 按默认的无条件抢断规则，它每次都会把自己掐在开头，听上去像卡带。
  // holdToEnd = 这句还在念时重复触发就丢弃本次，等它念完下一次再念；
  // 换成别的档位（连击断了）则照常立刻抢断。
  unbelievable: { gain: 1.0, length: 2.04, holdToEnd: true }
}

// ---------------------------------------------------------------
// 建筑材质音色表
// ---------------------------------------------------------------
// 每种材质有自己的“坠落落地”与“被切除”音色，使同一个操作在不同材质下
// 听感完全不同：泥土闷、混凝土沉、钢材脆亮带余音、青铜像钟、乌金低沉带泛音。
// land(am, v) 中 v 为音量系数（完美落层时略降，避免盖过金色提示音）。
const MATERIAL_SFX = {
  // 泥土：低频闷响 + 松散的沙土噪声，几乎没有余音
  soil: {
    land(am, v = 1) {
      am._tone({ from: 196, sweepTo: 88, type: 'sine', dur: 0.15, gain: 0.3 * v })
      am._noise({ dur: 0.17, gain: 0.2 * v, filterFreq: 380 })
      am._noise({ dur: 0.26, gain: 0.06 * v, filterFreq: 240, delay: 0.04 })
    },
    cut(am) {
      am._noise({ dur: 0.3, gain: 0.22, filterFreq: 620 })
      am._tone({ from: 170, sweepTo: 64, type: 'sine', dur: 0.24, gain: 0.14 })
    }
  },
  // 混凝土：厚重的石块砸落，带碎粒摩擦的尾巴
  concrete: {
    land(am, v = 1) {
      am._tone({ from: 152, sweepTo: 58, type: 'triangle', dur: 0.19, gain: 0.32 * v })
      am._noise({ dur: 0.1, gain: 0.23 * v, filterFreq: 900 })
      am._noise({ dur: 0.3, gain: 0.09 * v, filterFreq: 1700, type: 'bandpass', delay: 0.03 })
    },
    cut(am) {
      am._noise({ dur: 0.34, gain: 0.24, filterFreq: 1500, type: 'bandpass' })
      am._tone({ from: 230, sweepTo: 70, type: 'square', dur: 0.2, gain: 0.15 })
      am._noise({ dur: 0.45, gain: 0.08, filterFreq: 2600, type: 'highpass', delay: 0.06 })
    }
  },
  // 钢材：金属撞击的“铛”，带高频不谐和泛音与较长余振
  steel: {
    land(am, v = 1) {
      am._noise({ dur: 0.05, gain: 0.14 * v, filterFreq: 3400, type: 'highpass' })
      am._tone({ from: 430, sweepTo: 286, type: 'square', dur: 0.07, gain: 0.2 * v })
      am._tone({ freq: 1180, to: 1150, type: 'sine', dur: 0.55, gain: 0.13 * v, delay: 0.01 })
      am._tone({ freq: 1783, to: 1740, type: 'sine', dur: 0.42, gain: 0.07 * v, delay: 0.015 })
      am._tone({ freq: 2630, type: 'sine', dur: 0.3, gain: 0.035 * v, delay: 0.02 })
    },
    cut(am) {
      // 金属被撕开的尖锐刮擦
      am._tone({ from: 2400, sweepTo: 520, type: 'sawtooth', dur: 0.26, gain: 0.16 })
      am._noise({ dur: 0.22, gain: 0.18, filterFreq: 4200, type: 'highpass' })
      am._tone({ freq: 1320, type: 'sine', dur: 0.4, gain: 0.07, delay: 0.08 })
    }
  },
  // 青铜：像小钟一样的暖调共鸣，衰减最长
  bronze: {
    land(am, v = 1) {
      am._tone({ from: 186, sweepTo: 112, type: 'triangle', dur: 0.12, gain: 0.18 * v })
      am._tone({ freq: 523, to: 516, type: 'sine', dur: 0.8, gain: 0.15 * v })
      am._tone({ freq: 784, to: 772, type: 'sine', dur: 0.62, gain: 0.085 * v, delay: 0.01 })
      am._tone({ freq: 1245, type: 'sine', dur: 0.46, gain: 0.05 * v, delay: 0.02 })
      am._tone({ freq: 1568, type: 'sine', dur: 0.34, gain: 0.028 * v, delay: 0.03 })
    },
    cut(am) {
      am._tone({ from: 880, sweepTo: 330, type: 'triangle', dur: 0.3, gain: 0.17 })
      am._tone({ freq: 660, type: 'sine', dur: 0.55, gain: 0.09, delay: 0.05 })
      am._noise({ dur: 0.18, gain: 0.12, filterFreq: 2800, type: 'highpass' })
    }
  },
  // 乌金：深沉的暗色轰鸣，上方挂一层细碎的金属微光
  blackgold: {
    land(am, v = 1) {
      am._tone({ from: 116, sweepTo: 40, type: 'sawtooth', dur: 0.34, gain: 0.27 * v })
      am._noise({ dur: 0.2, gain: 0.11 * v, filterFreq: 480 })
      am._tone({ freq: 1560, type: 'sine', dur: 0.5, gain: 0.055 * v, delay: 0.02 })
      am._tone({ freq: 2340, type: 'sine', dur: 0.36, gain: 0.03 * v, delay: 0.05 })
    },
    cut(am) {
      am._tone({ from: 320, sweepTo: 52, type: 'sawtooth', dur: 0.32, gain: 0.2 })
      am._noise({ dur: 0.26, gain: 0.14, filterFreq: 900 })
      am._tone({ freq: 1970, type: 'sine', dur: 0.42, gain: 0.05, delay: 0.06 })
    }
  }
}

class AudioManager {
  constructor() {
    this.ctx = null
    this.master = null
    this.enabled = true
    this.musicVolume = 0.7
    this.effectsVolume = 0.7
    this._unlocked = false
    // 当前建筑材质，决定落层/切除的音色
    this.material = 'soil'

    // 音乐总线：所有曲目增益挂到 bus 上，方便暂停时整体压音量（duck）。
    this.musicBus = null
    this.effectsBus = null
    this._musicDuck = 1
    // 当前曲目对象 { track, playing, gain, timer, nextTime, step }
    this.music = null
    this.lastTrack = 'menu'
    // 文件型音乐：{ track, src, el, rampTimer }
    this.fileMusic = null
    this._fileDuck = 1
    // 战斗曲强度层级 0/1/2（起飞 / 交战 / 冲刺），由游戏引擎随高度推进。
    this.battleIntensity = 0
    // 复用的白噪声缓冲（鼓/风声等）
    this._noiseBuf = null
    // Public CC0 one-shots. Web Audio synthesis remains the fallback for locked browsers.
    this.assetCache = new Map()
    this.assetBusy = new Map()
    // 落层评价喊话（解说员）。独立于 assetCache：喊话是单声道独占的，
    // 同一时刻只允许一句在播，新评价直接抢断旧评价。
    this.voiceCache = new Map()
    this.voiceClip = null
    this.voiceName = null
    this.voiceUntil = 0
  }

  init(enabled = true, musicVolume = 0.7, effectsVolume = musicVolume) {
    this.enabled = enabled
    this.musicVolume = Math.max(0, Math.min(1, Number(musicVolume) || 0))
    this.effectsVolume = Math.max(0, Math.min(1, Number(effectsVolume) || 0))
    // 延迟创建 AudioContext（需用户手势解锁）
  }

  _ensure() {
    if (this.ctx) return
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.connect(this.ctx.destination)
      this.musicBus = this.ctx.createGain()
      this.musicBus.gain.value = this.musicVolume * 0.5 * this._musicDuck
      this.musicBus.connect(this.master)
      this.effectsBus = this.ctx.createGain()
      this.effectsBus.gain.value = this.effectsVolume * 0.5
      this.effectsBus.connect(this.master)
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
      this.stopVoice()
      this.stopMusic()
    } else if (this._unlocked) {
      this.startMusic(this.lastTrack)
    }
  }

  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, Number(v) || 0))
    if (this.ctx && this.musicBus) {
      this.musicBus.gain.setTargetAtTime(this.musicVolume * 0.5 * this._musicDuck, this.ctx.currentTime, 0.02)
    }
    if (this.fileMusic) this._rampFile(this.fileMusic.el, this._fileMusicVolume(), 0.15)
  }

  setEffectsVolume(v) {
    this.effectsVolume = Math.max(0, Math.min(1, Number(v) || 0))
    if (this.ctx && this.effectsBus) {
      this.effectsBus.gain.setTargetAtTime(this.effectsVolume * 0.5, this.ctx.currentTime, 0.02)
    }
  }

  _asset(name, group = 'interface') {
    return `/assets/audio/${group}/Audio/${name}.ogg`
  }

  // 落层评价喊话。voice('great') 之类，表见 VOICE_CLIPS。
  // 规则：同一时刻只有一句在播，**换了档位就立刻抢断**——玩家落的是哪一层就该听到
  // 哪一层的评价，Good 还在念、下一层落了个 Great，就该当场改口喊 Great。
  // 唯一的例外是 holdToEnd 档位的「自己打断自己」：连续 7 连会一层接一层触发同一句
  // unbelievable，抢断的话这句两秒的话永远只念得出开头，所以让它念完，本次丢弃。
  voice(name) {
    const clip = VOICE_CLIPS[name]
    if (!clip || !this.enabled || typeof window === 'undefined') return false
    if (clip.holdToEnd && this.voiceName === name && this._voicePlaying()) return false
    this.stopVoice()
    let source = this.voiceCache.get(name)
    if (!source) {
      source = new window.Audio(`/assets/voice/${name}.mp3`)
      source.preload = 'auto'
      this.voiceCache.set(name, source)
    }
    try {
      const el = source.cloneNode(true)
      el.volume = Math.max(0, Math.min(1, this.effectsVolume * 0.9 * (clip.gain ?? 1)))
      el.play().catch(() => {})
      this.voiceClip = el
      this.voiceName = name
      this.voiceUntil = this._now() + clip.length
      return true
    } catch (e) {
      return false
    }
  }

  // 「这句还在念」：用元素自己的 ended 为准，再用时长兜底——
  // 浏览器拒绝自动播放时 ended 永远是 false，只靠它会把 holdToEnd 永久卡死。
  _voicePlaying() {
    return !!this.voiceClip && !this.voiceClip.ended && this._now() < this.voiceUntil
  }

  _now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now() / 1000
    return Date.now() / 1000
  }

  stopVoice() {
    const el = this.voiceClip
    this.voiceClip = null
    this.voiceName = null
    this.voiceUntil = 0
    if (!el) return
    try {
      el.pause()
      el.currentTime = 0
    } catch (e) { /* 浏览器尚未加载完元数据时 currentTime 会抛，忽略即可 */ }
  }

  _playAsset(name, group = 'interface', gain = 0.7) {
    if (!this.enabled || typeof window === 'undefined') return false
    const key = `${group}/${name}`
    let source = this.assetCache.get(key)
    if (!source) {
      source = new window.Audio(this._asset(name, group))
      source.preload = 'auto'
      this.assetCache.set(key, source)
    }
    try {
      const clip = source.cloneNode(true)
      clip.volume = Math.max(0, Math.min(1, this.effectsVolume * 0.5 * gain))
      clip.play().catch(() => {})
      return true
    } catch (e) {
      return false
    }
  }

  // ---------------- 背景音乐 ----------------

  startMusic(trackId = 'menu') {
    // 无论是否静音都记住目标曲目，便于中途开声音时恢复正确的曲子
    this.lastTrack = trackId
    if (!this.enabled) return
    this._ensure()
    if (typeof window === 'undefined') return
    // 文件型曲目（如菜单 BGM）：HTMLAudio 循环播放
    if (MUSIC_FILES[trackId]) {
      if (this.music) { this._fadeOutMusic(this.music, 0.5); this.music = null }
      this._startFileMusic(trackId, MUSIC_FILES[trackId])
      return
    }
    this._startSynthMusic(trackId)
  }

  // 合成型曲目（战斗曲等）：交叉淡化切入，支持随高度推进的三层强度
  _startSynthMusic(trackId) {
    // 合成型曲目：先停掉文件音乐
    this._stopFileMusic(0.5)
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
    this._stopFileMusic(fade)
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
    this._fileDuck = on ? 0.18 : 1
    this._musicDuck = on ? 0.18 : 1
    if (this.fileMusic) this._rampFile(this.fileMusic.el, this._fileMusicVolume(), 0.25)
    if (!this.ctx || !this.musicBus) return
    const now = this.ctx.currentTime
    try {
      this.musicBus.gain.cancelScheduledValues(now)
      this.musicBus.gain.setValueAtTime(Math.max(0.0001, this.musicBus.gain.value || 1), now)
      this.musicBus.gain.linearRampToValueAtTime(this.musicVolume * 0.5 * this._musicDuck, now + 0.25)
    } catch (e) {}
  }

  // ---------------- 文件型背景音乐 ----------------

  _fileMusicVolume() {
    return Math.max(0, Math.min(1, this.musicVolume * 0.5)) * this._fileDuck
  }

  _startFileMusic(trackId, src) {
    if (this.fileMusic && this.fileMusic.src === src) {
      this.fileMusic.track = trackId
      const el = this.fileMusic.el
      if (!el.paused) {
        this._rampFile(el, this._fileMusicVolume(), 0.4)
        return
      }
    } else {
      this._stopFileMusic(0)
      const el = new window.Audio(src)
      el.loop = true
      el.preload = 'auto'
      // 文件加载失败（离线 / 资源缺失）时回退到 Web Audio 合成轨道，
      // 保证音乐永不缺失（战斗曲本身就是合成，不受影响）。
      el.onerror = () => {
        if (!this.fileMusic || this.fileMusic.el !== el) return
        this._stopFileMusic(0)
        if (TRACKS[trackId] && this.enabled) this._startSynthMusic(trackId)
      }
      this.fileMusic = { track: trackId, src, el, rampTimer: null }
    }
    const el = this.fileMusic.el
    try { el.volume = 0.0001 } catch (e) {}
    const p = el.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
    this._rampFile(el, this._fileMusicVolume(), 1.2)
  }

  _rampFile(el, target, dur = 0.5) {
    const fm = this.fileMusic
    if (!fm || fm.el !== el) return
    if (fm.rampTimer) { window.clearInterval(fm.rampTimer); fm.rampTimer = null }
    const steps = Math.max(1, Math.round((dur * 1000) / 50))
    let from = 0.0001
    try { from = el.volume } catch (e) {}
    let n = 0
    fm.rampTimer = window.setInterval(() => {
      n += 1
      const k = Math.min(1, n / steps)
      try { el.volume = Math.max(0.0001, from + (target - from) * k) } catch (e) {}
      if (k >= 1 && this.fileMusic && this.fileMusic.rampTimer) {
        window.clearInterval(this.fileMusic.rampTimer)
        this.fileMusic.rampTimer = null
      }
    }, 50)
  }

  _stopFileMusic(fade = 0.3) {
    const fm = this.fileMusic
    if (!fm) return
    this.fileMusic = null
    if (fm.rampTimer) window.clearInterval(fm.rampTimer)
    const el = fm.el
    if (!(fade > 0)) {
      try { el.pause() } catch (e) {}
      return
    }
    const steps = Math.max(1, Math.round((fade * 1000) / 50))
    let from = 0
    try { from = el.volume } catch (e) {}
    let n = 0
    const timer = window.setInterval(() => {
      n += 1
      const k = Math.min(1, n / steps)
      try { el.volume = Math.max(0, from * (1 - k)) } catch (e) {}
      if (k >= 1) {
        window.clearInterval(timer)
        try { el.pause() } catch (e) {}
      }
    }, 50)
  }

  // 战斗曲强度：0 起步 / 1 交战 / 2 冲刺（引擎随楼层进度调用）
  setBattleIntensity(v) {
    this.battleIntensity = v | 0
    // Re-schedule immediately so a height transition is audible without waiting
    // for a later scene tick or a second navigation event.
    if (this.music?.track === 'battle') this._scheduleMusic()
  }

  setScene(scene) {
    const track = scene === 'battle' ? 'battle' : 'menu'
    this.startMusic(track)
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
    g.connect(this.effectsBus)
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
    g.connect(this.effectsBus)
    src.start(t0)
    src.stop(t0 + dur + 0.02)
  }

  // ---------------- 材质音色 ----------------

  // 由引擎在开局时设置当前建筑材质，落层/切除的音色随之改变
  setMaterial(id) {
    this.material = MATERIAL_SFX[id] ? id : 'soil'
  }

  _mat() {
    return MATERIAL_SFX[this.material] || MATERIAL_SFX.soil
  }

  // ---------------- 具体音效 ----------------
  // 普通落层：完全由材质决定音色（泥土闷 / 钢材铛 / 青铜钟 ……）
  drop() {
    if (!this.enabled) return
    this._playAsset('impactGeneric_light_000', 'impact', 0.52)
    this._mat().land(this, 1)
  }

  // 完美落层：材质落地声打底 + 金色提示音（连击越高音调越亮）
  perfect(combo = 1) {
    if (!this.enabled) return
    this._mat().land(this, 0.72)
    const base = 660 + Math.min(combo, 12) * 40
    this._tone({ from: base, sweepTo: base * 1.5, type: 'sine', dur: 0.14, gain: 0.26 })
    this._tone({ freq: base * 2, type: 'sine', dur: 0.1, gain: 0.12, delay: 0.04 })
  }

  // 切除：不同材质被切开的质感（泥土碎裂 / 钢材撕裂 / 青铜钟鸣 ……）
  cut() {
    if (!this.enabled) return
    this._playAsset('impactMetal_001', 'scifi', 0.35)
    this._mat().cut(this)
  }

  // 被切下的碎块砸地（切片特效加强后单独补一层落地声）
  debris() {
    if (!this.enabled) return
    this._noise({ dur: 0.16, gain: 0.1, filterFreq: 700 })
    this._tone({ from: 150, sweepTo: 62, type: 'triangle', dur: 0.14, gain: 0.08 })
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
    if (!this.enabled) return
    // 先是方块砸落（材质音色），再接失败的下坠音
    this._mat().land(this, 0.9)
    this._tone({ from: 300, sweepTo: 70, type: 'sawtooth', dur: 0.6, gain: 0.26, delay: 0.05 })
    this._noise({ dur: 0.4, gain: 0.18, filterFreq: 500, delay: 0.05 })
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
    if (this._playAsset('click_001', 'interface', 0.34)) return
    this._tone({ from: 600, sweepTo: 500, type: 'sine', dur: 0.05, gain: 0.12 })
  }

  // ---------------- 高空威胁音效 ----------------

  // 楼体晃动的木质吱呀声（很轻，只做氛围）
  creak() {
    if (!this.enabled) return
    this._tone({ from: 95, sweepTo: 62, type: 'sawtooth', dur: 0.28, gain: 0.045 })
    this._noise({ dur: 0.2, gain: 0.028, filterFreq: 320 })
  }

  // ---------------- 天气音效 ----------------
  // 天气不再预告，直接来：登场瞬间只播放该天气自身的声音。

  // 大风呼啸
  weatherWind() {
    if (!this.enabled) return
    this._noise({ dur: 1.6, gain: 0.11, filterFreq: 700 })
    this._tone({ from: 210, sweepTo: 130, type: 'sine', dur: 1.4, gain: 0.03 })
  }

  // 暴雨（沙沙的高频噪声）
  weatherRain() {
    if (!this.enabled) return
    this._noise({ dur: 1.8, gain: 0.09, filterFreq: 2200, type: 'highpass' })
  }

  // 冰雹开始
  weatherHail() {
    if (!this.enabled) return
    this._noise({ dur: 1.2, gain: 0.1, filterFreq: 3200, type: 'highpass' })
    for (let i = 0; i < 4; i++) {
      this._tone({ freq: 1800 + Math.random() * 900, type: 'square', dur: 0.04, gain: 0.07, delay: i * 0.09 })
    }
  }

  // 乌云压顶（低沉闷响）
  weatherSmog() {
    if (!this.enabled) return
    this._tone({ from: 150, sweepTo: 70, type: 'sine', dur: 1.2, gain: 0.07 })
    this._noise({ dur: 1.0, gain: 0.05, filterFreq: 300 })
  }

  // 单颗冰雹砸中楼顶
  hailImpact() {
    if (!this.enabled) return
    this._tone({ from: 1500, sweepTo: 480, type: 'square', dur: 0.08, gain: 0.13 })
    this._noise({ dur: 0.12, gain: 0.12, filterFreq: 2400, type: 'highpass' })
  }

  // 雷声（strength 0~1）
  thunder(strength = 1) {
    if (!this.enabled) return
    const g = 0.12 + 0.18 * strength
    this._noise({ dur: 0.9 + strength * 0.7, gain: g, filterFreq: 480 })
    this._tone({ from: 90, sweepTo: 42, type: 'sawtooth', dur: 0.8 + strength * 0.5, gain: g * 0.6, delay: 0.04 })
    this._noise({ dur: 0.5, gain: g * 0.5, filterFreq: 1400, type: 'highpass', delay: 0.02 })
  }


}

export const Audio = new AudioManager()
