import { useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { supabase, supabaseEnv } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

function getOptionalString(payload: unknown, key: string) {
  if (!payload || typeof payload !== 'object') return null
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

function isWorkerLimitResponse(args: { status: number; body: unknown }) {
  if (args.status === 546) return true
  if (!args.body || typeof args.body !== 'object') return false
  return (args.body as Record<string, unknown>).code === 'WORKER_LIMIT'
}

async function callWhatsappFunction(body: unknown) {
  if (!supabaseEnv.ok) {
    return { ok: false as const, status: 0, body: { error: 'missing_supabase_env' } }
  }

  const supabaseUrl = supabaseEnv.values.VITE_SUPABASE_URL
  const supabaseAnonKey = supabaseEnv.values.VITE_SUPABASE_ANON_KEY

  const tryRefresh = async () => {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
    if (refreshErr) return null
    return refreshed.session ?? null
  }

  const { data: sessionData } = await supabase.auth.getSession()
  let session = sessionData.session
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = session?.expires_at ?? null

  if (session && expiresAt && expiresAt <= now + 60) {
    const refreshed = await tryRefresh()
    if (refreshed) session = refreshed
  }

  const accessToken = session?.access_token ?? null
  if (!accessToken) {
    return { ok: false as const, status: 401, body: { error: 'session_expired' } }
  }

  const callFetch = async (token: string) => {
    const fnUrl = `${supabaseUrl}/functions/v1/whatsapp`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 45000)
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'x-user-jwt': token,
      }
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      })

      const fnVersion = res.headers.get('x-smagenda-fn')

      let text = ''
      try {
        text = await res.text()
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Falha de rede'
        return { ok: false as const, status: 0, body: { error: 'network_error', message: msg } }
      }

      let parsed: unknown = null
      try {
        parsed = text ? JSON.parse(text) : null
      } catch {
        parsed = text
      }

      if (!res.ok && res.status === 401 && !fnVersion) {
        if (
          parsed &&
          typeof parsed === 'object' &&
          (parsed as Record<string, unknown>).message === 'Invalid JWT' &&
          (parsed as Record<string, unknown>).code === 401
        ) {
          return { ok: false as const, status: 401, body: { error: 'supabase_gateway_invalid_jwt' } }
        }
      }

      if (!res.ok) return { ok: false as const, status: res.status, body: parsed }
      return { ok: true as const, status: res.status, body: parsed }
    } catch (e: unknown) {
      const errAny = e as { name?: unknown; message?: unknown }
      const name = typeof errAny.name === 'string' ? errAny.name : ''
      const msg = typeof errAny.message === 'string' ? errAny.message : 'Falha de rede'
      const lower = msg.toLowerCase()
      const isAbort = name === 'AbortError' || lower.includes('aborted') || lower.includes('abort')
      if (isAbort) return { ok: false as const, status: 0, body: { error: 'timeout' } }
      return { ok: false as const, status: 0, body: { error: 'network_error', message: msg } }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  const isInvalidJwtPayload = (payload: unknown) => {
    if (typeof payload === 'string') return payload.includes('Invalid JWT')
    if (!payload || typeof payload !== 'object') return false
    const obj = payload as Record<string, unknown>
    return obj.message === 'Invalid JWT' || obj.error === 'invalid_jwt'
  }

  const first = await callFetch(accessToken)

  const action = (() => {
    if (!body || typeof body !== 'object') return null
    const raw = (body as Record<string, unknown>).action
    return typeof raw === 'string' ? raw : null
  })()

  if (!first.ok && first.status === 0 && action === 'status') {
    await new Promise((r) => setTimeout(r, 300))
    return callFetch(accessToken)
  }

  if (
    !first.ok &&
    first.status === 401 &&
    typeof first.body === 'object' &&
    first.body !== null &&
    (first.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt'
  ) {
    return first
  }

  if (!first.ok && first.status === 401 && isInvalidJwtPayload(first.body)) {
    const refreshed = await tryRefresh()
    const nextToken = refreshed?.access_token ?? null
    if (!nextToken) return { ok: false as const, status: 401, body: { error: 'invalid_jwt' } }

    const second = await callFetch(nextToken)
    if (!second.ok && second.status === 401 && isInvalidJwtPayload(second.body)) {
      return { ok: false as const, status: 401, body: { error: 'invalid_jwt' } }
    }
    return second
  }

  return first
}

export function WhatsappSettingsPage() {
  const { principal } = useAuth()
  const usuarioId = principal?.kind === 'usuario' ? principal.profile.id : null

  const [apiUrl, setApiUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [whatsappHabilitado, setWhatsappHabilitado] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [instanceState, setInstanceState] = useState<string | null>(null)
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [testNumber, setTestNumber] = useState('')
  const [testText, setTestText] = useState('Olá! Teste de envio do SMagenda.')
  const [diagnostic, setDiagnostic] = useState<string | null>(null)
  const [runningDiagnostic, setRunningDiagnostic] = useState(false)

  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const configurado = useMemo(() => Boolean(apiUrl.trim() && apiKey.trim()), [apiUrl, apiKey])
  const habilitado = useMemo(() => (whatsappHabilitado === null ? true : Boolean(whatsappHabilitado)), [whatsappHabilitado])

  const runDiagnostic = async () => {
    setRunningDiagnostic(true)
    setDiagnostic(null)
    try {
      const lines: string[] = []
      lines.push(`at=${new Date().toISOString()}`)
      lines.push(`principal_kind=${principal?.kind ?? 'null'}`)
      lines.push(`usuario_id=${usuarioId ?? 'null'}`)
      lines.push(`supabase_env_ok=${supabaseEnv.ok ? 'true' : 'false'}`)
      if (!supabaseEnv.ok) lines.push(`supabase_env_missing=${supabaseEnv.missing.join(',')}`)

      const { data: sessionData } = await supabase.auth.getSession()
      const sess = sessionData.session
      lines.push(`session_present=${sess ? 'true' : 'false'}`)
      lines.push(`session_user_id=${sess?.user?.id ?? 'null'}`)
      lines.push(`session_expires_at=${sess?.expires_at ?? 'null'}`)
      lines.push(`session_access_token_len=${sess?.access_token ? String(sess.access_token).length : '0'}`)
      if (supabaseEnv.ok) {
        const key = supabaseEnv.values.VITE_SUPABASE_ANON_KEY
        const kind = key.startsWith('sb_') ? 'sb_key' : key.split('.').length === 3 ? 'jwt' : 'unknown'
        lines.push(`supabase_key_kind=${kind}`)
      }

      const userRes = await supabase.auth.getUser()
      lines.push(`get_user_ok=${userRes.error ? 'false' : userRes.data.user ? 'true' : 'false'}`)
      if (userRes.error) {
        const errAny = userRes.error as unknown as { status?: unknown; message?: unknown; name?: unknown }
        const status = typeof errAny.status === 'number' ? errAny.status : 0
        const message = typeof errAny.message === 'string' ? errAny.message : ''
        const name = typeof errAny.name === 'string' ? errAny.name : ''
        lines.push(`get_user_error_status=${status}`)
        lines.push(`get_user_error_name=${name || 'unknown'}`)
        lines.push(`get_user_error_message=${message || 'unknown'}`)
      }

      if (userRes.data.user?.id) {
        const dbRes = await supabase.from('usuarios').select('id').eq('id', userRes.data.user.id).maybeSingle()
        lines.push(`db_usuario_row_ok=${dbRes.error ? 'false' : dbRes.data?.id ? 'true' : 'false'}`)
        if (dbRes.error) {
          lines.push(`db_usuario_error=${dbRes.error.message}`)
        }
      }

      lines.push(`whatsapp_configured=${configurado ? 'true' : 'false'}`)
      lines.push(`whatsapp_enabled=${habilitado ? 'true' : 'false'}`)
      if (configurado && habilitado) {
        if (supabaseEnv.ok && sess?.access_token) {
          const fnUrl = `${supabaseEnv.values.VITE_SUPABASE_URL}/functions/v1/whatsapp`
          let fetchStatus = 0
          let fetchBody: unknown = null
          let fetchFnVersion: string | null = null
          try {
            const fetchRes = await fetch(fnUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: supabaseEnv.values.VITE_SUPABASE_ANON_KEY,
                Authorization: `Bearer ${sess.access_token}`,
              },
              body: JSON.stringify({ action: 'status' }),
            })
            fetchStatus = fetchRes.status
            fetchFnVersion = fetchRes.headers.get('x-smagenda-fn')
            const text = await fetchRes.text()
            try {
              fetchBody = text ? JSON.parse(text) : null
            } catch {
              fetchBody = text
            }
          } catch (e: unknown) {
            fetchStatus = 0
            fetchBody = e instanceof Error ? e.message : 'Falha de rede'
          }
          lines.push(`direct_fetch_status=${fetchStatus}`)
          lines.push(`direct_fetch_fn=${fetchFnVersion ?? 'null'}`)
          lines.push(`direct_fetch_body=${typeof fetchBody === 'string' ? fetchBody : JSON.stringify(fetchBody)}`)
        }

        const raw = await supabase.functions.invoke('whatsapp', { body: { action: 'status' } })
        lines.push(`invoke_status_action_ok=${raw.error ? 'false' : 'true'}`)
        if (raw.error) {
          const errAny = raw.error as unknown as { name?: unknown; message?: unknown; context?: unknown; status?: unknown }
          const name = typeof errAny.name === 'string' ? errAny.name : 'unknown'
          const message = typeof errAny.message === 'string' ? errAny.message : 'unknown'
          const ctx = (errAny.context ?? null) as null | Record<string, unknown>
          const status = typeof (ctx?.status ?? errAny.status) === 'number' ? ((ctx?.status ?? errAny.status) as number) : 0
          const body = ctx?.body ?? null
          lines.push(`invoke_error_name=${name}`)
          lines.push(`invoke_error_message=${message}`)
          lines.push(`invoke_error_status=${status}`)
          lines.push(`invoke_error_body=${typeof body === 'string' ? body : JSON.stringify(body)}`)
        } else {
          lines.push(`invoke_data=${JSON.stringify(raw.data)}`)
        }

        const wrapped = await callWhatsappFunction({ action: 'status' })
        lines.push(`wrapped_call_ok=${wrapped.ok ? 'true' : 'false'}`)
        lines.push(`wrapped_call_status=${wrapped.status}`)
        lines.push(`wrapped_call_body=${typeof wrapped.body === 'string' ? wrapped.body : JSON.stringify(wrapped.body)}`)
      }

      setDiagnostic(lines.join('\n'))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro no diagnóstico'
      setDiagnostic(`at=${new Date().toISOString()}\nerror=${msg}`)
    } finally {
      setRunningDiagnostic(false)
    }
  }

  useEffect(() => {
    const run = async () => {
      if (!usuarioId) return
      setLoading(true)
      setError(null)
      const isMissingColumnError = (message: string) => message.toLowerCase().includes('does not exist') && message.toLowerCase().includes('column')

      const first = await supabase.from('usuarios').select('whatsapp_api_url,whatsapp_api_key,whatsapp_habilitado').eq('id', usuarioId).maybeSingle()
      if (first.error) {
        if (isMissingColumnError(first.error.message)) {
          const fallback = await supabase.from('usuarios').select('whatsapp_api_url,whatsapp_api_key').eq('id', usuarioId).maybeSingle()
          if (fallback.error) {
            setError(fallback.error.message)
            setLoading(false)
            return
          }
          const row = (fallback.data ?? null) as unknown as { whatsapp_api_url?: string | null; whatsapp_api_key?: string | null } | null
          setWhatsappHabilitado(null)
          setApiUrl(row?.whatsapp_api_url ?? '')
          setApiKey(row?.whatsapp_api_key ?? '')
          setLoading(false)
          return
        }

        setError(first.error.message)
        setLoading(false)
        return
      }

      const row = (first.data ?? null) as unknown as {
        whatsapp_api_url?: string | null
        whatsapp_api_key?: string | null
        whatsapp_habilitado?: boolean | null
      } | null

      setWhatsappHabilitado(typeof row?.whatsapp_habilitado === 'boolean' ? row.whatsapp_habilitado : null)
      setApiUrl(row?.whatsapp_api_url ?? '')
      setApiKey(row?.whatsapp_api_key ?? '')
      setLoading(false)
    }
    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar configurações')
      setLoading(false)
      setCheckingStatus(false)
    })
  }, [usuarioId])

  if (!usuarioId) {
    return (
      <AppShell>
        <div className="text-slate-700">Acesso restrito.</div>
      </AppShell>
    )
  }

  const connect = async () => {
    setError(null)
    setQrBase64(null)
    setPairingCode(null)
    if (!habilitado) {
      setError('WhatsApp desabilitado para sua conta. Solicite habilitação ao suporte.')
      return
    }
    if (!configurado) {
      setError('WhatsApp ainda não foi configurado no painel do Super Admin.')
      return
    }
    setConnecting(true)
    const res = await callWhatsappFunction({ action: 'connect' })
    if (!res.ok) {
      if (isWorkerLimitResponse({ status: res.status, body: res.body })) {
        setError('O Supabase está sem recursos para executar a Edge Function agora (WORKER_LIMIT). Aguarde 1–2 minutos e tente novamente.')
        setConnecting(false)
        return
      }
      if (
        typeof res.body === 'object' &&
        res.body !== null &&
        (res.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt'
      ) {
        setError('A Edge Function "whatsapp" está exigindo JWT no Supabase. Refaça o deploy com verify_jwt=false e tente novamente.')
        setConnecting(false)
        return
      }
      if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).error === 'invalid_jwt') {
        setError('Sessão inválida no Supabase. Saia e entre novamente no sistema.')
        setConnecting(false)
        return
      }
      if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).error === 'whatsapp_disabled') {
        setError('WhatsApp desabilitado para sua conta. Solicite habilitação ao suporte.')
        setConnecting(false)
        return
      }
      const details = typeof res.body === 'string' ? res.body : JSON.stringify(res.body)
      setError(`Falha ao gerar QR Code (HTTP ${res.status}): ${details}`)
      setConnecting(false)
      return
    }

    const initialState = getOptionalString(res.body, 'state')
    const initialQr = getOptionalString(res.body, 'qrBase64')
    const initialPairing = getOptionalString(res.body, 'pairingCode')
    let currentState: string | null = initialState
    if (initialState) setInstanceState(initialState)
    if (initialQr && initialQr.trim()) setQrBase64(initialQr)
    if (initialPairing && initialPairing.trim()) setPairingCode(initialPairing)

    for (let i = 0; i < 30; i += 1) {
      if (currentState === 'open') {
        setConnecting(false)
        return
      }
      await new Promise((r) => setTimeout(r, 4000))
      if (!aliveRef.current) return
      const next = await callWhatsappFunction({ action: 'status' })
      if (!next.ok) {
        if (isWorkerLimitResponse({ status: next.status, body: next.body })) {
          setError('O Supabase está sem recursos para executar a Edge Function agora (WORKER_LIMIT). Aguarde 1–2 minutos e tente novamente.')
          setConnecting(false)
          return
        }
        const details = typeof next.body === 'string' ? next.body : JSON.stringify(next.body)
        setError(`Falha ao verificar status (HTTP ${next.status}): ${details}`)
        setConnecting(false)
        return
      }
      const nextState = getOptionalString(next.body, 'state')
      if (nextState) {
        currentState = nextState
        setInstanceState(nextState)
      }
      if (currentState === 'open') {
        setConnecting(false)
        return
      }
    }

    const hint = getOptionalString(res.body, 'hint')
    if (hint) {
      setError(hint)
    } else {
      setError('A instância ainda não conectou. Se o QR Code expirou, gere um novo e tente novamente.')
    }
    setConnecting(false)
  }

  const disconnect = async () => {
    setError(null)
    if (!habilitado) return
    if (!configurado) return
    setDisconnecting(true)
    const res = await callWhatsappFunction({ action: 'disconnect' })
    if (!res.ok) {
      if (
        typeof res.body === 'object' &&
        res.body !== null &&
        (res.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt'
      ) {
        setError('A Edge Function "whatsapp" está exigindo JWT no Supabase. Refaça o deploy com verify_jwt=false e tente novamente.')
        setDisconnecting(false)
        return
      }
      if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).error === 'invalid_jwt') {
        setError('Sessão inválida no Supabase. Saia e entre novamente no sistema.')
        setDisconnecting(false)
        return
      }
      if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).error === 'whatsapp_disabled') {
        setError('WhatsApp desabilitado para sua conta. Solicite habilitação ao suporte.')
        setDisconnecting(false)
        return
      }
      const details = typeof res.body === 'string' ? res.body : JSON.stringify(res.body)
      setError(`Falha ao desconectar (HTTP ${res.status}): ${details}`)
      setDisconnecting(false)
      return
    }
    setInstanceState(null)
    setQrBase64(null)
    setDisconnecting(false)
  }

  const checkStatus = async () => {
    setError(null)
    if (!habilitado) {
      setError('WhatsApp desabilitado para sua conta. Solicite habilitação ao suporte.')
      return
    }
    if (!configurado) {
      setError('WhatsApp ainda não foi configurado no painel do Super Admin.')
      return
    }
    setCheckingStatus(true)
    const res = await callWhatsappFunction({ action: 'status' })
    if (!res.ok) {
      if (isWorkerLimitResponse({ status: res.status, body: res.body })) {
        setError('O Supabase está sem recursos para executar a Edge Function agora (WORKER_LIMIT). Aguarde 1–2 minutos e tente novamente.')
        setCheckingStatus(false)
        return
      }
      if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).error === 'timeout') {
        setError('Tempo esgotado ao verificar status do WhatsApp. A Edge Function pode estar temporariamente sem recursos ou indisponível. Aguarde 1–2 minutos e tente novamente.')
        setCheckingStatus(false)
        return
      }
      if (
        typeof res.body === 'object' &&
        res.body !== null &&
        (res.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt'
      ) {
        setError('A Edge Function "whatsapp" está exigindo JWT no Supabase. Refaça o deploy com verify_jwt=false e tente novamente.')
        setCheckingStatus(false)
        return
      }
      if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).error === 'invalid_jwt') {
        setError('Sessão inválida no Supabase. Saia e entre novamente no sistema.')
        setCheckingStatus(false)
        return
      }
      if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).error === 'whatsapp_disabled') {
        setError('WhatsApp desabilitado para sua conta. Solicite habilitação ao suporte.')
        setCheckingStatus(false)
        return
      }
      const details = typeof res.body === 'string' ? res.body : JSON.stringify(res.body)
      setError(`Falha ao atualizar status (HTTP ${res.status}): ${details}`)
      setCheckingStatus(false)
      return
    }
    setInstanceState(getOptionalString(res.body, 'state'))
    setCheckingStatus(false)
  }

  const sendTest = async () => {
    setError(null)
    if (!habilitado) {
      setError('WhatsApp desabilitado para sua conta. Solicite habilitação ao suporte.')
      return
    }
    if (!configurado) {
      setError('WhatsApp ainda não foi configurado no painel do Super Admin.')
      return
    }
    if (!testNumber.trim() || !testText.trim()) {
      setError('Informe número e mensagem.')
      return
    }
    setSendingTest(true)
    const res = await callWhatsappFunction({ action: 'send_test', number: testNumber, text: testText })
    if (!res.ok) {
      if (
        typeof res.body === 'object' &&
        res.body !== null &&
        (res.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt'
      ) {
        setError('A Edge Function "whatsapp" está exigindo JWT no Supabase. Refaça o deploy com verify_jwt=false e tente novamente.')
        setSendingTest(false)
        return
      }
      if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).error === 'invalid_jwt') {
        setError('Sessão inválida no Supabase. Saia e entre novamente no sistema.')
        setSendingTest(false)
        return
      }
      if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).error === 'whatsapp_disabled') {
        setError('WhatsApp desabilitado para sua conta. Solicite habilitação ao suporte.')
        setSendingTest(false)
        return
      }
      const details = typeof res.body === 'string' ? res.body : JSON.stringify(res.body)
      setError(`Falha ao enviar teste (HTTP ${res.status}): ${details}`)
      setSendingTest(false)
      return
    }
    setSendingTest(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <div className="text-sm font-semibold text-slate-500">Configurações</div>
          <div className="text-xl font-semibold text-slate-900">WhatsApp</div>
        </div>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
        {saved ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Enviado.</div> : null}

        <Card>
          <div className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Status</div>
            {loading ? (
              <div className="text-sm text-slate-600">Carregando…</div>
            ) : (
              <div className="space-y-2">
                <div className="text-sm text-slate-700">Recurso: {habilitado ? '🟢 Habilitado' : '🔴 Desabilitado'}</div>
                <div className="text-sm text-slate-700">Configuração: {configurado ? '🟢 OK' : '🟡 Pendente'}</div>
                <div className="text-sm text-slate-700">Conexão: {habilitado && configurado ? (checkingStatus ? 'verificando…' : instanceState ?? '—') : '—'}</div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={checkStatus} disabled={!habilitado || !configurado || checkingStatus || connecting || disconnecting}>
                    Atualizar status
                  </Button>
                  <Button onClick={connect} disabled={!habilitado || !configurado || connecting || disconnecting}>
                    Gerar QR Code
                  </Button>
                  <Button variant="danger" onClick={disconnect} disabled={!habilitado || !configurado || disconnecting || connecting}>
                    Desconectar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Diagnóstico</div>
            <div className="text-sm text-slate-600">Verifica sessão do Supabase e resposta da função WhatsApp.</div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={runDiagnostic} disabled={runningDiagnostic || loading || connecting || disconnecting || checkingStatus}>
                {runningDiagnostic ? 'Executando…' : 'Rodar diagnóstico'}
              </Button>
            </div>
            {diagnostic ? (
              <pre className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 overflow-auto whitespace-pre-wrap">{diagnostic}</pre>
            ) : null}
          </div>
        </Card>

        {qrBase64 ? (
          <Card>
            <div className="p-6 space-y-4">
              <div className="text-sm font-semibold text-slate-900">QR Code</div>
              <div className="text-sm text-slate-600">Escaneie no WhatsApp para conectar a instância.</div>
              <div className="flex justify-center">
                <img
                  className="h-64 w-64 rounded-xl border border-slate-200 bg-white"
                  src={qrBase64.trim().toLowerCase().startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                  alt="QR Code"
                />
              </div>
            </div>
          </Card>
        ) : null}

        {pairingCode ? (
          <Card>
            <div className="p-6 space-y-4">
              <div className="text-sm font-semibold text-slate-900">Código de pareamento</div>
              <div className="text-sm text-slate-600">Use este código para conectar no WhatsApp, se solicitado.</div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-mono text-slate-900 break-all">{pairingCode}</div>
            </div>
          </Card>
        ) : null}

        <Card>
          <div className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Testar envio</div>
            <Input label="Número (com DDD)" value={testNumber} onChange={(e) => setTestNumber(e.target.value)} placeholder="11 99999-9999" />
            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-700">Mensagem</div>
              <textarea
                className="w-full min-h-[120px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                disabled={sendingTest}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={sendTest} disabled={!habilitado || !configurado || sendingTest || connecting || disconnecting}>
                Enviar teste
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
