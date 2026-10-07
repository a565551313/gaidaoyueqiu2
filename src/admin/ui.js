import { onBeforeUnmount, ref } from 'vue'

export function useAutoNotice(duration = 3200) {
  const notice = ref('')
  let timer = null

  function showNotice(message) {
    notice.value = String(message || '')
    if (timer) clearTimeout(timer)
    if (notice.value) timer = setTimeout(() => { notice.value = '' }, duration)
  }

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })

  return { notice, showNotice }
}

export function friendlyError(error, context = '操作') {
  const raw = String(error?.message || error || '').trim()
  const lower = raw.toLowerCase()
  if (!raw) return `${context}未完成，请稍后重试。`
  if (/尚未登录管理员|not authenticated|jwt|session expired|invalid login|invalid credentials/.test(lower)) {
    return '管理员登录状态已失效，请重新登录后再试。'
  }
  if (/failed to fetch|network|timeout|timed out|网络/.test(lower)) {
    return '连接暂时不可用，请检查网络后重试。'
  }
  if (/permission denied|not authorized|row-level security|is_admin|权限不足/.test(lower)) {
    return '当前账号没有执行此操作的权限，请联系管理员确认。'
  }
  if (/duplicate key|unique constraint|already exists|已存在/.test(lower)) {
    return '内容重复了，请检查名称或编号后再试。'
  }
  if (/does not exist|could not find the function|could not find the table|schema cache|pgrst|rpc/.test(lower)) {
    return '后台服务配置尚未完成，请联系管理员检查后再试。'
  }
  if (/json|unexpected token|syntaxerror|invalid input syntax/.test(lower)) {
    return '填写内容的格式不正确，请检查后再保存。'
  }
  // 保留已经是完整中文的人话提示；任何夹带字段名或英文代码的内容留在折叠详情中。
  const hasTechnicalToken = /[A-Za-z][A-Za-z0-9_.-]{1,}/.test(raw)
  const hasChinese = /[\u3400-\u9fff]/.test(raw)
  if (hasChinese && !hasTechnicalToken) return raw
  return `${context}未完成，请检查填写内容或连接状态后重试。`
}

