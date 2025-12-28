import { useEffect, useMemo, useRef, useState } from 'react'
import { AdminShell } from '../../components/layout/AdminShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { supabase, supabaseEnv } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

type ClienteRow = {
  id: string
  nome_negocio: string
  slug: string
  telefone: string | null
  plano: string
  status_pagamento: string
  ativo: boolean
  whatsapp_habilitado?: boolean | null
}

type SuperAdminConfigRow = {
  id: string
  whatsapp_api_url: string | null
  whatsapp_api_key: string | null
  whatsapp_instance_name: string | null
}

async function callAdminWhatsapp(body: unknown) {
  if (!supabaseEnv.ok) {
    return { ok: false as const, status: 0, body: { error: 'missing_supabase_env', missing: supabaseEnv.missing } }
  }

  const supabaseUrl = supabaseEnv.values.VITE_SUPABASE_URL
  const supabaseAnonKey = supabaseEnv.values.VITE_SUPABASE_ANON_KEY

  const tryRefresh = async () => {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
    if (refreshErr) return null
    return refreshed.session ?? null
  }

  const getSession = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const sess = sessionData.session
    if (!sess) return null
    const expiresAt = sess.expires_at ?? null
    const now = Math.floor(Date.now() / 1000)
    if (expiresAt && expiresAt <= now + 30) {
      const refreshed = await tryRefresh()
      return refreshed ?? sess
    }
    return sess
  }

  const sess = await getSession()
  if (!sess?.access_token) {
    return { ok: false as const, status: 401, body: { error: 'unauthorized', message: 'missing_session' } }
  }

  const fnUrl = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/whatsapp`

  const post = async (token: string) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 20000)
    try {
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'x-user-jwt': token,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      const fnVersion = res.headers.get('x-smagenda-fn')

      let text = ''
      try {
        text = await res.text()
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Falha de rede'
        return { ok: false as const, status: 0, body: { error: 'network_error', message: msg }, fnVersion }
      }

      let parsed: unknown = null
      try {
        parsed = text ? JSON.parse(text) : null
      } catch {
        parsed = text
      }

      if (!res.ok) return { ok: false as const, status: res.status, body: parsed, fnVersion }
      return { ok: true as const, status: res.status, body: parsed, fnVersion }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha de rede'
      return { ok: false as const, status: 0, body: { error: 'network_error', message: msg }, fnVersion: null }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  const first = await post(sess.access_token)
  const fnVersion = first.fnVersion
  const parsed = first.body
  const resStatus = first.status
  const resOk = first.ok

  if (!resOk && resStatus === 401) {
    if (!fnVersion) {
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed as Record<string, unknown>).message === 'Invalid JWT' &&
        (parsed as Record<string, unknown>).code === 401
      ) {
        return { ok: false as const, status: 401, body: { error: 'supabase_gateway_invalid_jwt' } }
      }
    }
    const refreshed = await tryRefresh()
    if (refreshed?.access_token) {
      const second = await post(refreshed.access_token)
      if (!second.ok) {
        const withFn = second.fnVersion
          ? typeof second.body === 'object' && second.body !== null
            ? { ...(second.body as Record<string, unknown>), fn: second.fnVersion }
            : { error: 'fn_error', fn: second.fnVersion, details: second.body }
          : second.body
        return { ok: false as const, status: second.status, body: withFn }
      }
      return { ok: true as const, status: second.status, body: second.body }
    }
  }

  if (!resOk) return { ok: false as const, status: resStatus, body: parsed }
  return { ok: true as const, status: resStatus, body: parsed }
}

export function AdminWhatsappAvisosPage() {
  const { principal } = useAuth()
  const superAdminId = principal?.kind === 'super_admin' ? principal.profile.id : null

  const [configLoading, setConfigLoading] = useState(true)
  const [schemaIncompleto, setSchemaIncompleto] = useState(false)
  const [apiUrl, setApiUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [instanceName, setInstanceName] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)

  const [instanceState, setInstanceState] = useState<string | null>(null)
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const [clientesLoading, setClientesLoading] = useState(true)
  const [clientes, setClientes] = useState<ClienteRow[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [mensagem, setMensagem] = useState('')
  const [sending, setSending] = useState(false)
  const [lastSendSummary, setLastSendSummary] = useState<string | null>(null)

  const [updatingClientesWhatsapp, setUpdatingClientesWhatsapp] = useState(false)
  const [schemaClientesWhatsappIncompleto, setSchemaClientesWhatsappIncompleto] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  useEffect(() => {
    const isMissingColumnError = (message: string) => message.toLowerCase().includes('does not exist') && message.toLowerCase().includes('column')

    const loadConfig = async () => {
      if (!superAdminId) return
      setConfigLoading(true)
      setError(null)
      setLastSendSummary(null)
      setSchemaIncompleto(false)
      const { data, error: err } = await supabase
        .from('super_admin')
        .select('id,whatsapp_api_url,whatsapp_api_key,whatsapp_instance_name')
        .eq('id', superAdminId)
        .maybeSingle()
      if (err) {
        if (isMissingColumnError(err.message)) {
          setSchemaIncompleto(true)
        } else {
          setError(err.message)
        }
        setConfigLoading(false)
        return
      }

      const row = (data ?? null) as unknown as SuperAdminConfigRow | null
      setApiUrl(row?.whatsapp_api_url ?? '')
      setApiKey(row?.whatsapp_api_key ?? '')
      setInstanceName(row?.whatsapp_instance_name ?? '')
      setConfigLoading(false)
    }

    const loadClientes = async () => {
      setClientesLoading(true)
      setSchemaClientesWhatsappIncompleto(false)

      const first = await supabase
        .from('usuarios')
        .select('id,nome_negocio,slug,telefone,plano,status_pagamento,ativo,whatsapp_habilitado')
        .order('criado_em', { ascending: false })
        .limit(500)
      if (first.error) {
        if (isMissingColumnError(first.error.message)) {
          setSchemaClientesWhatsappIncompleto(true)
          const fallback = await supabase
            .from('usuarios')
            .select('id,nome_negocio,slug,telefone,plano,status_pagamento,ativo')
            .order('criado_em', { ascending: false })
            .limit(500)
          if (fallback.error) {
            const msg = fallback.error.message
            const rls = msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('permission denied')
            setError(rls ? 'Sem permissão para listar clientes. Em /admin/configuracoes, execute “SQL de políticas (Super Admin)” e “SQL do WhatsApp (Super Admin)” no Supabase.' : msg)
            setClientes([])
            setClientesLoading(false)
            return
          }
          setClientes((fallback.data ?? []) as unknown as ClienteRow[])
          setClientesLoading(false)
          return
        }

        const msg = first.error.message
        const rls = msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('permission denied')
        setError(rls ? 'Sem permissão para listar clientes. Em /admin/configuracoes, execute “SQL de políticas (Super Admin)” e “SQL do WhatsApp (Super Admin)” no Supabase.' : msg)
        setClientes([])
        setClientesLoading(false)
        return
      }

      setClientes((first.data ?? []) as unknown as ClienteRow[])
      setClientesLoading(false)
    }

    loadConfig()
      .then(() => loadClientes())
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Erro ao carregar')
      })
  }, [superAdminId])

  const conectado = useMemo(() => Boolean(apiUrl.trim() && apiKey.trim()), [apiUrl, apiKey])
  const filteredClientes = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter((c) => (c.nome_negocio ?? '').toLowerCase().includes(q) || (c.slug ?? '').toLowerCase().includes(q) || (c.telefone ?? '').toLowerCase().includes(q))
  }, [clientes, query])

  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id] === true), [selected])
  const selectedCount = selectedIds.length

  const enableWhatsappSelected = async (enabled: boolean) => {
    if (selectedCount === 0) return
    if (enabled && (!apiUrl.trim() || !apiKey.trim())) {
      setError('Preencha e salve a Evolution API acima antes de habilitar para clientes.')
      return
    }
    setUpdatingClientesWhatsapp(true)
    setError(null)
    setLastSendSummary(null)
    const patch: Record<string, unknown> = enabled
      ? {
          whatsapp_habilitado: true,
        }
      : {
          whatsapp_habilitado: false,
        }

    const { error: err } = await supabase.from('usuarios').update(patch).in('id', selectedIds)
    if (err) {
      const msg = err.message
      if (msg.toLowerCase().includes('does not exist') && msg.toLowerCase().includes('column')) {
        setError('Seu Supabase não tem a coluna de habilitação do WhatsApp. Em /admin/configuracoes, execute o bloco “SQL do WhatsApp (habilitação por cliente)”.')
      } else {
        setError(msg)
      }
      setUpdatingClientesWhatsapp(false)
      return
    }

    setClientes((prev) =>
      prev.map((c) => {
        if (!selectedIds.includes(c.id)) return c
        return { ...c, whatsapp_habilitado: enabled }
      })
    )
    setUpdatingClientesWhatsapp(false)
  }

  const saveConfig = async () => {
    if (!superAdminId) return
    if (schemaIncompleto) return
    setSavingConfig(true)
    setError(null)
    setConfigSaved(false)
    const payload = {
      whatsapp_api_url: apiUrl.trim() || null,
      whatsapp_api_key: apiKey.trim() || null,
      whatsapp_instance_name: instanceName.trim() || null,
    }
    const { error: err } = await supabase.from('super_admin').update(payload).eq('id', superAdminId)
    if (err) {
      setError(err.message)
      setSavingConfig(false)
      return
    }
    setConfigSaved(true)
    setSavingConfig(false)
  }

  const checkStatus = async () => {
    setCheckingStatus(true)
    setError(null)
    setQrBase64(null)
    setPairingCode(null)
    try {
      const res = await callAdminWhatsapp({ action: 'admin_status' })
      if (!aliveRef.current) return
      if (!res.ok) {
        if (
          typeof res.body === 'object' &&
          res.body !== null &&
          (res.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt'
        ) {
          setError('Sessão inválida no Supabase. Saia e entre novamente no sistema.')
          return
        }
        if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).hint) {
          const hint = String((res.body as Record<string, unknown>).hint)
          const details = JSON.stringify(res.body)
          setError(`Falha ao verificar status (HTTP ${res.status}): ${details}\n\nDica: ${hint}`)
          return
        }
        const details = typeof res.body === 'string' ? res.body : JSON.stringify(res.body)
        setError(`Falha ao verificar status (HTTP ${res.status}): ${details}`)
        return
      }
      const obj = res.body as Record<string, unknown>
      setInstanceState(typeof obj.state === 'string' ? obj.state : null)
    } catch (e: unknown) {
      if (!aliveRef.current) return
      setError(e instanceof Error ? e.message : 'Falha ao verificar status')
    } finally {
      if (aliveRef.current) setCheckingStatus(false)
    }
  }

  const connect = async () => {
    setConnecting(true)
    setError(null)
    setQrBase64(null)
    setPairingCode(null)

    try {
      const res = await callAdminWhatsapp({ action: 'admin_connect', number: null })
      if (!aliveRef.current) return
      if (!res.ok) {
        if (
          typeof res.body === 'object' &&
          res.body !== null &&
          (res.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt'
        ) {
          setError('Sessão inválida no Supabase. Saia e entre novamente no sistema.')
          return
        }
        if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).hint) {
          const hint = String((res.body as Record<string, unknown>).hint)
          const details = JSON.stringify(res.body)
          setError(`Falha ao gerar QR Code (HTTP ${res.status}): ${details}\n\nDica: ${hint}`)
          return
        }
        const details = typeof res.body === 'string' ? res.body : JSON.stringify(res.body)
        setError(`Falha ao gerar QR Code (HTTP ${res.status}): ${details}`)
        return
      }
      const obj = res.body as Record<string, unknown>
      setInstanceState(typeof obj.state === 'string' ? obj.state : null)
      setQrBase64(typeof obj.qrBase64 === 'string' ? obj.qrBase64 : null)
      setPairingCode(typeof obj.pairingCode === 'string' ? obj.pairingCode : null)
    } catch (e: unknown) {
      if (!aliveRef.current) return
      setError(e instanceof Error ? e.message : 'Falha ao gerar QR Code')
    } finally {
      if (aliveRef.current) setConnecting(false)
    }
  }

  const disconnect = async () => {
    setDisconnecting(true)
    setError(null)
    try {
      const res = await callAdminWhatsapp({ action: 'admin_disconnect' })
      if (!aliveRef.current) return
      if (!res.ok) {
        if (
          typeof res.body === 'object' &&
          res.body !== null &&
          (res.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt'
        ) {
          setError('Sessão inválida no Supabase. Saia e entre novamente no sistema.')
          return
        }
        if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).hint) {
          const hint = String((res.body as Record<string, unknown>).hint)
          const details = JSON.stringify(res.body)
          setError(`Falha ao desconectar (HTTP ${res.status}): ${details}\n\nDica: ${hint}`)
          return
        }
        const details = typeof res.body === 'string' ? res.body : JSON.stringify(res.body)
        setError(`Falha ao desconectar (HTTP ${res.status}): ${details}`)
        return
      }
      setInstanceState(null)
      setQrBase64(null)
      setPairingCode(null)
    } catch (e: unknown) {
      if (!aliveRef.current) return
      setError(e instanceof Error ? e.message : 'Falha ao desconectar')
    } finally {
      if (aliveRef.current) setDisconnecting(false)
    }
  }

  const selectAllFiltered = () => {
    const next: Record<string, boolean> = { ...selected }
    for (const c of filteredClientes) next[c.id] = true
    setSelected(next)
  }

  const clearSelection = () => {
    setSelected({})
  }

  const sendAvisos = async () => {
    const text = mensagem.trim()
    if (!text) {
      setError('Digite a mensagem.')
      return
    }
    if (selectedCount === 0) {
      setError('Selecione pelo menos 1 cliente.')
      return
    }
    setSending(true)
    setError(null)
    setLastSendSummary(null)
    try {
      const res = await callAdminWhatsapp({ action: 'admin_send_aviso', cliente_ids: selectedIds, text })
      if (!aliveRef.current) return
      if (!res.ok) {
        if (
          typeof res.body === 'object' &&
          res.body !== null &&
          (res.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt'
        ) {
          setError('Sessão inválida no Supabase. Saia e entre novamente no sistema.')
          return
        }
        if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).hint) {
          const hint = String((res.body as Record<string, unknown>).hint)
          const details = JSON.stringify(res.body)
          setError(`Falha ao enviar (HTTP ${res.status}): ${details}\n\nDica: ${hint}`)
          return
        }
        const details = typeof res.body === 'string' ? res.body : JSON.stringify(res.body)
        setError(`Falha ao enviar (HTTP ${res.status}): ${details}`)
        return
      }

      const obj = res.body as Record<string, unknown>
    const totals = (obj.totals ?? null) as Record<string, unknown> | null
    const sent = typeof totals?.sent === 'number' ? totals.sent : null
    const failed = typeof totals?.failed === 'number' ? totals.failed : null
    const skippedNoPhone = typeof totals?.skipped_no_phone === 'number' ? totals.skipped_no_phone : null
    const skippedInvalidPhone = typeof totals?.skipped_invalid_phone === 'number' ? totals.skipped_invalid_phone : null
    const parts = [
      sent !== null ? `enviados=${sent}` : null,
      failed !== null ? `falhas=${failed}` : null,
      skippedNoPhone !== null ? `sem_telefone=${skippedNoPhone}` : null,
      skippedInvalidPhone !== null ? `telefone_invalido=${skippedInvalidPhone}` : null,
    ].filter(Boolean)
    setLastSendSummary(parts.length ? parts.join(' • ') : 'Enviado.')
    } catch (e: unknown) {
      if (!aliveRef.current) return
      setError(e instanceof Error ? e.message : 'Falha ao enviar')
    } finally {
      if (aliveRef.current) setSending(false)
    }
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <div className="text-sm font-semibold text-slate-500">WhatsApp</div>
          <div className="text-xl font-semibold text-slate-900">Avisos para clientes</div>
        </div>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
        {configSaved ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Salvo.</div> : null}
        {lastSendSummary ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{lastSendSummary}</div> : null}

        {schemaIncompleto ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Seu Supabase ainda não tem as colunas de WhatsApp no Super Admin. Acesse <span className="font-mono text-xs">/admin/configuracoes</span> e execute o bloco “SQL do WhatsApp (Super Admin)”.
          </div>
        ) : null}

        <Card>
          <div className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Configuração</div>
            {configLoading ? <div className="text-sm text-slate-600">Carregando…</div> : null}
            <Input label="API URL" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://..." />
            <Input label="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="..." />
            <Input label="Instance name (opcional)" value={instanceName} onChange={(e) => setInstanceName(e.target.value)} placeholder="smagenda-admin" />
            <div className="flex justify-end">
              <Button onClick={saveConfig} disabled={savingConfig || schemaIncompleto}>
                Salvar
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Status e conexão</div>
            <div className="text-sm text-slate-700">Configuração: {conectado ? '🟢 OK' : '🟡 Pendente'}</div>
            <div className="text-sm text-slate-700">Conexão: {checkingStatus ? 'verificando…' : instanceState ?? '—'}</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={checkStatus} disabled={!conectado || checkingStatus || connecting || disconnecting}>
                Atualizar status
              </Button>
              <Button onClick={connect} disabled={!conectado || connecting || disconnecting}>
                Conectar
              </Button>
              <Button variant="secondary" onClick={disconnect} disabled={!conectado || disconnecting || connecting}>
                Desconectar
              </Button>
            </div>
            {pairingCode ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Código de pareamento</div>
                <div className="mt-1 font-mono text-lg tracking-wider text-slate-900">{pairingCode}</div>
              </div>
            ) : null}
            {qrBase64 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">QR Code</div>
                <div className="mt-3 flex justify-center">
                  <img src={`data:image/png;base64,${qrBase64}`} alt="QR Code" className="h-64 w-64" />
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <div className="p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Destinatários</div>
                <div className="text-sm text-slate-600">Selecionados: {selectedCount}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => void enableWhatsappSelected(true)}
                  disabled={selectedCount === 0 || updatingClientesWhatsapp || schemaIncompleto}
                >
                  Habilitar WhatsApp
                </Button>
                <Button variant="secondary" onClick={() => void enableWhatsappSelected(false)} disabled={selectedCount === 0 || updatingClientesWhatsapp}>
                  Desabilitar WhatsApp
                </Button>
                <Button variant="secondary" onClick={selectAllFiltered} disabled={clientesLoading || filteredClientes.length === 0}>
                  Selecionar filtrados
                </Button>
                <Button variant="secondary" onClick={clearSelection} disabled={selectedCount === 0}>
                  Limpar
                </Button>
              </div>
            </div>

            {schemaClientesWhatsappIncompleto ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Seu Supabase ainda não tem a coluna de habilitação do WhatsApp por cliente. Execute o bloco “SQL do WhatsApp (habilitação por cliente)” em <span className="font-mono text-xs">/admin/configuracoes</span>.
              </div>
            ) : null}

            <Input label="Buscar" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, slug ou telefone" />

            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="divide-y divide-slate-100">
                {clientesLoading ? (
                  <div className="p-4 text-sm text-slate-600">Carregando…</div>
                ) : filteredClientes.length === 0 ? (
                  <div className="p-4 text-sm text-slate-600">Nenhum cliente.</div>
                ) : (
                  filteredClientes.map((c) => (
                    <label key={c.id} className="flex items-start gap-3 p-4 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected[c.id] === true}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{c.nome_negocio}</div>
                            <div className="text-sm text-slate-600">/{c.slug}</div>
                            {c.telefone ? <div className="text-sm text-slate-600">{c.telefone}</div> : <div className="text-sm text-slate-600">Sem telefone</div>}
                          </div>
                        <div className="flex items-center gap-2">
                          {c.whatsapp_habilitado === true ? <Badge tone="green">WhatsApp</Badge> : <Badge tone="yellow">Sem WhatsApp</Badge>}
                          {c.ativo ? <Badge tone="green">Ativo</Badge> : <Badge tone="red">Inativo</Badge>}
                          <Badge tone="slate">{c.plano}</Badge>
                          <Badge tone={c.status_pagamento === 'inadimplente' ? 'red' : 'slate'}>{c.status_pagamento}</Badge>
                        </div>
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Mensagem</div>
            <textarea
              className="w-full min-h-[140px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Digite o aviso..."
            />
            <div className="flex justify-end">
              <Button onClick={sendAvisos} disabled={sending || selectedCount === 0 || !conectado}>
                Enviar avisos
              </Button>
            </div>
            {!conectado ? <div className="text-sm text-slate-600">Configure a Evolution API e conecte o WhatsApp para enviar.</div> : null}
          </div>
        </Card>
      </div>
    </AdminShell>
  )
}
