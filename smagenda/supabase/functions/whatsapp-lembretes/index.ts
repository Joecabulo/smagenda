import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0'

type UsuarioRow = {
  id: string
  whatsapp_instance_name: string | null
  slug: string | null
  enviar_confirmacao: boolean | null
  enviar_lembrete: boolean | null
  lembrete_horas_antes: number | null
  mensagem_lembrete: string | null
  mensagem_confirmacao: string | null
  nome_negocio: string | null
  telefone: string | null
  endereco: string | null
}

type BillingUsuarioRow = {
  id: string
  whatsapp_instance_name: string | null
  slug: string | null
  nome_negocio: string | null
  telefone: string | null
  whatsapp_habilitado?: boolean | null
  status_pagamento?: string | null
  data_vencimento?: string | null
  plano?: string | null
  ativo?: boolean | null
}

type SuperAdminConfigRow = {
  id: string
  whatsapp_api_url: string | null
  whatsapp_api_key: string | null
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
  lembrete_enviado: boolean | null
  confirmacao_enviada?: boolean | null
  servico: ServicoRow | null
  funcionario?: FuncionarioRow | null
  unidade?: UnidadeRow | null
}

type UsuarioPartialRow = {
  id: string
  whatsapp_instance_name: string | null
  slug: string | null
  enviar_confirmacao: boolean | null
  mensagem_confirmacao: string | null
  nome_negocio: string | null
  telefone: string | null
  endereco: string | null
}

const defaultConfirmacao = `Olá {nome}!\n\nSeu agendamento foi confirmado:\n📅 {data} às {hora}\n✂️ {servico}\n💰 {preco}\n\nLocal: {endereco}\n\nNos vemos em breve!\n{nome_negocio}`

const FN_VERSION = 'whatsapp-lembretes@2025-12-31'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Expose-Headers': 'x-smagenda-fn',
      'x-smagenda-fn': FN_VERSION,
    },
  })
}