const FIELD_LABELS = {
  id: '内部编号', key: '内部编号', codename: '内部代号', name: '名称', shortName: '简称', desc: '简介', bio: '背景介绍',
  price: '售价', ownedByDefault: '初始可用', unlockStars: '解锁所需星星', stars: '星星数量', target: '目标层数', speed: '基础速度',
  chargeNeed: '充能需求', sway: '塔体晃动', weather: '随机天气设置', weatherKind: '章节天气', weatherHint: '天气提示',
  chapterId: '所属章节', chapterNumber: '章节序号', chapterStage: '关卡序号', firstLevelId: '起始关卡', lastLevelId: '结束关卡',
  chapters: '章节列表', levels: '关卡列表', materials: '材质列表', blockTypes: '方块类型', statSpecs: '属性说明', items: '道具列表',
  bag: '背包设置', skills: '技能列表', pets: '伙伴列表', petStarCosts: '伙伴升星费用', ants: '敌人配置', stages: '关卡阶段', stats: '属性数值',
  width: '基础宽度', durability: '基础耐久', weight: '基础重量', hardness: '基础硬度', friction: '表面摩擦', toughness: '结构韧性',
  color: '主色', colors: '配色方案', colorsDark: '暗色配色', accent: '强调色', ground: '地面颜色', tint: '色调', art: '场景外观',
  city: '城市', place: '地点', cityscape: '场景', landmark: '地标', landmarkFeature: '地标场景', motif: '场景风格', theme: '场景主题',
  tagline: '宣传语', intro: '章节简介', hint: '关卡提示', chapterCue: '章节提示', number: '章节编号', stage: '阶段编号',
  intensity: '天气强度', directions: '风向序列', active: '持续时长', calm: '静歇时长', density: '云层密度', strikeChance: '雷击概率',
  rainDir: '降雨方向', coverage: '地面积雪比例', interval: '冰雹间隔', warning: '预警时长', peaks: '攻击波次', hp: '耐久值',
  maxAlive: '同时出现上限', spawnGapSeconds: '生成间隔', speed: '移动速度', role: '伙伴定位', preference: '目标偏好', edge: '效果类型',
  max: '等级上限', min: '最小值', upTo: '适用阶段', unit: '计量单位', label: '属性名称', better: '属性方向', base: '基础数值',
  defaultCapacity: '初始背包格数', slotStep: '每次扩容格数', version: '内容版本', floorWidthMin: '最小楼层宽度', minWidth: '最小宽度',
  maxWidth: '最大宽度', materialMultiplier: '材质系数', nonAntDurabilityScale: '耐久系数', floorDamageWindowSeconds: '伤害统计时长',
  maxFloorBurstDamage: '单次伤害上限', minFloorAttackGapSeconds: '攻击间隔', maxTargetsPerFloor: '单层目标上限', retreatHits: '撤退命中数',
  warningStaggerSeconds: '预警间隔', skill: '技能效果', server: '服务配置', enabled: '是否启用', pinned: '是否置顶',
  description: '用途说明', actionLabel: '按钮文案', actionUrl: '跳转链接', startsAt: '开始展示时间', endsAt: '结束展示时间',
  useLimit: '兑换次数上限', usedCount: '已兑换次数', expiresAt: '过期时间', reward: '奖励内容', coins: '金币奖励', count: '数量',
  createdAt: '创建时间', updatedAt: '更新时间', adminId: '管理员', adminEmail: '管理员邮箱', action: '操作类型', objectType: '对象类型',
  objectId: '对象编号', parameters: '操作摘要', created_at: '创建时间', admin_id: '管理员', admin_email: '管理员邮箱', object_type: '对象类型',
  object_id: '对象编号', totalCount: '记录总数', total_stars: '累计星星', last_seen_at: '最近活跃时间', avg_stars: '平均星级',
  deltaCoins: '金币变化', lastSeenAt: '最近活跃时间', totalCoins: '金币总额', resultCount: '对局记录数', playerCount: '玩家数量',
  results: '对局数量', cleared: '是否通关', score: '得分', at: '波次进度', star: '解锁星级', starsGot: '获得星级',
  sky: '天空渐变色', scenery: '场景配色', far: '远景配色', mid: '中景配色', darkMid: '深色建筑配色',
  mark: '章节标记', peaks: '山峦数量', climbSpeed: '攀爬速度', species: '蚁种组合', durabilityConfig: '楼层耐久规则',
  layers: '耐久分段配置', waveTiers: '蚂蚁波次方案', waves: '生成波次', upTo: '适用关卡上限',
  nonAntDurabilityScale: '非蚂蚁耐久系数', queen: '蚁后配置', worker: '工蚁配置', scout: '斥候蚁配置',
  soldier: '兵蚁配置', personalities: '蚂蚁性格配置', timid: '胆小性格', coward: '懦弱性格',
  impatient: '急躁性格', aggressive: '暴躁性格', prototype: '蚁群行为规则'
}

const WEATHER_LABELS = {
  clear: '晴天', wind: '大风', cloud: '乌云', lightning: '雷电', rain: '暴雨', snow: '降雪', hail: '冰雹'
}
const LOCATION_LABELS = {
  launchField: '郊区发射场', riversideHomes: '滨河住区', oldFerry: '旧渡口', inlandPort: '内河港区',
  crossRiverBridge: '跨江桥区', sciencePark: '科创园区', financeCore: '金融中心', centralTower: '中央高塔区',
  'lanhe-metropolitan-1': '岚河城区一', 'lanhe-metropolitan-2': '岚河城区二', 'lanhe-metropolitan-3': '岚河城区三', 'lanhe-metropolitan-4': '岚河城区四'
}
const CITYSCAPE_CHAPTERS = {
  lanhe: '岚河', yunxiu: '云岫', tingchuan: '汀川', yuting: '雨亭', xuecen: '雪岑', lichuan: '黎川'
}
const ENUM_LABELS = {
  random: '随机', high: '优先较高目标', damaged: '优先受损目标',
  flame: '烈焰效果', calibration: '校准效果', focus: '专注效果', correction: '修正效果',
  river: '河岸风格', wind: '强风风格', cloud: '云层风格', lightning: '雷电风格', rain: '降雨风格', snow: '降雪风格', hail: '冰雹风格',
  worker: '工蚁', scout: '斥候蚁', soldier: '兵蚁', queen: '蚁后',
  true: '是', false: '否', active: '启用', disabled: '停用', inactive: '停用', draft: '草稿', published: '已发布', empty: '未初始化'
}

