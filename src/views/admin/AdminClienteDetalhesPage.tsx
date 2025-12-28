import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AdminShell } from '../../components/layout/AdminShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { supabase } from '../../lib/supabase'

type Cliente = {
  id: string
  nome_completo: string
  nome_negocio: string
  slug: string
  email: string
  telefone: string | null
  plano: string
  status_pagamento: string
  ativo: boolean
  limite_funcionarios: number | null
}

const planoOptions = ['free', 'basic', 'pro', 'team', 'enterprise']
const statusOptions = ['ativo', 'inadimplente', 'cancelado', 'trial', 'suspenso']

const planoDefaultLimite: Record<string, number | null> = {
  free: 1,
  basic: 2,
  pro: 5,
  team: 10,
  enterprise: null,
}

export function AdminClienteDetalhesPage() {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [servicosCount, setServicosCount] = useState(0)
  const [funcionariosCount, setFuncionariosCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [plano, setPlano] = useState('')
  const [statusPagamento, setStatusPagamento] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [limiteFuncionarios, setLimiteFuncionarios] = useState('')

  useEffect(() => {
    const run = async () => {
      if (!id) {
        setError('Cliente inválido')
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)

      const { data, error: err } = await supabase
        .from('usuarios')
        .select('id,nome_completo,nome_negocio,slug,email,telefone,plano,status_pagamento,ativo,limite_funcionarios')
        .eq('id', id)
        .maybeSingle()
      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }
      const next = ((data ?? null) as unknown as Cliente | null) ?? null
      setCliente(next)
      if (next) {
        setPlano(next.plano)
        setStatusPagamento(next.status_pagamento)
        setAtivo(next.ativo)
        setLimiteFuncionarios(next.limite_funcionarios === null ? '' : String(next.limite_funcionarios))
      }

      const { count: sCount } = await supabase.from('servicos').select('id', { count: 'exact', head: true }).eq('usuario_id', id)
      const { count: fCount } = await supabase.from('funcionarios').select('id', { count: 'exact', head: true }).eq('usuario_master_id', id)
      setServicosCount(sCount ?? 0)
      setFuncionariosCount(fCount ?? 0)

      setLoading(false)
    }
    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar')
      setLoading(false)
    })
  }, [id])

  const save = async () => {
    if (!id) return
    setSaving(true)
    setError(null)
    const limite = limiteFuncionarios.trim() === '' ? null : Number(limiteFuncionarios)
    if (limiteFuncionarios.trim() !== '' && Number.isNaN(limite)) {
      setError('Limite de funcionários inválido')
      setSaving(false)
      return
    }
    const { error: err } = await supabase
      .from('usuarios')
      .update({ plano, status_pagamento: statusPagamento, ativo, limite_funcionarios: limite })
      .eq('id', id)
    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }
    setCliente((prev) =>
      prev ? { ...prev, plano, status_pagamento: statusPagamento, ativo, limite_funcionarios: limite } : prev
    )
    setSaving(false)
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-500">Cliente</div>
            <div className="text-xl font-semibold text-slate-900">Detalhes</div>
          </div>
          <Link to="/admin/clientes" className="text-sm font-medium text-slate-900 hover:underline">
            Voltar
          </Link>
        </div>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
        {loading ? <div className="text-sm text-slate-600">Carregando…</div> : null}

        {cliente ? (
          <div className="space-y-4">
            <Card>
              <div className="p-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-slate-900">{cliente.nome_negocio}</div>
                  <div className="text-sm text-slate-600">/{cliente.slug}</div>
                </div>
              <div className="flex items-center gap-2">
                  {cliente.ativo ? <Badge tone="green">Ativo</Badge> : <Badge tone="red">Inativo</Badge>}
                  <Badge tone="slate">{cliente.plano.toUpperCase()}</Badge>
                  <Badge tone={cliente.status_pagamento === 'inadimplente' ? 'red' : 'slate'}>{cliente.status_pagamento}</Badge>
                </div>
              </div>
              <div className="text-sm text-slate-700">{cliente.nome_completo}</div>
              <div className="text-sm text-slate-700">{cliente.email}</div>
              {cliente.telefone ? <div className="text-sm text-slate-700">{cliente.telefone}</div> : null}
              <div className="text-sm text-slate-700">Serviços: {servicosCount}</div>
              <div className="text-sm text-slate-700">Funcionários: {funcionariosCount}</div>
              </div>
            </Card>

            <Card>
              <div className="p-6 space-y-4">
                <div className="text-sm font-semibold text-slate-900">Gerenciamento</div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <div className="text-sm font-medium text-slate-700 mb-1">Plano</div>
                    <select
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                      value={plano}
                      onChange={(e) => {
                        const nextPlano = e.target.value
                        setPlano(nextPlano)
                        const nextLimite = Object.prototype.hasOwnProperty.call(planoDefaultLimite, nextPlano)
                          ? planoDefaultLimite[nextPlano]
                          : null
                        setLimiteFuncionarios(nextLimite === null ? '' : String(nextLimite))
                      }}
                    >
                      {planoOptions.map((p) => (
                        <option key={p} value={p}>
                          {p.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <div className="text-sm font-medium text-slate-700 mb-1">Status de pagamento</div>
                    <select
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                      value={statusPagamento}
                      onChange={(e) => setStatusPagamento(e.target.value)}
                    >
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <div className="text-sm font-medium text-slate-700 mb-1">Conta ativa</div>
                    <select
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                      value={ativo ? 'true' : 'false'}
                      onChange={(e) => setAtivo(e.target.value === 'true')}
                    >
                      <option value="true">Ativa</option>
                      <option value="false">Inativa</option>
                    </select>
                  </label>
                  <Input
                    label="Limite de funcionários (vazio = sem limite)"
                    value={limiteFuncionarios}
                    onChange={(e) => setLimiteFuncionarios(e.target.value)}
                    inputMode="numeric"
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={save} disabled={saving || !plano || !statusPagamento}>
                    Salvar alterações
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </AdminShell>
  )
}
