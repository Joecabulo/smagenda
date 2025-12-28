import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

type AgendamentoRow = {
  cliente_nome: string | null
  cliente_telefone: string | null
  data: string
  hora_inicio: string
  status: string
}

type ClienteResumo = {
  telefone: string
  nome: string
  total: number
  noShows: number
  cancelados: number
  ultimoDia: string
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

export function ClientesPage() {
  const { appPrincipal } = useAuth()
  const usuario = appPrincipal?.kind === 'usuario' ? appPrincipal.profile : null
  const usuarioId = usuario?.id ?? null

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agendamentos, setAgendamentos] = useState<AgendamentoRow[]>([])
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (!usuarioId) return
    setLoading(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('agendamentos')
      .select('cliente_nome,cliente_telefone,data,hora_inicio,status')
      .eq('usuario_id', usuarioId)
      .not('cliente_telefone', 'is', null)
      .neq('cliente_telefone', '')
      .order('data', { ascending: false })
      .order('hora_inicio', { ascending: false })
      .limit(5000)

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setAgendamentos((data ?? []) as unknown as AgendamentoRow[])
    setLoading(false)
  }, [usuarioId])

  useEffect(() => {
    void (async () => {
      await Promise.resolve()
      await load()
    })().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar clientes')
      setLoading(false)
    })
  }, [load])

  const clientes = useMemo(() => {
    const map = new Map<string, ClienteResumo>()

    for (const a of agendamentos) {
      const telefone = (a.cliente_telefone ?? '').trim()
      if (!telefone) continue

      const prev = map.get(telefone)
      const nome = (a.cliente_nome ?? '').trim()
      const status = (a.status ?? '').trim().toLowerCase()
      const cancelado = status === 'cancelado'
      const noShow = status === 'nao_compareceu' || status === 'não_compareceu' || status === 'no_show'

      const next: ClienteResumo = prev
        ? { ...prev }
        : {
            telefone,
            nome: nome || 'Cliente',
            total: 0,
            noShows: 0,
            cancelados: 0,
            ultimoDia: a.data,
          }

      if (nome && (!prev || prev.nome === 'Cliente')) next.nome = nome
      if (a.data > next.ultimoDia) next.ultimoDia = a.data
      if (cancelado) next.cancelados += 1
      else next.total += 1
      if (noShow) next.noShows += 1

      map.set(telefone, next)
    }

    return Array.from(map.values()).sort((x, y) => y.ultimoDia.localeCompare(x.ultimoDia))
  }, [agendamentos])

  const filtered = useMemo(() => {
    const q = normalizeText(search.trim())
    if (!q) return clientes
    return clientes.filter((c) => {
      const hay = normalizeText(`${c.nome} ${c.telefone}`)
      return hay.includes(q)
    })
  }, [clientes, search])

  if (!usuario) {
    return (
      <AppShell>
        <div className="text-slate-700">Acesso restrito.</div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

        <Card>
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Clientes</div>
                <div className="text-xs text-slate-600">Lista baseada nos agendamentos do seu negócio.</div>
              </div>
              <div className="text-sm font-semibold text-slate-900">{clientes.length}</div>
            </div>
            <Input label="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome ou telefone" />
          </div>
        </Card>

        <Card>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="p-6 text-sm text-slate-600">Carregando…</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-sm text-slate-600">Nenhum cliente encontrado.</div>
            ) : (
              filtered.map((c) => {
                const recorrente = c.total >= 2
                return (
                  <Link key={c.telefone} to={`/clientes/${encodeURIComponent(c.telefone)}`} className="block p-4 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{c.nome}</div>
                        <div className="text-sm text-slate-600">📱 {c.telefone}</div>
                        <div className="text-xs text-slate-500">Último: {new Date(c.ultimoDia).toLocaleDateString('pt-BR')}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {recorrente ? <Badge tone="green">Recorrente</Badge> : <Badge>Novo</Badge>}
                        {c.noShows > 0 ? <Badge tone="red">No-show {c.noShows}</Badge> : null}
                        <Badge tone="slate">{c.total}</Badge>
                      </div>
                    </div>
                  </Link>
                )
              })
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
