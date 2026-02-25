import { useEffect, useMemo, useState } from 'react'
import { AdminShell } from '../../components/layout/AdminShell'
import { Card } from '../../components/ui/Card'
import { supabase } from '../../lib/supabase'

type UsuarioRow = { id: string; ativo: boolean; plano: string; status_pagamento: string }

export function AdminDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([])

  const resumo = useMemo(() => {
    const total = usuarios.length
    const ativos = usuarios.filter((u) => u.ativo).length
    const inadimplente = usuarios.filter((u) => u.status_pagamento === 'inadimplente').length
    return { total, ativos, inadimplente }
  }, [usuarios])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      const { data, error: err } = await supabase.from('usuarios').select('id,ativo,plano,status_pagamento').order('created_at', { ascending: false }).limit(500)
      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }
      setUsuarios((data ?? []) as unknown as UsuarioRow[])
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

        {!loading && !error && usuarios.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Nenhum cliente retornado do banco.
            <div className="mt-1 text-amber-900">
              Se você já tem clientes no Supabase, isso geralmente indica políticas (RLS) faltando na tabela
              <span className="font-mono text-xs"> public.usuarios</span>.
            </div>
            <div className="mt-2">
              Abra <span className="font-mono text-xs">/admin/configuracoes</span> e execute o bloco “SQL de políticas (Super Admin)” no SQL Editor do Supabase.
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <div className="p-6">
              <div className="text-sm text-slate-600">Total de clientes</div>
              <div className="text-2xl font-semibold text-slate-900">{loading ? '—' : resumo.total}</div>
            </div>
          </Card>
          <Card>
            <div className="p-6">
              <div className="text-sm text-slate-600">Ativos</div>
              <div className="text-2xl font-semibold text-slate-900">{loading ? '—' : resumo.ativos}</div>
            </div>
          </Card>
          <Card>
            <div className="p-6">
              <div className="text-sm text-slate-600">Inadimplentes</div>
              <div className="text-2xl font-semibold text-slate-900">{loading ? '—' : resumo.inadimplente}</div>
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  )
}
