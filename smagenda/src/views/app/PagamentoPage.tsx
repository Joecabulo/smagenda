import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { PageTutorial, TutorialOverlay } from '../../components/ui/TutorialOverlay'
import { checkJwtProject, supabase, supabaseEnv } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

type FnResult = { ok: true; status: number; body: unknown } | { ok: false; status: number; body: unknown }

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

async function callPaymentsFn(body: Record<string, unknown>): Promise<FnResult> {
  if (!supabaseEnv.ok) {
    return { ok: false as const, status: 0, body: { error: 'missing_supabase_env' } }
  }

  const supabaseUrl = String(supabaseEnv.values.VITE_SUPABASE_URL ?? '')
    .trim()
    .replace(/^['"`\s]+|['"`\s]+$/g, '')
    .replace(/\/+$/g, '')
  const supabaseAnonKey = String(supabaseEnv.values.VITE_SUPABASE_ANON_KEY ?? '')
    .trim()
    .replace(/^['"`\s]+|['"`\s]+$/g, '')
  const fnUrl = `${supabaseUrl}/functions/v1/payments`

  const tryRefresh = async () => {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
    if (refreshErr) return null
    return refreshed.session ?? null
  }

  const { data: sessionData } = await supabase.auth.getSession()
  let session = sessionData.session
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = session?.expires_at ?? null

  if (session && (!expiresAt || expiresAt <= now + 60)) {
    const refreshed = await tryRefresh()
    if (refreshed) session = refreshed
  }

  if (session) {
    const { error: userErr } = await supabase.auth.getUser()
    const userErrMsg = typeof userErr?.message === 'string' ? userErr.message : ''
    if (userErr && /invalid\s+jwt/i.test(userErrMsg)) {
      const refreshed = await tryRefresh()
      if (refreshed) session = refreshed
    }
  }

  const token = session?.access_token ?? null
  if (!token) {
    return { ok: false as const, status: 401, body: { error: 'session_expired' } }
  }

  const tokenProject = checkJwtProject(token, supabaseUrl)
  if (!tokenProject.ok) {
    await supabase.auth.signOut().catch(() => undefined)
    return { ok: false as const, status: 401, body: { error: 'jwt_project_mismatch', iss: tokenProject.iss, expected: tokenProject.expectedPrefix } }
  }

  const callFetch = async (jwt: string) => {
    let res: Response
    try {
      res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(body),
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha de rede'
      return { ok: false as const, status: 0, body: { error: 'network_error', message: msg } }
    }

    const text = await res.text()
    let parsed: unknown = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = text
    }

    if (!res.ok && res.status === 404) {
      const raw = typeof parsed === 'string' ? parsed : text
      if (typeof raw === 'string' && raw.includes('Requested function was not found')) {
        return {
          ok: false as const,
          status: 404,
          body: {
            error: 'function_not_deployed',
            message: 'A função payments não está publicada no Supabase. Faça deploy da Edge Function `payments` no seu projeto.',
          },
        }
      }
    }

    if (
      !res.ok &&
      res.status === 401 &&
      parsed &&
      typeof parsed === 'object' &&
      (parsed as Record<string, unknown>).message === 'Invalid JWT' &&
      (parsed as Record<string, unknown>).code === 401
    ) {
      return { ok: false as const, status: 401, body: { error: 'supabase_gateway_invalid_jwt' } }
    }

    if (!res.ok) console.error('payments error', { status: res.status, body: parsed, body_json: safeJson(parsed) })

    if (!res.ok) return { ok: false as const, status: res.status, body: parsed }
    return { ok: true as const, status: res.status, body: parsed }
  }

  const first = await callFetch(token)
  if (!first.ok && first.status === 401) {
    const refreshed = await tryRefresh()
    const nextToken = refreshed?.access_token ?? null
    if (!nextToken) {
      await supabase.auth.signOut().catch(() => undefined)
      return { ok: false as const, status: 401, body: { error: 'invalid_jwt' } }
    }
    const nextProject = checkJwtProject(nextToken, supabaseUrl)
    if (!nextProject.ok) {
      await supabase.auth.signOut().catch(() => undefined)
      return { ok: false as const, status: 401, body: { error: 'jwt_project_mismatch', iss: nextProject.iss, expected: nextProject.expectedPrefix } }
    }
    return callFetch(nextToken)
  }

  return first
}

async function createCheckoutPagamento(
  usuarioId: string,
  item: string,
  metodo: 'card' | 'pix',
  funcionariosTotal?: number | null
): Promise<FnResult> {
  const payload: Record<string, unknown> = { action: 'create_checkout', usuario_id: usuarioId, plano: item, metodo }
  if (typeof funcionariosTotal === 'number' && Number.isFinite(funcionariosTotal)) payload.funcionarios_total = funcionariosTotal
  return callPaymentsFn(payload)
}

async function syncCheckoutSessionPagamento(sessionId: string, usuarioId: string | null): Promise<FnResult> {
  const payload: Record<string, unknown> = { action: 'sync_checkout_session', session_id: sessionId }
  if (usuarioId) payload.usuario_id = usuarioId
  return callPaymentsFn(payload)
}

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
  const location = useLocation()
  const navigate = useNavigate()
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

  const [checkoutNotice, setCheckoutNotice] = useState<null | { kind: 'success' | 'cancel'; item: string | null }>(null)
  const [userSelectedPlan, setUserSelectedPlan] = useState<PlanKey | null>(null)
  const [selectedService, setSelectedService] = useState<ServiceCard['key'] | null>(null)
  const [creatingCheckout, setCreatingCheckout] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [funcionariosTotal, setFuncionariosTotal] = useState<number | null>(null)

  const formatCheckoutError = (status: number, body: unknown) => {
    if (typeof body === 'string' && body.trim()) return body
    if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>
      const err = typeof obj.error === 'string' ? obj.error : null
      const message = typeof obj.message === 'string' && obj.message.trim() ? obj.message.trim() : null
      if (message) {
        const stripeStatus = typeof obj.stripe_status === 'number' && Number.isFinite(obj.stripe_status) ? obj.stripe_status : null
        if (err === 'stripe_error') {
          const mode = typeof obj.stripe_key_mode === 'string' && obj.stripe_key_mode.trim() ? obj.stripe_key_mode.trim() : 'unknown'
          if (stripeStatus) return `Stripe (${mode}, HTTP ${stripeStatus}): ${message}`
          return `Stripe (${mode}): ${message}`
        }
        return message
      }
      if (err === 'missing_supabase_env') return 'Configuração do Supabase ausente no ambiente.'
      if (err === 'network_error') return typeof obj.message === 'string' && obj.message.trim() ? obj.message : 'Falha de rede ao iniciar pagamento.'
      if (err === 'session_expired' || err === 'invalid_jwt') return 'Sessão expirada no Supabase. Saia e entre novamente.'
      if (err === 'jwt_project_mismatch') return 'Sessão do Supabase pertence a outro projeto. Saia e entre novamente.'
      if (err === 'supabase_gateway_invalid_jwt') return 'A Edge Function está exigindo JWT no gateway. Faça deploy com verify_jwt=false.'
      if (err === 'function_not_deployed') return 'A função payments não está publicada no Supabase.'
      const asJson = safeJson(body)
      if (err && asJson) return `Erro ao iniciar pagamento: ${err} (HTTP ${status}): ${asJson}`
      if (err) return `Erro ao iniciar pagamento: ${err} (HTTP ${status}).`
      if (asJson) return `Erro ao iniciar pagamento (HTTP ${status}): ${asJson}`
    }
    return `Erro ao iniciar pagamento (HTTP ${status}).`
  }

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
          subtitle: 'Ilimitado',
          bullets: ['Profissionais ilimitados', 'Multi-unidades', 'Agendamentos ilimitados', 'Serviços ilimitados', 'Logo e fotos de serviços', 'Suporte via WhatsApp'],
        },
      ] satisfies PlanCard[],
    [canShowFree]
  )

  const services = useMemo<ServiceCard[]>(
    () =>
      [
        { key: 'setup_completo', title: 'Setup Completo', priceLabel: 'R$ 150 (uma vez)', bullets: ['Você configura tudo para o cliente', 'Cadastra serviços, fotos, horários', 'Conecta WhatsApp', 'Testa envios', 'Treina o cliente em 15 minutos'] },
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

  useEffect(() => {
    const run = async () => {
      const search = location.search ?? ''
      if (!search) return
      const params = new URLSearchParams(search)
      const checkout = (params.get('checkout') ?? '').trim().toLowerCase()
      if (checkout !== 'success' && checkout !== 'cancel') return

      const item = (params.get('item') ?? params.get('plano') ?? '').trim().toLowerCase() || null
      setCheckoutNotice({ kind: checkout, item })

      const sessionId = (params.get('session_id') ?? '').trim()
      const usuarioIdFromParams = (params.get('usuario_id') ?? '').trim() || null

      const first = await refresh()
      const refreshedUsuarioId = first?.kind === 'usuario' ? first.profile.id : null
      const effectiveUsuarioId = refreshedUsuarioId ?? usuarioIdFromParams

      if (checkout === 'success') {
        if (sessionId) {
          const sync = await syncCheckoutSessionPagamento(sessionId, effectiveUsuarioId)
          if (!sync.ok) {
            setError(formatCheckoutError(sync.status, sync.body))
          } else {
            await refresh()
          }
        }

        let tries = 0
        while (tries < 10) {
          await new Promise((r) => setTimeout(r, 2000))
          const next = await refresh()
          if (next?.kind === 'usuario' && next.profile.status_pagamento === 'ativo') break
          tries += 1
        }
      }

      navigate('/pagamento', { replace: true })
    }
    run().catch(() => undefined)
  }, [location.search, navigate, refresh])

  const startPlanCheckout = async (metodo: 'card' | 'pix') => {
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

    const total = plan === 'pro' ? Math.max(includedPro, Math.min(maxPro, requested)) : 1

    setCreatingCheckout(true)
    setError(null)
    const res = await createCheckoutPagamento(usuarioId, plan, metodo, total)
    if (!res.ok) {
      setError(formatCheckoutError(res.status, res.body))
      setCreatingCheckout(false)
      return
    }
    const body = res.body as Record<string, unknown>
    const url = typeof body.url === 'string' ? body.url : null
    if (!url) {
      setError('A função não retornou o link de checkout.')
      setCreatingCheckout(false)
      return
    }
    window.location.href = url
  }

  const startServiceCheckout = async (metodo: 'card' | 'pix') => {
    if (!usuarioId || !selectedService) return
    setCreatingCheckout(true)
    setError(null)
    const res = await createCheckoutPagamento(usuarioId, selectedService, metodo)
    if (!res.ok) {
      setError(formatCheckoutError(res.status, res.body))
      setCreatingCheckout(false)
      return
    }
    const body = res.body as Record<string, unknown>
    const url = typeof body.url === 'string' ? body.url : null
    if (!url) {
      setError('A função não retornou o link de checkout.')
      setCreatingCheckout(false)
      return
    }
    window.location.href = url
  }

  if (!usuario) {
    return (
      <AppShell>
        <div className="text-slate-700">Acesso restrito.</div>
      </AppShell>
    )
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

        {checkoutNotice ? (
          <div
            className={[
              'rounded-xl border p-4 text-sm',
              checkoutNotice.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900',
            ].join(' ')}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="font-semibold">{checkoutNotice.kind === 'success' ? 'Pagamento concluído' : 'Pagamento cancelado'}</div>
                <div>
                  {checkoutNotice.item ? `Item: ${checkoutNotice.item.toUpperCase()}. ` : ''}Status: {formatStatusPagamento(usuario.status_pagamento)}.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => void refresh()}>
                  Atualizar
                </Button>
                <Button variant="secondary" onClick={() => setCheckoutNotice(null)}>
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        ) : null}

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
                      <Button variant="secondary" onClick={() => void startPlanCheckout('pix')} disabled={creatingCheckout || selectedPlan === 'free'}>
                        {creatingCheckout ? 'Abrindo…' : 'PIX (30 dias)'}
                      </Button>
                      <Button onClick={() => void startPlanCheckout('card')} disabled={creatingCheckout || selectedPlan === 'free'}>
                        {creatingCheckout ? 'Abrindo…' : 'Cartão (assinatura)'}
                      </Button>
                    </div>
                  </div>
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
                    <Button variant="secondary" onClick={() => void startServiceCheckout('pix')} disabled={creatingCheckout || !selectedService}>
                      {creatingCheckout ? 'Abrindo…' : 'Pagar com PIX'}
                    </Button>
                    <Button onClick={() => void startServiceCheckout('card')} disabled={creatingCheckout || !selectedService}>
                      {creatingCheckout ? 'Abrindo…' : 'Pagar com cartão'}
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
