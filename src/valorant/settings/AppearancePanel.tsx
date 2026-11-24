import { Btn, Row, Section, Slider, Toggle } from './controls'
import { DEFAULT_BACKGROUND, valorantConfigAtom } from '../config'
import { getBackgroundUrl, saveBackgroundImage } from '../storage'
import { useAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'

export default function AppearancePanel() {
  const [cfg, setCfg] = useAtom(valorantConfigAtom)
  const [previewUrl, setPreviewUrl] = useState<string>(DEFAULT_BACKGROUND)
  const [hint, setHint] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const bg = cfg.background
  const patchBg = (patch: Partial<typeof bg>) => setCfg((prev) => ({ ...prev, background: { ...prev.background, ...patch } }))

  useEffect(() => {
    let alive = true
    const ref = bg.imageUrl || DEFAULT_BACKGROUND
    if (!ref.startsWith('idb:')) {
      setPreviewUrl(ref)
      return
    }
    void getBackgroundUrl(ref).then((url) => {
      if (!alive) return
      setPreviewUrl(url ?? DEFAULT_BACKGROUND)
    })
    return () => {
      alive = false
    }
  }, [bg.imageUrl])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const ref = await saveBackgroundImage(file)
      patchBg({ imageUrl: ref, enabled: true })
      setHint('背景图已保存并启用')
    } catch (e) {
      setHint('保存失败：' + String(e))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0])
        }}
      />

      <Section title="背景图" desc="默认使用内置的无畏契约壁纸；换成自己的图会存进浏览器 IndexedDB，不会上传到任何服务器。">
        <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
          <img src={previewUrl} alt="背景预览" className="h-44 w-full object-cover" />
        </div>
        <Row label="启用背景">
          <Toggle checked={bg.enabled} onChange={(v) => patchBg({ enabled: v })} />
        </Row>
        <Row label="毛玻璃内容底" hint="在练习区后面垫一层半透明底，字不会被花背景吃掉">
          <Toggle checked={bg.frostedPanel} onChange={(v) => patchBg({ frostedPanel: v })} />
        </Row>
        <div className="flex flex-wrap gap-2">
          <Btn variant="primary" onClick={() => fileRef.current?.click()}>
            上传自定义背景
          </Btn>
          <Btn onClick={() => patchBg({ imageUrl: DEFAULT_BACKGROUND })}>恢复默认背景</Btn>
        </div>
      </Section>

      <Section title="画面调节">
        <Row label="模糊">
          <Slider value={bg.blur} min={0} max={24} step={1} onChange={(v) => patchBg({ blur: v })} format={(v) => v + 'px'} />
        </Row>
        <Row label="暗化">
          <Slider value={bg.dim} min={0} max={0.9} step={0.02} onChange={(v) => patchBg({ dim: v })} format={(v) => Math.round(v * 100) + '%'} />
        </Row>
        <Row label="不透明度">
          <Slider value={bg.opacity} min={0.1} max={1} step={0.02} onChange={(v) => patchBg({ opacity: v })} format={(v) => Math.round(v * 100) + '%'} />
        </Row>
      </Section>

      {hint ? <p className="text-xs text-[#ff4655]">{hint}</p> : null}
    </div>
  )
}
