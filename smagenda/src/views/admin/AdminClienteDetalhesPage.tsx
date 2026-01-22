import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AdminShell } from '../../components/layout/AdminShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { supabase, supabaseEnv } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

type Cliente = {
  id: string
  nome_completo: string
  nome_negocio: string
  slug: string
  email: string
  telefone: string | null
  plano: string
  status_pagamento: string
  ativo: boolean
  limite_funcionarios: number | null
  limite_agendamentos_mes?: number | null
}

type Funcionario = {
  id: string
  nome_completo: string
  email: string
  telefone: string | null
  permissao: 'admin' | 'funcionario' | 'atendente'
  ativo: boolean
}

type FnResult = { ok: true; status: number; body: unknown } | { ok: false; status: number; body: unknown }

async function callFn(path: string, body: unknown): Promise<FnResult> {
  if (!supabaseEnv.ok) return { ok: false, status: 0, body: { error: 'missing_supabase_env', missing: supabaseEnv.missing } }

  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token ?? null
  if (!accessToken) return { ok: false, status: 401, body: { error: 'missing_session' } }

  const fnUrl = `${supabaseEnv.values.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${path}`
  let res: Response
  try {
    res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseEnv.values.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Falha de rede'
    return { ok: false, status: 0, body: { error: 'network_error', message: msg } }
  }

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

  if (!res.ok) return { ok: false, status: res.status, body: parsed }
  return { ok: true, status: res.status, body: parsed }
}

function normalizePlanoToTwoPlans(planoRaw: string) {
  const p = String(planoRaw ?? '').trim().toLowerCase()
  if (p === 'team') return 'pro'
  if (p === 'enterprise') return 'enterprise'
  if (p === 'basic' || p === 'pro' || p === 'free') return p
  return 'basic'
}

function normalizePlanoLabel(planoRaw: string) {
  const p = String(planoRaw ?? '').trim().toLowerCase()
  if (p === 'enterprise') return 'EMPRESA'
  if (p === 'pro' || p === 'team') return 'PRO'
  if (p === 'basic') return 'BASIC'
  if (p === 'free') return 'FREE'
  return planoRaw
}

const planoOptions = ['free', 'basic', 'pro', 'enterprise']
const statusOptions = ['ativo', 'inadimplente', 'cancelado', 'trial', 'suspenso']

const planoDefaultLimite: Record<string, number | null> = {
  free: 1,
  basic: 1,
  pro: 4,
  enterprise: null,
}

