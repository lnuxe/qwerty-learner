import raw from './catalog.data.json'
import type { ValAgentEntry, ValAgentLine, ValEventKind, ValSkinEntry, ValSoundAsset } from './types'

/** 内置素材根路径（base=/ 部署） */
export const VAL_ASSET_BASE = '/val/'

const rawSkins = raw.skins as Array<{ id: string; name: string; nameZh: string; tier: string; desc: string; ace: boolean }>
const rawAgents = raw.agents as Array<{
  id: string
  name: string
  nameZh: string
  role: string
  color: string
  lines: Record<'praise' | 'taunt' | 'start' | 'finish', string>
}>

type SkinTier = ValSkinEntry['tier']

export const VAL_SKINS: ValSkinEntry[] = rawSkins.map((s) => ({
  id: s.id,
  name: s.name,
  nameZh: s.nameZh,
  tier: s.tier as SkinTier,
  desc: s.desc,
  killFile: VAL_ASSET_BASE + 'kills/' + s.id + '-kill.m4a',
  aceFile: s.ace ? VAL_ASSET_BASE + 'kills/' + s.id + '-ace.m4a' : undefined,
}))

const MOOD_MAP: Record<'praise' | 'taunt' | 'start' | 'finish', { mood: ValAgentLine['mood']; nameZh: string }> = {
  praise: { mood: 'praise', nameZh: '连击夸奖' },
  taunt: { mood: 'taunt', nameZh: '打错嘲讽' },
  start: { mood: 'start', nameZh: '开场台词' },
  finish: { mood: 'finish', nameZh: '收场台词' },
}

const LINE_KEYS = ['praise', 'taunt', 'start', 'finish'] as const

export const VAL_AGENTS: ValAgentEntry[] = rawAgents.map((a) => ({
  id: a.id,
  name: a.name,
  nameZh: a.nameZh,
  role: a.role as ValAgentEntry['role'],
  color: a.color,
  lines: LINE_KEYS.map((key) => {
    const meta = MOOD_MAP[key]
    return {
      id: a.id + '-' + key + '-1',
      nameZh: meta.nameZh,
      text: a.lines[key],
      mood: meta.mood,
      file: VAL_ASSET_BASE + 'agents/' + a.id + '/' + key + '.m4a',
    }
  }),
}))

const skinIndex = new Map(VAL_SKINS.map((s) => [s.id, s]))
const agentIndex = new Map(VAL_AGENTS.map((a) => [a.id, a]))

function agentLineKind(mood: ValAgentLine['mood']): ValEventKind {
  switch (mood) {
    case 'praise':
      return 'agentPraise'
    case 'taunt':
      return 'agentTaunt'
    case 'start':
      return 'agentStart'
    default:
      return 'agentFinish'
  }
}

function buildSounds(): ValSoundAsset[] {
  const list: ValSoundAsset[] = []

  VAL_SKINS.forEach((skin) => {
    list.push({
      id: 'skin:' + skin.id + ':kill',
      name: skin.nameZh + ' 击杀音',
      file: skin.killFile,
      source: 'builtin',
      kind: 'kill',
      skinId: skin.id,
    })
    if (skin.aceFile) {
      list.push({
        id: 'skin:' + skin.id + ':ace',
        name: skin.nameZh + ' ACE 音',
        file: skin.aceFile,
        source: 'builtin',
        kind: 'ace',
        skinId: skin.id,
      })
    }
  })

  VAL_AGENTS.forEach((agent) => {
    agent.lines.forEach((line) => {
      const key = line.id.split('-')[1]
      list.push({
        id: 'agent:' + agent.id + ':' + key,
        name: agent.nameZh + ' · ' + line.nameZh,
        file: line.file,
        source: 'builtin',
        kind: agentLineKind(line.mood),
        agentId: agent.id,
        text: line.text,
      })
    })
  })

  return list
}

export const ALL_BUILTIN_SOUNDS: ValSoundAsset[] = buildSounds()

const soundIndex = new Map(ALL_BUILTIN_SOUNDS.map((s) => [s.id, s]))

export function getSkin(id: string): ValSkinEntry | undefined {
  return skinIndex.get(id)
}

export function getAgent(id: string): ValAgentEntry | undefined {
  return agentIndex.get(id)
}

export function getSoundById(id: string): ValSoundAsset | undefined {
  return soundIndex.get(id)
}

export function soundsForSkin(skinId: string): ValSoundAsset[] {
  return ALL_BUILTIN_SOUNDS.filter((s) => s.skinId === skinId && (s.kind === 'kill' || s.kind === 'ace'))
}

export function soundsForAgent(agentId: string): ValSoundAsset[] {
  return ALL_BUILTIN_SOUNDS.filter((s) => s.agentId === agentId)
}

export function soundsByKind(kind: ValEventKind): ValSoundAsset[] {
  return ALL_BUILTIN_SOUNDS.filter((s) => s.kind === kind)
}

/** 给 UI 用的皮肤分组顺序 */
export const SKIN_TIER_LABELS: Record<SkinTier, string> = {
  exclusive: '专属 / 限定',
  ultra: 'ULTRA 级',
  premium: 'PREMIUM 级',
  deluxe: 'DELUXE 级',
  select: 'SELECT 级',
  standard: '默认',
}
