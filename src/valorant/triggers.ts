import { getSoundById, soundsByKind, soundsForAgent, soundsForSkin } from './catalog'
import { CUSTOM_AUDIO_PREFIX } from './types-ext'
import type { ValEventKind, ValSoundAsset, ValTypingSnapshot, ValorantConfig } from './types'

/**
 * 纯逻辑触发引擎（不碰 DOM，时间由调用方传入，方便单测）。
 *
 * 语义（已核对仓库源码）：
 * - correctCount / wrongCount 是**字符级**计数：每打对 / 打错一个键 +1
 * - index 是**词级**进度：换词时 +1
 * - 所以「连对」按词判定（该词期间零错键才算干净通过）
 * - 「连错」按字符累积（这正是“一直错一直错”要的灵敏度）
 */

export type ValTriggerState = {
  prev: ValTypingSnapshot | null
  /** 词级连对 */
  streak: number
  /** 字符级连错 */
  errorStreak: number
  /** 当前这个词已经打错的键数 */
  wordWrongAcc: number
  lastKillAt: number
  lastErrorAt: number
  aceDone: boolean
  startedOnce: boolean
  wasFinished: boolean
  cycleCursor: Record<string, number>
  randomCursor: Record<string, number>
}

export type ValInstruction = {
  kind: ValEventKind
  assetId: string
  /** 可直接播放的路径：'/val/...' 或 'idb:xxx' */
  file: string
  text?: string
  name?: string
  gain?: number
}

export function createTriggerState(): ValTriggerState {
  return {
    prev: null,
    streak: 0,
    errorStreak: 0,
    wordWrongAcc: 0,
    lastKillAt: 0,
    lastErrorAt: 0,
    aceDone: false,
    startedOnce: false,
    wasFinished: false,
    cycleCursor: {},
    randomCursor: {},
  }
}

export function resetTriggerState(state: ValTriggerState): ValTriggerState {
  const fresh = createTriggerState()
  return { ...fresh, prev: state.prev, startedOnce: state.startedOnce }
}

/* ------------------------- 资源解析 ------------------------- */

type ResolvedAsset = { assetId: string; file: string; text?: string; name?: string }

function fromBuiltin(asset: ValSoundAsset | undefined | null): ResolvedAsset | null {
  if (!asset) return null
  return { assetId: asset.id, file: asset.file, text: asset.text, name: asset.name }
}

export function assetFromId(id: string): ResolvedAsset | null {
  if (!id) return null
  if (id.startsWith(CUSTOM_AUDIO_PREFIX)) {
    const dbId = id.slice(CUSTOM_AUDIO_PREFIX.length)
    if (!dbId) return null
    return { assetId: id, file: 'idb:' + dbId, name: '自定义音频' }
  }
  return fromBuiltin(getSoundById(id))
}

function skinDefault(kind: ValEventKind, skinId: string): ResolvedAsset | null {
  const list = soundsForSkin(skinId)
  const kill = list.find((s) => s.kind === 'kill')
  const ace = list.find((s) => s.kind === 'ace')
  if (kind === 'ace' || kind === 'finalKill') return fromBuiltin(ace ?? kill)
  return fromBuiltin(kill)
}

function agentDefault(kind: ValEventKind, agentId: string): ResolvedAsset | null {
  const mine = soundsForAgent(agentId).filter((s) => s.kind === kind)
  if (mine.length) return fromBuiltin(mine[0])
  const any = soundsByKind(kind)
  return any.length ? fromBuiltin(any[0]) : null
}

export function resolvePreviewAsset(kind: ValEventKind, config: ValorantConfig): ResolvedAsset | null {
  const bound = config.bindings[kind]?.mode === 'fixed' ? assetFromId(config.bindings[kind]?.fixedId ?? '') : null
  return bound ?? defaultAsset(kind, config)
}

function defaultAsset(kind: ValEventKind, config: ValorantConfig): ResolvedAsset | null {
  if (kind === 'kill' || kind === 'ace' || kind === 'finalKill') {
    return skinDefault(kind, config.skinId) ?? fromBuiltin(soundsByKind('kill')[0])
  }
  return agentDefault(kind, config.agentId)
}

function pickAsset(kind: ValEventKind, config: ValorantConfig, state: ValTriggerState): ResolvedAsset | null {
  const binding = config.bindings[kind]

  if (binding?.mode === 'fixed' && binding.fixedId) {
    const fixed = assetFromId(binding.fixedId)
    if (fixed) return fixed
  }

  const pool = (binding?.pool ?? []).map(assetFromId).filter((x): x is ResolvedAsset => Boolean(x))

  if (pool.length > 0 && binding && binding.mode !== 'fixed') {
    if (binding.mode === 'cycle') {
      const cur = state.cycleCursor[kind] ?? 0
      state.cycleCursor[kind] = (cur + 1) % pool.length
      return pool[cur % pool.length]
    }
    // random：用一个确定性的线性同余游标，保持“看起来随机”但可复现
    const seed = (state.randomCursor[kind] ?? 1) * 1103515245 + 12345
    state.randomCursor[kind] = seed % 2147483647
    return pool[Math.abs(seed) % pool.length]
  }

  return defaultAsset(kind, config)
}

