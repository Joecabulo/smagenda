import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0'

type Payload =
  | { action: 'connect'; number?: string | null }
  | { action: 'status' }
  | { action: 'disconnect' }
  | { action: 'send_test'; number: string; text: string }
  | { action: 'send_confirmacao'; agendamento_id: string }
  | { action: 'send_cancelamento'; agendamento_id: string }
  | { action: 'config_status' }
  | { action: 'admin_diagnostics' }
  | { action: 'admin_status' }
  | { action: 'admin_connect'; number?: string | null }
  | { action: 'admin_disconnect' }
  | { action: 'admin_send_aviso'; cliente_ids: string[]; text: string }

type UsuarioAuthRow = { id: string; tipo_conta: string | null }

type FuncionarioAuthRow = { id: string; usuario_master_id: string | null }

type SuperAdminAuthRow = { id: string }

type SuperAdminConfigRow = {
  id: string
  whatsapp_api_url: string | null
  whatsapp_api_key: string | null
  whatsapp_instance_name: string | null
}

type ClienteAvisoRow = { id: string; telefone: string | null; nome_negocio: string | null }

type UsuarioBaseRow = {
  id: string
  slug: string | null
  nome_negocio: string | null
  telefone: string | null
  endereco: string | null
  whatsapp_api_url: string | null
  whatsapp_api_key: string | null
  whatsapp_habilitado?: boolean | null
}

type UsuarioExtraRow = {
  whatsapp_instance_name: string | null
  enviar_confirmacao: boolean | null
  enviar_lembrete: boolean | null
  enviar_cancelamento?: boolean | null
  lembrete_horas_antes: number | null
  mensagem_confirmacao: string | null
  mensagem_lembrete: string | null
  mensagem_cancelamento?: string | null
}

type ServicoRow = { nome: string | null; preco: number | null }

type FuncionarioRow = { nome_completo: string | null; telefone: string | null }

type UnidadeRow = { nome: string | null; endereco: string | null; telefone: string | null }

type AgendamentoRow = {
  id: string
  usuario_id: string
  cliente_nome: string | null
  cliente_telefone: string | null
  data: string
  hora_inicio: string | null
  status: string
  funcionario_id?: string | null
  unidade_id?: string | null
  extras?: unknown | null
  servico: ServicoRow | null
  funcionario?: FuncionarioRow | null
  unidade?: UnidadeRow | null
}

type AgendamentoConfirmacaoRow = { confirmacao_enviada: boolean | null }

const defaultConfirmacao = `Olá {nome}!\n\nSeu agendamento foi confirmado:\n📅 {data} às {hora}\n✂️ {servico}\n💰 {preco}\n\nLocal: {endereco}\n\nNos vemos em breve!\n{nome_negocio}`

const defaultCancelamento = `Olá {nome}!\n\nSeu agendamento foi cancelado:\n📅 {data} às {hora}\n✂️ {servico}\n\nSe precisar remarcar, é só me chamar.\n{nome_negocio}`

const FN_VERSION = 'whatsapp@2026-01-14.1'

function jsonResponse(status: number, body: unknown) {
  const withFn = (() => {
    if (!body || typeof body !== 'object') return body
    if (Array.isArray(body)) return body
    const obj = body as Record<string, unknown>
    if (typeof obj.fn === 'string' && obj.fn.trim()) return body
    return { ...obj, fn: FN_VERSION }
  })()

  return new Response(JSON.stringify(withFn), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-user-jwt, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Expose-Headers': 'x-smagenda-fn',
      'x-smagenda-fn': FN_VERSION,
    },
  })
}

function extractJwt(req: Request) {
  const xJwt = req.headers.get('x-user-jwt') ?? ''
  if (xJwt.trim()) return xJwt.trim()
  const auth = req.headers.get('Authorization') ?? ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (m?.[1]) return m[1].trim()
  return ''
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  const payload = parts[1] ?? ''
  if (!payload) return null
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  try {
    const json = atob(padded)
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function validateJwtShapeAndProject(jwt: string, supabaseUrl: string) {
  const payload = decodeJwtPayload(jwt)
  if (!payload) return { ok: false as const, reason: 'malformed_jwt' as const }

  const exp = payload.exp
  if (typeof exp === 'number') {
    const now = Math.floor(Date.now() / 1000)
    if (exp <= now) return { ok: false as const, reason: 'expired_jwt' as const }
  }

  const iss = payload.iss
  if (typeof iss === 'string' && supabaseUrl) {
    const expectedPrefix = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`
    if (!iss.startsWith(expectedPrefix)) {
      return { ok: false as const, reason: 'jwt_project_mismatch' as const, iss, expectedPrefix }
    }
  }

  return { ok: true as const }
}

function isMissingTableError(message: string) {
  return message.includes('schema cache') || message.includes("Could not find the table 'public.")
}

function isMissingColumnError(message: string) {
  return message.toLowerCase().includes('does not exist') && message.toLowerCase().includes('column')
}

function isMissingRelationshipError(message: string) {
  const m = message.toLowerCase()
  return m.includes('could not find a relationship between')
}

async function loadGlobalWhatsappConfig(dbClient: ReturnType<typeof createClient>) {
  const { data, error } = await dbClient
    .from('super_admin')
    .select('id,whatsapp_api_url,whatsapp_api_key')
    .not('whatsapp_api_url', 'is', null)
    .not('whatsapp_api_key', 'is', null)
    .limit(1)
    .maybeSingle()

  if (error) {
    const msg = String(error.message ?? '')
    const lower = msg.toLowerCase()
    const rls = lower.includes('row level security') || lower.includes('permission denied')
    if (rls) {
      return { ok: false as const, error: 'permission_denied' as const, message: msg }
    }
    if (isMissingTableError(error.message) || isMissingColumnError(error.message)) {
      return { ok: false as const, error: 'schema_incomplete' as const, message: error.message }
    }
    return { ok: false as const, error: 'load_failed' as const, message: error.message }
  }

  const row = (data ?? null) as unknown as { whatsapp_api_url?: string | null; whatsapp_api_key?: string | null } | null
  const apiUrl = typeof row?.whatsapp_api_url === 'string' ? row.whatsapp_api_url : null
  const apiKey = typeof row?.whatsapp_api_key === 'string' ? row.whatsapp_api_key : null
  const hasConfig = Boolean(apiUrl && apiKey)

  if (!hasConfig) return { ok: true as const, configured: false as const, apiUrl: null, apiKey: null }
  return { ok: true as const, configured: true as const, apiUrl: apiUrl!, apiKey: apiKey! }
}

function cleanUrl(input: string) {
  const raw = String(input ?? '')
    .trim()
    .replace(/^['"`\s]+|['"`\s]+$/g, '')
  if (!raw) return ''
  const withProto = (() => {
    if (/^https?:\/\//i.test(raw)) return raw
    if (/^(localhost|127\.0\.0\.1)(:|$)/i.test(raw)) return `http://${raw}`
    return `https://${raw}`
  })()
  return withProto.replace(/\/+$/, '')
}

function isForbiddenEvolutionHost(hostname: string) {
  const h = hostname.trim().toLowerCase()
  if (!h) return true
  if (h === 'localhost' || h === '0.0.0.0' || h === '127.0.0.1') return true
  if (h.endsWith('.local')) return true
  if (/^10\./.test(h)) return true
  if (/^192\.168\./.test(h)) return true
  const m172 = h.match(/^172\.(\d+)\./)
  if (m172) {
    const n = Number(m172[1])
    if (!Number.isNaN(n) && n >= 16 && n <= 31) return true
  }
  return false
}

function validateEvolutionBaseUrl(raw: string) {
  const cleaned = cleanUrl(raw)
  if (!cleaned) return { ok: false as const, reason: 'missing' as const }
  let u: URL
  try {
    u = new URL(cleaned)
  } catch {
    return { ok: false as const, reason: 'invalid' as const, cleaned }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false as const, reason: 'invalid_protocol' as const, cleaned }
  if (isForbiddenEvolutionHost(u.hostname)) return { ok: false as const, reason: 'local_address' as const, cleaned }
  return { ok: true as const, cleaned }
}

function sanitizeInstanceName(input: string) {
  const s = input.trim().toLowerCase()
  const normalized = s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized.slice(0, 50) || 'smagenda'
}

function sanitizePhone(input: string) {
  return String(input ?? '').replace(/\D/g, '')
}

function buildRecipientCandidates(raw: string) {
  const digits = sanitizePhone(raw)
  if (!digits) return []

  const bases: string[] = [digits]
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    bases.push(`55${digits}`)
  }

  const candidates: string[] = []
  for (const b of bases) {
    candidates.push(b)
    candidates.push(`+${b}`)
    candidates.push(`${b}@s.whatsapp.net`)
    candidates.push(`${b}@c.us`)
  }

  return Array.from(new Set(candidates.map((v) => v.trim()).filter(Boolean)))
}

function maskRecipient(input: string) {
  const digits = String(input ?? '').replace(/\D/g, '')
  if (!digits) return ''
  const last4 = digits.slice(-4)
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${last4}`
}

function isRecipientFormatError(details: unknown) {
  const unwrapped = unwrapNotFoundLast(details)
  const text = extractTextFragments(unwrapped).join(' | ').toLowerCase()

  const hasExistsFalse = (input: unknown): boolean => {
    if (!input || typeof input !== 'object') return false
    if (Array.isArray(input)) return input.some((v) => hasExistsFalse(v))
    const obj = input as Record<string, unknown>
    if (obj.exists === false) return true
    return Object.values(obj).some((v) => hasExistsFalse(v))
  }

  if (hasExistsFalse(unwrapped)) return true
  if (!text) return false

  if (text.includes('quote command returned error')) return true
  if (text.includes('invalid jid') || text.includes('jid')) return true
  if (text.includes('not a whatsapp user') || text.includes('is not on whatsapp')) return true
  if (text.includes('invalid number') || text.includes('number invalid')) return true
  return false
}

function normalizeEvolutionText(input: string) {
  return String(input ?? '').replace(/\r\n/g, '\n')
}

function stripUnsupportedEvolutionChars(input: string) {
  const s = normalizeEvolutionText(input)
  const withoutSurrogates = s.replace(/[\uD800-\uDFFF]/g, '')
  const withoutVariationSelectors = withoutSurrogates.replace(/[\uFE0E\uFE0F]/g, '')
  return withoutVariationSelectors.replace(/[^\t\n\r\u0020-\u007E\u00A0-\u00FF]/g, '')
}

function buildTextCandidates(input: string) {
  const raw = normalizeEvolutionText(input)
  const stripped = stripUnsupportedEvolutionChars(raw)
  const candidates = raw === stripped ? [raw] : [raw, stripped]
  return Array.from(new Set(candidates.map((v) => v.trim()).filter(Boolean)))
}

async function evolutionSendTextWithFallback(opts: {
  apiUrl: string
  apiKey: string
  instanceName: string
  phoneRaw: string
  text: string
  stopOn404?: (args: { body: unknown; url: string; baseUrlUsed: string }) => boolean
}) {
  const recipients = buildRecipientCandidates(opts.phoneRaw)
  const texts = buildTextCandidates(opts.text)
  const attempts: Array<{ recipient: string; text_variant: string; status: number; ok: boolean }> = []

  let last: Awaited<ReturnType<typeof evolutionRequestAuto>> | null = null

  for (const recipient of recipients) {
    for (let i = 0; i < texts.length; i += 1) {
      const text = texts[i]!
      const variant = i === 0 ? 'raw' : 'stripped'
      const res = await evolutionRequestAuto({
        baseUrl: opts.apiUrl,
        apiKey: opts.apiKey,
        path: `/message/sendText/${opts.instanceName}`,
        method: 'POST',
        body: { number: recipient, text },
        stopOn404: opts.stopOn404,
      })

      attempts.push({ recipient: maskRecipient(recipient), text_variant: variant, status: res.status, ok: res.ok })
      last = res
      if (res.ok) return { ...res, attempts }

      if (res.status === 401 || res.status === 403 || res.status === 404) {
        return { ...res, attempts }
      }

      if (!isRecipientFormatError(res.body)) {
        return { ...res, attempts }
      }
    }
  }

  return { ...(last ?? { ok: false, status: 502, body: { error: 'evolution_send_failed' } }), attempts }
}

function formatBRL(value: number) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  } catch {
    return `R$ ${value.toFixed(2)}`
  }
}

function formatBRDate(isoDate: string) {
  const parts = isoDate.split('-')
  if (parts.length !== 3) return isoDate
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function readExtrasEndereco(extras: unknown) {
  if (!extras || typeof extras !== 'object') return ''
  const v = (extras as Record<string, unknown>).endereco
  if (typeof v !== 'string') return ''
  const t = v.trim()
  return t ? t : ''
}

function readExtrasEmail(extras: unknown) {
  if (!extras || typeof extras !== 'object') return ''
  const v = (extras as Record<string, unknown>).email
  if (typeof v !== 'string') return ''
  const t = v.trim().toLowerCase()
  if (!t) return ''
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)
  return ok ? t : ''
}

function interpolateTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`)
}

async function resendSendEmail(args: {
  apiKey: string
  from: string
  to: string
  subject: string
  text: string
}) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: args.from, to: args.to, subject: args.subject, text: args.text }),
  })
  const body = (await res.json().catch(() => null)) as unknown
  return { ok: res.ok, status: res.status, body }
}

