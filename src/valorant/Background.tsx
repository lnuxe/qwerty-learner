import './val.css'
import { DEFAULT_BACKGROUND, valorantConfigAtom } from './config'
import { getBackgroundUrl } from './storage'
import { isOpenDarkModeAtom } from '@/store'
import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/** 挂 html 上的 class：让 body 透明、内容抬到背景之上（见 val.css） */
export const VAL_BG_CLASS = 'val-bg-on'

export function useValorantSurfaceClass(): string {
  const cfg = useAtomValue(valorantConfigAtom)
  return cfg.background.enabled && cfg.background.frostedPanel ? 'val-surface' : ''
}

/**
 * 全屏背景层。
 * 必须 portal 到 body：如果留在 #root 里，即使 z-index 更低，按绘制顺序（定位元素 z-index:0
 * 在所有非定位内容之后绘制）也会把单词面板盖住。
 */
export default function ValBackground() {
  const cfg = useAtomValue(valorantConfigAtom)
  // 用 atom 而不是读 classList：Root 里 class 是在 effect 里加的，读 DOM 会慢一拍
  const isDark = useAtomValue(isOpenDarkModeAtom)
  const { enabled, imageUrl, blur, dim, opacity } = cfg.background
  const [src, setSrc] = useState<string>(DEFAULT_BACKGROUND)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

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

  if (!enabled || !mounted) return null

  // 深色主题用黑纱：白纱会整体发灰，黑纱才压得住浅色文字；薄纱浓度比浅色稍低一点，壁纸还看得见
  const dimValue = isDark ? Math.min(0.92, Math.max(0.35, dim - 0.16)) : Math.min(0.92, Math.max(0, dim))

  return createPortal(
    <>
      <div
        className="val-bg-layer"
        style={{
          backgroundImage: 'url("' + src + '")',
          filter: blur > 0 ? 'blur(' + blur + 'px) brightness(1.06) saturate(0.94)' : 'brightness(1.06) saturate(0.94)',
          opacity,
          transform: blur > 0 ? 'scale(1.04)' : undefined,
        }}
      />
      <div className="val-bg-dim" style={{ opacity: dimValue }} />
    </>,
    document.body,
  )
}
