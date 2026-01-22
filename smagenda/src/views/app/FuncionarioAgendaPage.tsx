import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { PageTutorial, TutorialOverlay } from '../../components/ui/TutorialOverlay'
import { formatBRMoney, minutesToTime, normalizeTimeHHMM, parseTimeToMinutes, toISODate } from '../../lib/dates'
import { checkJwtProject, supabase, supabaseEnv } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

function isMissingColumnErrorMessage(message: string, column: string) {
  const lower = String(message ?? '').toLowerCase()
  const col = String(column ?? '').toLowerCase()
  if (!lower || !col) return false
  if (!lower.includes('does not exist') && !lower.includes('schema cache') && !lower.includes('could not find')) return false
  return lower.includes(col)
}

type Agendamento = {
  id: string
  cliente_nome: string
  cliente_telefone: string
  qtd_vagas: number | null
  data: string
  hora_inicio: string
  hora_fim: string | null
  status: string
  funcionario_id: string | null
  extras: Record<string, unknown> | null
  servico: {
    id: string
    nome: string
    preco: number
    duracao_minutos: number
    cor: string | null
    capacidade_por_horario?: number | null
  } | null
}

function readExtrasEndereco(extras: unknown) {
  if (!extras || typeof extras !== 'object') return null
  const v = (extras as Record<string, unknown>).endereco
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t : null
}

type ServicoOption = { id: string; nome: string; cor: string | null }

type Bloqueio = { id: string; data: string; hora_inicio: string; hora_fim: string; motivo: string | null; funcionario_id: string | null }

type FuncionarioOption = {
  id: string
  nome_completo: string
  ativo: boolean
  horario_inicio: string | null
  horario_fim: string | null
  intervalo_inicio: string | null
  intervalo_fim: string | null
}

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