async function evolutionRequest(opts: { baseUrl: string; apiKey: string; path: string; method: string; body?: unknown }) {
  const rawKey = String(opts.apiKey ?? '').trim()
  const normalizedKey = rawKey.replace(/^['"`\s]+|['"`\s]+$/g, '')
  const keyCandidates = Array.from(new Set([normalizedKey, rawKey].map((v) => v.trim()).filter(Boolean)))
  const contentType = opts.body === undefined ? {} : { 'Content-Type': 'application/json' }

  const baseUrl = `${cleanUrl(opts.baseUrl)}${opts.path.startsWith('/') ? '' : '/'}${opts.path}`
  const redactUrl = (input: string) => {
    try {
      const u = new URL(input)
      const sensitive = ['apikey', 'apiKey', 'api_key', 'token', 'access_token', 'key']
      for (const k of sensitive) {
        if (u.searchParams.has(k)) u.searchParams.set(k, 'REDACTED')
      }
      return u.toString()
    } catch {
      return input.replace(/(apikey|apiKey|api_key|token|access_token|key)=([^&]+)/g, '$1=REDACTED')
    }
  }

  const appendQuery = (input: string, param: string, value: string) => {
    try {
      const u = new URL(input)
      u.searchParams.set(param, value)
      return u.toString()
    } catch {
      const sep = input.includes('?') ? '&' : '?'
      return `${input}${sep}${encodeURIComponent(param)}=${encodeURIComponent(value)}`
    }
  }

  const urlVariants: Array<{ kind: string; url: string; urlRedacted: string }> = [{ kind: 'path', url: baseUrl, urlRedacted: redactUrl(baseUrl) }]
  for (const key of keyCandidates) {
    const candidates: Array<{ kind: string; url: string }> = [
      { kind: `query_apikey`, url: appendQuery(baseUrl, 'apikey', key) },
      { kind: `query_apiKey`, url: appendQuery(baseUrl, 'apiKey', key) },
      { kind: `query_token`, url: appendQuery(baseUrl, 'token', key) },
    ]
    for (const c of candidates) {
      const redacted = redactUrl(c.url)
      if (urlVariants.some((v) => v.urlRedacted === redacted)) continue
      urlVariants.push({ kind: c.kind, url: c.url, urlRedacted: redacted })
    }
  }

  const headerVariants: Array<{ kind: string; headers: Record<string, string> }> = keyCandidates.length
    ? keyCandidates.flatMap((key, i) => {
        const suffix = keyCandidates.length > 1 ? `#${i + 1}` : ''
        return [
          { kind: `apikey${suffix}`, headers: { apikey: key, ...contentType } },
          { kind: `apiKey${suffix}`, headers: { apiKey: key, ...contentType } },
          { kind: `x-api-key${suffix}`, headers: { 'x-api-key': key, ...contentType } },
          { kind: `x-api_key${suffix}`, headers: { 'x-api_key': key, ...contentType } },
          { kind: `authorization_bearer${suffix}`, headers: { Authorization: `Bearer ${key}`, ...contentType } },
          { kind: `authorization_raw${suffix}`, headers: { Authorization: key, ...contentType } },
          { kind: `token${suffix}`, headers: { token: key, ...contentType } },
          { kind: `x-access-token${suffix}`, headers: { 'x-access-token': key, ...contentType } },
        ]
      })
    : [{ kind: 'no_key', headers: { ...contentType } }]

  const doFetchOnce = async (args: { url: string; urlRedacted: string; headers: Record<string, string> }) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)
    try {
      const res = await fetch(args.url, {
        method: opts.method,
        headers: args.headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
      })
      const text = await res.text()
      let json: unknown = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = text
      }
      return { ok: res.ok, status: res.status, body: json, url: args.urlRedacted }
    } catch (e: unknown) {
      const errAny = e as { name?: unknown; message?: unknown }
      const name = typeof errAny.name === 'string' ? errAny.name : ''
      const message = typeof errAny.message === 'string' ? errAny.message : e instanceof Error ? e.message : 'Falha ao conectar na Evolution API'
      const lower = message.toLowerCase()
      const isAbort = name === 'AbortError' || lower.includes('aborted') || lower.includes('abort')
      return {
        ok: false,
        status: isAbort ? 504 : 502,
        body: { error: isAbort ? 'evolution_timeout' : 'evolution_fetch_failed', message, url: args.urlRedacted },
        url: args.urlRedacted,
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  const tryAllVariants = async () => {
    const attempts: Array<{ url_kind: string; header_kind: string; status: number }> = []
    let last: Awaited<ReturnType<typeof doFetchOnce>> | null = null
    for (const u of urlVariants) {
      for (const h of headerVariants) {
        const res = await doFetchOnce({ url: u.url, urlRedacted: u.urlRedacted, headers: h.headers })
        attempts.push({ url_kind: u.kind, header_kind: h.kind, status: res.status })
        last = res
        if (res.status !== 401) return res
      }
    }

    if (last && last.status === 401) {
      return {
        ...last,
        body: {
          error: 'evolution_unauthorized',
          url: last.url,
          attempts,
          response: last.body,
        },
      }
    }
    return last ?? doFetchOnce({ url: baseUrl, urlRedacted: redactUrl(baseUrl), headers: headerVariants[0]!.headers })
  }

  return tryAllVariants()
}

function buildEvolutionBaseUrls(rawBaseUrl: string) {
  const baseUrl = cleanUrl(rawBaseUrl)
  const lower = baseUrl.toLowerCase()

  const isIpHostname = (() => {
    try {
      const u = new URL(baseUrl)
      const h = u.hostname.trim()
      if (!h) return false
      return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':')
    } catch {
      return false
    }
  })()

  const withoutPort = (() => {
    try {
      const u = new URL(baseUrl)
      const port = u.port
      if (!port) return null
      const isDefault = (u.protocol === 'http:' && port === '80') || (u.protocol === 'https:' && port === '443')
      if (isDefault) return null
      u.port = ''
      return cleanUrl(u.toString())
    } catch {
      return null
    }
  })()

  const altProtocol = (() => {
    if (lower.startsWith('https://')) return `http://${baseUrl.slice('https://'.length)}`
    if (lower.startsWith('http://')) return `https://${baseUrl.slice('http://'.length)}`
    return null
  })()

  const altProtocolWithoutPort = (() => {
    if (!withoutPort) return null
    const l = withoutPort.toLowerCase()
    if (l.startsWith('https://')) return `http://${withoutPort.slice('https://'.length)}`
    if (l.startsWith('http://')) return `https://${withoutPort.slice('http://'.length)}`
    return null
  })()

  const roots = (() => {
    const arr = [baseUrl, altProtocol, withoutPort, altProtocolWithoutPort].filter(Boolean) as string[]
    try {
      const u = new URL(baseUrl)
      const port = u.port
      const isNonDefault = Boolean(port && !((u.protocol === 'http:' && port === '80') || (u.protocol === 'https:' && port === '443')))
      if (!isNonDefault || !withoutPort) return Array.from(new Set(arr))
      const preferred = (isIpHostname
        ? [baseUrl, withoutPort, altProtocol, altProtocolWithoutPort]
        : [withoutPort, baseUrl, altProtocolWithoutPort, altProtocol]
      ).filter(Boolean) as string[]
      return Array.from(new Set(preferred.concat(arr)))
    } catch {
      return Array.from(new Set(arr))
    }
  })()
  const out: string[] = []

  for (const root of roots) {
    const l = root.toLowerCase()
    const hasVersion = l.includes('/v1/') || l.endsWith('/v1') || l.includes('/v2/') || l.endsWith('/v2')
    const hasApiPrefix = l.includes('/api/') || l.endsWith('/api')

    if (hasVersion || hasApiPrefix) {
      out.push(root)
      continue
    }

    out.push(root)
    out.push(`${root}/api`)
    out.push(`${root}/api/v2`)
    out.push(`${root}/api/v1`)
    out.push(`${root}/v2`)
    out.push(`${root}/v1`)
  }

  return Array.from(new Set(out))
}

async function evolutionRequestAuto(opts: { baseUrl: string; apiKey: string; path: string; method: string; body?: unknown; stopOn404?: (args: { body: unknown; url: string; baseUrlUsed: string }) => boolean }) {
  const candidates = buildEvolutionBaseUrls(opts.baseUrl)
  const attempts: Array<{ baseUrl: string; url: string | null; status: number; ok: boolean }> = []
  let last: { ok: boolean; status: number; body: unknown; baseUrlUsed: string; url: string } | null = null
  const startedAt = Date.now()
  const deadlineMs = 35000
  const maxCandidates = 4
  for (const baseUrl of candidates) {
    if (attempts.length >= maxCandidates) break
    if (Date.now() - startedAt > deadlineMs) break
    const res = await evolutionRequest({ ...opts, baseUrl })
    const url = (res as unknown as { url?: string }).url ?? `${cleanUrl(baseUrl)}${opts.path.startsWith('/') ? '' : '/'}${opts.path}`
    attempts.push({ baseUrl, url, status: res.status, ok: res.ok })
    last = { ...res, baseUrlUsed: baseUrl, url }
    if (res.status === 404) {
      if (opts.stopOn404?.({ body: res.body, url, baseUrlUsed: baseUrl })) return last
      continue
    }

    if (res.status === 502 || res.status === 504) {
      if (attempts.length >= 2) {
        return {
          ...last,
          body: {
            error: 'evolution_unreachable',
            attempts,
            last: res.body,
          },
        }
      }
      continue
    }

    return last
  }
  if (!last) {
    return { ok: false as const, status: 404, body: null, baseUrlUsed: candidates[0] ?? opts.baseUrl, url: '' }
  }

  if (last.status === 502 || last.status === 504) {
    return {
      ...last,
      body: {
        error: 'evolution_unreachable',
        attempts,
        last: last.body,
      },
    }
  }

  if (last.status === 404) {
    return {
      ...last,
      body: {
        error: 'not_found',
        attempts,
        last: last.body,
      },
    }
  }

  return last
}

function extractTextFragments(input: unknown): string[] {
  if (typeof input === 'string') return [input]
  if (!input) return []
  if (Array.isArray(input)) return input.flatMap((v) => extractTextFragments(v))
  if (typeof input !== 'object') return []
  const obj = input as Record<string, unknown>
  const keys = ['message', 'error', 'details', 'response', 'data', 'description']
  const out: string[] = []
  for (const key of keys) {
    if (obj[key] !== undefined) out.push(...extractTextFragments(obj[key]))
  }
  if (out.length) return out
  return Object.values(obj).flatMap((v) => extractTextFragments(v))
}

function unwrapNotFoundLast(details: unknown): unknown {
  if (!details || typeof details !== 'object') return details
  const obj = details as Record<string, unknown>
  if (obj.error === 'not_found' && obj.last !== undefined) return obj.last
  return details
}

function isEvolutionRouteNotFound(details: unknown) {
  const unwrapped = unwrapNotFoundLast(details)
  const text = extractTextFragments(unwrapped).join(' | ').toLowerCase()
  if (!text) return false
  if (text.includes('cannot get')) return true
  if (text.includes('<html')) return true
  if (text.includes('not found') && text.includes('/instance/')) return true
  return false
}

function isEvolutionInstanceNotFound(details: unknown, instanceName: string) {
  const unwrapped = unwrapNotFoundLast(details)
  const text = extractTextFragments(unwrapped).join(' | ').toLowerCase()
  if (!text) return false
  const hasInstance = text.includes('instance') || text.includes('instancia') || text.includes('instância')
  const notFound = text.includes('not found') || text.includes('não encontrada') || text.includes('nao encontrada') || text.includes('does not exist')
  if (!hasInstance || !notFound) return false
  const i = instanceName.trim().toLowerCase()
  if (!i) return true
  return text.includes(i)
}

function evolutionUrlHint(details: unknown) {
  if (!isEvolutionRouteNotFound(details)) return null
  return 'A URL pública não está apontando para a Evolution API (Cloudflare Tunnel/porta/serviço errado). Acesse a URL no navegador: deve aparecer “Welcome to the Evolution API”.'
}

function isEvolutionUnauthorized(details: unknown) {
  const unwrapped = unwrapNotFoundLast(details)
  if (!unwrapped || typeof unwrapped !== 'object') return false
  const obj = unwrapped as Record<string, unknown>
  if (obj.status === 401) return true
  const text = extractTextFragments(unwrapped).join(' | ').toLowerCase()
  return text.includes('unauthorized')
}

function evolutionAuthHint(details: unknown) {
  if (!isEvolutionUnauthorized(details)) return null
  return 'A Evolution API está recusando a API Key (401). Confirme que o valor em Configurações > WhatsApp > API Key é exatamente o mesmo configurado no container da Evolution como AUTHENTICATION_API_KEY. Na v2.3.7, a autenticação funciona via header "apikey" (query ?apikey=.../?token=... não autentica). Se estiver usando proxy/tunnel (Cloudflare/Railway/Nginx), confirme que ele não está removendo o header "apikey".'
}

function isEvolutionCloudflareTunnelError(details: unknown) {
  const unwrapped = unwrapNotFoundLast(details)
  const text = extractTextFragments(unwrapped).join(' | ').toLowerCase()
  if (!text) return false
  if (text.includes('cloudflare tunnel error')) return true
  if (text.includes('error code: 1033')) return true
  if (text.includes('argo tunnel error')) return true
  return false
}

function evolutionCloudflareTunnelHint(details: unknown) {
  if (!isEvolutionCloudflareTunnelError(details)) return null
  return 'O domínio da Evolution API está retornando uma página de erro do Cloudflare Tunnel (1033). Isso significa que o tunnel/origem está offline ou desconectado. A correção permanente é manter o serviço de origem (container Evolution) e o processo cloudflared rodando 24/7 (como serviço/systemd/PM2/Docker com restart=always) em um servidor/VPS sempre ligado; fazer deploy da Edge Function não resolve a causa.'
}

function isEvolutionFetchFailed(details: unknown) {
  const unwrapped = unwrapNotFoundLast(details)
  if (!unwrapped || typeof unwrapped !== 'object') return false
  const obj = unwrapped as Record<string, unknown>
  if (obj.error === 'evolution_fetch_failed') return true
  if (obj.error === 'evolution_timeout') return true
  if (obj.error === 'evolution_unreachable') return true
  const text = extractTextFragments(unwrapped).join(' | ').toLowerCase()
  if (!text) return false
  return text.includes('signal has been aborted') || text.includes('timed out') || text.includes('timeout') || text.includes('fetch failed')
}

function evolutionNetworkHint(details: unknown) {
  if (!isEvolutionFetchFailed(details)) return null
  return 'Falha de rede ao chamar a Evolution API. Confirme que a URL é pública e responde rápido (teste no navegador/curl). Se estiver usando IP:porta (ex.: 8080), libere a porta no firewall e considere expor via HTTPS/443 (proxy/tunnel) para maior estabilidade.'
}

function isEvolutionQuoteCommandError(details: unknown) {
  const unwrapped = unwrapNotFoundLast(details)
  const text = extractTextFragments(unwrapped).join(' | ').toLowerCase()
  if (!text) return false
  return text.includes('quote command returned error')
}

function evolutionQuoteCommandHint(details: unknown) {
  if (!isEvolutionQuoteCommandError(details)) return null
  return 'A Evolution retornou "Quote command returned error" ao enviar. O sistema tenta automaticamente variações de formato do número e também remove emojis/caracteres incompatíveis; se persistir, confirme o telefone do cliente com DDD + 55 (ex: 5511999999999) e verifique os logs do container da Evolution.'
}

function isEvolutionNumberNotFound(details: unknown) {
  const unwrapped = unwrapNotFoundLast(details)
  const hasExistsFalse = (input: unknown): boolean => {
    if (!input || typeof input !== 'object') return false
    if (Array.isArray(input)) return input.some((v) => hasExistsFalse(v))
    const obj = input as Record<string, unknown>
    if (obj.exists === false) return true
    return Object.values(obj).some((v) => hasExistsFalse(v))
  }
  return hasExistsFalse(unwrapped)
}

function evolutionNumberNotFoundHint(details: unknown) {
  if (!isEvolutionNumberNotFound(details)) return null
  return 'A Evolution indicou que o número não existe no WhatsApp (exists=false). Confirme se o telefone está correto e tente com DDD + 55 (ex.: 5531999999999).'
}

function evolutionHint(details: unknown) {
  return (
    evolutionUrlHint(details) ??
    evolutionAuthHint(details) ??
    evolutionCloudflareTunnelHint(details) ??
    evolutionNetworkHint(details) ??
    evolutionNumberNotFoundHint(details) ??
    evolutionQuoteCommandHint(details)
  )
}

async function createEvolutionInstance(opts: { apiUrl: string; apiKey: string; instanceName: string; qrcode?: boolean; number?: string | null }) {
  const qrcode = typeof opts.qrcode === 'boolean' ? opts.qrcode : true
  const number = typeof opts.number === 'string' && opts.number.trim() ? sanitizePhone(opts.number) : ''

  const createResA = await evolutionRequestAuto({
    baseUrl: opts.apiUrl,
    apiKey: opts.apiKey,
    path: '/instance/create',
    method: 'POST',
    body: { instanceName: opts.instanceName, token: opts.apiKey, qrcode, integration: 'WHATSAPP-BAILEYS', ...(number ? { number } : {}) },
  })

  const createRes =
    createResA.ok || createResA.status === 409
      ? createResA
      : await evolutionRequestAuto({
          baseUrl: opts.apiUrl,
          apiKey: opts.apiKey,
          path: '/instance/create',
          method: 'POST',
          body: { instanceName: opts.instanceName, qrcode, integration: 'WHATSAPP-BAILEYS', ...(number ? { number } : {}) },
        })

  return createRes
}

function extractInstanceState(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  const direct = root.state
  if (typeof direct === 'string') return direct
  const instance = root.instance
  if (instance && typeof instance === 'object') {
    const state = (instance as Record<string, unknown>).state
    if (typeof state === 'string') return state
  }
  const data = root.data
  if (data && typeof data === 'object') {
    const state = (data as Record<string, unknown>).state
    if (typeof state === 'string') return state
  }
  return null
}

function extractQrBase64(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  const direct = obj.qrcode ?? obj.qr ?? obj.qrCode ?? obj.qr_code ?? obj.base64
  const normalize = (value: string) => {
    const v = value.trim()
    if (!v) return null
    const idx = v.toLowerCase().indexOf('base64,')
    if (idx >= 0) return v.slice(idx + 'base64,'.length).trim() || null
    return v
  }
  const fromObj = (candidate: unknown): string | null => {
    if (typeof candidate === 'string') return normalize(candidate)
    if (!candidate || typeof candidate !== 'object') return null
    const c = candidate as Record<string, unknown>
    const nested = c.base64 ?? c.qrcode ?? c.qr ?? c.qrCode ?? c.qr_code
    if (typeof nested === 'string') return normalize(nested)
    const nestedBase64 = c.base64
    if (typeof nestedBase64 === 'string') return normalize(nestedBase64)
    return null
  }

  const directValue = fromObj(direct)
  if (directValue) return directValue

  const fromQrcode = fromObj(obj.qrcode)
  if (fromQrcode) return fromQrcode

  const fromData = fromObj(obj.data)
  if (fromData) return fromData

  const fromInstance = fromObj(obj.instance)
  if (fromInstance) return fromInstance

  if (obj.data && typeof obj.data === 'object') {
    const deep = extractQrBase64(obj.data)
    if (deep) return deep
  }
  if (obj.instance && typeof obj.instance === 'object') {
    const deep = extractQrBase64(obj.instance)
    if (deep) return deep
  }
  return null
}

function extractPairingCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  const fromStr = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

  const direct = fromStr(obj.pairingCode) ?? fromStr(obj.pairing_code)
  if (direct) return direct

  const scan = (candidate: unknown): string | null => {
    if (!candidate || typeof candidate !== 'object') return null
    const c = candidate as Record<string, unknown>
    return fromStr(c.pairingCode) ?? fromStr(c.pairing_code)
  }

  const fromQrcode = scan(obj.qrcode)
  if (fromQrcode) return fromQrcode
  const fromData = scan(obj.data)
  if (fromData) return fromData
  const fromInstance = scan(obj.instance)
  if (fromInstance) return fromInstance

  if (obj.data && typeof obj.data === 'object') {
    const deep = extractPairingCode(obj.data)
    if (deep) return deep
  }
  if (obj.instance && typeof obj.instance === 'object') {
    const deep = extractPairingCode(obj.instance)
    if (deep) return deep
  }
  return null
}

