import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../state/auth/useAuth'
import { Button } from '../ui/Button'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { principal, signOut } = useAuth()
  const location = useLocation()
  const isFuncionario = principal?.kind === 'funcionario'

  const nav = isFuncionario
    ? [
        { to: '/funcionario/agenda', label: 'Minha Agenda' },
        { to: '/configuracoes/mensagens', label: 'Mensagens' },
      ]
    : [
        { to: '/dashboard', label: 'Agenda' },
        { to: '/servicos', label: 'Meus Serviços' },
        { to: '/funcionarios', label: 'Funcionários' },
        { to: '/configuracoes/whatsapp', label: 'WhatsApp' },
        { to: '/configuracoes/mensagens', label: 'Mensagens Automáticas' },
        { to: '/configuracoes/pagina-publica', label: 'Página Pública' },
      ]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold tracking-wide text-slate-500">SMagenda</div>
            <div className="text-lg font-semibold text-slate-900">
              {principal?.kind === 'usuario'
                ? principal.profile.nome_negocio
                : principal?.kind === 'funcionario'
                  ? `Olá, ${principal.profile.nome_completo}`
                  : ''}
            </div>
          </div>
          <Button variant="secondary" onClick={() => signOut()}>
            Sair
          </Button>
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
