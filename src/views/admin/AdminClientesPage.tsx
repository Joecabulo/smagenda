import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminShell } from '../../components/layout/AdminShell'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { supabase } from '../../lib/supabase'

type Cliente = {
  id: string
  nome_negocio: string
  slug: string
  plano: string
  status_pagamento: string
  ativo: boolean
}

export function AdminClientesPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      const { data, error: err } = await supabase
        .from('usuarios')
        .select('id,nome_negocio,slug,plano,status_pagamento,ativo')
        .order('criado_em', { ascending: false })
        .limit(500)
      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }
      setClientes((data ?? []) as unknown as Cliente[])
      setLoading(false)
    }
    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar')
      setLoading(false)
    })
  }, [])

  return (
    <AdminShell>
      <div className="space-y-6">
        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

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
            {loading ? (
              <div className="p-6 text-sm text-slate-600">Carregando…</div>
            ) : clientes.length === 0 ? (
              <div className="p-6 text-sm text-slate-600">Nenhum cliente.</div>
            ) : (
              clientes.map((c) => (
                <Link key={c.id} to={`/admin/clientes/${c.id}`} className="block p-4 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{c.nome_negocio}</div>
                      <div className="text-sm text-slate-600">/{c.slug}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.ativo ? <Badge tone="green">Ativo</Badge> : <Badge tone="red">Inativo</Badge>}
                      <Badge tone="slate">{c.plano}</Badge>
                      <Badge tone={c.status_pagamento === 'inadimplente' ? 'red' : 'slate'}>{c.status_pagamento}</Badge>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>
    </AdminShell>
  )
}