/* ------------------------- 主逻辑 ------------------------- */

type Event = { kind: ValEventKind; gain?: number }

function isEnabled(kind: ValEventKind, config: ValorantConfig): boolean {
  return config.enabled[kind] !== false
}

export function computeTriggers(
  inputState: ValTriggerState,
  snapshot: ValTypingSnapshot,
  config: ValorantConfig,
  now: number,
): { state: ValTriggerState; instructions: ValInstruction[] } {
  const state: ValTriggerState = { ...inputState, cycleCursor: { ...inputState.cycleCursor }, randomCursor: { ...inputState.randomCursor } }
  const events: Event[] = []
  const t = config.triggers

  if (!config.isOpen) {
    state.prev = { ...snapshot }
    return { state, instructions: [] }
  }

  const prev = state.prev
  if (!prev) {
    state.prev = { ...snapshot }
    state.wasFinished = snapshot.isFinished
    if (snapshot.isTyping && !state.startedOnce && t.agentOnStart) {
      state.startedOnce = true
      events.push({ kind: 'agentStart' })
    }
    return finalize(state, events, config, now)
  }

  const dCorrect = Math.max(0, snapshot.correctCount - prev.correctCount)
  const dWrong = Math.max(0, snapshot.wrongCount - prev.wrongCount)
  const wordAdvanced = snapshot.index > prev.index
  const restarted = snapshot.index < prev.index

  // 章节重开：清空连击，但不做语音轰炸
  if (restarted) {
    state.streak = 0
    state.errorStreak = 0
    state.wordWrongAcc = 0
    state.aceDone = false
  }

  // 字符级连错累积（含同一词内反复打错）
  if (dWrong > 0) {
    state.errorStreak += dWrong
    if (isEnabled('agentTaunt', config) && state.errorStreak >= t.errorTriggerAt && now - state.lastErrorAt >= t.errorCooldownMs) {
      state.lastErrorAt = now
      events.push({ kind: 'agentTaunt', gain: state.errorStreak >= t.errorRageAt ? 1.18 : 1 })
    }
  }

  if (wordAdvanced) {
    // 结算刚走完的那个词
    const wordWasDirty = state.wordWrongAcc > 0 || (dWrong > 0 && !dCorrect)
    state.wordWrongAcc = dWrong // 新词上可能已经打错了键

    if (!wordWasDirty) {
      state.streak += 1
      state.errorStreak = 0 // 整词干净通过才真正洗掉连错

      const reachedAce = state.streak >= t.aceAt && !state.aceDone
      const killDue =
        state.streak >= t.streakStartAt && (state.streak - t.streakStartAt) % Math.max(1, t.killEvery) === 0 && now - state.lastKillAt >= t.killCooldownMs

      if (reachedAce && isEnabled('ace', config)) {
        state.aceDone = true
        state.lastKillAt = now
        events.push({ kind: 'ace', gain: 1.15 })
      } else if (killDue && isEnabled('kill', config)) {
        state.lastKillAt = now
        events.push({ kind: 'kill' })
      } else if (isEnabled('agentPraise', config) && Math.random() < t.praiseChance) {
        events.push({ kind: 'agentPraise' })
      }
    } else {
      state.streak = 0
      state.aceDone = false
      // 「单个词都打不对」时也给一点击杀反馈，避免长时间完全无声
      if (t.killOnSingleCorrect && isEnabled('kill', config) && now - state.lastKillAt >= t.killCooldownMs && state.errorStreak === 0) {
        state.lastKillAt = now
        events.push({ kind: 'kill' })
      }
    }
  } else {
    state.wordWrongAcc += dWrong
  }

  // 章节结束
  if (snapshot.isFinished && !prev.isFinished) {
    if (t.finalKillOnFinish && isEnabled('finalKill', config)) events.push({ kind: 'finalKill', gain: 1.1 })
    if (t.agentOnFinish && isEnabled('agentFinish', config)) events.push({ kind: 'agentFinish' })
    state.streak = 0
    state.errorStreak = 0
    state.aceDone = false
    state.wasFinished = true
  }

  // 开始（含结束后重开一章）
  if (snapshot.isTyping && !prev.isTyping && !snapshot.isFinished) {
    const isFreshStart = state.wasFinished || (snapshot.wordCount === 0 && snapshot.correctCount <= 1)
    if (isFreshStart && t.agentOnStart && !state.startedOnce && isEnabled('agentStart', config)) {
      state.startedOnce = true
      events.push({ kind: 'agentStart' })
    }
    state.wasFinished = false
  }

  state.prev = { ...snapshot }
  return finalize(state, events, config, now)
}

function finalize(state: ValTriggerState, events: Event[], config: ValorantConfig, now: number) {
  const instructions: ValInstruction[] = []
  // 一轮最多两条，避免爆音
  for (const ev of events.slice(0, 2)) {
    const asset = pickAsset(ev.kind, config, state)
    if (!asset) continue
    instructions.push({ kind: ev.kind, assetId: asset.assetId, file: asset.file, text: asset.text, name: asset.name, gain: ev.gain })
  }
  void now
  return { state, instructions }
}
