import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { PageTutorial, TutorialOverlay } from '../../components/ui/TutorialOverlay'
import { formatBRMoney, parseTimeToMinutes } from '../../lib/dates'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

type Agendamento = {
  id: string
  cliente_nome: string | null
  cliente_telefone: string | null
  extras: Record<string, unknown> | null
  data: string
  hora_inicio: string
  hora_fim: string | null
  status: string
  servico: { id: string; nome: string; preco: number; cor: string | null } | null
}

function readExtrasText(extras: unknown, key: string) {
  if (!extras || typeof extras !== 'object') return ''
  const v = (extras as Record<string, unknown>)[key]
  if (typeof v !== 'string') return ''
  const t = v.trim()
  return t ? t : ''
}

function normalizeEmail(value: string) {
  const v = String(value ?? '').trim().toLowerCase()
  if (!v) return ''
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  return ok ? v : ''
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

export function ClienteDetalhesPage() {
  const { appPrincipal, masterUsuario, masterUsuarioLoading } = useAuth()
  const funcionario = appPrincipal?.kind === 'funcionario' ? appPrincipal.profile : null
  const isGerente = appPrincipal?.kind === 'funcionario' && appPrincipal.profile.permissao === 'admin'
  const usuario = appPrincipal?.kind === 'usuario' ? appPrincipal.profile : isGerente ? masterUsuario : null
  const usuarioId = usuario?.id ?? null
  const navigate = useNavigate()

  const tutorialSteps = useMemo(
    () =>
      [
        {
          title: 'Resumo do cliente',
          body: 'Aqui você vê o total de agendamentos, no-show e o último atendimento do cliente.',
          target: 'header' as const,
        },
        {
          title: 'Detalhes rápidos',
          body: 'O cartão mostra cancelados e o valor previsto do histórico (com base nos serviços).',
          target: 'summary' as const,
        },
        {
          title: 'Histórico',
          body: 'A lista abaixo traz todos os agendamentos do cliente, com serviço e status.',
          target: 'list' as const,
        },
      ] as const,
    []
  )

  const params = useParams()
  const telefone = useMemo(() => {
    try {
      return decodeURIComponent(params.telefone ?? '').trim()
    } catch {
      return (params.telefone ?? '').trim()
    }
  }, [params.telefone])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])

  const [deleting, setDeleting] = useState(false)

  const [editAgendamentoId, setEditAgendamentoId] = useState<string | null>(null)
  const [editEndereco, setEditEndereco] = useState('')
  const [editPlaca, setEditPlaca] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!usuarioId) {
      setLoading(false)
      return
    }
    if (!telefone) {
      setError('Telefone inválido')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('agendamentos')
      .select('id,cliente_nome,cliente_telefone,extras,data,hora_inicio,hora_fim,status,servico:servico_id(id,nome,preco,cor)')
      .eq('usuario_id', usuarioId)
      .eq('cliente_telefone', telefone)
      .order('data', { ascending: false })
      .order('hora_inicio', { ascending: false })
      .limit(2000)

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setAgendamentos((data ?? []) as unknown as Agendamento[])
    setLoading(false)
  }, [telefone, usuarioId])

  const ocultarCliente = async () => {
    if (!usuarioId) return
    if (!telefone) return
    setError(null)
    const ok = window.confirm(
      'Ocultar cliente? Isso vai remover o telefone dos agendamentos desse número, e ele não aparecerá mais na lista de clientes.'
    )
    if (!ok) return

    setDeleting(true)
    const { error: updErr } = await supabase
      .from('agendamentos')
      .update({ cliente_telefone: '', cliente_nome: 'Cliente oculto' })
      .eq('usuario_id', usuarioId)
      .eq('cliente_telefone', telefone)

    if (updErr) {
      setError(updErr.message)
      setDeleting(false)
      return
    }

    setDeleting(false)
    navigate('/clientes')
  }

  useEffect(() => {
    void (async () => {
      await Promise.resolve()
      await load()
    })().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar histórico')
      setLoading(false)
    })
  }, [load])

  const openEditExtras = (ag: Agendamento) => {
    setEditAgendamentoId(ag.id)
    setEditEndereco(readExtrasText(ag.extras, 'endereco'))
    setEditPlaca(readExtrasText(ag.extras, 'placa'))
    setEditEmail(readExtrasText(ag.extras, 'email'))
    setEditError(null)
  }

  const closeEditExtras = () => {
    setEditAgendamentoId(null)
    setEditEndereco('')
    setEditPlaca('')
    setEditEmail('')
    setEditError(null)
  }

  const saveEditExtras = async () => {
    if (!usuarioId || !editAgendamentoId) return
    setEditSaving(true)
    setEditError(null)

    const target = agendamentos.find((a) => a.id === editAgendamentoId) ?? null
    if (!target) {
      setEditSaving(false)
      closeEditExtras()
      return
    }

    const endereco = editEndereco.trim()
    const placa = editPlaca.trim().replace(/[^a-zA-Z0-9-]/g, '').toUpperCase()
    const email = normalizeEmail(editEmail)
    if (editEmail.trim() && !email) {
      setEditError('Email inválido.')
      setEditSaving(false)
      return
    }

    const base = target.extras && typeof target.extras === 'object' && !Array.isArray(target.extras) ? { ...(target.extras as Record<string, unknown>) } : {}
    if (endereco) base.endereco = endereco
    else delete base.endereco
    if (placa) base.placa = placa
    else delete base.placa
    if (email) base.email = email
    else delete base.email

    const extrasFinal = Object.keys(base).length > 0 ? base : null

    const { error: updErr } = await supabase.from('agendamentos').update({ extras: extrasFinal }).eq('id', editAgendamentoId).eq('usuario_id', usuarioId)
    if (updErr) {
      setEditError(updErr.message)
      setEditSaving(false)
      return
    }

    setAgendamentos((prev) => prev.map((a) => (a.id === editAgendamentoId ? { ...a, extras: extrasFinal as Record<string, unknown> | null } : a)))
    setEditSaving(false)
    closeEditExtras()
  }

  const resumo = useMemo(() => {
    const total = agendamentos.filter((a) => a.status !== 'cancelado').length
    const cancelados = agendamentos.filter((a) => a.status === 'cancelado').length
    const noShows = agendamentos.filter((a) => {
      const s = (a.status ?? '').toLowerCase()
      return s === 'nao_compareceu' || s === 'não_compareceu' || s === 'no_show'
    }).length
    const nome = agendamentos.find((a) => (a.cliente_nome ?? '').trim())?.cliente_nome?.trim() ?? 'Cliente'
    const nomes = Array.from(
      new Set(
        agendamentos
          .map((a) => (a.cliente_nome ?? '').trim())
          .filter(Boolean)
          .map((n) => n.toLowerCase())
      )
    )
      .map((lower) => agendamentos.find((a) => (a.cliente_nome ?? '').trim().toLowerCase() === lower)?.cliente_nome?.trim() ?? lower)
      .filter(Boolean)
    const ultimoDia = agendamentos[0]?.data ?? null
    const totalPrevisto = agendamentos
      .filter((a) => a.status !== 'cancelado')
      .reduce((sum, a) => sum + (a.servico?.preco ? Number(a.servico.preco) : 0), 0)
    return { total, cancelados, noShows, nome, nomes, ultimoDia, totalPrevisto }
  }, [agendamentos])

  if (!usuario) {
    return (
      <AppShell>
        <div className="text-slate-700">{isGerente && masterUsuarioLoading ? 'Carregando…' : 'Acesso restrito.'}</div>
      </AppShell>
    )
  }

  if (funcionario && !funcionario.pode_ver_clientes_de_outros) {
    return (
      <AppShell>
        <div className="text-slate-700">Acesso restrito.</div>
      </AppShell>
    )
  }

  return (
    <PageTutorial usuarioId={usuarioId} page="cliente_detalhes">
      {({ tutorialOpen, tutorialStep, setTutorialStep, resetTutorial, closeTutorial }) => (
        <AppShell>
          <div className="space-y-6">
            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

            <div
              className={
                tutorialOpen && tutorialSteps[tutorialStep]?.target === 'header'
                  ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl p-2 -m-2'
                  : ''
              }
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-slate-600">
                    <Link to="/clientes" className="hover:underline">
                      Clientes
                    </Link>
                    <span className="text-slate-400"> / </span>
                    <span className="text-slate-700">{telefone || 'Detalhes'}</span>
                  </div>
                  <div className="text-lg font-semibold text-slate-900">{resumo.nome}</div>
                  <div className="text-sm text-slate-600">📱 {telefone}</div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button variant="secondary" onClick={resetTutorial}>
                    Rever tutorial
                  </Button>
                  <Button variant="secondary" onClick={ocultarCliente} disabled={loading || deleting}>
                    Ocultar cliente
                  </Button>
                  <Badge tone="slate">{resumo.total} ag.</Badge>
                  {resumo.noShows > 0 ? <Badge tone="red">No-show {resumo.noShows}</Badge> : null}
                  {resumo.nomes.length > 1 ? <Badge tone="yellow">Nomes {resumo.nomes.length}</Badge> : null}
                </div>
              </div>
            </div>

            {resumo.nomes.length > 1 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-semibold">Atenção: este telefone aparece com nomes diferentes</div>
                <div className="text-amber-800">{resumo.nomes.join(' • ')}</div>
              </div>
            ) : null}

            <div
              className={
                tutorialOpen && tutorialSteps[tutorialStep]?.target === 'summary'
                  ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
                  : ''
              }
            >
              <Card>
                <div className="p-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-500">Último agendamento</div>
                    <div className="text-sm font-semibold text-slate-900">
                      {resumo.ultimoDia ? new Date(resumo.ultimoDia).toLocaleDateString('pt-BR') : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500">Cancelados</div>
                    <div className="text-sm font-semibold text-slate-900">{resumo.cancelados}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500">Valor previsto (histórico)</div>
                    <div className="text-sm font-semibold text-slate-900">{formatBRMoney(resumo.totalPrevisto)}</div>
                  </div>
                </div>
              </Card>
            </div>

            <div
              className={
                tutorialOpen && tutorialSteps[tutorialStep]?.target === 'list'
                  ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
                  : ''
              }
            >
              <Card>
                <div className="divide-y divide-slate-100">
                  {loading ? (
                    <div className="p-6 text-sm text-slate-600">Carregando…</div>
                  ) : agendamentos.length === 0 ? (
                    <div className="p-6 space-y-3">
                      <div className="text-sm font-semibold text-slate-900">Sem histórico para este telefone</div>
                      <div className="text-sm text-slate-600">Se o cliente já agendou, confirme se o telefone está igual no agendamento.</div>
                      <div>
                        <Button variant="secondary" onClick={() => navigate('/dashboard')}>
                          Ir para Agenda
                        </Button>
                      </div>
                    </div>
                  ) : (
                    agendamentos
                      .slice()
                      .sort((a, b) => {
                        const dateCmp = b.data.localeCompare(a.data)
                        if (dateCmp !== 0) return dateCmp
                        return parseTimeToMinutes(b.hora_inicio) - parseTimeToMinutes(a.hora_inicio)
                      })
                      .map((a) => {
                        const statusUi = resolveStatusUi(a.status)
                        const endereco = readExtrasText(a.extras, 'endereco')
                        const placa = readExtrasText(a.extras, 'placa')
                        const email = readExtrasText(a.extras, 'email')
                        const editing = editAgendamentoId === a.id
                        return (
                          <div key={a.id} className="p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                  {a.servico?.cor ? <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.servico.cor }} /> : null}
                                  <span>
                                    {new Date(a.data).toLocaleDateString('pt-BR')} • {a.hora_inicio}
                                  </span>
                                </div>
                                <div className="text-sm text-slate-600">✂️ {a.servico?.nome ?? 'Serviço'}</div>
                                {a.servico?.preco ? <div className="text-xs text-slate-500">{formatBRMoney(Number(a.servico.preco))}</div> : null}
                                {endereco ? <div className="text-sm text-slate-600">📍 {endereco}</div> : null}
                                {placa ? <div className="text-sm text-slate-600">🚗 {placa}</div> : null}
                                {email ? <div className="text-sm text-slate-600">✉️ {email}</div> : null}
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <Badge tone={statusUi.tone}>{statusUi.label}</Badge>
                                <Button variant="secondary" onClick={() => (editing ? closeEditExtras() : openEditExtras(a))}>
                                  {editing ? 'Fechar' : 'Editar dados'}
                                </Button>
                              </div>
                            </div>

                            {editing ? (
                              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                                {editError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{editError}</div> : null}
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <Input label="Endereço" value={editEndereco} onChange={(e) => setEditEndereco(e.target.value)} />
                                  <Input label="Placa" value={editPlaca} onChange={(e) => setEditPlaca(e.target.value)} />
                                  <Input label="Email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button onClick={saveEditExtras} disabled={editSaving}>
                                    {editSaving ? 'Salvando…' : 'Salvar'}
                                  </Button>
                                  <Button variant="secondary" onClick={closeEditExtras} disabled={editSaving}>
                                    Cancelar
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )
                      })
                  )}
                </div>
              </Card>
            </div>
          </div>

          <TutorialOverlay
            open={tutorialOpen}
            steps={tutorialSteps}
            step={tutorialStep}
            onStepChange={setTutorialStep}
            onClose={closeTutorial}
            titleFallback="Cliente"
          />
        </AppShell>
      )}
    </PageTutorial>
  )
}
