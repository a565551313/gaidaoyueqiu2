// 第一章：澄河都会圈。原有八关 ID、关卡值与旧存档映射保持不变。
// 新章节继续使用全局连续 ID，便于旧存档、星级和顺序解锁无损扩展。
const TARGETS = Object.freeze([30, 40, 50, 60, 70, 80, 90, 100])
const BASE_LEVEL = Object.freeze({ speed: 150, chargeNeed: 8, weather: 0 })

export const CHAPTER = Object.freeze({
  id: 'chenghe-metropolitan',
  number: 1,
  name: '澄河都会圈'
})

const firstChapterStages = [
  { city: '晴原市', place: '郊区发射场', cityscape: 'launchField' },
  { city: '柳汀市', place: '滨河住区', cityscape: 'riversideHomes' },
  { city: '渡川市', place: '旧渡口', cityscape: 'oldFerry' },
  { city: '澄浦市', place: '内河港区', cityscape: 'inlandPort' },
  { city: '新桥市', place: '跨江新区', cityscape: 'crossRiverBridge' },
  { city: '青梧市', place: '科创园区', cityscape: 'sciencePark' },
  { city: '平川市', place: '金融中心', cityscape: 'financeCore' },
  { city: '中澜市', place: '中央高塔区', cityscape: 'centralTower' }
]

