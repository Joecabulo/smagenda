import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { minutesToTime, parseTimeToMinutes, toISODate } from '../../lib/dates'
import { supabase } from '../../lib/supabase'

type UsuarioPublico = {
  id: string
  nome_negocio: string
  logo_url: string | null
  endereco: string | null
  telefone: string | null
  horario_inicio: string | null
  horario_fim: string | null
  dias_trabalho: number[] | null
  intervalo_inicio: string | null
  intervalo_fim: string | null
  ativo: boolean
  tipo_conta: 'master' | 'individual'
  public_primary_color: string | null
  public_background_color: string | null
  public_background_image_url: string | null
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
  duracao_minutos: number
  preco: number
  cor: string | null
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

function buildCandidateStarts(
  start: string,
  end: string,
  intervalStart: string | null,
  intervalEnd: string | null,
  serviceMinutes: number,
  stepMinutes: number
): string[] {
  const startMin = parseTimeToMinutes(start)
  const endMin = parseTimeToMinutes(end)
  const ivStart = intervalStart ? parseTimeToMinutes(intervalStart) : null
  const ivEnd = intervalEnd ? parseTimeToMinutes(intervalEnd) : null
  const slots: string[] = []
  for (let m = startMin; m + serviceMinutes <= endMin; m += stepMinutes) {
    if (ivStart !== null && ivEnd !== null) {
      if (m >= ivStart && m < ivEnd) continue
      if (m + serviceMinutes > ivStart && m < ivEnd) continue
    }
    slots.push(minutesToTime(m))
  }
  return slots
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd
}

export function PublicBookingPage() {
  const { slug } = useParams()

  const [usuario, setUsuario] = useState<UsuarioPublico | null>(null)
  const [servicos, setServicos] = useState<Servico[]>([])
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [servicoId, setServicoId] = useState('')
  const [funcionarioId, setFuncionarioId] = useState('')
  const [data, setData] = useState(() => toISODate(new Date()))
  const [hora, setHora] = useState('')
  const [clienteNome, setClienteNome] = useState('')
  const [clienteTelefone, setClienteTelefone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [successId, setSuccessId] = useState<string | null>(null)
  const [logoFailed, setLogoFailed] = useState(false)

  const hasStaff = useMemo(() => funcionarios.length > 0, [funcionarios.length])

  const primaryColor = useMemo(() => coerceHexColor(usuario?.public_primary_color ?? null, '#0f172a'), [usuario?.public_primary_color])
  const backgroundColor = useMemo(
    () => coerceHexColor(usuario?.public_background_color ?? null, '#f8fafc'),
    [usuario?.public_background_color]
  )
  const backgroundImageUrl = (usuario?.public_background_image_url ?? '').trim()
  const hasBgImage = Boolean(backgroundImageUrl)

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

      const { data: userData, error: userErr } = await supabase.rpc('public_get_usuario_publico', { p_slug: slug }).maybeSingle()
      if (userErr) {
        const msg = userErr.message
        const lower = msg.toLowerCase()
        const missingFn = lower.includes('public_get_usuario_publico') && (lower.includes('function') || lower.includes('rpc'))
        setError(missingFn ? 'Configuração do Supabase incompleta: crie o SQL do link público (listar + agendar).' : msg)
        setLoading(false)
        return
      }
      if (!userData) {
        setError('Página não encontrada')
        setLoading(false)
        return
      }
      const usuarioPublico = userData as unknown as UsuarioPublico
      setUsuario(usuarioPublico)

      const { data: servicesData, error: servicesErr } = await supabase.rpc('public_get_servicos_publicos', { p_usuario_id: usuarioPublico.id })
      if (servicesErr) {
        const msg = servicesErr.message
        const lower = msg.toLowerCase()
        const missingFn = lower.includes('public_get_servicos_publicos') && (lower.includes('function') || lower.includes('rpc'))
        setError(missingFn ? 'Configuração do Supabase incompleta: crie o SQL do link público (listar + agendar).' : msg)
        setLoading(false)
        return
      }
      const serviceList = (servicesData ?? []) as unknown as Servico[]
      setServicos(serviceList)
      if (serviceList.length > 0) setServicoId(serviceList[0].id)

      const { data: staffData, error: staffErr } = await supabase.rpc('public_get_funcionarios_publicos', { p_usuario_master_id: usuarioPublico.id })
      if (staffErr) {
        const msg = staffErr.message
        const lower = msg.toLowerCase()
        const missingFn = lower.includes('public_get_funcionarios_publicos') && (lower.includes('function') || lower.includes('rpc'))
        setError(missingFn ? 'Configuração do Supabase incompleta: crie o SQL do link público (listar + agendar).' : msg)
        setLoading(false)
        return
      }
      const staffList = (staffData ?? []) as unknown as Funcionario[]
      setFuncionarios(staffList)
      if (staffList.length > 0) setFuncionarioId(staffList[0].id)
      setLoading(false)
    }

    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar')
      setLoading(false)
    })
  }, [slug])

  const selectedServico = useMemo(() => servicos.find((s) => s.id === servicoId) ?? null, [servicos, servicoId])
  const selectedFuncionario = useMemo(() => funcionarios.find((f) => f.id === funcionarioId) ?? null, [funcionarios, funcionarioId])

  const usuarioId = usuario?.id ?? null
  const servicoMinutes = selectedServico?.duracao_minutos ?? null

  const schedule = useMemo(() => {
    const base = usuario
    if (!base) return null
    const useStaff = selectedFuncionario
    return {
      horario_inicio: useStaff?.horario_inicio ?? base.horario_inicio,
      horario_fim: useStaff?.horario_fim ?? base.horario_fim,
      dias_trabalho: useStaff?.dias_trabalho ?? base.dias_trabalho,
      intervalo_inicio: useStaff?.intervalo_inicio ?? base.intervalo_inicio,
      intervalo_fim: useStaff?.intervalo_fim ?? base.intervalo_fim,
    }
  }, [usuario, selectedFuncionario])

  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)

  useEffect(() => {
    const run = async () => {
      if (!usuarioId || !servicoMinutes || !schedule?.horario_inicio || !schedule?.horario_fim) {
        setAvailableSlots([])
        return
      }
      if (hasStaff && !funcionarioId) {
        setAvailableSlots([])
        return
      }

      setSlotsLoading(true)
      setError(null)
      setHora('')

      const day = new Date(data)
      const weekday = day.getDay()
      const days = schedule.dias_trabalho ?? []
      if (days.length > 0 && !days.includes(weekday)) {
        setAvailableSlots([])
        setSlotsLoading(false)
        return
      }

      type OcupacaoRow = { start_min: number; end_min: number }

      const { data: ocupacoesData, error: ocupacoesErr } = await supabase.rpc('public_get_ocupacoes', {
        p_usuario_id: usuarioId,
        p_data: data,
        p_funcionario_id: funcionarioId || null,
      })
      if (ocupacoesErr) {
        const msg = ocupacoesErr.message
        const lower = msg.toLowerCase()
        const missingFn = lower.includes('public_get_ocupacoes') && (lower.includes('function') || lower.includes('rpc'))
        setError(missingFn ? 'Configuração do Supabase incompleta: crie a função public_get_ocupacoes para calcular horários.' : msg)
        setSlotsLoading(false)
        return
      }

      const candidates = buildCandidateStarts(
        schedule.horario_inicio,
        schedule.horario_fim,
        schedule.intervalo_inicio,
        schedule.intervalo_fim,
        servicoMinutes,
        15
      )

      const occupiedRanges = ((ocupacoesData ?? []) as unknown as OcupacaoRow[]).map((r) => ({ start: r.start_min, end: r.end_min }))

      const available = candidates.filter((t) => {
        const s = parseTimeToMinutes(t)
        const e = s + servicoMinutes
        return !occupiedRanges.some((r) => overlaps(s, e, r.start, r.end))
      })

      setAvailableSlots(available)
      setSlotsLoading(false)
    }
    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao calcular horários')
      setSlotsLoading(false)
    })
  }, [usuarioId, servicoMinutes, data, funcionarioId, hasStaff, schedule])

  const submit = async () => {
    if (!usuarioId || !selectedServico || !hora || !clienteNome.trim() || !clienteTelefone.trim()) return
    setSubmitting(true)
    setError(null)
    setSuccessId(null)

    const { data: createdId, error: err } = await supabase.rpc('public_create_agendamento_publico', {
      p_usuario_id: usuarioId,
      p_data: data,
      p_hora_inicio: hora,
      p_servico_id: selectedServico.id,
      p_cliente_nome: clienteNome.trim(),
      p_cliente_telefone: clienteTelefone.trim(),
      p_funcionario_id: hasStaff ? funcionarioId : null,
    })
    if (err) {
      const msg = err.message
      const lower = msg.toLowerCase()
      const missingFn = lower.includes('public_create_agendamento_publico') && (lower.includes('function') || lower.includes('rpc'))
      if (missingFn) {
        setError('Configuração do Supabase incompleta: crie o SQL do link público (listar + agendar).')
      } else if (lower.includes('ocupado')) {
        setError('Esse horário acabou de ser ocupado. Selecione outro horário.')
      } else {
        setError(msg)
      }
      setSubmitting(false)
      return
    }
    setSuccessId(createdId ? String(createdId) : 'ok')
    setSubmitting(false)
  }

  const canSubmit = Boolean(usuarioId && selectedServico && hora && clienteNome.trim() && clienteTelefone.trim() && (!hasStaff || funcionarioId))

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor,
        backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined,
        backgroundSize: backgroundImageUrl ? 'cover' : undefined,
        backgroundPosition: backgroundImageUrl ? 'center' : undefined,
      }}
    >
      <div className="min-h-screen" style={hasBgImage ? { backgroundColor: 'rgba(255,255,255,0.84)' } : undefined}>
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
              <div className="p-6 space-y-2">
                {usuario.logo_url && !logoFailed ? (
                  <div className="flex justify-center">
                    <img
                      src={usuario.logo_url}
                      alt={usuario.nome_negocio}
                      className="h-20 w-20 rounded-2xl object-cover border border-slate-200"
                      onError={() => setLogoFailed(true)}
                    />
                  </div>
                ) : null}
                <div className="text-lg font-semibold text-slate-900 text-center">{usuario.nome_negocio}</div>
                {usuario.endereco ? <div className="text-sm text-slate-600">📍 {usuario.endereco}</div> : null}
                {usuario.telefone ? <div className="text-sm text-slate-600">📱 {usuario.telefone}</div> : null}
              </div>
            </Card>
          ) : null}

          {usuario ? (
            <Card>
              <div className="p-6 space-y-4">
                <div className="text-sm font-semibold text-slate-900">1) Serviço</div>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                  value={servicoId}
                  onChange={(e) => setServicoId(e.target.value)}
                >
                  {servicos.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome} • {s.duracao_minutos} min
                    </option>
                  ))}
                </select>

                {funcionarios.length > 0 ? (
                  <>
                    <div className="text-sm font-semibold text-slate-900">2) Profissional</div>
                    <select
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                      value={funcionarioId}
                      onChange={(e) => setFuncionarioId(e.target.value)}
                    >
                      {funcionarios.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome_completo}
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}

                <div className="text-sm font-semibold text-slate-900">{funcionarios.length > 0 ? '3' : '2'}) Data</div>
                <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />

                <div className="text-sm font-semibold text-slate-900">{funcionarios.length > 0 ? '4' : '3'}) Horário</div>
                {slotsLoading ? (
                  <div className="text-sm text-slate-600">Calculando horários…</div>
                ) : availableSlots.length === 0 ? (
                  <div className="text-sm text-slate-600">Sem horários disponíveis.</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableSlots.map((t) => {
                      const selected = hora === t
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setHora(t)}
                          className={[
                            'rounded-lg px-3 py-2 text-sm font-medium border',
                            selected ? '' : 'bg-white text-slate-700 border-slate-200',
                          ].join(' ')}
                          style={
                            selected
                              ? { backgroundColor: primaryColor, borderColor: primaryColor, color: '#fff' }
                              : { backgroundColor: '#fff' }
                          }
                        >
                          {t}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </Card>
          ) : null}

          {usuario ? (
            <Card>
              <div className="p-6 space-y-4">
                <div className="text-sm font-semibold text-slate-900">Seus dados</div>
                <Input label="Nome" value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} />
                <Input label="Telefone" value={clienteTelefone} onChange={(e) => setClienteTelefone(e.target.value)} />
                <div className="flex justify-end">
                  <Button onClick={submit} disabled={!canSubmit || submitting} style={{ backgroundColor: primaryColor, borderColor: primaryColor }}>
                    Confirmar agendamento
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