function resolveStatusUi(status: string | null | undefined): { label: string; tone: 'slate' | 'green' | 'yellow' | 'red' } {
  const raw = String(status ?? '')
  const s = raw.trim().toLowerCase()
  if (!s) return { label: 'Pendente', tone: 'yellow' }
  if (s === 'confirmado') return { label: 'Confirmado', tone: 'green' }
  if (s === 'cancelado') return { label: 'Cancelado', tone: 'red' }
  if (s === 'pendente') return { label: 'Pendente', tone: 'yellow' }
  if (s === 'concluido' || s === 'concluído') return { label: 'Concluído', tone: 'green' }
  if (s === 'nao_compareceu' || s === 'não_compareceu' || s === 'no_show') return { label: 'No-show', tone: 'red' }
  return { label: raw || 'Status', tone: 'slate' }
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

async function sendCancelamentoWhatsapp(agendamentoId: string) {
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
        body: JSON.stringify({ action: 'send_cancelamento', agendamento_id: agendamentoId }),
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
  const { appPrincipal, refresh } = useAuth()
  const funcionario = appPrincipal?.kind === 'funcionario' ? appPrincipal.profile : null
  const funcionarioId = funcionario?.id ? funcionario.id : null
  const usuarioMasterId = (() => {
    const raw = funcionario?.usuario_master_id
    const v = typeof raw === 'string' ? raw.trim() : ''
    return v ? v : null
  })()

  const formatQueryError = (err: { message: string; details?: string | null; hint?: string | null; code?: string | null }) => {
    const formatted = formatSupabaseError(err)
    const lower = formatted.toLowerCase()
    const isRls = lower.includes('row-level security') || lower.includes('rls')
    const isDenied = lower.includes('permission denied') || lower.includes('not allowed') || err.code === '42501'
    if (isRls || isDenied) {
      return `${formatted} • Verifique se o atendente está com “Ver agenda” ativo e reexecute no Supabase o “SQL de políticas (Usuário / Funcionário)”.`
    }
    return formatted
  }

  const tutorialSteps = useMemo(
    () =>
      [
        {
          title: 'Navegação e filtros',
          body: 'Use dia/semana, setas e filtros para encontrar agendamentos rapidamente.',
          target: 'filtros' as const,
        },
        {
          title: 'Bloquear horário',
          body: 'Crie bloqueios para reservar horários na sua agenda (quando permitido).',
          target: 'bloqueio' as const,
        },
        {
          title: 'Sua agenda',
          body: 'Aqui aparecem seus horários e agendamentos. Você pode confirmar, marcar no-show ou cancelar (conforme permissão).',
          target: 'agenda' as const,
        },
      ] as const,
    []
  )

  const [usuarioMasterHorario, setUsuarioMasterHorario] = useState<{
    horario_inicio: string | null
    horario_fim: string | null
    intervalo_inicio: string | null
    intervalo_fim: string | null
    dias_trabalho: number[] | null
  } | null>(null)

  const [usuarioMasterPlano, setUsuarioMasterPlano] = useState<string | null>(null)
  const [usuarioMasterTipoNegocio, setUsuarioMasterTipoNegocio] = useState<string | null>(null)

  const isAcademia = useMemo(() => String(usuarioMasterTipoNegocio ?? '').trim().toLowerCase() === 'academia', [usuarioMasterTipoNegocio])

  const [date, setDate] = useState(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return now
  })

  const [viewMode, setViewMode] = useState<'dia' | 'semana'>('dia')

  const agendaLayoutKey = useMemo(() => {
    const id = (funcionarioId ?? '').trim()
    if (!id) return null
    return `smagenda:agenda_layout:${id}`
  }, [funcionarioId])

  const [agendaLayoutVersion, setAgendaLayoutVersion] = useState(0)

  const agendaLayout = useMemo(() => {
    void agendaLayoutVersion
    const fallback: 'grade' | 'lista' = funcionario?.permissao === 'atendente' ? 'lista' : 'grade'
    if (!agendaLayoutKey) return fallback
    try {
      const saved = localStorage.getItem(agendaLayoutKey)
      if (saved === 'grade' || saved === 'lista') return saved
      return fallback
    } catch {
      return fallback
    }
  }, [agendaLayoutKey, agendaLayoutVersion, funcionario?.permissao])

  const canVerAgendaTodos = useMemo(() => {
    if (!funcionario) return false
    if (!funcionario.pode_ver_agenda) return false
    return funcionario.permissao === 'admin' || funcionario.permissao === 'atendente'
  }, [funcionario])

  const [servicos, setServicos] = useState<ServicoOption[]>([])
  const [funcionarios, setFuncionarios] = useState<FuncionarioOption[]>([])
  const [filterFuncionarioId, setFilterFuncionarioId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [servicoFilterId, setServicoFilterId] = useState('')

  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [qtdVagasColumnAvailable, setQtdVagasColumnAvailable] = useState(true)
  const [capacidadePorHorarioColumnAvailable, setCapacidadePorHorarioColumnAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [participantsCtx, setParticipantsCtx] = useState<{
    data: string
    hora_inicio: string
    servico_id: string | null
    funcionario_id: string | null
  } | null>(null)

  const [browserNotifsPermission, setBrowserNotifsPermission] = useState<'default' | 'granted' | 'denied'>(() => {
    if (typeof window === 'undefined') return 'default'
    if (!('Notification' in window)) return 'denied'
    return Notification.permission
  })

  const browserNotifsKey = useMemo(() => {
    const id = typeof funcionarioId === 'string' ? funcionarioId.trim() : ''
    return id ? `smagenda:notifs:funcionario:${id}` : 'smagenda:notifs:funcionario'
  }, [funcionarioId])

  const notifiedIdsRef = useRef<Set<string>>(new Set())

  const [blockStart, setBlockStart] = useState('')
  const [blockEnd, setBlockEnd] = useState('')
  const [blockMotivo, setBlockMotivo] = useState('')
  const [blockRepeat, setBlockRepeat] = useState<RepeatKind>('none')
  const [blockRepeatUntil, setBlockRepeatUntil] = useState('')
  const [savingBlock, setSavingBlock] = useState(false)

  const canUseRecurringBlocks = useMemo(() => {
    const p = String(usuarioMasterPlano ?? '').trim().toLowerCase()
    return p === 'pro' || p === 'team' || p === 'enterprise'
  }, [usuarioMasterPlano])

  const effectiveBlockRepeat = canUseRecurringBlocks ? blockRepeat : 'none'
  const effectiveBlockRepeatUntil = canUseRecurringBlocks ? blockRepeatUntil : ''

  const weekStartDate = useMemo(() => startOfWeek(date), [date])
  const weekEndDate = useMemo(() => addDays(weekStartDate, 6), [weekStartDate])
  const dayKey = useMemo(() => toISODate(date), [date])
  const weekStartKey = useMemo(() => toISODate(weekStartDate), [weekStartDate])
  const weekEndKey = useMemo(() => toISODate(weekEndDate), [weekEndDate])

  const setDateFromIso = (iso: string) => {
    const parts = iso.split('-')
    if (parts.length !== 3) return
    const y = Number(parts[0])
    const m = Number(parts[1])
    const d = Number(parts[2])
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return
    const next = new Date(y, m - 1, d)
    if (!Number.isFinite(next.getTime())) return
    next.setHours(0, 0, 0, 0)
    setDate(next)
  }

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

  const selectedFuncionario = useMemo(() => {
    if (!canVerAgendaTodos) return null
    if (!filterFuncionarioId) return null
    return funcionarios.find((f) => f.id === filterFuncionarioId) ?? null
  }, [canVerAgendaTodos, filterFuncionarioId, funcionarios])

  const slots = useMemo(() => {
    const start = canVerAgendaTodos
      ? selectedFuncionario?.horario_inicio ?? usuarioMasterHorario?.horario_inicio ?? null
      : funcionario?.horario_inicio ?? usuarioMasterHorario?.horario_inicio ?? null

    const end = canVerAgendaTodos
      ? selectedFuncionario?.horario_fim ?? usuarioMasterHorario?.horario_fim ?? null
      : funcionario?.horario_fim ?? usuarioMasterHorario?.horario_fim ?? null

    if (!start || !end) return []

    const intervalStart = canVerAgendaTodos
      ? selectedFuncionario?.intervalo_inicio ?? usuarioMasterHorario?.intervalo_inicio ?? null
      : funcionario?.intervalo_inicio ?? usuarioMasterHorario?.intervalo_inicio ?? null

    const intervalEnd = canVerAgendaTodos
      ? selectedFuncionario?.intervalo_fim ?? usuarioMasterHorario?.intervalo_fim ?? null
      : funcionario?.intervalo_fim ?? usuarioMasterHorario?.intervalo_fim ?? null

    return buildSlots(start, end, intervalStart, intervalEnd, slotStepMinutes)
  }, [
    canVerAgendaTodos,
    funcionario?.horario_inicio,
    funcionario?.horario_fim,
    funcionario?.intervalo_inicio,
    funcionario?.intervalo_fim,
    selectedFuncionario?.horario_inicio,
    selectedFuncionario?.horario_fim,
    selectedFuncionario?.intervalo_inicio,
    selectedFuncionario?.intervalo_fim,
    slotStepMinutes,
    usuarioMasterHorario?.horario_inicio,
    usuarioMasterHorario?.horario_fim,
    usuarioMasterHorario?.intervalo_inicio,
    usuarioMasterHorario?.intervalo_fim,
  ])

  const totalDia = useMemo(() => {
    if (!funcionario?.pode_ver_financeiro) return 0
    return agendamentos
      .filter((a) => a.status !== 'cancelado')
      .reduce((sum, a) => sum + (a.servico?.preco ? Number(a.servico.preco) : 0), 0)
  }, [agendamentos, funcionario?.pode_ver_financeiro])

  useEffect(() => {
    const run = async () => {
      if (!funcionarioId || !usuarioMasterId) {
        setError('Este usuário não está vinculado a um usuário master (funcionarios.usuario_master_id vazio).')
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)

      const { data: masterHorarioData } = await supabase
        .from('usuarios')
        .select('horario_inicio,horario_fim,intervalo_inicio,intervalo_fim,dias_trabalho,plano,tipo_negocio')
        .eq('id', usuarioMasterId)
        .maybeSingle()
      if (masterHorarioData) {
        const row = masterHorarioData as unknown as Record<string, unknown>
        setUsuarioMasterHorario({
          horario_inicio: typeof row.horario_inicio === 'string' ? row.horario_inicio : null,
          horario_fim: typeof row.horario_fim === 'string' ? row.horario_fim : null,
          intervalo_inicio: typeof row.intervalo_inicio === 'string' ? row.intervalo_inicio : null,
          intervalo_fim: typeof row.intervalo_fim === 'string' ? row.intervalo_fim : null,
          dias_trabalho: Array.isArray(row.dias_trabalho) ? (row.dias_trabalho as number[]) : null,
        })
        setUsuarioMasterPlano(typeof row.plano === 'string' ? row.plano : null)
        setUsuarioMasterTipoNegocio(typeof row.tipo_negocio === 'string' ? row.tipo_negocio : null)
      } else {
        setUsuarioMasterHorario(null)
        setUsuarioMasterPlano(null)
        setUsuarioMasterTipoNegocio(null)
      }

      const { data: servicosData, error: servicosError } = await supabase
        .from('servicos')
        .select('id,nome,cor')
        .eq('usuario_id', usuarioMasterId)
        .eq('ativo', true)
        .order('ordem', { ascending: true })
        .order('criado_em', { ascending: true })
      if (servicosError) {
        setError(formatQueryError(servicosError))
        setLoading(false)
        return
      }
      setServicos((servicosData ?? []) as unknown as ServicoOption[])

      if (canVerAgendaTodos) {
        const { data: funcionariosData, error: funcionariosError } = await supabase
          .from('funcionarios')
          .select('id,nome_completo,ativo,horario_inicio,horario_fim,intervalo_inicio,intervalo_fim')
          .eq('usuario_master_id', usuarioMasterId)
          .eq('permissao', 'funcionario')
          .order('criado_em', { ascending: true })
        if (funcionariosError) {
          setError(formatQueryError(funcionariosError))
          setLoading(false)
          return
        }
        setFuncionarios((funcionariosData ?? []) as unknown as FuncionarioOption[])
      } else {
        setFuncionarios([])
      }

      setQtdVagasColumnAvailable(true)
      setCapacidadePorHorarioColumnAvailable(true)

      const servicoColsBase = 'id,nome,preco,duracao_minutos,cor'
      const servicoColsWithCap = `${servicoColsBase},capacidade_por_horario`

      const agColsBase = `id,cliente_nome,cliente_telefone,data,hora_inicio,hora_fim,status,funcionario_id,extras,servico:servico_id(${servicoColsBase})`
      const agColsWithQtd = `id,cliente_nome,cliente_telefone,qtd_vagas,data,hora_inicio,hora_fim,status,funcionario_id,extras,servico:servico_id(${servicoColsBase})`
      const agColsWithCap = `id,cliente_nome,cliente_telefone,data,hora_inicio,hora_fim,status,funcionario_id,extras,servico:servico_id(${servicoColsWithCap})`
      const agColsWithQtdAndCap = `id,cliente_nome,cliente_telefone,qtd_vagas,data,hora_inicio,hora_fim,status,funcionario_id,extras,servico:servico_id(${servicoColsWithCap})`

      const agCols = isAcademia ? agColsWithQtdAndCap : agColsBase

      const fetchAgs = async (cols: string) => {
        const q = supabase
          .from('agendamentos')
          .select(cols)
          .eq('usuario_id', usuarioMasterId)
          .order('data', { ascending: true })
          .order('hora_inicio', { ascending: true })

        const scoped = canVerAgendaTodos
          ? filterFuncionarioId
            ? q.eq('funcionario_id', filterFuncionarioId)
            : q
          : q.eq('funcionario_id', funcionarioId)

        return viewMode === 'dia' ? scoped.eq('data', dayKey) : scoped.gte('data', weekStartKey).lte('data', weekEndKey)
      }

      const normalizeAgs = (rows: unknown[]) =>
        (rows ?? []).map((row) => {
          const r = row as unknown as Record<string, unknown>
          const horaInicio = normalizeTimeHHMM(String(r.hora_inicio ?? ''))
          const horaFimRaw = r.hora_fim
          const horaFim = horaFimRaw ? normalizeTimeHHMM(String(horaFimRaw)) : null
          return { ...r, hora_inicio: horaInicio, hora_fim: horaFim } as unknown as Agendamento
        })

      const firstRes = await fetchAgs(agCols)
      if (firstRes.error) {
        const formatted = formatQueryError(firstRes.error)
        if (isAcademia) {
          const missingQtd = isMissingColumnErrorMessage(formatted, 'qtd_vagas')
          const missingCap = isMissingColumnErrorMessage(formatted, 'capacidade_por_horario')

          if (missingQtd) setQtdVagasColumnAvailable(false)
          if (missingCap) setCapacidadePorHorarioColumnAvailable(false)

          const fallbackCols = missingQtd && missingCap ? agColsBase : missingQtd ? agColsWithCap : missingCap ? agColsWithQtd : null
          if (fallbackCols) {
            const secondRes = await fetchAgs(fallbackCols)
            if (secondRes.error) {
              setError(formatQueryError(secondRes.error))
              setLoading(false)
              return
            }
            setAgendamentos(normalizeAgs(secondRes.data ?? []))
          } else {
            setError(formatted)
            setLoading(false)
            return
          }
        } else {
          setError(formatted)
          setLoading(false)
          return
        }
      } else {
        setAgendamentos(normalizeAgs(firstRes.data ?? []))
      }

      let bloqueiosQuery = supabase
        .from('bloqueios')
        .select('id,data,hora_inicio,hora_fim,motivo,funcionario_id')
        .eq('usuario_id', usuarioMasterId)

      if (canVerAgendaTodos) {
        if (filterFuncionarioId) {
          bloqueiosQuery = bloqueiosQuery.or(`funcionario_id.is.null,funcionario_id.eq.${filterFuncionarioId}`)
        }
      } else {
        bloqueiosQuery = bloqueiosQuery.or(`funcionario_id.is.null,funcionario_id.eq.${funcionarioId}`)
      }

      bloqueiosQuery =
        viewMode === 'dia'
          ? bloqueiosQuery.eq('data', dayKey)
          : bloqueiosQuery.gte('data', weekStartKey).lte('data', weekEndKey)

      const { data: bloqueiosData, error: bloqueiosError } = await bloqueiosQuery
      if (bloqueiosError) {
        setError(formatQueryError(bloqueiosError))
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
  }, [canVerAgendaTodos, dayKey, filterFuncionarioId, funcionarioId, isAcademia, usuarioMasterId, viewMode, weekEndKey, weekStartKey])

  useEffect(() => {
    if (!funcionarioId || !usuarioMasterId) return
    if (funcionario?.permissao !== 'funcionario') return

    const channel = supabase.channel(`agendamentos-funcionario:${funcionarioId}`)
    const handleIncoming = async (idRaw: unknown) => {
      const id = typeof idRaw === 'string' ? idRaw.trim() : ''
      if (!id) return
      if (notifiedIdsRef.current.has(id)) return
      notifiedIdsRef.current.add(id)

      const { data: agRow, error: agErr } = await supabase
        .from('agendamentos')
        .select(
          isAcademia
            ? qtdVagasColumnAvailable && capacidadePorHorarioColumnAvailable
              ? 'id,cliente_nome,cliente_telefone,qtd_vagas,data,hora_inicio,hora_fim,status,funcionario_id,extras,servico:servico_id(id,nome,preco,duracao_minutos,cor,capacidade_por_horario)'
              : qtdVagasColumnAvailable
                ? 'id,cliente_nome,cliente_telefone,qtd_vagas,data,hora_inicio,hora_fim,status,funcionario_id,extras,servico:servico_id(id,nome,preco,duracao_minutos,cor)'
                : capacidadePorHorarioColumnAvailable
                  ? 'id,cliente_nome,cliente_telefone,data,hora_inicio,hora_fim,status,funcionario_id,extras,servico:servico_id(id,nome,preco,duracao_minutos,cor,capacidade_por_horario)'
                  : 'id,cliente_nome,cliente_telefone,data,hora_inicio,hora_fim,status,funcionario_id,extras,servico:servico_id(id,nome,preco,duracao_minutos,cor)'
            : 'id,cliente_nome,cliente_telefone,data,hora_inicio,hora_fim,status,funcionario_id,extras,servico:servico_id(id,nome,preco,duracao_minutos,cor)'
        )
        .eq('id', id)
        .eq('usuario_id', usuarioMasterId)
        .maybeSingle()

      if (agErr || !agRow) return
      const r = agRow as unknown as Record<string, unknown>
      if ((r.funcionario_id ?? null) !== funcionarioId) return
      if (String(r.status ?? '').trim().toLowerCase() === 'cancelado') return

      const horaInicio = normalizeTimeHHMM(String(r.hora_inicio ?? ''))
      const horaFimRaw = r.hora_fim
      const horaFim = horaFimRaw ? normalizeTimeHHMM(String(horaFimRaw)) : null

      const ag = { ...r, hora_inicio: horaInicio, hora_fim: horaFim } as unknown as Agendamento

      setAgendamentos((prev) => {
        const exists = prev.some((x) => x.id === ag.id)
        if (exists) return prev
        const next = [...prev, ag]
        next.sort((a, b) => {
          if (a.data !== b.data) return a.data < b.data ? -1 : 1
          return parseTimeToMinutes(a.hora_inicio) - parseTimeToMinutes(b.hora_inicio)
        })
        return next
      })

      const dateLabel = (() => {
        const parts = String(ag.data ?? '').split('-')
        if (parts.length !== 3) return String(ag.data ?? '')
        return `${parts[2]}/${parts[1]}/${parts[0]}`
      })()

      const msg = `Novo agendamento: ${dateLabel} ${ag.hora_inicio} • ${ag.cliente_nome}`
      setSuccess(msg)

      const browserNotifsEnabled = (() => {
        try {
          return window.localStorage.getItem(browserNotifsKey) === '1'
        } catch {
          return false
        }
      })()

      if (
        browserNotifsEnabled &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        document.visibilityState !== 'visible'
      ) {
        try {
          new Notification('Novo agendamento', { body: `${dateLabel} ${ag.hora_inicio} • ${ag.cliente_nome}` })
        } catch (e: unknown) {
          void e
        }
      }
    }

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agendamentos',
          filter: `usuario_id=eq.${usuarioMasterId}`,
        },
        (payload) => {
          void handleIncoming((payload as { new?: { id?: unknown } }).new?.id)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agendamentos',
          filter: `usuario_id=eq.${usuarioMasterId}`,
        },
        (payload) => {
          void handleIncoming((payload as { new?: { id?: unknown } }).new?.id)
        }
      )

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [browserNotifsKey, capacidadePorHorarioColumnAvailable, funcionario?.permissao, funcionarioId, isAcademia, qtdVagasColumnAvailable, usuarioMasterId])

  const enableBrowserNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setError('Seu navegador não suporta notificações.')
      setBrowserNotifsPermission('denied')
      return
    }
    setError(null)
    try {
      const perm = await Notification.requestPermission()
      setBrowserNotifsPermission(perm)
      if (perm === 'granted') {
        try {
          window.localStorage.setItem(browserNotifsKey, '1')
        } catch {
          return
        }
        setSuccess('Notificações do navegador ativadas.')
      }
      if (perm === 'denied') setError('Notificações bloqueadas pelo navegador.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao ativar notificações.')
    }
  }

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

  const getAgVagas = useCallback((a: Agendamento) => {
    if (!qtdVagasColumnAvailable) return 1
    const raw = a.qtd_vagas
    const v = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 1
    return v
  }, [qtdVagasColumnAvailable])

  const getGroupParticipants = (anchor: Agendamento) => {
    const sId = anchor.servico?.id ?? null
    const h = normalizeTimeHHMM(anchor.hora_inicio)
    const fId = anchor.funcionario_id ?? null
    return agendamentos.filter((a) => {
      if (a.data !== anchor.data) return false
      if ((a.funcionario_id ?? null) !== fId) return false
      if ((a.servico?.id ?? null) !== sId) return false
      return normalizeTimeHHMM(a.hora_inicio) === h
    })
  }

  const resolveGroupStatusUi = (items: Agendamento[]) => {
    if (items.length === 0) return resolveStatusUi('pendente')
    const statuses = items.map((x) => String(x.status ?? '').trim().toLowerCase()).filter(Boolean)
    if (statuses.length === 0) return resolveStatusUi('pendente')
    const unique = new Set(statuses)
    if (unique.size === 1) return resolveStatusUi(statuses[0])
    if ([...unique].every((s) => s === 'cancelado')) return resolveStatusUi('cancelado')
    if ([...unique].every((s) => s === 'confirmado')) return resolveStatusUi('confirmado')
    if ([...unique].every((s) => s === 'pendente')) return resolveStatusUi('pendente')
    return { label: 'Misto', tone: 'slate' as const }
  }

  const participants = useMemo(() => {
    if (!participantsOpen || !participantsCtx) return []
    const h = normalizeTimeHHMM(participantsCtx.hora_inicio)
    return agendamentos
      .filter((a) => {
        if (a.data !== participantsCtx.data) return false
        if ((a.funcionario_id ?? null) !== (participantsCtx.funcionario_id ?? null)) return false
        if ((a.servico?.id ?? null) !== (participantsCtx.servico_id ?? null)) return false
        return normalizeTimeHHMM(a.hora_inicio) === h
      })
      .slice()
      .sort((x, y) => x.cliente_nome.localeCompare(y.cliente_nome))
  }, [agendamentos, participantsCtx, participantsOpen])

  const participantsCapacity = useMemo(() => {
    if (!participantsOpen) return 1
    if (!isAcademia) return 1
    if (!capacidadePorHorarioColumnAvailable) return 1
    const raw = participants[0]?.servico?.capacidade_por_horario
    const v = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 1
    return v
  }, [capacidadePorHorarioColumnAvailable, isAcademia, participants, participantsOpen])

  const participantsBooked = useMemo(() => {
    if (!participantsOpen) return 0
    return participants
      .filter((p) => String(p.status ?? '').trim().toLowerCase() !== 'cancelado')
      .reduce((sum, p) => sum + getAgVagas(p), 0)
  }, [getAgVagas, participants, participantsOpen])

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

  const funcionarioNameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const f of funcionarios) map[f.id] = f.nome_completo
    return map
  }, [funcionarios])

  const visibleAgendamentos = useMemo(() => {
    return agendamentos
      .filter(matchesFilters)
      .slice()
      .sort((a, b) => {
        if (a.data !== b.data) return a.data < b.data ? -1 : 1
        return parseTimeToMinutes(a.hora_inicio) - parseTimeToMinutes(b.hora_inicio)
      })
  }, [agendamentos, matchesFilters])

  const listItems = useMemo(() => {
    const items: Array<
      | { kind: 'ag'; data: string; hora_inicio: string; ag: Agendamento }
      | { kind: 'b'; data: string; hora_inicio: string; b: Bloqueio }
    > = []

    for (const ag of visibleAgendamentos) items.push({ kind: 'ag', data: ag.data, hora_inicio: ag.hora_inicio, ag })
    for (const b of bloqueios) items.push({ kind: 'b', data: b.data, hora_inicio: b.hora_inicio, b })

    return items.sort((a, b) => {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1
      return parseTimeToMinutes(a.hora_inicio) - parseTimeToMinutes(b.hora_inicio)
    })
  }, [bloqueios, visibleAgendamentos])

  const repeatPreview = useMemo(() => {
    return buildRepeatKeys(dayKey, effectiveBlockRepeat, effectiveBlockRepeatUntil.trim() ? effectiveBlockRepeatUntil : null)
  }, [dayKey, effectiveBlockRepeat, effectiveBlockRepeatUntil])

  const canSaveBlock = useMemo(() => {
    if (!funcionarioId || !usuarioMasterId) return false
    if (!funcionario?.pode_bloquear_horarios) return false
    if (!blockStart || !blockEnd) return false
    const s = parseTimeToMinutes(blockStart)
    const e = parseTimeToMinutes(blockEnd)
    if (!Number.isFinite(s) || !Number.isFinite(e)) return false
    if (e <= s) return false
    if (repeatPreview.error) return false
    if (repeatPreview.keys.length === 0) return false
    return true
  }, [funcionario?.pode_bloquear_horarios, funcionarioId, usuarioMasterId, blockStart, blockEnd, repeatPreview.error, repeatPreview.keys.length])

  const createBloqueio = async () => {
    if (!funcionarioId || !usuarioMasterId || !canSaveBlock) return
    setSavingBlock(true)
    setError(null)
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
        p_usuario_id: usuarioMasterId,
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
      usuario_id: usuarioMasterId,
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
    <PageTutorial usuarioId={funcionarioId} page="funcionario_agenda">
      {({ tutorialOpen, tutorialStep, setTutorialStep, resetTutorial, closeTutorial }) => (
        <AppShell>
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-500">Agenda</div>
                <div className="text-xl font-semibold text-slate-900">Meus agendamentos</div>
              </div>
              <div className="flex items-center gap-2">
                {funcionario.permissao === 'funcionario' && browserNotifsPermission !== 'granted' ? (
                  <Button variant="secondary" onClick={() => void enableBrowserNotifications()}>
                    Ativar notificações
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={resetTutorial}>
                  Rever tutorial
                </Button>
              </div>
            </div>

            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
            {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div> : null}

            <div
              className={
                tutorialOpen && tutorialSteps[tutorialStep]?.target === 'filtros'
                  ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
                  : ''
              }
            >
              <Card>
                <div className="p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

                      <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (agendaLayoutKey) {
                              try {
                                localStorage.setItem(agendaLayoutKey, 'grade')
                              } catch {
                                void 0
                              }
                            }
                            setAgendaLayoutVersion((v) => v + 1)
                          }}
                          className={[
                            'rounded-md px-3 py-1 text-sm font-medium',
                            agendaLayout === 'grade'
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-700 hover:text-slate-900',
                          ].join(' ')}
                        >
                          Grade
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (agendaLayoutKey) {
                              try {
                                localStorage.setItem(agendaLayoutKey, 'lista')
                              } catch {
                                void 0
                              }
                            }
                            setAgendaLayoutVersion((v) => v + 1)
                          }}
                          className={[
                            'rounded-md px-3 py-1 text-sm font-medium',
                            agendaLayout === 'lista'
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-700 hover:text-slate-900',
                          ].join(' ')}
                        >
                          Lista
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-slate-600">Mostrando: {canVerAgendaTodos ? 'agenda completa' : 'meus agendamentos'}</div>
                  </div>

                  {canVerAgendaTodos ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <div className="text-sm text-slate-600">Filtrar por:</div>
                      <button
                        type="button"
                        onClick={() => setFilterFuncionarioId('')}
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
                            onClick={() => setFilterFuncionarioId(f.id)}
                            className={[
                              'rounded-lg px-3 py-1.5 text-sm font-medium',
                              filterFuncionarioId === f.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                            ].join(' ')}
                          >
                            {f.nome_completo.split(' ')[0]}
                          </button>
                        ))}
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-3">
                      <Input
                        label="Data"
                        type="date"
                        value={dayKey}
                        onChange={(e) => {
                          const v = e.target.value
                          if (!v.trim()) return
                          setDateFromIso(v.trim())
                        }}
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <Input label="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, telefone, serviço…" />
                    </div>
                    <label className="block sm:col-span-2">
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
                    <label className="block sm:col-span-3">
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
            </div>

            {funcionario.pode_bloquear_horarios ? (
              <div
                className={
                  tutorialOpen && tutorialSteps[tutorialStep]?.target === 'bloqueio'
                    ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
                    : ''
                }
              >
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="block">
                  <div className="text-sm font-medium text-slate-700 mb-1">Repetir</div>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                    value={effectiveBlockRepeat}
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
                <div className="sm:col-span-2">
                  {effectiveBlockRepeat !== 'none' ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Input
                        label="Até"
                        type="date"
                        min={dayKey}
                        value={effectiveBlockRepeatUntil}
                        onChange={(e) => setBlockRepeatUntil(e.target.value)}
                      />
                      <div className="flex items-end">
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
              </div>
            ) : null}

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
            ) : agendaLayout === 'lista' ? (
              <div className="p-6 space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-slate-600">
                    {visibleAgendamentos.length} agendamentos • {bloqueios.length} bloqueios
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {hasAnyFilter ? (
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
                    ) : null}
                    <Button variant="secondary" onClick={() => void refresh()}>
                      Recarregar
                    </Button>
                  </div>
                </div>

                {visibleAgendamentos.length === 0 && bloqueios.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                    <div className="text-sm font-semibold text-slate-900">Nenhum item encontrado</div>
                    <div className="text-sm text-slate-600">Não há agendamentos/bloqueios neste período com os filtros atuais.</div>
                    <div className="text-xs text-slate-500 space-y-1">
                      <div>
                        Período: <span className="font-medium text-slate-700">{rangeLabel}</span>
                      </div>
                      {canVerAgendaTodos ? (
                        <div>
                          Profissional:{' '}
                          <span className="font-medium text-slate-700">
                            {filterFuncionarioId
                              ? funcionarios.find((f) => f.id === filterFuncionarioId)?.nome_completo ?? 'Selecionado'
                              : 'Todos'}
                          </span>
                        </div>
                      ) : null}
                      <div>
                        Filtros:{' '}
                        <span className="font-medium text-slate-700">
                          {[
                            searchNorm ? 'busca' : null,
                            statusFilter.trim() ? `status=${statusFilter.trim()}` : null,
                            servicoFilterId.trim() ? 'serviço' : null,
                          ]
                            .filter(Boolean)
                            .join(' • ') || 'nenhum'}
                        </span>
                      </div>
                      {canVerAgendaTodos ? (
                        <div>
                          Profissionais carregados: <span className="font-medium text-slate-700">{funcionarios.filter((f) => f.ativo).length}</span>
                        </div>
                      ) : null}
                    </div>

                    {canVerAgendaTodos && funcionarios.length === 0 ? (
                      <div className="text-xs text-amber-700 rounded-lg border border-amber-200 bg-amber-50 p-2">
                        Se existem agendamentos no período, isso normalmente indica políticas RLS antigas no Supabase (o select retorna vazio sem erro).
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                    {listItems.map((item) => {
                      if (item.kind === 'b') {
                        const labelDate =
                          viewMode === 'semana'
                            ? parseDateKey(item.data).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
                            : null
                        return (
                          <div key={`b:${item.b.id}`} className="p-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              {labelDate ? <div className="text-xs text-slate-500">{labelDate}</div> : null}
                              <div className="text-sm font-semibold text-slate-900">
                                {item.b.hora_inicio}–{item.b.hora_fim} • 🔒 Bloqueado
                              </div>
                              {item.b.motivo ? <div className="text-sm text-slate-600">{item.b.motivo}</div> : null}
                            </div>
                            <Badge tone="yellow">Bloqueado</Badge>
                          </div>
                        )
                      }

                      const ag = item.ag
                      const statusUi = resolveStatusUi(ag.status)
                      const endereco = readExtrasEndereco(ag.extras)
                      const vagas = typeof ag.qtd_vagas === 'number' && Number.isFinite(ag.qtd_vagas) ? Math.max(1, Math.floor(ag.qtd_vagas)) : 1
                      const labelDate =
                        viewMode === 'semana'
                          ? parseDateKey(item.data).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
                          : null

                      const profName = ag.funcionario_id ? funcionarioNameById[ag.funcionario_id] : ''
                      const profLabel = canVerAgendaTodos && !filterFuncionarioId ? (profName ? profName : 'Profissional') : null

                      return (
                        <div key={`ag:${ag.id}`} className="p-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            {labelDate ? <div className="text-xs text-slate-500">{labelDate}</div> : null}
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {(normalizeTimeHHMM(ag.hora_inicio) || '—')} — {ag.cliente_nome}
                            </div>
                            {profLabel ? <div className="text-xs text-slate-500">{profLabel}</div> : null}
                            <div className="text-sm text-slate-600">📱 {ag.cliente_telefone}</div>
                            {endereco ? <div className="text-sm text-slate-600">📍 {endereco}</div> : null}
                            {isAcademia && qtdVagasColumnAvailable && vagas > 1 ? <div className="text-sm text-slate-600">Vagas: {vagas}</div> : null}
                            <div className="text-sm text-slate-700">
                              ✂️ {ag.servico?.nome}{' '}
                              {funcionario.pode_ver_financeiro && ag.servico?.preco ? `- ${formatBRMoney(Number(ag.servico.preco))}` : ''}
                            </div>
                          </div>
                          <Badge tone={statusUi.tone}>{statusUi.label}</Badge>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : slots.length === 0 ? (
              <div className="p-6 space-y-3">
                <div className="text-sm text-slate-600">
                  {canVerAgendaTodos && filterFuncionarioId
                    ? 'Horário não configurado para este profissional.'
                    : 'Horário não configurado. Peça ao gerente para ajustar seu horário.'}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void refresh()}>
                    Recarregar
                  </Button>
                </div>
                {agendamentos.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {agendamentos.map((ag) => {
                      const statusUi = resolveStatusUi(ag.status)
                      const endereco = readExtrasEndereco(ag.extras)
                      const vagas = typeof ag.qtd_vagas === 'number' && Number.isFinite(ag.qtd_vagas) ? Math.max(1, Math.floor(ag.qtd_vagas)) : 1
                      return (
                        <div key={ag.id} className="p-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {(normalizeTimeHHMM(ag.hora_inicio) || '—')} — {ag.cliente_nome}
                            </div>
                            <div className="text-sm text-slate-600">📱 {ag.cliente_telefone}</div>
                            {endereco ? <div className="text-sm text-slate-600">📍 {endereco}</div> : null}
                            {isAcademia && qtdVagasColumnAvailable && vagas > 1 ? <div className="text-sm text-slate-600">Vagas: {vagas}</div> : null}
                            <div className="text-sm text-slate-700">
                              ✂️ {ag.servico?.nome}{' '}
                              {funcionario.pode_ver_financeiro && ag.servico?.preco ? `- ${formatBRMoney(Number(ag.servico.preco))}` : ''}
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
              <>
                {visibleAgendamentos.length === 0 && bloqueios.length === 0 ? (
                  <div className="p-4 space-y-2">
                    <div className="text-sm text-slate-600">Nenhum agendamento encontrado neste período.</div>
                    <div className="flex flex-wrap gap-2">
                      {hasAnyFilter ? (
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
                      ) : null}
                      <Button variant="secondary" onClick={() => void refresh()}>
                        Recarregar
                      </Button>
                    </div>
                  </div>
                ) : null}
                {slots.map((time) => {
                const agStart = findAgendamentoStartInSlot(time)
                const agCover = agStart ?? findAgendamentoAt(time)
                const blockStart = findBloqueioStartInSlot(time)
                const blockCover = blockStart ?? findBloqueioAt(time)

                if (agCover) {
                  const isStart = Boolean(agStart)
                  const visible = isStart && matchesFilters(agCover)
                  const groupParticipants = isAcademia ? getGroupParticipants(agCover) : null
                  const statusUi = groupParticipants ? resolveGroupStatusUi(groupParticipants) : resolveStatusUi(agCover.status)
                  const startLabel = normalizeTimeHHMM(agCover.hora_inicio)
                  const timeLabel = isStart && startLabel ? startLabel : time
                  const endereco = visible ? readExtrasEndereco(agCover.extras) : null
                  const vagas =
                    visible && typeof agCover.qtd_vagas === 'number' && Number.isFinite(agCover.qtd_vagas)
                      ? Math.max(1, Math.floor(agCover.qtd_vagas))
                      : 1
                  const capRaw = isAcademia && capacidadePorHorarioColumnAvailable ? agCover.servico?.capacidade_por_horario : null
                  const capacidade = typeof capRaw === 'number' && Number.isFinite(capRaw) ? Math.max(1, Math.floor(capRaw)) : 1
                  const groupBooked = groupParticipants
                    ? groupParticipants.filter((p) => String(p.status ?? '').trim().toLowerCase() !== 'cancelado').reduce((sum, p) => sum + getAgVagas(p), 0)
                    : 0
                  const groupRemaining = groupParticipants ? Math.max(0, capacidade - groupBooked) : 0
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
                        {groupParticipants && (capacidade > 1 || groupBooked > 1) ? (
                          <div className="text-sm text-slate-600">
                            Agendados: {groupBooked}
                            {capacidade > 1 ? ` • Restantes: ${groupRemaining}` : ''}
                          </div>
                        ) : null}
                        {isAcademia && qtdVagasColumnAvailable && vagas > 1 ? <div className="text-sm text-slate-600">Vagas: {vagas}</div> : null}
                        {visible ? (
                          <div className="text-sm text-slate-700">
                            ✂️ {agCover.servico?.nome}{' '}
                            {funcionario.pode_ver_financeiro && agCover.servico?.preco ? `- ${formatBRMoney(Number(agCover.servico.preco))}` : ''}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge tone={statusUi.tone}>{statusUi.label}</Badge>
                        {agCover.status !== 'cancelado' && (visible || isAcademia) ? (
                          isAcademia && groupParticipants ? (
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setParticipantsCtx({
                                  data: agCover.data,
                                  hora_inicio: agCover.hora_inicio,
                                  servico_id: agCover.servico?.id ?? null,
                                  funcionario_id: agCover.funcionario_id ?? null,
                                })
                                setParticipantsOpen(true)
                              }}
                            >
                              Ver participantes
                            </Button>
                          ) : visible ? (
                            <div className="flex gap-2">
                              {funcionario.pode_criar_agendamentos && String(agCover.status ?? '').trim().toLowerCase() !== 'confirmado' ? (
                                <Button
                                  variant="secondary"
                                  onClick={async () => {
                                    setError(null)
                                    const { error: updErr } = await supabase
                                      .from('agendamentos')
                                      .update({ status: 'confirmado' })
                                      .eq('id', agCover.id)
                                      .eq('funcionario_id', funcionario.id)
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
                                      if (
                                        typeof sendRes.body === 'object' &&
                                        sendRes.body !== null &&
                                        (sendRes.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt'
                                      ) {
                                        setError(
                                          'JWT inválido para chamar a Edge Function. Saia e entre novamente. Se persistir, reimplante a função com verify_jwt=false (--no-verify-jwt).'
                                        )
                                        return
                                      }
                                      if (
                                        typeof sendRes.body === 'object' &&
                                        sendRes.body !== null &&
                                        (sendRes.body as Record<string, unknown>).error === 'jwt_project_mismatch'
                                      ) {
                                        setError('Sessão do Supabase pertence a outro projeto. Saia e entre novamente no sistema.')
                                        return
                                      }
                                      if (
                                        typeof sendRes.body === 'object' &&
                                        sendRes.body !== null &&
                                        (sendRes.body as Record<string, unknown>).error === 'invalid_jwt'
                                      ) {
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
                              {funcionario.pode_cancelar_agendamentos ? (
                                <Button
                                  variant="secondary"
                                  onClick={async () => {
                                    setError(null)
                                    const ok = window.confirm('Marcar como no-show?')
                                    if (!ok) return
                                    const { error: updErr } = await supabase
                                      .from('agendamentos')
                                      .update({ status: 'nao_compareceu' })
                                      .eq('id', agCover.id)
                                      .eq('funcionario_id', funcionario.id)
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
                              {funcionario.pode_cancelar_agendamentos ? (
                                <Button
                                  variant="danger"
                                  onClick={async () => {
                                    setError(null)
                                    setSuccess(null)
                                    const { error: updErr } = await supabase
                                      .from('agendamentos')
                                      .update({ status: 'cancelado', cancelado_em: new Date().toISOString() })
                                      .eq('id', agCover.id)
                                      .eq('funcionario_id', funcionario.id)
                                    if (updErr) {
                                      setError(formatSupabaseError(updErr))
                                      return
                                    }
                                    setAgendamentos((prev) => prev.map((x) => (x.id === agCover.id ? { ...x, status: 'cancelado' } : x)))
                                    setSuccess('Agendamento cancelado.')
                                    const sendRes = await sendCancelamentoWhatsapp(agCover.id)
                                    if (sendRes.ok) {
                                      if (typeof sendRes.body === 'object' && sendRes.body !== null) {
                                        const skipped = (sendRes.body as Record<string, unknown>).skipped
                                        if (skipped === 'not_configured') {
                                          setSuccess('Agendamento cancelado. WhatsApp não configurado.')
                                          return
                                        }
                                        if (skipped === 'disabled') {
                                          setSuccess('Agendamento cancelado. Envio automático desabilitado.')
                                          return
                                        }
                                      }
                                      setSuccess('Agendamento cancelado e aviso enviado.')
                                      return
                                    }
                                    if (
                                      typeof sendRes.body === 'object' &&
                                      sendRes.body !== null &&
                                      (sendRes.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt'
                                    ) {
                                      setError(
                                        'JWT inválido para chamar a Edge Function. Saia e entre novamente. Se persistir, reimplante a função com verify_jwt=false (--no-verify-jwt).'
                                      )
                                      return
                                    }
                                    if (
                                      typeof sendRes.body === 'object' &&
                                      sendRes.body !== null &&
                                      (sendRes.body as Record<string, unknown>).error === 'jwt_project_mismatch'
                                    ) {
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
                                    setError(`Falha ao enviar cancelamento (HTTP ${sendRes.status}): ${details}`)
                                  }}
                                >
                                  ✗ Cancelar
                                </Button>
                              ) : null}
                            </div>
                          ) : null
                        ) : null}
                      </div>
                    </div>
                  )
                }
                if (blockCover) {
                  const isStart = Boolean(blockStart)
                  const canDelete = funcionario.pode_bloquear_horarios && blockCover.funcionario_id === funcionarioId && isStart
                  const timeLabel = isStart ? blockCover.hora_inicio : time
                  return (
                    <div key={time} className="p-4 flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">
                        {timeLabel} - 🔒 BLOQUEADO {isStart && blockCover.motivo ? `(${blockCover.motivo})` : ''}
                      </div>
                      <div className="flex items-center gap-2">
                        {canDelete ? (
                          <Button variant="danger" onClick={() => removeBloqueio(blockCover)}>
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
              })}
              </>
            ) : (
              <div className="p-4">
                {visibleAgendamentos.length === 0 && bloqueios.length === 0 ? (
                  <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-slate-700">Nenhum agendamento encontrado nesta semana.</div>
                    <div className="flex flex-wrap gap-2">
                      {hasAnyFilter ? (
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
                      ) : null}
                      <Button variant="secondary" onClick={() => void refresh()}>
                        Recarregar
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {weekDays.map((d) => {
                      const ags = agendamentosByDay[d.key] ?? []
                      const bls = bloqueiosByDay[d.key] ?? []
                      const visibleAgs = ags.filter(matchesFilters)
                      const visibleAgCount = visibleAgs.length
                      const label = d.date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
                      return (
                        <div key={d.key} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm flex flex-col">
                          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-slate-900">{label}</div>
                            <div className="text-xs text-slate-600">{visibleAgCount} ag.</div>
                          </div>
                          <div className="p-3 flex flex-col gap-2">
                            {visibleAgs.length === 0 && bls.length === 0 ? (
                              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3">
                                <div className="text-sm text-slate-600">Sem itens</div>
                                <div>
                                  {hasAnyFilter ? (
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
                                  ) : (
                                    <Button variant="secondary" onClick={() => void refresh()}>
                                      Recarregar
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              [
                                ...visibleAgs
                                  .slice()
                                  .sort((x, y) => parseTimeToMinutes(x.hora_inicio) - parseTimeToMinutes(y.hora_inicio))
                                  .map((a) => ({ kind: 'ag' as const, time: a.hora_inicio, ag: a })),
                                ...bls.map((b) => ({ kind: 'b' as const, time: b.hora_inicio, b })),
                              ]
                                .sort((x, y) => parseTimeToMinutes(x.time) - parseTimeToMinutes(y.time))
                                .map((item) => {
                                  if (item.kind === 'b') {
                                    return (
                                      <div
                                        key={`b:${item.b.id}`}
                                        className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-start justify-between gap-3"
                                      >
                                        <div className="min-w-0">
                                          <div className="text-sm font-semibold text-slate-900 whitespace-normal break-words">
                                            {item.b.hora_inicio}–{item.b.hora_fim}
                                          </div>
                                          <div className="text-sm text-slate-600 whitespace-normal break-words">
                                            🔒 Bloqueado {item.b.motivo ? `• ${item.b.motivo}` : ''}
                                          </div>
                                        </div>
                                        <Badge tone="yellow">Bloqueado</Badge>
                                      </div>
                                    )
                                  }
                                  const a = item.ag
                                  const statusUi = resolveStatusUi(a.status)
                                  const timeLabel = normalizeTimeHHMM(a.hora_inicio) || a.hora_inicio
                                  return (
                                    <div
                                      key={`ag:${a.id}`}
                                      className="relative rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50 transition-colors"
                                    >
                                      {a.servico?.cor ? (
                                        <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-lg" style={{ backgroundColor: a.servico.cor }} />
                                      ) : null}
                                      <div className="min-w-0 pl-2">
                                        <div className="flex items-center justify-center">
                                          <Badge tone={statusUi.tone}>{statusUi.label}</Badge>
                                        </div>
                                        <div className="mt-2 text-sm font-semibold text-slate-900 truncate">{timeLabel}</div>
                                        <div className="text-sm text-slate-900 truncate">{a.cliente_nome}</div>
                                        <div className="text-sm text-slate-700 truncate">{a.servico?.nome ?? 'Serviço'}</div>
                                      </div>
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
            )}
                </div>
              </Card>
            </div>

            {participantsOpen && participantsCtx ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                <div className="w-full max-w-2xl">
                  <Card>
                    <div className="p-6 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">Participantes</div>
                          <div className="text-sm text-slate-600">
                            {normalizeTimeHHMM(participantsCtx.hora_inicio)} • {participants[0]?.servico?.nome ?? 'Serviço'}
                          </div>
                          {participantsCapacity > 1 ? (
                            <div className="text-xs text-slate-600">
                              Agendados: {participantsBooked} • Restantes: {Math.max(0, participantsCapacity - participantsBooked)}
                            </div>
                          ) : null}
                        </div>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setParticipantsOpen(false)
                            setParticipantsCtx(null)
                          }}
                        >
                          Fechar
                        </Button>
                      </div>

                      {participants.length === 0 ? (
                        <div className="text-sm text-slate-600">Nenhum participante encontrado.</div>
                      ) : (
                        <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                          {participants.map((p) => {
                            const statusUi = resolveStatusUi(p.status)
                            const vagas = getAgVagas(p)
                            return (
                              <div key={p.id} className="p-3 flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-900 truncate">{p.cliente_nome}</div>
                                  <div className="text-sm text-slate-600">📱 {p.cliente_telefone}</div>
                                  {qtdVagasColumnAvailable && vagas > 1 ? <div className="text-sm text-slate-600">Vagas: {vagas}</div> : null}
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <Badge tone={statusUi.tone}>{statusUi.label}</Badge>
                                  {String(p.status ?? '').trim().toLowerCase() !== 'cancelado' ? (
                                    <div className="flex gap-2">
                                      {funcionario.pode_criar_agendamentos && String(p.status ?? '').trim().toLowerCase() !== 'confirmado' ? (
                                        <Button
                                          variant="secondary"
                                          onClick={async () => {
                                            setError(null)
                                            const { error: updErr } = await supabase
                                              .from('agendamentos')
                                              .update({ status: 'confirmado' })
                                              .eq('id', p.id)
                                              .eq('funcionario_id', funcionario.id)
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
                                            setAgendamentos((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: 'confirmado' } : x)))
                                            const sendRes = await sendConfirmacaoWhatsapp(p.id)
                                            if (!sendRes.ok) {
                                              if (
                                                typeof sendRes.body === 'object' &&
                                                sendRes.body !== null &&
                                                (sendRes.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt'
                                              ) {
                                                setError(
                                                  'JWT inválido para chamar a Edge Function. Saia e entre novamente. Se persistir, reimplante a função com verify_jwt=false (--no-verify-jwt).'
                                                )
                                                return
                                              }
                                              if (
                                                typeof sendRes.body === 'object' &&
                                                sendRes.body !== null &&
                                                (sendRes.body as Record<string, unknown>).error === 'jwt_project_mismatch'
                                              ) {
                                                setError('Sessão do Supabase pertence a outro projeto. Saia e entre novamente no sistema.')
                                                return
                                              }
                                              if (
                                                typeof sendRes.body === 'object' &&
                                                sendRes.body !== null &&
                                                (sendRes.body as Record<string, unknown>).error === 'invalid_jwt'
                                              ) {
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
                                      {funcionario.pode_cancelar_agendamentos ? (
                                        <Button
                                          variant="secondary"
                                          onClick={async () => {
                                            setError(null)
                                            const ok = window.confirm('Marcar como no-show?')
                                            if (!ok) return
                                            const { error: updErr } = await supabase
                                              .from('agendamentos')
                                              .update({ status: 'nao_compareceu' })
                                              .eq('id', p.id)
                                              .eq('funcionario_id', funcionario.id)
                                            if (updErr) {
                                              setError(formatSupabaseError(updErr))
                                              return
                                            }
                                            setAgendamentos((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: 'nao_compareceu' } : x)))
                                          }}
                                        >
                                          No-show
                                        </Button>
                                      ) : null}
                                      {funcionario.pode_cancelar_agendamentos ? (
                                        <Button
                                          variant="danger"
                                          onClick={async () => {
                                            setError(null)
                                            setSuccess(null)
                                            const { error: updErr } = await supabase
                                              .from('agendamentos')
                                              .update({ status: 'cancelado', cancelado_em: new Date().toISOString() })
                                              .eq('id', p.id)
                                              .eq('funcionario_id', funcionario.id)
                                            if (updErr) {
                                              setError(formatSupabaseError(updErr))
                                              return
                                            }
                                            setAgendamentos((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: 'cancelado' } : x)))
                                            setSuccess('Agendamento cancelado.')
                                            const sendRes = await sendCancelamentoWhatsapp(p.id)
                                            if (sendRes.ok) {
                                              if (typeof sendRes.body === 'object' && sendRes.body !== null) {
                                                const skipped = (sendRes.body as Record<string, unknown>).skipped
                                                if (skipped === 'not_configured') {
                                                  setSuccess('Agendamento cancelado. WhatsApp não configurado.')
                                                  return
                                                }
                                                if (skipped === 'disabled') {
                                                  setSuccess('Agendamento cancelado. Envio automático desabilitado.')
                                                  return
                                                }
                                              }
                                              setSuccess('Agendamento cancelado e aviso enviado.')
                                              return
                                            }
                                            if (
                                              typeof sendRes.body === 'object' &&
                                              sendRes.body !== null &&
                                              (sendRes.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt'
                                            ) {
                                              setError(
                                                'JWT inválido para chamar a Edge Function. Saia e entre novamente. Se persistir, reimplante a função com verify_jwt=false (--no-verify-jwt).'
                                              )
                                              return
                                            }
                                            if (
                                              typeof sendRes.body === 'object' &&
                                              sendRes.body !== null &&
                                              (sendRes.body as Record<string, unknown>).error === 'jwt_project_mismatch'
                                            ) {
                                              setError('Sessão do Supabase pertence a outro projeto. Saia e entre novamente no sistema.')
                                              return
                                            }
                                            if (
                                              typeof sendRes.body === 'object' &&
                                              sendRes.body !== null &&
                                              (sendRes.body as Record<string, unknown>).error === 'invalid_jwt'
                                            ) {
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
                                            setError(`Falha ao enviar cancelamento (HTTP ${sendRes.status}): ${details}`)
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
                          })}
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            ) : null}

            {funcionario.permissao !== 'atendente' ? (
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
            ) : null}

            <TutorialOverlay
              open={tutorialOpen}
              steps={tutorialSteps}
              step={tutorialStep}
              onStepChange={setTutorialStep}
              onClose={closeTutorial}
              titleFallback="Agenda"
            />
          </div>
        </AppShell>
      )}
    </PageTutorial>
  )
}
