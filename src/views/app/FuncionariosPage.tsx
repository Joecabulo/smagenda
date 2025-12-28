import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { toISODate } from '../../lib/dates'
import { supabase, supabaseEnv } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

type Funcionario = {
  id: string
  usuario_master_id: string
  nome_completo: string
  email: string
  telefone: string | null
  permissao: 'admin' | 'funcionario'
  pode_ver_agenda: boolean
  pode_criar_agendamentos: boolean
  pode_cancelar_agendamentos: boolean
  pode_bloquear_horarios: boolean
  pode_ver_financeiro: boolean
  pode_gerenciar_servicos: boolean
  pode_ver_clientes_de_outros: boolean
  horario_inicio: string | null
  horario_fim: string | null
  dias_trabalho: number[] | null
  intervalo_inicio: string | null
  intervalo_fim: string | null
  ativo: boolean
}

type PermissionKey =
  | 'pode_ver_agenda'
  | 'pode_criar_agendamentos'
  | 'pode_cancelar_agendamentos'
  | 'pode_bloquear_horarios'
  | 'pode_ver_financeiro'
  | 'pode_gerenciar_servicos'
  | 'pode_ver_clientes_de_outros'

const weekdayOptions = [
  { value: 1, label: 'S' },
  { value: 2, label: 'T' },
  { value: 3, label: 'Q' },
  { value: 4, label: 'Q' },
  { value: 5, label: 'S' },
  { value: 6, label: 'S' },
  { value: 0, label: 'D' },
]

function daysLabel(days: number[] | null) {
  if (!days || days.length === 0) return '—'
  const map = new Map(weekdayOptions.map((d) => [d.value, d.label]))
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => map.get(d) ?? String(d))
    .join('')
}

type FormState = {
  id?: string
  nome_completo: string
  email: string
  senha: string
  senha_confirm: string
  telefone: string
  permissao: 'admin' | 'funcionario'
  horario_inicio: string
  horario_fim: string
  dias_trabalho: number[]
  intervalo_inicio: string
  intervalo_fim: string
  pode_ver_agenda: boolean
  pode_criar_agendamentos: boolean
  pode_cancelar_agendamentos: boolean
  pode_bloquear_horarios: boolean
  pode_ver_financeiro: boolean
  pode_gerenciar_servicos: boolean
  pode_ver_clientes_de_outros: boolean
  ativo: boolean
}

const permissionFields: Array<{ key: PermissionKey; label: string }> = [
  { key: 'pode_ver_agenda', label: 'Ver agenda' },
  { key: 'pode_criar_agendamentos', label: 'Criar agendamentos' },
  { key: 'pode_cancelar_agendamentos', label: 'Cancelar agendamentos' },
  { key: 'pode_bloquear_horarios', label: 'Bloquear horários próprios' },
  { key: 'pode_ver_financeiro', label: 'Ver financeiro' },
  { key: 'pode_gerenciar_servicos', label: 'Gerenciar serviços' },
  { key: 'pode_ver_clientes_de_outros', label: 'Ver clientes de outros' },
]

function toFormState(f?: Funcionario | null): FormState {
  return {
    id: f?.id,
    nome_completo: f?.nome_completo ?? '',
    email: f?.email ?? '',
    senha: '',
    senha_confirm: '',
    telefone: f?.telefone ?? '',
    permissao: f?.permissao ?? 'funcionario',
    horario_inicio: f?.horario_inicio ?? '09:00',
    horario_fim: f?.horario_fim ?? '18:00',
    dias_trabalho: f?.dias_trabalho ?? [1, 2, 3, 4, 5],
    intervalo_inicio: f?.intervalo_inicio ?? '',
    intervalo_fim: f?.intervalo_fim ?? '',
    pode_ver_agenda: f?.pode_ver_agenda ?? true,
    pode_criar_agendamentos: f?.pode_criar_agendamentos ?? true,
    pode_cancelar_agendamentos: f?.pode_cancelar_agendamentos ?? true,
    pode_bloquear_horarios: f?.pode_bloquear_horarios ?? true,
    pode_ver_financeiro: f?.pode_ver_financeiro ?? false,
    pode_gerenciar_servicos: f?.pode_gerenciar_servicos ?? false,
    pode_ver_clientes_de_outros: f?.pode_ver_clientes_de_outros ?? false,
    ativo: f?.ativo ?? true,
  }
}

