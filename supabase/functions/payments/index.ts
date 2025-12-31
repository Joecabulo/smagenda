import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0'

type Payload = { action: 'create_checkout'; usuario_id: string; plano: string }

type StripeEvent = {
  id?: string
  type?: string
  data?: { object?: unknown }
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

function normalizeUuid(value: unknown) {
  const s = typeof value === 'string' ? value.trim() : ''
  if (!s) return null
  if (!/^[0-9a-fA-F-]{36}$/.test(s)) return null
  return s
}

function cleanUrl(input: string) {
  const raw = String(input ?? '')
    .trim()
    .replace(/^['"`\s]+|['"`\s]+$/g, '')
  if (!raw) return ''
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return withProto.replace(/\/+$/g, '')
}

function toHex(bytes: ArrayBuffer) {
  const arr = new Uint8Array(bytes)
  let out = ''
  for (let i = 0; i < arr.length; i += 1) out += arr[i].toString(16).padStart(2, '0')
  return out
}

function hexToBytes(hex: string) {
  const normalized = hex.trim().toLowerCase()
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) return null
  const out = new Uint8Array(normalized.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function secureEqualBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

function parseStripeSignatureHeader(header: string) {
  const parts = header
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const kv = new Map<string, string[]>()
  for (const p of parts) {
    const idx = p.indexOf('=')
    if (idx <= 0) continue
    const k = p.slice(0, idx).trim()
    const v = p.slice(idx + 1).trim()
    if (!k || !v) continue
    const prev = kv.get(k) ?? []
    prev.push(v)
    kv.set(k, prev)
  }

  const tRaw = (kv.get('t') ?? [])[0] ?? ''
  const t = Number.parseInt(tRaw, 10)
  const v1 = kv.get('v1') ?? []
  if (!Number.isFinite(t) || t <= 0 || v1.length === 0) return null
  return { t, v1 }
}

async function hmacSha256Hex(secret: string, message: string) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return toHex(sig)
}

async function verifyStripeSignature({ payload, header, secret }: { payload: string; header: string; secret: string }) {
  const parsed = parseStripeSignatureHeader(header)
  if (!parsed) return { ok: false as const, error: 'invalid_signature_header' as const }
  const signedPayload = `${parsed.t}.${payload}`
  const expectedHex = await hmacSha256Hex(secret, signedPayload)
  const expectedBytes = hexToBytes(expectedHex)
  if (!expectedBytes) return { ok: false as const, error: 'invalid_expected_sig' as const }

  for (const v of parsed.v1) {
    const gotBytes = hexToBytes(v)
    if (!gotBytes) continue
    if (secureEqualBytes(expectedBytes, gotBytes)) return { ok: true as const }
  }

  return { ok: false as const, error: 'signature_mismatch' as const }
}

async function stripeApiRequest(path: string, opts: { method: 'GET' | 'POST'; key: string; params?: URLSearchParams }) {
  const url = `https://api.stripe.com/v1${path}`
  const res = await fetch(url, {
    method: opts.method,
    headers: {
      Authorization: `Bearer ${opts.key}`,
      ...(opts.method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: opts.method === 'POST' ? opts.params?.toString() ?? '' : undefined,
  })

  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = text ? (JSON.parse(text) as unknown) : null
  } catch {
    parsed = text
  }
  return { ok: res.ok, status: res.status, body: parsed }
}

function toIsoDateFromUnixSeconds(value: unknown) {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  return new Date(n * 1000).toISOString().slice(0, 10)
}

function mapStripeSubscriptionToPagamentoStatus(statusRaw: unknown) {
  const s = typeof statusRaw === 'string' ? statusRaw.trim().toLowerCase() : ''
  if (s === 'active' || s === 'trialing') return 'ativo'
  if (s === 'past_due' || s === 'unpaid') return 'inadimplente'
  if (s === 'canceled' || s === 'incomplete_expired') return 'cancelado'
  if (s === 'incomplete' || s === 'paused') return 'suspenso'
  return 'suspenso'
}

function resolveLimiteFuncionariosFromPlano(planoRaw: unknown) {
  const plano = typeof planoRaw === 'string' ? planoRaw.trim().toLowerCase() : ''
  if (!plano) return undefined
  if (plano === 'enterprise') return null
  if (plano === 'team') return 5
  if (plano === 'pro') return 3
  if (plano === 'basic') return 1
  if (plano === 'free') return 1
  return undefined
}

async function findUsuarioIdByStripe(adminClient: ReturnType<typeof createClient>, input: { subscriptionId?: string | null; customerId?: string | null }) {
  const subscriptionId = (input.subscriptionId ?? '').trim()
  const customerId = (input.customerId ?? '').trim()

  if (subscriptionId) {
    const { data, error } = await adminClient
      .from('usuarios')
      .select('id')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle()
    if (!error && data?.id) return { ok: true as const, usuarioId: String((data as { id: string }).id) }
  }
  if (customerId) {
    const { data, error } = await adminClient
      .from('usuarios')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    if (!error && data?.id) return { ok: true as const, usuarioId: String((data as { id: string }).id) }
  }

  return { ok: false as const }
}

async function applyUsuarioPaymentUpdate(
  adminClient: ReturnType<typeof createClient>,
  usuarioId: string,
  update: {
    plano?: string | null
    limite_funcionarios?: number | null
    status_pagamento?: string | null
    data_vencimento?: string | null
    free_trial_consumido?: boolean | null
    stripe_customer_id?: string | null
    stripe_subscription_id?: string | null
    stripe_checkout_session_id?: string | null
    stripe_last_event_id?: string | null
    stripe_last_event_at?: string | null
  }
) {
  const payload: Record<string, unknown> = {}
  if (typeof update.plano === 'string' && update.plano.trim()) payload.plano = update.plano.trim().toLowerCase()
  if (typeof update.limite_funcionarios === 'number' && Number.isFinite(update.limite_funcionarios)) payload.limite_funcionarios = update.limite_funcionarios
  if (update.limite_funcionarios === null) payload.limite_funcionarios = null
  if (typeof update.status_pagamento === 'string' && update.status_pagamento.trim()) payload.status_pagamento = update.status_pagamento.trim()
  if (typeof update.data_vencimento === 'string' && update.data_vencimento.trim()) payload.data_vencimento = update.data_vencimento.trim()
  if (update.free_trial_consumido === true) payload.free_trial_consumido = true
  if (update.free_trial_consumido === false) payload.free_trial_consumido = false
  if (typeof update.stripe_customer_id === 'string' && update.stripe_customer_id.trim()) payload.stripe_customer_id = update.stripe_customer_id.trim()
  if (typeof update.stripe_subscription_id === 'string' && update.stripe_subscription_id.trim()) payload.stripe_subscription_id = update.stripe_subscription_id.trim()
  if (typeof update.stripe_checkout_session_id === 'string' && update.stripe_checkout_session_id.trim()) payload.stripe_checkout_session_id = update.stripe_checkout_session_id.trim()
  if (typeof update.stripe_last_event_id === 'string' && update.stripe_last_event_id.trim()) payload.stripe_last_event_id = update.stripe_last_event_id.trim()
  if (typeof update.stripe_last_event_at === 'string' && update.stripe_last_event_at.trim()) payload.stripe_last_event_at = update.stripe_last_event_at.trim()

  if (Object.keys(payload).length === 0) return { ok: true as const }

  const { error } = await adminClient.from('usuarios').update(payload).eq('id', usuarioId)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

async function stripeRequest(params: URLSearchParams, key: string) {
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = text ? (JSON.parse(text) as unknown) : null
  } catch {
    parsed = text
  }
  return { ok: res.ok, status: res.status, body: parsed }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse(200, { ok: true })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const stripeKey = (Deno.env.get('STRIPE_SECRET_KEY') ?? '').trim()
  const stripeWebhookSecret = (Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '').trim()

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, { error: 'missing_env' })
  }
  if (!stripeKey) {
    return jsonResponse(500, { error: 'missing_env', message: 'STRIPE_SECRET_KEY não configurada.' })
  }

  const signatureHeader = req.headers.get('stripe-signature') ?? req.headers.get('Stripe-Signature')
  const isStripeWebhook = Boolean(signatureHeader)

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  if (isStripeWebhook) {
    if (!stripeWebhookSecret) {
      return jsonResponse(500, { error: 'missing_env', message: 'STRIPE_WEBHOOK_SECRET não configurada.' })
    }
    const rawPayload = await req.text()
    const verified = await verifyStripeSignature({ payload: rawPayload, header: String(signatureHeader), secret: stripeWebhookSecret })
    if (!verified.ok) {
      return jsonResponse(400, { error: 'invalid_signature', reason: verified.error })
    }

    let event: StripeEvent
    try {
      event = (rawPayload ? (JSON.parse(rawPayload) as StripeEvent) : ({} as StripeEvent))
    } catch {
      return jsonResponse(400, { error: 'invalid_json' })
    }

    const eventId = typeof event?.id === 'string' ? event.id : null
    const eventType = typeof event?.type === 'string' ? event.type : null
    const obj = (event?.data?.object ?? null) as Record<string, unknown> | null
    if (!eventType || !obj) return jsonResponse(200, { ok: true })

    const nowIso = new Date().toISOString()

    if (eventType === 'checkout.session.completed') {
      const metadata = (obj.metadata ?? null) as Record<string, unknown> | null
      const usuarioId = normalizeUuid(metadata?.usuario_id)
      const itemRaw = typeof metadata?.item === 'string' ? metadata.item : typeof metadata?.plano === 'string' ? metadata.plano : null
      const item = typeof itemRaw === 'string' ? itemRaw.trim().toLowerCase() : null
      const plano = item && ['basic', 'pro', 'team', 'enterprise'].includes(item) ? item : null
      const limiteFuncionarios = resolveLimiteFuncionariosFromPlano(plano)

      const customerId = typeof obj.customer === 'string' ? obj.customer : null
      const subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : null
      const sessionId = typeof obj.id === 'string' ? obj.id : null

      let finalUsuarioId = usuarioId
      if (!finalUsuarioId) {
        const found = await findUsuarioIdByStripe(adminClient, { subscriptionId, customerId })
        finalUsuarioId = found.ok ? found.usuarioId : null
      }

      if (finalUsuarioId) {
        let venc: string | null = null
        let statusPagamento: string | null = null

        if (subscriptionId && plano) {
          statusPagamento = 'ativo'
          const subRes = await stripeApiRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'GET', key: stripeKey })
          if (subRes.ok && subRes.body && typeof subRes.body === 'object') {
            const sub = subRes.body as Record<string, unknown>
            statusPagamento = mapStripeSubscriptionToPagamentoStatus(sub.status)
            venc = toIsoDateFromUnixSeconds(sub.current_period_end)
          }
        }

        await applyUsuarioPaymentUpdate(adminClient, finalUsuarioId, {
          plano: plano ?? undefined,
          limite_funcionarios: plano ? limiteFuncionarios : undefined,
          status_pagamento: statusPagamento ?? undefined,
          data_vencimento: venc ?? undefined,
          free_trial_consumido: plano ? true : undefined,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          stripe_checkout_session_id: sessionId,
          stripe_last_event_id: eventId,
          stripe_last_event_at: nowIso,
        })
      }

      return jsonResponse(200, { ok: true })
    }

    if (eventType === 'invoice.payment_succeeded' || eventType === 'invoice.payment_failed') {
      const subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : null
      const customerId = typeof obj.customer === 'string' ? obj.customer : null
      const found = await findUsuarioIdByStripe(adminClient, { subscriptionId, customerId })
      if (!found.ok) return jsonResponse(200, { ok: true })

      const venc = toIsoDateFromUnixSeconds(obj.current_period_end ?? obj.period_end)
      const statusPagamento = eventType === 'invoice.payment_succeeded' ? 'ativo' : 'inadimplente'

      await applyUsuarioPaymentUpdate(adminClient, found.usuarioId, {
        status_pagamento: statusPagamento,
        data_vencimento: venc,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_last_event_id: eventId,
        stripe_last_event_at: nowIso,
      })

      return jsonResponse(200, { ok: true })
    }

    if (eventType === 'customer.subscription.updated' || eventType === 'customer.subscription.deleted') {
      const subscriptionId = typeof obj.id === 'string' ? obj.id : null
      const customerId = typeof obj.customer === 'string' ? obj.customer : null
      const metadata = (obj.metadata ?? null) as Record<string, unknown> | null
      const usuarioIdFromMeta = normalizeUuid(metadata?.usuario_id)
      const itemRaw = typeof metadata?.item === 'string' ? metadata.item : typeof metadata?.plano === 'string' ? metadata.plano : null
      const item = typeof itemRaw === 'string' ? itemRaw.trim().toLowerCase() : null
      const plano = item && ['basic', 'pro', 'team', 'enterprise'].includes(item) ? item : null
      const limiteFuncionarios = resolveLimiteFuncionariosFromPlano(plano)

      let finalUsuarioId = usuarioIdFromMeta
      if (!finalUsuarioId) {
        const found = await findUsuarioIdByStripe(adminClient, { subscriptionId, customerId })
        finalUsuarioId = found.ok ? found.usuarioId : null
      }
      if (!finalUsuarioId) return jsonResponse(200, { ok: true })

      const statusPagamento = mapStripeSubscriptionToPagamentoStatus(obj.status)
      const venc = toIsoDateFromUnixSeconds(obj.current_period_end)

      await applyUsuarioPaymentUpdate(adminClient, finalUsuarioId, {
        plano: plano ?? undefined,
        limite_funcionarios: plano ? limiteFuncionarios : undefined,
        status_pagamento: statusPagamento,
        data_vencimento: venc,
        free_trial_consumido: plano ? true : undefined,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_last_event_id: eventId,
        stripe_last_event_at: nowIso,
      })

      return jsonResponse(200, { ok: true })
    }

    return jsonResponse(200, { ok: true })
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: req.headers.get('Authorization') ?? '',
      },
    },
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return jsonResponse(401, { error: 'unauthorized', message: userErr?.message ?? 'invalid_session' })
  }

  let payload: Payload
  try {
    payload = (await req.json()) as Payload
  } catch {
    return jsonResponse(400, { error: 'invalid_json' })
  }

  if (!payload || payload.action !== 'create_checkout') {
    return jsonResponse(400, { error: 'invalid_action' })
  }

  const usuarioId = normalizeUuid(payload.usuario_id)
  if (!usuarioId) return jsonResponse(400, { error: 'invalid_usuario_id' })

  const item = String(payload.plano ?? '').trim().toLowerCase()
  if (!item || item === 'free') return jsonResponse(400, { error: 'invalid_plano' })

  const callerId = userData.user.id
  const { data: saRow } = await userClient.from('super_admin').select('id').eq('id', callerId).maybeSingle()
  const isSuperAdmin = Boolean(saRow)
  if (!isSuperAdmin && callerId !== usuarioId) {
    return jsonResponse(403, { error: 'forbidden' })
  }

  const planKeys = new Set(['basic', 'pro', 'team', 'enterprise'])
  const serviceKeys = new Set(['setup_completo', 'consultoria_hora'])
  if (!planKeys.has(item) && !serviceKeys.has(item)) {
    return jsonResponse(400, { error: 'invalid_plano', message: `Item inválido: ${item}.` })
  }

  const productMap: Record<string, string> = {
    basic: 'prod_ThpUYX62q9wQBO',
    pro: 'prod_ThpVufU2LvlS6y',
    team: 'prod_ThpXPX4bYfq9qX',
    enterprise: 'prod_ThpZyNiWVLRdMF',
    setup_completo: 'prod_ThpbLbCktHM6KW',
    consultoria_hora: 'prod_ThpcTypFiXLnt3',
  }

  const productId = productMap[item] ?? null
  if (!productId) {
    return jsonResponse(400, { error: 'missing_product', message: `Produto não configurado para item ${item}.` })
  }

  const productRes = await stripeApiRequest(`/products/${encodeURIComponent(productId)}`, { method: 'GET', key: stripeKey })
  if (!productRes.ok || !productRes.body || typeof productRes.body !== 'object') {
    return jsonResponse(400, { error: 'stripe_error', message: 'Falha ao consultar produto no Stripe.', stripe: productRes.body })
  }

  const product = productRes.body as Record<string, unknown>
  const dp = product.default_price
  const price = typeof dp === 'string' ? dp : dp && typeof dp === 'object' && typeof (dp as Record<string, unknown>).id === 'string' ? String((dp as Record<string, unknown>).id) : null
  if (!price) {
    return jsonResponse(400, { error: 'missing_price', message: `Produto ${productId} sem default_price no Stripe.` })
  }

  const origin = cleanUrl(req.headers.get('origin') ?? '')
  const siteUrl = cleanUrl(Deno.env.get('SITE_URL') ?? Deno.env.get('APP_URL') ?? origin)
  if (!siteUrl) {
    return jsonResponse(500, { error: 'missing_env', message: 'Defina SITE_URL/APP_URL para montar success_url.' })
  }

  const { data: usuarioRow, error: usuarioErr } = await adminClient
    .from('usuarios')
    .select('id,email')
    .eq('id', usuarioId)
    .maybeSingle()
  if (usuarioErr || !usuarioRow) {
    return jsonResponse(404, { error: 'usuario_not_found' })
  }

  const mode = planKeys.has(item) ? 'subscription' : 'payment'

  const successUrl = `${siteUrl}/pagamento?checkout=success&usuario_id=${encodeURIComponent(usuarioId)}&item=${encodeURIComponent(item)}&plano=${encodeURIComponent(item)}&session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl = `${siteUrl}/pagamento?checkout=cancel&usuario_id=${encodeURIComponent(usuarioId)}&item=${encodeURIComponent(item)}&plano=${encodeURIComponent(item)}`

  const params = new URLSearchParams()
  params.set('mode', mode)
  params.set('success_url', successUrl)
  params.set('cancel_url', cancelUrl)
  params.set('client_reference_id', usuarioId)
  params.set('metadata[usuario_id]', usuarioId)
  params.set('metadata[item]', item)
  params.set('metadata[plano]', item)
  params.set('metadata[created_by]', isSuperAdmin ? 'super_admin' : 'usuario')
  if (mode === 'subscription') {
    params.set('subscription_data[metadata][usuario_id]', usuarioId)
    params.set('subscription_data[metadata][item]', item)
    params.set('subscription_data[metadata][plano]', item)
  }
  params.set('payment_method_types[0]', 'card')
  params.set('line_items[0][price]', price)
  params.set('line_items[0][quantity]', '1')

  const email = typeof usuarioRow.email === 'string' ? usuarioRow.email.trim() : ''
  if (email) params.set('customer_email', email)

  const res = await stripeRequest(params, stripeKey)
  if (!res.ok) {
    const msg = (() => {
      if (!res.body || typeof res.body !== 'object') return null
      const body = res.body as Record<string, unknown>
      const err = body.error
      if (err && typeof err === 'object') {
        const m = (err as Record<string, unknown>).message
        return typeof m === 'string' ? m : null
      }
      return null
    })()
    return jsonResponse(400, { error: 'stripe_error', message: msg ?? 'Falha ao criar checkout.', stripe: res.body })
  }

  const body = (res.body ?? null) as unknown
  const url = typeof (body as Record<string, unknown> | null)?.url === 'string' ? String((body as Record<string, unknown>).url) : null
  if (!url) return jsonResponse(400, { error: 'missing_url' })

  return jsonResponse(200, { url })
})
