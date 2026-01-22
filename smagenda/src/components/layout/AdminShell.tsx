import { Link, useLocation } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useAuth } from '../../state/auth/useAuth'
import { Button } from '../ui/Button'

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { signOut, impersonation, stopImpersonation } = useAuth()
  const location = useLocation()
  const [temaTick, setTemaTick] = useState(0)
  const temaProspector = useMemo(() => {
    void temaTick
    try {
      const v = window.localStorage.getItem('smagenda:admin:theme')
      return v === 'prospector'
    } catch {
      return false
    }
  }, [temaTick])
  const nav = [
    { to: '/admin/dashboard', label: 'Dashboard' },
    { to: '/admin/clientes', label: 'Todos os Clientes' },
    { to: '/admin/pagamentos', label: 'Pagamentos' },
    { to: '/admin/whatsapp', label: 'WhatsApp Avisos' },
    { to: '/admin/logs', label: 'Logs de Auditoria' },
    { to: '/admin/configuracoes', label: 'Configurações' },
  ]
  return (
    <div className={["min-h-screen bg-slate-50", temaProspector ? 'theme-prospector' : ''].filter(Boolean).join(' ')}>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold tracking-wide text-slate-500">SMagenda</div>
            <div className="text-lg font-semibold text-slate-900">Super Admin</div>
          </div>
          <div className="flex items-center gap-2">
            {impersonation ? (
              <Button
                variant="secondary"
                onClick={() => {
                  stopImpersonation()
                }}
              >
                Parar impersonation
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => {
                const next = !temaProspector
                setTemaTick((v) => v + 1)
                try {
                  window.localStorage.setItem('smagenda:admin:theme', next ? 'prospector' : 'light')
                } catch {
                  void 0
                }
              }}
            >
              {temaProspector ? 'Tema padrão' : 'Tema Prospector'}
            </Button>
            <Button variant="secondary" onClick={() => signOut()}>
              Sair
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
          <nav className="md:sticky md:top-6 md:h-fit">
            <div className="rounded-xl border border-slate-200 bg-white p-2">
              {nav.map((item) => {
                const active = location.pathname === item.to
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={[
                      'block rounded-lg px-3 py-2 text-sm font-medium',
                      active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
                    ].join(' ')}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </nav>
          <main>{children}</main>
        </div>
      </div>
    </div>
  )
}
