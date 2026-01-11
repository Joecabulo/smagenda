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
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/20 via-slate-950 to-slate-950" />
        <div className="absolute -top-40 left-1/2 h-[560px] w-[860px] -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500/25 via-cyan-400/15 to-fuchsia-500/20 blur-3xl" />
        <svg
          className="absolute inset-0 h-full w-full opacity-[0.14]"
          viewBox="0 0 1200 800"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <defs>
            <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
              <path d="M 42 0 L 0 0 0 42" stroke="rgba(148,163,184,0.35)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="1200" height="800" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative">
        <div className="mx-auto w-full max-w-6xl px-4">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/10">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                  <path
                    d="M7 7h10M7 12h10M7 17h7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="text-sm font-semibold">SMagenda</div>
            </div>

            <div className="flex items-center gap-3">
              <Link to="/login" className="hidden text-sm font-semibold text-white/80 hover:text-white sm:inline">
                Entrar
              </Link>
              <Link
                to="/cadastro"
                className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950"
              >
                Criar conta
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-10 pb-14 pt-10 md:grid-cols-2 md:items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 ring-1 ring-white/10">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Agendamentos, WhatsApp e equipe em um só lugar
              </div>

              <div className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Apresente seu negócio com um link e organize tudo no painel
              </div>
              <div className="max-w-xl text-base leading-relaxed text-white/80">
                Link público para seus clientes, agenda com profissionais, serviços e automações de confirmação e lembrete.
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  to="/cadastro"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-semibold text-slate-950"
                >
                  Criar minha conta
                </Link>
                <Link
                  to="/ajuda"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-white/10 px-5 text-sm font-semibold text-white ring-1 ring-white/10"
                >
                  Ver como funciona
                </Link>
              </div>

              <div className="text-xs text-white/60">
                Ao criar conta você concorda com{' '}
                <Link to="/termos" className="font-semibold text-white/80 hover:text-white">
                  Termos
                </Link>{' '}
                e{' '}
                <Link to="/privacidade" className="font-semibold text-white/80 hover:text-white">
                  Privacidade
                </Link>
                .
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-r from-indigo-500/25 via-cyan-400/15 to-fuchsia-500/20 blur-2xl" />
              <div className="relative rounded-[28px] border border-white/10 bg-slate-900/40 p-4 shadow-2xl">
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                  </div>
                  <div className="text-xs font-semibold text-white/70">Painel SMagenda</div>
                  <div className="h-5 w-16 rounded-lg bg-white/5" />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { title: 'Agendamentos', value: 'Hoje', color: 'bg-cyan-400/20 text-cyan-200 ring-cyan-400/30' },
                      { title: 'Clientes', value: 'Ativos', color: 'bg-indigo-500/20 text-indigo-200 ring-indigo-400/30' },
                      { title: 'Equipe', value: 'Online', color: 'bg-fuchsia-500/20 text-fuchsia-200 ring-fuchsia-400/30' },
                    ].map((k) => (
                      <div key={k.title} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs font-semibold text-white/70">{k.title}</div>
                        <div className="mt-2 flex items-center gap-2">
                          <div className={['inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ring-1', k.color].join(' ')}>
                            {k.value}
                          </div>
                          <div className="h-2 w-full rounded-full bg-white/10" />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold">Link público de agendamento</div>
                        <div className="mt-1 text-xs text-white/60">Compartilhe com clientes para reservar horários</div>
                      </div>
                      <div className="inline-flex h-9 items-center rounded-xl bg-white px-3 text-xs font-semibold text-slate-950">Copiar</div>
                    </div>
                    <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-xs text-white/70">
                      smagenda.com/agendar/seu-negocio
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {[
                      { title: 'Confirmação', desc: 'Mensagem automática após agendar' },
                      { title: 'Lembrete', desc: 'Aviso antes do horário marcado' },
                    ].map((b) => (
                      <div key={b.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/10">
                            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-white">
                              <path
                                d="M8 12l2.5 2.5L16 9"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                          <div className="text-sm font-semibold">{b.title}</div>
                        </div>
                        <div className="mt-2 text-xs text-white/65">{b.desc}</div>
                        <div className="mt-3 h-2 w-full rounded-full bg-white/10" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pb-14">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                {
                  title: 'Link público com cara do seu negócio',
                  desc: 'Cores, logo e fundo (conforme plano). Cliente agenda em poucos cliques.',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                      <path
                        d="M10.5 13.5L13.5 10.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M8 16a4 4 0 010-5.657l1.343-1.343A4 4 0 0115 9"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M16 8a4 4 0 010 5.657l-1.343 1.343A4 4 0 019 15"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  ),
                },
                {
                  title: 'Agenda, serviços e profissionais',
                  desc: 'Organize horários, regras por serviço e visibilidade por permissões.',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                      <path d="M8 7V5m8 2V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path
                        d="M6 9h12M7 19h10a2 2 0 002-2V8a2 2 0 00-2-2H7a2 2 0 00-2 2v9a2 2 0 002 2z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ),
                },
                {
                  title: 'Automação no WhatsApp',
                  desc: 'Templates de confirmação e lembrete, com variáveis do agendamento.',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                      <path
                        d="M21 12a8 8 0 01-8 8H7l-4 2 1.2-3.6A8 8 0 1121 12z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path d="M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M8 9h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  ),
                },
              ].map((f) => (
                <div key={f.title} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">
                      {f.icon}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{f.title}</div>
                      <div className="mt-1 text-sm text-white/70">{f.desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {[
                {
                  step: '1',
                  title: 'Cadastre serviços e horários',
                  desc: 'Defina duração, regras e disponibilidade por profissional.',
                },
                {
                  step: '2',
                  title: 'Compartilhe seu link público',
                  desc: 'O cliente escolhe serviço, dia e horário e confirma.',
                },
                {
                  step: '3',
                  title: 'Envie confirmações e lembretes',
                  desc: 'Templates prontos e personalizáveis no WhatsApp.',
                },
              ].map((s) => (
                <div key={s.step} className="rounded-3xl border border-white/10 bg-slate-950/20 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-sm font-semibold text-slate-950">
                      {s.step}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{s.title}</div>
                      <div className="mt-1 text-sm text-white/70">{s.desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 rounded-[28px] border border-white/10 bg-white/5 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-lg font-semibold">Quer ver o SMagenda rodando?</div>
                <div className="mt-1 text-sm text-white/70">Crie sua conta e configure seu link público em minutos.</div>
              </div>
              <div className="flex gap-3">
                <Link to="/cadastro" className="inline-flex h-11 items-center rounded-xl bg-white px-5 text-sm font-semibold text-slate-950">
                  Criar conta
                </Link>
                <Link
                  to="/login"
                  className="inline-flex h-11 items-center rounded-xl bg-white/10 px-5 text-sm font-semibold text-white ring-1 ring-white/10"
                >
                  Entrar
                </Link>
              </div>
            </div>
          </div>

          <div className="py-10">
            <div className="flex flex-wrap items-center justify-center gap-5 text-sm text-white/70">
              <Link to="/ajuda" className="hover:text-white">
                Ajuda
              </Link>
              <Link to="/termos" className="hover:text-white">
                Termos
              </Link>
              <Link to="/privacidade" className="hover:text-white">
                Privacidade
              </Link>
            </div>
            <div className="mt-4 text-center text-xs text-white/40">© {new Date().getFullYear()} SMagenda by SingleMotion</div>
          </div>
        </div>
      </div>
    </div>
  )
}
