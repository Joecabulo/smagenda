import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminShell } from '../../components/layout/AdminShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { checkJwtProject, supabase, supabaseEnv, supabasePublicAnonKey, supabasePublicUrl } from '../../lib/supabase'

type UsuarioPagamento = {
  id: string
  nome_negocio: string
  email: string
  plano: string
  status_pagamento: string
  data_vencimento: string | null
  data_pagamento_fatura: string | null
  stripe_subscription_id: string | null
  ativo: boolean
}

type StripeStatus = {
  usuario_id: string
  plano: string
  status_pagamento: string
  data_vencimento: string | null
  data_pagamento_fatura: string | null
  stripe_subscription_id?: string | null
  stripe_customer_id?: string | null
  cancel_at_period_end?: boolean
  source: string
}

type FnResult = { ok: true; status: number; body: unknown } | { ok: false; status: number; body: unknown }

function isInvalidJwtPayload(payload: unknown) {
  if (!payload) return false
  if (typeof payload === 'string') return payload.toLowerCase().includes('invalid jwt') || payload.toLowerCase().includes('jwt expired')
  if (typeof payload !== 'object') return false
  const obj = payload as Record<string, unknown>
  const err = typeof obj.error === 'string' ? obj.error.trim().toLowerCase() : ''
  const msg = typeof obj.message === 'string' ? obj.message.trim().toLowerCase() : ''
  if (err.includes('invalid jwt') || msg.includes('invalid jwt')) return true
  if (err.includes('jwt') && err.includes('expired')) return true
  if (msg.includes('jwt') && msg.includes('expired')) return true
  if (err === 'invalid_jwt' || err === 'jwt_expired') return true
  return false
}

async function callFn(path: string, body: unknown): Promise<FnResult> {
  if (!supabaseEnv.ok) return { ok: false, status: 0, body: { error: 'missing_supabase_env', missing: supabaseEnv.missing } }
  const baseUrl = supabasePublicUrl

  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession()
    const session = data.session ?? null
    const accessToken = session?.access_token ?? null
    if (!accessToken) return { ok: false as const, status: 401, body: { error: 'missing_session', message: 'Sessão ausente. Faça login novamente.' } }

    const pj = checkJwtProject(accessToken, baseUrl)
    if (!pj.ok) {
      await supabase.auth.signOut().catch(() => undefined)
      return {
        ok: false as const,
        status: 401,
        body: {
          error: 'invalid_jwt_project',
          message: 'Sessão inválida (token de outro projeto). Faça login novamente.',
        },
      }
    }

    const expMs = typeof session?.expires_at === 'number' ? session.expires_at * 1000 : null
    if (expMs && expMs < Date.now() + 30_000) {
      const refreshed = await supabase.auth.refreshSession().catch(() => null)
      const nextToken = refreshed?.data?.session?.access_token ?? null
      if (nextToken) return { ok: true as const, token: nextToken }
    }

    return { ok: true as const, token: accessToken }
  }

  const tokenRes = await getAccessToken()
  if (!tokenRes.ok) return { ok: false, status: tokenRes.status, body: tokenRes.body }

  const fnUrl = `${baseUrl.replace(/\/$/, '')}/functions/v1/${path}`

  const doFetch = async (accessToken: string) => {
    try {
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabasePublicAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      })
      const raw = await res.text().catch(() => null)
      const parsed = raw
        ? (() => {
            try {
              return JSON.parse(raw) as unknown
            } catch {
              return raw
            }
          })()
        : null
      return { res, parsed }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha de rede'
      return { res: null as Response | null, parsed: { error: 'network_error', message: msg } as unknown }
    }
  }

  const first = await doFetch(tokenRes.token)
  if (!first.res) return { ok: false, status: 0, body: first.parsed }

  if (first.res.status === 401 && isInvalidJwtPayload(first.parsed)) {
    const refreshed = await supabase.auth.refreshSession().catch(() => null)
    const nextToken = refreshed?.data?.session?.access_token ?? null
    if (!nextToken) {
      await supabase.auth.signOut().catch(() => undefined)
      return { ok: false, status: 401, body: { error: 'invalid_jwt', message: 'Sessão expirada. Faça login novamente.' } }
    }

    const second = await doFetch(nextToken)
    if (!second.res) return { ok: false, status: 0, body: second.parsed }
    if (!second.res.ok) return { ok: false, status: second.res.status, body: second.parsed }
    return { ok: true, status: second.res.status, body: second.parsed }
  }

  if (!first.res.ok) return { ok: false, status: first.res.status, body: first.parsed }
  return { ok: true, status: first.res.status, body: first.parsed }
}