function cleanUrl(input: string) {
  const raw = String(input ?? '').trim()
  if (!raw) return ''
  const withProto = (() => {
    if (/^https?:\/\//i.test(raw)) return raw
    if (/^(localhost|127\.0\.0\.1)(:|$)/i.test(raw)) return `http://${raw}`
    return `https://${raw}`
  })()
  return withProto.replace(/\/+$/, '')
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

function normalizePlanoLabel(planoRaw: unknown) {
  const raw = typeof planoRaw === 'string' ? planoRaw.trim() : ''
  if (!raw) return ''
  const p = raw.toLowerCase()
  if (p === 'enterprise') return 'EMPRESA'
  if (p === 'pro' || p === 'team') return 'PRO'
  if (p === 'basic') return 'BASIC'
  if (p === 'free') return 'FREE'
  return raw.toUpperCase()
}

function sanitizePhoneDigits(input: string) {
  return String(input ?? '').replace(/\D/g, '')
}

function buildRecipientCandidates(raw: string) {
  const digits = sanitizePhoneDigits(raw)
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

function isRecipientFormatError(details: unknown) {
  const unwrapped = unwrapNotFoundLast(details)
  const text = extractTextFragments(unwrapped).join(' | ').toLowerCase()
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

  return { ...(last ?? { ok: false, status: 502, body: { error: 'evolution_send_failed' }, baseUrlUsed: opts.apiUrl }), attempts }
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

function interpolateTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`)
}

function computeDaysLeft(todayIso: string, vencIso: string) {
  const today = new Date(`${todayIso}T00:00:00Z`)
  const venc = new Date(`${vencIso}T00:00:00Z`)
  if (!Number.isFinite(today.getTime()) || !Number.isFinite(venc.getTime())) return null
  const diffMs = venc.getTime() - today.getTime()
  return Math.round(diffMs / (24 * 60 * 60 * 1000))
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

  const urlVariants: Array<{ url: string; urlRedacted: string }> = [{ url: baseUrl, urlRedacted: redactUrl(baseUrl) }]
  for (const key of keyCandidates) {
    const candidates = [appendQuery(baseUrl, 'apikey', key), appendQuery(baseUrl, 'apiKey', key), appendQuery(baseUrl, 'token', key)]
    for (const u of candidates) {
      const redacted = redactUrl(u)
      if (urlVariants.some((v) => v.urlRedacted === redacted)) continue
      urlVariants.push({ url: u, urlRedacted: redacted })
    }
  }

  const headerVariants: Array<Record<string, string>> = keyCandidates.length
    ? keyCandidates.flatMap((key) => [
        { apikey: key, ...contentType },
        { apiKey: key, ...contentType },
        { 'x-api-key': key, ...contentType },
        { Authorization: `Bearer ${key}`, ...contentType },
        { Authorization: key, ...contentType },
      ])
    : [{ ...contentType }]

  const doFetchOnce = async (args: { url: string; urlRedacted: string; headers: Record<string, string> }) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
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
      return { ok: res.ok, status: res.status, body: json }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Falha ao conectar na Evolution API'
      return { ok: false, status: 502, body: { error: 'evolution_fetch_failed', message, url: args.urlRedacted } }
    } finally {
      clearTimeout(timeout)
    }
  }

  const tryAll = async () => {
    let last: Awaited<ReturnType<typeof doFetchOnce>> | null = null
    for (const u of urlVariants) {
      for (const h of headerVariants) {
        last = await doFetchOnce({ url: u.url, urlRedacted: u.urlRedacted, headers: h })
        if (last.status !== 401) return last
      }
    }
    return last ?? doFetchOnce({ url: baseUrl, urlRedacted: redactUrl(baseUrl), headers: headerVariants[0]! })
  }

  const first = await tryAll()
  if (!first.ok && first.status === 502) {
    const second = await tryAll()
    if (second.ok || second.status !== 502) return second
  }
  return first
}

function buildEvolutionBaseUrls(rawBaseUrl: string) {
  const baseUrl = cleanUrl(rawBaseUrl)
  const lower = baseUrl.toLowerCase()
  if (lower.includes('/v1/') || lower.endsWith('/v1') || lower.includes('/v2/') || lower.endsWith('/v2')) {
    return [baseUrl]
  }
  return [baseUrl, `${baseUrl}/v2`, `${baseUrl}/v1`]
}

async function evolutionRequestAuto(opts: { baseUrl: string; apiKey: string; path: string; method: string; body?: unknown }) {
  const candidates = buildEvolutionBaseUrls(opts.baseUrl)
  let last: { ok: boolean; status: number; body: unknown; baseUrlUsed: string } | null = null
  for (const baseUrl of candidates) {
    const res = await evolutionRequest({ ...opts, baseUrl })
    last = { ...res, baseUrlUsed: baseUrl }
    if (res.status === 404) continue
    return last
  }
  return last ?? { ok: false, status: 404, body: null, baseUrlUsed: candidates[0] ?? opts.baseUrl }
}

function toVirtualTimeZoneDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const map: Record<string, string> = {}
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  const iso = `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}Z`
  return new Date(iso)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse(200, { ok: true })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' })

  let bodyJson: unknown = null
  try {
    bodyJson = await req.json()
  } catch {
    bodyJson = null
  }

  const requiredSecret = Deno.env.get('CRON_SECRET') ?? ''
  if (requiredSecret) {
    const provided = req.headers.get('x-cron-secret') ?? ''
    if (provided !== requiredSecret) return jsonResponse(401, { error: 'unauthorized' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse(500, { error: 'missing_env' })

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const isMissingColumnError = (message: string) => message.toLowerCase().includes('does not exist') && message.toLowerCase().includes('column')
  const isMissingTableError = (message: string) => message.includes('schema cache') || message.includes("Could not find the table 'public.")
  const isMissingRelationshipError = (message: string) => message.toLowerCase().includes('could not find a relationship between')

  const { data: saRaw, error: saErr } = await adminClient
    .from('super_admin')
    .select('id,whatsapp_api_url,whatsapp_api_key')
    .not('whatsapp_api_url', 'is', null)
    .not('whatsapp_api_key', 'is', null)
    .limit(1)
    .maybeSingle()

  if (saErr) {
    if (isMissingColumnError(saErr.message) || isMissingTableError(saErr.message)) {
      return jsonResponse(400, { error: 'schema_incomplete', message: saErr.message })
    }
    return jsonResponse(400, { error: 'load_super_admin_failed', message: saErr.message })
  }

  const sa = (saRaw ?? null) as unknown as SuperAdminConfigRow | null
  const globalApiUrl = sa?.whatsapp_api_url ?? null
  const globalApiKey = sa?.whatsapp_api_key ?? null
  if (!globalApiUrl || !globalApiKey) return jsonResponse(200, { ok: true, skipped_all: 'not_configured', results: [] })

  const action = (() => {
    if (!bodyJson || typeof bodyJson !== 'object') return null
    const raw = (bodyJson as Record<string, unknown>).action
    return typeof raw === 'string' ? raw.trim().toLowerCase() : null
  })()

  if (action === 'billing_status_changed') {
    const usuarioId = (() => {
      if (!bodyJson || typeof bodyJson !== 'object') return null
      const raw = (bodyJson as Record<string, unknown>).usuario_id
      if (typeof raw !== 'string') return null
      const v = raw.trim()
      return v ? v : null
    })()
    const status = (() => {
      if (!bodyJson || typeof bodyJson !== 'object') return null
      const raw = (bodyJson as Record<string, unknown>).status_pagamento
      return typeof raw === 'string' ? raw.trim().toLowerCase() : null
    })()

    if (!usuarioId || !status) return jsonResponse(400, { error: 'invalid_payload' })

    const { data: uRaw, error: uErr } = await adminClient
      .from('usuarios')
      .select('id,whatsapp_instance_name,slug,nome_negocio,telefone,whatsapp_habilitado,status_pagamento,data_vencimento,plano,ativo')
      .eq('id', usuarioId)
      .maybeSingle()
    if (uErr) return jsonResponse(400, { error: 'load_user_failed', message: uErr.message })
    if (!uRaw) return jsonResponse(404, { error: 'usuario_not_found' })

    const u = uRaw as unknown as BillingUsuarioRow
    if (u.ativo === false && status !== 'suspenso' && status !== 'cancelado') return jsonResponse(200, { ok: true, skipped: 'usuario_inativo' })
    if (u.whatsapp_habilitado !== true) return jsonResponse(200, { ok: true, skipped: 'whatsapp_disabled' })
    if (!sanitizePhoneDigits(u.telefone ?? '')) return jsonResponse(200, { ok: true, skipped: 'missing_phone' })

    const instanceNameRaw = u.whatsapp_instance_name ?? u.slug ?? ''
    const instanceName = sanitizeInstanceName(instanceNameRaw)

    const venc = (u.data_vencimento ?? '').trim()
    const vencPart = venc ? `\n\nVencimento: ${formatBRDate(venc)}` : ''
    const plano = normalizePlanoLabel(u.plano)
    const planoPart = plano ? `\nPlano: ${plano}` : ''
    const business = (u.nome_negocio ?? '').trim()
    const header = business ? `Olá! Aqui é o SMagenda (${business}).` : 'Olá! Aqui é o SMagenda.'

    const text =
      status === 'inadimplente'
        ? `${header}\n\nIdentificamos falha no pagamento da sua assinatura.${vencPart}${planoPart}\n\nPara regularizar e manter o acesso, finalize o pagamento em: ${cleanUrl(Deno.env.get('SITE_URL') ?? Deno.env.get('APP_URL') ?? '')}/pagamento`
        : status === 'suspenso'
          ? `${header}\n\nSeu acesso está suspenso no momento.${vencPart}${planoPart}\n\nRegularize o pagamento para reativar em: ${cleanUrl(Deno.env.get('SITE_URL') ?? Deno.env.get('APP_URL') ?? '')}/pagamento`
          : status === 'cancelado'
            ? `${header}\n\nSua assinatura foi cancelada.${planoPart}\n\nCaso queira reativar, acesse: ${cleanUrl(Deno.env.get('SITE_URL') ?? Deno.env.get('APP_URL') ?? '')}/pagamento`
            : `${header}\n\nAtualização do pagamento: ${status}.${vencPart}${planoPart}`

    const sendRes = await evolutionSendTextWithFallback({ apiUrl: globalApiUrl, apiKey: globalApiKey, instanceName, phoneRaw: u.telefone ?? '', text })
    if (!sendRes.ok) return jsonResponse(502, { ok: false, error: 'evolution_error', details: sendRes.body, attempts: sendRes.attempts })
    return jsonResponse(200, { ok: true, sent: true, usuario_id: u.id, status_pagamento: status })
  }

  if (action === 'billing_daily') {
    const timeZone = 'America/Sao_Paulo'
    const now = new Date()
    const nowVirtual = toVirtualTimeZoneDate(now, timeZone)
    const todayIso = nowVirtual.toISOString().slice(0, 10)

    const { data: usuarios, error: usuariosErr } = await adminClient
      .from('usuarios')
      .select('id,whatsapp_instance_name,slug,nome_negocio,telefone,whatsapp_habilitado,status_pagamento,data_vencimento,plano,ativo')
      .eq('ativo', true)
      .not('data_vencimento', 'is', null)
      .in('status_pagamento', ['ativo', 'trial', 'inadimplente', 'suspenso'])
      .limit(2000)
    if (usuariosErr) return jsonResponse(400, { error: 'load_users_failed', message: usuariosErr.message })

    const updated: Array<{ usuario_id: string; next_status: string; next_ativo: boolean | null }> = []
    const sent: Array<{ usuario_id: string; kind: string; days_left: number }> = []
    const skipped: Array<{ usuario_id: string; reason: string }> = []

    for (const row of usuarios ?? []) {
      const u = row as unknown as BillingUsuarioRow
      const venc = (u.data_vencimento ?? '').trim()
      if (!venc) {
        skipped.push({ usuario_id: u.id, reason: 'missing_vencimento' })
        continue
      }

      const daysLeft = computeDaysLeft(todayIso, venc)
      if (daysLeft === null) {
        skipped.push({ usuario_id: u.id, reason: 'invalid_vencimento' })
        continue
      }

      const currentStatus = String(u.status_pagamento ?? '').trim().toLowerCase()
      const baseUrl = cleanUrl(Deno.env.get('SITE_URL') ?? Deno.env.get('APP_URL') ?? '')
      const pagamentoUrl = baseUrl ? `${baseUrl}/pagamento` : '/pagamento'

      const stage = (() => {
        if (daysLeft === 3 || daysLeft === 1 || daysLeft === 0) return { kind: currentStatus === 'trial' ? 'trial' : 'vencendo' }
        if (daysLeft === -3) return { kind: 'atraso_3' }
        if (daysLeft === -7) return { kind: 'atraso_7' }
        if (daysLeft === -14) return { kind: 'suspensao_14' }
        if (daysLeft === -30) return { kind: 'cancelamento_30' }
        return null
      })()

      const shouldUpdateTrialExpired = currentStatus === 'trial' && daysLeft < 0
      if (shouldUpdateTrialExpired) {
        const { error: updErr } = await adminClient
          .from('usuarios')
          .update({ status_pagamento: 'inadimplente' })
          .eq('id', u.id)
          .eq('status_pagamento', 'trial')
        if (!updErr) updated.push({ usuario_id: u.id, next_status: 'inadimplente', next_ativo: null })
      }

      if (stage?.kind === 'atraso_3' && currentStatus === 'ativo') {
        const { error: updErr } = await adminClient
          .from('usuarios')
          .update({ status_pagamento: 'inadimplente' })
          .eq('id', u.id)
          .eq('status_pagamento', 'ativo')
        if (!updErr) updated.push({ usuario_id: u.id, next_status: 'inadimplente', next_ativo: null })
      }

      if (stage?.kind === 'suspensao_14') {
        const { error: updErr } = await adminClient
          .from('usuarios')
          .update({ status_pagamento: 'suspenso', ativo: false })
          .eq('id', u.id)
          .neq('status_pagamento', 'cancelado')
        if (!updErr) updated.push({ usuario_id: u.id, next_status: 'suspenso', next_ativo: false })

        await adminClient.from('funcionarios').update({ ativo: false }).eq('usuario_master_id', u.id)
      }

      if (stage?.kind === 'cancelamento_30') {
        const { error: updErr } = await adminClient
          .from('usuarios')
          .update({ status_pagamento: 'cancelado', ativo: false })
          .eq('id', u.id)
        if (!updErr) updated.push({ usuario_id: u.id, next_status: 'cancelado', next_ativo: false })

        await adminClient.from('funcionarios').update({ ativo: false }).eq('usuario_master_id', u.id)
      }

      if (!stage) {
        skipped.push({ usuario_id: u.id, reason: 'not_due_window' })
        continue
      }

      if (u.whatsapp_habilitado !== true) {
        skipped.push({ usuario_id: u.id, reason: 'whatsapp_disabled' })
        continue
      }

      const phone = u.telefone ?? ''
      if (!sanitizePhoneDigits(phone)) {
        skipped.push({ usuario_id: u.id, reason: 'invalid_phone' })
        continue
      }

      const instanceNameRaw = u.whatsapp_instance_name ?? u.slug ?? ''
      const instanceName = sanitizeInstanceName(instanceNameRaw)
      const plano = normalizePlanoLabel(u.plano)
      const planoPart = plano ? `\nPlano: ${plano}` : ''
      const business = (u.nome_negocio ?? '').trim()
      const header = business ? `Olá! Aqui é o SMagenda (${business}).` : 'Olá! Aqui é o SMagenda.'
      const vencPart = venc ? `\nVencimento: ${formatBRDate(venc)}` : ''

      const text = (() => {
        if (stage.kind === 'trial') {
          const when = daysLeft === 0 ? 'hoje' : daysLeft === 1 ? 'amanhã' : 'em 3 dias'
          return `${header}\n\nSeu período de teste termina ${when}.${vencPart}${planoPart}\n\nPara manter o acesso, escolha um plano em: ${pagamentoUrl}`
        }
        if (stage.kind === 'vencendo') {
          const when = daysLeft === 0 ? 'hoje' : daysLeft === 1 ? 'amanhã' : 'em 3 dias'
          return `${header}\n\nSeu pagamento vence ${when}.${vencPart}${planoPart}\n\nPara evitar interrupções, confira em: ${pagamentoUrl}`
        }
        if (stage.kind === 'atraso_3') {
          return `${header}\n\nSeu pagamento está em atraso há 3 dias.${vencPart}${planoPart}\n\nPara regularizar e manter o acesso, acesse: ${pagamentoUrl}`
        }
        if (stage.kind === 'atraso_7') {
          return `${header}\n\nSeu pagamento está em atraso há 7 dias.${vencPart}${planoPart}\n\nPara evitar suspensão, acesse: ${pagamentoUrl}`
        }
        if (stage.kind === 'suspensao_14') {
          return `${header}\n\nSeu acesso foi suspenso por pagamento em atraso.${vencPart}${planoPart}\n\nRegularize para reativar: ${pagamentoUrl}`
        }
        return `${header}\n\nSua assinatura foi cancelada por pagamento em atraso.${planoPart}\n\nCaso queira reativar, acesse: ${pagamentoUrl}`
      })()

      const sendRes = await evolutionSendTextWithFallback({ apiUrl: globalApiUrl, apiKey: globalApiKey, instanceName, phoneRaw: phone, text })
      if (!sendRes.ok) {
        skipped.push({ usuario_id: u.id, reason: 'evolution_error' })
        continue
      }

      sent.push({ usuario_id: u.id, kind: stage.kind, days_left: daysLeft })
    }

    return jsonResponse(200, { ok: true, action: 'billing_daily', today: todayIso, updated, sent, skipped })
  }

  const agendamentoId = (() => {
    if (!bodyJson || typeof bodyJson !== 'object') return null
    const raw = (bodyJson as Record<string, unknown>).agendamento_id
    if (typeof raw !== 'string') return null
    const id = raw.trim()
    return id ? id : null
  })()

  if (agendamentoId) {
    let canUpdateConfirmacao = true
    const agSelFull =
      'id,usuario_id,cliente_nome,cliente_telefone,data,hora_inicio,status,confirmacao_enviada,servico:servicos(nome,preco),funcionario:funcionarios(nome_completo,telefone),unidade:unidades(nome,endereco,telefone)'
    const agSelFullNoFlag =
      'id,usuario_id,cliente_nome,cliente_telefone,data,hora_inicio,status,servico:servicos(nome,preco),funcionario:funcionarios(nome_completo,telefone),unidade:unidades(nome,endereco,telefone)'
    const agSelBase = 'id,usuario_id,cliente_nome,cliente_telefone,data,hora_inicio,status,confirmacao_enviada,servico:servicos(nome,preco)'
    const agSelBaseNoFlag = 'id,usuario_id,cliente_nome,cliente_telefone,data,hora_inicio,status,servico:servicos(nome,preco)'

    const first = await adminClient.from('agendamentos').select(agSelFull).eq('id', agendamentoId).maybeSingle()
    const agData = await (async () => {
      if (!first.error) return first

      const msg = first.error.message
      const missingFlag = isMissingColumnError(msg)
      const missingJoin = isMissingTableError(msg) || isMissingRelationshipError(msg)

      if (missingFlag) {
        canUpdateConfirmacao = false
        const second = await adminClient.from('agendamentos').select(agSelFullNoFlag).eq('id', agendamentoId).maybeSingle()
        if (!second.error) return second
        if (isMissingTableError(second.error.message) || isMissingRelationshipError(second.error.message) || isMissingColumnError(second.error.message)) {
          return await adminClient.from('agendamentos').select(agSelBaseNoFlag).eq('id', agendamentoId).maybeSingle()
        }
        return second
      }

      if (missingJoin || isMissingColumnError(msg)) {
        const second = await adminClient.from('agendamentos').select(agSelBase).eq('id', agendamentoId).maybeSingle()
        if (!second.error) return second
        if (isMissingColumnError(second.error.message)) {
          canUpdateConfirmacao = false
          return await adminClient.from('agendamentos').select(agSelBaseNoFlag).eq('id', agendamentoId).maybeSingle()
        }
        return second
      }

      return first
    })()

    if (agData.error) {
      return jsonResponse(400, { error: 'load_agendamento_failed', message: agData.error.message })
    }
    if (!agData.data) return jsonResponse(404, { error: 'agendamento_not_found' })

    const agRow = agData.data as unknown as AgendamentoRow
    if (agRow.status !== 'confirmado') return jsonResponse(200, { ok: true, skipped: 'not_confirmed' })
    if (agRow.confirmacao_enviada === true) return jsonResponse(200, { ok: true, skipped: 'already_sent' })

    const userSel = 'id,whatsapp_instance_name,slug,enviar_confirmacao,mensagem_confirmacao,nome_negocio,telefone,endereco'
    const userRes = await adminClient.from('usuarios').select(userSel).eq('id', agRow.usuario_id).maybeSingle()
    if (userRes.error) {
      if (isMissingColumnError(userRes.error.message) || isMissingTableError(userRes.error.message)) {
        return jsonResponse(400, { error: 'schema_incomplete', message: userRes.error.message })
      }
      return jsonResponse(400, { error: 'load_user_failed', message: userRes.error.message })
    }
    if (!userRes.data) return jsonResponse(404, { error: 'usuario_not_found' })

    const uRow = userRes.data as unknown as UsuarioPartialRow
    if (uRow.enviar_confirmacao === false) return jsonResponse(200, { ok: true, skipped: 'disabled' })

    const instanceNameRaw = uRow.whatsapp_instance_name ?? uRow.slug ?? ''
    const instanceName = sanitizeInstanceName(instanceNameRaw)

    const tmpl = (uRow.mensagem_confirmacao ?? '').trim() ? (uRow.mensagem_confirmacao ?? '') : defaultConfirmacao

    const unidadeEndereco = (agRow.unidade?.endereco ?? '').trim()
    const endereco = unidadeEndereco || (uRow.endereco ?? '')
    const telefoneProfissional = (agRow.funcionario?.telefone ?? '').trim() || (uRow.telefone ?? '')

    const vars = {
      nome: agRow.cliente_nome ?? '',
      data: formatBRDate(agRow.data),
      hora: agRow.hora_inicio ?? '',
      servico: agRow.servico?.nome ?? '',
      preco: agRow.servico?.preco != null ? formatBRL(Number(agRow.servico.preco)) : '',
      endereco,
      nome_negocio: uRow.nome_negocio ?? '',
      telefone_profissional: telefoneProfissional,
      profissional_nome: agRow.funcionario?.nome_completo ?? '',
      unidade_nome: agRow.unidade?.nome ?? '',
      unidade_endereco: unidadeEndereco,
      unidade_telefone: agRow.unidade?.telefone ?? '',
    }
    const text = interpolateTemplate(tmpl, vars).trim()
    const phoneRaw = agRow.cliente_telefone ?? ''
    if (!text || !sanitizePhoneDigits(phoneRaw)) return jsonResponse(200, { ok: true, skipped: 'missing_message_data' })

    const sendRes = await evolutionSendTextWithFallback({
      apiUrl: globalApiUrl,
      apiKey: globalApiKey,
      instanceName,
      phoneRaw,
      text,
    })

    if (!sendRes.ok) return jsonResponse(502, { ok: false, error: 'evolution_error', details: sendRes.body, attempts: sendRes.attempts })

    if (canUpdateConfirmacao) {
      const { error: updErr } = await adminClient
        .from('agendamentos')
        .update({ confirmacao_enviada: true, confirmacao_enviada_em: new Date().toISOString() })
        .eq('id', agRow.id)
        .eq('usuario_id', uRow.id)
        .eq('confirmacao_enviada', false)

      if (updErr) {
        return jsonResponse(502, { ok: false, error: 'save_confirmacao_flag_failed', message: updErr.message })
      }
    }

    return jsonResponse(200, { ok: true, sent: true, usuario_id: uRow.id, agendamento_id: agRow.id })
  }

  const { data: users, error: usersErr } = await adminClient
    .from('usuarios')
    .select('id,whatsapp_instance_name,slug,enviar_confirmacao,enviar_lembrete,lembrete_horas_antes,mensagem_confirmacao,mensagem_lembrete,nome_negocio,telefone,endereco')
    .or('enviar_lembrete.eq.true,enviar_confirmacao.eq.true')
    .limit(500)

  if (usersErr) {
    if (isMissingColumnError(usersErr.message)) return jsonResponse(400, { error: 'schema_incomplete', message: usersErr.message })
    return jsonResponse(400, { error: 'load_users_failed', message: usersErr.message })
  }

  const timeZone = 'America/Sao_Paulo'
  const now = new Date()
  const nowVirtual = toVirtualTimeZoneDate(now, timeZone)
  const results: Array<{
    usuario_id: string
    confirm_sent: number
    confirm_skipped: number
    confirm_failed: number
    reminder_sent: number
    reminder_skipped: number
    reminder_failed: number
  }> = []

  for (const u of users ?? []) {
    const uRow = u as unknown as UsuarioRow

    const instanceNameRaw = uRow.whatsapp_instance_name ?? uRow.slug ?? ''
    const instanceName = sanitizeInstanceName(instanceNameRaw)
    let confirmSent = 0
    let confirmSkipped = 0
    let confirmFailed = 0

    let reminderSent = 0
    let reminderSkipped = 0
    let reminderFailed = 0

    const shouldConfirm = uRow.enviar_confirmacao !== false
    if (shouldConfirm) {
      const confirmStart = new Date(nowVirtual)
      confirmStart.setDate(confirmStart.getDate() - 7)
      const confirmEnd = new Date(nowVirtual)
      confirmEnd.setDate(confirmEnd.getDate() + 90)

      const confirmStartDate = confirmStart.toISOString().slice(0, 10)
      const confirmEndDate = confirmEnd.toISOString().slice(0, 10)

      const confirmSelFull =
        'id,usuario_id,cliente_nome,cliente_telefone,data,hora_inicio,status,confirmacao_enviada,servico:servicos(nome,preco),funcionario:funcionarios(nome_completo,telefone),unidade:unidades(nome,endereco,telefone)'
      const confirmSelBase = 'id,usuario_id,cliente_nome,cliente_telefone,data,hora_inicio,status,confirmacao_enviada,servico:servicos(nome,preco)'

      const confirmFirst = await adminClient
        .from('agendamentos')
        .select(confirmSelFull)
        .eq('usuario_id', uRow.id)
        .eq('status', 'confirmado')
        .eq('confirmacao_enviada', false)
        .gte('data', confirmStartDate)
        .lte('data', confirmEndDate)
        .limit(200)

      const confirmSecond =
        confirmFirst.error &&
        (isMissingTableError(confirmFirst.error.message) || isMissingRelationshipError(confirmFirst.error.message) || isMissingColumnError(confirmFirst.error.message))
          ? await adminClient
              .from('agendamentos')
              .select(confirmSelBase)
              .eq('usuario_id', uRow.id)
              .eq('status', 'confirmado')
              .eq('confirmacao_enviada', false)
              .gte('data', confirmStartDate)
              .lte('data', confirmEndDate)
              .limit(200)
          : null

      const confirmAgs = (confirmSecond ? confirmSecond.data : confirmFirst.data) as unknown as AgendamentoRow[] | null
      const confirmErr = confirmSecond ? confirmSecond.error : confirmFirst.error

      if (confirmErr) {
        confirmFailed++
      } else {
        for (const ag of confirmAgs ?? []) {
          const agRow = ag as unknown as AgendamentoRow
          if (agRow.confirmacao_enviada === true) {
            confirmSkipped++
            continue
          }

          const tmpl = (uRow.mensagem_confirmacao ?? '').trim() ? (uRow.mensagem_confirmacao ?? '') : defaultConfirmacao

          const unidadeEndereco = (agRow.unidade?.endereco ?? '').trim()
          const endereco = unidadeEndereco || (uRow.endereco ?? '')
          const telefoneProfissional = (agRow.funcionario?.telefone ?? '').trim() || (uRow.telefone ?? '')

          const vars = {
            nome: agRow.cliente_nome ?? '',
            data: formatBRDate(agRow.data),
            hora: agRow.hora_inicio ?? '',
            servico: agRow.servico?.nome ?? '',
            preco: agRow.servico?.preco != null ? formatBRL(Number(agRow.servico.preco)) : '',
            endereco,
            nome_negocio: uRow.nome_negocio ?? '',
            telefone_profissional: telefoneProfissional,
            profissional_nome: agRow.funcionario?.nome_completo ?? '',
            unidade_nome: agRow.unidade?.nome ?? '',
            unidade_endereco: unidadeEndereco,
            unidade_telefone: agRow.unidade?.telefone ?? '',
          }
          const text = interpolateTemplate(tmpl, vars).trim()
          const phoneRaw = agRow.cliente_telefone ?? ''
          if (!text || !sanitizePhoneDigits(phoneRaw)) {
            confirmSkipped++
            continue
          }

          const sendRes = await evolutionSendTextWithFallback({
            apiUrl: globalApiUrl,
            apiKey: globalApiKey,
            instanceName,
            phoneRaw,
            text,
          })

          if (!sendRes.ok) {
            confirmFailed++
            continue
          }

          const { error: updErr } = await adminClient
            .from('agendamentos')
            .update({ confirmacao_enviada: true, confirmacao_enviada_em: new Date().toISOString() })
            .eq('id', agRow.id)
            .eq('usuario_id', uRow.id)
            .eq('confirmacao_enviada', false)

          if (updErr) {
            confirmFailed++
            continue
          }

          confirmSent++
        }
      }
    }

    if (uRow.enviar_lembrete === true) {
      const hours = Number(uRow.lembrete_horas_antes ?? 24)
      const hoursSafe = Number.isFinite(hours) && hours >= 1 && hours <= 168 ? hours : 24

      const targetStart = new Date(nowVirtual.getTime() + hoursSafe * 60 * 60 * 1000)
      const targetEnd = new Date(targetStart.getTime() + 60 * 60 * 1000)

      const startDate = targetStart.toISOString().slice(0, 10)
      const endDate = targetEnd.toISOString().slice(0, 10)

      const reminderSelFull =
        'id,usuario_id,cliente_nome,cliente_telefone,data,hora_inicio,status,lembrete_enviado,servico:servicos(nome,preco),funcionario:funcionarios(nome_completo,telefone),unidade:unidades(nome,endereco,telefone)'
      const reminderSelBase = 'id,usuario_id,cliente_nome,cliente_telefone,data,hora_inicio,status,lembrete_enviado,servico:servicos(nome,preco)'

      const reminderFirst = await adminClient
        .from('agendamentos')
        .select(reminderSelFull)
        .eq('usuario_id', uRow.id)
        .eq('status', 'confirmado')
        .eq('lembrete_enviado', false)
        .gte('data', startDate)
        .lte('data', endDate)
        .limit(200)

      const reminderSecond =
        reminderFirst.error &&
        (isMissingTableError(reminderFirst.error.message) || isMissingRelationshipError(reminderFirst.error.message) || isMissingColumnError(reminderFirst.error.message))
          ? await adminClient
              .from('agendamentos')
              .select(reminderSelBase)
              .eq('usuario_id', uRow.id)
              .eq('status', 'confirmado')
              .eq('lembrete_enviado', false)
              .gte('data', startDate)
              .lte('data', endDate)
              .limit(200)
          : null

      const ags = (reminderSecond ? reminderSecond.data : reminderFirst.data) as unknown as AgendamentoRow[] | null
      const agErr = reminderSecond ? reminderSecond.error : reminderFirst.error

      if (agErr) {
        reminderFailed++
      } else {
        for (const ag of ags ?? []) {
          const agRow = ag as unknown as AgendamentoRow

          if (agRow.lembrete_enviado === true) {
            reminderSkipped++
            continue
          }

          const data = agRow.data
          const horaInicio = agRow.hora_inicio ?? ''
          const startVirtual = data && horaInicio ? new Date(`${data}T${horaInicio}:00Z`) : null
          if (!startVirtual || !(startVirtual >= targetStart && startVirtual < targetEnd)) {
            reminderSkipped++
            continue
          }

          const tmpl = uRow.mensagem_lembrete ?? ''

          const unidadeEndereco = (agRow.unidade?.endereco ?? '').trim()
          const endereco = unidadeEndereco || (uRow.endereco ?? '')
          const telefoneProfissional = (agRow.funcionario?.telefone ?? '').trim() || (uRow.telefone ?? '')

          const vars = {
            nome: agRow.cliente_nome ?? '',
            data: formatBRDate(agRow.data),
            hora: agRow.hora_inicio ?? '',
            servico: agRow.servico?.nome ?? '',
            preco: agRow.servico?.preco != null ? formatBRL(Number(agRow.servico.preco)) : '',
            endereco,
            nome_negocio: uRow.nome_negocio ?? '',
            telefone_profissional: telefoneProfissional,
            profissional_nome: agRow.funcionario?.nome_completo ?? '',
            unidade_nome: agRow.unidade?.nome ?? '',
            unidade_endereco: unidadeEndereco,
            unidade_telefone: agRow.unidade?.telefone ?? '',
          }
          const text = interpolateTemplate(tmpl, vars).trim()
          const phoneRaw = agRow.cliente_telefone ?? ''
          if (!text || !sanitizePhoneDigits(phoneRaw)) {
            reminderSkipped++
            continue
          }

          const sendRes = await evolutionSendTextWithFallback({
            apiUrl: globalApiUrl,
            apiKey: globalApiKey,
            instanceName,
            phoneRaw,
            text,
          })

          if (!sendRes.ok) {
            reminderFailed++
            continue
          }

          const { error: updErr } = await adminClient
            .from('agendamentos')
            .update({ lembrete_enviado: true, lembrete_enviado_em: new Date().toISOString() })
            .eq('id', agRow.id)
            .eq('usuario_id', uRow.id)
            .eq('lembrete_enviado', false)

          if (updErr) {
            reminderFailed++
            continue
          }

          reminderSent++
        }
      }
    }

    results.push({
      usuario_id: uRow.id,
      confirm_sent: confirmSent,
      confirm_skipped: confirmSkipped,
      confirm_failed: confirmFailed,
      reminder_sent: reminderSent,
      reminder_skipped: reminderSkipped,
      reminder_failed: reminderFailed,
    })
  }

  return jsonResponse(200, { ok: true, results })
})