export function fieldInfo(key) {
  const labels = FIELD_LABELS
  if (/^\d+$/.test(String(key))) return { label: `${key} 星升阶费用`, unit: '金币', hint: `达到 ${key} 星时所需的金币数量。` }
  const label = labels[key] || '其他设置'
  const units = {
    price: '金币', unlockStars: '颗星', target: '层', speed: '层/秒', chargeNeed: '点', sway: '系数',
    active: '秒', calm: '秒', interval: '秒', warning: '秒', spawnGapSeconds: '秒',
    strikeChance: '0–1', intensity: '0–1', density: '0–1', coverage: '0–1', width: '游戏单位', durability: '点',
    weight: '点', hardness: '点', friction: '点', toughness: '点', max: '级', defaultCapacity: '格', slotStep: '格',
    useLimit: '次', usedCount: '次', coins: '金币', climbSpeed: '层/秒', peaks: '个',
    maxAlive: '只', maxTargetsPerFloor: '只', spawnGapSeconds: '秒', warningStaggerSeconds: '秒',
    maxFloorBurstDamage: '点', floorDamageWindowSeconds: '秒', minFloorAttackGapSeconds: '秒',
    materialMultiplier: '倍', nonAntDurabilityScale: '倍', floorWidthMin: '游戏单位', minWidth: '游戏单位',
    maxWidth: '游戏单位', retreatHits: '次', at: '0–1', upTo: '关', star: '星'
  }
  const hints = {
    price: '玩家在商店购买此内容所需的金币。',
    ownedByDefault: '开启后玩家进入游戏即可使用；关闭后按售价解锁。',
    unlockStars: '玩家累计获得指定星星后才能使用。',
    target: '本关通关所需搭建的楼层数。',
    speed: '楼层移动速度，数值越大移动越快。',
    chargeNeed: '触发一次充能效果所需的点数。',
    weather: '当前随机天气玩法已关闭，请勿更改。',
    weatherKind: '章节固定天气主题，需与章节内容保持一致。',
    intensity: '天气效果强度，范围为 0 到 1。',
    active: '天气连续生效的时间。',
    calm: '两段天气之间的安静间隔。',
    strikeChance: '每次判定触发雷击的概率，范围为 0 到 1。',
    coverage: '天气覆盖场景的比例，范围为 0 到 1。',
    directions: '按顺序设置风向，使用正数或负数表示方向。',
    rainDir: '降雨方向，正数向右、负数向左。',
    interval: '两次冰雹落下之间的间隔。',
    warning: '危险天气发生前给玩家的预警时长。',
    id: '由系统识别内容用，通常无需修改。',
    key: '由系统识别内容用，通常无需修改。',
    codename: '仅供系统识别，不影响玩家看到的名称。',
    cityscape: '选择场景背景使用的预设样式。',
    landmarkFeature: '选择本关展示的地标场景。',
    chapterId: '此关所属章节，由章节列表统一管理。',
    firstLevelId: '本章包含的第一关，影响章节解锁范围。',
    lastLevelId: '本章包含的最后一关，影响章节解锁范围。',
    defaultCapacity: '新玩家初始拥有的背包格数。',
    slotStep: '每次扩容增加的背包格数。',
    sky: '场景天空使用的渐变配色。',
    scenery: '控制远景、中景和建筑的场景配色。',
    far: '远处山体与天际线的配色。',
    mid: '中距离建筑群的配色。',
    darkMid: '较暗一层建筑群的配色。',
    mark: '用于章节场景装饰的单字标记。',
    peaks: '场景轮廓中山峦的数量。',
    species: '此波次会出现的蚁种，可组合多种。',
    waveTiers: '按关卡进度选择蚁群波次方案。',
    waves: '一组蚂蚁出现时机及蚁种组合。',
    at: '蚂蚁波次在本关进度中的触发位置，范围为 0 到 1。',
    upTo: '此波次方案适用到第几关。',
    climbSpeed: '蚂蚁向上攀爬的速度。',
    preference: '蚂蚁选择攻击目标时的优先规则。',
    durabilityConfig: '控制楼层基础耐久的分段规则。',
    layers: '按楼层宽度划分基础耐久区间。',
    materialMultiplier: '建筑材质对蚂蚁耐久的影响系数。',
    nonAntDurabilityScale: '非蚂蚁因素计算楼层耐久时使用的系数。',
    maxAlive: '同一时刻允许存在的蚂蚁上限。',
    maxTargetsPerFloor: '同一楼层允许同时攻击的蚂蚁上限。',
    maxFloorBurstDamage: '单次攻击窗口内造成的伤害上限。',
    floorDamageWindowSeconds: '计算单次攻击上限的时间窗口。',
    minFloorAttackGapSeconds: '同一楼层两次受击之间的最短间隔。',
    warningStaggerSeconds: '多只蚂蚁的攻击预警之间的间隔。',
    retreatHits: '受到多少次攻击后触发撤退。',
    stars: '此项记录玩家通关后获得的星星数量。'
  }
  return { label, unit: units[key] || '', hint: hints[key] || '此项会影响游戏内容，请按当前玩法配置谨慎调整。' }
}

