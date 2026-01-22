import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { formatBRMoney } from '../../lib/dates'
import { supabase, supabaseEnv } from '../../lib/supabase'

type UsuarioPublico = {
  id: string
  nome_negocio: string
  logo_url: string | null
  tipo_negocio?: string | null
  endereco: string | null
  telefone: string | null
  instagram_url?: string | null
  horario_inicio: string | null
  horario_fim: string | null
  dias_trabalho: number[] | null
  intervalo_inicio: string | null
  intervalo_fim: string | null
  ativo: boolean
  tipo_conta: 'master' | 'individual'
  plano: 'free' | 'basic' | 'pro' | 'team' | 'enterprise'
  public_primary_color: string | null
  public_background_color: string | null
  public_use_background_image: boolean | null
  public_background_image_url: string | null
  unidade_id?: string | null
  unidade_nome?: string | null
  unidade_slug?: string | null
}

function coerceHexColor(value: string | null | undefined, fallback: string) {
  const v = (value ?? '').trim()
  if (!v) return fallback
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return fallback
  return v
}

type Servico = {
  id: string
  nome: string
  descricao?: string | null
  duracao_minutos: number
  buffer_antes_min?: number
  buffer_depois_min?: number
  antecedencia_minutos?: number
  janela_max_dias?: number
  dia_inteiro?: boolean
  capacidade_por_horario?: number
  preco: number
  taxa_agendamento: number
  cor: string | null
  foto_url: string | null
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function addMonths(d: Date, months: number) {
  return new Date(d.getFullYear(), d.getMonth() + months, 1)
}

function addYears(d: Date, years: number) {
  return new Date(d.getFullYear() + years, d.getMonth(), d.getDate())
}

function monthRangeIsos(monthIso: string, minDate: Date, maxDate: Date) {
  const base = monthIso ? new Date(`${monthIso}T00:00:00`) : null
  if (!base || !Number.isFinite(base.getTime())) return [] as string[]

  const mStart = startOfMonth(base)
  const mEnd = endOfMonth(base)
  const start = mStart < minDate ? minDate : mStart
  const end = mEnd > maxDate ? maxDate : mEnd

  const out: string[] = []
  const cur = new Date(start)
  cur.setHours(0, 0, 0, 0)
  const last = new Date(end)
  last.setHours(0, 0, 0, 0)

  while (cur <= last) {
    out.push(toIsoDateLocal(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

function monthLabelPTBR(d: Date) {
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  return `${months[d.getMonth()] ?? ''} ${d.getFullYear()}`.trim()
}

function DiaInteiroCalendar(args: {
  primaryColor: string
  selectedIso: string
  setSelectedIso: (iso: string) => void
  minIso: string
  maxIso: string
  monthIso: string
  setMonthIso: (iso: string) => void
  isDayDisabled: (d: Date) => boolean
  diaInteiroDisponibilidade: Record<string, string>
  calendarioLoading: boolean
}) {
  const minIso = args.minIso ?? ''
  const maxIso = args.maxIso ?? ''

  const minDate = useMemo(() => {
    if (!minIso) return null
    const d = new Date(`${minIso}T00:00:00`)
    return Number.isFinite(d.getTime()) ? d : null
  }, [minIso])

  const maxDate = useMemo(() => {
    if (!maxIso) return null
    const d = new Date(`${maxIso}T00:00:00`)
    return Number.isFinite(d.getTime()) ? d : null
  }, [maxIso])

  const fallbackMonthIso = useMemo(() => {
    const fromSelected = args.selectedIso ? new Date(`${args.selectedIso}T00:00:00`) : null
    const base = fromSelected && Number.isFinite(fromSelected.getTime()) ? fromSelected : minDate
    if (base) return toIsoDateLocal(startOfMonth(base))
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return toIsoDateLocal(startOfMonth(today))
  }, [args.selectedIso, minDate])

  const monthIso = args.monthIso || fallbackMonthIso

  const calendarMonth = useMemo(() => {
    const base = monthIso ? new Date(`${monthIso}T00:00:00`) : null
    if (!base || !Number.isFinite(base.getTime())) return startOfMonth(new Date())
    return startOfMonth(base)
  }, [monthIso])

  const calendarGridDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth)
    const monthEnd = endOfMonth(calendarMonth)
    const startWeekday = monthStart.getDay()
    const gridStart = addDays(monthStart, -startWeekday)
    const gridDays: Date[] = []
    for (let i = 0; i < 42; i += 1) gridDays.push(addDays(gridStart, i))
    return { monthStart, monthEnd, gridDays }
  }, [calendarMonth])

  const goPrevMonth = () => {
    const prev = addMonths(calendarMonth, -1)
    if (minDate && Number.isFinite(minDate.getTime()) && prev < startOfMonth(minDate)) return
    args.setMonthIso(toIsoDateLocal(prev))
  }

  const goNextMonth = () => {
    const next = addMonths(calendarMonth, 1)
    if (maxDate && Number.isFinite(maxDate.getTime()) && startOfMonth(next) > startOfMonth(maxDate)) return
    args.setMonthIso(toIsoDateLocal(next))
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goPrevMonth}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          ◀
        </button>
        <div className="text-sm font-semibold text-slate-900">{monthLabelPTBR(calendarMonth)}</div>
        <button
          type="button"
          onClick={goNextMonth}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          ▶
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((w) => (
          <div key={w} className="px-1 py-1 text-center text-[11px] font-semibold text-slate-500">
            {w}
          </div>
        ))}

        {calendarGridDays.gridDays.map((dObj) => {
          const inMonth = dObj.getMonth() === calendarGridDays.monthStart.getMonth()
          if (!inMonth) {
            return <div key={toIsoDateLocal(dObj)} className="h-10 sm:h-12 md:h-14" />
          }
          const iso = toIsoDateLocal(dObj)
          const disabledByRule = args.isDayDisabled(dObj)
          const slot = args.diaInteiroDisponibilidade[iso] ?? ''
          const disabled = disabledByRule || !slot
          const selected = args.selectedIso === iso && !disabled
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => {
                args.setSelectedIso(iso)
              }}
              className={[
                'h-10 sm:h-12 md:h-14 rounded-xl border text-sm font-semibold',
                disabled ? 'opacity-40 cursor-not-allowed bg-white border-slate-200 text-slate-500' : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50',
              ].join(' ')}
              style={selected ? { backgroundColor: args.primaryColor, borderColor: args.primaryColor, color: '#fff' } : undefined}
            >
              {dObj.getDate()}
            </button>
          )
        })}
      </div>

      <div className="text-xs text-slate-600">{args.calendarioLoading ? 'Carregando disponibilidade…' : 'Selecione um dia disponível.'}</div>
    </div>
  )
}

