import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { PageTutorial, TutorialOverlay } from '../../components/ui/TutorialOverlay'
import { formatBRMoney, minutesToTime, normalizeTimeHHMM, parseTimeToMinutes, toISODate } from '../../lib/dates'
import { checkJwtProject, supabase, supabaseEnv } from '../../lib/supabase'
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
  extras: Record<string, unknown> | null
  servico: { id: string; nome: string; preco: number; duracao_minutos: number; cor: string | null } | null
}

type Funcionario = { id: string; nome_completo: string; ativo: boolean }

type ServicoOption = { id: string; nome: string; cor: string | null }

type Bloqueio = { id: string; data: string; hora_inicio: string; hora_fim: string; motivo: string | null; funcionario_id: string | null }

function formatSupabaseError(err: { message: string; details?: string | null; hint?: string | null; code?: string | null }) {
  const parts = [err.message]
  if (err.code) parts.push(`code=${err.code}`)
  if (err.details) parts.push(err.details)
  if (err.hint) parts.push(err.hint)
  return parts.filter((p) => typeof p === 'string' && p.trim()).join(' • ')
}

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

function readExtrasEndereco(extras: unknown) {
  if (!extras || typeof extras !== 'object') return null
  const v = (extras as Record<string, unknown>).endereco
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t : null
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

function addMonths(value: Date, months: number) {
  const d = new Date(value)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return d
}

function parseDateKey(value: string) {
  const [y, m, d] = value.split('-').map((v) => Number(v))
  const out = new Date(y, m - 1, d)
  out.setHours(0, 0, 0, 0)
  return out
}

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB
}

type RepeatKind = 'none' | 'daily' | 'weekly' | 'monthly'

