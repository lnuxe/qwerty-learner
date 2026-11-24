import type React from 'react'

export function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-2xl border border-neutral-200 bg-white/80 p-5 shadow-sm dark:border-neutral-700 dark:bg-gray-800/80">
      <div className="mb-4">
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">{title}</h3>
        {desc ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{desc}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</div>
        {hint ? <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{hint}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={
        'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ' + (checked ? 'bg-[#ff4655]' : 'bg-neutral-300 dark:bg-neutral-600')
      }
    >
      <span
        className={
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ' + (checked ? 'left-[1.375rem]' : 'left-0.5')
        }
      />
    </button>
  )
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-40 cursor-pointer appearance-none rounded-full bg-neutral-200 accent-[#ff4655] dark:bg-neutral-600"
      />
      <span className="w-14 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">{format ? format(value) : value}</span>
    </div>
  )
}

export function NumberInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const v = Number(e.target.value)
        if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)))
      }}
      className="w-20 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm tabular-nums text-gray-700 outline-none focus:border-[#ff4655] dark:border-neutral-600 dark:bg-gray-900 dark:text-gray-200"
    />
  )
}

export function Btn({
  children,
  onClick,
  variant = 'ghost',
  title,
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  title?: string
}) {
  const base = 'inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200'
  const styles = {
    primary: 'bg-[#ff4655] text-white hover:bg-[#e03a48]',
    ghost: 'bg-neutral-100 text-gray-600 hover:bg-neutral-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300',
  }
  return (
    <button type="button" title={title} onClick={onClick} className={base + ' ' + styles[variant]}>
      {children}
    </button>
  )
}
