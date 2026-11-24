import { TypingContext } from '@/pages/Typing/store'
import ValComboOverlay from './ComboOverlay'
import useValorantEffects from './useValorantEffects'
import { useContext, useMemo } from 'react'
import type { ValTypingSnapshot } from './types'

/**
 * 把打字状态桥接给无畏契约音效引擎。
 * 必须挂在 TypingContext.Provider 内部。
 */
export default function ValorantBridge() {
  const ctx = useContext(TypingContext)
  const state = ctx?.state

  const snapshot: ValTypingSnapshot | null = useMemo(() => {
    if (!state) return null
    return {
      index: state.chapterData.index,
      correctCount: state.chapterData.correctCount,
      wrongCount: state.chapterData.wrongCount,
      wordCount: state.chapterData.wordCount,
      isTyping: state.isTyping,
      isFinished: state.isFinished,
    }
  }, [
    state?.chapterData.index,
    state?.chapterData.correctCount,
    state?.chapterData.wrongCount,
    state?.chapterData.wordCount,
    state?.isTyping,
    state?.isFinished,
  ])

  useValorantEffects(snapshot)

  return <ValComboOverlay />
}
