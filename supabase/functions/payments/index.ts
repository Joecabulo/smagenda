import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0'

type Payload = { action: 'create_checkout'; usuario_id: string; plano: string }

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

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, { error: 'missing_env' })
  }
  if (!stripeKey) {
    return jsonResponse(500, { error: 'missing_env', message: 'STRIPE_SECRET_KEY não configurada.' })
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: req.headers.get('Authorization') ?? '',
      },
    },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

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

  const plano = String(payload.plano ?? '').trim().toLowerCase()
  if (!plano || plano === 'free') return jsonResponse(400, { error: 'invalid_plano' })

  const callerId = userData.user.id
  const { data: saRow } = await userClient.from('super_admin').select('id').eq('id', callerId).maybeSingle()
  const isSuperAdmin = Boolean(saRow)
  if (!isSuperAdmin && callerId !== usuarioId) {
    return jsonResponse(403, { error: 'forbidden' })
  }

  const priceMap: Record<string, string | null> = {
    basic: (Deno.env.get('STRIPE_PRICE_BASIC') ?? '').trim() || null,
    pro: (Deno.env.get('STRIPE_PRICE_PRO') ?? '').trim() || null,
    team: (Deno.env.get('STRIPE_PRICE_TEAM') ?? '').trim() || null,
    enterprise: (Deno.env.get('STRIPE_PRICE_ENTERPRISE') ?? '').trim() || null,
  }

  const price = priceMap[plano] ?? null
  if (!price) {
    return jsonResponse(400, { error: 'missing_price', message: `Preço não configurado para plano ${plano}.` })
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

  const mode = (Deno.env.get('STRIPE_CHECKOUT_MODE') ?? 'subscription').trim()

  const successUrl = `${siteUrl}/dashboard?checkout=success&usuario_id=${encodeURIComponent(usuarioId)}&plano=${encodeURIComponent(plano)}&session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl = `${siteUrl}/dashboard?checkout=cancel&usuario_id=${encodeURIComponent(usuarioId)}&plano=${encodeURIComponent(plano)}`

  const params = new URLSearchParams()
  params.set('mode', mode)
  params.set('success_url', successUrl)
  params.set('cancel_url', cancelUrl)
  params.set('client_reference_id', usuarioId)
  params.set('metadata[usuario_id]', usuarioId)
  params.set('metadata[plano]', plano)
  params.set('metadata[created_by]', isSuperAdmin ? 'super_admin' : 'usuario')
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
