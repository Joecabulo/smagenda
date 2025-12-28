import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { formatBRMoney, minutesToTime, parseTimeToMinutes, toISODate } from '../../lib/dates'
import { supabase, supabaseEnv } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

type Agendamento = {
  id: string
  cliente_nome: string
  cliente_telefone: string
  data: string
  hora_inicio: string
  hora_fim: string | null
  status: string
  funcionario_id: string | null
  servico: { id: string; nome: string; preco: number; duracao_minutos: number; cor: string | null } | null
}

type ServicoOption = { id: string; nome: string; cor: string | null }

type Bloqueio = { id: string; data: string; hora_inicio: string; hora_fim: string; motivo: string | null; funcionario_id: string | null }

function buildSlots(
  start: string,
  end: string,
  intervalStart: string | null,
  intervalEnd: string | null,
  stepMinutes: number
): string[] {
  const startMin = parseTimeToMinutes(start)
  const endMin = parseTimeToMinutes(end)
  const ivStart = intervalStart ? parseTimeToMinutes(intervalStart) : null
  const ivEnd = intervalEnd ? parseTimeToMinutes(intervalEnd) : null
  const slots: string[] = []
  for (let m = startMin; m < endMin; m += stepMinutes) {
    if (ivStart !== null && ivEnd !== null && m >= ivStart && m < ivEnd) continue
    slots.push(minutesToTime(m))
  }
  return slots
}

function startOfWeek(value: Date) {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = (day + 6) % 7
  d.setDate(d.getDate() - diff)
  return d
}

