import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { PageTutorial, TutorialOverlay } from '../../components/ui/TutorialOverlay'
import { formatBRMoney } from '../../lib/dates'
import { supabase, supabaseEnv } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

type Servico = {
  id: string
  usuario_id: string
  nome: string
  descricao: string | null
  duracao_minutos: number
  preco: number
  taxa_agendamento: number
  buffer_antes_min?: number
  buffer_depois_min?: number
  antecedencia_minutos?: number
  janela_max_dias?: number
  dia_inteiro?: boolean
  cor: string | null
  foto_url: string | null
  ativo: boolean
  ordem: number
}

type FormState = {
  id?: string
  nome: string
  descricao: string
  duracao_minutos: string
  preco: string
  taxa_agendamento: string
  buffer_antes_min: string
  buffer_depois_min: string
  antecedencia_minutos: string
  janela_max_dias: string
  dia_inteiro: boolean
  cor: string
  foto_url: string
  ativo: boolean
}

function toFormState(servico?: Servico | null): FormState {
  return {
    id: servico?.id,
    nome: servico?.nome ?? '',
    descricao: servico?.descricao ?? '',
    duracao_minutos: String(servico?.duracao_minutos ?? 45),
    preco: String(servico?.preco ?? 0),
    taxa_agendamento: String(servico?.taxa_agendamento ?? 0),
    buffer_antes_min: String(typeof servico?.buffer_antes_min === 'number' ? servico.buffer_antes_min : 0),
    buffer_depois_min: String(typeof servico?.buffer_depois_min === 'number' ? servico.buffer_depois_min : 0),
    antecedencia_minutos: String(typeof servico?.antecedencia_minutos === 'number' ? servico.antecedencia_minutos : 120),
    janela_max_dias: String(typeof servico?.janela_max_dias === 'number' ? servico.janela_max_dias : 15),
    dia_inteiro: Boolean(servico?.dia_inteiro),
    cor: servico?.cor ?? '#0f172a',
    foto_url: servico?.foto_url ?? '',
    ativo: servico?.ativo ?? true,
  }
}

