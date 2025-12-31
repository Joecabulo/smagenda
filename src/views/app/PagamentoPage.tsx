import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { checkJwtProject, supabase, supabaseEnv } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

type FnResult = { ok: true; status: number; body: unknown } | { ok: false; status: number; body: unknown }

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

  try {
    const probe = await fetch(fnUrl, { method: 'GET' })
    if (probe.status === 404) {
      const text = await probe.text().catch(() => '')
      if (text.includes('Requested function was not found')) {
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
  } catch {
    return { ok: false as const, status: 0, body: { error: 'network_error', message: 'Falha de rede' } }
  }

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

async function createCheckoutPagamento(usuarioId: string, item: string): Promise<FnResult> {
  return callPaymentsFn({ action: 'create_checkout', usuario_id: usuarioId, plano: item })
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

  const [checkoutNotice, setCheckoutNotice] = useState<null | { kind: 'success' | 'cancel'; item: string | null }>(null)
  const [userSelectedPlan, setUserSelectedPlan] = useState<PlanKey | null>(null)
  const [selectedService, setSelectedService] = useState<ServiceCard['key'] | null>(null)
  const [creatingCheckout, setCreatingCheckout] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const formatCheckoutError = (status: number, body: unknown) => {
    if (typeof body === 'string' && body.trim()) return body
    if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>
      if (typeof obj.message === 'string' && obj.message.trim()) return obj.message
      const err = typeof obj.error === 'string' ? obj.error : null
      if (err === 'missing_supabase_env') return 'Configuração do Supabase ausente no ambiente.'
      if (err === 'network_error') return typeof obj.message === 'string' && obj.message.trim() ? obj.message : 'Falha de rede ao iniciar pagamento.'
      if (err === 'session_expired' || err === 'invalid_jwt') return 'Sessão expirada no Supabase. Saia e entre novamente.'
      if (err === 'jwt_project_mismatch') return 'Sessão do Supabase pertence a outro projeto. Saia e entre novamente.'
      if (err === 'supabase_gateway_invalid_jwt') return 'A Edge Function está exigindo JWT no gateway. Faça deploy com verify_jwt=false.'
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
          priceLabel: 'R$ 49,90/mês',
          subtitle: '',
          bullets: ['Agendamentos 60 por mês', '1 profissional', 'Lembretes automáticos via WhatsApp', 'Até 3 serviços', 'Personalização básica da página', 'Suporte prioritário'],
        },
        {
          key: 'pro',
          title: 'PRO',
          priceLabel: 'R$ 79,90/mês',
          subtitle: '',
          bullets: ['Tudo do Basic +', 'Agendamentos 180 por mês', 'Serviços ilimitados', 'Gestão de clientes (histórico completo)', 'Relatórios avançados', 'Bloqueios recorrentes', 'Até 3 funcionários', 'Logo e galeria de fotos', 'Suporte via WhatsApp'],
        },
        {
          key: 'team',
          title: 'TEAM',
          priceLabel: 'R$ 119,90/mês',
          subtitle: 'NOVO',
          bullets: ['Tudo do Pro +', 'Até 5 funcionários', 'Agendamentos 300 por mês', 'Agenda unificada (filtro por profissional)', 'Relatórios por funcionário', 'Controle de permissões detalhado', 'Cliente escolhe o profissional', 'Suporte prioritário'],
        },
        {
          key: 'enterprise',
          title: 'ENTERPRISE',
          priceLabel: 'R$ 199,90/mês',
          subtitle: 'NOVO',
          bullets: ['Tudo do Team +', 'Agendamentos ilimitados', 'Funcionários ilimitados', 'Multi-unidades (filiais)', 'Suporte dedicado via WhatsApp', 'Treinamento da equipe incluso'],
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
    if (current === 'basic' || current === 'pro' || current === 'team' || current === 'enterprise') return current
    return 'basic'
  }, [canShowFree, usuario?.plano])

  const selectedPlan = userSelectedPlan ?? currentPlan

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

  const startPlanCheckout = async () => {
    if (!usuarioId) return
    const plan = selectedPlan
    if (!plan || plan === 'free') {
      setError('Selecione um plano válido.')
      return
    }

    setCreatingCheckout(true)
    setError(null)
    const res = await createCheckoutPagamento(usuarioId, plan)
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

  const startServiceCheckout = async () => {
    if (!usuarioId || !selectedService) return
    setCreatingCheckout(true)
    setError(null)
    const res = await createCheckoutPagamento(usuarioId, selectedService)
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

  const statusTone = usuario.status_pagamento === 'inadimplente' ? 'red' : usuario.status_pagamento === 'ativo' ? 'green' : 'slate'

  return (
    <AppShell>
      <div className="space-y-6">
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
                <div>{checkoutNotice.item ? `Item: ${checkoutNotice.item.toUpperCase()}. ` : ''}Status: {usuario.status_pagamento}.</div>
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

        <Card>
          <div className="p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Pagamento</div>
                <div className="text-sm text-slate-600">Plano atual: {usuario.plano.toUpperCase()}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={usuario.ativo ? 'green' : 'red'}>{usuario.ativo ? 'Ativo' : 'Inativo'}</Badge>
                <Badge tone={statusTone}>{usuario.status_pagamento}</Badge>
                <Button variant="secondary" onClick={() => void refresh()}>
                  Atualizar status
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((p) => {
                const selected = selectedPlan === p.key
                const clickable = p.key !== 'free'
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      if (!clickable) return
                      setUserSelectedPlan(p.key)
                    }}
                    className={[
                      'text-left rounded-xl border bg-white p-4 transition',
                      selected ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200 hover:bg-slate-50',
                      clickable ? '' : 'cursor-default',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{p.title}</div>
                        <div className="text-xs text-slate-600">{p.priceLabel}{p.subtitle ? ` • ${p.subtitle}` : ''}</div>
                      </div>
                      {selected ? <Badge tone="slate">Selecionado</Badge> : null}
                    </div>
                    <div className="mt-3 space-y-1">
                      {p.bullets.map((b) => (
                        <div key={b} className="text-xs text-slate-700">
                          - {b}
                        </div>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="flex justify-end">
              <Button onClick={startPlanCheckout} disabled={creatingCheckout || selectedPlan === 'free'}>
                {creatingCheckout ? 'Abrindo…' : 'Alterar plano'}
              </Button>
            </div>
          </div>
        </Card>

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

            <div className="flex justify-end">
              <Button onClick={startServiceCheckout} disabled={creatingCheckout || !selectedService}>
                {creatingCheckout ? 'Abrindo…' : 'Comprar serviço'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