function normalizePlanoLabel(planoRaw: string) {
  const p = String(planoRaw ?? '').trim().toLowerCase()
  if (p === 'enterprise') return 'EMPRESA'
  if (p === 'pro' || p === 'team') return 'PRO'
  if (p === 'basic') return 'BASIC'
  if (p === 'free') return 'FREE'
  return planoRaw
}

function resolveDiasRestantes(dataVencimento: string | null) {
  if (!dataVencimento) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exp = new Date(`${dataVencimento}T00:00:00`)
  if (!Number.isFinite(exp.getTime())) return null
  const msDay = 1000 * 60 * 60 * 24
  const diff = Math.floor((exp.getTime() - today.getTime()) / msDay)
  return Math.max(0, diff)
}

function toIsoDateFromIsoPlusDays(value: unknown, days: number) {
  const base = typeof value === 'string' ? value.trim() : ''
  if (!base) return null
  const n = Number(days)
  if (!Number.isFinite(n) || n <= 0) return null
  const d = new Date(`${base}T00:00:00`)
  if (!Number.isFinite(d.getTime())) return null
  d.setDate(d.getDate() + Math.floor(n))
  return d.toISOString().slice(0, 10)
}

function addMonthsToIsoDate(baseIsoDate: string, months: number) {
  const base = typeof baseIsoDate === 'string' ? baseIsoDate.trim() : ''
  if (!base) return null
  const m = Math.floor(Number(months))
  if (!Number.isFinite(m) || m <= 0) return null
  const d = new Date(`${base}T00:00:00`)
  if (!Number.isFinite(d.getTime())) return null
  const day = d.getDate()
  d.setMonth(d.getMonth() + m)
  if (d.getDate() !== day) d.setDate(0)
  return d.toISOString().slice(0, 10)
}

function mapStatusToLabel(statusRaw: string) {
  const s = String(statusRaw ?? '').trim().toLowerCase()
  if (s === 'inadimplente') return { label: 'inadimplente', tone: 'red' as const }
  if (s === 'ativo') return { label: 'pago', tone: 'green' as const }
  return { label: 'pendente', tone: 'yellow' as const }
}