const chapterSpecs = [
  {
    id: CHAPTER.id, number: 1, name: CHAPTER.name, shortName: '澄河', theme: 'clear', weatherKind: 'clear',
    tagline: '晴日都会 · 静塔筑高', intro: '从河岸发射场一路走向中央高塔，熟悉独立关卡与稳定叠塔。',
    art: { sky: ['#1b5f80', '#b9d9ce'], accent: '#50c6d3', ground: '#326bc0', motif: 'river', mark: '澄' },
    stages: firstChapterStages.map((stage, index) => ({ ...stage, target: TARGETS[index], hint: '晴天 · 静塔 · 固定速度' }))
  },
  {
    id: 'lanhe-metropolitan', number: 2, name: '岚河都会圈', shortName: '岚河', theme: 'wind', weatherKind: 'wind',
    tagline: '侧风航道 · 看旗择时', intro: '从河堤、渡口与港区，沿高架进入商务楼风廊和中央高塔。',
    art: { sky: ['#4d9bb8', '#e1d7a9'], accent: '#a1e8d6', ground: '#418e9e', motif: 'wind', mark: '岚' },
    scenery: { sky: [[78, 155, 186], [211, 224, 195]], far: ['#7dabb2', '#314b5c'], mid: ['#83aeb3', '#9dbbb6', '#779da7'], darkMid: ['#294d59', '#355965', '#263f51'], accent: '#8bd3ce', peaks: 2 },
    stages: [
      { city: '堤原市', place: '河堤', landmark: 'launchField', hint: '轻风单向；旗面先偏转，等风势后再落块。', intensity: 0.24, directions: [1], active: 4.2, calm: 7.2 },
      { city: '渡帆市', place: '老渡口', landmark: 'oldFerry', hint: '轻风同向；对照渡船旗与岸边风向袋，静风可继续搭建。', intensity: 0.28, directions: [1], active: 4.5, calm: 6.8 },
      { city: '桥川市', place: '跨江桥', landmark: 'crossRiverBridge', hint: '轻至中风；阵风起伏后回到静风，方向保持不变。', intensity: 0.36, directions: [1], active: 4.8, calm: 6.2 },
      { city: '港汊市', place: '港区', landmark: 'inlandPort', hint: '中等阵风；观察旗面强弱变化，并利用静风窗口。', intensity: 0.42, directions: [1], active: 5, calm: 5.8 },
      { city: '凌高市', place: '跨河高架', landmark: 'crossRiverBridge', hint: '风向变化前会先预告；预告期间不推方块。', intensity: 0.46, directions: [1, -1], active: 4.6, calm: 5.4 },
      { city: '廊风市', place: '商务楼风廊', landmark: 'sciencePark', hint: '预告后换向；塔体只轻微摆动，静风时可确认塔顶。', intensity: 0.5, directions: [1, -1], active: 4.6, calm: 5.2 },
      { city: '双帆市', place: '双子塔', landmark: 'financeCore', hint: '交替风向均有预告；轻摆与强阵风错开，并保留静风。', intensity: 0.55, directions: [-1, 1], active: 4.4, calm: 5 },
      { city: '岚心市', place: '中央高塔区', landmark: 'centralTower', hint: '复杂换向仍逐次预告；风势受控，静风窗口持续可辨。', intensity: 0.58, directions: [1, -1, 1], active: 4.2, calm: 5 }
    ]
  },
  {
    id: 'yunxiu-metropolitan', number: 3, name: '云岫都会圈', shortName: '云岫', theme: 'cloud', weatherKind: 'cloud',
    tagline: '云隙行进 · 轮廓常明', intro: '低云由远山靠近城廓，越过高层风廊后穿出云层。',
    art: { sky: ['#586f91', '#b9c4c9'], accent: '#b5c9db', ground: '#637d9a', motif: 'cloud', mark: '云' },
    scenery: { sky: [[104, 128, 157], [195, 207, 205]], far: ['#8797aa', '#3b4a5d'], mid: ['#8999aa', '#9ca9b4', '#76899d'], darkMid: ['#34485a', '#3c5062', '#2d4053'], accent: '#b5c6d2', peaks: 3 },
    stages: [
      { city: '北岚市', place: '郊外观测场', landmark: 'launchField', hint: '云墙在远山后预告；只遮淡远景，塔顶和方块清晰。', density: 0.16, active: 4.2, calm: 5.8 },
      { city: '柳湾市', place: '滨河老街', landmark: 'riversideHomes', hint: '薄云先掠远岸；观察云来、经过与散开的完整节奏。', density: 0.2, active: 4.5, calm: 5.6 },
      { city: '渡川市', place: '跨江桥', landmark: 'crossRiverBridge', hint: '云带横向经过桥后；方向与移动由同一云层状态驱动。', density: 0.24, active: 4.8, calm: 5.4 },
      { city: '沧港市', place: '内河港区', landmark: 'inlandPort', hint: '云遮淡吊机与远船；云带之间有开阔观察窗口。', density: 0.28, active: 5, calm: 5.2 },
      { city: '远桥市', place: '高架新区', landmark: 'crossRiverBridge', hint: '薄云可扫过方块填充；外轮廓始终清楚。', density: 0.32, active: 5.2, calm: 5 },
      { city: '青穹市', place: '科创园区', landmark: 'sciencePark', hint: '云带变宽、建筑时隐时现；云隙留出可见窗口。', density: 0.36, active: 5.4, calm: 5 },
      { city: '霄台市', place: '双子塔', landmark: 'financeCore', hint: '云从塔间穿过；方块与塔顶不会同时被完全遮住。', density: 0.4, active: 5.6, calm: 4.8 },
      { city: '云京市', place: '中央高塔区', landmark: 'centralTower', hint: '厚云分段通过；方块边缘清楚，云隙持续可读。', density: 0.44, active: 5.8, calm: 4.8 }
    ]
  },
  {
    id: 'tingchuan-metropolitan', number: 4, name: '霆川都会圈', shortName: '霆川', theme: 'lightning', weatherKind: 'lightning',
    tagline: '远雷迫近 · 偶有落雷', intro: '从气象台、水库与高架进入都会核心，电光预警之后偶尔真的会劈中塔体。',
    art: { sky: ['#354767', '#a5b4bd'], accent: '#e9d788', ground: '#586e93', motif: 'lightning', mark: '霆' },
    scenery: { sky: [[75, 96, 132], [167, 178, 184]], far: ['#78869c', '#303b50'], mid: ['#7e8da2', '#929ead', '#6d7c91'], darkMid: ['#2c3d55', '#354760', '#28374c'], accent: '#d7cb95', peaks: 1 },
    stages: [
      { city: '砺望市', place: '郊外气象观测台', landmark: 'launchField', hint: '远处云层泛亮后听见柔和远雷；少数情况下会劈中塔顶，削掉若干层。', intensity: 0.18, active: 2.2, calm: 5.8, strikeChance: 0.2 },
      { city: '磐汊市', place: '水库堤坝', landmark: 'riversideHomes', hint: '电光预警后留意闪烁节拍；命中塔体会削掉顶部的层数，材质硬度能减少损失。', intensity: 0.2, active: 2.2, calm: 5.6, strikeChance: 0.24 },
      { city: '漕临市', place: '跨江高架', landmark: 'crossRiverBridge', hint: '分叉远光先出现，再是轻柔滚雷；闪烁转急说明这次真的会劈下来。', intensity: 0.24, active: 2.4, calm: 5.4, strikeChance: 0.28 },
      { city: '鸣铎市', place: '变电站外沿', landmark: 'inlandPort', hint: '电光不只是沿远景掠过，命中塔体的概率在提高，留意预警窗口。', intensity: 0.27, active: 2.4, calm: 5.2, strikeChance: 0.32 },
      { city: '泊鹭市', place: '河岸通信塔', landmark: 'sciencePark', hint: '电光节拍更密，命中后塔会明显变矮；尽量留出高度冗余。', intensity: 0.3, active: 2.5, calm: 5, strikeChance: 0.36 },
      { city: '映厦市', place: '高层商务区', landmark: 'financeCore', hint: '局部天光之间雷击更重，一次命中可能削掉不止一层。', intensity: 0.33, active: 2.6, calm: 4.8, strikeChance: 0.4 },
      { city: '琅珩市', place: '双子塔', landmark: 'centralTower', hint: '外围云层频繁泛光，真正劈塔的概率也更高；提前做好高度冗余。', intensity: 0.36, active: 2.7, calm: 4.8, strikeChance: 0.44 },
      { city: '瑶晷市', place: '中央电视塔', landmark: 'centralTower', hint: '终章雷击最密集；最后一层落定并锁定结果后才会有一次纯表演的天际线雷光。', intensity: 0.4, active: 2.8, calm: 4.8, strikeChance: 0.48 }
    ]
  },
  {
    id: 'yuting-metropolitan', number: 5, name: '雨汀都会圈', shortName: '雨汀', theme: 'rain', weatherKind: 'rain',
    tagline: '雨向滑移 · 只在落块', intro: '水网城市由郊堤深入港区与商务核心，方向预告和雨歇帮助预判落点。',
    art: { sky: ['#456c91', '#aebec8'], accent: '#7bc7e5', ground: '#3f7194', motif: 'rain', mark: '雨' },
    scenery: { sky: [[78, 119, 157], [176, 198, 207]], far: ['#809aaf', '#35485d'], mid: ['#849eb2', '#9aaeb9', '#718ca1'], darkMid: ['#2d475d', '#37546a', '#293e53'], accent: '#81c1d8', peaks: 1 },
    stages: [
      { city: '芦汀市', place: '北郊护河堤', landmark: 'launchField', hint: '细雨预告向左滑移；点击后方块落下时才受影响。', rainDir: -1, intensity: 0.24, active: 4, calm: 6 },
      { city: '桥埠市', place: '滨河石桥老街', landmark: 'oldFerry', hint: '雨线与檐水同向；细雨后有完整雨歇。', rainDir: -0.88, intensity: 0.27, active: 4.2, calm: 5.8 },
      { city: '渡汐市', place: '南渡船码头', landmark: 'riversideHomes', hint: '雨向仍偏左但逐渐接近竖直；每段雨前重新预告。', rainDir: -0.72, intensity: 0.32, active: 4.4, calm: 5.6 },
      { city: '巷沥市', place: '旧城排水巷', landmark: 'oldFerry', hint: '中雨方向固定；只读主雨线，不跟随背景沟渠。', rainDir: -0.55, intensity: 0.37, active: 4.6, calm: 5.4 },
      { city: '澜栈市', place: '内河港区', landmark: 'inlandPort', hint: '中雨转为轻微右滑；雨势增强不改变移动速度。', rainDir: 0.28, intensity: 0.42, active: 4.8, calm: 5.2 },
      { city: '架汐市', place: '高架新区', landmark: 'crossRiverBridge', hint: '中雨向强雨过渡；雨向固定，雨歇会清楚退出玩法层。', rainDir: 0.52, intensity: 0.48, active: 5, calm: 5 },
      { city: '镜汐市', place: '玻璃商务区', landmark: 'financeCore', hint: '强雨前给足预告；反光不代替雨向信号。', rainDir: 0.76, intensity: 0.54, active: 5.2, calm: 4.8 },
      { city: '中望市', place: '中央观景塔', landmark: 'centralTower', hint: '本关雨向固定；先预告，稳定强雨后安排雨歇再继续。', rainDir: 0.9, intensity: 0.58, active: 5.2, calm: 4.8 }
    ]
  },
  {
    id: 'xuecen-metropolitan', number: 6, name: '雪岑都会圈', shortName: '雪岑', theme: 'snow', weatherKind: 'snow',
    tagline: '冬日覆盖 · 纯视觉雪景', intro: '从山谷雪原进入松林住区、桥巷、港区与中央观景塔。',
    art: { sky: ['#6c8ba6', '#d1d8d5'], accent: '#d6edf0', ground: '#718b9a', motif: 'snow', mark: '雪' },
    scenery: { sky: [[100, 132, 155], [204, 218, 216]], far: ['#91a7b5', '#44596a'], mid: ['#9aabb6', '#b2bec1', '#879ca9'], darkMid: ['#40586a', '#4a6273', '#374d60'], accent: '#d9edf0', peaks: 4 },
    stages: [
      { city: '岑松市', place: '郊外雪原', landmark: 'launchField', hint: '地表薄雪与远山雪顶；飘雪轻疏，不影响操作。', coverage: 0.14 },
      { city: '白栎市', place: '松林住区', landmark: 'riversideHomes', hint: '松枝、住宅屋顶和道路边缘有轻薄积雪。', coverage: 0.22 },
      { city: '冰渡市', place: '老城石桥', landmark: 'oldFerry', hint: '桥沿与屋脊有雪边；河面保持开放，不结冰。', coverage: 0.3 },
      { city: '霜井市', place: '旧城坡巷', landmark: 'oldFerry', hint: '坡道、台阶外缘和屋檐有薄雪，巷道明暗仍可辨。', coverage: 0.38 },
      { city: '凇港市', place: '内河港区', landmark: 'inlandPort', hint: '仓库屋面与码头迎雪面可见；港池保持开放水面。', coverage: 0.48 },
      { city: '寒峤市', place: '高架新区', landmark: 'crossRiverBridge', hint: '高架顶沿有雪边；塔体周围留出干净轮廓区。', coverage: 0.58 },
      { city: '银晖市', place: '商务区', landmark: 'financeCore', hint: '楼顶积雪更完整；块体原色、方块边缘和落点优先。', coverage: 0.68 },
      { city: '雪穹市', place: '中央观景塔', landmark: 'centralTower', hint: '都会圈冬景最完整；薄雪与疏雪花不形成白幕。', coverage: 0.78 }
    ]
  },
  {
    id: 'lichuan-metropolitan', number: 7, name: '砺川都会圈', shortName: '砺川', theme: 'hail', weatherKind: 'hail',
    tagline: '冰雹预警 · 宽度有下限', intro: '矿镇、闸区、货场与工业核心的冰雹波次均有预警和晴歇。',
    art: { sky: ['#536777', '#b7b7a7'], accent: '#c8dde0', ground: '#637c83', motif: 'hail', mark: '砺' },
    scenery: { sky: [[91, 113, 129], [185, 188, 173]], far: ['#89979a', '#3f4c51'], mid: ['#89999b', '#a2aaa2', '#788b91'], darkMid: ['#394d58', '#455b65', '#344650'], accent: '#bfd3d2', peaks: 2 },
    stages: [
      { city: '砾原市', place: '北坡观测站', landmark: 'launchField', hint: '冰雹预警：落定后只削当前顶层宽度，设有安全下限。', intensity: 0.26, active: 3.6, calm: 7.2, interval: 1.8 },
      { city: '岩汀市', place: '河谷矿镇', landmark: 'inlandPort', hint: '重复波次之间有晴歇；晴歇不恢复已损失宽度。', intensity: 0.29, active: 3.8, calm: 6.8, interval: 1.75 },
      { city: '泷闸市', place: '水工闸区', landmark: 'crossRiverBridge', hint: '短组冰雹之后有明显恢复窗口；不影响下层或得分。', intensity: 0.33, active: 4, calm: 6.2, interval: 1.7 },
      { city: '钢浦市', place: '铁路货场', landmark: 'inlandPort', hint: '按预警—命中—晴歇的节拍操作；每次预警完整可见。', intensity: 0.37, active: 4.1, calm: 5.8, interval: 1.65 },
      { city: '熔河市', place: '钢铁厂区', landmark: 'centralTower', hint: '成组冰雹只作用于当前顶层宽度，不扣耐久、不坍塌。', intensity: 0.41, active: 4.2, calm: 5.4, interval: 1.6 },
      { city: '铸岭市', place: '高架工业带', landmark: 'crossRiverBridge', hint: '波次更紧凑但仍有晴歇；基础落块速度不变。', intensity: 0.45, active: 4.4, calm: 5.1, interval: 1.55 },
      { city: '砺峡市', place: '双塔能源园', landmark: 'financeCore', hint: '强度提高来自波次节奏；落块期间命中会暂停并重新预警。', intensity: 0.49, active: 4.5, calm: 4.9, interval: 1.5 },
      { city: '砺川市', place: '中央炉塔', landmark: 'centralTower', hint: '终章仍分段预警与晴歇；冰雹不删层、不倒塔、不扣分。', intensity: 0.53, active: 4.6, calm: 4.8, interval: 1.45 }
    ]
  }
]

