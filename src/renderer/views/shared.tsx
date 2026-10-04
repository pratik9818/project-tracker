/** Small pieces every view uses. Kept together so the views stay readable. */

export function ViewHeader({
  title,
  subtitle,
  right
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
}): JSX.Element {
  return (
    <header className="flex items-start justify-between border-b border-slate-800 px-4 py-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-slate-100">{title}</h2>
        {subtitle !== undefined && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}

export function EmptyState({
  children,
  tone = 'muted'
}: {
  children: React.ReactNode
  tone?: 'muted' | 'error'
}): JSX.Element {
  return (
    <p className={`px-4 py-8 text-sm ${tone === 'error' ? 'text-rose-400' : 'text-slate-500'}`}>
      {children}
    </p>
  )
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  right
}: {
  tabs: ReadonlyArray<{ id: T; label: string; count?: number }>
  active: T
  onChange: (id: T) => void
  /** Extra controls at the end of the row, e.g. an overflow dropdown. */
  right?: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center gap-1 border-b border-slate-800 px-3 py-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded px-2.5 py-1 text-xs ${
            active === tab.id
              ? 'bg-slate-800 text-slate-100'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && <span className="ml-1.5 text-slate-500">{tab.count}</span>}
        </button>
      ))}
      {right}
    </div>
  )
}
