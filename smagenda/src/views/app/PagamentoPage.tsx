import { useMemo, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { PageTutorial, TutorialOverlay } from '../../components/ui/TutorialOverlay'
import { useAuth } from '../../state/auth/useAuth'

type PlanKey = 'free' | 'basic' | 'pro' | 'team' | 'enterprise'

type PlanCard = {
  key: PlanKey
  title: string
  priceLabel: string
  subtitle: string
  bullets: string[]
}

type ServiceCard = {
  key: 'setup_completo' | 'consultoria_hora'
  title: string
  priceLabel: string
  bullets: string[]
}

export function PagamentoPage() {
  const { appPrincipal, refresh } = useAuth()
  const usuario = appPrincipal?.kind === 'usuario' ? appPrincipal.profile : null
  const usuarioId = usuario?.id ?? null

  const tutorialSteps = useMemo(
    () =>
      [
        {
          title: 'Escolha um plano',
          body: 'Selecione o plano ideal para seu negócio e veja o que está incluído.',
          target: 'plans' as const,
        },
        {
          title: 'Iniciar pagamento',
          body: 'Escolha PIX (30 dias) ou cartão (assinatura) para abrir o checkout em produção.',
          target: 'checkout' as const,
        },
        {
          title: 'Serviços avulsos',
          body: 'Use esta área para contratar setup completo ou consultoria, quando precisar.',
          target: 'services' as const,
        },
      ] as const,
    []
  )

  const [userSelectedPlan, setUserSelectedPlan] = useState<PlanKey | null>(null)
  const [selectedService, setSelectedService] = useState<ServiceCard['key'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [funcionariosTotal, setFuncionariosTotal] = useState<number | null>(null)

  const canShowFree = Boolean(usuario && usuario.plano === 'free' && usuario.status_pagamento === 'trial' && usuario.free_trial_consumido !== true)

  const plans = useMemo<PlanCard[]>(
    () =>
      [
        ...(canShowFree
          ? [
              {
                key: 'free' as const,
                title: 'FREE',
                priceLabel: 'R$ 0/mês',
                subtitle: 'Para testar',
                bullets: ['Até 30 agendamentos por mês', '1 profissional', 'Lembretes manuais (link do WhatsApp)', 'Suporte por email'],
              },
            ]
          : []),
        {
          key: 'basic',
          title: 'BASIC',
          priceLabel: 'R$ 34,99/mês',
          subtitle: '',
          bullets: ['Agendamentos 60 por mês', '1 profissional incluído', 'Lembretes automáticos via WhatsApp', 'Até 3 serviços', 'Página pública personalizável', 'Suporte por email'],
        },
        {
          key: 'pro',
          title: 'PRO',
          priceLabel: 'R$ 59,99/mês',
          subtitle: 'Até 6 profissionais (4 inclusos + até 2 adicionais)',
          bullets: ['4 profissionais incluídos', 'Serviços ilimitados', 'Logo e fotos de serviços', 'Relatórios', 'Bloqueios recorrentes', 'Suporte via WhatsApp'],
        },
        {
          key: 'enterprise',
          title: 'EMPRESA',
          priceLabel: 'R$ 98,99/mês',
          subtitle: 'Até 10 profissionais',
          bullets: ['Até 10 profissionais', 'Multi-unidades', 'Agendamentos ilimitados', 'Serviços ilimitados', 'Logo e fotos de serviços', 'Para mais profissionais, fale com o suporte'],
        },
      ] satisfies PlanCard[],
    [canShowFree]
  )

  const services = useMemo<ServiceCard[]>(
    () =>
      [
        { key: 'setup_completo', title: 'Setup Completo', priceLabel: 'R$ 150 (uma vez)', bullets: ['Configuramos tudo para você', 'Cadastramos serviços, fotos, horários', 'Testamos envios do WhatsApp apos conexão', 'Treinamos o cliente em 15 minutos'] },
        { key: 'consultoria_hora', title: 'Consultoria por Hora', priceLabel: 'R$ 80/hora', bullets: ['Ajuda com configurações avançadas', 'Sugestões de otimização', 'Dúvidas gerais'] },
      ] satisfies ServiceCard[],
    []
  )

  const currentPlan = useMemo<PlanKey>(() => {
    const current = (usuario?.plano ?? '').trim().toLowerCase() as PlanKey
    if (current === 'free') return canShowFree ? 'free' : 'basic'
    if (current === 'enterprise') return 'enterprise'
    if (current === 'team') return 'pro'
    if (current === 'basic' || current === 'pro') return current
    return 'basic'
  }, [canShowFree, usuario?.plano])

  const selectedPlan = userSelectedPlan ?? currentPlan

  const defaultFuncionariosTotal = useMemo(() => {
    const raw = usuario?.limite_funcionarios
    const n = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1
    return Math.max(1, Math.min(200, n))
  }, [usuario?.limite_funcionarios])

  const includedPro = 4
  const maxPro = 6
  const defaultProFuncionariosTotal = useMemo(() => {
    return Math.min(maxPro, Math.max(includedPro, defaultFuncionariosTotal))
  }, [defaultFuncionariosTotal, includedPro, maxPro])

  const effectiveFuncionariosTotal = funcionariosTotal ?? (selectedPlan === 'pro' ? defaultProFuncionariosTotal : defaultFuncionariosTotal)

  const startPlanCheckout = async (_metodo: 'card' | 'pix') => {
    if (!usuarioId) return
    const plan = selectedPlan
    if (!plan || plan === 'free') {
      setError('Selecione um plano válido.')
      return
    }

    const requested = plan === 'pro' ? Math.floor(effectiveFuncionariosTotal || includedPro) : 1
    if (plan === 'pro' && requested > maxPro) {
      setUserSelectedPlan('enterprise')
      setFuncionariosTotal(null)
      setError('Para mais de 6 profissionais, selecione o plano EMPRESA.')
      return
    }

    setError('Pagamento automático indisponível no momento. Tente mais tarde.')
  }

  const startServiceCheckout = async (_metodo: 'card' | 'pix') => {
    if (!usuarioId || !selectedService) return
    setError('Pagamento automático indisponível no momento. Tente mais tarde.')
  }

  const formatStatusPagamento = (value: string) => {
    const v = String(value ?? '').trim().toLowerCase()
    if (!v) return '—'
    if (v === 'ativo') return 'Ativo'
    if (v === 'trial') return 'Trial'
    if (v === 'inadimplente') return 'Inadimplente'
    if (v === 'suspenso') return 'Suspenso'
    if (v === 'cancelado') return 'Cancelado'
    return value
  }

  if (!usuarioId || !usuario) {
    return (
      <AppShell>
        <div className="text-slate-700">{appPrincipal ? 'Acesso restrito.' : 'Carregando…'}</div>
      </AppShell>
    )
  }

  const statusTone = usuario.status_pagamento === 'inadimplente' ? 'red' : usuario.status_pagamento === 'ativo' ? 'green' : 'slate'

  const planoLabel = (planoRaw: string) => {
    const p = String(planoRaw ?? '').trim().toLowerCase()
    if (p === 'enterprise') return 'EMPRESA'
    if (p === 'team') return 'PRO'
    if (p === 'pro') return 'PRO'
    if (p === 'basic') return 'BASIC'
    if (p === 'free') return 'FREE'
    return planoRaw
  }

  return (
    <PageTutorial usuarioId={usuarioId} page="pagamento">
      {({ tutorialOpen, tutorialStep, setTutorialStep, resetTutorial, closeTutorial }) => (
        <AppShell>
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-500">Configurações</div>
                <div className="text-xl font-semibold text-slate-900">Pagamento e planos</div>
              </div>
              <Button variant="secondary" onClick={resetTutorial}>
                Rever tutorial
              </Button>
            </div>

            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

            <div
              className={
                tutorialOpen && tutorialSteps[tutorialStep]?.target === 'plans'
                  ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
                  : ''
              }
            >
              <Card>
                <div className="p-6 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Pagamento</div>
                      <div className="text-sm text-slate-600">Plano atual: {planoLabel(usuario.plano)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={usuario.ativo ? 'green' : 'red'}>{usuario.ativo ? 'Conta: Ativa' : 'Conta: Inativa'}</Badge>
                      <Badge tone={statusTone}>Pagamento: {formatStatusPagamento(usuario.status_pagamento)}</Badge>
                      <Button variant="secondary" onClick={() => void refresh()}>
                        Atualizar status
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {plans.map((p) => {
                      const selected = selectedPlan === p.key
                      const clickable = p.key !== 'free'
                      const best = p.key === 'pro'
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => {
                            if (!clickable) return
                            setUserSelectedPlan(p.key)
                            setFuncionariosTotal(null)
                          }}
                          className={[
                            'text-left rounded-xl border bg-white p-4 transition',
                            best
                              ? selected
                                ? 'border-slate-900 ring-2 ring-slate-900/10 bg-amber-50'
                                : 'border-amber-300 hover:bg-amber-50'
                              : selected
                                ? 'border-slate-900 ring-2 ring-slate-900/10'
                                : 'border-slate-200 hover:bg-slate-50',
                            clickable ? '' : 'cursor-default',
                          ].join(' ')}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{p.title}</div>
                              <div className="text-xs text-slate-600">
                                {p.priceLabel}
                                {p.subtitle ? ` • ${p.subtitle}` : ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {best ? <Badge tone="yellow">Melhor opção</Badge> : null}
                              {selected ? <Badge tone="slate">Selecionado</Badge> : null}
                            </div>
                          </div>
                          <div className="mt-3 space-y-1">
                            {p.bullets.map((b) => (
                              <div key={b} className="text-xs text-slate-700">
                                - {b}
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 text-[11px] text-slate-500">Valores de pré-venda • válido até 08/02/2026.</div>
                        </button>
                      )
                    })}
                  </div>

            {selectedPlan === 'pro' ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Profissionais"
                  type="number"
                  min={includedPro}
                  max={maxPro}
                  value={String(effectiveFuncionariosTotal)}
                  onChange={(e) => {
                    const raw = e.target.value
                    const n = raw.trim() === '' ? includedPro : Number(raw)
                    if (!Number.isFinite(n)) return
                    const i = Math.floor(n)
                    if (i > maxPro) {
                      setUserSelectedPlan('enterprise')
                      setFuncionariosTotal(null)
                      setError('Para mais de 6 profissionais, selecione o plano EMPRESA.')
                      return
                    }
                    const clamped = Math.max(includedPro, Math.min(maxPro, i))
                    setFuncionariosTotal(clamped)
                  }}
                />
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 flex items-center">
                  O checkout calcula 4 profissionais inclusos + adicional por profissional acima de 4 (máximo 6 no PRO).
                </div>
              </div>
            ) : null}

                  <div
                    className={
                      tutorialOpen && tutorialSteps[tutorialStep]?.target === 'checkout'
                        ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl p-2 -m-2'
                        : ''
                    }
                  >
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="secondary" onClick={() => void startPlanCheckout('pix')} disabled={selectedPlan === 'free'}>
                        PIX (30 dias)
                      </Button>
                      <Button onClick={() => void startPlanCheckout('card')} disabled={selectedPlan === 'free'}>
                        Cartão (assinatura)
                      </Button>
                    </div>
                  </div>

                  {usuario.status_pagamento === 'ativo' ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
                      Para alterações de pagamento, entre em contato com o suporte.
                    </div>
                  ) : null}
                </div>
              </Card>
            </div>

            <div
              className={
                tutorialOpen && tutorialSteps[tutorialStep]?.target === 'services'
                  ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
                  : ''
              }
            >
              <Card>
                <div className="p-6 space-y-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Serviços</div>
                    <div className="text-sm text-slate-600">Contrate serviços avulsos para configuração e suporte.</div>
                  </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {services.map((s) => {
                const selected = selectedService === s.key
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSelectedService(s.key)}
                    className={[
                      'text-left rounded-xl border bg-white p-4 transition',
                      selected ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{s.title}</div>
                        <div className="text-xs text-slate-600">{s.priceLabel}</div>
                      </div>
                      {selected ? <Badge tone="slate">Selecionado</Badge> : null}
                    </div>
                    <div className="mt-3 space-y-1">
                      {s.bullets.map((b) => (
                        <div key={b} className="text-xs text-slate-700">
                          - {b}
                        </div>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="secondary" onClick={() => void startServiceCheckout('pix')} disabled={!selectedService}>
                      Pagar com PIX
                    </Button>
                    <Button onClick={() => void startServiceCheckout('card')} disabled={!selectedService}>
                      Pagar com cartão
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            <TutorialOverlay
              open={tutorialOpen}
              steps={tutorialSteps}
              step={tutorialStep}
              onStepChange={setTutorialStep}
              onClose={closeTutorial}
              titleFallback="Pagamento"
            />
          </div>
        </AppShell>
      )}
    </PageTutorial>
  )
}
