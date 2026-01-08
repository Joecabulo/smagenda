import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0'

type ResendDomainRecord = {
  record?: string
  name?: string
  type?: string
  ttl?: string
  status?: string
  value?: string
  priority?: number
}

type ResendDomain = {
  object?: string
  id?: string
  name?: string
  status?: string
  created_at?: string
  region?: string
  capabilities?: { sending?: string; receiving?: string } | null
  records?: ResendDomainRecord[]
}

type Payload = {
  domain?: string
  domain_id?: string
  action?: 'status' | 'verify' | 'send_test'
  from?: string
  to?: string
  subject?: string
  text?: string
  html?: string
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  })
}

async function dohQuery(name: string, type: string) {
  const url = new URL('https://cloudflare-dns.com/dns-query')
  url.searchParams.set('name', name)
  url.searchParams.set('type', type)
  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/dns-json',
    },
  })
  const json = (await res.json().catch(() => null)) as
    | {
        Status?: number
        Answer?: Array<{ name?: string; type?: number; TTL?: number; data?: string }>
      }
    | null
  return { ok: res.ok, status: res.status, json }
}

function normalizeFqdn(name: string, domain: string) {
  const n = (name ?? '').trim()
  const d = (domain ?? '').trim().toLowerCase()
  if (!n || n === '@') return d
  const nn = n.endsWith('.') ? n.slice(0, -1) : n
  const lower = nn.toLowerCase()
  if (lower === d || lower.endsWith(`.${d}`)) return lower
  return `${lower}.${d}`
}

function stripOuterQuotes(v: string) {
  const s = v.trim()
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) return s.slice(1, -1)
  return s
}

function normalizeSpf(value: string) {
  return stripOuterQuotes(value)
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeDkim(value: string) {
  return stripOuterQuotes(value)
    .trim()
    .replace(/\s+/g, '')
}

function parseMxAnswerData(data: string) {
  const trimmed = data.trim()
  const parts = trimmed.split(/\s+/g)
  const prioRaw = parts[0] ?? ''
  const hostRaw = parts.slice(1).join(' ')
  const prio = Number(prioRaw)
  const host = hostRaw.endsWith('.') ? hostRaw.slice(0, -1) : hostRaw
  return { prio: Number.isFinite(prio) ? prio : null, host: host.toLowerCase() }
}

async function resendRequest(path: string, method: string, apiKey: string, body?: unknown) {
  const res = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json().catch(() => null)) as unknown
  return { ok: res.ok, status: res.status, json }
}

function splitEmailList(raw: string) {
  const cleaned = raw
    .split(/[;,\n]/g)
    .map((s) => s.trim())
    .filter(Boolean)
  return cleaned
}

function extractEmailAddress(raw: string) {
  const s = raw.trim()
  const m = s.match(/<([^>]+)>/)
  return (m?.[1] ?? s).trim()
}