export function AdminPagamentosPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioPagamento[]>([])
  const [cancelling, setCancelling] = useState<Record<string, boolean>>({})
  const [granting, setGranting] = useState<Record<string, boolean>>({})
  const [stripeStatusByUsuario, setStripeStatusByUsuario] = useState<Record<string, StripeStatus>>({})
  const [syncingStripe, setSyncingStripe] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'grant' | 'cancel'>('grant')
  const [modalUsuarioId, setModalUsuarioId] = useState<string | null>(null)
  const [modalUsuarioLabel, setModalUsuarioLabel] = useState<string>('')
  const [modalHasSubscription, setModalHasSubscription] = useState<boolean>(false)
  const [modalValue, setModalValue] = useState<string>('')
  const [modalError, setModalError] = useState<string | null>(null)

  const fetchUsuarios = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    const { data, error: err } = await supabase
      .from('usuarios')
      .select('id,nome_negocio,email,plano,status_pagamento,data_vencimento,data_pagamento_fatura,stripe_subscription_id,ativo')
      .order('criado_em', { ascending: false })
      .limit(500)

    if (err) {
      setError(err.message)
      setLoading(false)
      return null
    }
    const rows = (data ?? []) as unknown as UsuarioPagamento[]
    setUsuarios(rows)
    setLoading(false)
    return rows
  }, [])

  const fetchStripeBatch = useCallback(async (rows: UsuarioPagamento[]) => {
    if (rows.length === 0) {
      setStripeStatusByUsuario({})
      return
    }
    setSyncingStripe(true)
    setError(null)
    setSuccess(null)

    const results: Record<string, StripeStatus> = {}
    const maxConcurrency = 4
    let idx = 0

    const worker = async () => {
      while (true) {
        const row = rows[idx]
        idx += 1
        if (!row) return

        const res = await callFn('payments', { action: 'admin_get_usuario_stripe_status', usuario_id: row.id })
        if (res.ok && res.body && typeof res.body === 'object') {
          const obj = res.body as Record<string, unknown>
          if (obj.ok === true && typeof obj.usuario_id === 'string') {
            results[row.id] = {
              usuario_id: String(obj.usuario_id),
              plano: typeof obj.plano === 'string' ? obj.plano : row.plano,
              status_pagamento: typeof obj.status_pagamento === 'string' ? obj.status_pagamento : row.status_pagamento,
              data_vencimento: typeof obj.data_vencimento === 'string' ? obj.data_vencimento : row.data_vencimento,
              data_pagamento_fatura: typeof obj.data_pagamento_fatura === 'string' ? obj.data_pagamento_fatura : row.data_pagamento_fatura,
              stripe_subscription_id: typeof obj.stripe_subscription_id === 'string' ? obj.stripe_subscription_id : row.stripe_subscription_id,
              stripe_customer_id: typeof obj.stripe_customer_id === 'string' ? obj.stripe_customer_id : null,
              cancel_at_period_end: obj.cancel_at_period_end === true,
              source: typeof obj.source === 'string' ? obj.source : 'unknown',
            }
            continue
          }
        }

        results[row.id] = {
          usuario_id: row.id,
          plano: row.plano,
          status_pagamento: row.status_pagamento,
          data_vencimento: row.data_vencimento,
          data_pagamento_fatura: row.data_pagamento_fatura,
          stripe_subscription_id: row.stripe_subscription_id,
          stripe_customer_id: null,
          cancel_at_period_end: false,
          source: 'db',
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(maxConcurrency, rows.length) }, () => worker()))
    setStripeStatusByUsuario(results)
    setSyncingStripe(false)
  }, [])

  const reloadAll = useCallback(async () => {
    setStripeStatusByUsuario({})
    setSyncingStripe(false)
    const rows = await fetchUsuarios()
    if (!rows) return
    await fetchStripeBatch(rows)
  }, [fetchStripeBatch, fetchUsuarios])

  useEffect(() => {
    const t = window.setTimeout(() => {
      reloadAll().catch(() => undefined)
    }, 0)
    return () => window.clearTimeout(t)
  }, [reloadAll])

  const rows = useMemo(() => {
    return usuarios.map((u) => {
      const stripe = stripeStatusByUsuario[u.id] ?? null
      const pagamentoFatura = stripe?.data_pagamento_fatura ?? u.data_pagamento_fatura
      const dataVencFromCompra = toIsoDateFromIsoPlusDays(pagamentoFatura, 30)
      const dataVenc = dataVencFromCompra ?? stripe?.data_vencimento ?? u.data_vencimento
      const plano = stripe?.plano ? stripe.plano : u.plano
      const statusPagamento = stripe?.status_pagamento ? stripe.status_pagamento : u.status_pagamento
      const dias = resolveDiasRestantes(dataVenc)
      const status = mapStatusToLabel(statusPagamento)
      const hasSubscription = Boolean(((stripe?.stripe_subscription_id ?? u.stripe_subscription_id) ?? '').trim())
      const canCancel = hasSubscription
      return { u, stripe, dias, status, plano, statusPagamento, hasSubscription, canCancel }
    })
  }, [stripeStatusByUsuario, usuarios])

  const openGrantModal = (usuarioId: string, usuarioLabel: string, hasSubscription: boolean) => {
    setModalMode('grant')
    setModalUsuarioId(usuarioId)
    setModalUsuarioLabel(usuarioLabel)
    setModalHasSubscription(hasSubscription)
    setModalValue('')
    setModalError(null)
    setModalOpen(true)
  }

  const openCancelModal = (usuarioId: string, usuarioLabel: string) => {
    setModalMode('cancel')
    setModalUsuarioId(usuarioId)
    setModalUsuarioLabel(usuarioLabel)
    setModalValue('')
    setModalError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setModalUsuarioId(null)
    setModalUsuarioLabel('')
    setModalHasSubscription(false)
    setModalValue('')
    setModalError(null)
  }

  const confirmModal = async () => {
    const usuarioId = modalUsuarioId
    if (!usuarioId) return

    if (modalMode === 'cancel') {
      if (cancelling[usuarioId] === true) return
      setCancelling((prev) => ({ ...prev, [usuarioId]: true }))
      setError(null)
      setSuccess(null)
      setModalError(null)

      const res = await callFn('payments', { action: 'cancel_subscription', usuario_id: usuarioId, immediate: true })
      if (!res.ok) {
        const msg = (() => {
          if (res.body && typeof res.body === 'object') {
            const b = res.body as Record<string, unknown>
            if (typeof b.message === 'string' && b.message.trim()) return b.message
            if (typeof b.error === 'string' && b.error.trim()) return b.error
          }
          if (typeof res.body === 'string' && res.body.trim()) return res.body
          return 'Falha ao cancelar assinatura.'
        })()
        setModalError(msg)
        setCancelling((prev) => ({ ...prev, [usuarioId]: false }))
        return
      }

      closeModal()
      await reloadAll().catch(() => undefined)
      setCancelling((prev) => ({ ...prev, [usuarioId]: false }))
      setSuccess('Assinatura cancelada no Stripe.')
      return
    }

    if (granting[usuarioId] === true) return
    const trimmed = modalValue.trim()
    if (!trimmed) {
      setModalError('Informe um número (1–24) ou um cupom/promoção válido.')
      return
    }

    const n = Number(trimmed)
    const parsedMonths = Number.isFinite(n) ? Math.floor(n) : null
    const months = parsedMonths && parsedMonths >= 1 && parsedMonths <= 24 ? parsedMonths : null
    const couponId = months ? null : trimmed
    if (!modalHasSubscription && couponId) {
      setModalError('Este cliente não tem assinatura no Stripe. Informe apenas meses (1–24) para estender o teste.')
      return
    }
    if (!months && (!couponId || couponId.length < 3)) {
      setModalError('Valor inválido. Informe um número (1–24) ou um cupom/promoção válido.')
      return
    }

    setGranting((prev) => ({ ...prev, [usuarioId]: true }))
    setError(null)
    setSuccess(null)
    setModalError(null)

    if (!modalHasSubscription && months) {
      const row = usuarios.find((u) => u.id === usuarioId) ?? null
      const currentVenc = row?.data_vencimento ?? null
      const todayIso = new Date().toISOString().slice(0, 10)
      const baseIso = (() => {
        if (currentVenc) {
          const exp = new Date(`${currentVenc}T00:00:00`)
          const today = new Date(`${todayIso}T00:00:00`)
          if (Number.isFinite(exp.getTime()) && exp >= today) return currentVenc
        }
        return todayIso
      })()

      const newVenc = addMonthsToIsoDate(baseIso, months)
      if (!newVenc) {
        setModalError('Não foi possível calcular a nova data de vencimento.')
        setGranting((prev) => ({ ...prev, [usuarioId]: false }))
        return
      }

      const { error: updErr } = await supabase
        .from('usuarios')
        .update({ status_pagamento: 'trial', data_vencimento: newVenc, ativo: true })
        .eq('id', usuarioId)

      if (updErr) {
        setModalError(`Falha ao estender teste no banco: ${updErr.message}`)
        setGranting((prev) => ({ ...prev, [usuarioId]: false }))
        return
      }

      closeModal()
      await reloadAll().catch(() => undefined)
      setGranting((prev) => ({ ...prev, [usuarioId]: false }))
      setSuccess(`Teste estendido: +${months} meses (até ${newVenc}).`)
      return
    }

    const payload: Record<string, unknown> = { action: 'grant_free_months', usuario_id: usuarioId }
    if (months) payload.months = months
    if (couponId) payload.coupon_id = couponId

    const res = await callFn('payments', payload)
    if (!res.ok) {
      const msg = (() => {
        if (res.body && typeof res.body === 'object') {
          const b = res.body as Record<string, unknown>
          if (b.error === 'invalid_action') {
            const fv = typeof b.function_version === 'string' ? b.function_version.trim() : ''
            const actions = Array.isArray(b.supported_actions) ? b.supported_actions.filter((x) => typeof x === 'string') : []
            const extra = [fv ? `versão=${fv}` : null, actions.length ? `ações=${actions.join(', ')}` : null].filter(Boolean).join(' | ')
            return `Função de pagamentos desatualizada no Supabase (invalid_action). Faça deploy da Edge Function payments e tente novamente.${extra ? ` (${extra})` : ''}`
          }
          if (typeof b.message === 'string' && b.message.trim()) return b.message
          if (typeof b.error === 'string' && b.error.trim()) return b.error
        }
        if (typeof res.body === 'string' && res.body.trim()) return res.body
        return 'Falha ao conceder meses grátis.'
      })()
      setModalError(msg)
      setGranting((prev) => ({ ...prev, [usuarioId]: false }))
      return
    }

    closeModal()
    await reloadAll().catch(() => undefined)
    setGranting((prev) => ({ ...prev, [usuarioId]: false }))
    setSuccess(months ? `Meses grátis aplicados: ${months}.` : `Cupom aplicado: ${couponId}.`)
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div> : null}
        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

        <Card>
          <div className="p-6 flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Pagamentos</div>
              <div className="text-sm text-slate-600">Lista de clientes com plano, vencimento e status.</div>
            </div>
            <Button variant="secondary" onClick={() => void reloadAll()} disabled={loading || syncingStripe}>
              Recarregar
            </Button>
          </div>
        </Card>

        {!loading && !error && usuarios.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Nenhum cliente retornado do banco.
            <div className="mt-2">
              Abra <span className="font-mono text-xs">/admin/configuracoes</span> e execute o bloco “SQL de políticas (Super Admin)” no Supabase.
            </div>
          </div>
        ) : null}

        <Card>
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600">
                    <th className="py-2 pr-4">Cliente</th>
                    <th className="py-2 pr-4">Plano</th>
                    <th className="py-2 pr-4">Dias p/ vencer</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td className="py-4 text-slate-600" colSpan={5}>
                        Carregando…
                      </td>
                    </tr>
                  ) : (
                    rows.map(({ u, dias, status, hasSubscription, canCancel }) => (
                      <tr key={u.id} className={u.ativo ? '' : 'opacity-60'}>
                        <td className="py-3 pr-4">
                          <Link to={`/admin/clientes/${u.id}`} className="font-medium text-slate-900 hover:underline">
                            {u.nome_negocio || u.id}
                          </Link>
                          <div className="text-xs text-slate-600">{u.email}</div>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge>{normalizePlanoLabel(stripeStatusByUsuario[u.id]?.plano ?? u.plano)}</Badge>
                        </td>
                        <td className="py-3 pr-4">
                          {dias === null ? (
                            <span className="text-slate-500">—</span>
                          ) : (
                            <span className="font-medium text-slate-900">{dias}</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              disabled={granting[u.id] === true}
                              onClick={() => openGrantModal(u.id, u.nome_negocio || u.email || u.id, hasSubscription)}
                            >
                              {granting[u.id] === true ? 'Aplicando…' : 'Meses grátis'}
                            </Button>
                            <Button
                              variant="danger"
                              disabled={!canCancel || cancelling[u.id] === true}
                              onClick={() => openCancelModal(u.id, u.nome_negocio || u.email || u.id)}
                            >
                              Cancelar assinatura
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        {modalOpen && modalUsuarioId ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-md">
              <Card>
                <div className="p-6 space-y-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {modalMode === 'grant' ? 'Aplicar meses grátis' : 'Cancelar assinatura'}
                    </div>
                    <div className="text-sm text-slate-600">{modalUsuarioLabel}</div>
                  </div>

                  {modalMode === 'grant' ? (
                    <Input
                      label="Meses (1–24) ou cupom/promoção"
                      value={modalValue}
                      onChange={(e) => setModalValue(e.target.value)}
                      placeholder={modalHasSubscription ? '1, SMAGENDA1, promo_... ou uvRxedCK' : '1–24 (extender teste)'}
                      autoFocus
                    />
                  ) : (
                    <div className="text-sm text-slate-700">Confirma o cancelamento imediato desta assinatura no Stripe?</div>
                  )}

                  {modalError ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{modalError}</div> : null}

                  <div className="flex items-center justify-end gap-2">
                    <Button variant="secondary" onClick={closeModal}>
                      Fechar
                    </Button>
                    <Button
                      variant={modalMode === 'cancel' ? 'danger' : 'primary'}
                      onClick={() => void confirmModal()}
                      disabled={
                        modalMode === 'cancel'
                          ? cancelling[modalUsuarioId] === true
                          : granting[modalUsuarioId] === true
                      }
                    >
                      {modalMode === 'cancel'
                        ? cancelling[modalUsuarioId] === true
                          ? 'Cancelando…'
                          : 'Confirmar cancelamento'
                        : granting[modalUsuarioId] === true
                          ? 'Aplicando…'
                          : 'Aplicar'}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </AdminShell>
  )
}
