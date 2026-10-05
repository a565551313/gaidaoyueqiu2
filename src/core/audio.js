// 播放引擎：Web Audio 图的搭建与调度。
// 「有哪些声音」在 audioTables.js，这里只管怎么把它们放出来：
// 合成音色、采样加载、曲目交叉淡化、暂停/解说时的压低、静音开关。
// 切换页面或暂停不会产生叠加或失控的声音。

import { TRACKS, MUSIC_FILES, SFX, VOICE_CLIPS, MATERIAL_SFX, MUSIC_FILE_LEVEL, EFFECTS_LEVEL, VOICE_LEVEL, VOICE_DUCK } from './audioTables.js'

// VOICE_CLIPS 历来从 audio.js 导出，外部引用照旧。
export { VOICE_CLIPS }

class AudioManager {
  constructor() {
    this.ctx = null
    this.master = null
    // 音乐和音效现在是两个独立开关（之前合并成一个 enabled，玩家没法只关
    // 配乐不关提示音，或者反过来）。两者默认都开。
    this.musicEnabled = true
    this.sfxEnabled = true
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
    // 采样解码缓存：url -> AudioBuffer（null 表示加载失败，永久走合成兜底）
    this.sampleBuffers = new Map()
    this.samplePending = new Set()
    // 解说压低：和 duckMusic（暂停压低）相互独立，两者相乘，互不覆盖
    this._voiceDuck = 1
    this._voiceDuckTimer = null
    // 落层评价喊话（解说员）。喊话走 HTMLAudio 流式播放而不是解码成 AudioBuffer：
    // 它比音效长得多，没必要常驻内存。单声道独占，
    // 同一时刻只允许一句在播，新评价直接抢断旧评价。
    this.voiceCache = new Map()
    this.voiceClip = null
    this.voiceName = null
    this.voiceUntil = 0
  }