function DatePopupCalendar(args: {
  open: boolean
  primaryColor: string
  selectedIso: string
  monthIso: string
  setMonthIso: (iso: string) => void
  onClose: () => void
  onSelect: (iso: string) => void
  minIso: string
  maxIso: string
  isDayDisabled: (d: Date) => boolean
  dayHasSlots: Record<string, boolean>
  availabilityLoading: boolean
}) {
  const minIso = args.minIso ?? ''
  const maxIso = args.maxIso ?? ''

  const minDate = useMemo(() => {
    if (!minIso) return null
    const d = new Date(`${minIso}T00:00:00`)
    return Number.isFinite(d.getTime()) ? d : null
  }, [minIso])

  const maxDate = useMemo(() => {
    if (!maxIso) return null
    const d = new Date(`${maxIso}T00:00:00`)
    return Number.isFinite(d.getTime()) ? d : null
  }, [maxIso])

  const fallbackMonthIso = useMemo(() => {
    const fromSelected = args.selectedIso ? new Date(`${args.selectedIso}T00:00:00`) : null
    const base = fromSelected && Number.isFinite(fromSelected.getTime()) ? fromSelected : minDate
    if (base) return toIsoDateLocal(startOfMonth(base))
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return toIsoDateLocal(startOfMonth(today))
  }, [args.selectedIso, minDate])

  const monthIso = args.monthIso || fallbackMonthIso

  const calendarMonth = useMemo(() => {
    const base = monthIso ? new Date(`${monthIso}T00:00:00`) : null
    if (!base || !Number.isFinite(base.getTime())) return startOfMonth(new Date())
    return startOfMonth(base)
  }, [monthIso])

  const calendarGridDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth)
    const monthEnd = endOfMonth(calendarMonth)
    const startWeekday = monthStart.getDay()
    const gridStart = addDays(monthStart, -startWeekday)
    const gridDays: Date[] = []
    for (let i = 0; i < 42; i += 1) gridDays.push(addDays(gridStart, i))
    return { monthStart, monthEnd, gridDays }
  }, [calendarMonth])

  const canPrev = useMemo(() => {
    if (!minDate) return true
    const prevMonth = addMonths(calendarMonth, -1)
    return prevMonth >= startOfMonth(minDate)
  }, [calendarMonth, minDate])

  const canNext = useMemo(() => {
    if (!maxDate) return true
    const nextMonth = addMonths(calendarMonth, 1)
    return nextMonth <= startOfMonth(maxDate)
  }, [calendarMonth, maxDate])

  useEffect(() => {
    if (!args.open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') args.onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [args])

  if (!args.open) return null

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={args.onClose} />
      <div className="relative h-full w-full flex items-end sm:items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!canPrev) return
                  args.setMonthIso(toIsoDateLocal(addMonths(calendarMonth, -1)))
                }}
                disabled={!canPrev}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-40"
              >
                ‹
              </button>
              <div className="text-sm font-semibold text-slate-900">{monthLabelPTBR(calendarMonth)}</div>
              <button
                type="button"
                onClick={() => {
                  if (!canNext) return
                  args.setMonthIso(toIsoDateLocal(addMonths(calendarMonth, 1)))
                }}
                disabled={!canNext}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-40"
              >
                ›
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((w) => (
                <div key={w} className="text-center text-[11px] font-semibold text-slate-500 py-1">
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarGridDays.gridDays.map((dObj) => {
                const iso = toIsoDateLocal(dObj)
                const inMonth = dObj >= calendarGridDays.monthStart && dObj <= calendarGridDays.monthEnd
                const disabled = !inMonth || args.isDayDisabled(dObj) || args.dayHasSlots[iso] === false
                const selected = args.selectedIso === iso && !disabled
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return
                      args.onSelect(iso)
                      args.onClose()
                    }}
                    className={[
                      'h-10 rounded-xl border text-sm font-semibold',
                      disabled
                        ? 'opacity-40 cursor-not-allowed bg-white border-slate-200 text-slate-400'
                        : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50',
                      !inMonth && !selected ? 'opacity-60' : '',
                    ].join(' ')}
                    style={selected ? { backgroundColor: args.primaryColor, borderColor: args.primaryColor, color: '#fff' } : undefined}
                  >
                    {dObj.getDate()}
                  </button>
                )
              })}
            </div>

            <div className="flex justify-end">
              <Button variant="secondary" onClick={args.onClose}>
                Fechar
              </Button>
            </div>

            <div className="text-xs text-slate-600">{args.availabilityLoading ? 'Carregando disponibilidade…' : 'Selecione um dia disponível.'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

async function callPublicPaymentsFn(body: Record<string, unknown>) {
  if (!supabaseEnv.ok) {
    return { ok: false as const, status: 0, body: { error: 'missing_supabase_env' } as unknown }
  }

  const supabaseUrl = String(supabaseEnv.values.VITE_SUPABASE_URL ?? '')
    .trim()
    .replace(/^['"`\s]+|['"`\s]+$/g, '')
    .replace(/\/+$/g, '')
  const supabaseAnonKey = String(supabaseEnv.values.VITE_SUPABASE_ANON_KEY ?? '')
    .trim()
    .replace(/^['"`\s]+|['"`\s]+$/g, '')

  const fnUrl = `${supabaseUrl}/functions/v1/payments`

  let res: Response
  try {
    res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify(body),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Falha de rede'
    return { ok: false as const, status: 0, body: { error: 'network_error', message: msg } as unknown }
  }

  const text = await res.text().catch(() => '')
  let parsed: unknown = null
  try {
    parsed = text ? (JSON.parse(text) as unknown) : null
  } catch {
    parsed = text
  }

  return { ok: res.ok as boolean, status: res.status, body: parsed as unknown }
}

type Funcionario = {
  id: string
  nome_completo: string
  horario_inicio: string | null
  horario_fim: string | null
  dias_trabalho: number[] | null
  intervalo_inicio: string | null
  intervalo_fim: string | null
}

function normalizePhone(value: string) {
  return value.replace(/[^0-9+]/g, '').trim()
}

function normalizeEmail(value: string) {
  const v = String(value ?? '').trim().toLowerCase()
  if (!v) return ''
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  return ok ? v : ''
}

function resolvePublicLabels(tipoNegocio: string | null | undefined) {
  const key = (tipoNegocio ?? '').trim().toLowerCase()
  if (key === 'lava_jatos') return { servico: 'Lavagem', servicos: 'Lavagens', profissional: 'Lavador', profissionais: 'Lavadores' }
  if (key === 'barbearia') return { servico: 'Serviço', servicos: 'Serviços', profissional: 'Barbeiro', profissionais: 'Barbeiros' }
  if (key === 'salao') return { servico: 'Serviço', servicos: 'Serviços', profissional: 'Profissional', profissionais: 'Profissionais' }
  if (key === 'estetica') return { servico: 'Procedimento', servicos: 'Procedimentos', profissional: 'Especialista', profissionais: 'Especialistas' }
  if (key === 'odontologia') return { servico: 'Procedimento', servicos: 'Procedimentos', profissional: 'Dentista', profissionais: 'Dentistas' }
  if (key === 'advocacia') return { servico: 'Consulta', servicos: 'Consultas', profissional: 'Advogado', profissionais: 'Advogados' }
  if (key === 'manicure') return { servico: 'Serviço', servicos: 'Serviços', profissional: 'Manicure', profissionais: 'Manicures' }
  if (key === 'pilates') return { servico: 'Aula', servicos: 'Aulas', profissional: 'Instrutor', profissionais: 'Instrutores' }
  if (key === 'academia') return { servico: 'Aula', servicos: 'Aulas', profissional: 'Instrutor', profissionais: 'Instrutores' }
  if (key === 'faxina') return { servico: 'Diária', servicos: 'Diárias', profissional: 'Profissional', profissionais: 'Profissionais' }
  return { servico: 'Serviço', servicos: 'Serviços', profissional: 'Profissional', profissionais: 'Profissionais' }
}

function addDays(d: Date, days: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

function toWhatsappNumber(value: string) {
  const digits = String(value ?? '').replace(/[^0-9]/g, '')
  if (!digits) return null
  if (digits.startsWith('55')) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

function toGoogleMapsLink(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

function parseHHMMToMinutes(value: string | null | undefined) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const parts = raw.split(':')
  const hh = Number(parts[0])
  const mm = Number(parts[1] ?? 0)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function normalizeInstagramUrl(value: string) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  if (raw.startsWith('@')) return `https://instagram.com/${raw.slice(1)}`
  if (raw.includes('instagram.com/')) return `https://${raw.replace(/^https?:\/\//, '')}`
  return `https://instagram.com/${raw}`
}

function rpcErrText(err: unknown) {
  const e = err && typeof err === 'object' ? (err as Record<string, unknown>) : null
  const msg = typeof e?.message === 'string' ? e.message.trim() : 'Erro'
  const code = typeof e?.code === 'string' ? e.code.trim() : ''
  const details = typeof e?.details === 'string' ? e.details.trim() : ''
  const hint = typeof e?.hint === 'string' ? e.hint.trim() : ''
  const parts = [msg]
  if (code && !msg.includes(code)) parts.push(code)
  if (details && details !== msg) parts.push(details)
  if (hint) parts.push(hint)
  return parts.filter(Boolean).join(' — ')
}

function shouldRetryWithoutUnidade(err: unknown) {
  const lower = rpcErrText(err).toLowerCase()
  const mentionsUnidadeArg = lower.includes('p_unidade_id')
  const looksLikeSignatureMismatch = isSignatureMismatchText(lower)
  return mentionsUnidadeArg && looksLikeSignatureMismatch
}

function shouldRetryWithoutFuncionario(err: unknown) {
  const lower = rpcErrText(err).toLowerCase()
  const mentionsFuncionarioArg = lower.includes('p_funcionario_id')
  const looksLikeSignatureMismatch = isSignatureMismatchText(lower)
  return mentionsFuncionarioArg && looksLikeSignatureMismatch
}

function shouldRetryWithoutExtras(err: unknown) {
  const lower = rpcErrText(err).toLowerCase()
  const mentionsExtrasArg = lower.includes('p_extras')
  const looksLikeSignatureMismatch = isSignatureMismatchText(lower)
  return mentionsExtrasArg && looksLikeSignatureMismatch
}

function isMissingRpcFnText(lower: string, fnName: string) {
  const needle = fnName.toLowerCase()
  if (!lower.includes(needle)) return false
  return lower.includes('could not find the function') || lower.includes('does not exist') || (lower.includes('schema cache') && lower.includes('could not find'))
}

function isSignatureMismatchText(lower: string) {
  return (
    lower.includes('pgrst202') ||
    lower.includes('pgrst203') ||
    lower.includes('could not find the function') ||
    lower.includes('does not exist') ||
    lower.includes('could not choose the best candidate function between') ||
    (lower.includes('schema cache') && lower.includes('could not find'))
  )
}

async function callPublicRpc<T>(fnName: string, args: Record<string, unknown>) {
  if (!supabaseEnv.ok) {
    return { ok: false as const, errorText: `Supabase não configurado. Faltando: ${supabaseEnv.missing.join(', ')}` }
  }

  const base = String(supabaseEnv.values.VITE_SUPABASE_URL ?? '')
    .trim()
    .replace(/^['"`\s]+|['"`\s]+$/g, '')
    .replace(/\/+$/g, '')
  const key = String(supabaseEnv.values.VITE_SUPABASE_ANON_KEY ?? '')
    .trim()
    .replace(/^['"`\s]+|['"`\s]+$/g, '')
  const url = `${base}/rest/v1/rpc/${fnName}`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(args),
    })
  } catch (e: unknown) {
    return { ok: false as const, errorText: e instanceof Error ? e.message : 'Falha de rede' }
  }

  const raw = await res.text().catch(() => '')
  const parsed: unknown = raw
    ? (() => {
        try {
          return JSON.parse(raw) as unknown
        } catch {
          return raw
        }
      })()
    : null

  if (!res.ok) {
    const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    const msg =
      (typeof obj?.message === 'string' && obj.message.trim()) ||
      (typeof obj?.error === 'string' && obj.error.trim()) ||
      (typeof obj?.hint === 'string' && obj.hint.trim()) ||
      `HTTP ${res.status}`
    const details = typeof obj?.details === 'string' ? obj.details.trim() : ''
    const code = typeof obj?.code === 'string' ? obj.code.trim() : ''
    const parts = [msg]
    if (code && !msg.includes(code)) parts.push(code)
    if (details && details !== msg) parts.push(details)
    return { ok: false as const, errorText: parts.filter(Boolean).join(' — ') }
  }

  return { ok: true as const, data: parsed as T }
}

async function callPublicRpcWithSignatureFallback<T>(
  fnName: string,
  args: Record<string, unknown>,
  unidadeId: string | null
): Promise<{ ok: true; data: T } | { ok: false; errorText: string }> {
  const first = await callPublicRpc<T>(fnName, args)
  if (first.ok) return first

  const firstLower = first.errorText.toLowerCase()
  if (!isSignatureMismatchText(firstLower)) return first

  const hasUnidadeKey = Object.prototype.hasOwnProperty.call(args, 'p_unidade_id')
  const hasFuncionarioKey = Object.prototype.hasOwnProperty.call(args, 'p_funcionario_id')
  const hasExtrasKey = Object.prototype.hasOwnProperty.call(args, 'p_extras')
  const hasQtdVagasKey = Object.prototype.hasOwnProperty.call(args, 'p_qtd_vagas')

  const stableKey = (o: Record<string, unknown>) => {
    const keys = Object.keys(o).sort()
    const ordered: Record<string, unknown> = {}
    for (const k of keys) ordered[k] = o[k]
    return JSON.stringify(ordered)
  }

  const withoutKey = (o: Record<string, unknown>, key: string) => {
    const next: Record<string, unknown> = { ...o }
    delete (next as Record<string, unknown>)[key]
    return next
  }

  const seen = new Set<string>([stableKey(args)])
  const variants: Record<string, unknown>[] = []

  if (hasUnidadeKey) {
    if (shouldRetryWithoutUnidade({ message: first.errorText })) variants.push(withoutKey(args, 'p_unidade_id'))
  } else {
    variants.push({ ...args, p_unidade_id: unidadeId ?? null })
  }

  if (hasFuncionarioKey) {
    if (shouldRetryWithoutFuncionario({ message: first.errorText })) variants.push(withoutKey(args, 'p_funcionario_id'))
  } else {
    variants.push({ ...args, p_funcionario_id: null })
  }

  if (hasExtrasKey) {
    if (shouldRetryWithoutExtras({ message: first.errorText })) variants.push(withoutKey(args, 'p_extras'))
  }

  if (hasQtdVagasKey) {
    variants.push(withoutKey(args, 'p_qtd_vagas'))
  }

  if (hasUnidadeKey && hasFuncionarioKey) {
    if (shouldRetryWithoutUnidade({ message: first.errorText }) || shouldRetryWithoutFuncionario({ message: first.errorText })) {
      variants.push(withoutKey(withoutKey(args, 'p_unidade_id'), 'p_funcionario_id'))
    }
  }

  for (const v of variants) {
    const key = stableKey(v)
    if (seen.has(key)) continue
    seen.add(key)
    const res = await callPublicRpc<T>(fnName, v)
    if (res.ok) return res
  }

  return first
}

function toIsoDateLocal(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const yyyy = x.getFullYear()
  const mm = String(x.getMonth() + 1).padStart(2, '0')
  const dd = String(x.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatIsoDateBR(iso: string) {
  const [yyyy, mm, dd] = iso.split('-')
  if (!yyyy || !mm || !dd) return iso
  return `${dd}/${mm}/${yyyy}`
}

export function PublicBookingPage() {
  const { slug, unidadeSlug } = useParams()

  const enableTaxaAgendamento = (import.meta.env.VITE_ENABLE_TAXA_AGENDAMENTO as string | undefined) === '1'

  const debugEnabled = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('debug') === '1'
    } catch {
      return false
    }
  }, [])

  const [usuario, setUsuario] = useState<UsuarioPublico | null>(null)
  const [servicos, setServicos] = useState<Servico[]>([])
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [servicoId, setServicoId] = useState('')
  const [funcionarioId, setFuncionarioId] = useState('')
  const [data, setData] = useState('')
  const [hora, setHora] = useState('')
  const [clienteNome, setClienteNome] = useState('')
  const [clienteTelefone, setClienteTelefone] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [clientePlaca, setClientePlaca] = useState('')
  const [clienteEndereco, setClienteEndereco] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [successId, setSuccessId] = useState<string | null>(null)
  const [logoFailed, setLogoFailed] = useState(false)

  const [syncingPayment, setSyncingPayment] = useState(() => {
    try {
      const qp = new URLSearchParams(window.location.search)
      const paid = qp.get('paid') === '1'
      const sessionId = (qp.get('session_id') ?? '').trim()
      return Boolean(enableTaxaAgendamento && paid && sessionId)
    } catch {
      return false
    }
  })

  const [modalOpen, setModalOpen] = useState(false)

  const [datePopupOpen, setDatePopupOpen] = useState(false)
  const [datePopupMonthIso, setDatePopupMonthIso] = useState('')
  const [diaInteiroMonthIso, setDiaInteiroMonthIso] = useState('')

  const [step, setStep] = useState<'servico' | 'profissional' | 'quando'>('servico')

  const servicoRef = useRef<HTMLDivElement | null>(null)
  const profissionalRef = useRef<HTMLDivElement | null>(null)
  const whenRef = useRef<HTMLDivElement | null>(null)

  const canChooseProfessional = useMemo(() => {
    const p = String(usuario?.plano ?? '').trim().toLowerCase()
    return p === 'pro' || p === 'team' || p === 'enterprise'
  }, [usuario?.plano])

  const labels = useMemo(() => resolvePublicLabels(usuario?.tipo_negocio ?? null), [usuario?.tipo_negocio])

  const needsPlaca = useMemo(() => String(usuario?.tipo_negocio ?? '').trim().toLowerCase() === 'lava_jatos', [usuario?.tipo_negocio])

  const needsEndereco = useMemo(() => String(usuario?.tipo_negocio ?? '').trim().toLowerCase() === 'faxina', [usuario?.tipo_negocio])

  const hasStaff = useMemo(() => canChooseProfessional && funcionarios.length > 0, [canChooseProfessional, funcionarios.length])

  const primaryColor = useMemo(() => coerceHexColor(usuario?.public_primary_color ?? null, '#0f172a'), [usuario?.public_primary_color])
  const backgroundColor = useMemo(
    () => coerceHexColor(usuario?.public_background_color ?? null, '#f8fafc'),
    [usuario?.public_background_color]
  )
  const backgroundImageUrl = (usuario?.public_background_image_url ?? '').trim()
  const shouldUseBgImage = Boolean(usuario?.public_use_background_image) && Boolean(backgroundImageUrl)
  const hasBgImage = Boolean(shouldUseBgImage)

  useEffect(() => {
    const run = async () => {
      if (!slug) {
        setError('Link inválido')
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      setSuccessId(null)

      const wantsUnidade = Boolean((unidadeSlug ?? '').trim())
      const userArgs: Record<string, unknown> = { p_slug: slug }
      if (wantsUnidade) userArgs.p_unidade_slug = unidadeSlug
      const { data: userData, error: userErr } = await supabase.rpc('public_get_usuario_publico', userArgs).maybeSingle()
      if (userErr) {
        const msg = userErr.message
        const lower = msg.toLowerCase()
        const missingFn = isMissingRpcFnText(lower, 'public_get_usuario_publico')
        setError(
          missingFn
            ? wantsUnidade
              ? 'Configuração do Supabase incompleta: crie o SQL do link público e o SQL de Multi-unidades (EMPRESA).'
              : 'Configuração do Supabase incompleta: crie o SQL do link público (listar + agendar).'
            : msg
        )
        setLoading(false)
        return
      }
      if (!userData) {
        setError('Página não encontrada')
        setLoading(false)
        return
      }
      const usuarioPublico = userData as unknown as UsuarioPublico
      if ((unidadeSlug ?? '').trim() && !usuarioPublico.unidade_id) {
        setError('Unidade não encontrada')
        setLoading(false)
        return
      }
      setUsuario(usuarioPublico)

      const unidadeId = usuarioPublico.unidade_id ?? null

      const { data: servicesData, error: servicesErr } = await supabase.rpc('public_get_servicos_publicos', { p_usuario_id: usuarioPublico.id })
      if (servicesErr) {
        const msg = servicesErr.message
        const lower = msg.toLowerCase()
        const missingFn = isMissingRpcFnText(lower, 'public_get_servicos_publicos')
        setError(missingFn ? 'Configuração do Supabase incompleta: crie o SQL do link público (listar + agendar).' : msg)
        setLoading(false)
        return
      }
      const serviceList = (servicesData ?? []) as unknown as Servico[]
      setServicos(serviceList)

      const staffArgs: Record<string, unknown> = { p_usuario_master_id: usuarioPublico.id }
      if (unidadeId) staffArgs.p_unidade_id = unidadeId
      const { data: staffData, error: staffErr } = await supabase.rpc('public_get_funcionarios_publicos', staffArgs)
      if (staffErr) {
        const msg = staffErr.message
        const lower = msg.toLowerCase()
        const missingFn = isMissingRpcFnText(lower, 'public_get_funcionarios_publicos')
        setError(missingFn ? 'Configuração do Supabase incompleta: crie o SQL do link público (listar + agendar).' : msg)
        setLoading(false)
        return
      }
      const staffList = (staffData ?? []) as unknown as Funcionario[]
      setFuncionarios(staffList)
      setLoading(false)
    }

    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar')
      setLoading(false)
    })
  }, [slug, unidadeSlug])

  const selectedServico = useMemo(() => servicos.find((s) => s.id === servicoId) ?? null, [servicos, servicoId])
  const selectedFuncionario = useMemo(() => funcionarios.find((f) => f.id === funcionarioId) ?? null, [funcionarios, funcionarioId])

  const isDiaInteiro = selectedServico?.dia_inteiro === true

  const usuarioId = usuario?.id ?? null

  const minLeadMinutes = useMemo(() => {
    const v = selectedServico?.antecedencia_minutos
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 120
  }, [selectedServico?.antecedencia_minutos])

  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [vagasRestantesByHora, setVagasRestantesByHora] = useState<Record<string, number>>({})
  const [slotsLoading, setSlotsLoading] = useState(false)

  const isAcademia = useMemo(() => String(usuario?.tipo_negocio ?? '').trim().toLowerCase() === 'academia', [usuario?.tipo_negocio])
  const capacidadePorHorario = useMemo(() => {
    const v = selectedServico?.capacidade_por_horario
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(1, Math.min(200, Math.floor(v))) : 1
  }, [selectedServico?.capacidade_por_horario])
  const showCapacidadePorHorario = Boolean(isAcademia && !isDiaInteiro && capacidadePorHorario > 1)

  const [qtdVagas, setQtdVagas] = useState('1')

  const vagasRestantesSelecionadas = useMemo(() => {
    if (!showCapacidadePorHorario) return 1
    if (!hora) return capacidadePorHorario
    const raw = vagasRestantesByHora[hora]
    return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : capacidadePorHorario
  }, [capacidadePorHorario, hora, showCapacidadePorHorario, vagasRestantesByHora])

  const qtdVagasInt = useMemo(() => {
    const raw = Number(qtdVagas)
    const base = Number.isFinite(raw) ? Math.floor(raw) : 1
    const max = showCapacidadePorHorario ? Math.max(1, vagasRestantesSelecionadas) : 1
    return Math.max(1, Math.min(max, base))
  }, [qtdVagas, showCapacidadePorHorario, vagasRestantesSelecionadas])

  const [debugSlotsText, setDebugSlotsText] = useState<string | null>(null)

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const maxDate = useMemo(() => {
    const d = addYears(today, 1)
    d.setHours(0, 0, 0, 0)
    return d
  }, [today])

  const maxDays = useMemo(() => {
    const diff = maxDate.getTime() - today.getTime()
    if (!Number.isFinite(diff) || diff <= 0) return 0
    return Math.max(0, Math.round(diff / (24 * 60 * 60 * 1000)))
  }, [maxDate, today])

  const allowedWeekdays = useMemo(() => {
    const base = usuario?.dias_trabalho ?? null
    if (!base || base.length === 0) return null
    return new Set(base)
  }, [usuario?.dias_trabalho])

  const isDayDisabledByRule = useCallback(
    (d: Date) => {
      const x = new Date(d)
      x.setHours(0, 0, 0, 0)
      if (x < today) return true
      if (x > maxDate) return true
      if (allowedWeekdays && !allowedWeekdays.has(x.getDay())) return true
      return false
    },
    [allowedWeekdays, maxDate, today]
  )

  const [diaInteiroDisponibilidade, setDiaInteiroDisponibilidade] = useState<Record<string, string>>({})
  const [calendarDayHasSlots, setCalendarDayHasSlots] = useState<Record<string, boolean>>({})
  const [calendarioLoading, setCalendarioLoading] = useState(false)

  const minIso = useMemo(() => toIsoDateLocal(today), [today])
  const maxIso = useMemo(() => toIsoDateLocal(maxDate), [maxDate])

  const activeCalendarMonthIso = useMemo(() => {
    if (!usuarioId || !selectedServico) return ''
    if (hasStaff && !funcionarioId) return ''
    if (step !== 'quando') return ''
    if (isDiaInteiro) {
      if (diaInteiroMonthIso) return diaInteiroMonthIso
      const base = data ? new Date(`${data}T00:00:00`) : null
      const safe = base && Number.isFinite(base.getTime()) ? base : today
      return toIsoDateLocal(startOfMonth(safe))
    }
    if (datePopupOpen) return datePopupMonthIso || toIsoDateLocal(startOfMonth(today))
    return ''
  }, [data, datePopupMonthIso, datePopupOpen, diaInteiroMonthIso, funcionarioId, hasStaff, isDiaInteiro, selectedServico, step, today, usuarioId])

  const calendarFetchIsos = useMemo(() => {
    if (!activeCalendarMonthIso) return [] as string[]
    return monthRangeIsos(activeCalendarMonthIso, today, maxDate)
  }, [activeCalendarMonthIso, maxDate, today])

  useEffect(() => {
    let alive = true
    const run = async () => {
      if (!usuarioId || !selectedServico) {
        setCalendarioLoading(false)
        return
      }
      if (hasStaff && !funcionarioId) {
        setCalendarioLoading(false)
        return
      }
      if (calendarFetchIsos.length === 0) {
        setCalendarioLoading(false)
        return
      }
      setDiaInteiroDisponibilidade({})
      setCalendarDayHasSlots({})
      setCalendarioLoading(true)
      const entries = await Promise.all(
        calendarFetchIsos.map(async (iso) => {
          const dObj = new Date(`${iso}T00:00:00`)
          if (!Number.isFinite(dObj.getTime()) || isDayDisabledByRule(dObj)) return null

          const slotsArgs: Record<string, unknown> = {
            p_usuario_id: usuarioId,
            p_data: iso,
            p_servico_id: selectedServico.id,
            p_funcionario_id: hasStaff ? funcionarioId : null,
          }
          if (usuario?.unidade_id) slotsArgs.p_unidade_id = usuario.unidade_id

          const slotsRes = await callPublicRpcWithSignatureFallback<unknown>('public_get_slots_publicos', slotsArgs, usuario?.unidade_id ?? null)
          if (!slotsRes.ok) return null

          const raw = (slotsRes.data ?? []) as unknown
          const rows = Array.isArray(raw) ? raw : []
          const list = rows
            .map((r) => {
              if (typeof r === 'string') return r.trim()
              if (!r || typeof r !== 'object') return ''
              const obj = r as Record<string, unknown>
              if (typeof obj.hora_inicio === 'string') return obj.hora_inicio.trim()
              if (typeof obj.hora === 'string') return obj.hora.trim()
              return ''
            })
            .filter(Boolean)
          const slot = list[0] ?? ''
          return { iso, has: Boolean(slot), slot }
        })
      )

      if (!alive) return
      const nextHasSlots: Record<string, boolean> = {}
      for (const iso of calendarFetchIsos) nextHasSlots[iso] = false
      const next: Record<string, string> = {}
      for (const e of entries) {
        if (!e) continue
        nextHasSlots[e.iso] = e.has
        if (e.has && e.slot) next[e.iso] = e.slot
      }
      setCalendarDayHasSlots(nextHasSlots)
      setDiaInteiroDisponibilidade(isDiaInteiro ? next : {})
      setCalendarioLoading(false)
    }
    run().catch(() => {
      if (!alive) return
      setCalendarioLoading(false)
    })
    return () => {
      alive = false
    }
  }, [calendarFetchIsos, funcionarioId, hasStaff, isDayDisabledByRule, isDiaInteiro, selectedServico, usuario?.unidade_id, usuarioId])

  useEffect(() => {
    if (!usuario) return
    if (!data) return
    const current = new Date(`${data}T00:00:00`)
    if (!Number.isFinite(current.getTime())) return
    if (!isDayDisabledByRule(current)) return
    setTimeout(() => {
      setHora('')
      setData('')
    }, 0)
  }, [data, isDayDisabledByRule, today, usuario])

  useEffect(() => {
    let alive = true
    const run = async () => {
      if (!usuarioId || !selectedServico || !data) {
        setAvailableSlots([])
        setVagasRestantesByHora({})
        setSlotsLoading(false)
        if (debugEnabled) setDebugSlotsText(JSON.stringify({ ok: false, reason: 'missing_payload', usuarioId, servicoId: selectedServico?.id ?? null, data }, null, 2))
        return
      }
      if (hasStaff && !funcionarioId) {
        setAvailableSlots([])
        setVagasRestantesByHora({})
        setSlotsLoading(false)
        if (debugEnabled) setDebugSlotsText(JSON.stringify({ ok: false, reason: 'missing_funcionario', usuarioId, data, servicoId: selectedServico.id }, null, 2))
        return
      }

      setSlotsLoading(true)
      setError(null)

      const slotsArgs: Record<string, unknown> = {
        p_usuario_id: usuarioId,
        p_data: data,
        p_servico_id: selectedServico.id,
        p_funcionario_id: hasStaff ? funcionarioId : null,
      }
      if (usuario?.unidade_id) slotsArgs.p_unidade_id = usuario.unidade_id

      const slotsRes = await callPublicRpcWithSignatureFallback<unknown>('public_get_slots_publicos', slotsArgs, usuario?.unidade_id ?? null)
      if (!alive) return
      if (!slotsRes.ok) {
        const msg = slotsRes.errorText
        const lower = msg.toLowerCase()
        const missingSlotsFn = lower.includes('public_get_slots_publicos') && (lower.includes('function') || lower.includes('rpc'))
        const missingOcupacoesFn = lower.includes('public_get_ocupacoes') && isSignatureMismatchText(lower)
        if (missingSlotsFn) {
          setError(
            (unidadeSlug ?? '').trim()
              ? 'Configuração do Supabase incompleta: atualize o SQL do link público e o SQL de Multi-unidades (EMPRESA).'
              : 'Configuração do Supabase incompleta: atualize o SQL do link público (listar + agendar).'
          )
        } else if (missingOcupacoesFn) {
          setError('Configuração do Supabase incompleta: crie o SQL de horários públicos (ocupações + bloqueios).')
        } else if (lower.includes('data_passada')) {
          setError('Selecione uma data futura.')
        } else if (lower.includes('data_muito_futura')) {
          setError('Selecione uma data dentro de 1 ano.')
        } else if (lower.includes('fora_do_dia_de_trabalho')) {
          setError('Esse dia não está disponível para agendamento.')
        } else if (lower.includes('horarios_nao_configurados')) {
          setError('Horários de trabalho não configurados.')
        } else {
          setError(msg)
        }
        setSlotsLoading(false)
        if (debugEnabled) {
          const current = new Date(`${data}T00:00:00`)
          const schedStartMin = parseHHMMToMinutes(usuario?.horario_inicio ?? null)
          const schedEndMin = parseHHMMToMinutes(usuario?.horario_fim ?? null)
          const ivStartMin = parseHHMMToMinutes(usuario?.intervalo_inicio ?? null)
          const ivEndMin = parseHHMMToMinutes(usuario?.intervalo_fim ?? null)
          const schedSpanMin = schedStartMin !== null && schedEndMin !== null ? schedEndMin - schedStartMin : null
          const duracaoMin = selectedServico?.duracao_minutos ?? null
          const snapshot = {
            ok: false,
            error: msg,
            env: supabaseEnv.ok ? { url: supabaseEnv.values.VITE_SUPABASE_URL, anonKeyPrefix: `${supabaseEnv.values.VITE_SUPABASE_ANON_KEY.slice(0, 12)}…` } : { missing: supabaseEnv.missing },
            route: { slug: slug ?? null, unidadeSlug: unidadeSlug ?? null },
            payload: slotsArgs,
            selected: {
              servico: selectedServico ? { id: selectedServico.id, duracao_minutos: selectedServico.duracao_minutos, nome: selectedServico.nome } : null,
              funcionario: hasStaff ? (selectedFuncionario ? { id: selectedFuncionario.id, nome: selectedFuncionario.nome_completo } : { id: funcionarioId || null }) : null,
            },
            rules: {
              maxDays,
              minLeadMinutes,
              allowedWeekdays: Array.isArray(usuario?.dias_trabalho) ? usuario?.dias_trabalho : null,
              isDayDisabled: Number.isFinite(current.getTime()) ? isDayDisabledByRule(current) : null,
              weekday: Number.isFinite(current.getTime()) ? current.getDay() : null,
            },
            base: {
              usuario_id: usuario?.id ?? null,
              unidade_id: usuario?.unidade_id ?? null,
              horario_inicio: usuario?.horario_inicio ?? null,
              horario_fim: usuario?.horario_fim ?? null,
              intervalo_inicio: usuario?.intervalo_inicio ?? null,
              intervalo_fim: usuario?.intervalo_fim ?? null,
              timezone: (usuario as unknown as { timezone?: string | null } | null)?.timezone ?? null,
            },
            derived: {
              schedStartMin,
              schedEndMin,
              ivStartMin,
              ivEndMin,
              schedSpanMin,
              duracaoMin,
              duracaoMaiorQueExpediente: schedSpanMin !== null && duracaoMin !== null ? duracaoMin > schedSpanMin : null,
            },
          }
          setDebugSlotsText(JSON.stringify(snapshot, null, 2))
        }
        return
      }

      const raw = (slotsRes.data ?? []) as unknown
      const rows = Array.isArray(raw) ? raw : []

      const nextVagas: Record<string, number> = {}
      const list = rows
        .map((r) => {
          if (typeof r === 'string') return r.trim()
          if (!r || typeof r !== 'object') return ''
          const obj = r as Record<string, unknown>
          const horaInicio = typeof obj.hora_inicio === 'string' ? obj.hora_inicio.trim() : typeof obj.hora === 'string' ? obj.hora.trim() : ''
          const vagasRaw = obj.vagas_restantes
          if (horaInicio && typeof vagasRaw === 'number' && Number.isFinite(vagasRaw)) {
            nextVagas[horaInicio] = Math.max(0, Math.floor(vagasRaw))
          }
          return horaInicio
        })
        .filter(Boolean)

      const uniqueSorted = Array.from(new Set(list)).sort((a, b) => a.localeCompare(b))
      setAvailableSlots(uniqueSorted)
      setVagasRestantesByHora(nextVagas)
      setSlotsLoading(false)

      if (debugEnabled) {
        const current = new Date(`${data}T00:00:00`)
        const schedStartMin = parseHHMMToMinutes(usuario?.horario_inicio ?? null)
        const schedEndMin = parseHHMMToMinutes(usuario?.horario_fim ?? null)
        const ivStartMin = parseHHMMToMinutes(usuario?.intervalo_inicio ?? null)
        const ivEndMin = parseHHMMToMinutes(usuario?.intervalo_fim ?? null)
        const schedSpanMin = schedStartMin !== null && schedEndMin !== null ? schedEndMin - schedStartMin : null
        const duracaoMin = selectedServico?.duracao_minutos ?? null
        const snapshot = {
          ok: true,
          env: supabaseEnv.ok ? { url: supabaseEnv.values.VITE_SUPABASE_URL, anonKeyPrefix: `${supabaseEnv.values.VITE_SUPABASE_ANON_KEY.slice(0, 12)}…` } : { missing: supabaseEnv.missing },
          route: { slug: slug ?? null, unidadeSlug: unidadeSlug ?? null },
          payload: slotsArgs,
          selected: {
            servico: selectedServico ? { id: selectedServico.id, duracao_minutos: selectedServico.duracao_minutos, nome: selectedServico.nome } : null,
            funcionario: hasStaff ? (selectedFuncionario ? { id: selectedFuncionario.id, nome: selectedFuncionario.nome_completo } : { id: funcionarioId || null }) : null,
          },
          rules: {
            maxDays,
            minLeadMinutes,
            allowedWeekdays: Array.isArray(usuario?.dias_trabalho) ? usuario?.dias_trabalho : null,
            isDayDisabled: Number.isFinite(current.getTime()) ? isDayDisabledByRule(current) : null,
            weekday: Number.isFinite(current.getTime()) ? current.getDay() : null,
          },
          base: {
            usuario_id: usuario?.id ?? null,
            unidade_id: usuario?.unidade_id ?? null,
            horario_inicio: usuario?.horario_inicio ?? null,
            horario_fim: usuario?.horario_fim ?? null,
            intervalo_inicio: usuario?.intervalo_inicio ?? null,
            intervalo_fim: usuario?.intervalo_fim ?? null,
            timezone: (usuario as unknown as { timezone?: string | null } | null)?.timezone ?? null,
          },
          derived: {
            schedStartMin,
            schedEndMin,
            ivStartMin,
            ivEndMin,
            schedSpanMin,
            duracaoMin,
            duracaoMaiorQueExpediente: schedSpanMin !== null && duracaoMin !== null ? duracaoMin > schedSpanMin : null,
          },
          result: {
            slots: uniqueSorted.length,
            slots_preview: uniqueSorted.slice(0, 40),
          },
        }
        setDebugSlotsText(JSON.stringify(snapshot, null, 2))
      }
    }
    run().catch((e: unknown) => {
      if (!alive) return
      setError(e instanceof Error ? e.message : 'Erro ao calcular horários')
      setSlotsLoading(false)
      if (debugEnabled) setDebugSlotsText(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'Erro ao calcular horários' }, null, 2))
    })

    return () => {
      alive = false
    }
  }, [data, debugEnabled, funcionarioId, hasStaff, isDayDisabledByRule, maxDays, minLeadMinutes, selectedFuncionario, selectedServico, slug, unidadeSlug, usuario, usuarioId])

  const effectiveHora = useMemo(() => {
    if (!isDiaInteiro) return hora
    if (!data) return ''
    const slot = diaInteiroDisponibilidade[data] ?? ''
    return slot || ''
  }, [data, diaInteiroDisponibilidade, hora, isDiaInteiro])

  const submit = async () => {
    if (!usuarioId || !selectedServico || !data || !effectiveHora || !clienteNome.trim() || !clienteTelefone.trim()) return
    if (needsPlaca && !clientePlaca.trim()) return
    if (needsEndereco && !clienteEndereco.trim()) return
    setSubmitting(true)
    setError(null)
    setSuccessId(null)

    const telefone = normalizePhone(clienteTelefone)
    if (telefone.length < 8) {
      setError('Telefone inválido.')
      setSubmitting(false)
      return
    }

    const email = normalizeEmail(clienteEmail)
    if (clienteEmail.trim() && !email) {
      setError('Email inválido.')
      setSubmitting(false)
      return
    }

    const placa = clientePlaca.trim().replace(/[^a-zA-Z0-9-]/g, '').toUpperCase()
    const clienteNomeFinal = needsPlaca && placa ? `${clienteNome.trim()} (Placa: ${placa})` : clienteNome.trim()

    const extras: Record<string, unknown> = {}
    if (needsEndereco) extras.endereco = clienteEndereco.trim()
    if (needsPlaca && placa) extras.placa = placa
    if (email) extras.email = email
    const extrasFinal = Object.keys(extras).length > 0 ? extras : null

    const taxa = typeof selectedServico.taxa_agendamento === 'number' && Number.isFinite(selectedServico.taxa_agendamento) ? selectedServico.taxa_agendamento : 0
    const normalizedTaxa = Math.max(0, taxa)
    if (enableTaxaAgendamento && normalizedTaxa > 0) {
      const payload: Record<string, unknown> = {
        action: 'create_booking_fee_checkout',
        usuario_id: usuarioId,
        servico_id: selectedServico.id,
        data,
        hora_inicio: effectiveHora,
        cliente_nome: clienteNomeFinal,
        cliente_telefone: telefone,
        cliente_endereco: needsEndereco ? clienteEndereco.trim() : null,
        slug: slug ?? null,
        unidade_slug: unidadeSlug ?? null,
      }
      if (showCapacidadePorHorario) payload.qtd_vagas = qtdVagasInt
      if (extrasFinal) payload.extras = extrasFinal
      if (hasStaff) payload.funcionario_id = funcionarioId
      if (usuario?.unidade_id) payload.unidade_id = usuario.unidade_id

      const res = await callPublicPaymentsFn(payload)
      if (!res.ok) {
        const obj = res.body && typeof res.body === 'object' ? (res.body as Record<string, unknown>) : null
        const msg =
          (typeof obj?.message === 'string' && obj.message.trim()) ||
          (typeof obj?.error === 'string' && obj.error.trim()) ||
          (typeof res.body === 'string' && res.body.trim()) ||
          `Erro ao iniciar pagamento (HTTP ${res.status}).`
        const lower = msg.toLowerCase()
        if (lower.includes('capacidade_esgotada')) {
          setError('Esse horário não tem vagas suficientes. Selecione outro horário.')
        } else {
          setError(msg)
        }
        setSubmitting(false)
        return
      }

      const body = res.body && typeof res.body === 'object' ? (res.body as Record<string, unknown>) : null
      const checkoutUrl = typeof body?.checkout_url === 'string' ? body.checkout_url.trim() : ''
      const kind = typeof body?.kind === 'string' ? body.kind.trim().toLowerCase() : ''
      const agendamentoId = typeof body?.agendamento_id === 'string' ? body.agendamento_id.trim() : ''

      if (kind === 'credit' && agendamentoId) {
        setSuccessId(agendamentoId)
        setSubmitting(false)
        setModalOpen(false)
        return
      }

      if (!checkoutUrl) {
        setError('Falha ao iniciar pagamento: checkout_url ausente.')
        setSubmitting(false)
        return
      }

      window.location.href = checkoutUrl
      return
    }

    const createArgs: Record<string, unknown> = {
      p_usuario_id: usuarioId,
      p_data: data,
      p_hora_inicio: effectiveHora,
      p_servico_id: selectedServico.id,
      p_cliente_nome: clienteNomeFinal,
      p_cliente_telefone: telefone,
      p_funcionario_id: hasStaff ? funcionarioId : null,
    }
    if (showCapacidadePorHorario) createArgs.p_qtd_vagas = qtdVagasInt
    if (extrasFinal) createArgs.p_extras = extrasFinal
    if (usuario?.unidade_id) createArgs.p_unidade_id = usuario.unidade_id

    const createRes = await callPublicRpcWithSignatureFallback<unknown>('public_create_agendamento_publico', createArgs, usuario?.unidade_id ?? null)
    if (!createRes.ok) {
      const msg = createRes.errorText
      const lower = msg.toLowerCase()
      const missingFn = isMissingRpcFnText(lower, 'public_create_agendamento_publico')
      if (missingFn) {
        setError(
          (unidadeSlug ?? '').trim()
            ? 'Configuração do Supabase incompleta: crie o SQL do link público e o SQL de Multi-unidades (EMPRESA).'
            : 'Configuração do Supabase incompleta: crie o SQL do link público (listar + agendar).'
        )
      } else if (lower.includes('data_passada')) {
        setError('Selecione uma data futura.')
      } else if (lower.includes('data_muito_futura')) {
        setError('Selecione uma data dentro de 1 ano.')
      } else if (lower.includes('antecedencia_minima')) {
        setError(`Selecione um horário com no mínimo ${Math.round(minLeadMinutes / 60)}h de antecedência.`)
        } else if (lower.includes('capacidade_esgotada')) {
          setError('Esse horário não tem vagas suficientes. Selecione outro horário.')
      } else if (lower.includes('ocupado')) {
        setError('Esse horário acabou de ser ocupado. Selecione outro horário.')
      } else if (lower.includes('limite_mensal_atingido')) {
        setError('Este estabelecimento atingiu o limite de agendamentos do mês. Tente novamente no próximo mês.')
      } else if (needsEndereco && lower.includes('p_extras')) {
        setError('Atualização necessária no Supabase: aplique o SQL do link público para salvar o endereço.')
      } else {
        setError(msg)
      }
      setSubmitting(false)
      return
    }
    setSuccessId(createRes.data ? String(createRes.data) : 'ok')
    setSubmitting(false)
    setModalOpen(false)
  }

  useEffect(() => {
    const qp = (() => {
      try {
        return new URLSearchParams(window.location.search)
      } catch {
        return null
      }
    })()

    const paid = qp?.get('paid') === '1'
    const sessionId = (qp?.get('session_id') ?? '').trim()
    if (!enableTaxaAgendamento || !paid || !sessionId) return
    if (!syncingPayment || submitting) return

    callPublicPaymentsFn({ action: 'sync_booking_fee_session', session_id: sessionId })
      .then((res) => {
        if (!res.ok) {
          const obj = res.body && typeof res.body === 'object' ? (res.body as Record<string, unknown>) : null
          const msg =
            (typeof obj?.message === 'string' && obj.message.trim()) ||
            (typeof obj?.error === 'string' && obj.error.trim()) ||
            (typeof res.body === 'string' && res.body.trim()) ||
            `Erro ao confirmar pagamento (HTTP ${res.status}).`
          setError(msg)
          setSyncingPayment(false)
          return
        }
        const body = res.body && typeof res.body === 'object' ? (res.body as Record<string, unknown>) : null
        const agendamentoId = typeof body?.agendamento_id === 'string' ? body.agendamento_id.trim() : ''
        if (agendamentoId) setSuccessId(agendamentoId)
        setSyncingPayment(false)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Erro ao confirmar pagamento')
        setSyncingPayment(false)
      })
  }, [enableTaxaAgendamento, slug, submitting, syncingPayment, unidadeSlug])

  const canSubmit = Boolean(
    usuarioId &&
      selectedServico &&
      data &&
      effectiveHora &&
      clienteNome.trim() &&
      clienteTelefone.trim() &&
      (!hasStaff || funcionarioId) &&
      (!needsPlaca || clientePlaca.trim()) &&
      (!needsEndereco || clienteEndereco.trim())
  )

  const closeModal = () => {
    setModalOpen(false)
    setError(null)
  }


  const summary = useMemo(() => {
    const servicoNome = selectedServico?.nome ?? null
    const servicoPreco = typeof selectedServico?.preco === 'number' ? selectedServico.preco : null
    const servicoTaxa = typeof selectedServico?.taxa_agendamento === 'number' ? selectedServico.taxa_agendamento : null
    const profissionalNome = hasStaff ? (selectedFuncionario?.nome_completo ?? null) : null
    const canContinue = Boolean(usuarioId && selectedServico && data && effectiveHora && (!hasStaff || funcionarioId))
    const actionLabel = canContinue ? 'Continuar' : 'Escolher horário'
    return { servicoNome, servicoPreco, servicoTaxa, profissionalNome, canContinue, actionLabel }
  }, [data, effectiveHora, funcionarioId, hasStaff, selectedFuncionario?.nome_completo, selectedServico, usuarioId])

  const openFromFooter = () => {
    if (!usuario) return
    if (!summary.canContinue) {
      if (!selectedServico) {
        setStep('servico')
        setTimeout(() => {
          servicoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 0)
        return
      }
      if (hasStaff && !funcionarioId) {
        setStep('profissional')
        setTimeout(() => {
          profissionalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 0)
        return
      }

      setStep('quando')
      setTimeout(() => {
        whenRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 0)
      return
    }
    setModalOpen(true)
  }

  const whatsappHref = useMemo(() => {
    const digits = toWhatsappNumber(usuario?.telefone ?? '')
    return digits ? `https://wa.me/${digits}` : null
  }, [usuario?.telefone])

  const instagramHref = useMemo(() => {
    return normalizeInstagramUrl(String(usuario?.instagram_url ?? ''))
  }, [usuario?.instagram_url])

  const visibleSteps = useMemo(() => {
    return hasStaff ? (['servico', 'profissional', 'quando'] as const) : (['servico', 'quando'] as const)
  }, [hasStaff])

  const canGoStep = (target: 'servico' | 'profissional' | 'quando') => {
    if (target === 'servico') return true
    if (target === 'profissional') return Boolean(selectedServico && hasStaff)
    if (target === 'quando') return Boolean(selectedServico && (!hasStaff || funcionarioId))
    return false
  }

  const goStep = (target: 'servico' | 'profissional' | 'quando') => {
    if (!canGoStep(target)) return
    setStep(target)
    setTimeout(() => {
      if (target === 'servico') servicoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      if (target === 'profissional') profissionalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      if (target === 'quando') whenRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  const slotGroups = useMemo(() => {
    const manha: string[] = []
    const tarde: string[] = []
    const noite: string[] = []
    for (const t of availableSlots) {
      const hh = Number(String(t).split(':')[0])
      if (!Number.isFinite(hh)) continue
      if (hh < 12) manha.push(t)
      else if (hh < 18) tarde.push(t)
      else noite.push(t)
    }
    return { manha, tarde, noite }
  }, [availableSlots])

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: shouldUseBgImage ? 'transparent' : backgroundColor,
        backgroundImage: shouldUseBgImage ? `url(${backgroundImageUrl})` : undefined,
        backgroundSize: shouldUseBgImage ? 'cover' : undefined,
        backgroundPosition: shouldUseBgImage ? 'center' : undefined,
      }}
    >
      <div className="min-h-screen" style={hasBgImage ? { backgroundColor: 'transparent' } : undefined}>
        <div className="mx-auto max-w-xl px-4 py-8 space-y-6">
          <div>
            <div className="text-xs font-semibold tracking-wide text-slate-500">SMagenda</div>
            <div className="text-2xl font-semibold text-slate-900">Agendar</div>
          </div>

          {loading ? <div className="text-sm text-slate-600">Carregando…</div> : null}
          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
          {successId ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Agendamento criado.</div>
          ) : null}

          {usuario ? (
            <Card>
              <div className="overflow-hidden rounded-xl">
                <div
                  className="h-24"
                  style={
                    usuario.public_use_background_image && usuario.public_background_image_url
                      ? { backgroundImage: `url(${usuario.public_background_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                      : {
                          backgroundImage: `linear-gradient(135deg, ${primaryColor} 0%, #0b1220 100%)`,
                        }
                  }
                />
                <div className="px-5 pb-5">
                  <div className="-mt-10 flex items-end gap-3">
                    {usuario.logo_url && !logoFailed ? (
                      <img
                        src={usuario.logo_url}
                        alt={usuario.nome_negocio}
                        className="h-16 w-16 rounded-full border-2 border-white object-cover shadow-sm"
                        onError={() => setLogoFailed(true)}
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-full border-2 border-white bg-white/70 shadow-sm" />
                    )}
                    <div className="min-w-0">
                      <div className="text-lg font-semibold text-slate-900 truncate">{usuario.nome_negocio}</div>
                      {usuario.unidade_nome ? <div className="text-xs text-slate-600 truncate">{usuario.unidade_nome}</div> : null}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge tone="green">Agendamento online</Badge>
                    {usuario.endereco ? <Badge>Endereço</Badge> : null}
                    {usuario.telefone && whatsappHref ? (
                      <a href={whatsappHref} target="_blank" rel="noreferrer noopener" className="inline-flex">
                        <Badge>WhatsApp</Badge>
                      </a>
                    ) : usuario.telefone ? (
                      <Badge>WhatsApp</Badge>
                    ) : null}
                    {instagramHref ? (
                      <a href={instagramHref} target="_blank" rel="noreferrer noopener" className="inline-flex">
                        <Badge>Instagram</Badge>
                      </a>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-2">
                    {usuario.endereco ? (
                      <a
                        className="block text-sm text-slate-700 underline underline-offset-2"
                        href={toGoogleMapsLink(usuario.endereco)}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {usuario.endereco}
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          ) : null}

          {usuario ? (
            <Card>
              <div className="p-4 space-y-4">
                <div className="flex gap-2">
                  {visibleSteps.map((s) => {
                    const active = step === s
                    const enabled = canGoStep(s)
                    const label =
                      s === 'servico'
                        ? `1. ${labels.servico}`
                        : s === 'profissional'
                          ? `2. ${labels.profissional}`
                          : `${hasStaff ? '3' : '2'}. Quando`
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={!enabled}
                        onClick={() => goStep(s)}
                        className={[
                          'flex-1 rounded-lg border px-3 py-2 text-sm font-medium',
                          enabled ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed',
                          active ? 'text-white' : 'bg-white border-slate-200 text-slate-700',
                        ].join(' ')}
                        style={active ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </Card>
          ) : null}

          {usuario ? (
            <div ref={servicoRef} className="space-y-3">
              <div className="text-sm font-semibold text-slate-900">1) {labels.servico}</div>
              {servicos.length === 0 ? (
                <div className="text-sm text-slate-600">Sem {labels.servicos.toLowerCase()} disponíveis.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {servicos.map((s) => {
                    const selected = servicoId === s.id
                    const hasPreco = typeof s.preco === 'number'
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setError(null)
                          setSuccessId(null)
                          setHora('')
                          setServicoId(s.id)
                          const next = hasStaff ? 'profissional' : 'quando'
                          setStep(next)
                          setTimeout(() => {
                            if (next === 'profissional') profissionalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                            if (next === 'quando') whenRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }, 0)
                        }}
                        className={[
                          'rounded-2xl border p-4 text-left transition',
                          selected ? 'text-white' : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50',
                        ].join(' ')}
                        style={selected ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            {s.foto_url ? (
                              <img
                                src={s.foto_url}
                                alt={s.nome}
                                className="h-14 w-14 rounded-xl object-cover border border-slate-200"
                                loading="lazy"
                              />
                            ) : (
                              <div className={['h-14 w-14 rounded-xl border border-slate-200', selected ? 'bg-white/20' : 'bg-slate-50'].join(' ')} />
                            )}
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">{s.nome}</div>
                              {s.descricao ? <div className={selected ? 'mt-1 text-xs text-white/90' : 'mt-1 text-xs text-slate-600'}>{s.descricao}</div> : null}
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span
                                  className={[
                                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                    selected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700',
                                  ].join(' ')}
                                >
                                  {s.duracao_minutos} min
                                </span>
                                {hasPreco ? (
                                  <span
                                    className={[
                                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                      selected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700',
                                    ].join(' ')}
                                  >
                                    {formatBRMoney(s.preco)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <div className={['shrink-0 rounded-full px-3 py-1 text-xs font-semibold', selected ? 'bg-white/20 text-white' : 'bg-slate-900 text-white'].join(' ')}>
                            {selected ? 'Selecionado' : 'Selecionar'}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ) : null}

          {usuario && hasStaff && step !== 'servico' ? (
            <div ref={profissionalRef} className="space-y-3">
              <div className="text-sm font-semibold text-slate-900">2) {labels.profissional}</div>
              {funcionarios.length === 0 ? (
                <div className="text-sm text-slate-600">Sem {labels.profissionais.toLowerCase()} disponíveis.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {funcionarios.map((f) => {
                    const selected = funcionarioId === f.id
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          setError(null)
                          setSuccessId(null)
                          setHora('')
                          setFuncionarioId(f.id)
                          setStep('quando')
                          setTimeout(() => {
                            whenRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }, 0)
                        }}
                        className={[
                          'rounded-2xl border p-4 text-left transition',
                          selected ? 'text-white' : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50',
                        ].join(' ')}
                        style={selected ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold truncate">{f.nome_completo}</div>
                          <div className={['shrink-0 rounded-full px-3 py-1 text-xs font-semibold', selected ? 'bg-white/20 text-white' : 'bg-slate-900 text-white'].join(' ')}>
                            {selected ? 'Selecionado' : 'Selecionar'}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ) : null}

          {usuario && step === 'quando' ? (
            <div ref={whenRef} className="space-y-3">
              <div className="text-sm font-semibold text-slate-900">{hasStaff ? '3' : '2'}) Quando</div>
              <Card>
                <div className="p-4 space-y-4">
                  <div>
                    <div className="text-xs font-semibold tracking-wide text-slate-500">Data</div>
                    {isDiaInteiro ? (
                      <DiaInteiroCalendar
                        key={`${servicoId}:${funcionarioId ?? ''}:${usuarioId ?? ''}`}
                        primaryColor={primaryColor}
                        selectedIso={data}
                        setSelectedIso={(iso) => {
                          setError(null)
                          setSuccessId(null)
                          setHora('')
                          setData(iso)
                          setStep('quando')
                        }}
                        minIso={minIso}
                        maxIso={maxIso}
                        monthIso={diaInteiroMonthIso}
                        setMonthIso={setDiaInteiroMonthIso}
                        isDayDisabled={isDayDisabledByRule}
                        diaInteiroDisponibilidade={diaInteiroDisponibilidade}
                        calendarioLoading={calendarioLoading}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const baseIso = data || minIso
                          const base = baseIso ? new Date(`${baseIso}T00:00:00`) : null
                          const safeBase = base && Number.isFinite(base.getTime()) ? base : new Date()
                          setDatePopupMonthIso(toIsoDateLocal(startOfMonth(safeBase)))
                          setDatePopupOpen(true)
                        }}
                        aria-haspopup="dialog"
                        aria-expanded={datePopupOpen}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left hover:bg-slate-50"
                      >
                        <div className="text-xs font-semibold text-slate-500">Data selecionada</div>
                        <div className="mt-0.5 text-sm font-semibold text-slate-900">{formatIsoDateBR(data)}</div>
                      </button>
                    )}

                    {!isDiaInteiro ? (
                      <DatePopupCalendar
                        open={datePopupOpen}
                        primaryColor={primaryColor}
                        selectedIso={data}
                        monthIso={datePopupMonthIso}
                        setMonthIso={setDatePopupMonthIso}
                        onClose={() => setDatePopupOpen(false)}
                        onSelect={(iso) => {
                          setError(null)
                          setSuccessId(null)
                          setHora('')
                          setData(iso)
                          setDatePopupMonthIso(toIsoDateLocal(startOfMonth(new Date(`${iso}T00:00:00`))))
                          setDatePopupOpen(false)
                          setStep('quando')
                        }}
                        minIso={minIso}
                        maxIso={maxIso}
                        isDayDisabled={isDayDisabledByRule}
                        dayHasSlots={calendarDayHasSlots}
                        availabilityLoading={calendarioLoading}
                      />
                    ) : null}

                    <div className="mt-2 text-xs text-slate-600">
                      {calendarioLoading ? 'Carregando disponibilidade do calendário… ' : ''}Escolha qualquer data até 1 ano a partir de hoje (mude o mês no calendário). Antecedência mínima: {Math.round(minLeadMinutes / 60)}h.
                    </div>
                  </div>

                  {!isDiaInteiro ? (
                    <div>
                      <div className="text-xs font-semibold tracking-wide text-slate-500">Horário</div>
                      {!selectedServico ? (
                        <div className="mt-2 text-sm text-slate-600">Selecione um {labels.servico.toLowerCase()}.</div>
                      ) : hasStaff && !selectedFuncionario ? (
                        <div className="mt-2 text-sm text-slate-600">Selecione um {labels.profissional.toLowerCase()}.</div>
                      ) : slotsLoading ? (
                        <div className="mt-2 text-sm text-slate-600">Buscando horários…</div>
                      ) : availableSlots.length === 0 ? (
                        <div className="mt-2 text-sm text-slate-600">Sem horários disponíveis.</div>
                      ) : (
                        <div className="mt-3 space-y-4">
                          {slotGroups.manha.length > 0 ? (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-slate-700">Manhã</div>
                              <div className="grid grid-cols-3 gap-2">
                                {slotGroups.manha.map((t) => {
                                  const selected = hora === t
                                  const vagas = showCapacidadePorHorario ? vagasRestantesByHora[t] : undefined
                                  return (
                                    <button
                                      key={t}
                                      type="button"
                                      onClick={() => {
                                        setHora(t)
                                        if (showCapacidadePorHorario) setQtdVagas('1')
                                      }}
                                      className={['rounded-xl px-3 py-2 text-sm font-semibold border', selected ? '' : 'bg-white text-slate-700 border-slate-200'].join(' ')}
                                      style={selected ? { backgroundColor: primaryColor, borderColor: primaryColor, color: '#fff' } : { backgroundColor: '#fff' }}
                                    >
                                      <div className="flex flex-col items-center leading-tight">
                                        <div>{t}</div>
                                        {typeof vagas === 'number' ? <div className={selected ? 'text-[11px] opacity-90' : 'text-[11px] text-slate-500'}>{vagas} vagas</div> : null}
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ) : null}

                          {slotGroups.tarde.length > 0 ? (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-slate-700">Tarde</div>
                              <div className="grid grid-cols-3 gap-2">
                                {slotGroups.tarde.map((t) => {
                                  const selected = hora === t
                                  const vagas = showCapacidadePorHorario ? vagasRestantesByHora[t] : undefined
                                  return (
                                    <button
                                      key={t}
                                      type="button"
                                      onClick={() => {
                                        setHora(t)
                                        if (showCapacidadePorHorario) setQtdVagas('1')
                                      }}
                                      className={['rounded-xl px-3 py-2 text-sm font-semibold border', selected ? '' : 'bg-white text-slate-700 border-slate-200'].join(' ')}
                                      style={selected ? { backgroundColor: primaryColor, borderColor: primaryColor, color: '#fff' } : { backgroundColor: '#fff' }}
                                    >
                                      <div className="flex flex-col items-center leading-tight">
                                        <div>{t}</div>
                                        {typeof vagas === 'number' ? <div className={selected ? 'text-[11px] opacity-90' : 'text-[11px] text-slate-500'}>{vagas} vagas</div> : null}
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ) : null}

                          {slotGroups.noite.length > 0 ? (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-slate-700">Noite</div>
                              <div className="grid grid-cols-3 gap-2">
                                {slotGroups.noite.map((t) => {
                                  const selected = hora === t
                                  const vagas = showCapacidadePorHorario ? vagasRestantesByHora[t] : undefined
                                  return (
                                    <button
                                      key={t}
                                      type="button"
                                      onClick={() => {
                                        setHora(t)
                                        if (showCapacidadePorHorario) setQtdVagas('1')
                                      }}
                                      className={['rounded-xl px-3 py-2 text-sm font-semibold border', selected ? '' : 'bg-white text-slate-700 border-slate-200'].join(' ')}
                                      style={selected ? { backgroundColor: primaryColor, borderColor: primaryColor, color: '#fff' } : { backgroundColor: '#fff' }}
                                    >
                                      <div className="flex flex-col items-center leading-tight">
                                        <div>{t}</div>
                                        {typeof vagas === 'number' ? <div className={selected ? 'text-[11px] opacity-90' : 'text-[11px] text-slate-500'}>{vagas} vagas</div> : null}
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}

                      {debugEnabled && debugSlotsText ? (
                        <div className="mt-4">
                          <Card>
                            <div className="p-4 space-y-2">
                              <div className="text-xs font-semibold tracking-wide text-slate-500">Debug (slots)</div>
                              <pre className="text-[11px] leading-4 text-slate-700 whitespace-pre-wrap break-words font-mono">{debugSlotsText}</pre>
                            </div>
                          </Card>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div>
                      <div className="text-xs font-semibold tracking-wide text-slate-500">Diária</div>
                      {!selectedServico ? (
                        <div className="mt-2 text-sm text-slate-600">Selecione um {labels.servico.toLowerCase()}.</div>
                      ) : hasStaff && !selectedFuncionario ? (
                        <div className="mt-2 text-sm text-slate-600">Selecione um {labels.profissional.toLowerCase()}.</div>
                      ) : slotsLoading ? (
                        <div className="mt-2 text-sm text-slate-600">Buscando disponibilidade…</div>
                      ) : hora ? (
                        <div className="mt-2 text-sm text-slate-700">Dia selecionado com disponibilidade.</div>
                      ) : (
                        <div className="mt-2 text-sm text-slate-600">Selecione um dia disponível no calendário.</div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      {usuario && !modalOpen && !successId ? (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <div className="mx-auto max-w-xl px-4 pb-4">
            <div className="rounded-2xl border border-slate-200 bg-white/95 backdrop-blur p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold tracking-wide text-slate-500">Resumo do agendamento</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 truncate">
                    {formatIsoDateBR(data)} {hora ? `• ${hora}` : ''}
                  </div>
                  <div className="mt-1 text-xs text-slate-700 truncate">
                    {labels.servico}: {summary.servicoNome ?? '—'}
                    {summary.servicoPreco !== null ? ` • ${formatBRMoney(summary.servicoPreco)}` : ''}
                  </div>
                  {hasStaff ? (
                    <div className="mt-1 text-xs text-slate-700 truncate">
                      {labels.profissional}: {summary.profissionalNome ?? '—'}
                    </div>
                  ) : null}
                </div>
                <Button
                  onClick={openFromFooter}
                  style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                  className="px-6 py-3 text-base shadow-md"
                >
                  {summary.actionLabel}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {usuario && !modalOpen && !successId ? <div className="h-28" /> : null}

      {modalOpen && usuario ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={closeModal} aria-label="Fechar" />
          <div className="relative w-full max-w-lg">
            <Card>
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Agendar em {formatIsoDateBR(data)}</div>
                    <div className="text-xs text-slate-600">{usuario.nome_negocio}</div>
                  </div>
                  <Button variant="secondary" onClick={closeModal}>
                    Fechar
                  </Button>
                </div>

                {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-900">Confirmar agendamento</div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <div>Dia</div>
                      <div className="font-semibold">{formatIsoDateBR(data)}</div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div>Hora</div>
                      <div className="font-semibold">{hora || '—'}</div>
                    </div>
                    {needsPlaca && clientePlaca.trim() ? (
                      <div className="flex items-center justify-between gap-2">
                        <div>Placa</div>
                        <div className="font-semibold">{clientePlaca.trim().replace(/[^a-zA-Z0-9-]/g, '').toUpperCase()}</div>
                      </div>
                    ) : null}
                    {needsEndereco && clienteEndereco.trim() ? (
                      <div className="flex items-center justify-between gap-2">
                        <div>Endereço</div>
                        <div className="font-semibold text-right">{clienteEndereco.trim()}</div>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-2">
                      <div>{labels.servico}</div>
                      <div className="font-semibold">{selectedServico?.nome ?? '—'}</div>
                    </div>
                    {hasStaff ? (
                      <div className="flex items-center justify-between gap-2">
                        <div>{labels.profissional}</div>
                        <div className="font-semibold">{selectedFuncionario?.nome_completo ?? '—'}</div>
                      </div>
                    ) : null}
                  </div>

                  <Input label="Nome" value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} />
                  {showCapacidadePorHorario ? (
                    <Input
                      label={`Quantidade (até ${Math.max(1, vagasRestantesSelecionadas)} vagas)`}
                      type="number"
                      min={1}
                      max={Math.max(1, vagasRestantesSelecionadas)}
                      value={String(qtdVagasInt)}
                      onChange={(e) => {
                        const raw = Number(e.target.value)
                        const base = Number.isFinite(raw) ? Math.floor(raw) : 1
                        const max = Math.max(1, vagasRestantesSelecionadas)
                        const clamped = Math.max(1, Math.min(max, base))
                        setQtdVagas(String(clamped))
                      }}
                    />
                  ) : null}
                  <Input label="WhatsApp" value={clienteTelefone} onChange={(e) => setClienteTelefone(e.target.value)} />
                  <Input label="Email (opcional)" value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)} />
                  {needsPlaca ? <Input label="Placa do carro" value={clientePlaca} onChange={(e) => setClientePlaca(e.target.value)} /> : null}
                  {needsEndereco ? <Input label="Endereço" value={clienteEndereco} onChange={(e) => setClienteEndereco(e.target.value)} /> : null}

                  <div className="flex justify-between">
                    <Button variant="secondary" onClick={closeModal}>
                      Voltar
                    </Button>
                    <Button
                      onClick={submit}
                      disabled={!canSubmit || submitting}
                      style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                      className="px-7 py-3 text-base shadow-lg"
                    >
                      {submitting ? 'Confirmando…' : 'Confirmar'}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {successId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40" />
          <div className="relative w-full max-w-lg">
            <Card>
              <div className="p-6 space-y-4 text-center">
                <div className="text-lg font-semibold text-slate-900">Agendamento enviado!</div>
                <div className="text-sm text-slate-700">Seu agendamento foi enviado. Você receberá a confirmação em breve.</div>
                {data || hora ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <div>Dia</div>
                      <div className="font-semibold">{data ? formatIsoDateBR(data) : '—'}</div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div>Hora</div>
                      <div className="font-semibold">{hora || '—'}</div>
                    </div>
                  </div>
                ) : null}
                <Button
                  onClick={() => {
                    setSuccessId(null)
                    setModalOpen(false)
                    setError(null)
                  }}
                  style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                  className="py-3 text-base shadow-md"
                  fullWidth
                >
                  Fechar
                </Button>
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  )
}
