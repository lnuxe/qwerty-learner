import type { ValBinding, ValEventKind, ValTriggerConfig, ValorantConfig } from './types'
import atomForConfig from '@/store/atomForConfig'
import { atom } from 'jotai'

export const VAL_ASSET_PREFIX = '/val/'
export const DEFAULT_BACKGROUND = VAL_ASSET_PREFIX + 'bg/valorant-bg.jpg'

export const ALL_VAL_EVENTS: ValEventKind[] = ['kill', 'ace', 'finalKill', 'agentTaunt', 'agentPraise', 'agentStart', 'agentFinish']

export const EVENT_LABELS: Record<ValEventKind, { nameZh: string; desc: string }> = {
  kill: { nameZh: '连击击杀音', desc: '连对达到阈值后按节奏播放的枪皮击杀音效' },
  ace: { nameZh: 'ACE 爆发音', desc: '连对冲到高位时的一次性重音（类似 ACE 播报）' },
  finalKill: { nameZh: '最终击杀', desc: '本章结束/最后一个词时的收尾击杀音效' },
  agentTaunt: { nameZh: '特工嘲讽', desc: '连续打错时特工开口嘲讽你' },
  agentPraise: { nameZh: '特工夸奖', desc: '连对时特工夸你一句' },
  agentStart: { nameZh: '开场台词', desc: '开始练习时的特工登场台词' },
  agentFinish: { nameZh: '收尾台词', desc: '练完一章的特工收场台词' },
}

export const defaultTriggers: ValTriggerConfig = {
  // 词级：连对 3 个干净词开始出击杀音，之后每 3 个词一次
  streakStartAt: 3,
  killEvery: 3,
  killCooldownMs: 700,
  aceAt: 12,
  // 字符级：连错 5 个键就有人开口嘲讽，连错 10 个切暴怒语气
  errorTriggerAt: 5,
  errorRageAt: 10,
  errorCooldownMs: 4500,
  praiseChance: 0.25,
  agentOnStart: true,
  agentOnFinish: true,
  finalKillOnFinish: true,
  killOnSingleCorrect: false,
}

export const emptyBinding: ValBinding = { mode: 'fixed' }

/** 背景观感版本：改动默认观感时 +1，老配置会被迁移一次 */
const BG_VERSION = 7

export const defaultValorantConfig: ValorantConfig = {
  isOpen: true,
  volume: 0.8,
  skinId: 'reaver',
  agentId: 'jett',
  enabled: {
    kill: true,
    ace: true,
    finalKill: true,
    agentTaunt: true,
    agentPraise: true,
    agentStart: true,
    agentFinish: true,
  },
  triggers: defaultTriggers,
  bindings: {},
  background: {
    enabled: true,
    imageUrl: DEFAULT_BACKGROUND,
    // 壁纸默认虚化 + 薄纱：原图会跟正文抢注意力，且深色正文压不住照片
    // 壁纸清晰可见：靠「半透明壁纸(浓度) + 极轻柔化」保持画面感，靠文字光晕保证可读性
    blur: 6,
    dim: 0.08,
    opacity: 0.55,
    frostedPanel: true,
    bgv: BG_VERSION,
  },
  showCombo: true,
}

/**
 * 一次性迁移：老版本的持久化配置里 blur=0 / dim=0.28，直接套在原图上很难看。
 * 这里把背景观感升级到当前默认（只动背景，用户其它设置保持不动）。
 */
function migrateBackgroundOnce() {
  if (typeof localStorage === 'undefined') return
  const KEY = 'valorantConfig'
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<ValorantConfig> & Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return
    const bg = (parsed.background ?? {}) as Partial<ValorantConfig['background']>
    if (bg.bgv === BG_VERSION) return
    const next = {
      ...parsed,
      background: {
        ...defaultValorantConfig.background,
        ...bg,
        // 只提升“没被刻意调过”的模糊；用户明确设过更大值就保留
        blur: Math.max(bg.blur ?? 0, defaultValorantConfig.background.blur),
        dim: Math.max(bg.dim ?? 0, defaultValorantConfig.background.dim),
        bgv: BG_VERSION,
      },
    }
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // 配置损坏就忽略，atomForConfig 自己会回退默认值
  }
}

migrateBackgroundOnce()

/** 持久化配置：localStorage key = valorantConfig */
export const valorantConfigAtom = atomForConfig('valorantConfig', defaultValorantConfig)

/** 运行时状态（连击数、最近一次播放的资源），只用于 UI 反馈，不持久化 */
export const valComboAtom = atom(0)
export const valLastPlayedAtom = atom<{ kind: ValEventKind; name: string; text?: string } | null>(null)
