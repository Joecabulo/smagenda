import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0'

type UsuarioRow = {
  id: string
  whatsapp_instance_name: string | null
  slug: string | null
  lembrete_horas_antes: number | null
  mensagem_lembrete: string | null
  nome_negocio: string | null
  telefone: string | null
}

type SuperAdminConfigRow = {
  id: string
  whatsapp_api_url: string | null
  whatsapp_api_key: string | null
}

type ServicoRow = { nome: string | null; preco: number | null }

type AgendamentoRow = {
  id: string
  usuario_id: string
  cliente_nome: string | null
  cliente_telefone: string | null
  data: string
  hora_inicio: string | null
  status: string
  lembrete_enviado: boolean | null
  servico: ServicoRow | null
}

const FN_VERSION = 'whatsapp-lembretes@2025-12-26'

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

function sanitizePhone(input: string) {
  const digits = String(input ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55')) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
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

  const { data: users, error: usersErr } = await adminClient
    .from('usuarios')
    .select('id,whatsapp_instance_name,slug,enviar_lembrete,lembrete_horas_antes,mensagem_lembrete,nome_negocio,telefone')
    .eq('enviar_lembrete', true)
    .limit(500)

  if (usersErr) {
    if (isMissingColumnError(usersErr.message)) return jsonResponse(400, { error: 'schema_incomplete', message: usersErr.message })
    return jsonResponse(400, { error: 'load_users_failed', message: usersErr.message })
  }

  const timeZone = 'America/Sao_Paulo'
  const now = new Date()
  const nowVirtual = toVirtualTimeZoneDate(now, timeZone)
  const results: Array<{ usuario_id: string; sent: number; skipped: number; failed: number }> = []

  for (const u of users ?? []) {
    const uRow = u as unknown as UsuarioRow

    const instanceNameRaw = uRow.whatsapp_instance_name ?? uRow.slug ?? ''
    const instanceName = sanitizeInstanceName(instanceNameRaw)
    const hours = Number(uRow.lembrete_horas_antes ?? 24)
    const hoursSafe = Number.isFinite(hours) && hours >= 1 && hours <= 168 ? hours : 24

    const targetStart = new Date(nowVirtual.getTime() + hoursSafe * 60 * 60 * 1000)
    const targetEnd = new Date(targetStart.getTime() + 60 * 60 * 1000)

    const startDate = targetStart.toISOString().slice(0, 10)
    const endDate = targetEnd.toISOString().slice(0, 10)

    const { data: ags, error: agErr } = await adminClient
      .from('agendamentos')
      .select('id,usuario_id,cliente_nome,cliente_telefone,data,hora_inicio,status,lembrete_enviado,servico:servicos(nome,preco)')
      .eq('usuario_id', uRow.id)
      .eq('status', 'confirmado')
      .eq('lembrete_enviado', false)
      .gte('data', startDate)
      .lte('data', endDate)
      .limit(200)

    if (agErr) {
      results.push({ usuario_id: uRow.id, sent: 0, skipped: 0, failed: 0 })
      continue
    }

    let sent = 0
    let skipped = 0
    let failed = 0

    for (const ag of ags ?? []) {
      const agRow = ag as unknown as AgendamentoRow

      if (agRow.lembrete_enviado === true) {
        skipped++
        continue
      }

      const data = agRow.data
      const horaInicio = agRow.hora_inicio ?? ''
      const startVirtual = data && horaInicio ? new Date(`${data}T${horaInicio}:00Z`) : null
      if (!startVirtual || !(startVirtual >= targetStart && startVirtual < targetEnd)) {
        skipped++
        continue
      }

      const tmpl = uRow.mensagem_lembrete ?? ''
      const vars = {
        nome: agRow.cliente_nome ?? '',
        data: formatBRDate(agRow.data),
        hora: agRow.hora_inicio ?? '',
        servico: agRow.servico?.nome ?? '',
        preco: agRow.servico?.preco != null ? formatBRL(Number(agRow.servico.preco)) : '',
        nome_negocio: uRow.nome_negocio ?? '',
        telefone_profissional: uRow.telefone ?? '',
      }
      const text = interpolateTemplate(tmpl, vars).trim()
      const number = sanitizePhone(agRow.cliente_telefone ?? '')
      if (!text || !number) {
        skipped++
        continue
      }

      const sendRes = await evolutionRequestAuto({
        baseUrl: globalApiUrl,
        apiKey: globalApiKey,
        path: `/message/sendText/${instanceName}`,
        method: 'POST',
        body: { number, text },
      })

      if (!sendRes.ok) {
        failed++
        continue
      }

      const { error: updErr } = await adminClient
        .from('agendamentos')
        .update({ lembrete_enviado: true, lembrete_enviado_em: new Date().toISOString() })
        .eq('id', agRow.id)
        .eq('usuario_id', uRow.id)
        .eq('lembrete_enviado', false)

      if (updErr) {
        if (isMissingColumnError(updErr.message)) {
          failed++
          continue
        }
        failed++
        continue
      }

      sent++
    }

    results.push({ usuario_id: uRow.id, sent, skipped, failed })
  }

  return jsonResponse(200, { ok: true, results })
})
