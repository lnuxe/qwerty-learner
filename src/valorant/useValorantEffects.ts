import { EVENT_LABELS, valComboAtom, valLastPlayedAtom, valorantConfigAtom } from './config'
import { playSound, unlockAudio } from './audioEngine'
import { computeTriggers, createTriggerState } from './triggers'
import type { ValTriggerState } from './triggers'
import type { ValTypingSnapshot } from './types'
import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef } from 'react'

/**
 * 把打字快照喂给触发引擎，并把要播的音频丢给播放层。
 * 注意：整条链路都必须是「不阻塞打字」的 —— 任何异常都吞掉。
 */
export default function useValorantEffects(snapshot: ValTypingSnapshot | null): void {
  const config = useAtomValue(valorantConfigAtom)
  const setCombo = useSetAtom(valComboAtom)
  const setLastPlayed = useSetAtom(valLastPlayedAtom)
  const triggerRef = useRef<ValTriggerState>(createTriggerState())

  // 首次用户手势解锁音频
  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    if (!snapshot) return
    try {
      const { state, instructions } = computeTriggers(triggerRef.current, snapshot, config, Date.now())
      triggerRef.current = state
      setCombo(state.streak)

      instructions.forEach((ins) => {
        void playSound(ins.file, { volume: config.volume, gain: ins.gain })
        setLastPlayed({
          kind: ins.kind,
          name: ins.name ?? EVENT_LABELS[ins.kind].nameZh,
          text: ins.text,
        })
      })
    } catch {
      // 音效系统绝不能影响打字
    }
  }, [snapshot, config, setCombo, setLastPlayed])
}
