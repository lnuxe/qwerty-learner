import './val.css'
import { EVENT_LABELS, valComboAtom, valLastPlayedAtom, valorantConfigAtom } from './config'
import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'

export default function ValComboOverlay() {
  const cfg = useAtomValue(valorantConfigAtom)
  const combo = useAtomValue(valComboAtom)
  const last = useAtomValue(valLastPlayedAtom)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!last) return
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), 2600)
    return () => window.clearTimeout(timer)
  }, [last])

  if (!cfg.isOpen || !cfg.showCombo) return null
  if (combo < 2 && !visible) return null

  return (
    <div className="val-combo">
      {combo >= 2 && (
        <div className="animate__animated animate__fadeInUp">
          <div className="val-combo-label">COMBO</div>
          <div className="val-combo-num">×{combo}</div>
        </div>
      )}
      {visible && last && (
        <div className="val-last animate__animated animate__fadeIn">
          <span className="font-semibold text-[#ff4655]">{EVENT_LABELS[last.kind].nameZh}</span>
          {last.text ? <span className="ml-1 opacity-80">「{last.text}」</span> : null}
        </div>
      )}
    </div>
  )
}
