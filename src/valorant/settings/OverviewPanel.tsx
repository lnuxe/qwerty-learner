import { Btn, Row, Section, Slider, Toggle } from './controls'
import { playSound } from '../audioEngine'
import { SKIN_TIER_LABELS, VAL_AGENTS, VAL_SKINS } from '../catalog'
import { ALL_VAL_EVENTS, EVENT_LABELS, valorantConfigAtom } from '../config'
import { resolvePreviewAsset } from '../triggers'
import type { ValEventKind, ValSkinEntry, ValorantConfig } from '../types'
import { useAtom, useAtomValue } from 'jotai'
import { useState } from 'react'

const TIER_ORDER: ValSkinEntry['tier'][] = ['exclusive', 'ultra', 'premium', 'deluxe', 'select', 'standard']

export default function OverviewPanel() {
  const [cfg, setCfg] = useAtom(valorantConfigAtom)
  const [previewHint, setPreviewHint] = useState('')
  const agent = useAtomValue(valorantConfigAtom).agentId

  const patch = (partial: Partial<ValorantConfig>) => setCfg((prev) => ({ ...prev, ...partial }))
  const patchEnabled = (kind: ValEventKind, v: boolean) =>
    setCfg((prev) => ({ ...prev, enabled: { ...prev.enabled, [kind]: v } }))

  const preview = (kind: ValEventKind) => {
    const asset = resolvePreviewAsset(kind, cfg)
    if (!asset) {
      setPreviewHint('当前事件没有可用资源，请先在「音效绑定」里选一条')
      return
    }
    void playSound(asset.file, { volume: cfg.volume })
    setPreviewHint('试听：' + EVENT_LABELS[kind].nameZh + ' · ' + (asset.name ?? '内置资源'))
  }

  return (
    <div>
      <Section title="总开关与音量" desc="关掉后整套音效联动静音，但不影响自带的按键音与发音。">
        <Row label="启用无畏契约音效联动">
          <Toggle checked={cfg.isOpen} onChange={(v) => patch({ isOpen: v })} />
        </Row>
        <Row label="主音量">
          <Slider value={cfg.volume} min={0} max={1} step={0.05} onChange={(v) => patch({ volume: v })} format={(v) => Math.round(v * 100) + '%'} />
        </Row>
        <Row label="显示连击浮层" hint="右下角显示 COMBO ×N 与最近触发的台词">
          <Toggle checked={cfg.showCombo} onChange={(v) => patch({ showCombo: v })} />
        </Row>
      </Section>

      <Section title="当前枪皮" desc="决定连击时的击杀音效；想换音色也可以去「音效绑定」里手动指定。">
        <Row label="枪皮系列">
          <select
            value={cfg.skinId}
            onChange={(e) => patch({ skinId: e.target.value })}
            className="max-w-[22rem] rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm text-gray-700 outline-none focus:border-[#ff4655] dark:border-neutral-600 dark:bg-gray-900 dark:text-gray-200"
          >
            {TIER_ORDER.map((tier) => (
              <optgroup key={tier} label={SKIN_TIER_LABELS[tier]}>
                {VAL_SKINS.filter((s) => s.tier === tier).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nameZh} · {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <Btn onClick={() => preview('kill')}>试听</Btn>
        </Row>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {VAL_SKINS.find((s) => s.id === cfg.skinId)?.desc ?? '该枪皮没有描述'}
        </p>
      </Section>

      <Section title="当前特工" desc="连错时谁出来嘲讽你、连对时谁夸你，都由这里决定。">
        <Row label="特工">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: VAL_AGENTS.find((a) => a.id === agent)?.color ?? '#888' }} />
          <select
            value={cfg.agentId}
            onChange={(e) => patch({ agentId: e.target.value })}
            className="max-w-[18rem] rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm text-gray-700 outline-none focus:border-[#ff4655] dark:border-neutral-600 dark:bg-gray-900 dark:text-gray-200"
          >
            {VAL_AGENTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nameZh} · {a.name}
              </option>
            ))}
          </select>
          <Btn onClick={() => preview('agentTaunt')}>试听嘲讽</Btn>
          <Btn onClick={() => preview('agentPraise')}>试听夸奖</Btn>
        </Row>
      </Section>

      <Section title="事件开关" desc="七类触发各自独立，按需关掉不想要的。">
        {ALL_VAL_EVENTS.map((kind) => (
          <Row key={kind} label={EVENT_LABELS[kind].nameZh} hint={EVENT_LABELS[kind].desc}>
            <Btn onClick={() => preview(kind)}>试听</Btn>
            <Toggle checked={cfg.enabled[kind] !== false} onChange={(v) => patchEnabled(kind, v)} />
          </Row>
        ))}
      </Section>

      {previewHint ? <p className="mb-4 text-xs text-[#ff4655]">{previewHint}</p> : null}
    </div>
  )
}
