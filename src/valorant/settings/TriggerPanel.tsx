import { Btn, NumberInput, Row, Section, Slider, Toggle } from './controls'
import { defaultTriggers, valorantConfigAtom } from '../config'
import type { ValTriggerConfig, ValorantConfig } from '../types'
import { useAtom } from 'jotai'

type NumKey = {
  key: keyof ValTriggerConfig
  label: string
  hint: string
  min: number
  max: number
  step: number
  unit?: string
}

const NUMERIC: NumKey[] = [
  { key: 'streakStartAt', label: '开始出击杀音（连对词数）', hint: '连对多少个「零错词的词」后开始享受击杀音', min: 1, max: 20, step: 1, unit: '词' },
  { key: 'killEvery', label: '击杀音间隔', hint: '之后每连对多少个词再响一次', min: 1, max: 10, step: 1, unit: '词' },
  { key: 'killCooldownMs', label: '击杀音冷却', hint: '两次击杀音的最短间隔，防止刷屏', min: 0, max: 3000, step: 100, unit: 'ms' },
  { key: 'aceAt', label: 'ACE 触发连击数', hint: '连对达到该值时触发一次 ACE 重音（每段连击一次）', min: 3, max: 60, step: 1, unit: '词' },
  { key: 'errorTriggerAt', label: '嘲讽触发（连错键数）', hint: '仓库的错误计数是逐字符的：每打错一个键 +1', min: 1, max: 30, step: 1, unit: '键' },
  { key: 'errorRageAt', label: '暴怒升级阈值', hint: '连错键数达到这里，台词音量提高（更凶）', min: 2, max: 60, step: 1, unit: '键' },
  { key: 'errorCooldownMs', label: '嘲讽冷却', hint: '两句话之间至少隔多久', min: 0, max: 20000, step: 500, unit: 'ms' },
  { key: 'praiseChance', label: '夸奖概率', hint: '干净通过一个词时，按此概率随机夸一句', min: 0, max: 1, step: 0.05 },
]

const TOGGLES: { key: keyof ValTriggerConfig; label: string; hint: string }[] = [
  { key: 'agentOnStart', label: '开始练习时播开场台词', hint: '每次进入/重开一章时' },
  { key: 'agentOnFinish', label: '结束时播收尾台词', hint: '本章全部打完' },
  { key: 'finalKillOnFinish', label: '结束时播最终击杀音', hint: '最后的收尾音效' },
  { key: 'killOnSingleCorrect', label: '单词也允许击杀音', hint: '开启后即使词量很少也会出声' },
]

export default function TriggerPanel() {
  const [cfg, setCfg] = useAtom(valorantConfigAtom)

  const patchTrigger = <K extends keyof ValTriggerConfig>(key: K, value: ValTriggerConfig[K]) =>
    setCfg((prev) => ({ ...prev, triggers: { ...prev.triggers, [key]: value } }))

  const resetAll = () =>
    setCfg((prev: ValorantConfig) => ({ ...prev, triggers: { ...defaultTriggers } }))

  return (
    <div>
      <Section title="连击与出错节奏" desc="数值越小越容易触发。默认值适合正常速度打字；嫌吵就调大冷却。">
        {NUMERIC.map((item) => {
          const value = Number(cfg.triggers[item.key] ?? 0)
          return (
            <Row key={String(item.key)} label={item.label} hint={item.hint}>
              {item.step < 1 ? (
                <Slider
                  value={value}
                  min={item.min}
                  max={item.max}
                  step={item.step}
                  onChange={(v) => patchTrigger(item.key, v as ValTriggerConfig[typeof item.key])}
                  format={(v) => Math.round(v * 100) + '%'}
                />
              ) : (
                <>
                  <Slider
                    value={value}
                    min={item.min}
                    max={item.max}
                    step={item.step}
                    onChange={(v) => patchTrigger(item.key, v as ValTriggerConfig[typeof item.key])}
                  />
                  <NumberInput
                    value={value}
                    min={item.min}
                    max={item.max}
                    onChange={(v) => patchTrigger(item.key, v as ValTriggerConfig[typeof item.key])}
                  />
                  {item.unit ? <span className="text-xs text-gray-400">{item.unit}</span> : null}
                </>
              )}
            </Row>
          )
        })}
      </Section>

      <Section title="时机开关">
        {TOGGLES.map((item) => (
          <Row key={String(item.key)} label={item.label} hint={item.hint}>
            <Toggle
              checked={Boolean(cfg.triggers[item.key])}
              onChange={(v) => patchTrigger(item.key, v as ValTriggerConfig[typeof item.key])}
            />
          </Row>
        ))}
      </Section>

      <div className="flex justify-end">
        <Btn variant="danger" onClick={resetAll}>
          恢复默认触发参数
        </Btn>
      </div>
    </div>
  )
}
