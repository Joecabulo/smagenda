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

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR')
}

function parseRegistroId(input: string | null) {
  if (!input) return null
  if (input.includes('|') && !input.includes(':')) {
    const parts = input.split('|')
    if (parts.length < 2) return { raw: input }
    return { messageId: parts[0] || null, instanceName: parts[1] || null, masked: parts[2] || null, raw: input }
  }
  const [type, ...rest] = input.split(':')
  if (!rest.length) return { raw: input }
  const value = rest.join(':')
  const parts = value.split('|')
  return { type, value, parts, raw: input }
}

function describeLog(l: AuditLogRow, usuario: UsuarioMini | null) {
  const action = (l.acao ?? '').toString()
  const actionKey = action.toLowerCase()
  const table = (l.tabela ?? '').toString()
  const tableKey = table.toLowerCase()
  const tableLabel =
    tableKey === 'usuarios'
      ? 'Usuário'
      : tableKey === 'funcionarios'
        ? 'Funcionário'
      : tableKey === 'agendamentos'
        ? 'Agendamento'
        : tableKey === 'auth'
          ? 'Autenticação'
        : tableKey === 'whatsapp_webhook'
          ? 'WhatsApp'
          : table
  const actionLabel =
    tableKey === 'auth' && actionKey === 'login'
      ? 'Login realizado'
      : tableKey === 'usuarios' && actionKey === 'insert'
        ? 'Novo cadastro de usuário'
        : tableKey === 'usuarios' && actionKey === 'update'
          ? 'Dados do usuário atualizados'
          : tableKey === 'usuarios' && actionKey === 'delete'
            ? 'Usuário removido'
            : tableKey === 'funcionarios' && actionKey === 'insert'
              ? 'Funcionário adicionado'
              : tableKey === 'funcionarios' && actionKey === 'update'
                ? 'Funcionário atualizado'
                : tableKey === 'funcionarios' && actionKey === 'delete'
                  ? 'Funcionário removido'
                  : actionKey === 'insert'
                    ? `Criado em ${tableLabel}`
                    : actionKey === 'update'
                      ? `Atualizado em ${tableLabel}`
                      : actionKey === 'delete'
                        ? `Excluído em ${tableLabel}`
                        : actionKey === 'webhook_invalid_key'
                          ? 'Webhook recusado: API Key inválida'
                          : actionKey === 'webhook_secret_invalid'
                            ? 'Webhook recusado: segredo inválido'
                        : actionKey === 'received'
                          ? 'Webhook recebido'
                          : actionKey === 'processing'
                            ? 'Webhook processando'
                            : actionKey === 'skip_no_text'
                              ? 'Webhook ignorado: sem texto'
                              : actionKey === 'skip_from_me'
                                ? 'Webhook ignorado: mensagem enviada por você'
                                : actionKey === 'skip_group'
                                  ? 'Webhook ignorado: grupo'
                                  : actionKey === 'skip_no_phone'
                                    ? 'Webhook ignorado: sem telefone'
                                    : action
  const registro = parseRegistroId(l.registro_id)
  const registroLabel =
    tableKey === 'whatsapp_webhook' && registro
      ? [registro.instanceName ? `instância ${registro.instanceName}` : null, registro.masked ? `tel ${registro.masked}` : null, registro.messageId ? `msg ${registro.messageId}` : null]
          .filter(Boolean)
          .join(' • ')
      : registro?.type === 'cadastro'
        ? `cadastro ${registro.value}`
        : registro?.type === 'usuario'
          ? `usuário ${registro.value}`
          : registro?.type === 'funcionario'
            ? (() => {
                const nome = registro.parts?.[0]?.trim()
                const email = registro.parts?.[1]?.trim()
                if (nome && email) return `funcionário ${nome} (${email})`
                if (nome) return `funcionário ${nome}`
                if (email) return `funcionário ${email}`
                return registro.value
              })()
            : registro?.type === 'agendamento'
              ? `cliente ${registro.value}`
              : registro?.type === 'login'
                ? `perfil ${registro.value}`
                : l.registro_id
  const usuarioLabel = usuario ? usuario.nome_negocio : l.usuario_id ?? '—'
  return { title: `${usuarioLabel} • ${actionLabel} • ${tableLabel}`, registroLabel }
}

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
                      {(() => {
                        const usuario = l.usuario ? l.usuario : null
                        const desc = describeLog(l, usuario)
                        return (
                          <>
                      <div className="text-sm font-semibold text-slate-900">
                        {desc.title}
                      </div>
                      <div className="text-sm text-slate-600">
                        {formatDateTime(l.criado_em)}
                        {l.usuario ? ` • /${l.usuario.slug}` : ''}
                        {l.ator_email ? ` • ${l.ator_email}` : ''}
                        {desc.registroLabel ? ` • ${desc.registroLabel}` : ''}
                      </div>
                          </>
                        )
                      })()}
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
