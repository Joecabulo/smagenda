import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { formatBRMoney } from '../../lib/dates'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

type Servico = {
  id: string
  usuario_id: string
  nome: string
  descricao: string | null
  duracao_minutos: number
  preco: number
  cor: string | null
  ativo: boolean
  ordem: number
}

type FormState = {
  id?: string
  nome: string
  descricao: string
  duracao_minutos: string
  preco: string
  cor: string
  ativo: boolean
}

function toFormState(servico?: Servico | null): FormState {
  return {
    id: servico?.id,
    nome: servico?.nome ?? '',
    descricao: servico?.descricao ?? '',
    duracao_minutos: String(servico?.duracao_minutos ?? 45),
    preco: String(servico?.preco ?? 0),
    cor: servico?.cor ?? '#0f172a',
    ativo: servico?.ativo ?? true,
  }
}

export function ServicosPage() {
  const { appPrincipal } = useAuth()
  const usuario = appPrincipal?.kind === 'usuario' ? appPrincipal.profile : null

  const usuarioId = usuario?.id

  const [servicos, setServicos] = useState<Servico[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(() => toFormState(null))

  const canSubmit = useMemo(() => {
    const duracao = Number(form.duracao_minutos)
    const preco = Number(form.preco)
    return form.nome.trim() && Number.isFinite(duracao) && duracao > 0 && Number.isFinite(preco) && preco >= 0
  }, [form.nome, form.duracao_minutos, form.preco])

  const load = useCallback(async () => {
    if (!usuarioId) return
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('servicos')
      .select('id,usuario_id,nome,descricao,duracao_minutos,preco,cor,ativo,ordem')
      .eq('usuario_id', usuarioId)
      .order('ordem', { ascending: true })
      .order('criado_em', { ascending: true })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setServicos((data ?? []) as unknown as Servico[])
    setLoading(false)
  }, [usuarioId])

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
        <div className="text-slate-700">Acesso restrito.</div>
      </AppShell>
    )
  }

  const openCreate = () => {
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

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError(null)

    const payload = {
      nome: form.nome.trim(),
      descricao: form.descricao.trim() ? form.descricao.trim() : null,
      duracao_minutos: Number(form.duracao_minutos),
      preco: Number(form.preco),
      cor: form.cor || null,
      ativo: Boolean(form.ativo),
    }

    if (form.id) {
      const { error: err } = await supabase.from('servicos').update(payload).eq('id', form.id).eq('usuario_id', usuario.id)
      if (err) {
        setError(err.message)
        setSaving(false)
        return
      }
    } else {
      const nextOrder = (servicos.at(-1)?.ordem ?? -1) + 1
      const { error: err } = await supabase.from('servicos').insert({ usuario_id: usuario.id, ordem: nextOrder, ...payload })
      if (err) {
        setError(err.message)
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
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-500">Meus Serviços</div>
            <div className="text-xl font-semibold text-slate-900">Gerencie serviços e preços</div>
          </div>
          <Button onClick={openCreate}>+ Adicionar Serviço</Button>
        </div>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

        {formOpen ? (
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
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={closeForm} disabled={saving}>
                  Cancelar
                </Button>
                <Button onClick={submit} disabled={!canSubmit || saving}>
                  Salvar
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        <Card>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="p-6 text-sm text-slate-600">Carregando serviços…</div>
            ) : servicos.length === 0 ? (
              <div className="p-6 text-sm text-slate-600">Nenhum serviço cadastrado.</div>
            ) : (
              servicos.map((s, idx) => (
                <div key={s.id} className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-4 w-4 rounded" style={{ backgroundColor: s.cor ?? '#0f172a' }} />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{s.nome}</div>
                      <div className="text-sm text-slate-600">
                        {s.duracao_minutos} min • {formatBRMoney(Number(s.preco ?? 0))}
                      </div>
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
    </AppShell>
  )
}
