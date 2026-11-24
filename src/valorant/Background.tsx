import './val.css'
import { DEFAULT_BACKGROUND, valorantConfigAtom } from './config'
import { getBackgroundUrl } from './storage'
import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'

/** 挂 html 上的 class：让 body 透明、内容抬到背景之上（见 val.css） */
export const VAL_BG_CLASS = 'val-bg-on'

export function useValorantSurfaceClass(): string {
  const cfg = useAtomValue(valorantConfigAtom)
  return cfg.background.enabled && cfg.background.frostedPanel ? 'val-surface' : ''
}

export default function ValBackground() {
  const cfg = useAtomValue(valorantConfigAtom)
  const { enabled, imageUrl, blur, dim, opacity } = cfg.background
  const [src, setSrc] = useState<string>(DEFAULT_BACKGROUND)

  useEffect(() => {
    let alive = true
    const ref = imageUrl || DEFAULT_BACKGROUND
    if (!ref.startsWith('idb:')) {
      setSrc(ref)
      return
    }
    void getBackgroundUrl(ref).then((url) => {
      if (!alive) return
      setSrc(url ?? DEFAULT_BACKGROUND)
    })
    return () => {
      alive = false
    }
  }, [imageUrl])

  useEffect(() => {
    const rootEl = document.documentElement
    if (enabled) {
      rootEl.classList.add(VAL_BG_CLASS)
    } else {
      rootEl.classList.remove(VAL_BG_CLASS)
    }
    return () => rootEl.classList.remove(VAL_BG_CLASS)
  }, [enabled])

  if (!enabled) return null

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const dimValue = Math.min(0.9, Math.max(0, dim + (isDark ? 0.1 : 0)))

  return (
    <>
      <div
        className="val-bg-layer"
        style={{
          backgroundImage: 'url("' + src + '")',
          filter: blur > 0 ? 'blur(' + blur + 'px)' : undefined,
          opacity,
          transform: blur > 0 ? 'scale(1.04)' : undefined,
        }}
      />
      <div className="val-bg-dim" style={{ opacity: dimValue }} />
    </>
  )
}

/** 图片加载失败的兜底：换回内置图 */
export function useBackgroundFallback() {
  const [errored, setErrored] = useState(false)
  useEffect(() => setErrored(false), [])
  return { errored, setErrored }
}
