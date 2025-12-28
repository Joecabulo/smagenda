import { useEffect, useMemo, useState } from 'react'
import { AdminShell } from '../../components/layout/AdminShell'
import { Card } from '../../components/ui/Card'
import { supabase } from '../../lib/supabase'

type AuditLogRow = {
  id: string
  criado_em: string
  usuario_id: string | null
  tabela: string
  acao: string
  registro_id: string | null
  ator_email: string | null
}

type UsuarioMini = { id: string; nome_negocio: string; slug: string }

export function AdminLogsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<AuditLogRow[]>([])
  const [usuariosById, setUsuariosById] = useState<Record<string, UsuarioMini>>({})

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)

      const { data, error: err } = await supabase
        .from('audit_logs')
        .select('id,criado_em,usuario_id,tabela,acao,registro_id,ator_email')
        .order('criado_em', { ascending: false })
        .limit(200)
      if (err) {
        const msg = err.message
        const missingTable = msg.includes("Could not find the table 'public.audit_logs'") || msg.includes('schema cache')
        setError(missingTable ? 'Tabela audit_logs não configurada. Acesse /admin/configuracoes e execute o bloco “SQL de Logs de Auditoria” no Supabase.' : msg)
        setLoading(false)
        return
      }
      const rows = (data ?? []) as unknown as AuditLogRow[]
      setLogs(rows)

      const ids = Array.from(new Set(rows.map((r) => r.usuario_id))).filter(Boolean)
      if (ids.length === 0) {
        setUsuariosById({})
        setLoading(false)
        return
      }

      const { data: usuariosData, error: usuariosErr } = await supabase.from('usuarios').select('id,nome_negocio,slug').in('id', ids)
      if (usuariosErr) {
        setError(usuariosErr.message)
        setLoading(false)
        return
      }

      const nextMap: Record<string, UsuarioMini> = {}
      for (const u of (usuariosData ?? []) as unknown as UsuarioMini[]) {
        nextMap[u.id] = u
      }
      setUsuariosById(nextMap)
      setLoading(false)
    }
    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar')
      setLoading(false)
    })
  }, [])

  const items = useMemo(() => {
    return logs.map((l) => ({
      ...l,
      usuario: l.usuario_id ? usuariosById[l.usuario_id] ?? null : null,
    }))
  }, [logs, usuariosById])

  return (
    <AdminShell>
      <div className="space-y-6">
        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
        <Card>
          <div className="p-6">
            <div className="text-sm font-semibold text-slate-900">Atividade recente</div>
            <div className="text-sm text-slate-600">Logs de auditoria (todos os clientes)</div>
          </div>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="p-6 text-sm text-slate-600">Carregando…</div>
            ) : items.length === 0 ? (
              <div className="p-6 text-sm text-slate-600">Sem dados.</div>
            ) : (
              items.map((l) => (
                <div key={l.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {l.usuario ? l.usuario.nome_negocio : l.usuario_id ?? '—'} • {l.acao.toUpperCase()} {l.tabela}
                      </div>
                      <div className="text-sm text-slate-600">
                        {l.criado_em}
                        {l.usuario ? ` • /${l.usuario.slug}` : ''}
                        {l.ator_email ? ` • ${l.ator_email}` : ''}
                        {l.registro_id ? ` • ${l.registro_id}` : ''}
                      </div>
                    </div>
                    <div className="text-sm font-medium text-slate-700">{l.tabela}</div>
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
