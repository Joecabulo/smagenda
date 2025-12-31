import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
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
  public_use_background_image: boolean | null
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

function normalizePhone(value: string) {
  return value.replace(/[^0-9+]/g, '').trim()
}

function monthLabel(d: Date) {
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

function addDays(d: Date, days: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
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

type ModalStep = 'hora' | 'servico' | 'profissional' | 'confirmar'

export function PublicBookingPage() {
  const { slug } = useParams()

  const [usuario, setUsuario] = useState<UsuarioPublico | null>(null)
  const [servicos, setServicos] = useState<Servico[]>([])
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [servicoId, setServicoId] = useState('')
  const [funcionarioId, setFuncionarioId] = useState('')
  const [data, setData] = useState(() => toIsoDateLocal(new Date()))
  const [hora, setHora] = useState('')
  const [clienteNome, setClienteNome] = useState('')
  const [clienteTelefone, setClienteTelefone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [successId, setSuccessId] = useState<string | null>(null)
  const [logoFailed, setLogoFailed] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalStep, setModalStep] = useState<ModalStep>('hora')

  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
  })

  const hasStaff = useMemo(() => funcionarios.length > 0, [funcionarios.length])

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

  const maxDays = 60
  const minLeadMinutes = 120

  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const maxDate = useMemo(() => addDays(today, maxDays), [maxDays, today])

  const allowedWeekdays = useMemo(() => {
    const base = usuario?.dias_trabalho ?? null
    if (!base || base.length === 0) return null
    return new Set(base)
  }, [usuario?.dias_trabalho])

  const calendarDays = useMemo(() => {
    const first = new Date(monthCursor)
    first.setDate(1)
    first.setHours(0, 0, 0, 0)
    const startOffset = first.getDay()
    const start = new Date(first)
    start.setDate(first.getDate() - startOffset)
    const days: Date[] = []
    for (let i = 0; i < 42; i += 1) {
      days.push(addDays(start, i))
    }
    return { first, days }
  }, [monthCursor])

  const isDayDisabled = (d: Date) => {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    if (x < today) return true
    if (x > maxDate) return true
    if (allowedWeekdays && !allowedWeekdays.has(x.getDay())) return true
    return false
  }

  useEffect(() => {
    const run = async () => {
      if (!usuarioId || !selectedServico || !data) {
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

      type SlotRow = { hora_inicio: string }

      const { data: slotsData, error: slotsErr } = await supabase.rpc('public_get_slots_publicos', {
        p_usuario_id: usuarioId,
        p_data: data,
        p_servico_id: selectedServico.id,
        p_funcionario_id: hasStaff ? funcionarioId : null,
      })
      if (slotsErr) {
        const msg = slotsErr.message
        const lower = msg.toLowerCase()
        const missingFn = lower.includes('public_get_slots_publicos') && (lower.includes('function') || lower.includes('rpc'))
        if (missingFn) {
          setError('Configuração do Supabase incompleta: atualize o SQL do link público (listar + agendar).')
        } else if (lower.includes('data_passada')) {
          setError('Selecione uma data futura.')
        } else if (lower.includes('data_muito_futura')) {
          setError(`Selecione uma data dentro de ${maxDays} dias.`)
        } else if (lower.includes('fora_do_dia_de_trabalho')) {
          setError('Esse dia não está disponível para agendamento.')
        } else if (lower.includes('horarios_nao_configurados')) {
          setError('Horários de trabalho não configurados.')
        } else {
          setError(msg)
        }
        setSlotsLoading(false)
        return
      }

      const list = ((slotsData ?? []) as unknown as SlotRow[]).map((r) => String(r.hora_inicio ?? '').trim()).filter(Boolean)
      setAvailableSlots(list)
      setSlotsLoading(false)
    }
    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao calcular horários')
      setSlotsLoading(false)
    })
  }, [data, funcionarioId, hasStaff, maxDays, selectedServico, usuarioId])

  const submit = async () => {
    if (!usuarioId || !selectedServico || !hora || !clienteNome.trim() || !clienteTelefone.trim()) return
    setSubmitting(true)
    setError(null)
    setSuccessId(null)

    const telefone = normalizePhone(clienteTelefone)
    if (telefone.length < 8) {
      setError('Telefone inválido.')
      setSubmitting(false)
      return
    }

    const { data: createdId, error: err } = await supabase.rpc('public_create_agendamento_publico', {
      p_usuario_id: usuarioId,
      p_data: data,
      p_hora_inicio: hora,
      p_servico_id: selectedServico.id,
      p_cliente_nome: clienteNome.trim(),
      p_cliente_telefone: telefone,
      p_funcionario_id: hasStaff ? funcionarioId : null,
    })
    if (err) {
      const msg = err.message
      const lower = msg.toLowerCase()
      const missingFn = lower.includes('public_create_agendamento_publico') && (lower.includes('function') || lower.includes('rpc'))
      if (missingFn) {
        setError('Configuração do Supabase incompleta: crie o SQL do link público (listar + agendar).')
      } else if (lower.includes('data_passada')) {
        setError('Selecione uma data futura.')
      } else if (lower.includes('data_muito_futura')) {
        setError(`Selecione uma data dentro de ${maxDays} dias.`)
      } else if (lower.includes('antecedencia_minima')) {
        setError(`Selecione um horário com no mínimo ${Math.round(minLeadMinutes / 60)}h de antecedência.`)
      } else if (lower.includes('ocupado')) {
        setError('Esse horário acabou de ser ocupado. Selecione outro horário.')
      } else if (lower.includes('limite_mensal_atingido')) {
        setError('Este estabelecimento atingiu o limite de agendamentos do mês. Tente novamente no próximo mês.')
      } else {
        setError(msg)
      }
      setSubmitting(false)
      return
    }
    setSuccessId(createdId ? String(createdId) : 'ok')
    setSubmitting(false)
    setModalOpen(false)
    setModalStep('hora')
  }

  const canSubmit = Boolean(usuarioId && selectedServico && hora && clienteNome.trim() && clienteTelefone.trim() && (!hasStaff || funcionarioId))

  const closeModal = () => {
    setModalOpen(false)
    setModalStep('hora')
    setClienteNome('')
    setClienteTelefone('')
    setHora('')
    setError(null)
  }

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
              <div className="p-6 space-y-2">
                {usuario.logo_url && !logoFailed ? (
                  <div className="flex justify-center">
                    <img
                      src={usuario.logo_url}
                      alt={usuario.nome_negocio}
                      className="h-24 w-auto max-w-full rounded-2xl object-contain border border-slate-200"
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
                <div className="text-sm font-semibold text-slate-900">Escolha o dia</div>

                <div className="rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const prev = new Date(monthCursor)
                        prev.setMonth(prev.getMonth() - 1)
                        prev.setDate(1)
                        prev.setHours(0, 0, 0, 0)
                        setMonthCursor(prev)
                      }}
                    >
                      ‹
                    </Button>
                    <div className="text-sm font-semibold text-slate-900">{monthLabel(monthCursor)}</div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const next = new Date(monthCursor)
                        next.setMonth(next.getMonth() + 1)
                        next.setDate(1)
                        next.setHours(0, 0, 0, 0)
                        setMonthCursor(next)
                      }}
                    >
                      ›
                    </Button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 p-2 text-xs text-slate-600">
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((w) => (
                      <div key={w} className="text-center py-1">
                        {w}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1 px-2 pb-2">
                    {calendarDays.days.map((dObj) => {
                      const inMonth = dObj.getMonth() === calendarDays.first.getMonth()
                      const disabled = isDayDisabled(dObj)
                      const iso = toIsoDateLocal(dObj)
                      return (
                        <button
                          key={iso}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            setError(null)
                            setSuccessId(null)
                            setHora('')
                            setData(iso)
                            setModalOpen(true)
                            setModalStep('hora')
                          }}
                          className={[
                            'h-10 rounded-lg border text-sm font-medium',
                            disabled
                              ? 'opacity-40 cursor-not-allowed bg-white border-slate-200 text-slate-500'
                              : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50',
                          ].join(' ')}
                          style={data === iso && !disabled ? { backgroundColor: primaryColor, borderColor: primaryColor, color: '#fff' } : undefined}
                        >
                          <span className={inMonth ? '' : 'text-slate-400'}>{dObj.getDate()}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="text-xs text-slate-600">
                  Janela de agendamento: hoje até {maxDays} dias. Antecedência mínima: {Math.round(minLeadMinutes / 60)}h.
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </div>

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

                {modalStep === 'hora' ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">1) Horário</div>
                      <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => setModalStep('servico')}>
                          Serviço
                        </Button>
                        {hasStaff ? (
                          <Button variant="secondary" onClick={() => setModalStep('profissional')}>
                            Profissional
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {!selectedServico ? (
                      <div className="text-sm text-slate-600">Sem serviços disponíveis.</div>
                    ) : hasStaff && !selectedFuncionario ? (
                      <div className="text-sm text-slate-600">Selecione um profissional.</div>
                    ) : slotsLoading ? (
                      <div className="text-sm text-slate-600">Buscando horários…</div>
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
                              className={['rounded-lg px-3 py-2 text-sm font-medium border', selected ? '' : 'bg-white text-slate-700 border-slate-200'].join(
                                ' '
                              )}
                              style={selected ? { backgroundColor: primaryColor, borderColor: primaryColor, color: '#fff' } : { backgroundColor: '#fff' }}
                            >
                              {t}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button
                        onClick={() => setModalStep('servico')}
                        disabled={!hora}
                        style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                      >
                        Avançar
                      </Button>
                    </div>
                  </div>
                ) : null}

                {modalStep === 'servico' ? (
                  <div className="space-y-4">
                    <div className="text-sm font-semibold text-slate-900">2) Serviço</div>
                    {servicos.length === 0 ? (
                      <div className="text-sm text-slate-600">Sem serviços disponíveis.</div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {servicos.map((s) => {
                          const selected = servicoId === s.id
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setError(null)
                                setSuccessId(null)
                                setHora('')
                                setServicoId(s.id)
                                setModalStep('hora')
                              }}
                              className={[
                                'rounded-xl border p-3 text-left',
                                selected ? 'text-white' : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50',
                              ].join(' ')}
                              style={selected ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold truncate">{s.nome}</div>
                                  <div className={selected ? 'text-xs text-white/90' : 'text-xs text-slate-600'}>{s.duracao_minutos} min</div>
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}

                    <div className="flex justify-between">
                      <Button variant="secondary" onClick={() => setModalStep('hora')}>
                        Voltar
                      </Button>
                      <Button
                        onClick={() => setModalStep(hasStaff ? 'profissional' : 'confirmar')}
                        disabled={!hora || !selectedServico}
                        style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                      >
                        Avançar
                      </Button>
                    </div>
                  </div>
                ) : null}

                {modalStep === 'profissional' ? (
                  <div className="space-y-4">
                    <div className="text-sm font-semibold text-slate-900">3) Profissional</div>
                    {funcionarios.length === 0 ? (
                      <div className="text-sm text-slate-600">Sem profissionais disponíveis.</div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
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
                                setModalStep('hora')
                              }}
                              className={[
                                'rounded-xl border p-3 text-left',
                                selected ? 'text-white' : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50',
                              ].join(' ')}
                              style={selected ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
                            >
                              <div className="text-sm font-semibold">{f.nome_completo}</div>
                            </button>
                          )
                        })}
                      </div>
                    )}

                    <div className="flex justify-between">
                      <Button variant="secondary" onClick={() => setModalStep('servico')}>
                        Voltar
                      </Button>
                      <Button
                        onClick={() => setModalStep('confirmar')}
                        disabled={!hora || (hasStaff && !funcionarioId)}
                        style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                      >
                        Avançar
                      </Button>
                    </div>
                  </div>
                ) : null}

                {modalStep === 'confirmar' ? (
                  <div className="space-y-4">
                    <div className="text-sm font-semibold text-slate-900">{hasStaff ? '4' : '3'}) Confirmação</div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <div className="flex items-center justify-between gap-2">
                        <div>Dia</div>
                        <div className="font-semibold">{formatIsoDateBR(data)}</div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div>Hora</div>
                        <div className="font-semibold">{hora || '—'}</div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div>Serviço</div>
                        <div className="font-semibold">{selectedServico?.nome ?? '—'}</div>
                      </div>
                      {hasStaff ? (
                        <div className="flex items-center justify-between gap-2">
                          <div>Profissional</div>
                          <div className="font-semibold">{selectedFuncionario?.nome_completo ?? '—'}</div>
                        </div>
                      ) : null}
                    </div>

                    <Input label="Nome" value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} />
                    <Input label="WhatsApp" value={clienteTelefone} onChange={(e) => setClienteTelefone(e.target.value)} />

                    <div className="flex justify-between">
                      <Button variant="secondary" onClick={() => setModalStep(hasStaff ? 'profissional' : 'servico')}>
                        Voltar
                      </Button>
                      <Button onClick={submit} disabled={!canSubmit || submitting} style={{ backgroundColor: primaryColor, borderColor: primaryColor }}>
                        Confirmar
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  )
}
