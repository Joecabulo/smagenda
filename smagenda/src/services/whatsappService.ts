import { checkJwtProject, supabase, supabaseEnv } from '../lib/supabase'

export type WhatsappResult = {
  ok: boolean
  status: number
  body: unknown
}

export async function callWhatsappFunction(action: string, payload: Record<string, unknown>): Promise<WhatsappResult> {
  if (!supabaseEnv.ok) {
    return { ok: false, status: 0, body: { error: 'missing_supabase_env' } }
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

  const token = session?.access_token ?? null
  if (!token) {
    return { ok: false, status: 401, body: { error: 'session_expired' } }
  }

  const tokenProject = checkJwtProject(token, supabaseUrl)
  if (!tokenProject.ok) {
    await supabase.auth.signOut().catch(() => undefined)
    return {
      ok: false,
      status: 401,
      body: { error: 'jwt_project_mismatch', iss: tokenProject.iss, expected: tokenProject.expectedPrefix },
    }
  }

  const callFetch = async (jwt: string): Promise<WhatsappResult> => {
    const fnUrl = `${supabaseUrl}/functions/v1/whatsapp`
    let res: Response
    try {
      res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${jwt}`,
          'x-user-jwt': jwt,
        },
        body: JSON.stringify({ action, ...payload }),
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha de rede'
      return { ok: false, status: 0, body: { error: 'network_error', message: msg } }
    }

    const fnVersion = res.headers.get('x-smagenda-fn')

    let text = ''
    try {
      text = await res.text()
    } catch {
      // ignore
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
        return { ok: false, status: 401, body: { error: 'supabase_gateway_invalid_jwt' } }
      }
    }

    if (!res.ok) return { ok: false, status: res.status, body: parsed }
    return { ok: true, status: res.status, body: parsed }
  }

  const isInvalidJwtPayload = (p: unknown) => {
    if (typeof p === 'string') return p.includes('Invalid JWT')
    if (!p || typeof p !== 'object') return false
    const obj = p as Record<string, unknown>
    return obj.message === 'Invalid JWT' || obj.error === 'invalid_jwt'
  }

  const first = await callFetch(token)

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
    if (!nextToken) return { ok: false, status: 401, body: { error: 'invalid_jwt' } }

    const second = await callFetch(nextToken)
    if (!second.ok && second.status === 401 && isInvalidJwtPayload(second.body)) {
      return { ok: false, status: 401, body: { error: 'invalid_jwt' } }
    }
    return second
  }

  return first
}

export async function sendConfirmacaoWhatsapp(agendamentoId: string) {
  return callWhatsappFunction('send_confirmacao', { agendamento_id: agendamentoId })
}

export async function sendCancelamentoWhatsapp(agendamentoId: string) {
  return callWhatsappFunction('send_cancelamento', { agendamento_id: agendamentoId })
}
