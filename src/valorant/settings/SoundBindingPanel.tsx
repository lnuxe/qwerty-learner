import { Btn, Row, Section } from './controls'
import { playSound } from '../audioEngine'
import { ALL_BUILTIN_SOUNDS, getSoundById, soundsByKind } from '../catalog'
import { ALL_VAL_EVENTS, EVENT_LABELS, valorantConfigAtom } from '../config'
import { deleteCustomSound, listCustomSounds, saveCustomSound } from '../storage'
import { resolvePreviewAsset } from '../triggers'
import type { CustomSoundMeta } from '../types-ext'
import type { ValBinding, ValEventKind } from '../types'
import { useAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'

const CUSTOM_PREFIX = 'custom:'

export default function SoundBindingPanel() {
  const [cfg, setCfg] = useAtom(valorantConfigAtom)
  const [customs, setCustoms] = useState<CustomSoundMeta[]>([])
  const [pendingKind, setPendingKind] = useState<ValEventKind | null>(null)
  const [hint, setHint] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = () => {
    void listCustomSounds().then(setCustoms)
  }

  useEffect(refresh, [])

  const patchBinding = (kind: ValEventKind, patch: Partial<ValBinding>) => {
    setCfg((prev) => {
      const current: ValBinding = prev.bindings[kind] ?? { mode: 'fixed' as const }
      return { ...prev, bindings: { ...prev.bindings, [kind]: { ...current, ...patch } } }
    })
  }

  const playRef = (ref: string, name = '') => {
    void playSound(ref, { volume: cfg.volume })
    if (name) setHint('试听：' + name)
  }

  const preview = (kind: ValEventKind) => {
    const binding = cfg.bindings[kind]
    if (binding?.mode === 'fixed' && binding.fixedId) {
      if (binding.fixedId.startsWith(CUSTOM_PREFIX)) {
        playRef('idb:' + binding.fixedId.slice(CUSTOM_PREFIX.length), '自定义音频')
        return
      }
      const asset = getSoundById(binding.fixedId)
      if (asset) {
        playRef(asset.file, asset.name)
        return
      }
    }
    if (binding?.pool?.length && binding.mode !== 'fixed') {
      const first = binding.pool[0]
      if (first.startsWith(CUSTOM_PREFIX)) {
        playRef('idb:' + first.slice(CUSTOM_PREFIX.length), '自定义音频')
        return
      }
      const asset = getSoundById(first)
      if (asset) {
        playRef(asset.file, asset.name)
        return
      }
    }
    const fallback = resolvePreviewAsset(kind, cfg)
    if (fallback) playRef(fallback.file, fallback.name)
    else setHint('没有可用资源')
  }

  const triggerUpload = (kind: ValEventKind) => {
    setPendingKind(kind)
    fileRef.current?.click()
  }

  const onFile = async (file: File | undefined) => {
    if (!file || !pendingKind) return
    try {
      const meta = await saveCustomSound(file, file.name.replace(/\.[^.]+$/, ''))
      patchBinding(pendingKind, { mode: 'fixed', fixedId: CUSTOM_PREFIX + meta.id })
      setHint('已上传并绑定到「' + EVENT_LABELS[pendingKind].nameZh + '」：' + meta.name)
      refresh()
    } catch (e) {
      setHint('上传失败：' + String(e))
    } finally {
      setPendingKind(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0])
        }}
      />

      <Section title="怎么选音效" desc="每种事件可以：固定一条 / 在候选池里随机 / 在候选池里轮播。留空则跟随当前枪皮与特工。">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          内置候选共 {ALL_BUILTIN_SOUNDS.length} 条（枪皮击杀音、ACE 音、特工台词）。真实游戏素材请自行上传后绑定。
        </p>
      </Section>

      {ALL_VAL_EVENTS.map((kind) => {
        const binding: ValBinding = cfg.bindings[kind] ?? { mode: 'fixed' as const }
        const candidates = soundsByKind(kind)
        const pool = binding.pool ?? []
        return (
          <Section key={kind} title={EVENT_LABELS[kind].nameZh} desc={EVENT_LABELS[kind].desc}>
            <Row label="选音策略">
              <select
                value={binding.mode}
                onChange={(e) => patchBinding(kind, { mode: e.target.value as ValBinding['mode'] })}
                className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-neutral-600 dark:bg-gray-900 dark:text-gray-200"
              >
                <option value="fixed">固定一条</option>
                <option value="random">随机（候选池）</option>
                <option value="cycle">轮播（候选池）</option>
              </select>
              <Btn onClick={() => preview(kind)}>试听</Btn>
              <Btn onClick={() => triggerUpload(kind)}>上传自定义</Btn>
            </Row>

            {binding.mode === 'fixed' ? (
              <Row label="固定资源">
                <select
                  value={binding.fixedId ?? ''}
                  onChange={(e) => patchBinding(kind, { fixedId: e.target.value || undefined })}
                  className="max-w-[24rem] rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-neutral-600 dark:bg-gray-900 dark:text-gray-200"
                >
                  <option value="">跟随当前枪皮 / 特工（推荐）</option>
                  {candidates.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  {customs.length > 0 ? (
                    <optgroup label="我的上传">
                      {customs.map((c) => (
                        <option key={c.id} value={CUSTOM_PREFIX + c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </Row>
            ) : (
              <div>
                <div className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">候选池（已选 {pool.length} 条）</div>
                <div className="max-h-52 overflow-y-auto rounded-xl border border-neutral-200 p-2 dark:border-neutral-700">
                  {candidates.map((s) => {
                    const checked = pool.includes(s.id)
                    return (
                      <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-gray-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked ? pool.filter((x) => x !== s.id) : [...pool, s.id]
                            patchBinding(kind, { pool: next })
                          }}
                          className="accent-[#ff4655]"
                        />
                        <span className="flex-1 text-gray-600 dark:text-gray-300">{s.name}</span>
                        <button
                          type="button"
                          onClick={() => playRef(s.file, s.name)}
                          className="text-[11px] text-[#ff4655] hover:underline"
                        >
                          试听
                        </button>
                      </label>
                    )
                  })}
                  {customs.map((c) => {
                    const id = CUSTOM_PREFIX + c.id
                    const checked = pool.includes(id)
                    return (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-gray-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked ? pool.filter((x) => x !== id) : [...pool, id]
                            patchBinding(kind, { pool: next })
                          }}
                          className="accent-[#ff4655]"
                        />
                        <span className="flex-1 text-gray-600 dark:text-gray-300">（我）{c.name}</span>
                        <button type="button" onClick={() => playRef('idb:' + c.id, c.name)} className="text-[11px] text-[#ff4655] hover:underline">
                          试听
                        </button>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </Section>
        )
      })}

      <Section title="我的自定义音频" desc="上传过的音频都在这，可试听或删除（删除后绑定会失效）。">
        {customs.length === 0 ? (
          <p className="text-xs text-gray-400">还没有上传过音频</p>
        ) : (
          <div className="space-y-2">
            {customs.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-xs dark:bg-gray-900">
                <span className="truncate text-gray-600 dark:text-gray-300">{c.name}</span>
                <div className="flex shrink-0 gap-2">
                  <Btn onClick={() => playRef('idb:' + c.id, c.name)}>试听</Btn>
                  <Btn
                    variant="danger"
                    onClick={() => {
                      void deleteCustomSound(c.id).then(refresh)
                    }}
                  >
                    删除
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {hint ? <p className="text-xs text-[#ff4655]">{hint}</p> : null}
    </div>
  )
}
