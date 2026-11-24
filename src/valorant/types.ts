// 无畏契约（Valorant）联动音效系统 —— 共享类型契约
// 该文件被 audioEngine / triggers / settings UI / catalog 共同引用，改动前先对齐。

/** 事件类别：一次打错、连对里程碑、整章结束等 */
export type ValEventKind =
  | 'kill' // 连对里程碑的击杀音效（枪皮击杀音）
  | 'ace' // 满连击/ACE 级别的大音效
  | 'finalKill' // 本章最后一个词 / 结束时的最终击杀音效
  | 'agentTaunt' // 连续出错时的特工嘲讽/吐槽语录
  | 'agentPraise' // 连对时的特工夸奖语录
  | 'agentStart' // 开始练习
  | 'agentFinish' // 结束练习

/** 音效来源：内置（public/val）或用户上传（IndexedDB） */
export type ValSoundSource = 'builtin' | 'custom'

export type ValSoundAsset = {
  id: string
  /** 展示用中文名 */
  name: string
  /** 内置：/val/... 路径；自定义：idb:<id> */
  file: string
  source: ValSoundSource
  kind: ValEventKind
  /** 归属枪皮 id（kill/ace/finalKill 用） */
  skinId?: string
  /** 归属特工 id（agent* 用） */
  agentId?: string
  /** 语录原文（特工语音用） */
  text?: string
}

/** 枪皮（枪械皮肤系列） */
export type ValSkinEntry = {
  id: string
  name: string
  nameZh: string
  /** 皮肤等级，用于排序与筛选 */
  tier: 'exclusive' | 'ultra' | 'premium' | 'deluxe' | 'select' | 'standard'
  /** 击杀音效文件（内置占位音，可被用户替换） */
  killFile: string
  /** 可选的高连击/ACE 音效 */
  aceFile?: string
  /** 一句话描述音色特点 */
  desc: string
}

export type ValAgentLineMood = 'praise' | 'taunt' | 'start' | 'finish' | 'ace'

export type ValAgentLine = {
  id: string
  /** 中文小标题，如「连击夸奖」 */
  nameZh: string
  /** 台词正文（默认中文，贴合国服配音语气） */
  text: string
  /** 英文原文，仅作展示参考 */
  textOriginal?: string
  mood: ValAgentLineMood
  file: string
}

export type ValAgentEntry = {
  id: string
  name: string
  nameZh: string
  /** 定位：决斗/控场/先锋/哨卫 */
  role: 'duelist' | 'controller' | 'initiator' | 'sentinel'
  /** 主题色，UI 用 */
  color: string
  lines: ValAgentLine[]
}

/** 触发规则配置 */
export type ValTriggerConfig = {
  /** 连对多少个词后开始出击杀音 */
  streakStartAt: number
  /** 之后每连对多少个词出一次击杀音 */
  killEvery: number
  /** 击杀音最短间隔（毫秒），防止刷屏 */
  killCooldownMs: number
  /** 连对达到该值播放 ACE 音效 */
  aceAt: number
  /** 连续打错多少个【字符】触发特工嘲讽（仓库的 REPORT_WRONG_WORD 是逐字符触发的） */
  errorTriggerAt: number
  /** 连错字符数达到该值升级为「暴怒」语气（gain 更大） */
  errorRageAt: number
  /** 嘲讽最短间隔（毫秒） */
  errorCooldownMs: number
  /** 连对时按概率播特工夸奖（0-1） */
  praiseChance: number
  /** 开始/结束是否播特工台词 */
  agentOnStart: boolean
  agentOnFinish: boolean
  /** 结束是否播最终击杀音效 */
  finalKillOnFinish: boolean
  /** 单个词就正确时也允许触发击杀音 */
  killOnSingleCorrect: boolean
}

/** 选音策略 */
export type ValPickMode = 'fixed' | 'random' | 'cycle'

export type ValBinding = {
  mode: ValPickMode
  /** fixed 模式下生效的 asset id */
  fixedId?: string
  /** 参与 random/cycle 的 asset id 列表；为空表示用当前皮肤/特工的默认资源 */
  pool?: string[]
}

export type ValorantConfig = {
  isOpen: boolean
  /** 主音量 0-1 */
  volume: number
  /** 当前枪皮 id */
  skinId: string
  /** 当前特工 id */
  agentId: string
  /** 各类事件是否启用 */
  enabled: Record<ValEventKind, boolean>
  triggers: ValTriggerConfig
  bindings: Partial<Record<ValEventKind, ValBinding>>
  /** 背景图设置 */
  background: {
    enabled: boolean
    /** 内置图片路径 或 idb:<id>；空则用内置默认图 */
    imageUrl: string
    /** 0-24px 模糊 */
    blur: number
    /** 0-0.9 暗化遮罩 */
    dim: number
    /** 背景层不透明度 0-1 */
    opacity: number
    /** 是否在内容卡片后面加毛玻璃底，保证字可读 */
    /** 柔光衬底：只在文字周围铺一层无边框光晕，不是白卡片 */
    frostedPanel: boolean
    /** 背景观感版本，用于把老的持久化配置迁移到新默认值 */
    bgv?: number
  }
  /** 连对时屏幕上的连击计数器 */
  showCombo: boolean
}

/**
 * 传给触发引擎的极简打字快照。
 * 注意：correctCount / wrongCount 是**字符级**计数（每次按键判定 +1），
 * index 是**词级**进度（换词时 +1）。连对/连错判定要分别用这两组数据。
 */
export type ValTypingSnapshot = {
  index: number
  /** 字符级：累计打对的键数 */
  correctCount: number
  /** 字符级：累计打错的键数 */
  wrongCount: number
  wordCount: number
  isTyping: boolean
  isFinished: boolean
}

/** 引擎一次要播的东西 */
export type ValPlayInstruction = {
  kind: ValEventKind
  /** 已解析的可播放路径（/val/... 或 blob:） */
  src: string
  assetId?: string
  text?: string
  /** 相对音量系数，ACE/最终击杀可以更响 */
  gain?: number
}
