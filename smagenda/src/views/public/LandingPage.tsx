import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../state/auth/useAuth'

export function LandingPage() {
  const { appPrincipal, loading } = useAuth()

  if (!loading && appPrincipal) {
    if (appPrincipal.kind === 'funcionario') return <Navigate to="/funcionario/agenda" replace />
    if (appPrincipal.kind === 'super_admin') return <Navigate to="/admin/dashboard" replace />
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="flex flex-col gap-8">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">SMagenda</div>
            <div className="flex items-center gap-3">
              <Link to="/login" className="text-sm font-semibold text-slate-900 hover:underline">
                Entrar
              </Link>
              <Link
                to="/cadastro"
                className="inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
              >
                Criar conta
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-center">
            <div className="space-y-4">
              <div className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Agendamentos online com WhatsApp, serviços e equipe
              </div>
              <div className="text-sm text-slate-700 sm:text-base">
                Compartilhe seu link público, organize agenda, clientes e profissionais, e automatize mensagens de confirmação e lembrete.
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/cadastro"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white"
                >
                  Começar agora
                </Link>
                <Link
                  to="/ajuda"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-900"
                >
                  Ver ajuda
                </Link>
              </div>

              <div className="text-xs text-slate-600">
                Ao criar conta você concorda com{' '}
                <Link to="/termos" className="font-medium text-slate-900 hover:underline">
                  Termos
                </Link>{' '}
                e{' '}
                <Link to="/privacidade" className="font-medium text-slate-900 hover:underline">
                  Privacidade
                </Link>
                .
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">O que você consegue fazer</div>
              <div className="mt-4 grid grid-cols-1 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">Link público</div>
                  <div className="mt-1 text-sm text-slate-700">Clientes escolhem serviço, dia e horário e confirmam.</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">Agenda e equipe</div>
                  <div className="mt-1 text-sm text-slate-700">Controle de profissionais, permissões e filtros de agenda.</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">Mensagens automáticas</div>
                  <div className="mt-1 text-sm text-slate-700">Confirmação e lembrete com templates personalizáveis.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Planos</div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
              {[
                { title: 'Free', desc: 'Para começar', items: ['Link público', 'Serviços', 'Agenda'] },
                { title: 'Basic', desc: 'Para rotina', items: ['Clientes', 'Relatórios', 'WhatsApp manual'] },
                { title: 'Pro', desc: 'Para crescer', items: ['Logo e fundo', 'Mais equipe', 'Automação'] },
                { title: 'Enterprise', desc: 'Para múltiplas unidades', items: ['Unidades', 'Equipe ampliada', 'Escala'] },
              ].map((p) => (
                <div key={p.title} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-sm font-semibold text-slate-900">{p.title}</div>
                  <div className="text-xs text-slate-600">{p.desc}</div>
                  <div className="mt-3 space-y-2">
                    {p.items.map((it) => (
                      <div key={it} className="text-sm text-slate-700">
                        {it}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-700">Pronto para começar?</div>
              <div className="flex gap-3">
                <Link to="/cadastro" className="inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">
                  Criar conta
                </Link>
                <Link
                  to="/login"
                  className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900"
                >
                  Entrar
                </Link>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-slate-600">
            <Link to="/ajuda" className="hover:underline">
              Ajuda
            </Link>
            <Link to="/termos" className="hover:underline">
              Termos
            </Link>
            <Link to="/privacidade" className="hover:underline">
              Privacidade
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