export function AdminClienteDetalhesPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { startImpersonation } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [servicosCount, setServicosCount] = useState(0)
  const [funcionariosCount, setFuncionariosCount] = useState(0)
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [saving, setSaving] = useState(false)
  const [plano, setPlano] = useState('')
  const [statusPagamento, setStatusPagamento] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [limiteFuncionarios, setLimiteFuncionarios] = useState('')
  const [limiteAgendamentosMes, setLimiteAgendamentosMes] = useState('')
  const [creatingFuncionario, setCreatingFuncionario] = useState(false)
  const [funcFormOpen, setFuncFormOpen] = useState(false)
  const [funcNome, setFuncNome] = useState('')
  const [funcEmail, setFuncEmail] = useState('')
  const [funcSenha, setFuncSenha] = useState('')
  const [funcPermissao, setFuncPermissao] = useState<'admin' | 'funcionario' | 'atendente'>('funcionario')
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const [creatingCheckout, setCreatingCheckout] = useState(false)
  const [refreshingPagamento, setRefreshingPagamento] = useState(false)
  const [checkoutFuncionariosTotal, setCheckoutFuncionariosTotal] = useState<number>(1)

  const limiteParsed = useMemo(() => {
    const n = limiteFuncionarios.trim() === '' ? null : Number(limiteFuncionarios)
    return Number.isNaN(n as number) ? null : n
  }, [limiteFuncionarios])

  const limiteAgMesParsed = useMemo(() => {
    const n = limiteAgendamentosMes.trim() === '' ? null : Number(limiteAgendamentosMes)
    return Number.isNaN(n as number) ? null : n
  }, [limiteAgendamentosMes])

  const limiteAtingido = useMemo(() => {
    if (!cliente) return false
    if (limiteParsed === null) return false
    return funcionariosCount >= limiteParsed
  }, [cliente, funcionariosCount, limiteParsed])

  useEffect(() => {
    const run = async () => {
      if (!id) {
        setError('Cliente inválido')
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)

      const { data, error: err } = await supabase
        .from('usuarios')
        .select('id,nome_completo,nome_negocio,slug,email,telefone,plano,status_pagamento,ativo,limite_funcionarios,limite_agendamentos_mes')
        .eq('id', id)
        .maybeSingle()
      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }
      const next = ((data ?? null) as unknown as Cliente | null) ?? null
      setCliente(next)
      if (next) {
        const normalizedPlano = normalizePlanoToTwoPlans(next.plano)
        setPlano(normalizedPlano)
        setStatusPagamento(next.status_pagamento)
        setAtivo(next.ativo)
        setLimiteFuncionarios(next.limite_funcionarios === null ? '' : String(next.limite_funcionarios))
        setLimiteAgendamentosMes(next.limite_agendamentos_mes === null || typeof next.limite_agendamentos_mes !== 'number' ? '' : String(next.limite_agendamentos_mes))

        const n = typeof next.limite_funcionarios === 'number' && Number.isFinite(next.limite_funcionarios) && next.limite_funcionarios > 0 ? Math.floor(next.limite_funcionarios) : 1
        const min = normalizedPlano === 'pro' ? 4 : 1
        const max = normalizedPlano === 'pro' ? 6 : 200
        setCheckoutFuncionariosTotal(Math.max(min, Math.min(max, n)))
      }

      const { count: sCount } = await supabase.from('servicos').select('id', { count: 'exact', head: true }).eq('usuario_id', id)
      const { count: fCount } = await supabase.from('funcionarios').select('id', { count: 'exact', head: true }).eq('usuario_master_id', id)
      setServicosCount(sCount ?? 0)
      setFuncionariosCount(fCount ?? 0)

      const { data: funcs } = await supabase
        .from('funcionarios')
        .select('id,nome_completo,email,telefone,permissao,ativo')
        .eq('usuario_master_id', id)
        .order('nome_completo', { ascending: true })
      setFuncionarios((funcs ?? []) as unknown as Funcionario[])

      setLoading(false)
    }
    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar')
      setLoading(false)
    })
  }, [id])

  const refreshPagamento = async () => {
    if (!id) return
    setRefreshingPagamento(true)
    setError(null)

    const syncRes = await callFn('payments', { action: 'admin_get_usuario_stripe_status', usuario_id: id })
    if (!syncRes.ok) {
      const msg =
        syncRes.body && typeof syncRes.body === 'object' && typeof (syncRes.body as Record<string, unknown>).message === 'string'
          ? String((syncRes.body as Record<string, unknown>).message)
          : syncRes.body && typeof syncRes.body === 'object' && typeof (syncRes.body as Record<string, unknown>).error === 'string'
            ? String((syncRes.body as Record<string, unknown>).error)
            : typeof syncRes.body === 'string'
              ? syncRes.body
              : null
      if (msg) setError(msg)
    }

    const { data, error: err } = await supabase
      .from('usuarios')
      .select('id,plano,status_pagamento,ativo,limite_funcionarios,limite_agendamentos_mes')
      .eq('id', id)
      .maybeSingle()
    if (err || !data) {
      setError(err?.message ?? 'Erro ao atualizar pagamento')
      setRefreshingPagamento(false)
      return
    }
    const next = data as unknown as Pick<Cliente, 'id' | 'plano' | 'status_pagamento' | 'ativo' | 'limite_funcionarios' | 'limite_agendamentos_mes'>
    setCliente((prev) => (prev ? { ...prev, ...next } : (next as unknown as Cliente)))
    const normalizedPlano = normalizePlanoToTwoPlans(next.plano)
    setPlano(normalizedPlano)
    setStatusPagamento(next.status_pagamento)
    setAtivo(next.ativo)
    setLimiteFuncionarios(next.limite_funcionarios === null ? '' : String(next.limite_funcionarios))
    setLimiteAgendamentosMes(next.limite_agendamentos_mes === null || typeof next.limite_agendamentos_mes !== 'number' ? '' : String(next.limite_agendamentos_mes))
    const n = typeof next.limite_funcionarios === 'number' && Number.isFinite(next.limite_funcionarios) && next.limite_funcionarios > 0 ? Math.floor(next.limite_funcionarios) : 1
    const min = normalizedPlano === 'pro' ? 4 : 1
    const max = normalizedPlano === 'pro' ? 6 : 200
    setCheckoutFuncionariosTotal(Math.max(min, Math.min(max, n)))
    setRefreshingPagamento(false)
  }

  const save = async () => {
    if (!id) return
    setSaving(true)
    setError(null)
    const limite = limiteFuncionarios.trim() === '' ? null : Number(limiteFuncionarios)
    if (limiteFuncionarios.trim() !== '' && Number.isNaN(limite)) {
      setError('Limite de funcionários inválido')
      setSaving(false)
      return
    }

    const limiteAgMes = limiteAgendamentosMes.trim() === '' ? null : Number(limiteAgendamentosMes)
    if (limiteAgendamentosMes.trim() !== '' && Number.isNaN(limiteAgMes)) {
      setError('Limite de agendamentos/mês inválido')
      setSaving(false)
      return
    }
    const { error: err } = await supabase
      .from('usuarios')
      .update({ plano, status_pagamento: statusPagamento, ativo, limite_funcionarios: limite, limite_agendamentos_mes: limiteAgMes })
      .eq('id', id)
    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }
    setCliente((prev) =>
      prev ? { ...prev, plano, status_pagamento: statusPagamento, ativo, limite_funcionarios: limite, limite_agendamentos_mes: limiteAgMes } : prev
    )
    setSaving(false)
  }

  const logarComoCliente = async () => {
    if (!cliente) return
    setError(null)
    setCheckoutUrl(null)
    const res = await startImpersonation(cliente.id)
    if (!res.ok) {
      setError(res.message)
      return
    }
    navigate('/dashboard')
  }

  const createFuncionario = async () => {
    if (!cliente) return
    const nome = funcNome.trim()
    const email = funcEmail.trim().toLowerCase()
    const senha = funcSenha
    if (!nome || !email || !senha) {
      setError('Preencha nome, email e senha.')
      return
    }
    if (senha.trim().length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.')
      return
    }
    setCreatingFuncionario(true)
    setError(null)

    const res = await callFn('admin-create-funcionario', {
      usuario_master_id: cliente.id,
      nome_completo: nome,
      email,
      senha,
      permissao: funcPermissao,
    })

    if (!res.ok) {
      const msg = typeof res.body === 'object' && res.body !== null && typeof (res.body as Record<string, unknown>).message === 'string'
        ? String((res.body as Record<string, unknown>).message)
        : `Erro ao criar funcionário (HTTP ${res.status}).`
      setError(msg)
      setCreatingFuncionario(false)
      return
    }

    const body = res.body as Record<string, unknown>
    const newId = typeof body.id === 'string' ? body.id : null
    if (!newId) {
      setError('Falha ao criar funcionário.')
      setCreatingFuncionario(false)
      return
    }

    setFuncNome('')
    setFuncEmail('')
    setFuncSenha('')
    setFuncPermissao('funcionario')
    setFuncFormOpen(false)
    setCreatingFuncionario(false)
    await Promise.resolve()
    const { data: funcs } = await supabase
      .from('funcionarios')
      .select('id,nome_completo,email,telefone,permissao,ativo')
      .eq('usuario_master_id', cliente.id)
      .order('nome_completo', { ascending: true })
    setFuncionarios((funcs ?? []) as unknown as Funcionario[])
    setFuncionariosCount((funcs ?? []).length)
  }

  const gerarCheckout = async (metodo: 'card' | 'pix') => {
    if (!cliente) return
    if (!plano) {
      setError('Selecione um plano antes de gerar o link de pagamento.')
      return
    }

    const total = plano === 'pro' ? Math.max(4, Math.min(6, Math.floor(checkoutFuncionariosTotal || 4))) : 1
    setCreatingCheckout(true)
    setError(null)
    setCheckoutUrl(null)

    const res = await callFn('payments', { action: 'create_checkout', usuario_id: cliente.id, plano, metodo, funcionarios_total: total })
    if (!res.ok) {
      const msg = typeof res.body === 'object' && res.body !== null && typeof (res.body as Record<string, unknown>).message === 'string'
        ? String((res.body as Record<string, unknown>).message)
        : `Erro ao gerar link (HTTP ${res.status}).`
      setError(msg)
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
    setCheckoutUrl(url)
    setCreatingCheckout(false)
    setTimeout(() => {
      void refreshPagamento()
    }, 4000)
  }

  const toggleFuncionario = async (f: Funcionario) => {
    setError(null)
    const { error: err } = await supabase.from('funcionarios').update({ ativo: !f.ativo }).eq('id', f.id)
    if (err) {
      setError(err.message)
      return
    }
    setFuncionarios((prev) => prev.map((x) => (x.id === f.id ? { ...x, ativo: !x.ativo } : x)))
  }

  const removeFuncionario = async (f: Funcionario) => {
    setError(null)
    const ok = window.confirm(`Excluir funcionário "${f.nome_completo}"?`)
    if (!ok) return
    const { error: err } = await supabase.from('funcionarios').delete().eq('id', f.id)
    if (err) {
      setError(err.message)
      return
    }
    setFuncionarios((prev) => prev.filter((x) => x.id !== f.id))
    setFuncionariosCount((n) => Math.max(0, n - 1))
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-500">Cliente</div>
            <div className="text-xl font-semibold text-slate-900">Detalhes</div>
          </div>
          <Link to="/admin/clientes" className="text-sm font-medium text-slate-900 hover:underline">
            Voltar
          </Link>
        </div>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
        {loading ? <div className="text-sm text-slate-600">Carregando…</div> : null}

        {cliente ? (
          <div className="space-y-4">
            <Card>
              <div className="p-6 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">{cliente.nome_negocio}</div>
                    <div className="text-sm text-slate-600">/{cliente.slug}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {cliente.ativo ? <Badge tone="green">Conta: Ativa</Badge> : <Badge tone="red">Conta: Inativa</Badge>}
                    <Badge tone="slate">{normalizePlanoLabel(cliente.plano)}</Badge>
                    <Badge tone={cliente.status_pagamento === 'inadimplente' ? 'red' : cliente.status_pagamento === 'ativo' ? 'green' : 'slate'}>
                      Pagamento: {(() => {
                        const v = String(cliente.status_pagamento ?? '').trim().toLowerCase()
                        if (!v) return '—'
                        if (v === 'ativo') return 'Ativo'
                        if (v === 'trial') return 'Trial'
                        if (v === 'inadimplente') return 'Inadimplente'
                        if (v === 'suspenso') return 'Suspenso'
                        if (v === 'cancelado') return 'Cancelado'
                        return cliente.status_pagamento
                      })()}
                    </Badge>
                  </div>
                </div>
                <div className="text-sm text-slate-700">{cliente.nome_completo}</div>
                <div className="text-sm text-slate-700">{cliente.email}</div>
                {cliente.telefone ? <div className="text-sm text-slate-700">{cliente.telefone}</div> : null}
                <div className="text-sm text-slate-700">Serviços: {servicosCount}</div>
                <div className="text-sm text-slate-700">Funcionários: {funcionariosCount}</div>
                <div className="flex justify-end">
                  <Button onClick={logarComoCliente}>Logar como cliente</Button>
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-6 space-y-4">
                <div className="text-sm font-semibold text-slate-900">Gerenciamento</div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <div className="text-sm font-medium text-slate-700 mb-1">Plano</div>
                    <select
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                      value={plano}
                      onChange={(e) => {
                        const nextPlano = e.target.value
                        setPlano(nextPlano)
                        const nextLimite = Object.prototype.hasOwnProperty.call(planoDefaultLimite, nextPlano)
                          ? planoDefaultLimite[nextPlano]
                          : null
                        setLimiteFuncionarios(nextLimite === null ? '' : String(nextLimite))
                        setCheckoutFuncionariosTotal(nextPlano === 'pro' ? 4 : 1)
                      }}
                    >
                      {planoOptions.map((p) => (
                        <option key={p} value={p}>
                          {normalizePlanoLabel(p)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <div className="text-sm font-medium text-slate-700 mb-1">Status de pagamento</div>
                    <select
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                      value={statusPagamento}
                      onChange={(e) => setStatusPagamento(e.target.value)}
                    >
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <div className="text-sm font-medium text-slate-700 mb-1">Conta ativa</div>
                    <select
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                      value={ativo ? 'true' : 'false'}
                      onChange={(e) => setAtivo(e.target.value === 'true')}
                    >
                      <option value="true">Ativa</option>
                      <option value="false">Inativa</option>
                    </select>
                  </label>
                  <Input
                    label="Limite de funcionários (vazio = sem limite)"
                    value={limiteFuncionarios}
                    onChange={(e) => setLimiteFuncionarios(e.target.value)}
                    inputMode="numeric"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Limite de agendamentos/mês (vazio = sem limite)"
                    value={limiteAgendamentosMes}
                    onChange={(e) => setLimiteAgendamentosMes(e.target.value)}
                    inputMode="numeric"
                  />
                  <div className="flex items-end justify-end gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const base = limiteAgMesParsed === null ? 0 : Math.max(0, Math.floor(limiteAgMesParsed))
                        setLimiteAgendamentosMes(String(base + 50))
                      }}
                    >
                      +50
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const base = limiteAgMesParsed === null ? 0 : Math.max(0, Math.floor(limiteAgMesParsed))
                        setLimiteAgendamentosMes(String(base + 100))
                      }}
                    >
                      +100
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setLimiteAgendamentosMes('')
                      }}
                    >
                      Ilimitado
                    </Button>
                  </div>
                </div>

                {limiteFuncionarios.trim() !== '' && limiteParsed === null ? (
                  <div className="text-sm text-rose-700">Limite de funcionários inválido.</div>
                ) : null}

                {limiteAgendamentosMes.trim() !== '' && limiteAgMesParsed === null ? (
                  <div className="text-sm text-rose-700">Limite de agendamentos/mês inválido.</div>
                ) : null}

                <div className="flex justify-end">
                  <Button onClick={save} disabled={saving || !plano || !statusPagamento}>
                    Salvar alterações
                  </Button>
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <div className="text-sm font-semibold text-slate-900">Pagamento</div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-slate-600">Gera um link de checkout para o plano selecionado.</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        label="Profissionais"
                        type="number"
                        min={4}
                        max={6}
                        value={String(checkoutFuncionariosTotal)}
                        disabled={plano !== 'pro'}
                        onChange={(e) => {
                          const raw = e.target.value
                          const n = raw.trim() === '' ? 4 : Number(raw)
                          if (!Number.isFinite(n)) return
                          const i = Math.floor(n)
                          if (i > 6) {
                            setPlano('enterprise')
                            setLimiteFuncionarios('')
                            setCheckoutFuncionariosTotal(1)
                            setError('Para mais de 6 profissionais, use o plano EMPRESA.')
                            return
                          }
                          const clamped = Math.max(4, Math.min(6, i))
                          setCheckoutFuncionariosTotal(clamped)
                        }}
                        className="w-28"
                      />
                      <Button variant="secondary" onClick={() => void refreshPagamento()} disabled={refreshingPagamento || !cliente}>
                        {refreshingPagamento ? 'Atualizando…' : 'Atualizar status'}
                      </Button>
                      <Button variant="secondary" onClick={() => void gerarCheckout('pix')} disabled={creatingCheckout || !plano}>
                        {creatingCheckout ? 'Gerando…' : 'PIX (30 dias)'}
                      </Button>
                      <Button variant="secondary" onClick={() => void gerarCheckout('card')} disabled={creatingCheckout || !plano}>
                        {creatingCheckout ? 'Gerando…' : 'Cartão (assinatura)'}
                      </Button>
                    </div>
                  </div>
                  {checkoutUrl ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                      <div className="text-xs font-semibold tracking-wide text-slate-500">CHECKOUT URL</div>
                      <a className="block break-all text-sm text-slate-900 hover:underline" href={checkoutUrl} target="_blank" rel="noreferrer">
                        {checkoutUrl}
                      </a>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="secondary"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(checkoutUrl)
                            } catch {
                              window.prompt('Copie o link:', checkoutUrl)
                            }
                          }}
                        >
                          Copiar
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            window.open(checkoutUrl, '_blank', 'noreferrer')
                          }}
                        >
                          Abrir
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">Funcionários</div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setError(null)
                      setCheckoutUrl(null)
                      setFuncFormOpen((v) => !v)
                    }}
                    disabled={creatingFuncionario || limiteAtingido}
                  >
                    {funcFormOpen ? 'Fechar' : 'Novo funcionário'}
                  </Button>
                </div>

                {limiteAtingido ? (
                  <div className="text-sm text-rose-700">Limite de funcionários atingido para o plano.</div>
                ) : null}

                {funcFormOpen ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Input label="Nome completo" value={funcNome} onChange={(e) => setFuncNome(e.target.value)} />
                      <Input label="Email" value={funcEmail} onChange={(e) => setFuncEmail(e.target.value)} />
                      <Input label="Senha" type="password" value={funcSenha} onChange={(e) => setFuncSenha(e.target.value)} />
                      <label className="block">
                        <div className="text-sm font-medium text-slate-700 mb-1">Permissão</div>
                        <select
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                          value={funcPermissao}
                          onChange={(e) => setFuncPermissao(e.target.value as 'admin' | 'funcionario' | 'atendente')}
                        >
                          <option value="funcionario">Funcionário</option>
                          <option value="atendente">Atendente</option>
                          <option value="admin">Gerente</option>
                        </select>
                      </label>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setFuncFormOpen(false)
                        }}
                        disabled={creatingFuncionario}
                      >
                        Cancelar
                      </Button>
                      <Button onClick={createFuncionario} disabled={creatingFuncionario}>
                        {creatingFuncionario ? 'Criando…' : 'Criar funcionário'}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {funcionarios.length === 0 ? <div className="text-sm text-slate-600">Nenhum funcionário.</div> : null}
                <div className="divide-y divide-slate-100">
                  {funcionarios.map((f) => (
                    <div key={f.id} className="py-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{f.nome_completo}</div>
                        <div className="text-sm text-slate-600">{f.email}</div>
                        {f.telefone ? <div className="text-sm text-slate-600">{f.telefone}</div> : null}
                        <div className="text-sm text-slate-700">{f.permissao === 'admin' ? 'Gerente' : f.permissao === 'atendente' ? 'Atendente' : 'Funcionário'}</div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {f.ativo ? <Badge tone="green">Ativo</Badge> : <Badge tone="red">Inativo</Badge>}
                        <Button variant="secondary" onClick={() => toggleFuncionario(f)}>
                          {f.ativo ? 'Desativar' : 'Ativar'}
                        </Button>
                        <Button variant="danger" onClick={() => removeFuncionario(f)}>
                          Excluir
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </AdminShell>
  )
}
