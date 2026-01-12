import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminShell } from '../../components/layout/AdminShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { supabase } from '../../lib/supabase'

type Cliente = {
  id: string
  nome_negocio: string
  slug: string
  plano: string
  status_pagamento: string
  ativo: boolean
  tema_prospector_habilitado?: boolean | null
}

function normalizePlanoLabel(planoRaw: string) {
  const p = String(planoRaw ?? '').trim().toLowerCase()
  if (p === 'enterprise') return 'EMPRESA'
  if (p === 'pro' || p === 'team') return 'PRO'
  if (p === 'basic') return 'BASIC'
  if (p === 'free') return 'FREE'
  return planoRaw
}

export function AdminClientesPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])

  const [schemaTemaProspectorIncompleto, setSchemaTemaProspectorIncompleto] = useState(false)
  const [updatingTemaProspector, setUpdatingTemaProspector] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  const [query, setQuery] = useState('')
  const [plano, setPlano] = useState('')
  const [statusPagamento, setStatusPagamento] = useState('')
  const [ativo, setAtivo] = useState('')

  const canClear = useMemo(() => Boolean(query.trim() || plano || statusPagamento || ativo), [ativo, plano, query, statusPagamento])

  const filteredClientes = useMemo(() => clientes, [clientes])
  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id] === true), [selected])
  const selectedCount = selectedIds.length

  const clearSelection = () => setSelected({})
  const selectAllFiltered = () => setSelected(Object.fromEntries(filteredClientes.map((c) => [c.id, true])))

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      setSchemaTemaProspectorIncompleto(false)

      const q = query.trim()
      let req = supabase
        .from('usuarios')
        .select('id,nome_negocio,slug,email,telefone,plano,status_pagamento,ativo,tema_prospector_habilitado')
        .order('criado_em', { ascending: false })
        .limit(500)

      if (q) {
        const safe = q.replaceAll(',', ' ').trim()
        req = req.or(`nome_negocio.ilike.%${safe}%,slug.ilike.%${safe}%,email.ilike.%${safe}%,telefone.ilike.%${safe}%`)
      }
      if (plano) {
        if (plano === 'pro') {
          req = req.in('plano', ['pro', 'team'])
        } else {
          req = req.eq('plano', plano)
        }
      }
      if (statusPagamento) req = req.eq('status_pagamento', statusPagamento)
      if (ativo) req = req.eq('ativo', ativo === 'true')

      const { data, error: err } = await req
      if (err) {
        const msg = err.message
        if (msg.toLowerCase().includes('does not exist') && msg.toLowerCase().includes('column')) {
          setSchemaTemaProspectorIncompleto(true)
          let fallback = supabase
            .from('usuarios')
            .select('id,nome_negocio,slug,email,telefone,plano,status_pagamento,ativo')
            .order('criado_em', { ascending: false })
            .limit(500)

          if (q) {
            const safe = q.replaceAll(',', ' ').trim()
            fallback = fallback.or(`nome_negocio.ilike.%${safe}%,slug.ilike.%${safe}%,email.ilike.%${safe}%,telefone.ilike.%${safe}%`)
          }
          if (plano) {
            if (plano === 'pro') {
              fallback = fallback.in('plano', ['pro', 'team'])
            } else {
              fallback = fallback.eq('plano', plano)
            }
          }
          if (statusPagamento) fallback = fallback.eq('status_pagamento', statusPagamento)
          if (ativo) fallback = fallback.eq('ativo', ativo === 'true')

          const { data: data2, error: err2 } = await fallback
          if (err2) {
            setError(err2.message)
            setLoading(false)
            return
          }
          setClientes((data2 ?? []) as unknown as Cliente[])
          setLoading(false)
          return
        }

        setError(msg)
        setLoading(false)
        return
      }
      setClientes((data ?? []) as unknown as Cliente[])
      setLoading(false)
    }
    const t = window.setTimeout(() => {
      run().catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Erro ao carregar')
        setLoading(false)
      })
    }, 250)
    return () => window.clearTimeout(t)
  }, [ativo, plano, query, statusPagamento])

  const enableTemaProspectorSelected = async (enabled: boolean) => {
    if (selectedCount === 0) return
    setUpdatingTemaProspector(true)
    setError(null)
    const patch: Record<string, unknown> = enabled
      ? {
          tema_prospector_habilitado: true,
        }
      : {
          tema_prospector_habilitado: false,
        }

    const { error: err } = await supabase.from('usuarios').update(patch).in('id', selectedIds)
    if (err) {
      const msg = err.message
      if (msg.toLowerCase().includes('does not exist') && msg.toLowerCase().includes('column')) {
        setError('Seu Supabase não tem a coluna de habilitação do Tema Prospector. Em /admin/configuracoes, execute o bloco “SQL do Tema Prospector (habilitação por cliente)”.')
      } else {
        setError(msg)
      }
      setUpdatingTemaProspector(false)
      return
    }

    setClientes((prev) => prev.map((c) => (selectedIds.includes(c.id) ? { ...c, tema_prospector_habilitado: enabled } : c)))
    setUpdatingTemaProspector(false)
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <Card>
          <div className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Filtros</div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Input label="Busca" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, /slug, email, telefone" />
              <label className="block">
                <div className="text-sm font-medium text-slate-700 mb-1">Plano</div>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                  value={plano}
                  onChange={(e) => setPlano(e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="free">FREE</option>
                  <option value="basic">BASIC</option>
                  <option value="pro">PRO</option>
                  <option value="enterprise">EMPRESA</option>
                </select>
              </label>
              <label className="block">
                <div className="text-sm font-medium text-slate-700 mb-1">Status pagamento</div>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                  value={statusPagamento}
                  onChange={(e) => setStatusPagamento(e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="ativo">ativo</option>
                  <option value="trial">trial</option>
                  <option value="inadimplente">inadimplente</option>
                  <option value="suspenso">suspenso</option>
                  <option value="cancelado">cancelado</option>
                </select>
              </label>
              <label className="block">
                <div className="text-sm font-medium text-slate-700 mb-1">Ativo</div>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                  value={ativo}
                  onChange={(e) => setAtivo(e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </label>
            </div>
            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('')
                  setPlano('')
                  setStatusPagamento('')
                  setAtivo('')
                }}
                disabled={!canClear}
              >
                Limpar
              </Button>
            </div>
          </div>
        </Card>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

        {schemaTemaProspectorIncompleto ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Seu Supabase ainda não tem a coluna do Tema Prospector por cliente. Execute o bloco “SQL do Tema Prospector (habilitação por cliente)” em{' '}
            <span className="font-mono text-xs">/admin/configuracoes</span>.
          </div>
        ) : null}

        {!loading && !error && clientes.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Nenhum cliente retornado.
            <div className="mt-1 text-amber-900">
              Se você já possui clientes no Supabase, normalmente é falta de políticas (RLS) na tabela
              <span className="font-mono text-xs"> public.usuarios</span> ou o cliente existe apenas no Auth e não na tabela
              <span className="font-mono text-xs"> usuarios</span>.
            </div>
            <div className="mt-2">
              Acesse <span className="font-mono text-xs">/admin/configuracoes</span> e execute o bloco “SQL de políticas (Super Admin)” no SQL Editor do Supabase.
            </div>
          </div>
        ) : null}
        <Card>
          <div className="divide-y divide-slate-100">
            <div className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-600">Selecionados: {selectedCount}</div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void enableTemaProspectorSelected(true)} disabled={selectedCount === 0 || updatingTemaProspector || schemaTemaProspectorIncompleto}>
                  Habilitar Tema Prospector
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void enableTemaProspectorSelected(false)}
                  disabled={selectedCount === 0 || updatingTemaProspector || schemaTemaProspectorIncompleto}
                >
                  Desabilitar Tema Prospector
                </Button>
                <Button variant="secondary" onClick={selectAllFiltered} disabled={loading || filteredClientes.length === 0}>
                  Selecionar filtrados
                </Button>
                <Button variant="secondary" onClick={clearSelection} disabled={selectedCount === 0}>
                  Limpar seleção
                </Button>
              </div>
            </div>
            {loading ? (
              <div className="p-6 text-sm text-slate-600">Carregando…</div>
            ) : clientes.length === 0 ? (
              <div className="p-6 text-sm text-slate-600">Nenhum cliente.</div>
            ) : (
              clientes.map((c) => (
                <div key={c.id} className="p-4 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={selected[c.id] === true}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                        className="mt-1"
                      />
                      <div className="min-w-0">
                        <Link to={`/admin/clientes/${c.id}`} className="block min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">{c.nome_negocio}</div>
                          <div className="text-sm text-slate-600 truncate">/{c.slug}</div>
                        </Link>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.tema_prospector_habilitado === true ? <Badge tone="slate">Tema Prospector</Badge> : null}
                      {c.ativo ? <Badge tone="green">Ativo</Badge> : <Badge tone="red">Inativo</Badge>}
                      <Badge tone="slate">{normalizePlanoLabel(c.plano)}</Badge>
                      <Badge tone={c.status_pagamento === 'inadimplente' ? 'red' : 'slate'}>{c.status_pagamento}</Badge>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </AdminShell>
  )
}
