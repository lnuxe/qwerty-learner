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
    blur: 0,
    dim: 0.28,
    opacity: 1,
    frostedPanel: true,
  },
  showCombo: true,
}

/** 持久化配置：localStorage key = valorantConfig */
export const valorantConfigAtom = atomForConfig('valorantConfig', defaultValorantConfig)

/** 运行时状态（连击数、最近一次播放的资源），只用于 UI 反馈，不持久化 */
export const valComboAtom = atom(0)
export const valLastPlayedAtom = atom<{ kind: ValEventKind; name: string; text?: string } | null>(null)
