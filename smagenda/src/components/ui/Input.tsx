import { useState, type InputHTMLAttributes } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
}

export function Input({ label, className, type, ...props }: Props) {
  const isPassword = String(type ?? '') === 'password'
  const [showPassword, setShowPassword] = useState(false)

  const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type

  return (
    <label className="block">
      {label ? <div className="text-sm font-medium text-slate-700 mb-1">{label}</div> : null}
      <div className="relative">
        <input
          className={[
            'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300',
            isPassword ? 'pr-12' : '',
            className ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
          type={effectiveType}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {showPassword ? 'Ocultar' : 'Ver'}
          </button>
        ) : null}
      </div>
    </label>
  )
}
