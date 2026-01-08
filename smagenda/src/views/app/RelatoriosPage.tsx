import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { PageTutorial, TutorialOverlay } from '../../components/ui/TutorialOverlay'
import { formatBRMoney, parseTimeToMinutes, toISODate } from '../../lib/dates'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

type AgendamentoRow = {
  id: string
  data: string
  hora_inicio: string
  status: string
  cliente_telefone: string | null
  servico: { id: string; nome: string; preco: number | null } | null
  funcionario: { id: string; nome_completo: string } | null
}

type ExportAgendamentoRow = {
  data: string
  hora_inicio: string
  hora_fim: string | null
  status: string
  cliente_nome: string | null
  cliente_telefone: string | null
  servico: { nome: string; preco: number | null } | null
  funcionario: { nome_completo: string } | null
}

function startOfMonth(d: Date) {
  const x = new Date(d)
  x.setDate(1)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfMonth(d: Date) {
  const x = new Date(d)
  x.setMonth(x.getMonth() + 1)
  x.setDate(0)
  x.setHours(0, 0, 0, 0)
  return x
}

function toCsv(rows: Array<Record<string, string | number | null | undefined>>) {
  const headers = Array.from(
    rows.reduce((set, r) => {
      for (const k of Object.keys(r)) set.add(k)
      return set
    }, new Set<string>())
  )
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    if (/[\n\r",;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.map(escape).join(';')]
  for (const r of rows) {
    lines.push(headers.map((h) => escape(r[h])).join(';'))
  }
  return `\ufeff${lines.join('\n')}`
}

export function RelatoriosPage() {
  const { appPrincipal } = useAuth()
  const usuario = appPrincipal?.kind === 'usuario' ? appPrincipal.profile : null
  const usuarioId = usuario?.id ?? null
  const navigate = useNavigate()

  const tutorialSteps = useMemo(
    () =>
      [
        {
          title: 'Escolha o período',
          body: 'Defina início e fim para calcular métricas e exportar apenas o que interessa.',
          target: 'filters' as const,
        },
        {
          title: 'Atualize e exporte',
          body: 'Clique em “Atualizar” para recarregar e use “Exportar CSV” para baixar seus dados reais.',
          target: 'filters' as const,
        },
        {
          title: 'Leia as métricas',
          body: 'No-show, receita prevista/realizada e novos vs recorrentes ajudam a tomar decisões.',
          target: 'cards' as const,
        },
      ] as const,
    []
  )

  const canUseRelatorios = useMemo(() => {
    const p = String(usuario?.plano ?? '').trim().toLowerCase()
    return p === 'pro' || p === 'team' || p === 'enterprise'
  }, [usuario?.plano])

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const [start, setStart] = useState(() => toISODate(startOfMonth(today)))
  const [end, setEnd] = useState(() => toISODate(endOfMonth(today)))

  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agendamentos, setAgendamentos] = useState<AgendamentoRow[]>([])
  const [allUntilEnd, setAllUntilEnd] = useState<AgendamentoRow[]>([])

  const load = useCallback(async () => {
    if (!usuarioId) return
    setLoading(true)
    setError(null)

    const baseSelect = 'id,data,hora_inicio,status,cliente_telefone,servico:servico_id(id,nome,preco),funcionario:funcionario_id(id,nome_completo)'

    const { data: periodData, error: periodErr } = await supabase
      .from('agendamentos')
      .select(baseSelect)
      .eq('usuario_id', usuarioId)
      .gte('data', start)
      .lte('data', end)
      .order('data', { ascending: true })
      .order('hora_inicio', { ascending: true })
      .limit(10000)

    if (periodErr) {
      setError(periodErr.message)
      setLoading(false)
      return
    }

    const { data: untilEndData, error: untilEndErr } = await supabase
      .from('agendamentos')
      .select(baseSelect)
      .eq('usuario_id', usuarioId)
      .lte('data', end)
      .order('data', { ascending: true })
      .order('hora_inicio', { ascending: true })
      .limit(15000)

    if (untilEndErr) {
      setError(untilEndErr.message)
      setLoading(false)
      return
    }

    setAgendamentos((periodData ?? []) as unknown as AgendamentoRow[])
    setAllUntilEnd((untilEndData ?? []) as unknown as AgendamentoRow[])
    setLoading(false)
  }, [end, start, usuarioId])

  useEffect(() => {
    if (!canUseRelatorios) return
    void (async () => {
      await Promise.resolve()
      await load()
    })().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar relatórios')
      setLoading(false)
    })
  }, [canUseRelatorios, load])

  const metrics = useMemo(() => {
    const isCancelado = (s: string) => s.trim().toLowerCase() === 'cancelado'
    const isNoShow = (s: string) => {
      const x = s.trim().toLowerCase()
      return x === 'nao_compareceu' || x === 'não_compareceu' || x === 'no_show'
    }
    const isConcluido = (s: string) => {
      const x = s.trim().toLowerCase()
      return x === 'concluido' || x === 'concluído'
    }

    const valid = agendamentos.filter((a) => !isCancelado(a.status))
    const total = valid.length
    const noShows = valid.filter((a) => isNoShow(a.status)).length
    const concluidos = valid.filter((a) => isConcluido(a.status)).length
    const noShowRate = total > 0 ? (noShows / total) * 100 : 0

    const prevista = valid.reduce((sum, a) => sum + (a.servico?.preco ? Number(a.servico.preco) : 0), 0)
    const realizada = valid
      .filter((a) => isConcluido(a.status))
      .reduce((sum, a) => sum + (a.servico?.preco ? Number(a.servico.preco) : 0), 0)

    const byService = new Map<string, { nome: string; count: number }>()
    for (const a of valid) {
      if (!a.servico?.id) continue
      const prev = byService.get(a.servico.id)
      byService.set(a.servico.id, { nome: a.servico.nome, count: (prev?.count ?? 0) + 1 })
    }
    const topServices = Array.from(byService.values())
      .sort((x, y) => y.count - x.count)
      .slice(0, 5)

    const byHour = new Map<string, number>()
    for (const a of valid) {
      const h = (a.hora_inicio ?? '').slice(0, 2)
      if (!h) continue
      byHour.set(h, (byHour.get(h) ?? 0) + 1)
    }
    const peakHours = Array.from(byHour.entries())
      .map(([hh, count]) => ({ hh, count }))
      .sort((x, y) => y.count - x.count)
      .slice(0, 5)

    const firstSeenByPhone = new Map<string, string>()
    for (const a of allUntilEnd) {
      const telefone = (a.cliente_telefone ?? '').trim()
      if (!telefone) continue
      if (!firstSeenByPhone.has(telefone)) firstSeenByPhone.set(telefone, a.data)
    }
    const phonesInPeriod = new Set<string>()
    for (const a of agendamentos) {
      const telefone = (a.cliente_telefone ?? '').trim()
      if (!telefone) continue
      if (isCancelado(a.status)) continue
      phonesInPeriod.add(telefone)
    }
    let novos = 0
    let recorrentes = 0
    for (const telefone of phonesInPeriod) {
      const first = firstSeenByPhone.get(telefone) ?? null
      if (!first) continue
      if (first >= start) novos += 1
      else recorrentes += 1
    }

    return { total, concluidos, noShows, noShowRate, prevista, realizada, topServices, peakHours, novos, recorrentes }
  }, [agendamentos, allUntilEnd, start])

  const byFuncionario = useMemo(() => {
    const isCancelado = (s: string) => s.trim().toLowerCase() === 'cancelado'
    const isNoShow = (s: string) => {
      const x = s.trim().toLowerCase()
      return x === 'nao_compareceu' || x === 'não_compareceu' || x === 'no_show'
    }
    const isConcluido = (s: string) => {
      const x = s.trim().toLowerCase()
      return x === 'concluido' || x === 'concluído'
    }

    const map = new Map<
      string,
      {
        id: string
        nome: string
        total: number
        concluidos: number
        noShows: number
        prevista: number
        realizada: number
      }
    >()

    for (const a of agendamentos) {
      if (isCancelado(a.status)) continue
      const id = a.funcionario?.id ?? 'geral'
      const nome = a.funcionario?.nome_completo ?? 'Geral'
      const prev = map.get(id)
      const next = prev
        ? { ...prev }
        : {
            id,
            nome,
            total: 0,
            concluidos: 0,
            noShows: 0,
            prevista: 0,
            realizada: 0,
          }

      next.total += 1
      if (isConcluido(a.status)) next.concluidos += 1
      if (isNoShow(a.status)) next.noShows += 1

      const preco = a.servico?.preco ? Number(a.servico.preco) : 0
      next.prevista += preco
      if (isConcluido(a.status)) next.realizada += preco

      map.set(id, next)
    }

    return Array.from(map.values()).sort((x, y) => y.total - x.total)
  }, [agendamentos])

  const exportCsv = async () => {
    if (!usuarioId) return
    setExporting(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('agendamentos')
      .select(
        'data,hora_inicio,hora_fim,status,cliente_nome,cliente_telefone,servico:servico_id(nome,preco),funcionario:funcionario_id(nome_completo)'
      )
      .eq('usuario_id', usuarioId)
      .gte('data', start)
      .lte('data', end)
      .order('data', { ascending: true })
      .order('hora_inicio', { ascending: true })
      .limit(20000)

    if (err) {
      setError(err.message)
      setExporting(false)
      return
    }

    const exportData = (data ?? []) as unknown as ExportAgendamentoRow[]
    const rows = exportData.map((a) => ({
      Data: a.data,
      Inicio: a.hora_inicio,
      Fim: a.hora_fim,
      Cliente: a.cliente_nome,
      Telefone: a.cliente_telefone,
      Servico: a.servico?.nome ?? '',
      Preco: a.servico?.preco ?? '',
      Profissional: a.funcionario?.nome_completo ?? 'Geral',
      Status: a.status,
    }))

    const content = toCsv(rows)
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agenda_${start}_a_${end}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)

    setExporting(false)
  }

  const sortedByHour = useMemo(() => {
    return agendamentos
      .slice()
      .filter((a) => a.status !== 'cancelado')
      .sort((x, y) => parseTimeToMinutes(x.hora_inicio) - parseTimeToMinutes(y.hora_inicio))
  }, [agendamentos])

  if (!usuario) {
    return (
      <AppShell>
        <div className="text-slate-700">Acesso restrito.</div>
      </AppShell>
    )
  }

  if (!canUseRelatorios) {
    return (
      <AppShell>
        <Card>
          <div className="p-6 space-y-3">
            <div className="text-sm font-semibold text-slate-900">Relatórios</div>
            <div className="text-sm text-slate-600">Disponível apenas nos planos PRO e EMPRESA.</div>
            <div className="flex justify-end">
              <Button onClick={() => navigate('/pagamento')}>Ver planos</Button>
            </div>
          </div>
        </Card>
      </AppShell>
    )
  }

  return (
    <PageTutorial usuarioId={usuarioId} page="relatorios">
      {({ tutorialOpen, tutorialStep, setTutorialStep, resetTutorial, closeTutorial }) => (
        <AppShell>
          <div className="space-y-6">
            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

            <Card>
              <div
                className={
                  tutorialOpen && tutorialSteps[tutorialStep]?.target === 'filters'
                    ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
                    : ''
                }
              >
                <div className="p-6 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Relatórios</div>
                      <div className="text-xs text-slate-600">Métricas baseadas nos seus agendamentos.</div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={resetTutorial}>
                        Rever tutorial
                      </Button>
                      <Button variant="secondary" onClick={exportCsv} disabled={loading || exporting}>
                        {exporting ? 'Exportando…' : 'Exportar CSV'}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Input label="Início" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                    <Input label="Fim" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
                    <div className="flex items-end">
                      <Button variant="secondary" onClick={load} disabled={loading}>
                        Atualizar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {!loading && agendamentos.length === 0 ? (
              <Card>
                <div className="p-6 space-y-3">
                  <div className="text-sm font-semibold text-slate-900">Sem dados no período</div>
                  <div className="text-sm text-slate-600">Crie agendamentos na agenda para ver métricas e exportar.</div>
                  <div>
                    <Button variant="secondary" onClick={() => navigate('/dashboard')}>
                      Ir para Agenda
                    </Button>
                  </div>
                </div>
              </Card>
            ) : null}

            <div
              className={
                tutorialOpen && tutorialSteps[tutorialStep]?.target === 'cards'
                  ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
                  : ''
              }
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Card>
                  <div className="p-6 space-y-1">
                    <div className="text-xs font-semibold text-slate-500">Taxa de no-show</div>
                    <div className="text-2xl font-semibold text-slate-900">{metrics.noShowRate.toFixed(1)}%</div>
                    <div className="text-sm text-slate-600">
                      {metrics.noShows} no-show • {metrics.total} agendamentos
                    </div>
                  </div>
                </Card>
                <Card>
                  <div className="p-6 space-y-1">
                    <div className="text-xs font-semibold text-slate-500">Receita prevista</div>
                    <div className="text-2xl font-semibold text-slate-900">{formatBRMoney(metrics.prevista)}</div>
                    <div className="text-sm text-slate-600">Realizada: {formatBRMoney(metrics.realizada)}</div>
                  </div>
                </Card>
                <Card>
                  <div className="p-6 space-y-1">
                    <div className="text-xs font-semibold text-slate-500">Novos vs recorrentes</div>
                    <div className="flex items-center gap-2">
                      <Badge tone="green">Novos {metrics.novos}</Badge>
                      <Badge tone="slate">Recorrentes {metrics.recorrentes}</Badge>
                    </div>
                    <div className="text-sm text-slate-600">Até {new Date(end).toLocaleDateString('pt-BR')}</div>
                  </div>
                </Card>
              </div>
            </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <div className="p-6 space-y-3">
              <div className="text-sm font-semibold text-slate-900">Serviços mais agendados</div>
              {loading ? (
                <div className="text-sm text-slate-600">Carregando…</div>
              ) : metrics.topServices.length === 0 ? (
                <div className="text-sm text-slate-600">Sem dados no período.</div>
              ) : (
                <div className="space-y-2">
                  {metrics.topServices.map((s) => (
                    <div key={s.nome} className="flex items-center justify-between">
                      <div className="text-sm text-slate-700">{s.nome}</div>
                      <Badge tone="slate">{s.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
          <Card>
            <div className="p-6 space-y-3">
              <div className="text-sm font-semibold text-slate-900">Horários de pico</div>
              {loading ? (
                <div className="text-sm text-slate-600">Carregando…</div>
              ) : metrics.peakHours.length === 0 ? (
                <div className="text-sm text-slate-600">Sem dados no período.</div>
              ) : (
                <div className="space-y-2">
                  {metrics.peakHours.map((h) => (
                    <div key={h.hh} className="flex items-center justify-between">
                      <div className="text-sm text-slate-700">{h.hh}:00</div>
                      <Badge tone="slate">{h.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        <Card>
          <div className="p-6 space-y-3">
            <div className="text-sm font-semibold text-slate-900">Por profissional</div>
            {loading ? (
              <div className="text-sm text-slate-600">Carregando…</div>
            ) : byFuncionario.length === 0 ? (
              <div className="text-sm text-slate-600">Sem dados no período.</div>
            ) : (
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                {byFuncionario.map((f) => (
                  <div key={f.id} className="p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{f.nome}</div>
                      <div className="text-xs text-slate-600">
                        {f.concluidos} concluídos • {f.noShows} no-show
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                      <Badge tone="slate">{f.total} agendamentos</Badge>
                      <Badge tone="slate">Prevista {formatBRMoney(f.prevista)}</Badge>
                      <Badge tone="green">Realizada {formatBRMoney(f.realizada)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-6 space-y-3">
            <div className="text-sm font-semibold text-slate-900">Agendamentos do período</div>
            {loading ? (
              <div className="text-sm text-slate-600">Carregando…</div>
            ) : sortedByHour.length === 0 ? (
              <div className="text-sm text-slate-600">Sem agendamentos.</div>
            ) : (
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                {sortedByHour.slice(0, 80).map((a) => {
                  const status = a.status?.trim() ?? ''
                  const lower = status.toLowerCase()
                  const tone: 'slate' | 'green' | 'yellow' | 'red' =
                    lower === 'cancelado' ? 'red' : lower === 'pendente' ? 'yellow' : lower === 'nao_compareceu' ? 'red' : 'green'
                  return (
                    <div key={a.id} className="p-3 flex items-start justify-between gap-3">
                      <div className="text-sm text-slate-700">
                        <div className="font-semibold text-slate-900">
                          {new Date(a.data).toLocaleDateString('pt-BR')} • {a.hora_inicio} • {a.servico?.nome ?? 'Serviço'}
                        </div>
                        <div className="text-slate-600">{a.funcionario?.nome_completo ?? 'Geral'}</div>
                      </div>
                      <Badge tone={tone}>{status || 'Status'}</Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Card>
          </div>

          <TutorialOverlay
            open={tutorialOpen}
            steps={tutorialSteps}
            step={tutorialStep}
            onStepChange={setTutorialStep}
            onClose={closeTutorial}
            titleFallback="Relatórios"
          />
        </AppShell>
      )}
    </PageTutorial>
  )
}