function addDays(value: Date, days: number) {
  const d = new Date(value)
  d.setDate(d.getDate() + days)
  return d
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function resolveStatusUi(status: string): { label: string; tone: 'slate' | 'green' | 'yellow' | 'red' } {
  const s = status.trim().toLowerCase()
  if (s === 'confirmado') return { label: 'Confirmado', tone: 'green' }
  if (s === 'cancelado') return { label: 'Cancelado', tone: 'red' }
  if (s === 'pendente') return { label: 'Pendente', tone: 'yellow' }
  if (s === 'concluido' || s === 'concluído') return { label: 'Concluído', tone: 'green' }
  if (s === 'nao_compareceu' || s === 'não_compareceu' || s === 'no_show') return { label: 'No-show', tone: 'red' }
  return { label: status || 'Status', tone: 'slate' }
}

async function sendConfirmacaoWhatsapp(agendamentoId: string) {
  if (!supabaseEnv.ok) {
    return { ok: false as const, status: 0, body: { error: 'missing_supabase_env' } }
  }

  const supabaseUrl = supabaseEnv.values.VITE_SUPABASE_URL
  const supabaseAnonKey = supabaseEnv.values.VITE_SUPABASE_ANON_KEY

  const tryRefresh = async () => {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
    if (refreshErr) return null
    return refreshed.session ?? null
  }

  const { data: sessionData } = await supabase.auth.getSession()
  let session = sessionData.session
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = session?.expires_at ?? null

  if (session && expiresAt && expiresAt <= now + 60) {
    const refreshed = await tryRefresh()
    if (refreshed) session = refreshed
  }

  const token = session?.access_token ?? null
  if (!token) {
    return { ok: false as const, status: 401, body: { error: 'session_expired' } }
  }

  const callFetch = async (jwt: string) => {
    const fnUrl = `${supabaseUrl}/functions/v1/whatsapp`
    let res: Response
    try {
      res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${jwt}`,
          'x-user-jwt': jwt,
        },
        body: JSON.stringify({ action: 'send_confirmacao', agendamento_id: agendamentoId }),
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha de rede'
      return { ok: false as const, status: 0, body: { error: 'network_error', message: msg } }
    }

    const fnVersion = res.headers.get('x-smagenda-fn')

    const text = await res.text()
    let parsed: unknown = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = text
    }

    if (!res.ok && res.status === 401 && !fnVersion) {
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed as Record<string, unknown>).message === 'Invalid JWT' &&
        (parsed as Record<string, unknown>).code === 401
      ) {
        return { ok: false as const, status: 401, body: { error: 'supabase_gateway_invalid_jwt' } }
      }
    }

    if (!res.ok) return { ok: false as const, status: res.status, body: parsed }
    return { ok: true as const, status: res.status, body: parsed }
  }

  const isInvalidJwtPayload = (payload: unknown) => {
    if (typeof payload === 'string') return payload.includes('Invalid JWT')
    if (!payload || typeof payload !== 'object') return false
    const obj = payload as Record<string, unknown>
    return obj.message === 'Invalid JWT' || obj.error === 'invalid_jwt'
  }

  const first = await callFetch(token)
  if (
    !first.ok &&
    first.status === 401 &&
    typeof first.body === 'object' &&
    first.body !== null &&
    (first.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt'
  ) {
    return first
  }

  if (!first.ok && first.status === 401 && isInvalidJwtPayload(first.body)) {
    const refreshed = await tryRefresh()
    const nextToken = refreshed?.access_token ?? null
    if (!nextToken) return { ok: false as const, status: 401, body: { error: 'invalid_jwt' } }
    return callFetch(nextToken)
  }

  return first
}

export function FuncionarioAgendaPage() {
  const { principal } = useAuth()
  const funcionario = principal?.kind === 'funcionario' ? principal.profile : null

  const funcionarioId = funcionario?.id ?? null
  const usuarioMasterId = funcionario?.usuario_master_id ?? null

  const [date, setDate] = useState(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return now
  })

  const [viewMode, setViewMode] = useState<'dia' | 'semana'>('dia')

  const [servicos, setServicos] = useState<ServicoOption[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [servicoFilterId, setServicoFilterId] = useState('')

  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [blockStart, setBlockStart] = useState('')
  const [blockEnd, setBlockEnd] = useState('')
  const [blockMotivo, setBlockMotivo] = useState('')
  const [savingBlock, setSavingBlock] = useState(false)

  const weekStartDate = useMemo(() => startOfWeek(date), [date])
  const weekEndDate = useMemo(() => addDays(weekStartDate, 6), [weekStartDate])
  const dayKey = useMemo(() => toISODate(date), [date])
  const weekStartKey = useMemo(() => toISODate(weekStartDate), [weekStartDate])
  const weekEndKey = useMemo(() => toISODate(weekEndDate), [weekEndDate])

  const rangeLabel = useMemo(() => {
    if (viewMode === 'dia') {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    }
    const startLabel = weekStartDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    const endLabel = weekEndDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    return `${startLabel} – ${endLabel}`
  }, [date, viewMode, weekEndDate, weekStartDate])

  const searchNorm = useMemo(() => normalizeText(search.trim()), [search])
  const matchesFilters = useMemo(() => {
    const statusNorm = statusFilter.trim().toLowerCase()
    const servicoId = servicoFilterId.trim()
    return (a: Agendamento) => {
      if (statusNorm && a.status?.toLowerCase() !== statusNorm) return false
      if (servicoId && a.servico?.id !== servicoId) return false
      if (!searchNorm) return true
      const hay = normalizeText([a.cliente_nome, a.cliente_telefone, a.servico?.nome ?? '', a.hora_inicio].filter(Boolean).join(' '))
      return hay.includes(searchNorm)
    }
  }, [searchNorm, servicoFilterId, statusFilter])

  const slots = useMemo(() => {
    if (!funcionario?.horario_inicio || !funcionario?.horario_fim) return []
    return buildSlots(funcionario.horario_inicio, funcionario.horario_fim, funcionario.intervalo_inicio, funcionario.intervalo_fim, 60)
  }, [funcionario])

  const totalDia = useMemo(() => {
    if (!funcionario?.pode_ver_financeiro) return 0
    return agendamentos
      .filter((a) => a.status !== 'cancelado')
      .reduce((sum, a) => sum + (a.servico?.preco ? Number(a.servico.preco) : 0), 0)
  }, [agendamentos, funcionario?.pode_ver_financeiro])

  useEffect(() => {
    const run = async () => {
      if (!funcionarioId || !usuarioMasterId) return
      setLoading(true)
      setError(null)

      const { data: servicosData, error: servicosError } = await supabase
        .from('servicos')
        .select('id,nome,cor')
        .eq('usuario_id', usuarioMasterId)
        .eq('ativo', true)
        .order('ordem', { ascending: true })
        .order('criado_em', { ascending: true })
      if (!servicosError) {
        setServicos((servicosData ?? []) as unknown as ServicoOption[])
      }

      const base = supabase
        .from('agendamentos')
        .select('id,cliente_nome,cliente_telefone,data,hora_inicio,hora_fim,status,funcionario_id,servico:servico_id(id,nome,preco,duracao_minutos,cor)')
        .eq('usuario_id', usuarioMasterId)
        .eq('funcionario_id', funcionarioId)
        .order('data', { ascending: true })
        .order('hora_inicio', { ascending: true })

      const baseWithRange =
        viewMode === 'dia'
          ? base.eq('data', dayKey)
          : base.gte('data', weekStartKey).lte('data', weekEndKey)

      const { data: agData, error: agError } = await baseWithRange
      if (agError) {
        setError(agError.message)
        setLoading(false)
        return
      }
      setAgendamentos((agData ?? []) as unknown as Agendamento[])

      let bloqueiosQuery = supabase
        .from('bloqueios')
        .select('id,data,hora_inicio,hora_fim,motivo,funcionario_id')
        .eq('usuario_id', usuarioMasterId)
        .or(`funcionario_id.is.null,funcionario_id.eq.${funcionarioId}`)

      bloqueiosQuery =
        viewMode === 'dia'
          ? bloqueiosQuery.eq('data', dayKey)
          : bloqueiosQuery.gte('data', weekStartKey).lte('data', weekEndKey)

      const { data: bloqueiosData, error: bloqueiosError } = await bloqueiosQuery
      if (bloqueiosError) {
        setError(bloqueiosError.message)
        setLoading(false)
        return
      }
      setBloqueios((bloqueiosData ?? []) as unknown as Bloqueio[])
      setLoading(false)
    }
    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar')
      setLoading(false)
    })
  }, [funcionarioId, usuarioMasterId, dayKey, viewMode, weekEndKey, weekStartKey])

  const prevPeriod = () => {
    if (viewMode === 'semana') {
      setDate((prev) => addDays(prev, -7))
      return
    }
    setDate((prev) => addDays(prev, -1))
  }

  const nextPeriod = () => {
    if (viewMode === 'semana') {
      setDate((prev) => addDays(prev, 7))
      return
    }
    setDate((prev) => addDays(prev, 1))
  }

  const findAgendamentoAt = (time: string) => agendamentos.find((a) => a.hora_inicio === time)
  const findBloqueioAt = (time: string) => {
    const t = parseTimeToMinutes(time)
    return bloqueios.find((b) => {
      const s = parseTimeToMinutes(b.hora_inicio)
      const e = parseTimeToMinutes(b.hora_fim)
      return t >= s && t < e
    })
  }

  const weekDays = useMemo(() => {
    if (viewMode !== 'semana') return [] as Array<{ date: Date; key: string }>
    return Array.from({ length: 7 }).map((_, i) => {
      const d = addDays(weekStartDate, i)
      return { date: d, key: toISODate(d) }
    })
  }, [viewMode, weekStartDate])

  const agendamentosByDay = useMemo(() => {
    const map: Record<string, Agendamento[]> = {}
    for (const a of agendamentos) {
      const key = a.data
      if (!map[key]) map[key] = []
      map[key].push(a)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((x, y) => parseTimeToMinutes(x.hora_inicio) - parseTimeToMinutes(y.hora_inicio))
    }
    return map
  }, [agendamentos])

  const bloqueiosByDay = useMemo(() => {
    const map: Record<string, Bloqueio[]> = {}
    for (const b of bloqueios) {
      const key = b.data
      if (!map[key]) map[key] = []
      map[key].push(b)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((x, y) => parseTimeToMinutes(x.hora_inicio) - parseTimeToMinutes(y.hora_inicio))
    }
    return map
  }, [bloqueios])

  const canSaveBlock = useMemo(() => {
    if (!funcionarioId || !usuarioMasterId) return false
    if (!funcionario?.pode_bloquear_horarios) return false
    if (!blockStart || !blockEnd) return false
    const s = parseTimeToMinutes(blockStart)
    const e = parseTimeToMinutes(blockEnd)
    if (!Number.isFinite(s) || !Number.isFinite(e)) return false
    if (e <= s) return false
    return true
  }, [funcionario?.pode_bloquear_horarios, funcionarioId, usuarioMasterId, blockStart, blockEnd])

  const createBloqueio = async () => {
    if (!funcionarioId || !usuarioMasterId || !canSaveBlock) return
    setSavingBlock(true)
    setError(null)
    const motivo = blockMotivo.trim() ? blockMotivo.trim() : null
    const { data: created, error: err } = await supabase
      .from('bloqueios')
      .insert({
        usuario_id: usuarioMasterId,
        data: dayKey,
        hora_inicio: blockStart,
        hora_fim: blockEnd,
        motivo,
        funcionario_id: funcionarioId,
      })
      .select('id,data,hora_inicio,hora_fim,motivo,funcionario_id')
      .maybeSingle()

    if (err) {
      setError(err.message)
      setSavingBlock(false)
      return
    }
    if (created) {
      setBloqueios((prev) => [...prev, created as unknown as Bloqueio])
    }
    setBlockMotivo('')
    setSavingBlock(false)
  }

  const removeBloqueio = async (b: Bloqueio) => {
    if (!funcionarioId || !usuarioMasterId) return
    if (!funcionario?.pode_bloquear_horarios) return
    if (b.funcionario_id !== funcionarioId) return
    setError(null)
    const ok = window.confirm('Remover este bloqueio?')
    if (!ok) return
    const { error: err } = await supabase.from('bloqueios').delete().eq('id', b.id).eq('usuario_id', usuarioMasterId)
    if (err) {
      setError(err.message)
      return
    }
    setBloqueios((prev) => prev.filter((x) => x.id !== b.id))
  }

  if (!funcionario) {
    return (
      <AppShell>
        <div className="text-slate-700">Acesso restrito.</div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <Card>
          <div className="p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={prevPeriod}>
                  &lt;
                </Button>
                <div className="text-sm font-semibold text-slate-900">
                  {rangeLabel}
                </div>
                <Button variant="secondary" onClick={nextPeriod}>
                  &gt;
                </Button>

                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('dia')}
                    className={[
                      'rounded-md px-3 py-1 text-sm font-medium',
                      viewMode === 'dia' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-700 hover:text-slate-900',
                    ].join(' ')}
                  >
                    Dia
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('semana')}
                    className={[
                      'rounded-md px-3 py-1 text-sm font-medium',
                      viewMode === 'semana' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-700 hover:text-slate-900',
                    ].join(' ')}
                  >
                    Semana
                  </button>
                </div>
              </div>
              <div className="text-sm text-slate-600">Mostrando: meus agendamentos</div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-5">
                <Input label="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, telefone, serviço…" />
              </div>
              <label className="block sm:col-span-3">
                <div className="text-sm font-medium text-slate-700 mb-1">Status</div>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="pendente">Pendente</option>
                  <option value="confirmado">Confirmado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </label>
              <label className="block sm:col-span-4">
                <div className="text-sm font-medium text-slate-700 mb-1">Serviço</div>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                  value={servicoFilterId}
                  onChange={(e) => setServicoFilterId(e.target.value)}
                >
                  <option value="">Todos</option>
                  {servicos.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </Card>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

        {funcionario.pode_bloquear_horarios ? (
          <Card>
            <div className="p-6 space-y-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Bloquear horário</div>
                <div className="text-xs text-slate-600">Cria um bloqueio apenas para você.</div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Input label="Início" type="time" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} step={900} />
                <Input label="Fim" type="time" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} step={900} />
                <Input label="Motivo (opcional)" value={blockMotivo} onChange={(e) => setBlockMotivo(e.target.value)} />
              </div>

              <div className="flex justify-end">
                <Button onClick={createBloqueio} disabled={!canSaveBlock || savingBlock}>
                  Salvar bloqueio
                </Button>
              </div>

              {bloqueios.filter((b) => b.funcionario_id === funcionarioId).length > 0 ? (
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {bloqueios
                    .filter((b) => b.funcionario_id === funcionarioId)
                    .slice()
                    .sort((a, b) => parseTimeToMinutes(a.hora_inicio) - parseTimeToMinutes(b.hora_inicio))
                    .map((b) => (
                      <div key={b.id} className="p-3 flex items-center justify-between gap-3">
                        <div className="text-sm text-slate-700">
                          <span className="font-semibold text-slate-900">{b.hora_inicio}</span>
                          {' – '}
                          <span className="font-semibold text-slate-900">{b.hora_fim}</span>
                          {b.motivo ? <span className="text-slate-500"> {' • '}{b.motivo}</span> : null}
                        </div>
                        <Button variant="danger" onClick={() => removeBloqueio(b)}>
                          Remover
                        </Button>
                      </div>
                    ))}
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        <Card>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="p-6 text-sm text-slate-600">Carregando agenda…</div>
            ) : slots.length === 0 ? (
              <div className="p-6 text-sm text-slate-600">Horário não configurado.</div>
            ) : viewMode === 'dia' ? (
              slots.map((time) => {
                const ag = findAgendamentoAt(time)
                const block = findBloqueioAt(time)
                if (ag) {
                  const visible = matchesFilters(ag)
                  const statusUi = resolveStatusUi(ag.status)
                  return (
                    <div key={time} className="p-4 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                          {ag.servico?.cor ? (
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ag.servico.cor }} />
                          ) : null}
                          <span>
                            {time} - {visible ? ag.cliente_nome : 'Ocupado'}
                          </span>
                        </div>
                        {visible ? <div className="text-sm text-slate-600">📱 {ag.cliente_telefone}</div> : null}
                        {visible ? (
                          <div className="text-sm text-slate-700">
                            ✂️ {ag.servico?.nome}{' '}
                            {funcionario.pode_ver_financeiro && ag.servico?.preco ? `- ${formatBRMoney(Number(ag.servico.preco))}` : ''}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge tone={statusUi.tone}>{statusUi.label}</Badge>
                        {ag.status !== 'cancelado' && visible ? (
                          <div className="flex gap-2">
                            {funcionario.pode_criar_agendamentos ? (
                              <Button
                                variant="secondary"
                                onClick={async () => {
                                  setError(null)
                                  const { error: updErr } = await supabase
                                    .from('agendamentos')
                                    .update({ status: 'confirmado' })
                                    .eq('id', ag.id)
                                    .eq('funcionario_id', funcionario.id)
                                  if (updErr) {
                                    setError(updErr.message)
                                    return
                                  }
                                  setAgendamentos((prev) => prev.map((x) => (x.id === ag.id ? { ...x, status: 'confirmado' } : x)))
                                  const sendRes = await sendConfirmacaoWhatsapp(ag.id)
                                  if (!sendRes.ok) {
                                    if (typeof sendRes.body === 'object' && sendRes.body !== null && (sendRes.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt') {
                                      setError('A Edge Function "whatsapp" está exigindo JWT no Supabase. Refaça o deploy com verify_jwt=false e tente novamente.')
                                      return
                                    }
                                    if (typeof sendRes.body === 'object' && sendRes.body !== null && (sendRes.body as Record<string, unknown>).error === 'invalid_jwt') {
                                      setError('Sessão inválida no Supabase. Saia e entre novamente no sistema.')
                                      return
                                    }
                                    const details = typeof sendRes.body === 'string' ? sendRes.body : JSON.stringify(sendRes.body)
                                    setError(`Falha ao enviar confirmação (HTTP ${sendRes.status}): ${details}`)
                                  }
                                }}
                              >
                                ✓ Confirmar
                              </Button>
                            ) : null}
                            {funcionario.pode_cancelar_agendamentos ? (
                              <Button
                                variant="danger"
                                onClick={async () => {
                                  await supabase
                                    .from('agendamentos')
                                    .update({ status: 'cancelado', cancelado_em: new Date().toISOString() })
                                    .eq('id', ag.id)
                                    .eq('funcionario_id', funcionario.id)
                                }}
                              >
                                ✗ Cancelar
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                }
                if (block) {
                  const isStart = time === block.hora_inicio
                  const canDelete = funcionario.pode_bloquear_horarios && block.funcionario_id === funcionarioId && isStart
                  return (
                    <div key={time} className="p-4 flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">
                        {time} - 🔒 BLOQUEADO {isStart && block.motivo ? `(${block.motivo})` : ''}
                      </div>
                      <div className="flex items-center gap-2">
                        {canDelete ? (
                          <Button variant="danger" onClick={() => removeBloqueio(block)}>
                            Remover
                          </Button>
                        ) : null}
                        <Badge tone="yellow">Bloqueado</Badge>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={time} className="p-4 flex items-center justify-between">
                    <div className="text-sm text-slate-600">{time} - LIVRE</div>
                  </div>
                )
              })
            ) : (
              <div className="p-4">
                <div className="overflow-x-auto">
                  <div className="grid grid-cols-7 gap-3 min-w-[980px]">
                    {weekDays.map((d) => {
                      const ags = agendamentosByDay[d.key] ?? []
                      const bls = bloqueiosByDay[d.key] ?? []
                      const visibleAgCount = ags.filter((a) => a.status !== 'cancelado').length
                      const label = d.date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
                      return (
                        <div key={d.key} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
                            <div className="text-sm font-semibold text-slate-900 flex items-center justify-between gap-2">
                              <span>{label}</span>
                              <span className="text-xs text-slate-600">{visibleAgCount} ag.</span>
                            </div>
                          </div>
                          <div className="divide-y divide-slate-100">
                            {ags.length === 0 && bls.length === 0 ? (
                              <div className="px-3 py-3 text-sm text-slate-600">Sem itens</div>
                            ) : (
                              [...ags.map((a) => ({ kind: 'ag' as const, time: a.hora_inicio, ag: a })), ...bls.map((b) => ({ kind: 'b' as const, time: b.hora_inicio, b }))]
                                .sort((x, y) => parseTimeToMinutes(x.time) - parseTimeToMinutes(y.time))
                                .map((item) => {
                                  if (item.kind === 'b') {
                                    return (
                                      <div key={`b:${item.b.id}`} className="px-3 py-2 flex items-start justify-between gap-2">
                                        <div className="text-sm text-slate-700">
                                          <div className="font-semibold text-slate-900">
                                            {item.b.hora_inicio}–{item.b.hora_fim}
                                          </div>
                                          <div className="text-slate-600">🔒 Bloqueado {item.b.motivo ? `• ${item.b.motivo}` : ''}</div>
                                        </div>
                                        <Badge tone="yellow">Bloqueado</Badge>
                                      </div>
                                    )
                                  }
                                  const a = item.ag
                                  const visible = matchesFilters(a)
                                  const statusUi = resolveStatusUi(a.status)
                                  return (
                                    <div key={`ag:${a.id}`} className="px-3 py-2 flex items-start justify-between gap-2">
                                      <div className="text-sm text-slate-700">
                                        <div className="font-semibold text-slate-900 flex items-center gap-2">
                                          {a.servico?.cor ? (
                                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.servico.cor }} />
                                          ) : null}
                                          <span>
                                            {a.hora_inicio} • {visible ? a.cliente_nome : 'Ocupado'}
                                          </span>
                                        </div>
                                        {visible ? <div className="text-slate-600">{a.servico?.nome ?? 'Serviço'}</div> : null}
                                      </div>
                                      <Badge tone={statusUi.tone}>{statusUi.label}</Badge>
                                    </div>
                                  )
                                })
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-6 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Resumo do Dia</div>
              <div className="text-sm text-slate-600">
                {agendamentos.filter((a) => a.status !== 'cancelado').length} agendamentos
              </div>
            </div>
            <div className="text-lg font-semibold text-slate-900">{funcionario.pode_ver_financeiro ? formatBRMoney(totalDia) : '—'}</div>
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