export function FuncionariosPage() {
  const { principal } = useAuth()
  const usuario = principal?.kind === 'usuario' ? principal.profile : null

  const usuarioId = usuario?.id

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(() => toFormState(null))
  const [saving, setSaving] = useState(false)

  const limiteAtingido = useMemo(() => {
    const limite = usuario?.limite_funcionarios
    if (!limite) return false
    return funcionarios.filter((f) => f.ativo).length >= limite
  }, [usuario?.limite_funcionarios, funcionarios])

  const canSubmit = useMemo(() => {
    const baseOk = form.nome_completo.trim() && form.email.trim() && form.horario_inicio && form.horario_fim && form.dias_trabalho.length > 0
    if (!baseOk) return false
    if (!form.id) {
      if (form.senha.trim().length < 8) return false
      if (form.senha !== form.senha_confirm) return false
    }
    return true
  }, [form])

  const senhaInvalida = useMemo(() => {
    if (form.id) return null
    if (!form.senha.trim()) return 'Defina uma senha para o funcionário.'
    if (form.senha.trim().length < 8) return 'A senha deve ter no mínimo 8 caracteres.'
    if (form.senha !== form.senha_confirm) return 'As senhas não conferem.'
    return null
  }, [form.id, form.senha, form.senha_confirm])

  type AgendamentoRow = { funcionario_id: string | null; status: string }

  const load = useCallback(async () => {
    if (!usuarioId) return
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('funcionarios')
      .select(
        'id,usuario_master_id,nome_completo,email,telefone,permissao,pode_ver_agenda,pode_criar_agendamentos,pode_cancelar_agendamentos,pode_bloquear_horarios,pode_ver_financeiro,pode_gerenciar_servicos,pode_ver_clientes_de_outros,horario_inicio,horario_fim,dias_trabalho,intervalo_inicio,intervalo_fim,ativo'
      )
      .eq('usuario_master_id', usuarioId)
      .order('criado_em', { ascending: true })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    const list = (data ?? []) as unknown as Funcionario[]
    setFuncionarios(list)

    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const { data: agData, error: agErr } = await supabase
      .from('agendamentos')
      .select('funcionario_id,status')
      .eq('usuario_id', usuarioId)
      .gte('data', toISODate(start))
      .lte('data', toISODate(end))
      .limit(1000)
    if (agErr) {
      setError(agErr.message)
      setLoading(false)
      return
    }
    const map: Record<string, number> = {}
    for (const a of ((agData ?? []) as unknown as AgendamentoRow[])) {
      if (!a.funcionario_id) continue
      if (a.status === 'cancelado') continue
      map[a.funcionario_id] = (map[a.funcionario_id] ?? 0) + 1
    }
    setCounts(map)
    setLoading(false)
  }, [usuarioId])

  useEffect(() => {
    void (async () => {
      await Promise.resolve()
      await load()
    })().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar funcionários')
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

  const openEdit = (f: Funcionario) => {
    setForm(toFormState(f))
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setForm(toFormState(null))
  }

  const toggleDay = (day: number) => {
    setForm((p) => ({ ...p, dias_trabalho: p.dias_trabalho.includes(day) ? p.dias_trabalho.filter((d) => d !== day) : [...p.dias_trabalho, day] }))
  }

  const setPermission = (key: PermissionKey, value: boolean) => {
    setForm((p) => ({ ...p, [key]: value }))
  }

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError(null)

    const payload = {
      nome_completo: form.nome_completo.trim(),
      email: form.email.trim().toLowerCase(),
      telefone: form.telefone.trim() ? form.telefone.trim() : null,
      permissao: form.permissao,
      horario_inicio: form.horario_inicio || null,
      horario_fim: form.horario_fim || null,
      dias_trabalho: form.dias_trabalho,
      intervalo_inicio: form.intervalo_inicio.trim() ? form.intervalo_inicio : null,
      intervalo_fim: form.intervalo_fim.trim() ? form.intervalo_fim : null,
      pode_ver_agenda: form.pode_ver_agenda,
      pode_criar_agendamentos: form.pode_criar_agendamentos,
      pode_cancelar_agendamentos: form.pode_cancelar_agendamentos,
      pode_bloquear_horarios: form.pode_bloquear_horarios,
      pode_ver_financeiro: form.pode_ver_financeiro,
      pode_gerenciar_servicos: form.pode_gerenciar_servicos,
      pode_ver_clientes_de_outros: form.pode_ver_clientes_de_outros,
      ativo: form.ativo,
    }

    if (form.id) {
      const { error: err } = await supabase
        .from('funcionarios')
        .update(payload)
        .eq('id', form.id)
        .eq('usuario_master_id', usuario.id)
      if (err) {
        setError(err.message)
        setSaving(false)
        return
      }
    } else {
      if (limiteAtingido) {
        setError('Limite de funcionários atingido para seu plano.')
        setSaving(false)
        return
      }
      if (!supabaseEnv.ok) {
        setError('Configuração do Supabase ausente (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
        setSaving(false)
        return
      }

      const { data: sessionData } = await supabase.auth.getSession()
      let session = sessionData.session
      const now = Math.floor(Date.now() / 1000)
      const expiresAt = session?.expires_at ?? null

      if (session && expiresAt && expiresAt <= now + 30) {
        const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
        if (!refreshErr) session = refreshed.session
      }

      const accessToken = session?.access_token ?? null
      if (!accessToken) {
        setError('Sessão expirada. Faça login novamente e tente criar o funcionário.')
        setSaving(false)
        return
      }

      const fnUrl = `${supabaseEnv.values.VITE_SUPABASE_URL}/functions/v1/create-funcionario`

      let res: Response
      try {
        res = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseEnv.values.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ ...payload, senha: form.senha }),
        })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Falha de rede'
        setError(`Não foi possível conectar à função de criação de funcionário: ${msg}`)
        setSaving(false)
        return
      }

      const fnVersion = res.headers.get('x-smagenda-fn')

      const raw = await res.text().catch(() => null)
      const parsed = raw
        ? (() => {
            try {
              return JSON.parse(raw) as unknown
            } catch {
              return null
            }
          })()
        : null

      const serverMessage = (() => {
        if (!parsed || typeof parsed !== 'object') return null
        const p = parsed as Record<string, unknown>
        if (typeof p.message === 'string' && p.message.trim()) return p.message
        if (typeof p.error === 'string' && p.error.trim()) return p.error
        return null
      })()

      if (!res.ok) {
        const status = res.status
        if (status === 404) {
          setError('Função create-funcionario não encontrada no Supabase (deploy pendente).')
        } else if (status === 401) {
          if (!fnVersion && parsed && typeof parsed === 'object' && (parsed as Record<string, unknown>).message === 'Invalid JWT' && (parsed as Record<string, unknown>).code === 401) {
            setError('A Edge Function "create-funcionario" está exigindo JWT no Supabase. Refaça o deploy com verify_jwt=false e tente novamente.')
          } else {
            setError(serverMessage ? `Sem autorização: ${serverMessage}` : 'Sem autorização para chamar a função. Faça o deploy com verify_jwt=false e tente novamente.')
          }
        } else if (status === 403) {
          setError(serverMessage ? `Sem permissão: ${serverMessage}` : 'Sem permissão para criar funcionário.')
        } else {
          setError(serverMessage ? `Erro ao criar funcionário (HTTP ${status}): ${serverMessage}` : `Erro ao criar funcionário (HTTP ${status}).`)
        }
        setSaving(false)
        return
      }

      const funcionarioId = (parsed as { id?: string } | null)?.id
      if (!funcionarioId) {
        setError('Falha ao criar login do funcionário.')
        setSaving(false)
        return
      }
    }

    setSaving(false)
    closeForm()
    await load()
  }

  const toggleAtivo = async (f: Funcionario) => {
    setError(null)
    const { error: err } = await supabase
      .from('funcionarios')
      .update({ ativo: !f.ativo })
      .eq('id', f.id)
      .eq('usuario_master_id', usuario.id)
    if (err) {
      setError(err.message)
      return
    }
    setFuncionarios((prev) => prev.map((x) => (x.id === f.id ? { ...x, ativo: !x.ativo } : x)))
  }

  const remove = async (f: Funcionario) => {
    setError(null)
    const ok = window.confirm(`Excluir funcionário "${f.nome_completo}"?`)
    if (!ok) return
    const { error: err } = await supabase.from('funcionarios').delete().eq('id', f.id).eq('usuario_master_id', usuario.id)
    if (err) {
      setError(err.message)
      return
    }
    await load()
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-500">Funcionários</div>
            <div className="text-xl font-semibold text-slate-900">Gestão da equipe</div>
          </div>
          <Button onClick={openCreate} disabled={limiteAtingido}>
            + Novo
          </Button>
        </div>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

        {limiteAtingido ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Limite de funcionários ativo atingido.</div>
        ) : null}

        {formOpen ? (
          <Card>
            <div className="p-6 space-y-4">
              <div className="text-sm font-semibold text-slate-900">{form.id ? 'Editar funcionário' : 'Adicionar funcionário'}</div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Nome completo" value={form.nome_completo} onChange={(e) => setForm((p) => ({ ...p, nome_completo: e.target.value }))} />
                <Input label="Email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              </div>

              {!form.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      label="Senha"
                      type="password"
                      autoComplete="new-password"
                      value={form.senha}
                      onChange={(e) => setForm((p) => ({ ...p, senha: e.target.value }))}
                    />
                    <Input
                      label="Confirmar senha"
                      type="password"
                      autoComplete="new-password"
                      value={form.senha_confirm}
                      onChange={(e) => setForm((p) => ({ ...p, senha_confirm: e.target.value }))}
                    />
                  </div>
                  <div className={senhaInvalida ? 'text-xs text-rose-600' : 'text-xs text-slate-600'}>
                    {senhaInvalida ?? 'Essa senha será usada pelo funcionário para entrar no sistema.'}
                  </div>
                </div>
              ) : null}

              <Input label="Telefone" value={form.telefone} onChange={(e) => setForm((p) => ({ ...p, telefone: e.target.value }))} />

              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-700">Nível de acesso</div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="radio" checked={form.permissao === 'admin'} onChange={() => setForm((p) => ({ ...p, permissao: 'admin' }))} />
                  Admin
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    checked={form.permissao === 'funcionario'}
                    onChange={() => setForm((p) => ({ ...p, permissao: 'funcionario' }))}
                  />
                  Funcionário
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Início" type="time" value={form.horario_inicio} onChange={(e) => setForm((p) => ({ ...p, horario_inicio: e.target.value }))} />
                <Input label="Fim" type="time" value={form.horario_fim} onChange={(e) => setForm((p) => ({ ...p, horario_fim: e.target.value }))} />
              </div>

              <div>
                <div className="text-sm font-medium text-slate-700 mb-2">Dias</div>
                <div className="flex flex-wrap gap-2">
                  {weekdayOptions.map((d) => (
                    <button
                      type="button"
                      key={d.value}
                      onClick={() => toggleDay(d.value)}
                      className={[
                        'h-9 w-9 rounded-lg border text-sm font-semibold',
                        form.dias_trabalho.includes(d.value)
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200',
                      ].join(' ')}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Intervalo (opcional) início"
                  type="time"
                  value={form.intervalo_inicio}
                  onChange={(e) => setForm((p) => ({ ...p, intervalo_inicio: e.target.value }))}
                />
                <Input
                  label="Intervalo (opcional) fim"
                  type="time"
                  value={form.intervalo_fim}
                  onChange={(e) => setForm((p) => ({ ...p, intervalo_fim: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-700">Permissões</div>
                {permissionFields.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={form[key]} onChange={(e) => setPermission(key, e.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.ativo} onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))} />
                Ativo
              </label>

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={closeForm} disabled={saving}>
                  Cancelar
                </Button>
                <Button onClick={submit} disabled={!canSubmit || saving}>
                  Salvar
                </Button>
              </div>

              <div className="text-sm text-slate-600">
                Observação: criação de login (email/senha) para funcionário precisa de uma função segura no backend do Supabase.
              </div>
            </div>
          </Card>
        ) : null}

        <Card>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="p-6 text-sm text-slate-600">Carregando funcionários…</div>
            ) : funcionarios.length === 0 ? (
              <div className="p-6 text-sm text-slate-600">Nenhum funcionário cadastrado.</div>
            ) : (
              funcionarios.map((f) => (
                <div key={f.id} className="p-4 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">👤 {f.nome_completo}</div>
                      <div className="text-sm text-slate-600">{f.email}</div>
                      {f.telefone ? <div className="text-sm text-slate-600">📱 {f.telefone}</div> : null}
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      {f.ativo ? <Badge tone="green">Ativo</Badge> : <Badge tone="red">Inativo</Badge>}
                      <Badge tone="slate">{f.permissao === 'admin' ? 'Admin' : 'Funcionário'}</Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="text-sm text-slate-700">
                      📅 Atende: {daysLabel(f.dias_trabalho)} {f.horario_inicio ?? '—'}–{f.horario_fim ?? '—'}
                    </div>
                    <div className="text-sm text-slate-700">✂️ {counts[f.id] ?? 0} agendamentos este mês</div>
                    <div className="text-sm text-slate-700">
                      Permissões: {f.pode_ver_agenda ? '✅' : '❌'} agenda • {f.pode_criar_agendamentos ? '✅' : '❌'} criar •{' '}
                      {f.pode_ver_financeiro ? '✅' : '❌'} financeiro • {f.pode_gerenciar_servicos ? '✅' : '❌'} serviços
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="secondary" onClick={() => openEdit(f)}>
                      Editar
                    </Button>
                    <Button variant="secondary" onClick={() => toggleAtivo(f)}>
                      {f.ativo ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button variant="danger" onClick={() => remove(f)}>
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
