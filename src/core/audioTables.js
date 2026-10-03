// 声音清单：这个游戏「有哪些声音」的声明式定义。
//
// 和 audio.js 分开是因为两边改动的理由完全不同：
// 这里是调音表（换个采样、改个响度、加一种材质音），改它不需要懂 Web Audio；
// audio.js 是播放机制（音频图、调度、淡入淡出、压低），改它不需要知道有哪些音。
//
// 四张表：
// - TRACKS       实时合成的背景曲，作为文件曲目加载失败时的兜底
// - MUSIC_FILES  正式使用的背景音乐文件；命中这里就走文件播放，否则回落 TRACKS
// - SFX          CC0 采样音效表，字段见表内注释
// - VOICE_CLIPS  落层评价解说
// - MATERIAL_SFX 五种楼层材质各自的落层/切除音：采样 key + 合成版兜底
//
// 表里的函数一律把 AudioManager 实例当参数收（约定名 am / a），
// 因此这个文件对 audio.js 没有反向依赖。

export const TRACKS = {
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
// 文件型曲目。TRACKS 里的同名合成曲保留为**加载失败时的兜底**
//（_startFileMusic 的 onerror 会回落到 _startSynthMusic）。
// battle 原本只有合成版，而 battle-vastness.mp3 从基线 commit 起就躺在仓库里没人引用，
// 导致菜单放真实配乐、一进局内却切成方波 chiptune，风格断崖。现在接上。
// 代价：文件播放无法做 battleIntensity 的三层强度推进（起步/交战/冲刺），
// 该分层只在回落到合成曲时才生效。
// 音量基准。改造前合成战斗曲的内部 volume 只有 0.24，换成母带化的真实配乐后
// 同样的 0.5 系数会直接盖过音效，所以文件曲单独调低一档。
// 层级目标：BGM 垫底 < 音效 < 解说喊话。
export const MUSIC_FILE_LEVEL = 0.38 // 文件型曲目
export const EFFECTS_LEVEL = 0.55    // 音效总线
export const VOICE_LEVEL = 0.85      // 解说（不过 effectsBus，保证任何时候都能穿透出来）
export const VOICE_DUCK = 0.45       // 解说期间音乐压到的比例

export const MUSIC_FILES = {
  menu: '/assets/music/menu-pixelate.mp3',
  battle: '/assets/music/battle-vastness.mp3'
}

// ---------------------------------------------------------------
// 音效采样表
// ---------------------------------------------------------------
// 整局音效统一走 CC0 采样（public/assets/audio/**）。改造前只有 3 个音效用了采样，
// 其余二十多个都是 WebAudio 实时合成的方波/噪声——和真实配乐、真人解说放在一起
// 血统割裂，这是本轮改造的主因。合成版全部保留为采样未就绪/加载失败时的兜底。
//
// file     不带序号的前缀；配合 variants 在 N 个变体里随机挑一个，
//          避免同一个音效连续触发时像机关枪一样完全重复。
// group    素材包目录（impact / interface / scifi）
// start    变体起始编号。impact / scifi 包从 000 起，interface 包从 001 起，两套规则并存
// gain     相对音量
// rate     播放速率，兼做移调（< 1 更低沉、> 1 更尖）
// dur      只取开头一截（素材库里的引擎轰鸣长达 5 秒），末尾自动淡出避免爆音
export const SFX = {
  // —— 建筑材质：落层与切除。不同材质挑不同质感的撞击采样，再用 rate 拉开音高 ——
  landSoil: { file: 'impactSoft_heavy', group: 'impact', variants: 4, gain: 0.95, rate: 0.95 },
  cutSoil: { file: 'impactMining', group: 'impact', variants: 4, gain: 0.55 },
  landConcrete: { file: 'impactPlate_heavy', group: 'impact', variants: 4, gain: 0.9, rate: 0.88 },
  cutConcrete: { file: 'impactMining', group: 'impact', variants: 4, gain: 0.6, rate: 0.85 },
  landSteel: { file: 'impactMetal_heavy', group: 'impact', variants: 4, gain: 0.85 },
  cutSteel: { file: 'impactMetal', group: 'scifi', variants: 4, gain: 0.5 },
  landBronze: { file: 'impactBell_heavy', group: 'impact', variants: 4, gain: 0.62 },
  cutBronze: { file: 'impactBell_heavy', group: 'impact', variants: 4, gain: 0.38, rate: 1.35 },
  landBlackgold: { file: 'impactPunch_heavy', group: 'impact', variants: 4, gain: 0.9, rate: 0.8 },
  cutBlackgold: { file: 'impactPlate_heavy', group: 'impact', variants: 4, gain: 0.55, rate: 0.78 },

  // —— 落层反馈 ——
  perfectChime: { file: 'confirmation', group: 'interface', variants: 4, start: 1, gain: 0.5 },
  debris: { file: 'impactWood_light', group: 'impact', variants: 4, gain: 0.5 },

  // —— 道具 / 技能 / 经济 ——
  restore: { file: 'confirmation', group: 'interface', variants: 4, start: 1, gain: 0.6, rate: 1.15 },
  coin: { file: 'pluck', group: 'interface', variants: 2, start: 1, gain: 0.5, rate: 1.2 },
  buy: { file: 'confirmation', group: 'interface', variants: 4, start: 1, gain: 0.55 },
  chargeReady: { file: 'forceField', group: 'scifi', variants: 4, gain: 0.45, dur: 0.6 },
  flame: { file: 'thrusterFire', group: 'scifi', variants: 4, gain: 0.32, dur: 0.26 },
  shield: { file: 'forceField', group: 'scifi', variants: 4, gain: 0.5, rate: 1.15, dur: 0.7 },
  revive: { file: 'doorOpen', group: 'scifi', variants: 3, gain: 0.6 },
  skill: { file: 'laserSmall', group: 'scifi', variants: 4, gain: 0.42 },

  // —— 终局 ——
  failBoom: { file: 'lowFrequency_explosion', group: 'scifi', variants: 2, gain: 0.6 },
  star: { file: 'bong', group: 'interface', variants: 1, start: 1, gain: 0.65 },
  win: { file: 'confirmation', group: 'interface', variants: 4, start: 1, gain: 0.6 },

  // —— UI ——
  click: { file: 'click', group: 'interface', variants: 4, start: 1, gain: 0.42 },

  // —— 氛围 / 天气 ——
  creak: { file: 'impactWood_light', group: 'impact', variants: 4, gain: 0.14, rate: 0.55 },
  hail: { file: 'impactGlass_light', group: 'impact', variants: 4, gain: 0.4 },
  smog: { file: 'lowFrequency_explosion', group: 'scifi', variants: 2, gain: 0.26, rate: 0.6, dur: 1.4 },
  thunderCrack: { file: 'explosionCrunch', group: 'scifi', variants: 4, gain: 0.5 },
  thunderBoom: { file: 'lowFrequency_explosion', group: 'scifi', variants: 2, gain: 0.5, rate: 0.75 }
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
export const MATERIAL_SFX = {
  // 泥土：低频闷响 + 松散的沙土噪声，几乎没有余音
  soil: {
    landKey: 'landSoil',
    cutKey: 'cutSoil',
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
    landKey: 'landConcrete',
    cutKey: 'cutConcrete',
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
    landKey: 'landSteel',
    cutKey: 'cutSteel',
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
    landKey: 'landBronze',
    cutKey: 'cutBronze',
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
    landKey: 'landBlackgold',
    cutKey: 'cutBlackgold',
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
