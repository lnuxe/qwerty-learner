import './val.css'
import AppearancePanel from './settings/AppearancePanel'
import OverviewPanel from './settings/OverviewPanel'
import SoundBindingPanel from './settings/SoundBindingPanel'
import TriggerPanel from './settings/TriggerPanel'
import { ALL_BUILTIN_SOUNDS, VAL_AGENTS, VAL_SKINS } from './catalog'
import { valorantConfigAtom } from './config'
import { Link } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { useState } from 'react'

const TABS = [
  { id: 'overview', label: '总览' },
  { id: 'trigger', label: '触发规则' },
  { id: 'binding', label: '音效绑定' },
  { id: 'appearance', label: '外观背景' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function ValorantPage() {
  const [tab, setTab] = useState<TabId>('overview')
  const cfg = useAtomValue(valorantConfigAtom)
  const skin = VAL_SKINS.find((s) => s.id === cfg.skinId)
  const agent = VAL_AGENTS.find((a) => a.id === cfg.agentId)

  return (
    <div className="min-h-screen bg-[#faf9ff] text-gray-800 dark:bg-gray-900 dark:text-gray-100">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-neutral-200 pb-4 dark:border-neutral-700">
          <div>
            <div className="text-xs font-bold tracking-[0.28em] text-[#ff4655]">VALORANT × QWERTY LEARNER</div>
            <h1 className="mt-1 text-2xl font-extrabold">无畏契约 音效联动</h1>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {skin?.nameZh ?? cfg.skinId} · {agent?.nameZh ?? cfg.agentId} · 内置素材 {ALL_BUILTIN_SOUNDS.length} 条
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-neutral-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              返回练习
            </Link>
          </div>
        </header>

        <div className="flex flex-col gap-6 md:flex-row">
          <nav className="flex shrink-0 flex-row gap-2 md:w-44 md:flex-col">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={
                  'rounded-xl px-4 py-2 text-left text-sm font-semibold transition-colors ' +
                  (tab === t.id
                    ? 'bg-[#ff4655] text-white shadow'
                    : 'bg-white text-gray-600 hover:bg-neutral-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700')
                }
              >
                {t.label}
              </button>
            ))}
          </nav>

          <main className="min-w-0 flex-1">
            {tab === 'overview' ? <OverviewPanel /> : null}
            {tab === 'trigger' ? <TriggerPanel /> : null}
            {tab === 'binding' ? <SoundBindingPanel /> : null}
            {tab === 'appearance' ? <AppearancePanel /> : null}
          </main>
        </div>
      </div>
    </div>
  )
}