function isLikelyEmail(s: string) {
  const v = s.trim()
  if (!v.includes('@')) return false
  const [local, domain] = v.split('@')
  if (!local || !domain) return false
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse(200, { ok: true })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''

  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse(500, { error: 'missing_env' })
  if (!resendApiKey) return jsonResponse(500, { error: 'missing_resend_api_key' })

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: req.headers.get('Authorization') ?? '',
      },
    },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return jsonResponse(401, { error: 'unauthorized' })

  const uid = userData.user.id
  const { data: saRow, error: saErr } = await adminClient.from('super_admin').select('id').eq('id', uid).maybeSingle()
  if (saErr) {
    const lower = saErr.message.toLowerCase()
    const missingTable = lower.includes('could not find the table') || lower.includes('schema cache')
    if (missingTable) {
      return jsonResponse(400, {
        error: 'schema_incomplete',
        message: 'Tabela public.super_admin não existe. Execute o SQL de políticas (Super Admin) em /admin/configuracoes.',
      })
    }
    return jsonResponse(403, { error: 'not_allowed', message: saErr.message })
  }
  if (!saRow) return jsonResponse(403, { error: 'not_allowed' })

  let payload: Payload
  try {
    payload = (await req.json()) as Payload
  } catch {
    return jsonResponse(400, { error: 'invalid_json' })
  }

  const action = payload.action ?? 'status'
  const domainName = (payload.domain ?? '').trim().toLowerCase()
  const domainIdInput = (payload.domain_id ?? '').trim()
  if (!domainName && !domainIdInput) return jsonResponse(400, { error: 'missing_domain' })

  const listRes = await resendRequest('/domains', 'GET', resendApiKey)
  if (!listRes.ok) return jsonResponse(502, { error: 'resend_list_failed', details: listRes.json })

  const listJson = listRes.json as { data?: ResendDomain[] } | ResendDomain[] | null
  const domains = Array.isArray(listJson) ? listJson : Array.isArray(listJson?.data) ? listJson.data : []

  const selected = domainIdInput
    ? domains.find((d) => d.id === domainIdInput) ?? null
    : domains.find((d) => (d.name ?? '').toLowerCase() === domainName) ?? null

  if (!selected?.id) {
    return jsonResponse(404, {
      error: 'domain_not_found',
      domains: domains.map((d) => ({ id: d.id ?? null, name: d.name ?? null, status: d.status ?? null })),
    })
  }

  if (action === 'send_test') {
    const fromRaw = (payload.from ?? '').trim()
    const toRaw = (payload.to ?? '').trim()
    const subject = (payload.subject ?? '').trim() || 'Teste de email (Resend) — SMagenda'
    const text = (payload.text ?? '').trim() || `Teste de envio via Resend em ${new Date().toISOString()}`
    const html = (payload.html ?? '').trim() || `<p>${text}</p>`

    if (!fromRaw || !toRaw) return jsonResponse(400, { error: 'missing_email_fields' })

    const fromEmail = extractEmailAddress(fromRaw)
    if (!isLikelyEmail(fromEmail)) return jsonResponse(400, { error: 'invalid_from' })

    const toList = splitEmailList(toRaw)
    if (toList.length === 0 || toList.some((t) => !isLikelyEmail(extractEmailAddress(t)))) {
      return jsonResponse(400, { error: 'invalid_to' })
    }

    const selectedDomain = (selected.name ?? '').trim().toLowerCase()
    const fromDomain = fromEmail.split('@')[1]?.trim().toLowerCase() ?? ''
    if (selectedDomain && fromDomain && fromDomain !== selectedDomain && !fromDomain.endsWith(`.${selectedDomain}`)) {
      return jsonResponse(400, { error: 'from_domain_mismatch', message: `O domínio do remetente deve ser ${selectedDomain}.` })
    }

    const emailRes = await resendRequest('/emails', 'POST', resendApiKey, {
      from: fromRaw,
      to: toList,
      subject,
      text,
      html,
    })
    if (!emailRes.ok) return jsonResponse(502, { error: 'resend_send_failed', details: emailRes.json })
    return jsonResponse(200, { ok: true, email: emailRes.json })
  }

  if (action === 'verify') {
    const verifyRes = await resendRequest(`/domains/${selected.id}/verify`, 'POST', resendApiKey)
    if (!verifyRes.ok) return jsonResponse(502, { error: 'resend_verify_failed', details: verifyRes.json })
  }

  const getRes = await resendRequest(`/domains/${selected.id}`, 'GET', resendApiKey)
  if (!getRes.ok) return jsonResponse(502, { error: 'resend_get_failed', details: getRes.json })

  const domain = (getRes.json ?? null) as ResendDomain | null
  const records = Array.isArray(domain?.records) ? domain?.records : []

  const nsRes = await dohQuery(domainName || (domain?.name ?? ''), 'NS').catch(() => ({ ok: false, status: 0, json: null }))
  const nameservers = Array.isArray(nsRes.json?.Answer)
    ? nsRes.json?.Answer.map((a) => (a.data ?? '').trim()).filter(Boolean)
    : []

  const dnsChecks = await Promise.all(
    records.map(async (r) => {
      const name = (r.name ?? '').trim()
      const type = (r.type ?? '').trim().toUpperCase()
      const expectedValue = typeof r.value === 'string' ? r.value : ''
      const expectedPriority = typeof r.priority === 'number' ? r.priority : null
      const fqdn = normalizeFqdn(name, domainName || (domain?.name ?? ''))

      if (!fqdn || (type !== 'TXT' && type !== 'MX')) {
        return {
          record: r.record ?? null,
          name,
          type,
          fqdn: fqdn || null,
          expected: { value: expectedValue || null, priority: expectedPriority },
          dns: { found: false, match: false, values: [] as string[] },
        }
      }

      const query = await dohQuery(fqdn, type).catch(() => ({ ok: false, status: 0, json: null }))
      const answers = Array.isArray(query.json?.Answer) ? query.json?.Answer : []
      const values = answers.map((a) => (a.data ?? '').trim()).filter(Boolean)

      let match = false
      let hint: string | null = null

      if (type === 'TXT') {
        const expectedNorm = expectedValue.toLowerCase().includes('v=spf1') ? normalizeSpf(expectedValue) : normalizeDkim(expectedValue)
        const gotNorms = values.map((v) => {
          const raw = stripOuterQuotes(v)
          const asJoined = raw.replace(/"\s+"/g, '')
          return expectedValue.toLowerCase().includes('v=spf1') ? normalizeSpf(asJoined) : normalizeDkim(asJoined)
        })
        match = gotNorms.some((g) => g === expectedNorm)
        if (!match && values.length > 0 && type === 'TXT' && expectedValue.toLowerCase().includes('v=spf1')) {
          const got = gotNorms[0] ?? ''
          if (got.includes('v=spf1') && got.includes('include:amazonses.com') && !got.endsWith('~all') && !got.endsWith('-all')) {
            hint = 'Seu SPF parece estar incompleto. Ele precisa terminar com ~all (ou -all) como no Resend.'
          }
        }
      }

      if (type === 'MX') {
        const expectedHost = (expectedValue ?? '').trim().toLowerCase().replace(/\.$/, '')
        const expectedPrio = expectedPriority
        const parsed = values.map((v) => parseMxAnswerData(v))
        match = parsed.some((p) => p.host === expectedHost && (expectedPrio === null || p.prio === expectedPrio))
        const maybeAppended = parsed.find((p) => p.host.endsWith(`.${(domainName || (domain?.name ?? '')).toLowerCase()}`))
        if (!match && maybeAppended) {
          hint = 'Seu provedor pode estar anexando o domínio no MX. Tente salvar o valor com ponto final (ex.: feedback-smtp.sa-east-1.amazonses.com.).'
        }
      }

      return {
        record: r.record ?? null,
        name,
        type,
        fqdn,
        expected: { value: expectedValue || null, priority: expectedPriority },
        dns: { found: values.length > 0, match, values },
        hint,
        resendStatus: r.status ?? null,
        ttl: r.ttl ?? null,
      }
    })
  )

  return jsonResponse(200, {
    ok: true,
    domain: {
      id: domain?.id ?? selected.id,
      name: domain?.name ?? selected.name ?? null,
      status: domain?.status ?? selected.status ?? null,
      region: domain?.region ?? null,
      capabilities: domain?.capabilities ?? null,
      records,
    },
    dns: {
      checked_at: new Date().toISOString(),
      nameservers,
      records: dnsChecks,
    },
  })
})
