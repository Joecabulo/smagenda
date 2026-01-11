import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../state/auth/useAuth'
import { getOptionalEnv } from '../../lib/env'
import { Button } from '../ui/Button'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { principal, appPrincipal, impersonation, stopImpersonation, signOut, masterUsuario } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const isFuncionario = appPrincipal?.kind === 'funcionario'
  const isFuncionarioAdmin = appPrincipal?.kind === 'funcionario' && appPrincipal.profile.permissao === 'admin'
  const funcionario = appPrincipal?.kind === 'funcionario' ? appPrincipal.profile : null
  const usuario = appPrincipal?.kind === 'usuario' ? appPrincipal.profile : isFuncionarioAdmin ? masterUsuario : null

  const plano = String(usuario?.plano ?? '').trim().toLowerCase()
  const isProPlus = plano === 'pro' || plano === 'team' || plano === 'enterprise'

  const supportNumber = getOptionalEnv('VITE_SUPPORT_WHATSAPP_NUMBER')
  const canUseWhatsappSupport = Boolean(supportNumber && usuario && isProPlus)

  const nav = isFuncionario && !isFuncionarioAdmin
    ? [
        { to: '/funcionario/agenda', label: 'Minha Agenda' },
        { to: '/ajuda', label: 'Ajuda' },
      ]
    : isFuncionarioAdmin
      ? [
          ...(funcionario?.pode_ver_agenda ? [{ to: '/dashboard', label: 'Agenda' }] : []),
          ...(funcionario?.pode_ver_agenda ? [{ to: '/funcionario/agenda', label: 'Minha Agenda' }] : []),
          ...(funcionario?.pode_gerenciar_servicos ? [{ to: '/servicos', label: 'Meus Serviços' }] : []),
          ...(funcionario?.pode_ver_clientes_de_outros ? [{ to: '/clientes', label: 'Clientes' }] : []),
          ...(isProPlus && funcionario?.pode_ver_financeiro ? [{ to: '/relatorios', label: 'Relatórios' }] : []),
          { to: '/ajuda', label: 'Ajuda' },
        ]
      : [
          { to: '/dashboard', label: 'Agenda' },
          { to: '/servicos', label: 'Meus Serviços' },
          { to: '/clientes', label: 'Clientes' },
          ...(isProPlus ? [{ to: '/relatorios', label: 'Relatórios' }] : []),
          { to: '/pagamento', label: 'Pagamento' },
          { to: '/funcionarios', label: 'Funcionários' },
          { to: '/configuracoes/whatsapp', label: 'WhatsApp' },
          { to: '/configuracoes/mensagens', label: 'Mensagens Automáticas' },
          { to: '/configuracoes/pagina-publica', label: 'Página Pública' },
          { to: '/ajuda', label: 'Ajuda' },
        ]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold tracking-wide text-slate-500">SMagenda</div>
            <div className="text-lg font-semibold text-slate-900">
              {appPrincipal?.kind === 'usuario'
                ? appPrincipal.profile.nome_negocio
                : appPrincipal?.kind === 'funcionario'
                  ? `Olá, ${appPrincipal.profile.nome_completo}`
                  : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canUseWhatsappSupport ? (
              <a
                className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-300 bg-emerald-600 text-white hover:bg-emerald-500"
                href={`https://wa.me/${encodeURIComponent(String(supportNumber))}?text=${encodeURIComponent('Olá! Preciso de suporte no SMagenda.')}`}
                target="_blank"
                rel="noreferrer"
              >
                Suporte WhatsApp
              </a>
            ) : null}
            {principal?.kind === 'super_admin' && impersonation ? (
              <Button
                variant="secondary"
                onClick={() => {
                  stopImpersonation()
                  navigate('/admin/clientes')
                }}
              >
                Voltar ao admin
              </Button>
            ) : null}
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
