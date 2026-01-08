export function Badge({
  children,
  tone = 'slate',
}: {
  children: React.ReactNode
  tone?: 'slate' | 'green' | 'yellow' | 'red'
}) {
  const map: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-800',
    yellow: 'bg-amber-100 text-amber-800',
    red: 'bg-rose-100 text-rose-800',
  }
  return (
    <span className={['inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', map[tone]].join(' ')}>
      {children}
    </span>
  )
}