export function enumLabel(value, key = '') {
  const raw = String(value ?? '')
  if (key === 'weatherKind' || key === 'theme') return WEATHER_LABELS[raw] || '其他天气'
  if (key === 'motif') return ENUM_LABELS[raw] || '其他场景风格'
  if (key === 'cityscape' || key === 'landmark' || key === 'landmarkFeature') {
    if (LOCATION_LABELS[raw]) return LOCATION_LABELS[raw]
    const match = raw.match(/^(lanhe|yunxiu|tingchuan|yuting|xuecen|lichuan)-metropolitan-(\d+)$/)
    return match ? `${CITYSCAPE_CHAPTERS[match[1]]} · 第 ${match[2]} 关` : '内置场景'
  }
  if (key === 'better') return raw === 'high' ? '越高越好' : raw === 'low' ? '越低越好' : '按玩法设定'
  if (key === 'role') return raw || '其他定位'
  return ENUM_LABELS[raw] || raw
}

const TECH_FIELD_REPLACEMENTS = [
  ['weatherKind', '章节天气'], ['chapterNumber', '章节序号'], ['chapterStage', '关卡序号'], ['chapterId', '所属章节'],
  ['firstLevelId', '起始关卡'], ['lastLevelId', '结束关卡'], ['landmarkFeature', '地标场景'], ['weatherHint', '天气提示'],
  ['chargeNeed', '充能需求'], ['target', '目标层数'], ['speed', '基础速度'], ['sway', '塔体晃动'],
  ['stages', '关卡阶段'], ['chapters', '章节列表'], ['levels', '关卡列表'], ['weather', '天气设置'], ['id', '编号'],
  ['shortName', '简称'], ['firstLevelId', '起始关卡'], ['lastLevelId', '结束关卡']
]
const WEATHER_CODE_RE = /(?:clear|wind|cloud|lightning|rain|snow|hail)/g

export function friendlyValidationMessage(message) {
  let text = String(message || '')
  for (const [raw, label] of TECH_FIELD_REPLACEMENTS) text = text.replace(new RegExp(`\\b${raw}\\b`, 'g'), label)
  text = text.replace(WEATHER_CODE_RE, (value) => WEATHER_LABELS[value] || '其他天气')
  if (/[A-Za-z][A-Za-z0-9_.-]{1,}/.test(text)) return '此项配置不符合要求，请展开技术详情查看具体原因。'
  return text || '此项配置不符合要求，请检查后重试。'
}