export function ServicosPage() {
  const enableTaxaAgendamento = (import.meta.env.VITE_ENABLE_TAXA_AGENDAMENTO as string | undefined) === '1'
  const { appPrincipal, masterUsuario, masterUsuarioLoading } = useAuth()
  const funcionario = appPrincipal?.kind === 'funcionario' ? appPrincipal.profile : null
  const isGerente = appPrincipal?.kind === 'funcionario' && appPrincipal.profile.permissao === 'admin'
  const usuario = appPrincipal?.kind === 'usuario' ? appPrincipal.profile : isGerente ? masterUsuario : null

  const usuarioId = usuario?.id

  const tutorialSteps = useMemo(
    () =>
      [
        {
          title: 'Adicionar serviço',
          body: 'Clique em "+ Adicionar Serviço" para criar o que você atende (nome, duração e preço).',
          target: 'create' as const,
        },
        {
          title: 'Detalhes do serviço',
          body: 'Defina descrição e cor para facilitar a identificação na agenda. Serviços inativos não aparecem no agendamento público.',
          target: 'form' as const,
        },
        {
          title: 'Foto (PRO)',
          body: 'No plano PRO você pode enviar foto do serviço. Isso melhora a apresentação na página pública.',
          target: 'form' as const,
        },
        {
          title: 'Organizar e ativar',
          body: 'Use as setas para ordenar a lista. Marque "Ativo" para liberar no agendamento.',
          target: 'list' as const,
        },
      ] as const,
    []
  )

  const [servicos, setServicos] = useState<Servico[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [regrasPorServicoDisponivel, setRegrasPorServicoDisponivel] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(() => toFormState(null))

  const isPro = useMemo(() => {
    const p = String(usuario?.plano ?? '').trim().toLowerCase()
    return p === 'pro' || p === 'team' || p === 'enterprise'
  }, [usuario?.plano])

  const servicosLimite = isPro ? null : 3
  const limiteServicosAtingido = useMemo(() => {
    if (!servicosLimite) return false
    return servicos.length >= servicosLimite
  }, [servicos.length, servicosLimite])

  const canSubmit = useMemo(() => {
    const duracao = Number(form.duracao_minutos)
    const preco = Number(form.preco)
    const taxa = Number(form.taxa_agendamento)
    return (
      form.nome.trim() &&
      Number.isFinite(duracao) &&
      duracao > 0 &&
      Number.isFinite(preco) &&
      preco >= 0 &&
      Number.isFinite(taxa) &&
      taxa >= 0
    )
  }, [form.nome, form.duracao_minutos, form.preco, form.taxa_agendamento])

  const load = useCallback(async () => {
    if (!usuarioId) return
    setLoading(true)
    setError(null)

    const baseCols = enableTaxaAgendamento
      ? 'id,usuario_id,nome,descricao,duracao_minutos,preco,taxa_agendamento,cor,foto_url,ativo,ordem'
      : 'id,usuario_id,nome,descricao,duracao_minutos,preco,cor,foto_url,ativo,ordem'
    const colsWithRules = `${baseCols},buffer_antes_min,buffer_depois_min,antecedencia_minutos,janela_max_dias,dia_inteiro`

    const first = await supabase
      .from('servicos')
      .select(colsWithRules)
      .eq('usuario_id', usuarioId)
      .order('ordem', { ascending: true })
      .order('criado_em', { ascending: true })

    if (first.error) {
      const msg = first.error.message
      const lower = msg.toLowerCase()
      const missingColumn = lower.includes('column') && lower.includes('does not exist')
      if (!missingColumn) {
        setError(msg)
        setLoading(false)
        return
      }

      setRegrasPorServicoDisponivel(false)
      const second = await supabase
        .from('servicos')
        .select(baseCols)
        .eq('usuario_id', usuarioId)
        .order('ordem', { ascending: true })
        .order('criado_em', { ascending: true })

      if (second.error) {
        setError(second.error.message)
        setLoading(false)
        return
      }
      setServicos((second.data ?? []) as unknown as Servico[])
      setLoading(false)
      return
    }

    setRegrasPorServicoDisponivel(true)
    setServicos((first.data ?? []) as unknown as Servico[])
    setLoading(false)
  }, [enableTaxaAgendamento, usuarioId])

  useEffect(() => {
    void (async () => {
      await Promise.resolve()
      await load()
    })().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar serviços')
      setLoading(false)
    })
  }, [load])

  if (!usuario) {
    return (
      <AppShell>
        <div className="text-slate-700">{isGerente && masterUsuarioLoading ? 'Carregando…' : 'Acesso restrito.'}</div>
      </AppShell>
    )
  }

  if (funcionario && !funcionario.pode_gerenciar_servicos) {
    return (
      <AppShell>
        <div className="text-slate-700">Acesso restrito.</div>
      </AppShell>
    )
  }

  const openCreate = () => {
    if (limiteServicosAtingido) {
      setError('Limite de serviços atingido. Para criar mais, faça upgrade no plano em Pagamento.')
      return
    }
    setForm(toFormState(null))
    setFormOpen(true)
  }

  const openEdit = (servico: Servico) => {
    setForm(toFormState(servico))
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setForm(toFormState(null))
  }

  const uploadFotoServico = async (file: File) => {
    if (!usuarioId) throw new Error('Sessão inválida')

    const safeName = file.name
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .slice(0, 80)
    const key = `${usuarioId}/servicos/${Date.now()}-${safeName || 'foto'}`

    const tryUpload = async (bucket: string) => {
      const { error: uploadErr } = await supabase.storage.from(bucket).upload(key, file, {
        upsert: true,
        contentType: file.type || undefined,
      })
      if (uploadErr) throw uploadErr
      const { data } = supabase.storage.from(bucket).getPublicUrl(key)
      const publicUrl = data?.publicUrl
      if (!publicUrl) throw new Error('Não foi possível obter a URL pública da foto')
      return publicUrl
    }

    try {
      return await tryUpload('servicos')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const lower = msg.toLowerCase()
      const missingBucket = lower.includes('bucket') && lower.includes('not found')
      if (!missingBucket) throw err
      return await tryUpload('logos')
    }
  }

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError(null)

    const canUseFotos = isPro

    const payload: Record<string, unknown> = {
      nome: form.nome.trim(),
      descricao: form.descricao.trim() ? form.descricao.trim() : null,
      duracao_minutos: Number(form.duracao_minutos),
      preco: Number(form.preco),
      cor: form.cor || null,
      ativo: Boolean(form.ativo),
    }

    if (enableTaxaAgendamento) {
      payload.taxa_agendamento = Number(form.taxa_agendamento)
    }

    if (regrasPorServicoDisponivel) {
      const bufferAntes = Number(form.buffer_antes_min)
      const bufferDepois = Number(form.buffer_depois_min)
      const antecedencia = Number(form.antecedencia_minutos)
      const janela = Number(form.janela_max_dias)

      payload.buffer_antes_min = Number.isFinite(bufferAntes) ? Math.max(0, Math.floor(bufferAntes)) : 0
      payload.buffer_depois_min = Number.isFinite(bufferDepois) ? Math.max(0, Math.floor(bufferDepois)) : 0
      payload.antecedencia_minutos = Number.isFinite(antecedencia) ? Math.max(0, Math.floor(antecedencia)) : 120
      payload.janela_max_dias = Number.isFinite(janela) ? Math.max(1, Math.floor(janela)) : 15
      payload.dia_inteiro = Boolean(form.dia_inteiro)
    }

    if (canUseFotos) {
      const nextFoto = form.foto_url.trim()
      payload.foto_url = nextFoto ? nextFoto : null
    }

    if (form.id) {
      const { error: err } = await supabase.from('servicos').update(payload).eq('id', form.id).eq('usuario_id', usuario.id)
      if (err) {
        setError(err.message)
        setSaving(false)
        return
      }
    } else {
      if (limiteServicosAtingido) {
        setError('Limite de serviços atingido. Para criar mais, faça upgrade no plano em Pagamento.')
        setSaving(false)
        return
      }
      const nextOrder = (servicos.at(-1)?.ordem ?? -1) + 1
      const { error: err } = await supabase.from('servicos').insert({ usuario_id: usuario.id, ordem: nextOrder, ...payload })
      if (err) {
        const msg = err.message.toLowerCase().includes('limite_servicos_atingido')
          ? 'Limite de serviços atingido. Para criar mais, faça upgrade no plano em Pagamento.'
          : err.message
        setError(msg)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    closeForm()
    await load()
  }

  const remove = async (id: string) => {
    setError(null)
    const { error: err } = await supabase.from('servicos').delete().eq('id', id).eq('usuario_id', usuario.id)
    if (err) {
      setError(err.message)
      return
    }
    await load()
  }

  const toggleAtivo = async (servico: Servico) => {
    setError(null)
    const { error: err } = await supabase
      .from('servicos')
      .update({ ativo: !servico.ativo })
      .eq('id', servico.id)
      .eq('usuario_id', usuario.id)
    if (err) {
      setError(err.message)
      return
    }
    setServicos((prev) => prev.map((s) => (s.id === servico.id ? { ...s, ativo: !s.ativo } : s)))
  }

  const move = async (id: string, dir: -1 | 1) => {
    const index = servicos.findIndex((s) => s.id === id)
    const otherIndex = index + dir
    if (index < 0 || otherIndex < 0 || otherIndex >= servicos.length) return
    const a = servicos[index]
    const b = servicos[otherIndex]

    setServicos((prev) => {
      const copy = [...prev]
      copy[index] = b
      copy[otherIndex] = a
      return copy
    })

    const updates = [
      supabase.from('servicos').update({ ordem: b.ordem }).eq('id', a.id).eq('usuario_id', usuario.id),
      supabase.from('servicos').update({ ordem: a.ordem }).eq('id', b.id).eq('usuario_id', usuario.id),
    ]
    const res = await Promise.all(updates)
    const firstErr = res.find((r) => r.error)?.error
    if (firstErr) {
      setError(firstErr.message)
      await load()
    }
  }

  return (
    <PageTutorial usuarioId={usuarioId} page="servicos">
      {({ tutorialOpen, tutorialStep, setTutorialStep, resetTutorial, closeTutorial }) => (
        <AppShell>
          <div className="space-y-6">
            <div
              className={[
                'flex items-center justify-between',
                tutorialOpen && tutorialSteps[tutorialStep]?.target === 'create'
                  ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl p-2 -m-2'
                  : '',
              ].join(' ')}
            >
          <div>
            <div className="text-sm font-semibold text-slate-500">Meus Serviços</div>
            <div className="text-xl font-semibold text-slate-900">Gerencie serviços e preços</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={resetTutorial}>
              Rever tutorial
            </Button>
            <Button onClick={openCreate} disabled={limiteServicosAtingido}>
              + Adicionar Serviço
            </Button>
          </div>
        </div>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
        {!isPro && servicosLimite ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Plano BASIC: até {servicosLimite} serviços.
          </div>
        ) : null}

        {formOpen ? (
          <div
            className={
              tutorialOpen && tutorialSteps[tutorialStep]?.target === 'form'
                ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
                : ''
            }
          >
            <Card>
              <div className="p-6 space-y-4">
              <div className="text-sm font-semibold text-slate-900">{form.id ? 'Editar serviço' : 'Adicionar serviço'}</div>
              <Input label="Nome" value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} />
              <Input
                label="Descrição (opcional)"
                value={form.descricao}
                onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Duração (min)"
                  type="number"
                  value={form.duracao_minutos}
                  onChange={(e) => setForm((p) => ({ ...p, duracao_minutos: e.target.value }))}
                />
                <Input
                  label="Preço"
                  type="number"
                  value={form.preco}
                  onChange={(e) => setForm((p) => ({ ...p, preco: e.target.value }))}
                />
              </div>

              {regrasPorServicoDisponivel ? (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.dia_inteiro} onChange={(e) => setForm((p) => ({ ...p, dia_inteiro: e.target.checked }))} />
                  Dura o dia inteiro (ex.: faxina)
                </label>
              ) : null}

              {regrasPorServicoDisponivel ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Buffer antes (min)"
                    type="number"
                    value={form.buffer_antes_min}
                    onChange={(e) => setForm((p) => ({ ...p, buffer_antes_min: e.target.value }))}
                  />
                  <Input
                    label="Buffer depois (min)"
                    type="number"
                    value={form.buffer_depois_min}
                    onChange={(e) => setForm((p) => ({ ...p, buffer_depois_min: e.target.value }))}
                  />
                  <Input
                    label="Antecedência mínima (min)"
                    type="number"
                    value={form.antecedencia_minutos}
                    onChange={(e) => setForm((p) => ({ ...p, antecedencia_minutos: e.target.value }))}
                  />
                  <Input
                    label="Janela de agendamento (dias)"
                    type="number"
                    value={form.janela_max_dias}
                    onChange={(e) => setForm((p) => ({ ...p, janela_max_dias: e.target.value }))}
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Regras por serviço (buffer/antecedência/janela) ainda não estão habilitadas no seu Supabase. Aplique o SQL do link público atualizado em /admin/configuracoes.
                </div>
              )}
              {enableTaxaAgendamento ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Taxa de agendamento"
                    type="number"
                    value={form.taxa_agendamento}
                    onChange={(e) => setForm((p) => ({ ...p, taxa_agendamento: e.target.value }))}
                  />
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Cor" type="color" value={form.cor} onChange={(e) => setForm((p) => ({ ...p, cor: e.target.value }))} />
                <label className="flex items-end gap-2">
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-slate-700">Ativo</span>
                </label>
              </div>

              {usuario.plano === 'pro' || usuario.plano === 'team' || usuario.plano === 'enterprise' ? (
                <div className="space-y-2">
                  <Input
                    label="Foto do serviço (opcional)"
                    type="file"
                    accept="image/*"
                    disabled={uploadingFoto || saving}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file || !usuarioId) return

                      const maxBytes = 6 * 1024 * 1024
                      if (file.size > maxBytes) {
                        setError('A foto deve ter no máximo 6MB.')
                        e.target.value = ''
                        return
                      }

                      void (async () => {
                        setUploadingFoto(true)
                        setError(null)
                        const publicUrl = await uploadFotoServico(file)
                        setForm((p) => ({ ...p, foto_url: publicUrl }))
                        e.target.value = ''
                        setUploadingFoto(false)
                      })().catch((err: unknown) => {
                        const msg = err instanceof Error ? err.message : 'Erro ao enviar foto'
                        const lower = msg.toLowerCase()
                        const missingBucket = lower.includes('bucket') && lower.includes('not found')
                        if (missingBucket) {
                          const host = supabaseEnv.ok
                            ? (() => {
                                try {
                                  return new URL(supabaseEnv.values.VITE_SUPABASE_URL).host
                                } catch {
                                  return supabaseEnv.values.VITE_SUPABASE_URL
                                }
                              })()
                            : 'supabase_desconfigurado'
                          setError(
                            `Bucket não encontrado no Storage. Projeto: ${host}. Crie o bucket "servicos" (público) ou use o SQL "Storage (fotos de serviços)" em /admin/configuracoes.`
                          )
                        } else {
                          setError(msg)
                        }
                        setUploadingFoto(false)
                        e.target.value = ''
                      })
                    }}
                  />

                  {form.foto_url.trim() ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img src={form.foto_url} alt="Foto do serviço" className="h-12 w-12 rounded-lg object-cover border border-slate-200" />
                        <div className="text-sm text-slate-700 truncate">{form.foto_url}</div>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={saving || uploadingFoto}
                        onClick={() => setForm((p) => ({ ...p, foto_url: '' }))}
                      >
                        Remover
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  Foto do serviço disponível a partir do plano PRO.
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={closeForm} disabled={saving || uploadingFoto}>
                  Cancelar
                </Button>
                <Button onClick={submit} disabled={!canSubmit || saving || uploadingFoto}>
                  Salvar
                </Button>
              </div>
              </div>
            </Card>
          </div>
        ) : null}

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
              <div className="p-6 text-sm text-slate-600">Carregando serviços…</div>
            ) : servicos.length === 0 ? (
              <div className="p-6 space-y-3">
                <div className="text-sm font-semibold text-slate-900">Nenhum serviço cadastrado</div>
                <div className="text-sm text-slate-600">Crie seus serviços para que eles apareçam na agenda e na página pública.</div>
                <div>
                  <Button variant="secondary" onClick={openCreate} disabled={limiteServicosAtingido}>
                    + Adicionar primeiro serviço
                  </Button>
                </div>
              </div>
            ) : (
              servicos.map((s, idx) => (
                <div key={s.id} className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    {s.foto_url ? (
                      <img src={s.foto_url} alt={s.nome} className="h-12 w-12 rounded-lg object-cover border border-slate-200" />
                    ) : (
                      <div className="mt-1 h-4 w-4 rounded" style={{ backgroundColor: s.cor ?? '#0f172a' }} />
                    )}
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{s.nome}</div>
                      <div className="text-sm text-slate-600">
                        {s.duracao_minutos} min • {formatBRMoney(Number(s.preco ?? 0))}
                      </div>
                      {enableTaxaAgendamento && typeof s.taxa_agendamento === 'number' && Number(s.taxa_agendamento) > 0 ? (
                        <div className="text-xs text-slate-600">Taxa: {formatBRMoney(Number(s.taxa_agendamento))}</div>
                      ) : null}
                      {s.descricao ? <div className="text-sm text-slate-600">{s.descricao}</div> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 justify-end">
                    <Button variant="ghost" onClick={() => move(s.id, -1)} disabled={idx === 0}>
                      ↑
                    </Button>
                    <Button variant="ghost" onClick={() => move(s.id, 1)} disabled={idx === servicos.length - 1}>
                      ↓
                    </Button>
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                      <input type="checkbox" checked={s.ativo} onChange={() => toggleAtivo(s)} />
                      Ativo
                    </label>
                    <Button variant="secondary" onClick={() => openEdit(s)}>
                      Editar
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        const ok = window.confirm(`Excluir o serviço "${s.nome}"?`)
                        if (ok) void remove(s.id)
                      }}
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
              ))
            )}
            </div>
          </Card>
        </div>

            <TutorialOverlay open={tutorialOpen} steps={tutorialSteps} step={tutorialStep} onStepChange={setTutorialStep} onClose={closeTutorial} />
          </div>
        </AppShell>
      )}
    </PageTutorial>
  )
}