async function getPrincipal(userClient: ReturnType<typeof createClient>, uid: string) {
  const { data: superAdminRaw, error: superAdminErr } = await userClient.from('super_admin').select('id').eq('id', uid).maybeSingle()
  if (superAdminErr) {
    if (!isMissingTableError(superAdminErr.message)) {
      return { ok: false as const, error: 'principal_query_error' as const, table: 'super_admin' as const, message: superAdminErr.message }
    }
  }
  const superAdmin = (superAdminRaw ?? null) as unknown as SuperAdminAuthRow | null
  if (superAdmin?.id) return { ok: true as const, kind: 'super_admin' as const, uid }

  const { data: usuarioRowRaw, error: usuarioErr } = await userClient.from('usuarios').select('id,tipo_conta').eq('id', uid).maybeSingle()
  if (usuarioErr) {
    if (isMissingTableError(usuarioErr.message)) {
      return { ok: false as const, error: 'schema_incomplete' as const, table: 'usuarios' as const, message: usuarioErr.message }
    }
    return { ok: false as const, error: 'principal_query_error' as const, table: 'usuarios' as const, message: usuarioErr.message }
  }
  const usuarioRow = (usuarioRowRaw ?? null) as unknown as UsuarioAuthRow | null
  if (usuarioRow?.id) return { ok: true as const, kind: 'usuario' as const, uid, masterId: uid, tipo_conta: usuarioRow.tipo_conta ?? '' }

  const { data: funcRowRaw, error: funcErr } = await userClient.from('funcionarios').select('id,usuario_master_id').eq('id', uid).maybeSingle()
  if (funcErr) {
    if (isMissingTableError(funcErr.message)) {
      return { ok: false as const, error: 'schema_incomplete' as const, table: 'funcionarios' as const, message: funcErr.message }
    }
    return { ok: false as const, error: 'principal_query_error' as const, table: 'funcionarios' as const, message: funcErr.message }
  }
  const funcRow = (funcRowRaw ?? null) as unknown as FuncionarioAuthRow | null
  if (funcRow?.id && funcRow.usuario_master_id) return { ok: true as const, kind: 'funcionario' as const, uid, masterId: funcRow.usuario_master_id }

  return { ok: false as const, error: 'unauthorized' as const }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse(200, { ok: true })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !anonKey) return jsonResponse(500, { error: 'missing_env' })

  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const resendApiKey = (Deno.env.get('RESEND_API_KEY') ?? '').trim()
  const resendFromRaw = (Deno.env.get('RESEND_FROM') ?? '').trim()
  const resendFrom = resendFromRaw || 'SMagenda <onboarding@resend.dev>'

  const jwt = extractJwt(req)
  if (!jwt) {
    return jsonResponse(401, {
      error: 'unauthorized',
      message: 'missing_jwt',
      hint: 'Envie o access_token do Supabase no header Authorization: Bearer <token> (ou x-user-jwt).',
    })
  }

  const shapeCheck = validateJwtShapeAndProject(jwt, supabaseUrl)
  if (!shapeCheck.ok) {
    if (shapeCheck.reason === 'jwt_project_mismatch') {
      return jsonResponse(401, { error: 'invalid_jwt', reason: shapeCheck.reason, iss: shapeCheck.iss, expected: shapeCheck.expectedPrefix })
    }
    return jsonResponse(401, { error: 'invalid_jwt', reason: shapeCheck.reason })
  }

  const baseClient = createClient(supabaseUrl, anonKey)
  const { data: authData, error: authErr } = await baseClient.auth.getUser(jwt)
  if (authErr || !authData?.user?.id) {
    const message = typeof authErr?.message === 'string' ? authErr.message : 'Invalid JWT'
    return jsonResponse(401, { error: 'invalid_jwt', reason: 'supabase_auth_rejected', message })
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  })

  const serviceClient = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null

  const principalClient = serviceClient ?? userClient
  const dbClient = serviceClient ?? userClient

  let payload: Payload
  try {
    payload = (await req.json()) as Payload
  } catch {
    return jsonResponse(400, { error: 'invalid_json' })
  }

  const uid = authData.user.id
  const isAdminAction =
    payload.action === 'admin_diagnostics' ||
    payload.action === 'admin_status' ||
    payload.action === 'admin_connect' ||
    payload.action === 'admin_disconnect' ||
    payload.action === 'admin_send_aviso'

  let principal:
    | { ok: true; kind: 'super_admin'; uid: string }
    | { ok: true; kind: 'usuario'; uid: string; masterId: string; tipo_conta: string }
    | { ok: true; kind: 'funcionario'; uid: string; masterId: string }
    | { ok: false; error: string; table?: string; message?: string }

  if (isAdminAction) {
    const { data: saRow, error: saErr } = await dbClient.from('super_admin').select('id').eq('id', uid).maybeSingle()
    if (saErr) {
      if (isMissingTableError(saErr.message) || isMissingColumnError(saErr.message)) {
        return jsonResponse(400, { error: 'schema_incomplete', message: 'Execute o SQL do WhatsApp (Super Admin) em /admin/configuracoes.' })
      }
      return jsonResponse(403, { error: 'not_allowed', message: saErr.message })
    }
    if (!saRow) {
      return jsonResponse(403, {
        error: 'not_allowed',
        message: 'Conta não cadastrada como Super Admin (public.super_admin).',
        hint: 'Acesse /admin/bootstrap para criar o Super Admin e /admin/configuracoes para aplicar o SQL.',
      })
    }
    principal = { ok: true, kind: 'super_admin', uid }
  } else {
    principal = await getPrincipal(principalClient, uid)
    if (!principal.ok && principal.error === 'unauthorized') {
      const { error: ensureErr } = await userClient.rpc('ensure_usuario_profile')
      if (!ensureErr) {
        principal = await getPrincipal(principalClient, uid)
      } else {
        const msg = typeof ensureErr.message === 'string' ? ensureErr.message : ''
        const lower = msg.toLowerCase()
        const missingFn = lower.includes('ensure_usuario_profile') && (lower.includes('function') || lower.includes('rpc'))
        if (missingFn) {
          return jsonResponse(400, { error: 'schema_incomplete', message: 'Crie a função ensure_usuario_profile (trial) em /admin/configuracoes.' })
        }
      }
    }

    if (!principal.ok) {
      if (principal.error === 'unauthorized') {
        return jsonResponse(401, {
          error: 'unauthorized',
          hint: serviceClient
            ? 'Usuário não existe em public.super_admin/public.usuarios/public.funcionarios.'
            : 'Usuário não existe nas tabelas de perfil ou as políticas RLS estão bloqueando leitura. Execute o SQL de bootstrap/políticas no Supabase.',
        })
      }
      if (principal.error === 'schema_incomplete') {
        return jsonResponse(400, {
          error: 'schema_incomplete',
          table: (principal as unknown as { table?: unknown }).table ?? null,
          message: (principal as unknown as { message?: unknown }).message ?? null,
        })
      }
      return jsonResponse(403, { error: principal.error, table: (principal as unknown as { table?: unknown }).table ?? null, message: (principal as unknown as { message?: unknown }).message ?? null })
    }
  }

  if (
    payload.action === 'admin_diagnostics' ||
    payload.action === 'admin_status' ||
    payload.action === 'admin_connect' ||
    payload.action === 'admin_disconnect' ||
    payload.action === 'admin_send_aviso'
  ) {
    if (principal.kind !== 'super_admin') return jsonResponse(403, { error: 'not_allowed' })

    const { data: saRaw, error: saErr } = await dbClient
      .from('super_admin')
      .select('id,whatsapp_api_url,whatsapp_api_key,whatsapp_instance_name')
      .eq('id', principal.uid)
      .maybeSingle()

    if (saErr) {
      if (isMissingColumnError(saErr.message)) {
        return jsonResponse(400, { error: 'schema_incomplete', message: 'Execute o SQL do WhatsApp (Super Admin) em /admin/configuracoes.' })
      }
      return jsonResponse(403, { error: 'not_allowed' })
    }
    if (!saRaw) return jsonResponse(403, { error: 'not_allowed' })

    const sa = saRaw as unknown as SuperAdminConfigRow
    const apiUrl = sa.whatsapp_api_url
    const apiKey = sa.whatsapp_api_key
    const instanceNameRaw = sa.whatsapp_instance_name ?? `admin-${principal.uid.slice(0, 8)}`
    const instanceName = sanitizeInstanceName(instanceNameRaw)

    if (payload.action === 'admin_diagnostics') {
      const urlValidation = apiUrl ? validateEvolutionBaseUrl(apiUrl) : { ok: false as const, reason: 'missing_url' as const }
      const evolution =
        apiUrl && apiKey && (urlValidation as unknown as { ok?: unknown }).ok === true
          ? await (async () => {
              const stopOn404 = ({ body }: { body: unknown }) => isEvolutionInstanceNotFound(body, instanceName)
              const res = await evolutionRequestAuto({ baseUrl: apiUrl, apiKey, path: `/instance/connectionState/${instanceName}`, method: 'GET', stopOn404 })
              const hint = res.ok ? null : evolutionHint(res.body)
              const state = res.ok ? extractInstanceState(res.body) : null
              return { ok: res.ok, status: res.status, state, body: res.body, hint }
            })()
          : null

      return jsonResponse(200, {
        ok: true,
        uid: principal.uid,
        hasServiceRoleKey: Boolean(serviceRoleKey),
        superAdminRow: { id: sa.id },
        config: {
          hasApiUrl: Boolean(apiUrl),
          hasApiKey: Boolean(apiKey),
          instanceName,
        },
        urlValidation,
        evolution,
      })
    }

    if (!apiUrl || !apiKey) return jsonResponse(400, { error: 'whatsapp_not_configured' })

    const v = validateEvolutionBaseUrl(apiUrl)
    if (!v.ok) {
      const cleaned = (v as unknown as { cleaned?: string }).cleaned ?? null
      const hostname = (() => {
        if (!cleaned) return null
        try {
          return new URL(cleaned).hostname
        } catch {
          return null
        }
      })()
      return jsonResponse(400, {
        error: 'invalid_evolution_url',
        reason: v.reason,
        cleaned,
        hostname,
        message: 'A URL da Evolution API precisa ser pública (não pode ser localhost/IP privado).',
      })
    }

    if (payload.action === 'admin_status') {
      const stopOn404 = ({ body }: { body: unknown }) => isEvolutionInstanceNotFound(body, instanceName)
      let stateRes = await evolutionRequestAuto({ baseUrl: apiUrl, apiKey, path: `/instance/connectionState/${instanceName}`, method: 'GET', stopOn404 })
      if (!stateRes.ok && stateRes.status === 404 && isEvolutionInstanceNotFound(stateRes.body, instanceName)) {
        const createRes = await createEvolutionInstance({ apiUrl, apiKey, instanceName, qrcode: pairingNumber ? false : true, number: pairingNumber || null })
        if (!createRes.ok && createRes.status !== 409) {
          const hint = evolutionHint(createRes.body)
          return jsonResponse(createRes.status, { error: 'evolution_error', details: createRes.body, hint })
        }
        stateRes = await evolutionRequestAuto({ baseUrl: apiUrl, apiKey, path: `/instance/connectionState/${instanceName}`, method: 'GET', stopOn404 })
      }
      if (!stateRes.ok) {
        const hint = evolutionHint(stateRes.body)
        return jsonResponse(stateRes.status, { error: 'evolution_error', details: stateRes.body, hint })
      }
      const state = extractInstanceState(stateRes.body)
      return jsonResponse(200, { ok: true, instanceName, state })
    }

    if (payload.action === 'admin_connect') {
      const pairingNumber = typeof payload.number === 'string' ? sanitizePhone(payload.number) : ''
      const stopOn404 = ({ body }: { body: unknown }) => isEvolutionInstanceNotFound(body, instanceName)
      const stateRes = await evolutionRequestAuto({ baseUrl: apiUrl, apiKey, path: `/instance/connectionState/${instanceName}`, method: 'GET', stopOn404 })
      const state = stateRes.ok ? extractInstanceState(stateRes.body) : null
      let qrFromCreate: string | null = null
      let pairingFromCreate: string | null = null

      if (state === 'open') {
        if (!sa.whatsapp_instance_name) {
          const { error: updErr } = await dbClient.from('super_admin').update({ whatsapp_instance_name: instanceName }).eq('id', principal.uid)
          if (updErr && !isMissingColumnError(updErr.message)) return jsonResponse(400, { error: 'save_instance_name_failed', message: updErr.message })
        }
        return jsonResponse(200, { ok: true, instanceName, state })
      }

      if (!stateRes.ok && stateRes.status === 404 && isEvolutionInstanceNotFound(stateRes.body, instanceName)) {
        const createRes = await createEvolutionInstance({ apiUrl, apiKey, instanceName })
        if (!createRes.ok && createRes.status !== 409) {
          const hint = evolutionHint(createRes.body)
          return jsonResponse(createRes.status, { error: 'evolution_error', details: createRes.body, hint })
        }
        if (createRes.ok) {
          qrFromCreate = extractQrBase64(createRes.body)
          pairingFromCreate = extractPairingCode(createRes.body)
        }
      } else if (!stateRes.ok && stateRes.status === 404) {
        const hint = evolutionHint(stateRes.body)
        return jsonResponse(404, { error: 'evolution_error', details: stateRes.body, hint })
      }

      const connectCandidates: Array<{ method: 'GET' | 'POST'; path: string; body?: unknown }> = pairingNumber
        ? [
            { method: 'GET', path: `/instance/connect/${instanceName}?number=${encodeURIComponent(pairingNumber)}&qrcode=false` },
            { method: 'GET', path: `/instance/connect/${instanceName}?number=${encodeURIComponent(pairingNumber)}&qrCode=false` },
            { method: 'GET', path: `/instance/connect/${instanceName}?number=${encodeURIComponent(pairingNumber)}&pairingCode=true` },
            { method: 'GET', path: `/instance/connect/${instanceName}?number=${encodeURIComponent(pairingNumber)}` },
            { method: 'POST', path: `/instance/connect/${instanceName}`, body: { number: pairingNumber, qrcode: false } },
            { method: 'POST', path: `/instance/connect/${instanceName}`, body: { number: pairingNumber, qrCode: false } },
            { method: 'POST', path: `/instance/connect/${instanceName}`, body: { number: pairingNumber, pairingCode: true } },
            { method: 'POST', path: `/instance/connect/${instanceName}`, body: { number: pairingNumber, usePairingCode: true } },
            { method: 'POST', path: `/instance/connect/${instanceName}`, body: { number: pairingNumber } },
            { method: 'GET', path: `/instance/connect?instance=${encodeURIComponent(instanceName)}&number=${encodeURIComponent(pairingNumber)}&qrcode=false` },
            { method: 'GET', path: `/instance/connect?instanceName=${encodeURIComponent(instanceName)}&number=${encodeURIComponent(pairingNumber)}&qrcode=false` },
            { method: 'GET', path: `/instance/connect?instance=${encodeURIComponent(instanceName)}&number=${encodeURIComponent(pairingNumber)}` },
            { method: 'GET', path: `/instance/connect?instanceName=${encodeURIComponent(instanceName)}&number=${encodeURIComponent(pairingNumber)}` },
            { method: 'POST', path: `/instance/connect`, body: { instanceName, number: pairingNumber, qrcode: false } },
            { method: 'POST', path: `/instance/connect`, body: { instance: instanceName, number: pairingNumber, qrcode: false } },
            { method: 'POST', path: `/instance/connect`, body: { instanceName, number: pairingNumber, pairingCode: true, qrcode: false } },
            { method: 'POST', path: `/instance/connect`, body: { instance: instanceName, number: pairingNumber, pairingCode: true, qrcode: false } },
            { method: 'POST', path: `/instance/connect`, body: { instanceName, number: pairingNumber } },
            { method: 'POST', path: `/instance/connect`, body: { instance: instanceName, number: pairingNumber } },
            { method: 'GET', path: `/instance/connect/${instanceName}` },
            { method: 'POST', path: `/instance/connect/${instanceName}` },
            { method: 'GET', path: `/instance/connect?instance=${encodeURIComponent(instanceName)}` },
            { method: 'GET', path: `/instance/connect?instanceName=${encodeURIComponent(instanceName)}` },
            { method: 'POST', path: `/instance/connect`, body: { instanceName } },
            { method: 'POST', path: `/instance/connect`, body: { instance: instanceName } },
          ]
        : [
            { method: 'GET', path: `/instance/connect/${instanceName}` },
            { method: 'POST', path: `/instance/connect/${instanceName}` },
            { method: 'GET', path: `/instance/connect?instance=${encodeURIComponent(instanceName)}` },
            { method: 'GET', path: `/instance/connect?instanceName=${encodeURIComponent(instanceName)}` },
            { method: 'POST', path: `/instance/connect`, body: { instanceName } },
            { method: 'POST', path: `/instance/connect`, body: { instance: instanceName } },
          ]

      const qrCandidates: Array<{ method: 'GET' | 'POST'; path: string; body?: unknown }> = [
        { method: 'GET', path: `/instance/qrcode/${instanceName}` },
        { method: 'GET', path: `/instance/qrCode/${instanceName}` },
        { method: 'GET', path: `/instance/qr/${instanceName}` },
      ]

      let connectState: string | null = null
      let qrBase64: string | null = qrFromCreate
      let pairingCode: string | null = pairingFromCreate

      for (const c of connectCandidates) {
        const res = await evolutionRequestAuto({ baseUrl: apiUrl, apiKey, path: c.path, method: c.method, body: c.body })
        if (!res.ok) {
          if (res.status === 404) continue
          const hint = evolutionHint(res.body)
          return jsonResponse(res.status, { error: 'evolution_error', details: res.body, hint })
        }
        connectState = extractInstanceState(res.body) ?? connectState
        qrBase64 = extractQrBase64(res.body) ?? qrBase64
        pairingCode = extractPairingCode(res.body) ?? pairingCode
        if (pairingNumber) {
          if (pairingCode) break
        } else {
          if (qrBase64 || pairingCode) break
        }
      }

      if (!qrBase64 && !pairingNumber) {
        for (const c of qrCandidates) {
          const res = await evolutionRequestAuto({ baseUrl: apiUrl, apiKey, path: c.path, method: c.method, body: c.body })
          if (!res.ok) {
            if (res.status === 404) continue
            const hint = evolutionHint(res.body)
            return jsonResponse(res.status, { error: 'evolution_error', details: res.body, hint })
          }
          connectState = extractInstanceState(res.body) ?? connectState
          qrBase64 = extractQrBase64(res.body) ?? qrBase64
          pairingCode = extractPairingCode(res.body) ?? pairingCode
          if (qrBase64) break
        }
      }

      if (!connectState) {
        const stateAfterRes = await evolutionRequestAuto({ baseUrl: apiUrl, apiKey, path: `/instance/connectionState/${instanceName}`, method: 'GET', stopOn404 })
        if (stateAfterRes.ok) connectState = extractInstanceState(stateAfterRes.body)
      }

      const hint = (() => {
        if (pairingNumber && !pairingCode) {
          return 'A Evolution API não retornou código de pareamento para este número. Se sua versão não suporta pareamento por código, use “Conectar (QR Code)” em outro aparelho.'
        }
        if (!qrBase64 && !pairingCode && (connectState === 'connecting' || connectState === 'close' || connectState === 'closed')) {
          return 'A instância ainda não retornou QR Code. Isso costuma acontecer quando a Evolution está iniciando ou quando a versão do WhatsApp Web no container está desatualizada. Verifique os logs do container e, se necessário, atualize CONFIG_SESSION_PHONE_VERSION.'
        }
        return null
      })()

      if (!sa.whatsapp_instance_name) {
        const { error: updErr } = await dbClient.from('super_admin').update({ whatsapp_instance_name: instanceName }).eq('id', principal.uid)
        if (updErr && !isMissingColumnError(updErr.message)) return jsonResponse(400, { error: 'save_instance_name_failed', message: updErr.message })
      }

      const qrSafe = pairingNumber ? null : qrBase64
      return jsonResponse(200, { ok: true, instanceName, state: connectState ?? state, qrBase64: qrSafe, pairingCode, hint })
    }

    if (payload.action === 'admin_disconnect') {
      const stopOn404 = ({ body }: { body: unknown }) => isEvolutionInstanceNotFound(body, instanceName)
      let logoutRes = await evolutionRequestAuto({ baseUrl: apiUrl, apiKey, path: `/instance/logout/${instanceName}`, method: 'DELETE', stopOn404 })
      if (!logoutRes.ok && logoutRes.status === 405) {
        logoutRes = await evolutionRequestAuto({ baseUrl: apiUrl, apiKey, path: `/instance/logout/${instanceName}`, method: 'GET', stopOn404 })
      }
      if (!logoutRes.ok && logoutRes.status !== 404) {
        const hint = evolutionHint(logoutRes.body)
        return jsonResponse(logoutRes.status, { error: 'evolution_error', details: logoutRes.body, hint })
      }
      const deleteRes = await evolutionRequestAuto({ baseUrl: apiUrl, apiKey, path: `/instance/delete/${instanceName}`, method: 'DELETE', stopOn404 })
      if (!deleteRes.ok && deleteRes.status !== 404) {
        const hint = evolutionHint(deleteRes.body)
        return jsonResponse(deleteRes.status, { error: 'evolution_error', details: deleteRes.body, hint })
      }
      return jsonResponse(200, { ok: true, instanceName })
    }

    if (payload.action === 'admin_send_aviso') {
      const ids = Array.isArray(payload.cliente_ids) ? payload.cliente_ids.map((v) => String(v)).filter(Boolean) : []
      const text = String(payload.text ?? '').trim()
      if (!ids.length || !text) return jsonResponse(400, { error: 'invalid_payload' })
      if (ids.length > 500) return jsonResponse(400, { error: 'too_many_recipients', max: 500 })

      const { data: rows, error: rowsErr } = await userClient.from('usuarios').select('id,telefone,nome_negocio').in('id', ids)
      if (rowsErr) return jsonResponse(403, { error: 'not_allowed', message: rowsErr.message })

      const targets = (rows ?? []) as unknown as ClienteAvisoRow[]
      const byId: Record<string, ClienteAvisoRow> = {}
      for (const r of targets) byId[r.id] = r

      const results: Array<{ id: string; nome_negocio: string | null; status: string; details?: unknown }> = []

      let sent = 0
      let failed = 0
      let skippedNoPhone = 0
      let skippedInvalidPhone = 0

      const stopOn404 = ({ body }: { body: unknown }) => isEvolutionInstanceNotFound(body, instanceName)

      for (const id of ids) {
        const row = byId[id] ?? null
        if (!row) {
          failed += 1
          results.push({ id, nome_negocio: null, status: 'not_found' })
          continue
        }

        const rawPhone = row.telefone ?? ''
        if (!rawPhone.trim()) {
          skippedNoPhone += 1
          results.push({ id: row.id, nome_negocio: row.nome_negocio ?? null, status: 'skipped_no_phone' })
          continue
        }

        const phoneRaw = rawPhone
        if (!sanitizePhone(rawPhone)) {
          skippedInvalidPhone += 1
          results.push({ id: row.id, nome_negocio: row.nome_negocio ?? null, status: 'skipped_invalid_phone', details: { telefone: rawPhone } })
          continue
        }

        let sendRes = await evolutionSendTextWithFallback({ apiUrl, apiKey, instanceName, phoneRaw, text, stopOn404 })

        if (!sendRes.ok && sendRes.status === 404 && isEvolutionInstanceNotFound(sendRes.body, instanceName)) {
          const createRes = await createEvolutionInstance({ apiUrl, apiKey, instanceName })
          if (!createRes.ok && createRes.status !== 409) {
            const hint = evolutionHint(createRes.body)
            failed += 1
            results.push({ id: row.id, nome_negocio: row.nome_negocio ?? null, status: 'failed', details: { error: 'evolution_error', details: createRes.body, hint } })
            continue
          }
          sendRes = await evolutionSendTextWithFallback({ apiUrl, apiKey, instanceName, phoneRaw, text, stopOn404 })
        }

        if (!sendRes.ok) {
          const hint = evolutionHint(sendRes.body)
          failed += 1
          results.push({
            id: row.id,
            nome_negocio: row.nome_negocio ?? null,
            status: 'failed',
            details: { status: sendRes.status, body: sendRes.body, hint, attempts: (sendRes as unknown as { attempts?: unknown }).attempts ?? null },
          })
          continue
        }

        sent += 1
        results.push({ id: row.id, nome_negocio: row.nome_negocio ?? null, status: 'sent' })
      }

      return jsonResponse(200, {
        ok: true,
        totals: {
          selected: ids.length,
          found: targets.length,
          sent,
          failed,
          skipped_no_phone: skippedNoPhone,
          skipped_invalid_phone: skippedInvalidPhone,
        },
        results,
      })
    }

    return jsonResponse(400, { error: 'unknown_action' })
  }

  if (principal.kind === 'super_admin') return jsonResponse(403, { error: 'not_allowed' })

  const masterId = principal.masterId

  const { data: userBase, error: userBaseErr } = await dbClient
    .from('usuarios')
    .select('id,slug,nome_negocio,telefone,endereco,whatsapp_habilitado')
    .eq('id', masterId)
    .maybeSingle()

  if (userBaseErr || !userBase) {
    return jsonResponse(403, { error: 'not_allowed' })
  }

  const selectExtraFull =
    'whatsapp_instance_name,enviar_confirmacao,enviar_lembrete,enviar_cancelamento,lembrete_horas_antes,mensagem_confirmacao,mensagem_lembrete,mensagem_cancelamento'
  const selectExtraFallback = 'whatsapp_instance_name,enviar_confirmacao,enviar_lembrete,lembrete_horas_antes,mensagem_confirmacao,mensagem_lembrete'

  const userExtraFirst = await dbClient.from('usuarios').select(selectExtraFull).eq('id', masterId).maybeSingle()
  const userExtraSecond =
    userExtraFirst.error && isMissingColumnError(userExtraFirst.error.message)
      ? await dbClient.from('usuarios').select(selectExtraFallback).eq('id', masterId).maybeSingle()
      : null

  const userExtraRaw = (userExtraSecond ? userExtraSecond.data : userExtraFirst.data) as unknown
  const userExtraErr = userExtraSecond ? userExtraSecond.error : userExtraFirst.error

  const userExtraOk = !userExtraErr || !isMissingColumnError(userExtraErr.message)
  const userExtraSafe = userExtraOk ? (userExtraRaw as unknown) : null

  const userBaseRow = userBase as unknown as UsuarioBaseRow
  const userExtra = (userExtraSafe ?? null) as unknown as UsuarioExtraRow | null

  if (!serviceClient) {
    return jsonResponse(500, {
      error: 'whatsapp_config_requires_service_role',
      message: 'A Edge Function precisa do SERVICE_ROLE_KEY para ler a configuração global do WhatsApp.',
      hint: 'No Supabase: Project Settings → Edge Functions → Secrets. Defina SERVICE_ROLE_KEY (ou SUPABASE_SERVICE_ROLE_KEY) e faça o deploy da função novamente.',
    })
  }

  const globalCfg = await loadGlobalWhatsappConfig(dbClient)
  if (!globalCfg.ok) {
    if (globalCfg.error === 'schema_incomplete') {
      return jsonResponse(400, { error: 'schema_incomplete', message: 'Execute o SQL do WhatsApp (Super Admin) em /admin/configuracoes.' })
    }
    if (globalCfg.error === 'permission_denied') {
      return jsonResponse(500, {
        error: 'whatsapp_config_requires_service_role',
        message: 'A Edge Function precisa do SERVICE_ROLE_KEY para ler a configuração global do WhatsApp.',
        hint: 'No Supabase: Project Settings → Edge Functions → Secrets. Defina SERVICE_ROLE_KEY (ou SUPABASE_SERVICE_ROLE_KEY) e faça o deploy da função novamente.',
      })
    }
    return jsonResponse(502, { error: 'load_whatsapp_config_failed', message: globalCfg.message })
  }

  const apiUrl = globalCfg.apiUrl
  const apiKey = globalCfg.apiKey
  const enabled = userBaseRow.whatsapp_habilitado
  const whatsappEnabled = enabled === undefined || enabled === null ? true : Boolean(enabled)
  const slug = userBaseRow.slug ?? ''
  const instanceNameRaw = userExtra?.whatsapp_instance_name ?? slug
  const instanceName = sanitizeInstanceName(instanceNameRaw)

  if (payload.action === 'config_status') {
    const configured = Boolean(apiUrl && apiKey)
    if (!configured) return jsonResponse(200, { ok: true, configured: false })
    const v = validateEvolutionBaseUrl(apiUrl)
    return jsonResponse(200, { ok: true, configured: v.ok })
  }

  if (!whatsappEnabled) {
    return jsonResponse(403, { error: 'whatsapp_disabled' })
  }

  if (payload.action === 'connect' || payload.action === 'status' || payload.action === 'disconnect' || payload.action === 'send_test') {
    if (principal.kind !== 'usuario' || principal.uid !== masterId) {
      return jsonResponse(403, { error: 'only_master_can_manage' })
    }
  }

  if (payload.action !== 'send_confirmacao' && payload.action !== 'send_cancelamento' && (!apiUrl || !apiKey)) {
    return jsonResponse(400, { error: 'whatsapp_not_configured' })
  }

  if (payload.action !== 'send_confirmacao' && payload.action !== 'send_cancelamento') {
    const v = validateEvolutionBaseUrl(apiUrl ?? '')
    if (!v.ok) {
      const cleaned = (v as unknown as { cleaned?: string }).cleaned ?? null
      const hostname = (() => {
        if (!cleaned) return null
        try {
          return new URL(cleaned).hostname
        } catch {
          return null
        }
      })()
      return jsonResponse(400, {
        error: 'invalid_evolution_url',
        reason: v.reason,
        cleaned,
        hostname,
        message: 'A URL da Evolution API precisa ser pública (não pode ser localhost/IP privado).',
      })
    }
  }

  if (payload.action === 'status') {
    const stopOn404 = ({ body }: { body: unknown }) => isEvolutionInstanceNotFound(body, instanceName)
    let stateRes = await evolutionRequestAuto({
      baseUrl: apiUrl!,
      apiKey: apiKey!,
      path: `/instance/connectionState/${instanceName}`,
      method: 'GET',
      stopOn404,
    })

      if (!stateRes.ok && stateRes.status === 404 && isEvolutionInstanceNotFound(stateRes.body, instanceName)) {
        const createRes = await createEvolutionInstance({ apiUrl: apiUrl!, apiKey: apiKey!, instanceName, qrcode: pairingNumber ? false : true, number: pairingNumber || null })
        if (!createRes.ok && createRes.status !== 409) {
          const hint = evolutionHint(createRes.body)
          return jsonResponse(createRes.status, { error: 'evolution_error', details: createRes.body, hint })
        }
      stateRes = await evolutionRequestAuto({
        baseUrl: apiUrl!,
        apiKey: apiKey!,
        path: `/instance/connectionState/${instanceName}`,
        method: 'GET',
        stopOn404,
      })
    }

    if (!stateRes.ok) {
      const hint = evolutionHint(stateRes.body)
      return jsonResponse(stateRes.status, { error: 'evolution_error', details: stateRes.body, hint })
    }
    const state = extractInstanceState(stateRes.body)
    return jsonResponse(200, { ok: true, instanceName, state })
  }

  if (payload.action === 'connect') {
    const pairingNumber = typeof payload.number === 'string' ? sanitizePhone(payload.number) : ''
    const stopOn404 = ({ body }: { body: unknown }) => isEvolutionInstanceNotFound(body, instanceName)
    const stateRes = await evolutionRequestAuto({
      baseUrl: apiUrl!,
      apiKey: apiKey!,
      path: `/instance/connectionState/${instanceName}`,
      method: 'GET',
      stopOn404,
    })
    const state = stateRes.ok ? extractInstanceState(stateRes.body) : null
    let qrFromCreate: string | null = null
    let pairingFromCreate: string | null = null

    if (state === 'open') {
      if (userExtraOk) {
        const { error: updErr } = await dbClient.from('usuarios').update({ whatsapp_instance_name: instanceName }).eq('id', masterId)
        if (updErr && !isMissingColumnError(updErr.message)) {
          return jsonResponse(400, { error: 'save_instance_name_failed', message: updErr.message })
        }
      }
      return jsonResponse(200, { ok: true, instanceName, state })
    }

    if (!stateRes.ok && stateRes.status === 404 && isEvolutionInstanceNotFound(stateRes.body, instanceName)) {
      const createRes = await createEvolutionInstance({ apiUrl: apiUrl!, apiKey: apiKey!, instanceName, qrcode: pairingNumber ? false : true, number: pairingNumber || null })
      if (!createRes.ok && createRes.status !== 409) {
        const hint = evolutionHint(createRes.body)
        return jsonResponse(createRes.status, { error: 'evolution_error', details: createRes.body, hint })
      }
      if (createRes.ok) {
        qrFromCreate = extractQrBase64(createRes.body)
        pairingFromCreate = extractPairingCode(createRes.body)
      }
    } else if (!stateRes.ok && stateRes.status === 404) {
      const hint = evolutionHint(stateRes.body)
      return jsonResponse(404, { error: 'evolution_error', details: stateRes.body, hint })
    }

    const connectCandidates: Array<{ method: 'GET' | 'POST'; path: string; body?: unknown }> = pairingNumber
      ? [
          { method: 'GET', path: `/instance/connect/${instanceName}?number=${encodeURIComponent(pairingNumber)}` },
          { method: 'POST', path: `/instance/connect/${instanceName}`, body: { number: pairingNumber } },
          { method: 'GET', path: `/instance/connect?instance=${encodeURIComponent(instanceName)}&number=${encodeURIComponent(pairingNumber)}` },
          { method: 'GET', path: `/instance/connect?instanceName=${encodeURIComponent(instanceName)}&number=${encodeURIComponent(pairingNumber)}` },
          { method: 'POST', path: `/instance/connect`, body: { instanceName, number: pairingNumber } },
          { method: 'POST', path: `/instance/connect`, body: { instance: instanceName, number: pairingNumber } },
          { method: 'GET', path: `/instance/connect/${instanceName}` },
          { method: 'POST', path: `/instance/connect/${instanceName}` },
          { method: 'GET', path: `/instance/connect?instance=${encodeURIComponent(instanceName)}` },
          { method: 'GET', path: `/instance/connect?instanceName=${encodeURIComponent(instanceName)}` },
          { method: 'POST', path: `/instance/connect`, body: { instanceName } },
          { method: 'POST', path: `/instance/connect`, body: { instance: instanceName } },
        ]
      : [
          { method: 'GET', path: `/instance/connect/${instanceName}` },
          { method: 'POST', path: `/instance/connect/${instanceName}` },
          { method: 'GET', path: `/instance/connect?instance=${encodeURIComponent(instanceName)}` },
          { method: 'GET', path: `/instance/connect?instanceName=${encodeURIComponent(instanceName)}` },
          { method: 'POST', path: `/instance/connect`, body: { instanceName } },
          { method: 'POST', path: `/instance/connect`, body: { instance: instanceName } },
        ]

    const qrCandidates: Array<{ method: 'GET' | 'POST'; path: string; body?: unknown }> = [
      { method: 'GET', path: `/instance/qrcode/${instanceName}` },
      { method: 'GET', path: `/instance/qrCode/${instanceName}` },
      { method: 'GET', path: `/instance/qr/${instanceName}` },
    ]

    let connectState: string | null = null
    let qrBase64: string | null = qrFromCreate
    let pairingCode: string | null = pairingFromCreate

    for (const c of connectCandidates) {
      const res = await evolutionRequestAuto({ baseUrl: apiUrl!, apiKey: apiKey!, path: c.path, method: c.method, body: c.body })
      if (!res.ok) {
        if (res.status === 404) continue
        const hint = evolutionHint(res.body)
        return jsonResponse(res.status, { error: 'evolution_error', details: res.body, hint })
      }

      connectState = extractInstanceState(res.body) ?? connectState
      qrBase64 = extractQrBase64(res.body) ?? qrBase64
      pairingCode = extractPairingCode(res.body) ?? pairingCode

      if (pairingNumber) {
        if (pairingCode) break
      } else {
        if (qrBase64) break
        if (pairingCode) break
      }
    }

    if (!qrBase64 && !pairingNumber) {
      for (const c of qrCandidates) {
        const res = await evolutionRequestAuto({ baseUrl: apiUrl!, apiKey: apiKey!, path: c.path, method: c.method, body: c.body })
        if (!res.ok) {
          if (res.status === 404) continue
          const hint = evolutionHint(res.body)
          return jsonResponse(res.status, { error: 'evolution_error', details: res.body, hint })
        }

        connectState = extractInstanceState(res.body) ?? connectState
        qrBase64 = extractQrBase64(res.body) ?? qrBase64
        pairingCode = extractPairingCode(res.body) ?? pairingCode
        if (qrBase64) break
      }
    }

    if (!connectState) {
      const stopOn404 = ({ body }: { body: unknown }) => isEvolutionInstanceNotFound(body, instanceName)
      const stateAfterRes = await evolutionRequestAuto({ baseUrl: apiUrl!, apiKey: apiKey!, path: `/instance/connectionState/${instanceName}`, method: 'GET', stopOn404 })
      if (stateAfterRes.ok) connectState = extractInstanceState(stateAfterRes.body)
    }

    const hint = (() => {
      if (pairingNumber && !pairingCode) {
        return 'A Evolution API não retornou código de pareamento para este número. Atualize a Evolution e confirme suporte a pairing code (Baileys); se não suportar, use “Conectar (QR Code)” em outro aparelho.'
      }
      if (!qrBase64 && !pairingCode && (connectState === 'connecting' || connectState === 'close' || connectState === 'closed')) {
        return 'A instância ainda não retornou QR Code. Isso costuma acontecer quando a Evolution está iniciando ou quando a versão do WhatsApp Web no container está desatualizada. Verifique os logs do container e, se necessário, atualize CONFIG_SESSION_PHONE_VERSION.'
      }
      return null
    })()
    if (userExtraOk) {
      const { error: updErr } = await dbClient.from('usuarios').update({ whatsapp_instance_name: instanceName }).eq('id', masterId)
      if (updErr && !isMissingColumnError(updErr.message)) {
        return jsonResponse(400, { error: 'save_instance_name_failed', message: updErr.message })
      }
    }
    const qrSafe = pairingNumber ? null : qrBase64
    return jsonResponse(200, { ok: true, instanceName, state: connectState ?? state, qrBase64: qrSafe, pairingCode, hint })
  }

  if (payload.action === 'disconnect') {
    const stopOn404 = ({ body }: { body: unknown }) => isEvolutionInstanceNotFound(body, instanceName)

    let logoutRes = await evolutionRequestAuto({ baseUrl: apiUrl!, apiKey: apiKey!, path: `/instance/logout/${instanceName}`, method: 'DELETE', stopOn404 })
    if (!logoutRes.ok && logoutRes.status === 405) {
      logoutRes = await evolutionRequestAuto({ baseUrl: apiUrl!, apiKey: apiKey!, path: `/instance/logout/${instanceName}`, method: 'GET', stopOn404 })
    }
    if (!logoutRes.ok && logoutRes.status !== 404) {
      const hint = evolutionHint(logoutRes.body)
      return jsonResponse(logoutRes.status, { error: 'evolution_error', details: logoutRes.body, hint })
    }

    const deleteRes = await evolutionRequestAuto({ baseUrl: apiUrl!, apiKey: apiKey!, path: `/instance/delete/${instanceName}`, method: 'DELETE', stopOn404 })
    if (!deleteRes.ok && deleteRes.status !== 404) {
      const hint = evolutionHint(deleteRes.body)
      return jsonResponse(deleteRes.status, { error: 'evolution_error', details: deleteRes.body, hint })
    }

    return jsonResponse(200, { ok: true, instanceName })
  }

  if (payload.action === 'send_test') {
    const phoneRaw = String(payload.number ?? '')
    const text = String(payload.text ?? '').trim()
    if (!sanitizePhone(phoneRaw) || !text) return jsonResponse(400, { error: 'invalid_payload' })

    const stopOn404 = ({ body }: { body: unknown }) => isEvolutionInstanceNotFound(body, instanceName)
    let sendRes = await evolutionSendTextWithFallback({ apiUrl: apiUrl!, apiKey: apiKey!, instanceName, phoneRaw, text, stopOn404 })

    if (!sendRes.ok && sendRes.status === 404 && isEvolutionInstanceNotFound(sendRes.body, instanceName)) {
      const createRes = await createEvolutionInstance({ apiUrl: apiUrl!, apiKey: apiKey!, instanceName })
      if (!createRes.ok && createRes.status !== 409) {
        const hint = evolutionHint(createRes.body)
        return jsonResponse(createRes.status, { error: 'evolution_error', details: createRes.body, hint })
      }
      sendRes = await evolutionSendTextWithFallback({ apiUrl: apiUrl!, apiKey: apiKey!, instanceName, phoneRaw, text, stopOn404 })
    }

    if (!sendRes.ok) {
      const hint = evolutionHint(sendRes.body)
      return jsonResponse(sendRes.status, {
        error: 'evolution_error',
        details: sendRes.body,
        hint,
        attempts: (sendRes as unknown as { attempts?: unknown }).attempts ?? null,
      })
    }
    return jsonResponse(200, { ok: true })
  }

  if (payload.action === 'send_confirmacao') {
    const agendamentoId = String(payload.agendamento_id ?? '').trim()
    if (!agendamentoId) return jsonResponse(400, { error: 'invalid_payload' })

    const selectFull =
      'id,usuario_id,cliente_nome,cliente_telefone,data,hora_inicio,status,funcionario_id,unidade_id,extras,servico:servicos(nome,preco),funcionario:funcionarios(nome_completo,telefone),unidade:unidades(nome,endereco,telefone)'
    const selectBase = 'id,usuario_id,cliente_nome,cliente_telefone,data,hora_inicio,status,extras,servico:servicos(nome,preco)'

    const first = await userClient.from('agendamentos').select(selectFull).eq('id', agendamentoId).maybeSingle()
    const second =
      first.error && (isMissingTableError(first.error.message) || isMissingColumnError(first.error.message) || isMissingRelationshipError(first.error.message))
        ? await userClient.from('agendamentos').select(selectBase).eq('id', agendamentoId).maybeSingle()
        : null

    const ag = (second ? second.data : first.data) as unknown
    const agErr = second ? second.error : first.error

    if (agErr || !ag) return jsonResponse(404, { error: 'agendamento_not_found' })
    const agRow = ag as unknown as AgendamentoRow
    if (agRow.usuario_id !== masterId) return jsonResponse(403, { error: 'not_allowed' })
    const statusNormalized = String(agRow.status ?? '')
      .trim()
      .toLowerCase()
    if (statusNormalized !== 'confirmado') {
      return jsonResponse(400, {
        error: 'agendamento_not_confirmed',
        status: agRow.status,
        hint: 'A confirmação automática só envia quando o status do agendamento está como “confirmado”.',
      })
    }

    const { data: agExtraRaw, error: agExtraErr } = await userClient
      .from('agendamentos')
      .select('confirmacao_enviada')
      .eq('id', agendamentoId)
      .maybeSingle()

    const agExtraOk = !agExtraErr || !isMissingColumnError(agExtraErr.message)
    const agExtraSafe = agExtraOk ? agExtraRaw : null

    const agExtra = (agExtraSafe ?? null) as unknown as AgendamentoConfirmacaoRow | null

    if (agExtra?.confirmacao_enviada === true) return jsonResponse(200, { ok: true, alreadySent: true })

    const shouldSend = userExtra?.enviar_confirmacao !== false
    if (!shouldSend) return jsonResponse(200, { ok: true, skipped: 'disabled' })

    const tmplCandidate = (userExtra?.mensagem_confirmacao ?? '').trim()
    const tmpl = tmplCandidate ? (userExtra?.mensagem_confirmacao ?? '') : defaultConfirmacao

    const clienteEndereco = readExtrasEndereco(agRow.extras)
    const unidadeEndereco = (agRow.unidade?.endereco ?? '').trim()
    const endereco = clienteEndereco || unidadeEndereco || (userBaseRow.endereco ?? '')
    const telefoneProfissional = (agRow.funcionario?.telefone ?? '').trim() || (userBaseRow.telefone ?? '')

    const vars = {
      nome: agRow.cliente_nome ?? '',
      data: formatBRDate(agRow.data),
      hora: agRow.hora_inicio ?? '',
      servico: agRow.servico?.nome ?? '',
      preco: agRow.servico?.preco != null ? formatBRL(Number(agRow.servico.preco)) : '',
      cliente_endereco: clienteEndereco,
      endereco,
      nome_negocio: userBaseRow.nome_negocio ?? '',
      telefone_profissional: telefoneProfissional,
      profissional_nome: agRow.funcionario?.nome_completo ?? '',
      unidade_nome: agRow.unidade?.nome ?? '',
      unidade_endereco: unidadeEndereco,
      unidade_telefone: agRow.unidade?.telefone ?? '',
    }
    const message = interpolateTemplate(tmpl, vars).trim()
    const phoneRaw = String(agRow.cliente_telefone ?? '')
    const phoneOk = Boolean(sanitizePhone(phoneRaw))
    const msgOk = Boolean(message)

    const clienteEmail = readExtrasEmail(agRow.extras)
    const canEmail = Boolean(resendApiKey && clienteEmail)

    const tryEmail = async (reason: string) => {
      if (!canEmail) return null
      if (!msgOk) return null
      const negocio = (userBaseRow.nome_negocio ?? '').trim() || 'SMagenda'
      const subject = `Agendamento confirmado — ${negocio}`
      const res = await resendSendEmail({ apiKey: resendApiKey, from: resendFrom, to: clienteEmail, subject, text: message })
      if (res.ok && agExtraOk) {
        await userClient
          .from('agendamentos')
          .update({ confirmacao_enviada: true, confirmacao_enviada_em: new Date().toISOString() })
          .eq('id', agendamentoId)
          .eq('usuario_id', masterId)
          .eq('confirmacao_enviada', false)
      }
      return { ok: res.ok, status: res.status, reason, to: clienteEmail, body: res.body }
    }

    const canWhatsapp = Boolean(apiUrl && apiKey)
    if (!msgOk) {
      return jsonResponse(400, {
        error: 'missing_message_data',
        phone_ok: phoneOk,
        message_ok: msgOk,
        phone_masked: phoneRaw ? maskRecipient(phoneRaw) : null,
        hint: 'A mensagem de confirmação ficou vazia. Verifique o modelo de mensagem em Configurações > Mensagens automáticas.',
      })
    }

    if (!phoneOk) {
      const emailFallback = await tryEmail('invalid_phone')
      if (emailFallback) return jsonResponse(emailFallback.ok ? 200 : 502, { ok: emailFallback.ok, fallback: { email: emailFallback } })
      return jsonResponse(400, {
        error: 'missing_message_data',
        phone_ok: phoneOk,
        message_ok: msgOk,
        phone_masked: phoneRaw ? maskRecipient(phoneRaw) : null,
        hint: 'O agendamento não tem telefone válido do cliente. Preencha o telefone com DDD (ex.: 11999999999).',
      })
    }

    if (!canWhatsapp) {
      const emailFallback = await tryEmail('whatsapp_not_configured')
      if (emailFallback) return jsonResponse(emailFallback.ok ? 200 : 502, { ok: emailFallback.ok, skipped: 'not_configured', fallback: { email: emailFallback } })
      return jsonResponse(200, { ok: true, skipped: 'not_configured' })
    }

    const stopOn404 = ({ body }: { body: unknown }) => isEvolutionInstanceNotFound(body, instanceName)

    const stateRes = await evolutionRequestAuto({ baseUrl: apiUrl, apiKey, path: `/instance/connectionState/${instanceName}`, method: 'GET', stopOn404 })
    const state = stateRes.ok ? extractInstanceState(stateRes.body) : null
    const stateNormalized = (state ?? '').trim().toLowerCase()

    let sendRes = await evolutionSendTextWithFallback({ apiUrl, apiKey, instanceName, phoneRaw, text: message, stopOn404 })

    if (!sendRes.ok && sendRes.status === 404 && isEvolutionInstanceNotFound(sendRes.body, instanceName)) {
      const createRes = await createEvolutionInstance({ apiUrl, apiKey, instanceName })
      if (!createRes.ok && createRes.status !== 409) {
        const hint = evolutionHint(createRes.body)
        return jsonResponse(createRes.status, { error: 'evolution_error', details: createRes.body, hint })
      }
      sendRes = await evolutionSendTextWithFallback({ apiUrl, apiKey, instanceName, phoneRaw, text: message, stopOn404 })
    }

    if (!sendRes.ok) {
      if (stateNormalized && stateNormalized !== 'open' && stateNormalized !== 'connected') {
        const emailFallback = await tryEmail('instance_not_connected')
        if (emailFallback) {
          return jsonResponse(emailFallback.ok ? 200 : 502, {
            ok: emailFallback.ok,
            error: 'instance_not_connected',
            state,
            instanceName,
            fallback: { email: emailFallback },
          })
        }
        return jsonResponse(409, {
          error: 'instance_not_connected',
          state,
          instanceName,
          hint: 'WhatsApp ainda não está conectado nessa instância. Vá em Configurações > WhatsApp e clique em Conectar (QR Code) e depois tente novamente.',
        })
      }

      const hint = evolutionHint(sendRes.body)
      const emailFallback = await tryEmail('evolution_error')
      if (emailFallback) {
        return jsonResponse(emailFallback.ok ? 200 : 502, {
          ok: emailFallback.ok,
          error: 'evolution_error',
          details: sendRes.body,
          hint,
          attempts: (sendRes as unknown as { attempts?: unknown }).attempts ?? null,
          fallback: { email: emailFallback },
        })
      }
      return jsonResponse(sendRes.status, {
        error: 'evolution_error',
        details: sendRes.body,
        hint,
        attempts: (sendRes as unknown as { attempts?: unknown }).attempts ?? null,
      })
    }

    if (agExtraOk) {
      const { error: updErr } = await userClient
        .from('agendamentos')
        .update({ confirmacao_enviada: true, confirmacao_enviada_em: new Date().toISOString() })
        .eq('id', agendamentoId)
        .eq('usuario_id', masterId)
        .eq('confirmacao_enviada', false)
      if (updErr && !isMissingColumnError(updErr.message)) {
        return jsonResponse(400, { error: 'save_confirmacao_flag_failed', message: updErr.message })
      }
    }

    return jsonResponse(200, { ok: true, state })
  }

  if (payload.action === 'send_cancelamento') {
    const agendamentoId = String(payload.agendamento_id ?? '').trim()
    if (!agendamentoId) return jsonResponse(400, { error: 'invalid_payload' })

    const selectFull =
      'id,usuario_id,cliente_nome,cliente_telefone,data,hora_inicio,status,funcionario_id,unidade_id,extras,servico:servicos(nome,preco),funcionario:funcionarios(nome_completo,telefone),unidade:unidades(nome,endereco,telefone)'
    const selectBase = 'id,usuario_id,cliente_nome,cliente_telefone,data,hora_inicio,status,extras,servico:servicos(nome,preco)'

    const first = await userClient.from('agendamentos').select(selectFull).eq('id', agendamentoId).maybeSingle()
    const second =
      first.error && (isMissingTableError(first.error.message) || isMissingColumnError(first.error.message) || isMissingRelationshipError(first.error.message))
        ? await userClient.from('agendamentos').select(selectBase).eq('id', agendamentoId).maybeSingle()
        : null

    const ag = (second ? second.data : first.data) as unknown
    const agErr = second ? second.error : first.error

    if (agErr || !ag) return jsonResponse(404, { error: 'agendamento_not_found' })
    const agRow = ag as unknown as AgendamentoRow
    if (agRow.usuario_id !== masterId) return jsonResponse(403, { error: 'not_allowed' })

    const statusNormalized = String(agRow.status ?? '')
      .trim()
      .toLowerCase()
    if (statusNormalized !== 'cancelado') {
      return jsonResponse(400, {
        error: 'agendamento_not_cancelled',
        status: agRow.status,
        hint: 'O aviso de cancelamento só envia quando o status do agendamento está como “cancelado”.',
      })
    }

    const shouldSend = (userExtra?.enviar_cancelamento ?? true) !== false
    if (!shouldSend) return jsonResponse(200, { ok: true, skipped: 'disabled' })

    const tmplCandidate = (userExtra?.mensagem_cancelamento ?? '').trim()
    const tmpl = tmplCandidate ? (userExtra?.mensagem_cancelamento ?? '') : defaultCancelamento

    const clienteEndereco = readExtrasEndereco(agRow.extras)
    const unidadeEndereco = (agRow.unidade?.endereco ?? '').trim()
    const endereco = clienteEndereco || unidadeEndereco || (userBaseRow.endereco ?? '')
    const telefoneProfissional = (agRow.funcionario?.telefone ?? '').trim() || (userBaseRow.telefone ?? '')

    const vars = {
      nome: agRow.cliente_nome ?? '',
      data: formatBRDate(agRow.data),
      hora: agRow.hora_inicio ?? '',
      servico: agRow.servico?.nome ?? '',
      preco: agRow.servico?.preco != null ? formatBRL(Number(agRow.servico.preco)) : '',
      cliente_endereco: clienteEndereco,
      endereco,
      nome_negocio: userBaseRow.nome_negocio ?? '',
      telefone_profissional: telefoneProfissional,
      profissional_nome: agRow.funcionario?.nome_completo ?? '',
      unidade_nome: agRow.unidade?.nome ?? '',
      unidade_endereco: unidadeEndereco,
      unidade_telefone: agRow.unidade?.telefone ?? '',
    }
    const message = interpolateTemplate(tmpl, vars).trim()
    const phoneRaw = String(agRow.cliente_telefone ?? '')
    const phoneOk = Boolean(sanitizePhone(phoneRaw))
    const msgOk = Boolean(message)

    const clienteEmail = readExtrasEmail(agRow.extras)
    const canEmail = Boolean(resendApiKey && clienteEmail)

    const tryEmail = async (reason: string) => {
      if (!canEmail) return null
      if (!msgOk) return null
      const negocio = (userBaseRow.nome_negocio ?? '').trim() || 'SMagenda'
      const subject = `Agendamento cancelado — ${negocio}`
      const res = await resendSendEmail({ apiKey: resendApiKey, from: resendFrom, to: clienteEmail, subject, text: message })
      return { ok: res.ok, status: res.status, reason, to: clienteEmail, body: res.body }
    }

    const canWhatsapp = Boolean(apiUrl && apiKey)
    if (!msgOk) {
      return jsonResponse(400, {
        error: 'missing_message_data',
        phone_ok: phoneOk,
        message_ok: msgOk,
        phone_masked: phoneRaw ? maskRecipient(phoneRaw) : null,
        hint: 'A mensagem de cancelamento ficou vazia.',
      })
    }

    if (!phoneOk) {
      const emailFallback = await tryEmail('invalid_phone')
      if (emailFallback) return jsonResponse(emailFallback.ok ? 200 : 502, { ok: emailFallback.ok, fallback: { email: emailFallback } })
      return jsonResponse(400, {
        error: 'missing_message_data',
        phone_ok: phoneOk,
        message_ok: msgOk,
        phone_masked: phoneRaw ? maskRecipient(phoneRaw) : null,
        hint: 'O agendamento não tem telefone válido do cliente. Preencha o telefone com DDD (ex.: 11999999999).',
      })
    }

    if (!canWhatsapp) {
      const emailFallback = await tryEmail('whatsapp_not_configured')
      if (emailFallback) return jsonResponse(emailFallback.ok ? 200 : 502, { ok: emailFallback.ok, skipped: 'not_configured', fallback: { email: emailFallback } })
      return jsonResponse(200, { ok: true, skipped: 'not_configured' })
    }

    const stopOn404 = ({ body }: { body: unknown }) => isEvolutionInstanceNotFound(body, instanceName)

    const stateRes = await evolutionRequestAuto({ baseUrl: apiUrl, apiKey, path: `/instance/connectionState/${instanceName}`, method: 'GET', stopOn404 })
    const state = stateRes.ok ? extractInstanceState(stateRes.body) : null
    const stateNormalized = (state ?? '').trim().toLowerCase()

    let sendRes = await evolutionSendTextWithFallback({ apiUrl, apiKey, instanceName, phoneRaw, text: message, stopOn404 })

    if (!sendRes.ok && sendRes.status === 404 && isEvolutionInstanceNotFound(sendRes.body, instanceName)) {
      const createRes = await createEvolutionInstance({ apiUrl, apiKey, instanceName })
      if (!createRes.ok && createRes.status !== 409) {
        const hint = evolutionHint(createRes.body)
        return jsonResponse(createRes.status, { error: 'evolution_error', details: createRes.body, hint })
      }
      sendRes = await evolutionSendTextWithFallback({ apiUrl, apiKey, instanceName, phoneRaw, text: message, stopOn404 })
    }

    if (!sendRes.ok) {
      if (stateNormalized && stateNormalized !== 'open' && stateNormalized !== 'connected') {
        const emailFallback = await tryEmail('instance_not_connected')
        if (emailFallback) {
          return jsonResponse(emailFallback.ok ? 200 : 502, {
            ok: emailFallback.ok,
            error: 'instance_not_connected',
            state,
            instanceName,
            fallback: { email: emailFallback },
          })
        }
        return jsonResponse(409, {
          error: 'instance_not_connected',
          state,
          instanceName,
          hint: 'WhatsApp ainda não está conectado nessa instância. Vá em Configurações > WhatsApp e clique em Conectar (QR Code) e depois tente novamente.',
        })
      }

      const hint = evolutionHint(sendRes.body)
      const emailFallback = await tryEmail('evolution_error')
      if (emailFallback) {
        return jsonResponse(emailFallback.ok ? 200 : 502, {
          ok: emailFallback.ok,
          error: 'evolution_error',
          details: sendRes.body,
          hint,
          attempts: (sendRes as unknown as { attempts?: unknown }).attempts ?? null,
          fallback: { email: emailFallback },
        })
      }
      return jsonResponse(sendRes.status, {
        error: 'evolution_error',
        details: sendRes.body,
        hint,
        attempts: (sendRes as unknown as { attempts?: unknown }).attempts ?? null,
      })
    }

    return jsonResponse(200, { ok: true, state })
  }

  return jsonResponse(400, { error: 'unknown_action' })
})
