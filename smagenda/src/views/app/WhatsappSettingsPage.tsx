import { useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { PageTutorial, TutorialOverlay } from '../../components/ui/TutorialOverlay'
import { checkJwtProject, supabase, supabaseEnv } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

function getOptionalString(payload: unknown, key: string) {
  if (!payload || typeof payload !== 'object') return null
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

function formatDetails(payload: unknown) {
  if (typeof payload === 'string') {
    const s = payload.trim()
    const lower = s.toLowerCase()
    const isHtml = lower.includes('<!doctype html') || lower.includes('<html') || lower.includes('<head')
    const isCloudflare =
      lower.includes('cloudflare tunnel error') ||
      (lower.includes('cloudflare') && (lower.includes('cf-ray') || lower.includes('tunnel') || lower.includes('cloudflareapps')))
    if (isCloudflare) return 'Cloudflare Tunnel indisponível. Verifique Cloudflare Tunnel ativo e URL da Evolution API.'
    if (isHtml) return 'Resposta HTML inesperada ao chamar o WhatsApp. Verifique proxy/túnel e a URL configurada.'
    if (s.length > 900) return `${s.slice(0, 900)}…`
    return s
  }
  if (payload && typeof payload === 'object') {
    const msg = getOptionalString(payload, 'message') ?? getOptionalString(payload, 'details') ?? getOptionalString(payload, 'error')
    if (msg) return formatDetails(msg)
  }
  try {
    const s = JSON.stringify(payload)
    if (s.length > 900) return `${s.slice(0, 900)}…`
    return s
  } catch {
    return String(payload)
  }
}

function isWorkerLimitResponse(args: { status: number; body: unknown }) {
  if (args.status === 546) return true
  if (!args.body || typeof args.body !== 'object') return false
  return (args.body as Record<string, unknown>).code === 'WORKER_LIMIT'
}

async function callWhatsappFunction(body: unknown, opts?: { timeoutMs?: number }) {
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

  const tokenProject = checkJwtProject(accessToken, supabaseUrl)
  if (!tokenProject.ok) {
    await supabase.auth.signOut().catch(() => undefined)
    return { ok: false as const, status: 401, body: { error: 'jwt_project_mismatch', iss: tokenProject.iss, expected: tokenProject.expectedPrefix } }
  }

  const callFetch = async (token: string) => {
    const fnUrl = `${supabaseUrl}/functions/v1/whatsapp`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 45000)
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
  const { appPrincipal } = useAuth()
  const usuarioId = appPrincipal?.kind === 'usuario' ? appPrincipal.profile.id : null

  const tutorialSteps = useMemo(
    () =>
      [
        {
          title: 'Status e pré-requisitos',
          body: 'Verifique se o recurso está habilitado e se a configuração do WhatsApp está OK. Se estiver pendente, o Super Admin precisa concluir a configuração.',
          target: 'status' as const,
        },
        {
          title: 'Conectar com QR Code',
          body: 'Clique em "Conectar (QR Code)" e escaneie o QR Code no WhatsApp para vincular a instância.',
          target: 'qr' as const,
        },
        {
          title: 'Testar envio',
          body: 'Envie uma mensagem de teste para validar que está tudo funcionando em produção.',
          target: 'test' as const,
        },
      ] as const,
    []
  )

  const [configurado, setConfigurado] = useState(false)
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
  const [testNumber, setTestNumber] = useState('')
  const [testText, setTestText] = useState('Olá! Teste de envio do SMagenda.')

  const aliveRef = useRef(true)
  const allowStatusRef = useRef(false)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const habilitado = useMemo(() => (whatsappHabilitado === null ? true : Boolean(whatsappHabilitado)), [whatsappHabilitado])

  const callWhatsapp = async (body: unknown) => {
    const action = (() => {
      if (!body || typeof body !== 'object') return null
      const raw = (body as Record<string, unknown>).action
      return typeof raw === 'string' ? raw : null
    })()

    if (action === 'status' && !allowStatusRef.current) {
      return { ok: false as const, status: 0, body: { error: 'status_not_allowed' } }
    }

    return callWhatsappFunction(body)
  }

  useEffect(() => {
    const run = async () => {
      if (!usuarioId) return
      setLoading(true)
      setError(null)
      setInstanceState(null)
      const isMissingColumnError = (message: string) => message.toLowerCase().includes('does not exist') && message.toLowerCase().includes('column')

      let enabled: boolean | null = null

      const first = await supabase.from('usuarios').select('whatsapp_habilitado').eq('id', usuarioId).maybeSingle()
      if (first.error) {
        if (isMissingColumnError(first.error.message)) {
          enabled = null
          setWhatsappHabilitado(null)
        } else {
          setError(first.error.message)
          setConfigurado(false)
          setLoading(false)
          return
        }
      } else {
        const row = (first.data ?? null) as unknown as { whatsapp_habilitado?: boolean | null } | null
        enabled = typeof row?.whatsapp_habilitado === 'boolean' ? row.whatsapp_habilitado : null
        setWhatsappHabilitado(enabled)
      }
      const cfg = await callWhatsappFunction({ action: 'config_status' })
      if (!cfg.ok) {
        const hint = cfg.body && typeof cfg.body === 'object' ? getOptionalString(cfg.body, 'hint') : null
        const details = typeof cfg.body === 'string' ? cfg.body : JSON.stringify(cfg.body)
        setError(hint ? `Falha ao carregar configuração do WhatsApp: ${details} | Dica: ${hint}` : `Falha ao carregar configuração do WhatsApp: ${details}`)
        setConfigurado(false)
        setLoading(false)
        return
      }

      const configured = cfg.body && typeof cfg.body === 'object' ? Boolean((cfg.body as Record<string, unknown>).configured) : false
      setConfigurado(configured)

      const enabledSafe = enabled === null ? true : Boolean(enabled)
      if (enabledSafe && configured) {
        const quick = await callWhatsappFunction({ action: 'status' }, { timeoutMs: 6000 })
        if (!aliveRef.current) return
        if (quick.ok && quick.body && typeof quick.body === 'object') {
          const s = getOptionalString(quick.body, 'state')
          setInstanceState(s)
          if (s === 'open') {
            setQrBase64(null)
          }
        }
      }
      setLoading(false)
    }
    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar configurações')
      setConfigurado(false)
      setLoading(false)
      setCheckingStatus(false)
    })
  }, [usuarioId])

  if (!usuarioId) {
    return (
      <AppShell>
        <div className="text-slate-700">{appPrincipal ? 'Acesso restrito.' : 'Carregando…'}</div>
      </AppShell>
    )
  }

  const connect = async () => {
    setError(null)
    setQrBase64(null)
    if (!habilitado) {
      setError('WhatsApp desabilitado para sua conta. Solicite habilitação ao suporte.')
      return
    }
    if (!configurado) {
      setError('WhatsApp ainda não foi configurado no painel do Super Admin.')
      return
    }
    setConnecting(true)
    allowStatusRef.current = true
    const res = await callWhatsapp({ action: 'connect' })
    if (!res.ok) {
      if (isWorkerLimitResponse({ status: res.status, body: res.body })) {
        setError('O Supabase está sem recursos para executar a Edge Function agora (WORKER_LIMIT). Aguarde 1–2 minutos e tente novamente.')
        setConnecting(false)
        return
      }
      if (res.status === 0 && typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).error === 'timeout') {
        setError('Tempo esgotado ao gerar QR Code. A Edge Function pode estar temporariamente sem recursos ou indisponível. Aguarde 1–2 minutos e tente novamente.')
        setConnecting(false)
        return
      }
      if (
        typeof res.body === 'object' &&
        res.body !== null &&
        (res.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt'
      ) {
        setError('JWT inválido para chamar a Edge Function. Saia e entre novamente. Se persistir, reimplante a função com verify_jwt=false (--no-verify-jwt).')
        setConnecting(false)
        return
      }
      if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).error === 'jwt_project_mismatch') {
        setError('Sessão do Supabase pertence a outro projeto. Saia e entre novamente no sistema.')
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
      if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).error === 'whatsapp_not_configured') {
        setError('WhatsApp ainda não foi configurado no painel do Super Admin.')
        setConnecting(false)
        return
      }
      const hint = getOptionalString(res.body, 'hint')
      const details = formatDetails(res.body)
      setError(hint ? `Falha ao gerar QR Code (HTTP ${res.status}): ${details}\n\nDica: ${hint}` : `Falha ao gerar QR Code (HTTP ${res.status}): ${details}`)
      setConnecting(false)
      return
    }

    const initialState = getOptionalString(res.body, 'state')
    const initialQr = getOptionalString(res.body, 'qrBase64')
    let currentState: string | null = initialState
    if (initialState) setInstanceState(initialState)
    if (initialQr && initialQr.trim()) {
      setQrBase64(initialQr)
    }

    for (let i = 0; i < 30; i += 1) {
      if (currentState === 'open') {
        setQrBase64(null)
        setConnecting(false)
        return
      }
      await new Promise((r) => setTimeout(r, 4000))
      if (!aliveRef.current) return
      const next = await callWhatsapp({ action: 'status' })
      if (!next.ok) {
        if (isWorkerLimitResponse({ status: next.status, body: next.body })) {
          setError('O Supabase está sem recursos para executar a Edge Function agora (WORKER_LIMIT). Aguarde 1–2 minutos e tente novamente.')
          setConnecting(false)
          return
        }
        if (next.status === 0 && typeof next.body === 'object' && next.body !== null && (next.body as Record<string, unknown>).error === 'timeout') {
          setError('Tempo esgotado ao verificar status do WhatsApp. A Edge Function pode estar temporariamente sem recursos ou indisponível. Aguarde 1–2 minutos e tente novamente.')
          setConnecting(false)
          return
        }
        const hint = getOptionalString(next.body, 'hint')
        const details = formatDetails(next.body)
        setError(hint ? `Falha ao verificar status (HTTP ${next.status}): ${details}\n\nDica: ${hint}` : `Falha ao verificar status (HTTP ${next.status}): ${details}`)
        setConnecting(false)
        return
      }
      const nextState = getOptionalString(next.body, 'state')
      if (nextState) {
        currentState = nextState
        setInstanceState(nextState)
      }
      if (currentState === 'open') {
        setQrBase64(null)
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
    allowStatusRef.current = true
    const res = await callWhatsapp({ action: 'status' })
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
        setError('JWT inválido para chamar a Edge Function. Saia e entre novamente. Se persistir, reimplante a função com verify_jwt=false (--no-verify-jwt).')
        setCheckingStatus(false)
        return
      }
      if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).error === 'jwt_project_mismatch') {
        setError('Sessão do Supabase pertence a outro projeto. Saia e entre novamente no sistema.')
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
      const hint = getOptionalString(res.body, 'hint')
      const details = formatDetails(res.body)
      setError(hint ? `Falha ao atualizar status (HTTP ${res.status}): ${details}\n\nDica: ${hint}` : `Falha ao atualizar status (HTTP ${res.status}): ${details}`)
      setCheckingStatus(false)
      return
    }
    const nextState = getOptionalString(res.body, 'state')
    setInstanceState(nextState)
    if (nextState === 'open') {
      setQrBase64(null)
    }
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
      const hint = getOptionalString(res.body, 'hint')
      const details = formatDetails(res.body)
      const attemptsText = (() => {
        const raw = (res.body as Record<string, unknown> | null)?.attempts
        if (!raw) return null
        try {
          return JSON.stringify(raw)
        } catch {
          return null
        }
      })()
      setError(
        hint
          ? `Falha ao enviar teste (HTTP ${res.status}): ${details}\n\nDica: ${hint}${attemptsText ? `\n\nTentativas: ${attemptsText}` : ''}`
          : `Falha ao enviar teste (HTTP ${res.status}): ${details}${attemptsText ? `\n\nTentativas: ${attemptsText}` : ''}`
      )
      setSendingTest(false)
      return
    }
    setSendingTest(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const isConnected = instanceState?.toLowerCase() === 'open'
  const connectionLabel = (() => {
    if (!habilitado || !configurado) return '—'
    if (checkingStatus) return 'verificando…'
    if (isConnected) return 'Conectado'
    if (!instanceState) return 'Desconectado'
    const s = instanceState.toLowerCase()
    if (s === 'close' || s === 'closed') return 'Desconectado'
    if (s === 'connecting') return 'Conectando…'
    return instanceState
  })()

  return (
    <PageTutorial usuarioId={usuarioId} page="whatsapp">
      {({ tutorialOpen, tutorialStep, setTutorialStep, resetTutorial, closeTutorial }) => (
        <AppShell>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-500">Configurações</div>
                <div className="text-xl font-semibold text-slate-900">WhatsApp</div>
              </div>
              <Button variant="secondary" onClick={resetTutorial}>
                Rever tutorial
              </Button>
            </div>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
        {saved ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Enviado.</div> : null}

        <div
          className={
            tutorialOpen && tutorialSteps[tutorialStep]?.target === 'status'
              ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
              : ''
          }
        >
          <Card>
            <div className="p-6 space-y-4">
              <div className="text-sm font-semibold text-slate-900">Status</div>
              {loading ? (
                <div className="text-sm text-slate-600">Carregando…</div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-slate-700">Recurso: {habilitado ? '🟢 Habilitado' : '🔴 Desabilitado'}</div>
                  <div className="text-sm text-slate-700">Configuração: {configurado ? '🟢 OK' : '🟡 Pendente'}</div>
                  <div className="text-sm text-slate-700">Conexão: {connectionLabel}</div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={checkStatus} disabled={!habilitado || !configurado || checkingStatus || connecting || disconnecting}>
                      {isConnected ? 'Atualizar status' : 'Verificar status'}
                    </Button>
                    {isConnected ? (
                      <Button onClick={checkStatus} disabled={!habilitado || !configurado || checkingStatus || connecting || disconnecting}>
                        Testar conexão
                      </Button>
                    ) : (
                      <Button onClick={() => void connect()} disabled={!habilitado || !configurado || checkingStatus || connecting || disconnecting}>
                        Conectar (QR Code)
                      </Button>
                    )}
                    <Button variant="danger" onClick={disconnect} disabled={!habilitado || !configurado || disconnecting || connecting}>
                      Desconectar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {qrBase64 ? (
          <div
            className={
              tutorialOpen && tutorialSteps[tutorialStep]?.target === 'qr'
                ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
                : ''
            }
          >
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
          </div>
        ) : null}

        <div
          className={
            tutorialOpen && tutorialSteps[tutorialStep]?.target === 'test'
              ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
              : ''
          }
        >
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

            <TutorialOverlay open={tutorialOpen} steps={tutorialSteps} step={tutorialStep} onStepChange={setTutorialStep} onClose={closeTutorial} />
          </div>
        </AppShell>
      )}
    </PageTutorial>
  )
}
