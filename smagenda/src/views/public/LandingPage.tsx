import { useCallback, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { getOptionalEnv, getPublicBrandConfig } from '../../lib/env'
import { useAuth } from '../../state/auth/useAuth'

function normalizeWhatsApp(value: string) {
  const digits = value.replace(/\D+/g, '')
  if (!digits) return null
  if (digits.startsWith('55')) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

export function LandingPage() {
  const { appPrincipal, loading } = useAuth()
  const brand = useMemo(() => getPublicBrandConfig(), [])
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'error'>('idle')

  const supportWhatsAppRaw = (
    getOptionalEnv('VITE_SUPORTE_WHATSAPP') ??
    getOptionalEnv('VITE_SUPPORT_WHATSAPP_NUMBER') ??
    getOptionalEnv('VITE_SUPPORT_WHATSAPP') ??
    ''
  ).trim()
  const supportWhatsAppDigits = supportWhatsAppRaw ? normalizeWhatsApp(supportWhatsAppRaw) : null
  const waLink = supportWhatsAppDigits
    ? `https://wa.me/${supportWhatsAppDigits}?text=${encodeURIComponent('Olá! Quero conhecer os planos do SMagenda.')}`
    : null

  const preSaleUntilLabel = '08/02/2026'
  const isPreSale = useMemo(() => {
    const now = new Date()
    const end = new Date(2026, 1, 8, 23, 59, 59, 999)
    return now.getTime() <= end.getTime()
  }, [])

  const plans = useMemo(
    () =>
      [
        {
          key: 'basic',
          title: 'BASIC',
          priceLabel: 'R$ 34,99/mês',
          subtitle: 'Ideal para começar com 1 profissional',
          bullets: ['Agendamentos 60 por mês', '1 profissional incluído', 'Lembretes automáticos via WhatsApp', 'Até 3 serviços', 'Página pública personalizável'],
          highlight: false,
        },
        {
          key: 'pro',
          title: 'PRO',
          priceLabel: 'R$ 59,99/mês',
          subtitle: 'Até 6 profissionais (4 inclusos + até 2 adicionais)',
          bullets: ['4 profissionais incluídos', 'Serviços ilimitados', 'Logo e fotos de serviços', 'Relatórios', 'Bloqueios recorrentes'],
          highlight: true,
        },
        {
          key: 'enterprise',
          title: 'EMPRESA',
          priceLabel: 'R$ 98,99/mês',
          subtitle: 'Até 10 profissionais',
          bullets: ['Até 10 profissionais', 'Multi-unidades', 'Agendamentos ilimitados', 'Serviços ilimitados', 'Para mais profissionais, fale com o suporte'],
          highlight: false,
        },
      ] as const,
    []
  )

  const exampleBookingUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return origin ? `${origin}/agendar/seu-negocio` : '/agendar/seu-negocio'
  }, [])

  const copyExampleUrl = useCallback(async () => {
    try {
      if (!navigator?.clipboard?.writeText) {
        setCopyState('error')
        return
      }
      await navigator.clipboard.writeText(exampleBookingUrl)
      setCopyState('ok')
      window.setTimeout(() => setCopyState('idle'), 1400)
    } catch {
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 1800)
    }
  }, [exampleBookingUrl])

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
              {brand.companyLogoUrl ? (
                <div className="flex items-center rounded-xl bg-white/5 px-2 py-1 ring-1 ring-white/10">
                  <img src={brand.companyLogoUrl} alt={brand.companyName} className="h-6 w-auto" />
                </div>
              ) : (
                <>
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
                </>
              )}
              <div>
                <div className="text-sm font-semibold leading-tight">{brand.productName}</div>
                <div className="text-xs text-white/60 leading-tight">por {brand.companyName}</div>
              </div>
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
                Agendamentos online com painel completo
              </div>
              <div className="max-w-xl text-base leading-relaxed text-white/80">
                Link público para clientes agendarem em poucos cliques, agenda com profissionais, serviços e mensagens automáticas no WhatsApp.
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  to="/cadastro"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-semibold text-slate-950"
                >
                  Criar minha conta
                </Link>
                <a
                  href="#planos"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-white/10 px-5 text-sm font-semibold text-white ring-1 ring-white/10"
                >
                  Ver planos
                </a>
                {waLink ? (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-400/15 px-5 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-300/20"
                  >
                    Falar no WhatsApp
                  </a>
                ) : null}
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
                  <div className="text-xs font-semibold text-white/70">Painel {brand.productName}</div>
                  <div className="h-5 w-16 rounded-lg bg-white/5" />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { title: 'Agendamentos', value: 'Organizados', color: 'bg-cyan-400/20 text-cyan-200 ring-cyan-400/30' },
                      { title: 'Clientes', value: 'Centralizados', color: 'bg-indigo-500/20 text-indigo-200 ring-indigo-400/30' },
                      { title: 'Equipe', value: 'Com permissões', color: 'bg-fuchsia-500/20 text-fuchsia-200 ring-fuchsia-400/30' },
                    ].map((k) => (
                      <div key={k.title} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs font-semibold text-white/70">{k.title}</div>
                        <div className="mt-2">
                          <div className={['inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ring-1', k.color].join(' ')}>
                            {k.value}
                          </div>
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
                      <button
                        type="button"
                        onClick={copyExampleUrl}
                        className="inline-flex h-9 items-center rounded-xl bg-white px-3 text-xs font-semibold text-slate-950"
                      >
                        {copyState === 'ok' ? 'Copiado!' : copyState === 'error' ? 'Falhou' : 'Copiar'}
                      </button>
                    </div>
                    <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-xs text-white/70">
                      Exemplo: {exampleBookingUrl}
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

          <div className="pb-14">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-xs font-semibold tracking-wide text-white/60">Para quem é</div>
                  <div className="mt-2 text-2xl font-semibold">Feito para negócios com agenda e equipe</div>
                  <div className="mt-2 text-sm text-white/70">Funciona bem para atendimentos com horários, profissionais e regras por serviço.</div>
                </div>
                <Link
                  to="/cadastro"
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-white/10 px-4 text-sm font-semibold text-white ring-1 ring-white/10"
                >
                  Começar agora
                </Link>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { title: 'Barbearias e salões', desc: 'Serviços com duração fixa, buffers e profissionais.' },
                  { title: 'Clínicas e consultórios', desc: 'Histórico de clientes e lembretes automáticos.' },
                  { title: 'Estúdios e aulas', desc: 'Horários recorrentes e organização por equipe.' },
                  { title: 'Lava-jato', desc: 'Serviços por tempo e automações no WhatsApp.' },
                  { title: 'Serviços em domicílio', desc: 'Link público e regras de antecedência.' },
                  { title: 'Negócios multi-unidade', desc: 'Estrutura para planos com unidades (quando habilitado).' },
                ].map((s) => (
                  <div key={s.title} className="rounded-3xl border border-white/10 bg-slate-950/20 p-5">
                    <div className="text-sm font-semibold">{s.title}</div>
                    <div className="mt-2 text-sm text-white/70">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pb-14">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:items-start">
                <div>
                  <div className="text-xs font-semibold tracking-wide text-white/60">Diferenciais</div>
                  <div className="mt-2 text-2xl font-semibold">Mais controle, menos trabalho manual</div>
                  <div className="mt-2 text-sm text-white/70">
                    Feito para reduzir no-show, organizar a equipe e padronizar a comunicação com o cliente.
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {[
                      {
                        title: 'Regras por serviço',
                        desc: 'Antecedência, janela máxima, buffers e suporte a serviços de dia inteiro.',
                      },
                      {
                        title: 'Permissões por função',
                        desc: 'Gerente, atendente e profissional com acessos alinhados ao seu fluxo.',
                      },
                      {
                        title: 'WhatsApp com variáveis',
                        desc: 'Confirmação e lembrete com dados reais do agendamento, sem copiar e colar.',
                      },
                      {
                        title: 'Identidade no link público',
                        desc: 'Cores e aparência para passar confiança na hora do cliente agendar (conforme plano).',
                      },
                    ].map((d) => (
                      <div key={d.title} className="rounded-3xl border border-white/10 bg-slate-950/20 p-5">
                        <div className="text-sm font-semibold">{d.title}</div>
                        <div className="mt-2 text-sm text-white/70">{d.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
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

          <div id="planos" className="mt-10 rounded-[28px] border border-white/10 bg-white/5 p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-semibold tracking-wide text-white/60">Planos</div>
                <div className="mt-2 text-2xl font-semibold">Escolha um plano e comece hoje</div>
                <div className="mt-2 text-sm text-white/70">Agendamento online + automações no WhatsApp + gestão de equipe.</div>
                {isPreSale ? <div className="mt-3 text-[11px] text-white/60">Valores de pré-venda • válido até {preSaleUntilLabel}.</div> : null}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  to="/cadastro"
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950"
                >
                  Criar conta e escolher plano
                </Link>
                {waLink ? (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-white/10 px-4 text-sm font-semibold text-white ring-1 ring-white/10"
                  >
                    Tirar dúvidas no WhatsApp
                  </a>
                ) : null}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {plans.map((p) => (
                <div
                  key={p.key}
                  className={
                    p.highlight
                      ? 'relative rounded-3xl border border-emerald-300/20 bg-emerald-400/10 p-5 ring-1 ring-emerald-300/20'
                      : 'rounded-3xl border border-white/10 bg-slate-950/20 p-5'
                  }
                >
                  {p.highlight ? (
                    <div className="absolute -top-3 left-5 inline-flex items-center rounded-full bg-emerald-300/20 px-3 py-1 text-[11px] font-semibold text-emerald-100 ring-1 ring-emerald-300/30">
                      Mais escolhido
                    </div>
                  ) : null}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold">{p.title}</div>
                      <div className="mt-1 text-xs text-white/60">{p.subtitle}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold">{p.priceLabel}</div>
                      <div className="mt-1 text-[11px] text-white/60">por negócio</div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-white/75">
                    {p.bullets.map((b) => (
                      <div key={b} className="flex gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/50" />
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5">
                    <Link
                      to="/cadastro"
                      className={
                        p.highlight
                          ? 'inline-flex h-10 w-full items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950'
                          : 'inline-flex h-10 w-full items-center justify-center rounded-xl bg-white/10 px-4 text-sm font-semibold text-white ring-1 ring-white/10'
                      }
                    >
                      Começar com {p.title}
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                { title: 'Checkout em produção', desc: 'Pagamento via PIX (30 dias) ou cartão (assinatura).' },
                { title: 'Cancelamento simples', desc: 'Você controla sua assinatura dentro do painel.' },
                { title: 'Suporte humano', desc: waLink && supportWhatsAppRaw ? `Atendimento via WhatsApp: ${supportWhatsAppRaw}` : 'Atendimento via WhatsApp e email.' },
              ].map((s) => (
                <div key={s.title} className="rounded-3xl border border-white/10 bg-slate-950/20 p-5">
                  <div className="text-sm font-semibold">{s.title}</div>
                  <div className="mt-2 text-sm text-white/70">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 rounded-[28px] border border-white/10 bg-white/5 p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-semibold tracking-wide text-white/60">Dúvidas frequentes</div>
                <div className="mt-2 text-2xl font-semibold">Perguntas comuns antes de começar</div>
              </div>
              <Link to="/ajuda" className="text-sm font-semibold text-white/80 hover:text-white">
                Ver ajuda
              </Link>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                {
                  q: 'O cliente precisa instalar aplicativo?',
                  a: 'Não. Ele agenda pelo link público no navegador (celular ou PC).',
                },
                {
                  q: 'Como funciona a cobrança?',
                  a: 'No painel, você escolhe PIX (30 dias) ou cartão (assinatura).',
                },
                {
                  q: 'Consigo reduzir faltas (no-show)?',
                  a: 'Sim. Use confirmações e lembretes automáticos no WhatsApp para padronizar o atendimento.',
                },
                {
                  q: 'Dá para ter equipe com acessos diferentes?',
                  a: 'Sim. Permissões por função para organizar rotina e evitar alterações indevidas.',
                },
                {
                  q: 'Meu link pode ter minha identidade?',
                  a: 'Sim. Aparência da página pública com cores e, conforme plano, logo e fundo.',
                },
                {
                  q: 'O que muda entre BASIC, PRO e EMPRESA?',
                  a: 'Principalmente limites (agendamentos e profissionais) e recursos como relatórios, multi-unidades e personalização completa.',
                },
              ].map((f) => (
                <div key={f.q} className="rounded-3xl border border-white/10 bg-slate-950/20 p-5">
                  <div className="text-sm font-semibold">{f.q}</div>
                  <div className="mt-2 text-sm text-white/70">{f.a}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 rounded-[28px] border border-white/10 bg-white/5 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-lg font-semibold">Quer ver o {brand.productName} rodando?</div>
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
            <div className="mt-4 text-center text-xs text-white/40">
              © {new Date().getFullYear()} {brand.companyName} — {brand.productName}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