function buildRepeatKeys(startKey: string, repeat: RepeatKind, untilKey: string | null) {
  if (repeat === 'none') return { keys: [startKey], error: null as string | null }
  if (!untilKey) return { keys: [] as string[], error: 'Selecione a data final da recorrência.' }

  const start = parseDateKey(startKey)
  const until = parseDateKey(untilKey)
  if (until < start) return { keys: [] as string[], error: 'A data final deve ser igual ou posterior ao início.' }

  const keys: string[] = []
  const max = 90
  let cur = start
  while (cur <= until && keys.length < max) {
    keys.push(toISODate(cur))
    cur = repeat === 'daily' ? addDays(cur, 1) : repeat === 'weekly' ? addDays(cur, 7) : addMonths(cur, 1)
  }

  if (cur <= until) {
    return { keys: [] as string[], error: 'Intervalo muito grande. Reduza a data final da recorrência.' }
  }

  return { keys, error: null as string | null }
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

  const tokenProject = checkJwtProject(token, supabaseUrl)
  if (!tokenProject.ok) {
    await supabase.auth.signOut().catch(() => undefined)
    return { ok: false as const, status: 401, body: { error: 'jwt_project_mismatch', iss: tokenProject.iss, expected: tokenProject.expectedPrefix } }
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

  if (!first.ok && first.status === 401 && isInvalidJwtPayload(first.body)) {
    const refreshed = await tryRefresh()
    const nextToken = refreshed?.access_token ?? null
    if (!nextToken) return { ok: false as const, status: 401, body: { error: 'invalid_jwt' } }
    return callFetch(nextToken)
  }

  return first
}

export function DashboardPage() {
  const { appPrincipal, masterUsuario, masterUsuarioLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const funcionario = appPrincipal?.kind === 'funcionario' ? appPrincipal.profile : null
  const isGerente = appPrincipal?.kind === 'funcionario' && appPrincipal.profile.permissao === 'admin'
  const usuario = appPrincipal?.kind === 'usuario' ? appPrincipal.profile : isGerente ? masterUsuario : null
  const usuarioId = usuario?.id ?? null

  const canVerFinanceiro = appPrincipal?.kind === 'usuario' ? true : Boolean(funcionario?.pode_ver_financeiro)
  const canBloquearHorarios = appPrincipal?.kind === 'usuario' ? true : Boolean(funcionario?.pode_bloquear_horarios)
  const canConfirmarAgendamento = appPrincipal?.kind === 'usuario' ? true : Boolean(funcionario?.pode_criar_agendamentos)
  const canCancelarAgendamento = appPrincipal?.kind === 'usuario' ? true : Boolean(funcionario?.pode_cancelar_agendamentos)

  const canUseRecurringBlocks = useMemo(() => {
    const p = String(usuario?.plano ?? '').trim().toLowerCase()
    return p === 'pro' || p === 'team' || p === 'enterprise'
  }, [usuario?.plano])

  useEffect(() => {
    const search = location.search ?? ''
    if (!search) return
    const params = new URLSearchParams(search)
    const checkout = (params.get('checkout') ?? '').trim().toLowerCase()
    if (checkout === 'success' || checkout === 'cancel') {
      navigate(`/pagamento${search}`, { replace: true })
    }
  }, [location.search, navigate])

  const tutorialSteps = useMemo(
    () =>
      [
        {
          title: 'Navegação do dia',
          body: 'Use as setas para avançar/voltar o dia e conferir a agenda.',
          target: 'nav' as const,
        },
        {
          title: 'Filtro por profissional',
          body: 'Filtre para ver apenas os agendamentos de um profissional específico.',
          target: 'filter' as const,
        },
        {
          title: 'Bloquear horário',
          body: 'Crie bloqueios gerais ou por profissional para impedir novos horários.',
          target: 'block' as const,
        },
        {
          title: 'Agenda do dia',
          body: 'Aqui aparecem os horários livres, bloqueados e agendamentos.',
          target: 'agenda' as const,
        },
        {
          title: 'Resumo',
          body: 'Veja quantidade de agendamentos e total do dia em um resumo rápido.',
          target: 'summary' as const,
        },
      ] as const,
    []
  )

  const [date, setDate] = useState(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return now
  })

  const [viewMode, setViewMode] = useState<'dia' | 'semana'>('dia')

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [filterFuncionarioId, setFilterFuncionarioId] = useState<string>('')
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
  const [blockFuncionarioId, setBlockFuncionarioId] = useState<string>('')
  const [blockRepeat, setBlockRepeat] = useState<RepeatKind>('none')
  const [blockRepeatUntil, setBlockRepeatUntil] = useState('')
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
      const aStatus = (a.status ?? '').trim().toLowerCase()
      if (!statusNorm && aStatus === 'cancelado') return false
      if (statusNorm && aStatus !== statusNorm) return false
      if (servicoId && a.servico?.id !== servicoId) return false
      if (!searchNorm) return true
      const hay = normalizeText([a.cliente_nome, a.cliente_telefone, a.servico?.nome ?? '', a.hora_inicio].filter(Boolean).join(' '))
      return hay.includes(searchNorm)
    }
  }, [searchNorm, servicoFilterId, statusFilter])

  const hasAnyFilter = useMemo(() => Boolean(statusFilter.trim() || servicoFilterId.trim() || searchNorm.trim()), [searchNorm, servicoFilterId, statusFilter])

  const slotStepMinutes = 30

  const slots = useMemo(() => {
    if (!usuario?.horario_inicio || !usuario?.horario_fim) return []
    return buildSlots(usuario.horario_inicio, usuario.horario_fim, usuario.intervalo_inicio, usuario.intervalo_fim, slotStepMinutes)
  }, [slotStepMinutes, usuario])

  const totalDia = useMemo(() => {
    if (!canVerFinanceiro) return 0
    return agendamentos
      .filter((a) => a.status !== 'cancelado')
      .reduce((sum, a) => sum + (a.servico?.preco ? Number(a.servico.preco) : 0), 0)
  }, [agendamentos, canVerFinanceiro])

  useEffect(() => {
    const run = async () => {
      if (!usuarioId) return
      const { data: servicosData, error: servicosError } = await supabase
        .from('servicos')
        .select('id,nome,cor')
        .eq('usuario_id', usuarioId)
        .eq('ativo', true)
        .order('ordem', { ascending: true })
        .order('criado_em', { ascending: true })
      if (!servicosError) {
        setServicos((servicosData ?? []) as unknown as ServicoOption[])
      }

      setLoading(true)
      setError(null)

      const { data: funcionariosData, error: funcionariosError } = await supabase
        .from('funcionarios')
        .select('id,nome_completo,ativo')
        .eq('usuario_master_id', usuarioId)
        .eq('permissao', 'funcionario')
        .order('criado_em', { ascending: true })
      if (funcionariosError) {
        setError(funcionariosError.message)
        setLoading(false)
        return
      }
      setFuncionarios(funcionariosData ?? [])

      const base = supabase
        .from('agendamentos')
        .select('id,cliente_nome,cliente_telefone,data,hora_inicio,hora_fim,status,funcionario_id,extras,servico:servico_id(id,nome,preco,duracao_minutos,cor)')
        .eq('usuario_id', usuarioId)
        .order('data', { ascending: true })
        .order('hora_inicio', { ascending: true })

      const baseWithRange =
        viewMode === 'dia'
          ? base.eq('data', dayKey)
          : base.gte('data', weekStartKey).lte('data', weekEndKey)

      const { data: agData, error: agError } = filterFuncionarioId
        ? await baseWithRange.eq('funcionario_id', filterFuncionarioId)
        : await baseWithRange
      if (agError) {
        setError(agError.message)
        setLoading(false)
        return
      }
      const normalizedAgs = (agData ?? []).map((row) => {
        const r = row as unknown as Record<string, unknown>
        const horaInicio = normalizeTimeHHMM(String(r.hora_inicio ?? ''))
        const horaFimRaw = r.hora_fim
        const horaFim = horaFimRaw ? normalizeTimeHHMM(String(horaFimRaw)) : null
        return { ...r, hora_inicio: horaInicio, hora_fim: horaFim } as unknown as Agendamento
      })
      setAgendamentos(normalizedAgs)

      let bloqueiosQuery = supabase
        .from('bloqueios')
        .select('id,data,hora_inicio,hora_fim,motivo,funcionario_id')
        .eq('usuario_id', usuarioId)

      bloqueiosQuery =
        viewMode === 'dia'
          ? bloqueiosQuery.eq('data', dayKey)
          : bloqueiosQuery.gte('data', weekStartKey).lte('data', weekEndKey)
      if (filterFuncionarioId) {
        bloqueiosQuery = bloqueiosQuery.or(`funcionario_id.is.null,funcionario_id.eq.${filterFuncionarioId}`)
      }

      const { data: bloqueiosData, error: bloqueiosError } = await bloqueiosQuery
      if (bloqueiosError) {
        setError(bloqueiosError.message)
        setLoading(false)
        return
      }
      const normalizedBlocks = (bloqueiosData ?? []).map((row) => {
        const r = row as unknown as Record<string, unknown>
        const horaInicio = normalizeTimeHHMM(String(r.hora_inicio ?? ''))
        const horaFim = normalizeTimeHHMM(String(r.hora_fim ?? ''))
        return { ...r, hora_inicio: horaInicio, hora_fim: horaFim } as unknown as Bloqueio
      })
      setBloqueios(normalizedBlocks)
      setLoading(false)
    }
    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar')
      setLoading(false)
    })
  }, [usuarioId, dayKey, filterFuncionarioId, viewMode, weekEndKey, weekStartKey])

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

  const findAgendamentoAt = (time: string) => {
    const t = parseTimeToMinutes(time)
    const overlap = (a: Agendamento) => {
      const start = parseTimeToMinutes(a.hora_inicio)
      if (!Number.isFinite(start)) return false
      const end = (() => {
        if (a.hora_fim) {
          const v = parseTimeToMinutes(a.hora_fim)
          if (Number.isFinite(v)) return v
        }
        const dur = a.servico?.duracao_minutos != null ? Number(a.servico.duracao_minutos) : 0
        if (Number.isFinite(dur) && dur > 0) return start + dur
        return start + 1
      })()
      return t >= start && t < end
    }

    const candidates = agendamentos.filter(overlap)
    if (candidates.length === 0) return null

    if (hasAnyFilter) {
      const filtered = candidates.filter(matchesFilters)
      return filtered[0] ?? null
    }

    const active = candidates.filter((a) => (a.status ?? '').trim().toLowerCase() !== 'cancelado')
    return active[0] ?? null
  }

  const findAgendamentoStartInSlot = (time: string) => {
    const t = parseTimeToMinutes(time)
    if (!Number.isFinite(t)) return null
    const end = t + slotStepMinutes

    const candidates = agendamentos
      .filter((a) => {
        const start = parseTimeToMinutes(a.hora_inicio)
        return Number.isFinite(start) && start >= t && start < end
      })
      .slice()
      .sort((x, y) => parseTimeToMinutes(x.hora_inicio) - parseTimeToMinutes(y.hora_inicio))

    if (candidates.length === 0) return null

    if (hasAnyFilter) {
      const filtered = candidates.filter(matchesFilters)
      return filtered[0] ?? null
    }

    const active = candidates.filter((a) => (a.status ?? '').trim().toLowerCase() !== 'cancelado')
    return active[0] ?? candidates[0] ?? null
  }

  const findBloqueioAt = (time: string) => {
    const t = parseTimeToMinutes(time)
    return bloqueios.find((b) => {
      const s = parseTimeToMinutes(b.hora_inicio)
      const e = parseTimeToMinutes(b.hora_fim)
      return t >= s && t < e
    })
  }

  const findBloqueioStartInSlot = (time: string) => {
    const t = parseTimeToMinutes(time)
    if (!Number.isFinite(t)) return null
    const end = t + slotStepMinutes

    const candidates = bloqueios
      .filter((b) => {
        const start = parseTimeToMinutes(b.hora_inicio)
        return Number.isFinite(start) && start >= t && start < end
      })
      .slice()
      .sort((x, y) => parseTimeToMinutes(x.hora_inicio) - parseTimeToMinutes(y.hora_inicio))

    return candidates[0] ?? null
  }

  const effectiveBlockRepeat = canUseRecurringBlocks ? blockRepeat : 'none'
  const effectiveBlockRepeatUntil = canUseRecurringBlocks ? blockRepeatUntil : ''

  const repeatPreview = useMemo(() => {
    return buildRepeatKeys(dayKey, effectiveBlockRepeat, effectiveBlockRepeatUntil.trim() ? effectiveBlockRepeatUntil : null)
  }, [dayKey, effectiveBlockRepeat, effectiveBlockRepeatUntil])

  const canSaveBlock = useMemo(() => {
    if (!usuarioId) return false
    if (!blockStart || !blockEnd) return false
    const s = parseTimeToMinutes(blockStart)
    const e = parseTimeToMinutes(blockEnd)
    if (!Number.isFinite(s) || !Number.isFinite(e)) return false
    if (e <= s) return false
    if (repeatPreview.error) return false
    if (repeatPreview.keys.length === 0) return false
    return true
  }, [usuarioId, blockStart, blockEnd, repeatPreview.error, repeatPreview.keys.length])

  const resolveFuncionarioLabel = (id: string | null) => {
    if (!id) return 'Geral'
    return funcionarios.find((f) => f.id === id)?.nome_completo ?? 'Profissional'
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

  const createBloqueio = async () => {
    if (!usuarioId || !canSaveBlock || !canBloquearHorarios) return
    setSavingBlock(true)
    setError(null)
    const funcionarioId = blockFuncionarioId.trim() ? blockFuncionarioId : null
    const motivo = blockMotivo.trim() ? blockMotivo.trim() : null

    const { keys, error: repeatErr } = buildRepeatKeys(
      dayKey,
      effectiveBlockRepeat,
      effectiveBlockRepeatUntil.trim() ? effectiveBlockRepeatUntil : null
    )
    if (repeatErr) {
      setError(repeatErr)
      setSavingBlock(false)
      return
    }

    const s = parseTimeToMinutes(blockStart)
    const e = parseTimeToMinutes(blockEnd)
    type OcupacaoRow = { start_min: number; end_min: number }
    for (const k of keys) {
      const { data: ocupacoesData, error: ocupacoesErr } = await supabase.rpc('public_get_ocupacoes', {
        p_usuario_id: usuarioId,
        p_data: k,
        p_funcionario_id: funcionarioId,
      })
      if (ocupacoesErr) {
        setError(ocupacoesErr.message)
        setSavingBlock(false)
        return
      }
      const occupied = ((ocupacoesData ?? []) as unknown as OcupacaoRow[]).some((r) => overlaps(s, e, r.start_min, r.end_min))
      if (occupied) {
        setError(`Conflito de horário em ${new Date(k).toLocaleDateString('pt-BR')}.`)
        setSavingBlock(false)
        return
      }
    }

    const rows = keys.map((k) => ({
      usuario_id: usuarioId,
      data: k,
      hora_inicio: blockStart,
      hora_fim: blockEnd,
      motivo,
      funcionario_id: funcionarioId,
    }))

    const { data: createdRows, error: err } = await supabase
      .from('bloqueios')
      .insert(rows)
      .select('id,data,hora_inicio,hora_fim,motivo,funcionario_id')

    if (err) {
      setError(err.message)
      setSavingBlock(false)
      return
    }

    const inserted = (createdRows ?? []) as unknown as Bloqueio[]
    const inRange = (b: Bloqueio) =>
      viewMode === 'dia' ? b.data === dayKey : b.data >= weekStartKey && b.data <= weekEndKey

    setBloqueios((prev) => [...prev, ...inserted.filter(inRange)])
    setBlockMotivo('')
    setBlockRepeat('none')
    setBlockRepeatUntil('')
    setSavingBlock(false)
  }

  const removeBloqueio = async (b: Bloqueio) => {
    if (!usuarioId || !canBloquearHorarios) return
    setError(null)
    const ok = window.confirm('Remover este bloqueio?')
    if (!ok) return
    const { error: err } = await supabase.from('bloqueios').delete().eq('id', b.id).eq('usuario_id', usuarioId)
    if (err) {
      setError(err.message)
      return
    }
    setBloqueios((prev) => prev.filter((x) => x.id !== b.id))
  }

  if (!usuario) {
    return (
      <AppShell>
        <div className="text-slate-700">{isGerente && masterUsuarioLoading ? 'Carregando…' : 'Acesso restrito.'}</div>
      </AppShell>
    )
  }

  if (funcionario && !funcionario.pode_ver_agenda) {
    return (
      <AppShell>
        <div className="text-slate-700">Acesso restrito.</div>
      </AppShell>
    )
  }

  return (
    <PageTutorial usuarioId={usuarioId} page="dashboard">
      {({ tutorialOpen, tutorialStep, setTutorialStep, resetTutorial, closeTutorial }) => (
        <AppShell>
          <div className="space-y-6">
            <Card>
              <div className="p-6">
                <div
                  className={[
                    'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
                    tutorialOpen && tutorialSteps[tutorialStep]?.target === 'nav'
                      ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl p-2 -m-2'
                      : '',
                  ].join(' ')}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="secondary" onClick={prevPeriod}>
                      &lt;
                    </Button>
                    <div className="text-sm font-semibold text-slate-900">{rangeLabel}</div>
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

                    <Button variant="secondary" onClick={resetTutorial}>
                      Rever tutorial
                    </Button>
                  </div>

                  <div
                    className={[
                      'flex flex-wrap items-center gap-2',
                      tutorialOpen && tutorialSteps[tutorialStep]?.target === 'filter'
                        ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl p-2'
                        : '',
                    ].join(' ')}
                  >
                <div className="text-sm text-slate-600">Filtrar por:</div>
                <button
                  type="button"
                  onClick={() => {
                    setFilterFuncionarioId('')
                    setBlockFuncionarioId('')
                  }}
                  className={[
                    'rounded-lg px-3 py-1.5 text-sm font-medium',
                    !filterFuncionarioId ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                  ].join(' ')}
                >
                  Todos
                </button>
                {funcionarios
                  .filter((f) => f.ativo)
                  .map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setFilterFuncionarioId(f.id)
                        setBlockFuncionarioId(f.id)
                      }}
                      className={[
                        'rounded-lg px-3 py-1.5 text-sm font-medium',
                        filterFuncionarioId === f.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                      ].join(' ')}
                    >
                      {f.nome_completo.split(' ')[0]}
                    </button>
                  ))}
              </div>
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
                  <option value="concluido">Concluído</option>
                  <option value="nao_compareceu">No-show</option>
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

        <div
          className={
            tutorialOpen && tutorialSteps[tutorialStep]?.target === 'block'
              ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
              : ''
          }
        >
          <Card>
            {canBloquearHorarios ? (
            <div className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Bloquear horário</div>
                <div className="text-xs text-slate-600">Bloqueio geral ou por profissional.</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <Input label="Início" type="time" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} step={900} />
              <Input label="Fim" type="time" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} step={900} />
              <label className="block">
                <div className="text-sm font-medium text-slate-700 mb-1">Profissional</div>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                  value={blockFuncionarioId}
                  onChange={(e) => setBlockFuncionarioId(e.target.value)}
                >
                  <option value="">Geral</option>
                  {funcionarios
                    .filter((f) => f.ativo)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome_completo}
                      </option>
                    ))}
                </select>
              </label>
              <Input label="Motivo (opcional)" value={blockMotivo} onChange={(e) => setBlockMotivo(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <label className="block">
                <div className="text-sm font-medium text-slate-700 mb-1">Repetir</div>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                  value={blockRepeat}
                  disabled={!canUseRecurringBlocks}
                  onChange={(e) => {
                    if (!canUseRecurringBlocks) return
                    const next = e.target.value as RepeatKind
                    setBlockRepeat(next)
                    if (next === 'none') {
                      setBlockRepeatUntil('')
                      return
                    }
                    if (!blockRepeatUntil.trim()) {
                      setBlockRepeatUntil(toISODate(addDays(date, next === 'monthly' ? 180 : 30)))
                    }
                  }}
                >
                  <option value="none">Não repetir</option>
                  {canUseRecurringBlocks ? <option value="daily">Diariamente</option> : null}
                  {canUseRecurringBlocks ? <option value="weekly">Semanalmente</option> : null}
                  {canUseRecurringBlocks ? <option value="monthly">Mensalmente</option> : null}
                </select>
              </label>
              <div className="sm:col-span-3">
                {blockRepeat !== 'none' ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Input
                      label="Até"
                      type="date"
                      min={dayKey}
                      value={blockRepeatUntil}
                      onChange={(e) => setBlockRepeatUntil(e.target.value)}
                    />
                    <div className="sm:col-span-2 flex items-end">
                      <div className="text-xs text-slate-600">
                        {repeatPreview.error ? repeatPreview.error : `Serão criados ${repeatPreview.keys.length} bloqueios.`}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={createBloqueio} disabled={!canSaveBlock || savingBlock}>
                Salvar bloqueio
              </Button>
            </div>

            {bloqueios.length > 0 ? (
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                {bloqueios
                  .slice()
                  .sort((a, b) => parseTimeToMinutes(a.hora_inicio) - parseTimeToMinutes(b.hora_inicio))
                  .map((b) => (
                    <div key={b.id} className="p-3 flex items-center justify-between gap-3">
                      <div className="text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">{b.hora_inicio}</span>
                        {' – '}
                        <span className="font-semibold text-slate-900">{b.hora_fim}</span>
                        {' • '}
                        <span className="text-slate-700">{resolveFuncionarioLabel(b.funcionario_id)}</span>
                        {b.motivo ? <span className="text-slate-500"> {' • '}{b.motivo}</span> : null}
                      </div>
                      {canBloquearHorarios ? (
                        <Button variant="danger" onClick={() => removeBloqueio(b)}>
                          Remover
                        </Button>
                      ) : null}
                    </div>
                  ))}
              </div>
            ) : null}
            </div>
            ) : (
              <div className="p-6 text-sm text-slate-700">Acesso restrito.</div>
            )}
          </Card>
        </div>

        <div
          className={
            tutorialOpen && tutorialSteps[tutorialStep]?.target === 'agenda'
              ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
              : ''
          }
        >
          <Card>
            <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="p-6 text-sm text-slate-600">Carregando agenda…</div>
            ) : slots.length === 0 ? (
              <div className="p-6 space-y-3">
                <div className="text-sm text-slate-600">Configure seu horário em /onboarding.</div>
                {agendamentos.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {agendamentos.map((ag) => {
                      const statusUi = resolveStatusUi(ag.status)
                      const endereco = readExtrasEndereco(ag.extras)
                      return (
                        <div key={ag.id} className="p-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {(normalizeTimeHHMM(ag.hora_inicio) || '—')} — {ag.cliente_nome}
                            </div>
                            <div className="text-sm text-slate-600">📱 {ag.cliente_telefone}</div>
                            {endereco ? <div className="text-sm text-slate-600">📍 {endereco}</div> : null}
                            <div className="text-sm text-slate-700">
                              ✂️ {ag.servico?.nome} {canVerFinanceiro && ag.servico?.preco ? `- ${formatBRMoney(Number(ag.servico.preco))}` : ''}
                            </div>
                          </div>
                          <Badge tone={statusUi.tone}>{statusUi.label}</Badge>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            ) : viewMode === 'dia' ? (
              slots.map((time) => {
                const agStart = findAgendamentoStartInSlot(time)
                const agCover = agStart ?? findAgendamentoAt(time)
                const blockStart = findBloqueioStartInSlot(time)
                const blockCover = blockStart ?? findBloqueioAt(time)

                if (agCover) {
                  const isStart = Boolean(agStart)
                  const visible = isStart && matchesFilters(agCover)
                  const statusUi = resolveStatusUi(agCover.status)
                  const startLabel = normalizeTimeHHMM(agCover.hora_inicio)
                  const timeLabel = isStart && startLabel ? startLabel : time
                  const endereco = visible ? readExtrasEndereco(agCover.extras) : null
                  return (
                    <div key={time} className="p-4 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                          {agCover.servico?.cor ? (
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: agCover.servico.cor }} />
                          ) : null}
                          <span>
                            {timeLabel} - {visible ? agCover.cliente_nome : 'Ocupado'}
                          </span>
                        </div>
                        {visible ? <div className="text-sm text-slate-600">📱 {agCover.cliente_telefone}</div> : null}
                        {endereco ? <div className="text-sm text-slate-600">📍 {endereco}</div> : null}
                        {visible ? (
                          <div className="text-sm text-slate-700">
                            ✂️ {agCover.servico?.nome} {canVerFinanceiro && agCover.servico?.preco ? `- ${formatBRMoney(Number(agCover.servico.preco))}` : ''}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge tone={statusUi.tone}>{statusUi.label}</Badge>
                        {agCover.status !== 'cancelado' && visible ? (
                          <div className="flex gap-2">
                            {canConfirmarAgendamento ? (
                              <Button
                                variant="secondary"
                                onClick={async () => {
                                  if (!canConfirmarAgendamento) return
                                setError(null)
                                const { error: updErr } = await supabase.from('agendamentos').update({ status: 'confirmado' }).eq('id', agCover.id)
                                if (updErr) {
                                  const formatted = formatSupabaseError(updErr)
                                  const lower = formatted.toLowerCase()
                                  if (lower.includes('internal server error') || lower.includes('500')) {
                                    setError(
                                      `${formatted} • Provável trigger/função no Postgres falhando. Reexecute no Supabase o “SQL do WhatsApp (trigger confirmação imediata)” e o “SQL de Logs de Auditoria”.`
                                    )
                                    return
                                  }
                                  setError(formatted)
                                  return
                                }
                                setAgendamentos((prev) => prev.map((x) => (x.id === agCover.id ? { ...x, status: 'confirmado' } : x)))
                                const sendRes = await sendConfirmacaoWhatsapp(agCover.id)
                                if (!sendRes.ok) {
                                  if (typeof sendRes.body === 'object' && sendRes.body !== null && (sendRes.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt') {
                                    setError('JWT inválido para chamar a Edge Function. Saia e entre novamente. Se persistir, reimplante a função com verify_jwt=false (--no-verify-jwt).')
                                    return
                                  }
                                  if (typeof sendRes.body === 'object' && sendRes.body !== null && (sendRes.body as Record<string, unknown>).error === 'jwt_project_mismatch') {
                                    setError('Sessão do Supabase pertence a outro projeto. Saia e entre novamente no sistema.')
                                    return
                                  }
                                  if (typeof sendRes.body === 'object' && sendRes.body !== null && (sendRes.body as Record<string, unknown>).error === 'invalid_jwt') {
                                    setError('Sessão inválida no Supabase. Saia e entre novamente no sistema.')
                                    return
                                  }
                                  if (typeof sendRes.body === 'object' && sendRes.body !== null) {
                                    const hint = (sendRes.body as Record<string, unknown>).hint
                                    if (typeof hint === 'string' && hint.trim()) {
                                      setError(hint)
                                      return
                                    }
                                    const code = (sendRes.body as Record<string, unknown>).error
                                    if (code === 'instance_not_connected') {
                                      setError('WhatsApp não conectado. Vá em Configurações > WhatsApp e conecte a instância (QR Code).')
                                      return
                                    }
                                  }
                                  const details = typeof sendRes.body === 'string' ? sendRes.body : JSON.stringify(sendRes.body)
                                  setError(`Falha ao enviar confirmação (HTTP ${sendRes.status}): ${details}`)
                                }
                              }}
                              >
                                ✓ Confirmar
                              </Button>
                            ) : null}
                            {canCancelarAgendamento ? (
                              <Button
                                variant="secondary"
                                onClick={async () => {
                                  if (!canCancelarAgendamento) return
                                setError(null)
                                const ok = window.confirm('Marcar como no-show?')
                                if (!ok) return
                                const { error: updErr } = await supabase
                                  .from('agendamentos')
                                  .update({ status: 'nao_compareceu' })
                                  .eq('id', agCover.id)
                                if (updErr) {
                                  setError(formatSupabaseError(updErr))
                                  return
                                }
                                setAgendamentos((prev) => prev.map((x) => (x.id === agCover.id ? { ...x, status: 'nao_compareceu' } : x)))
                              }}
                              >
                                No-show
                              </Button>
                            ) : null}
                            {canCancelarAgendamento ? (
                              <Button
                                variant="danger"
                                onClick={async () => {
                                  if (!canCancelarAgendamento) return
                                setError(null)
                                const { error: updErr } = await supabase
                                  .from('agendamentos')
                                  .update({ status: 'cancelado', cancelado_em: new Date().toISOString() })
                                  .eq('id', agCover.id)
                                if (updErr) {
                                  setError(formatSupabaseError(updErr))
                                  return
                                }
                                setAgendamentos((prev) => prev.map((x) => (x.id === agCover.id ? { ...x, status: 'cancelado' } : x)))
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
                if (blockCover) {
                  const isStart = Boolean(blockStart)
                  const timeLabel = isStart ? blockCover.hora_inicio : time
                  return (
                    <div key={time} className="p-4 flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">
                        {timeLabel} - 🔒 BLOQUEADO {isStart && blockCover.motivo ? `(${blockCover.motivo})` : ''}
                      </div>
                      <div className="flex items-center gap-2">
                        {isStart && blockCover.funcionario_id ? <Badge>{resolveFuncionarioLabel(blockCover.funcionario_id)}</Badge> : null}
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
                      const visibleAgs = ags.filter(matchesFilters)
                      const visibleAgCount = visibleAgs.length
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
                            {visibleAgs.length === 0 && bls.length === 0 ? (
                              <div className="px-3 py-3 space-y-2">
                                <div className="text-sm text-slate-600">Sem itens</div>
                                {hasAnyFilter ? (
                                  <div>
                                    <Button
                                      variant="secondary"
                                      onClick={() => {
                                        setSearch('')
                                        setStatusFilter('')
                                        setServicoFilterId('')
                                      }}
                                    >
                                      Limpar filtros
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              [...visibleAgs.map((a) => ({ kind: 'ag' as const, time: a.hora_inicio, ag: a })), ...bls.map((b) => ({ kind: 'b' as const, time: b.hora_inicio, b }))]
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
                                  const visible = true
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
                                        {visible ? (() => {
                                          const endereco = readExtrasEndereco(a.extras)
                                          return endereco ? <div className="text-slate-600">📍 {endereco}</div> : null
                                        })() : null}
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
        </div>

        <div
          className={
            tutorialOpen && tutorialSteps[tutorialStep]?.target === 'summary'
              ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
              : ''
          }
        >
          <Card>
            <div className="p-6 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Resumo do Dia</div>
              <div className="text-sm text-slate-600">
                {agendamentos.filter((a) => a.status !== 'cancelado').length} agendamentos
              </div>
            </div>
            <div className="text-lg font-semibold text-slate-900">{canVerFinanceiro ? formatBRMoney(totalDia) : '—'}</div>
            </div>
          </Card>
        </div>
      </div>

          <TutorialOverlay open={tutorialOpen} steps={tutorialSteps} step={tutorialStep} onStepChange={setTutorialStep} onClose={closeTutorial} />
        </AppShell>
      )}
    </PageTutorial>
  )
}