  init(musicEnabled = true, sfxEnabled = true, musicVolume = 0.7, effectsVolume = musicVolume) {
    this.musicEnabled = musicEnabled
    this.sfxEnabled = sfxEnabled
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
      this.musicBus.gain.value = this._musicBusTarget()
      this.musicBus.connect(this.master)
      this.effectsBus = this.ctx.createGain()
      this.effectsBus.gain.value = this.effectsVolume * EFFECTS_LEVEL
      this.effectsBus.connect(this.master)
    } catch (e) {
      this.ctx = null
    }
  }

  // 用户首次交互时调用以解锁移动端音频
  unlock() {
    this._ensure()
    this._preloadSamples()
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    this._unlocked = true
    if (this.musicEnabled) this.startMusic(this.lastTrack)
  }

  setMusicEnabled(v) {
    this.musicEnabled = v
    if (!v) {
      this.stopMusic()
    } else if (this._unlocked) {
      this.startMusic(this.lastTrack)
    }
  }

  setSfxEnabled(v) {
    this.sfxEnabled = v
    if (!v) this.stopVoice()
  }

  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, Number(v) || 0))
    this._applyMusicVolume(0.15)
  }

  setEffectsVolume(v) {
    this.effectsVolume = Math.max(0, Math.min(1, Number(v) || 0))
    if (this.ctx && this.effectsBus) {
      this.effectsBus.gain.setTargetAtTime(this.effectsVolume * EFFECTS_LEVEL, this.ctx.currentTime, 0.02)
    }
  }

  // 把采样解码成 AudioBuffer 缓存起来。解码后统一走 effectsBus 播放，
  // 好处有三：① 和合成音效共用同一条音量链路，音量法则统一；
  // ② 不受移动端 Safari 对并发 HTMLAudio 元素的数量限制；
  // ③ 能用 BufferSource 精确截断/淡出长采样。
  _loadSample(url) {
    if (this.sampleBuffers.has(url) || this.samplePending.has(url)) return
    if (!this.ctx || typeof fetch !== 'function') return
    this.samplePending.add(url)
    fetch(url)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buf) => { this.sampleBuffers.set(url, buf) })
      .catch(() => { this.sampleBuffers.set(url, null) }) // null = 失败，永久走合成兜底
      .then(() => { this.samplePending.delete(url) })
  }

  _sampleUrl(def, index) {
    const file = def.variants ? `${def.file}_${String((def.start ?? 0) + index).padStart(3, '0')}` : def.file
    return `/assets/audio/${def.group}/Audio/${file}.ogg`
  }

  // 解锁音频后预热全部采样。总量约 60 个小文件，并行拉取，
  // 没拉完之前对应音效自动回落到合成版，不会出现「没声音」。
  _preloadSamples() {
    if (!this.ctx) return
    for (const def of Object.values(SFX)) {
      for (let i = 0; i < (def.variants || 1); i++) this._loadSample(this._sampleUrl(def, i))
    }
  }

  // 播放一个采样。返回 false 表示没播成（未就绪/失败），调用方应回落到合成版。
  _sample(key, opts = {}) {
    const def = SFX[key]
    if (!def || !this.sfxEnabled || typeof window === 'undefined') return false
    this._ensure()
    if (!this.ctx || !this.effectsBus) return false
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
    const index = def.variants ? Math.floor(Math.random() * def.variants) : 0
    const url = this._sampleUrl(def, index)
    const buf = this.sampleBuffers.get(url)
    if (!buf) { this._loadSample(url); return false }
    try {
      const t0 = this.ctx.currentTime + (opts.delay || 0)
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = Math.max(0.05, (def.rate || 1) * (opts.rate || 1))
      const g = this.ctx.createGain()
      const vol = Math.max(0.0001, (def.gain ?? 1) * (opts.gain ?? 1))
      g.gain.setValueAtTime(vol, t0)
      src.connect(g)
      g.connect(this.effectsBus)
      const natural = buf.duration / src.playbackRate.value
      const dur = Math.min(opts.dur ?? def.dur ?? natural, natural)
      if (dur < natural) {
        // 长采样只取开头一截，尾部指数淡出，避免硬切的爆音
        g.gain.setValueAtTime(vol, t0 + dur * 0.65)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      }
      src.start(t0)
      src.stop(t0 + dur + 0.02)
      return true
    } catch (e) {
      return false
    }
  }

  // 落层评价喊话。voice('great') 之类，表见 VOICE_CLIPS。
  // 规则：同一时刻只有一句在播，**换了档位就立刻抢断**——玩家落的是哪一层就该听到
  // 哪一层的评价，Good 还在念、下一层落了个 Great，就该当场改口喊 Great。
  // 唯一的例外是 holdToEnd 档位的「自己打断自己」：连续 7 连会一层接一层触发同一句
  // unbelievable，抢断的话这句两秒的话永远只念得出开头，所以让它念完，本次丢弃。
  voice(name) {
    const clip = VOICE_CLIPS[name]
    if (!clip || !this.sfxEnabled || typeof window === 'undefined') return false
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
      el.volume = Math.max(0, Math.min(1, this.effectsVolume * VOICE_LEVEL * (clip.gain ?? 1)))
      el.play().catch(() => {})
      this.voiceClip = el
      this.voiceName = name
      this.voiceUntil = this._now() + clip.length
      this._duckForVoice(clip.length)
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
    this._releaseVoiceDuck()
    if (!el) return
    try {
      el.pause()
      el.currentTime = 0
    } catch (e) { /* 浏览器尚未加载完元数据时 currentTime 会抛，忽略即可 */ }
  }

  // ---------------- 背景音乐 ----------------

  startMusic(trackId = 'menu') {
    // 无论是否静音都记住目标曲目，便于中途开声音时恢复正确的曲子
    this.lastTrack = trackId
    if (!this.musicEnabled) return
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
    this._applyMusicVolume(0.25)
  }

  // ---------------- 文件型背景音乐 ----------------

  _fileMusicVolume() {
    return Math.max(0, Math.min(1, this.musicVolume * MUSIC_FILE_LEVEL)) * this._fileDuck * this._voiceDuck
  }

  _musicBusTarget() {
    return this.musicVolume * 0.5 * this._musicDuck * this._voiceDuck
  }

  // 音乐音量的唯一出口：文件曲和合成曲一起跟随，避免四处散落的公式各算各的
  _applyMusicVolume(ramp = 0.25) {
    if (this.fileMusic) this._rampFile(this.fileMusic.el, this._fileMusicVolume(), ramp)
    if (!this.ctx || !this.musicBus) return
    const now = this.ctx.currentTime
    try {
      this.musicBus.gain.cancelScheduledValues(now)
      this.musicBus.gain.setValueAtTime(Math.max(0.0001, this.musicBus.gain.value || 0.0001), now)
      this.musicBus.gain.linearRampToValueAtTime(Math.max(0.0001, this._musicBusTarget()), now + ramp)
    } catch (e) {}
  }

  // 解说开口时把音乐压下去，念完自动抬回来。
  // 这是「统一」的关键一环：不压的话两秒的 Unbelievable 会被配乐糊掉。
  _duckForVoice(seconds) {
    this._voiceDuck = VOICE_DUCK
    this._applyMusicVolume(0.12)
    if (this._voiceDuckTimer) clearTimeout(this._voiceDuckTimer)
    this._voiceDuckTimer = setTimeout(() => {
      this._voiceDuckTimer = null
      this._voiceDuck = 1
      this._applyMusicVolume(0.5)
    }, Math.max(200, seconds * 1000 + 150))
    if (typeof this._voiceDuckTimer?.unref === 'function') this._voiceDuckTimer.unref()
  }

  _releaseVoiceDuck() {
    if (this._voiceDuckTimer) { clearTimeout(this._voiceDuckTimer); this._voiceDuckTimer = null }
    if (this._voiceDuck === 1) return
    this._voiceDuck = 1
    this._applyMusicVolume(0.3)
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
        if (TRACKS[trackId] && this.musicEnabled) this._startSynthMusic(trackId)
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
    if (!this.sfxEnabled) return
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
    if (!this.sfxEnabled) return
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
    if (!this.sfxEnabled) return
    if (this._sample(this._mat().landKey)) return
    this._mat().land(this, 1)
  }

  // 完美落层：材质落地声打底 + 金色提示音（连击越高音调越亮）
  perfect(combo = 1) {
    if (!this.sfxEnabled) return
    // 材质落地声打底 + 金色提示音；连击越高提示音越亮（采样靠 playbackRate 移调）
    const rate = 1 + Math.min(combo, 12) * 0.045
    if (this._sample(this._mat().landKey, { gain: 0.78 }) && this._sample('perfectChime', { rate, delay: 0.02 })) return
    this._mat().land(this, 0.72)
    const base = 660 + Math.min(combo, 12) * 40
    this._tone({ from: base, sweepTo: base * 1.5, type: 'sine', dur: 0.14, gain: 0.26 })
    this._tone({ freq: base * 2, type: 'sine', dur: 0.1, gain: 0.12, delay: 0.04 })
  }

  // 切除：不同材质被切开的质感（泥土碎裂 / 钢材撕裂 / 青铜钟鸣 ……）
  cut() {
    if (!this.sfxEnabled) return
    if (this._sample(this._mat().cutKey)) return
    this._mat().cut(this)
  }

  // 被切下的碎块砸地（切片特效加强后单独补一层落地声）
  debris() {
    if (!this.sfxEnabled) return
    if (this._sample('debris')) return
    this._noise({ dur: 0.16, gain: 0.1, filterFreq: 700 })
    this._tone({ from: 150, sweepTo: 62, type: 'triangle', dur: 0.14, gain: 0.08 })
  }

  restore() {
    if (!this.sfxEnabled) return
    if (this._sample('restore')) return
    this._tone({ from: 400, sweepTo: 900, type: 'sine', dur: 0.3, gain: 0.25 })
    this._tone({ from: 600, sweepTo: 1200, type: 'triangle', dur: 0.3, gain: 0.14, delay: 0.05 })
  }

  coin() {
    if (!this.sfxEnabled) return
    if (this._sample('coin')) return
    this._tone({ from: 900, sweepTo: 1300, type: 'square', dur: 0.09, gain: 0.14 })
    this._tone({ freq: 1568, type: 'square', dur: 0.08, gain: 0.1, delay: 0.06 })
  }

  buy() {
    if (!this.sfxEnabled) return
    if (this._sample('buy')) return
    this._tone({ from: 500, sweepTo: 800, type: 'triangle', dur: 0.12, gain: 0.2 })
    this._tone({ freq: 1000, type: 'sine', dur: 0.1, gain: 0.14, delay: 0.08 })
  }

  chargeReady() {
    if (!this.sfxEnabled) return
    if (this._sample('chargeReady')) return
    this._tone({ from: 300, sweepTo: 800, type: 'sawtooth', dur: 0.35, gain: 0.22 })
    this._tone({ from: 500, sweepTo: 1100, type: 'sine', dur: 0.35, gain: 0.12, delay: 0.05 })
  }

  flame(i = 0) {
    if (!this.sfxEnabled) return
    if (this._sample('flame', { rate: 1 + i * 0.07 })) return
    this._noise({ dur: 0.18, gain: 0.22, filterFreq: 900 + i * 300, type: 'lowpass' })
    this._tone({ from: 200 + i * 120, sweepTo: 500 + i * 200, type: 'sawtooth', dur: 0.16, gain: 0.16 })
  }

  shield() {
    if (!this.sfxEnabled) return
    if (this._sample('shield')) return
    this._tone({ from: 700, sweepTo: 400, type: 'sine', dur: 0.25, gain: 0.2 })
    this._noise({ dur: 0.12, gain: 0.1, filterFreq: 600 })
  }

  revive() {
    if (!this.sfxEnabled) return
    if (this._sample('revive')) return
    this._tone({ from: 300, sweepTo: 900, type: 'sine', dur: 0.5, gain: 0.25 })
    this._tone({ from: 450, sweepTo: 1350, type: 'triangle', dur: 0.5, gain: 0.14, delay: 0.1 })
  }

  skill() {
    if (!this.sfxEnabled) return
    if (this._sample('skill')) return
    this._tone({ from: 520, sweepTo: 1040, type: 'triangle', dur: 0.2, gain: 0.2 })
  }

  fail() {
    if (!this.sfxEnabled) return
    // 先是方块砸落（材质音色），再接失败的低频爆响
    if (this._sample(this._mat().landKey, { gain: 0.9 }) && this._sample('failBoom', { delay: 0.06 })) return
    this._mat().land(this, 0.9)
    this._tone({ from: 300, sweepTo: 70, type: 'sawtooth', dur: 0.6, gain: 0.26, delay: 0.05 })
    this._noise({ dur: 0.4, gain: 0.18, filterFreq: 500, delay: 0.05 })
  }

  star(i = 0) {
    if (!this.sfxEnabled) return
    if (this._sample('star', { rate: 1 + i * 0.2 })) return
    const base = 700 + i * 200
    this._tone({ from: base, sweepTo: base * 1.4, type: 'sine', dur: 0.25, gain: 0.24 })
  }

  win() {
    if (!this.sfxEnabled) return
    // 四声上行；采样版用 playbackRate 做音阶
    if ([1, 1.19, 1.33, 1.5].every((rate, i) => this._sample('win', { rate, delay: i * 0.12 }))) return
    const notes = [523, 659, 784, 1046]
    notes.forEach((n, i) => {
      this._tone({ freq: n, type: 'triangle', dur: 0.3, gain: 0.22, delay: i * 0.12 })
    })
  }

  click() {
    if (!this.sfxEnabled) return
    if (this._sample('click')) return
    this._tone({ from: 600, sweepTo: 500, type: 'sine', dur: 0.05, gain: 0.12 })
  }

  // ---------------- 高空威胁音效 ----------------

  // 楼体晃动的木质吱呀声（很轻，只做氛围）
  creak() {
    if (!this.sfxEnabled) return
    if (this._sample('creak')) return
    this._tone({ from: 95, sweepTo: 62, type: 'sawtooth', dur: 0.28, gain: 0.045 })
    this._noise({ dur: 0.2, gain: 0.028, filterFreq: 320 })
  }

  // ---------------- 天气音效 ----------------
  // 天气不再预告，直接来：登场瞬间只播放该天气自身的声音。

  // 大风呼啸
  weatherWind() {
    if (!this.sfxEnabled) return
    this._noise({ dur: 1.6, gain: 0.11, filterFreq: 700 })
    this._tone({ from: 210, sweepTo: 130, type: 'sine', dur: 1.4, gain: 0.03 })
  }

  // 暴雨（沙沙的高频噪声）
  weatherRain() {
    if (!this.sfxEnabled) return
    this._noise({ dur: 1.8, gain: 0.09, filterFreq: 2200, type: 'highpass' })
  }

  // 冰雹开始
  weatherHail() {
    if (!this.sfxEnabled) return
    // 一阵噼啪：四颗冰粒错开落下
    if ([0, 1, 2, 3].every((i) => this._sample('hail', { delay: i * 0.09, rate: 0.9 + Math.random() * 0.4 }))) return
    this._noise({ dur: 1.2, gain: 0.1, filterFreq: 3200, type: 'highpass' })
    for (let i = 0; i < 4; i++) {
      this._tone({ freq: 1800 + Math.random() * 900, type: 'square', dur: 0.04, gain: 0.07, delay: i * 0.09 })
    }
  }

  // 乌云压顶（低沉闷响）
  weatherSmog() {
    if (!this.sfxEnabled) return
    if (this._sample('smog')) return
    this._tone({ from: 150, sweepTo: 70, type: 'sine', dur: 1.2, gain: 0.07 })
    this._noise({ dur: 1.0, gain: 0.05, filterFreq: 300 })
  }

  // 单颗冰雹砸中楼顶
  hailImpact() {
    if (!this.sfxEnabled) return
    if (this._sample('hail', { rate: 0.9 + Math.random() * 0.35 })) return
    this._tone({ from: 1500, sweepTo: 480, type: 'square', dur: 0.08, gain: 0.13 })
    this._noise({ dur: 0.12, gain: 0.12, filterFreq: 2400, type: 'highpass' })
  }

  // 雷声（strength 0~1）
  thunder(strength = 1) {
    if (!this.sfxEnabled) return
    const scale = 0.55 + 0.45 * strength
    if (this._sample('thunderCrack', { gain: scale }) && this._sample('thunderBoom', { gain: scale, delay: 0.08 })) return
    const g = 0.12 + 0.18 * strength
    this._noise({ dur: 0.9 + strength * 0.7, gain: g, filterFreq: 480 })
    this._tone({ from: 90, sweepTo: 42, type: 'sawtooth', dur: 0.8 + strength * 0.5, gain: g * 0.6, delay: 0.04 })
    this._noise({ dur: 0.5, gain: g * 0.5, filterFreq: 1400, type: 'highpass', delay: 0.02 })
  }


}

export const Audio = new AudioManager()