export const CHAPTERS = Object.freeze(chapterSpecs.map((chapter, index) => Object.freeze({
  ...chapter,
  number: index + 1,
  firstLevelId: index * 8 + 1,
  lastLevelId: index * 8 + 8,
  stages: Object.freeze(chapter.stages.map((stage, stageIndex) => Object.freeze({
    ...stage,
    stage: stageIndex + 1,
    target: TARGETS[stageIndex]
  })))
})))

const firstChapter = CHAPTERS[0]
export const LEVELS = [
  { id: 1, chapterId: CHAPTER.id, name: '郊区发射场', city: '晴原市', place: '郊区发射场', cityscape: 'launchField', target: 30, speed: 150, chargeNeed: 8, sway: 0, weather: 0 },
  { id: 2, chapterId: CHAPTER.id, name: '滨河住区', city: '柳汀市', place: '滨河住区', cityscape: 'riversideHomes', target: 40, speed: 150, chargeNeed: 8, sway: 0, weather: 0 },
  { id: 3, chapterId: CHAPTER.id, name: '旧渡口', city: '渡川市', place: '旧渡口', cityscape: 'oldFerry', target: 50, speed: 150, chargeNeed: 8, sway: 0, weather: 0 },
  { id: 4, chapterId: CHAPTER.id, name: '内河港区', city: '澄浦市', place: '内河港区', cityscape: 'inlandPort', target: 60, speed: 150, chargeNeed: 8, sway: 0, weather: 0 },
  { id: 5, chapterId: CHAPTER.id, name: '跨江新区', city: '新桥市', place: '跨江新区', cityscape: 'crossRiverBridge', target: 70, speed: 150, chargeNeed: 8, sway: 0, weather: 0 },
  { id: 6, chapterId: CHAPTER.id, name: '科创园区', city: '青梧市', place: '科创园区', cityscape: 'sciencePark', target: 80, speed: 150, chargeNeed: 8, sway: 0, weather: 0 },
  { id: 7, chapterId: CHAPTER.id, name: '金融中心', city: '平川市', place: '金融中心', cityscape: 'financeCore', target: 90, speed: 150, chargeNeed: 8, sway: 0, weather: 0 },
  { id: 8, chapterId: CHAPTER.id, name: '中央高塔区', city: '中澜市', place: '中央高塔区', cityscape: 'centralTower', target: 100, speed: 150, chargeNeed: 8, sway: 0, weather: 0 }
]

for (const chapter of CHAPTERS.slice(1)) {
  for (const stage of chapter.stages) {
    const id = chapter.firstLevelId + stage.stage - 1
    const sway = chapter.weatherKind === 'wind' && stage.stage >= 6
      ? [0, 0, 0, 0, 0, 0.1, 0.14, 0.16][stage.stage - 1]
      : 0
    LEVELS.push({
      ...BASE_LEVEL,
      id,
      chapterId: chapter.id,
      chapterNumber: chapter.number,
      chapterStage: stage.stage,
      name: stage.place,
      city: stage.city,
      place: stage.place,
      cityscape: `${chapter.id}-${stage.stage}`,
      landmarkFeature: stage.landmark,
      target: stage.target,
      sway,
      weatherKind: chapter.weatherKind,
      weatherHint: stage.hint,
      chapterCue: stage.hint
    })
  }
}

export function getLevel(id) {
  return LEVELS.find((level) => level.id === Number(id)) || LEVELS[0]
}

export function getChapter(chapterId) {
  return CHAPTERS.find((chapter) => chapter.id === chapterId) || CHAPTERS[0]
}

export function getChapterForLevel(levelOrId) {
  const level = typeof levelOrId === 'object' ? levelOrId : getLevel(levelOrId)
  return getChapter(level.chapterId)
}

export function getChapterLevels(chapterId) {
  return LEVELS.filter((level) => level.chapterId === chapterId)
}

export const TOTAL_STARS = LEVELS.length * 3
