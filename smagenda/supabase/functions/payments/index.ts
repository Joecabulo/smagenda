import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0'

type GenericRelationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne?: boolean
  referencedRelation: string
  referencedColumns: string[]
}

type GenericTable = {
  Row: Record<string, unknown>
  Insert: Record<string, unknown>
  Update: Record<string, unknown>
  Relationships: GenericRelationship[]
}

type GenericUpdatableView = {
  Row: Record<string, unknown>
  Insert: Record<string, unknown>
  Update: Record<string, unknown>
  Relationships: GenericRelationship[]
}

type GenericNonUpdatableView = {
  Row: Record<string, unknown>
  Relationships: GenericRelationship[]
}

type GenericView = GenericUpdatableView | GenericNonUpdatableView

type GenericSetofOption = {
  isSetofReturn?: boolean | undefined
  isOneToOne?: boolean | undefined
  isNotNullable?: boolean | undefined
  to: string
  from: string
}

type GenericFunction = {
  Args: Record<string, unknown> | never
  Returns: unknown
  SetofOptions?: GenericSetofOption
}

type LooseDatabase = {
  public: {
    Tables: Record<string, GenericTable>
    Views: Record<string, GenericView>
    Functions: Record<string, GenericFunction>
  }
}

type DbClient = ReturnType<typeof createClient<LooseDatabase>>

type Payload =
  | { action: 'create_checkout'; usuario_id: string; plano: string; metodo?: 'card' | 'pix' | null; funcionarios_total?: number | null }
  | { action: 'sync_checkout_session'; session_id: string; usuario_id?: string | null }
  | { action: 'create_billing_portal'; usuario_id: string }
  | { action: 'cancel_subscription'; usuario_id: string; immediate?: boolean | null }
  | { action: 'pause_subscription'; usuario_id: string; behavior?: 'void' | 'keep_as_draft' | 'mark_uncollectible' | null; resumes_at?: number | null }
  | { action: 'grant_free_months'; usuario_id: string; months?: number | null; coupon_id?: string | null }
  | { action: 'admin_get_usuario_stripe_status'; usuario_id: string }
  | {
      action: 'create_booking_fee_checkout'
      usuario_id: string
      servico_id: string
      data: string
      hora_inicio: string
      qtd_vagas?: number | null
      cliente_nome: string
      cliente_telefone: string
      cliente_endereco?: string | null
      extras?: Record<string, unknown> | null
      funcionario_id?: string | null
      unidade_id?: string | null
      slug?: string | null
      unidade_slug?: string | null
    }
  | { action: 'sync_booking_fee_session'; session_id: string }

const PAYMENTS_FUNCTION_VERSION = '2026-01-22-grant-free-months-canceled-sub-1'

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

function cleanEnvValue(input: string) {
  return String(input ?? '')
    .trim()
    .replace(/^['"`\s]+|['"`\s]+$/g, '')
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

async function stripeApiRequest(path: string, opts: { method: 'GET' | 'POST' | 'DELETE'; key: string; params?: URLSearchParams }) {
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

function stripeMessageFromBody(body: unknown) {
  if (!body || typeof body !== 'object') return null
  const obj = body as Record<string, unknown>
  const err = obj.error
  if (!err || typeof err !== 'object') return null
  const msg = (err as Record<string, unknown>).message
  return typeof msg === 'string' && msg.trim() ? msg.trim() : null
}

function stripeCustomerNotFound(body: unknown) {
  if (!body || typeof body !== 'object') return false
  const obj = body as Record<string, unknown>
  const err = obj.error
  if (!err || typeof err !== 'object') return false
  const e = err as Record<string, unknown>
  const msg = typeof e.message === 'string' ? e.message.trim().toLowerCase() : ''
  const code = typeof e.code === 'string' ? e.code.trim().toLowerCase() : ''
  const param = typeof e.param === 'string' ? e.param.trim().toLowerCase() : ''
  if (msg.includes('no such customer')) return true
  if (code === 'resource_missing' && param === 'customer') return true
  return false
}

type ResolvedStripeDiscount =
  | { kind: 'promotion_code'; id: string; code: string | null; coupon_id: string | null }
  | { kind: 'coupon'; id: string }

function cleanStripeDiscountInput(input: string) {
  return String(input ?? '')
    .trim()
    .replace(/^['"`\s]+|['"`\s]+$/g, '')
}

async function resolveStripeDiscount(input: string, stripeKey: string): Promise<ResolvedStripeDiscount | null> {
  const value = cleanStripeDiscountInput(input)
  if (!value) return null
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(value)) return null

  if (value.startsWith('promo_')) {
    const res = await stripeApiRequest(`/promotion_codes/${encodeURIComponent(value)}`, { method: 'GET', key: stripeKey })
    if (!res.ok || !res.body || typeof res.body !== 'object') return null
    const pc = res.body as Record<string, unknown>
    const id = typeof pc.id === 'string' ? pc.id.trim() : ''
    if (!id) return null
    if (pc.active !== true) return null
    const code = typeof pc.code === 'string' ? pc.code.trim() : null
    const coupon = pc.coupon && typeof pc.coupon === 'object' ? (pc.coupon as Record<string, unknown>) : null
    const couponId = typeof coupon?.id === 'string' ? coupon.id.trim() : null
    return { kind: 'promotion_code', id, code, coupon_id: couponId }
  }

  const listRes = await stripeApiRequest(
    `/promotion_codes?code=${encodeURIComponent(value)}&active=true&limit=1`,
    { method: 'GET', key: stripeKey }
  )
  if (listRes.ok && listRes.body && typeof listRes.body === 'object') {
    const data = (listRes.body as Record<string, unknown>).data
    const first = Array.isArray(data) ? (data[0] as unknown) : null
    if (first && typeof first === 'object') {
      const pc = first as Record<string, unknown>
      const id = typeof pc.id === 'string' ? pc.id.trim() : ''
      if (id) {
        const code = typeof pc.code === 'string' ? pc.code.trim() : null
        const coupon = pc.coupon && typeof pc.coupon === 'object' ? (pc.coupon as Record<string, unknown>) : null
        const couponId = typeof coupon?.id === 'string' ? coupon.id.trim() : null
        return { kind: 'promotion_code', id, code, coupon_id: couponId }
      }
    }
  }

  const couponRes = await stripeApiRequest(`/coupons/${encodeURIComponent(value)}`, { method: 'GET', key: stripeKey })
  if (!couponRes.ok || !couponRes.body || typeof couponRes.body !== 'object') return null
  const coupon = couponRes.body as Record<string, unknown>
  const id = typeof coupon.id === 'string' ? coupon.id.trim() : ''
  if (!id) return null
  if (coupon.valid === false) return null
  return { kind: 'coupon', id }
}

async function resolveActivePriceIdForProduct(input: {
  productId: string
  key: string
  expectedMode: 'subscription' | 'payment'
  currency?: string
}) {
  const productId = (input.productId ?? '').trim()
  if (!productId) return null
  const currency = (input.currency ?? 'brl').trim().toLowerCase()
  const expectedType = input.expectedMode === 'subscription' ? 'recurring' : 'one_time'

  const res = await stripeApiRequest(`/prices?active=true&product=${encodeURIComponent(productId)}&limit=100`, {
    method: 'GET',
    key: input.key,
  })
  if (!res.ok || !res.body || typeof res.body !== 'object') return null
  const obj = res.body as Record<string, unknown>
  const data = obj.data
  if (!Array.isArray(data) || data.length === 0) return null

  const candidates: Array<{ id: string; unitAmount: number; intervalRank: number }> = []

  for (const p of data) {
    if (!p || typeof p !== 'object') continue
    const price = p as Record<string, unknown>
    const id = typeof price.id === 'string' ? price.id : ''
    if (!id) continue
    if (price.active !== true) continue
    if (typeof price.type !== 'string' || price.type !== expectedType) continue
    const cur = typeof price.currency === 'string' ? price.currency.toLowerCase() : ''
    if (currency && cur && cur !== currency) continue

    let intervalRank = 0
    if (expectedType === 'recurring') {
      const recurring = price.recurring && typeof price.recurring === 'object' ? (price.recurring as Record<string, unknown>) : null
      const interval = typeof recurring?.interval === 'string' ? recurring.interval : ''
      intervalRank = interval === 'month' ? 2 : interval ? 1 : 0
    }

    const unitAmount = typeof price.unit_amount === 'number' && Number.isFinite(price.unit_amount) ? price.unit_amount : Number.POSITIVE_INFINITY
    candidates.push({ id, unitAmount, intervalRank })
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    if (b.intervalRank !== a.intervalRank) return b.intervalRank - a.intervalRank
    if (a.unitAmount !== b.unitAmount) return a.unitAmount - b.unitAmount
    return a.id.localeCompare(b.id)
  })
  return candidates[0]?.id ?? null
}

function toIsoDateFromUnixSeconds(value: unknown) {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  return new Date(n * 1000).toISOString().slice(0, 10)
}

function toIsoDatePlusDays(days: number) {
  const n = Number(days)
  if (!Number.isFinite(n) || n <= 0) return null
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + Math.floor(n))
  return d.toISOString().slice(0, 10)
}

function toIsoDateFromIsoPlusDays(value: unknown, days: number) {
  const base = typeof value === 'string' ? value.trim() : ''
  if (!base) return null
  const n = Number(days)
  if (!Number.isFinite(n) || n <= 0) return null
  const d = new Date(`${base}T00:00:00`)
  if (!Number.isFinite(d.getTime())) return null
  d.setDate(d.getDate() + Math.floor(n))
  return d.toISOString().slice(0, 10)
}

function addMonthsToIsoDate(baseIsoDate: string, months: number) {
  const base = typeof baseIsoDate === 'string' ? baseIsoDate.trim() : ''
  if (!base) return null
  const m = Math.floor(Number(months))
  if (!Number.isFinite(m) || m <= 0) return null
  const d = new Date(`${base}T00:00:00`)
  if (!Number.isFinite(d.getTime())) return null
  const day = d.getDate()
  d.setMonth(d.getMonth() + m)
  if (d.getDate() !== day) {
    d.setDate(0)
  }
  return d.toISOString().slice(0, 10)
}

function mapStripeSubscriptionToPagamentoStatus(statusRaw: unknown) {
  const s = typeof statusRaw === 'string' ? statusRaw.trim().toLowerCase() : ''
  if (s === 'active' || s === 'trialing') return 'ativo'
  if (s === 'past_due' || s === 'unpaid') return 'inadimplente'
  if (s === 'canceled' || s === 'incomplete_expired') return 'cancelado'
  if (s === 'incomplete' || s === 'paused') return 'suspenso'
  return 'suspenso'
}

function resolvePagamentoStatusFromStripeSubscription(subscriptionRaw: unknown) {
  if (!subscriptionRaw || typeof subscriptionRaw !== 'object') return mapStripeSubscriptionToPagamentoStatus(subscriptionRaw)
  const sub = subscriptionRaw as Record<string, unknown>
  const pauseCollection = sub.pause_collection
  if (pauseCollection && typeof pauseCollection === 'object') return 'suspenso'
  return mapStripeSubscriptionToPagamentoStatus(sub.status)
}

function resolveLimiteFuncionariosFromPlano(planoRaw: unknown) {
  const plano = typeof planoRaw === 'string' ? planoRaw.trim().toLowerCase() : ''
  if (!plano) return undefined
  if (plano === 'enterprise') return 10
  if (plano === 'team') return 4
  if (plano === 'pro') return 4
  if (plano === 'basic') return 1
  if (plano === 'free') return 1
  return undefined
}

function resolveLimiteAgendamentosMesFromPlano(planoRaw: unknown) {
  const plano = typeof planoRaw === 'string' ? planoRaw.trim().toLowerCase() : ''
  if (!plano) return undefined
  if (plano === 'enterprise') return null
  if (plano === 'team') return 300
  if (plano === 'pro') return 180
  if (plano === 'basic') return 60
  if (plano === 'free') return 30
  return undefined
}

function resolveWhatsappQuotaMensalFromPlano(planoRaw: unknown) {
  const plano = typeof planoRaw === 'string' ? planoRaw.trim().toLowerCase() : ''
  if (!plano) return undefined
  if (plano === 'enterprise') return 500
  if (plano === 'team') return 300
  if (plano === 'pro') return 300
  if (plano === 'basic') return 100
  if (plano === 'free') return 0
  return undefined
}

function resolvePlanoFromMetadata(metadataRaw: unknown) {
  const metadata = (metadataRaw ?? null) as Record<string, unknown> | null
  const itemRaw = typeof metadata?.item === 'string' ? metadata.item : typeof metadata?.plano === 'string' ? metadata.plano : null
  const item = typeof itemRaw === 'string' ? itemRaw.trim().toLowerCase() : ''
  if (!item) return { item: null as string | null, plano: null as string | null }
  const plano = ['basic', 'pro', 'team', 'enterprise'].includes(item) ? item : null
  return { item, plano }
}

function parsePositiveInt(value: unknown) {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n)) return null
  const i = Math.floor(n)
  if (i <= 0) return null
  return i
}

function clampInt(value: number, min: number, max: number) {
  const n = Math.floor(value)
  if (n < min) return min
  if (n > max) return max
  return n
}

function resolveFuncionariosTotalFromMetadata(metadataRaw: unknown) {
  const metadata = (metadataRaw ?? null) as Record<string, unknown> | null
  const raw = metadata?.funcionarios_total ?? metadata?.funcionarios ?? metadata?.qtd_funcionarios
  const parsed = parsePositiveInt(raw)
  if (!parsed) return null
  return clampInt(parsed, 1, 200)
}

function resolveExtraEmployeesQtyFromSubscription(subscriptionRaw: unknown, opts: { extraPriceId?: string; extraProductId?: string }) {
  if (!subscriptionRaw || typeof subscriptionRaw !== 'object') return null
  const subscription = subscriptionRaw as Record<string, unknown>
  const items = subscription.items
  if (!items || typeof items !== 'object') return null
  const data = (items as Record<string, unknown>).data
  if (!Array.isArray(data)) return null

  const extraPriceId = (opts.extraPriceId ?? '').trim()
  const extraProductId = (opts.extraProductId ?? '').trim()
  if (!extraPriceId && !extraProductId) return null

  let sum = 0
  for (const it of data) {
    if (!it || typeof it !== 'object') continue
    const row = it as Record<string, unknown>
    const qty = parsePositiveInt(row.quantity) ?? 0
    if (qty <= 0) continue

    const priceRaw = row.price
    const priceObj = priceRaw && typeof priceRaw === 'object' ? (priceRaw as Record<string, unknown>) : null
    const priceId = typeof priceRaw === 'string' ? priceRaw : typeof priceObj?.id === 'string' ? priceObj.id : ''

    const productRaw = priceObj?.product
    const productObj = productRaw && typeof productRaw === 'object' ? (productRaw as Record<string, unknown>) : null
    const productId = typeof productRaw === 'string' ? productRaw : typeof productObj?.id === 'string' ? productObj.id : ''

    const matchesPrice = extraPriceId && priceId === extraPriceId
    const matchesProduct = extraProductId && productId === extraProductId
    if (!matchesPrice && !matchesProduct) continue

    sum += qty
  }

  return sum
}

function resolveLimiteFuncionariosFromStripe(input: {
  plano: string | null
  metadata: unknown
  subscription?: unknown
  extraPriceId?: string
  extraProductId?: string
}) {
  const plano = typeof input.plano === 'string' ? input.plano.trim().toLowerCase() : ''
  if (!plano) return resolveLimiteFuncionariosFromPlano(input.plano)
  if (plano === 'basic' || plano === 'free') return resolveLimiteFuncionariosFromPlano(plano)

  const base = resolveLimiteFuncionariosFromPlano(plano)
  if (base === null) return null
  const baseIncluded = typeof base === 'number' && Number.isFinite(base) && base > 0 ? Math.floor(base) : 1

  const fromMeta = resolveFuncionariosTotalFromMetadata(input.metadata)
  const extraQty = resolveExtraEmployeesQtyFromSubscription(input.subscription, {
    extraPriceId: input.extraPriceId,
    extraProductId: input.extraProductId,
  })

  const max = plano === 'pro' || plano === 'team' ? 6 : plano === 'enterprise' ? 10 : 200

  if (typeof extraQty === 'number') {
    const total = baseIncluded + Math.max(0, extraQty)
    return clampInt(total, 1, max)
  }

  if (fromMeta) return clampInt(Math.max(baseIncluded, fromMeta), 1, max)
  return resolveLimiteFuncionariosFromPlano(plano)
}

function resolvePaymentStatus(value: unknown) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!v) return null
  if (v === 'paid' || v === 'no_payment_required') return 'paid'
  if (v === 'unpaid') return 'unpaid'
  return null
}

async function findUsuarioIdByStripe(adminClient: DbClient, input: { subscriptionId?: string | null; customerId?: string | null }) {
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
  adminClient: DbClient,
  usuarioId: string,
  update: {
    plano?: string | null
    limite_funcionarios?: number | null
    limite_agendamentos_mes?: number | null
    whatsapp_quota_mensal?: number | null
    status_pagamento?: string | null
    data_vencimento?: string | null
    free_trial_consumido?: boolean | null
    stripe_customer_id?: string | null
    stripe_subscription_id?: string | null
    stripe_checkout_session_id?: string | null
    stripe_last_invoice_id?: string | null
    data_pagamento_fatura?: string | null
    stripe_last_event_id?: string | null
    stripe_last_event_at?: string | null
    ativo?: boolean | null
  }
) {
  const payload: Record<string, unknown> = {}
  if (typeof update.plano === 'string' && update.plano.trim()) payload.plano = update.plano.trim().toLowerCase()
  if (typeof update.limite_funcionarios === 'number' && Number.isFinite(update.limite_funcionarios)) payload.limite_funcionarios = update.limite_funcionarios
  if (update.limite_funcionarios === null) payload.limite_funcionarios = null
  if (typeof update.limite_agendamentos_mes === 'number' && Number.isFinite(update.limite_agendamentos_mes)) payload.limite_agendamentos_mes = update.limite_agendamentos_mes
  if (update.limite_agendamentos_mes === null) payload.limite_agendamentos_mes = null
  if (typeof update.whatsapp_quota_mensal === 'number' && Number.isFinite(update.whatsapp_quota_mensal)) payload.whatsapp_quota_mensal = update.whatsapp_quota_mensal
  if (update.whatsapp_quota_mensal === null) payload.whatsapp_quota_mensal = null
  if (typeof update.status_pagamento === 'string' && update.status_pagamento.trim()) payload.status_pagamento = update.status_pagamento.trim()
  if (typeof update.data_vencimento === 'string' && update.data_vencimento.trim()) payload.data_vencimento = update.data_vencimento.trim()
  if (update.free_trial_consumido === true) payload.free_trial_consumido = true
  if (update.free_trial_consumido === false) payload.free_trial_consumido = false
  if (typeof update.stripe_customer_id === 'string' && update.stripe_customer_id.trim()) payload.stripe_customer_id = update.stripe_customer_id.trim()
  if (typeof update.stripe_subscription_id === 'string' && update.stripe_subscription_id.trim()) payload.stripe_subscription_id = update.stripe_subscription_id.trim()
  if (typeof update.stripe_checkout_session_id === 'string' && update.stripe_checkout_session_id.trim()) payload.stripe_checkout_session_id = update.stripe_checkout_session_id.trim()
  if (typeof update.stripe_last_invoice_id === 'string' && update.stripe_last_invoice_id.trim()) payload.stripe_last_invoice_id = update.stripe_last_invoice_id.trim()
  if (typeof update.data_pagamento_fatura === 'string' && update.data_pagamento_fatura.trim()) payload.data_pagamento_fatura = update.data_pagamento_fatura.trim()
  if (typeof update.stripe_last_event_id === 'string' && update.stripe_last_event_id.trim()) payload.stripe_last_event_id = update.stripe_last_event_id.trim()
  if (typeof update.stripe_last_event_at === 'string' && update.stripe_last_event_at.trim()) payload.stripe_last_event_at = update.stripe_last_event_at.trim()
  if (update.ativo === true) payload.ativo = true
  if (update.ativo === false) payload.ativo = false

  if (Object.keys(payload).length === 0) return { ok: true as const }

  const first = await adminClient.from('usuarios').update(payload).eq('id', usuarioId)
  if (!first.error) return { ok: true as const }

  const fallbackPayload: Record<string, unknown> = { ...payload }
  const optionalColumns = ['whatsapp_quota_mensal', 'stripe_last_invoice_id', 'data_pagamento_fatura']
  let lastError = first.error

  for (const col of optionalColumns) {
    if (!lastError) break
    if (!isMissingColumnError(lastError, col)) {
      return { ok: false as const, error: lastError.message ?? 'db_error' }
    }
    delete fallbackPayload[col]
    if (Object.keys(fallbackPayload).length === 0) return { ok: true as const }
    const next = await adminClient.from('usuarios').update(fallbackPayload).eq('id', usuarioId)
    if (!next.error) return { ok: true as const }
    lastError = next.error
  }

  return { ok: false as const, error: lastError?.message ?? 'db_error' }
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

function parseNumeric(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function toCentsBRL(value: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const cents = Math.round(n * 100)
  if (!Number.isFinite(cents) || cents <= 0) return null
  return cents
}

function buildPublicBookingReturnPath(input: { slug: string; unidadeSlug?: string | null }) {
  const slug = (input.slug ?? '').trim().replace(/^\/+|\/+$/g, '')
  if (!slug) return null
  const u = (input.unidadeSlug ?? '').trim().replace(/^\/+|\/+$/g, '')
  return u ? `/agendar/${encodeURIComponent(slug)}/${encodeURIComponent(u)}` : `/agendar/${encodeURIComponent(slug)}`
}

function isStripePaidSession(session: Record<string, unknown>) {
  const paymentStatus = resolvePaymentStatus(session.payment_status)
  if (paymentStatus === 'paid') return true
  return false
}

async function callPublicCreateAgendamentoWithFallback(
  adminClient: DbClient,
  args: Record<string, unknown>
) {
  const lowerMsg = (e: { message?: string }) => String(e?.message ?? '').toLowerCase()
  const hasExtras = 'p_extras' in args && args.p_extras !== null && args.p_extras !== undefined
  const hasQtdVagas = 'p_qtd_vagas' in args && args.p_qtd_vagas !== null && args.p_qtd_vagas !== undefined
  const shouldFallback = (msg: string) => {
    const missingSignature =
      msg.includes('public_create_agendamento_publico') && (msg.includes('does not exist') || msg.includes('function') || msg.includes('rpc'))
    const badParam =
      msg.includes('parameter') ||
      msg.includes('unknown') ||
      msg.includes('p_unidade_id') ||
      msg.includes('p_status') ||
      msg.includes('p_extras') ||
      msg.includes('p_qtd_vagas')
    return missingSignature || badParam
  }

  const dropKeys = (obj: Record<string, unknown>, keys: string[]) => {
    const out: Record<string, unknown> = { ...obj }
    for (const k of keys) {
      if (k in out) delete out[k]
    }
    return out
  }

  const baseVariants: Record<string, unknown>[] = [
    { ...args },
    dropKeys(args, ['p_unidade_id']),
    dropKeys(args, ['p_status']),
    dropKeys(args, ['p_unidade_id', 'p_status']),
  ]

  let variants: Record<string, unknown>[] = hasExtras
    ? baseVariants
    : [
        ...baseVariants,
        dropKeys(args, ['p_extras']),
        dropKeys(args, ['p_unidade_id', 'p_extras']),
        dropKeys(args, ['p_status', 'p_extras']),
        dropKeys(args, ['p_unidade_id', 'p_status', 'p_extras']),
      ]

  if (hasQtdVagas) {
    variants = [...variants, ...variants.map((v) => dropKeys(v, ['p_qtd_vagas']))]
  }

  let lastError: { message?: string } | null = null
  for (const v of variants) {
    const { data, error } = await adminClient.rpc('public_create_agendamento_publico', v)
    if (!error) return { ok: true as const, data }
    lastError = error
    const msg = lowerMsg(error)
    if (!shouldFallback(msg)) return { ok: false as const, error }
  }

  return { ok: false as const, error: lastError as { message: string } }
}

function isMissingColumnError(error: { message?: string } | null, column: string) {
  const msg = String(error?.message ?? '')
  const lower = msg.toLowerCase()
  const col = column.toLowerCase()
  if (!lower.includes(col)) return false
  if (lower.includes('column') && lower.includes('does not exist')) return true
  if (lower.includes('schema cache') && lower.includes(col)) return true
  if (lower.includes('could not find') && lower.includes(col)) return true
  return false
}

async function upsertTaxaAgendamentoPagamentoWithFallback(
  adminClient: DbClient,
  row: Record<string, unknown>,
  onConflict: string
) {
  const first = await adminClient.from('taxa_agendamento_pagamentos').upsert(row, { onConflict })
  if (!first.error) return { ok: true as const }
  if (!isMissingColumnError(first.error, 'unidade_id')) return { ok: false as const, error: first.error }
  const withoutUnidade: Record<string, unknown> = { ...row }
  delete withoutUnidade.unidade_id
  const second = await adminClient.from('taxa_agendamento_pagamentos').upsert(withoutUnidade, { onConflict })
  if (second.error) return { ok: false as const, error: second.error }
  return { ok: true as const }
}

async function updateTaxaAgendamentoPagamentoWithFallback(
  adminClient: DbClient,
  id: string,
  patch: Record<string, unknown>
) {
  const first = await adminClient.from('taxa_agendamento_pagamentos').update(patch).eq('id', id)
  if (!first.error) return { ok: true as const }
  if (!isMissingColumnError(first.error, 'unidade_id')) return { ok: false as const, error: first.error }
  const withoutUnidade: Record<string, unknown> = { ...patch }
  delete withoutUnidade.unidade_id
  const second = await adminClient.from('taxa_agendamento_pagamentos').update(withoutUnidade).eq('id', id)
  if (second.error) return { ok: false as const, error: second.error }
  return { ok: true as const }
}

async function insertTaxaAgendamentoPagamentoWithFallback(adminClient: DbClient, row: Record<string, unknown>) {
  const first = await adminClient.from('taxa_agendamento_pagamentos').insert(row)
  if (!first.error) return { ok: true as const }
  if (!isMissingColumnError(first.error, 'unidade_id')) return { ok: false as const, error: first.error }
  const withoutUnidade: Record<string, unknown> = { ...row }
  delete withoutUnidade.unidade_id
  const second = await adminClient.from('taxa_agendamento_pagamentos').insert(withoutUnidade)
  if (second.error) return { ok: false as const, error: second.error }
  return { ok: true as const }
}

async function handlePublicBookingFeeCheckout(input: {
  adminClient: DbClient
  stripeKey: string
  siteUrl: string
  payload: Payload & { action: 'create_booking_fee_checkout' }
}) {
  const usuarioId = normalizeUuid(input.payload.usuario_id)
  const servicoId = normalizeUuid(input.payload.servico_id)
  const funcionarioId = normalizeUuid(input.payload.funcionario_id)
  const unidadeId = normalizeUuid(input.payload.unidade_id)
  const data = String(input.payload.data ?? '').trim()
  const horaInicio = String(input.payload.hora_inicio ?? '').trim()
  const qtdVagasRaw = parseNumeric(input.payload.qtd_vagas)
  const qtdVagas = qtdVagasRaw && Number.isFinite(qtdVagasRaw) ? Math.max(1, Math.min(200, Math.floor(qtdVagasRaw))) : 1
  const clienteNome = String(input.payload.cliente_nome ?? '').trim()
  const clienteTelefone = String(input.payload.cliente_telefone ?? '').trim()
  const clienteEndereco = String(input.payload.cliente_endereco ?? '').trim()
  const slug = String(input.payload.slug ?? '').trim()
  const unidadeSlug = String(input.payload.unidade_slug ?? '').trim()

  const extrasRaw = input.payload.extras
  const extrasObj = extrasRaw && typeof extrasRaw === 'object' && !Array.isArray(extrasRaw) ? (extrasRaw as Record<string, unknown>) : null
  const extras = clienteEndereco ? { ...(extrasObj ?? {}), endereco: clienteEndereco } : extrasObj
  const extrasFinal = extras && Object.keys(extras).length > 0 ? extras : null

  if (!usuarioId || !servicoId || !data || !horaInicio || !clienteNome || !clienteTelefone || !slug) {
    return jsonResponse(400, { error: 'invalid_payload' })
  }

  const returnPath = buildPublicBookingReturnPath({ slug, unidadeSlug: unidadeSlug || null })
  if (!returnPath) return jsonResponse(400, { error: 'invalid_slug' })

  const { data: usuarioRow, error: usuarioErr } = await input.adminClient
    .from('usuarios')
    .select('id,slug,ativo')
    .eq('slug', slug)
    .maybeSingle()
  if (usuarioErr || !usuarioRow || usuarioRow.ativo !== true) {
    return jsonResponse(404, { error: 'usuario_not_found' })
  }
  if (String(usuarioRow.id) !== usuarioId) {
    return jsonResponse(400, { error: 'usuario_mismatch' })
  }

  if (unidadeSlug) {
    const { data: unRow, error: unErr } = await input.adminClient
      .from('unidades')
      .select('id,slug,ativo,usuario_id')
      .eq('usuario_id', usuarioId)
      .eq('slug', unidadeSlug)
      .maybeSingle()
    if (unErr) return jsonResponse(400, { error: 'unidade_error', message: unErr.message })
    if (!unRow || unRow.ativo !== true) return jsonResponse(404, { error: 'unidade_not_found' })
    if (!unidadeId) {
      return jsonResponse(400, { error: 'missing_unidade_id' })
    }
    if (String(unRow.id) !== unidadeId) {
      return jsonResponse(400, { error: 'unidade_mismatch' })
    }
  }

  const { data: servicoRow, error: servicoErr } = await input.adminClient
    .from('servicos')
    .select('id,usuario_id,ativo,nome,taxa_agendamento')
    .eq('id', servicoId)
    .eq('usuario_id', usuarioId)
    .maybeSingle()
  if (servicoErr) return jsonResponse(400, { error: 'servico_error', message: servicoErr.message })
  if (!servicoRow || servicoRow.ativo !== true) return jsonResponse(404, { error: 'servico_not_found' })

  const taxa = parseNumeric((servicoRow as Record<string, unknown>).taxa_agendamento) ?? 0
  const taxaNorm = Math.max(0, taxa)
  const cents = toCentsBRL(taxaNorm)
  if (!cents) return jsonResponse(400, { error: 'invalid_fee' })

  const { data: creditIdRaw, error: creditErr } = await input.adminClient.rpc('consume_taxa_agendamento_credito', {
    p_usuario_id: usuarioId,
    p_cliente_telefone: clienteTelefone,
  })
  if (creditErr) {
    return jsonResponse(400, { error: 'credit_error', message: creditErr.message })
  }
  const creditId = normalizeUuid(creditIdRaw)
  if (creditId) {
    const createArgs: Record<string, unknown> = {
      p_usuario_id: usuarioId,
      p_data: data,
      p_hora_inicio: horaInicio,
      p_servico_id: servicoId,
      p_cliente_nome: clienteNome,
      p_cliente_telefone: clienteTelefone,
      p_funcionario_id: funcionarioId,
      p_status: 'confirmado',
    }
    if (qtdVagas > 1) createArgs.p_qtd_vagas = qtdVagas
    if (extrasFinal) createArgs.p_extras = extrasFinal
    if (unidadeId) createArgs.p_unidade_id = unidadeId

    const createRes = await callPublicCreateAgendamentoWithFallback(input.adminClient, createArgs)
    if (!createRes.ok) {
      const msg = String(createRes.error.message ?? '').trim()
      const lower = msg.toLowerCase()
      if (lower.includes('capacidade_esgotada')) {
        return jsonResponse(409, { error: 'capacidade_esgotada', message: 'capacidade_esgotada' })
      }
      return jsonResponse(400, { error: 'create_agendamento_failed', message: msg || createRes.error.message })
    }
    const agendamentoId = normalizeUuid(createRes.data)
    if (!agendamentoId) return jsonResponse(400, { error: 'invalid_agendamento_id' })

    await updateTaxaAgendamentoPagamentoWithFallback(input.adminClient, creditId, {
      status: 'usado',
      usado_em: new Date().toISOString(),
      utilizado_em_agendamento_id: agendamentoId,
      servico_id: servicoId,
      funcionario_id: funcionarioId,
      unidade_id: unidadeId,
    })

    return jsonResponse(200, { ok: true, kind: 'credit', agendamento_id: agendamentoId })
  }

  const createArgs: Record<string, unknown> = {
    p_usuario_id: usuarioId,
    p_data: data,
    p_hora_inicio: horaInicio,
    p_servico_id: servicoId,
    p_cliente_nome: clienteNome,
    p_cliente_telefone: clienteTelefone,
    p_funcionario_id: funcionarioId,
    p_status: 'pendente',
  }
  if (qtdVagas > 1) createArgs.p_qtd_vagas = qtdVagas
  if (extrasFinal) createArgs.p_extras = extrasFinal
  if (unidadeId) createArgs.p_unidade_id = unidadeId

  const createRes = await callPublicCreateAgendamentoWithFallback(input.adminClient, createArgs)
  if (!createRes.ok) {
    const msg = String(createRes.error.message ?? '').trim()
    const lower = msg.toLowerCase()
    if (lower.includes('capacidade_esgotada')) {
      return jsonResponse(409, { error: 'capacidade_esgotada', message: 'capacidade_esgotada' })
    }
    return jsonResponse(400, { error: 'create_agendamento_failed', message: msg || createRes.error.message })
  }
  const agendamentoId = normalizeUuid(createRes.data)
  if (!agendamentoId) return jsonResponse(400, { error: 'invalid_agendamento_id' })

  const successUrl = `${input.siteUrl}${returnPath}?paid=1&session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl = `${input.siteUrl}${returnPath}?canceled=1`

  const params = new URLSearchParams()
  params.set('mode', 'payment')
  params.set('success_url', successUrl)
  params.set('cancel_url', cancelUrl)
  params.set('client_reference_id', agendamentoId)
  params.set('metadata[kind]', 'booking_fee')
  params.set('metadata[usuario_id]', usuarioId)
  params.set('metadata[agendamento_id]', agendamentoId)
  params.set('metadata[servico_id]', servicoId)
  if (funcionarioId) params.set('metadata[funcionario_id]', funcionarioId)
  if (unidadeId) params.set('metadata[unidade_id]', unidadeId)
  params.set('payment_intent_data[metadata][kind]', 'booking_fee')
  params.set('payment_intent_data[metadata][usuario_id]', usuarioId)
  params.set('payment_intent_data[metadata][agendamento_id]', agendamentoId)
  params.set('payment_intent_data[metadata][servico_id]', servicoId)
  if (funcionarioId) params.set('payment_intent_data[metadata][funcionario_id]', funcionarioId)
  if (unidadeId) params.set('payment_intent_data[metadata][unidade_id]', unidadeId)

  params.set('payment_method_types[0]', 'card')
  params.set('line_items[0][price_data][currency]', 'brl')
  params.set('line_items[0][price_data][product_data][name]', `Taxa de agendamento - ${String((servicoRow as Record<string, unknown>).nome ?? 'Serviço')}`)
  params.set('line_items[0][price_data][unit_amount]', String(cents))
  params.set('line_items[0][quantity]', '1')
  params.set('expand[0]', 'payment_intent')

  const stripeRes = await stripeRequest(params, input.stripeKey)
  if (!stripeRes.ok || !stripeRes.body || typeof stripeRes.body !== 'object') {
    await input.adminClient.from('agendamentos').delete().eq('id', agendamentoId).eq('usuario_id', usuarioId)
    const stripeMessage = (() => {
      if (!stripeRes.body || typeof stripeRes.body !== 'object') return null
      const body = stripeRes.body as Record<string, unknown>
      const err = body.error
      if (!err || typeof err !== 'object') return null
      const msg = (err as Record<string, unknown>).message
      return typeof msg === 'string' && msg.trim() ? msg.trim() : null
    })()
    return jsonResponse(400, { error: 'stripe_error', message: stripeMessage ?? 'Falha ao criar checkout.', stripe: stripeRes.body })
  }

  const sessionObj = stripeRes.body as Record<string, unknown>
  const checkoutUrl = typeof sessionObj.url === 'string' ? sessionObj.url : null
  const sessionId = typeof sessionObj.id === 'string' ? sessionObj.id : null
  const piRaw = sessionObj.payment_intent
  const paymentIntentId = typeof piRaw === 'string' ? piRaw : piRaw && typeof piRaw === 'object' && typeof (piRaw as Record<string, unknown>).id === 'string' ? String((piRaw as Record<string, unknown>).id) : null
  if (!checkoutUrl || !sessionId) {
    await input.adminClient.from('agendamentos').delete().eq('id', agendamentoId).eq('usuario_id', usuarioId)
    return jsonResponse(400, { error: 'missing_url' })
  }

  const feeValue = taxaNorm
  const persist = await upsertTaxaAgendamentoPagamentoWithFallback(
    input.adminClient,
    {
      usuario_id: usuarioId,
      agendamento_id: agendamentoId,
      servico_id: servicoId,
      funcionario_id: funcionarioId,
      unidade_id: unidadeId,
      cliente_nome: clienteNome,
      cliente_telefone: clienteTelefone,
      valor: feeValue,
      moeda: 'brl',
      status: 'pendente',
      stripe_checkout_session_id: sessionId,
      stripe_payment_intent_id: paymentIntentId,
    },
    'stripe_checkout_session_id'
  )
  if (!persist.ok) {
    await input.adminClient.from('agendamentos').delete().eq('id', agendamentoId).eq('usuario_id', usuarioId)
    return jsonResponse(400, { error: 'db_error', message: persist.error.message })
  }

  return jsonResponse(200, {
    ok: true,
    kind: 'checkout',
    checkout_url: checkoutUrl,
    session_id: sessionId,
    intent_id: paymentIntentId,
    agendamento_id: agendamentoId,
  })
}

async function finalizeBookingFeeFromStripeSession(input: {
  adminClient: DbClient
  stripeKey: string
  sessionId: string
}) {
  const sessionRes = await stripeApiRequest(`/checkout/sessions/${encodeURIComponent(input.sessionId)}?expand[]=payment_intent`, {
    method: 'GET',
    key: input.stripeKey,
  })
  if (!sessionRes.ok || !sessionRes.body || typeof sessionRes.body !== 'object') {
    return { ok: false as const, error: 'stripe_error' as const, stripe: sessionRes.body }
  }

  const session = sessionRes.body as Record<string, unknown>
  if (!isStripePaidSession(session)) {
    return { ok: false as const, error: 'not_paid' as const }
  }

  const metadata = (session.metadata ?? null) as Record<string, unknown> | null
  const kind = typeof metadata?.kind === 'string' ? metadata.kind.trim().toLowerCase() : ''
  if (kind !== 'booking_fee') {
    return { ok: false as const, error: 'invalid_kind' as const }
  }
  const usuarioId = normalizeUuid(metadata?.usuario_id)
  const agendamentoId = normalizeUuid(metadata?.agendamento_id)
  const servicoId = normalizeUuid(metadata?.servico_id)
  const funcionarioId = normalizeUuid(metadata?.funcionario_id)
  const unidadeId = normalizeUuid(metadata?.unidade_id)

  if (!usuarioId || !agendamentoId) {
    return { ok: false as const, error: 'missing_metadata' as const }
  }

  const piRaw = session.payment_intent
  const paymentIntentId =
    typeof piRaw === 'string'
      ? piRaw
      : piRaw && typeof piRaw === 'object' && typeof (piRaw as Record<string, unknown>).id === 'string'
        ? String((piRaw as Record<string, unknown>).id)
        : null

  const nowIso = new Date().toISOString()

  await input.adminClient.from('agendamentos').update({ status: 'confirmado' }).eq('id', agendamentoId).eq('usuario_id', usuarioId)

  const amountTotal = typeof session.amount_total === 'number' ? session.amount_total : typeof session.amount_total === 'string' ? Number(session.amount_total) : null
  const valor = typeof amountTotal === 'number' && Number.isFinite(amountTotal) ? amountTotal / 100 : null

  const { data: existing } = await input.adminClient
    .from('taxa_agendamento_pagamentos')
    .select('id')
    .eq('stripe_checkout_session_id', input.sessionId)
    .maybeSingle()

  if (existing?.id) {
    const upd = await updateTaxaAgendamentoPagamentoWithFallback(input.adminClient, String(existing.id), {
      status: 'pago',
      pago_em: nowIso,
      stripe_payment_intent_id: paymentIntentId,
      servico_id: servicoId,
      funcionario_id: funcionarioId,
      unidade_id: unidadeId,
    })
    if (!upd.ok) return { ok: false as const, error: 'db_error' as const }
  } else {
    const ins = await insertTaxaAgendamentoPagamentoWithFallback(input.adminClient, {
      usuario_id: usuarioId,
      agendamento_id: agendamentoId,
      servico_id: servicoId,
      funcionario_id: funcionarioId,
      unidade_id: unidadeId,
      valor: valor ?? 0,
      moeda: 'brl',
      status: 'pago',
      stripe_checkout_session_id: input.sessionId,
      stripe_payment_intent_id: paymentIntentId,
      pago_em: nowIso,
    })
    if (!ins.ok) return { ok: false as const, error: 'db_error' as const }
  }

  return { ok: true as const, agendamentoId }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse(200, { ok: true })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' })

  const supabaseUrl = cleanEnvValue(Deno.env.get('SUPABASE_URL') ?? '')
  const anonKey = cleanEnvValue(Deno.env.get('SUPABASE_ANON_KEY') ?? '')
  const serviceRoleKey = cleanEnvValue(Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const stripeKey = cleanEnvValue(Deno.env.get('STRIPE_SECRET_KEY') ?? '')
  const stripeWebhookSecret = cleanEnvValue(Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '')
  const stripeKeyMode =
    stripeKey.startsWith('sk_live_') || stripeKey.startsWith('rk_live_')
      ? 'live'
      : stripeKey.startsWith('sk_test_') || stripeKey.startsWith('rk_test_')
        ? 'test'
        : null

  const bookingFeeEnabled = cleanEnvValue(Deno.env.get('ENABLE_BOOKING_FEE') ?? '') === '1'

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, { error: 'missing_env' })
  }
  if (!stripeKey) {
    return jsonResponse(500, { error: 'missing_env', message: 'STRIPE_SECRET_KEY não configurada.' })
  }

  const stripeKeyHasQuery = stripeKey.includes('?') || stripeKey.includes('&') || stripeKey.includes('=') || stripeKey.includes('://')
  if (!stripeKeyMode || stripeKeyHasQuery) {
    return jsonResponse(500, {
      error: 'invalid_env',
      message: 'STRIPE_SECRET_KEY inválida. Use sk_live_... (ou rk_live_...) sem aspas, URL ou parâmetros.',
      stripe_key_mode: stripeKeyMode,
    })
  }

  const signatureHeader = req.headers.get('stripe-signature') ?? req.headers.get('Stripe-Signature')
  const isStripeWebhook = Boolean(signatureHeader)

  const adminClient = createClient<LooseDatabase>(supabaseUrl, serviceRoleKey)

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

    if (eventType === 'checkout.session.completed' || eventType === 'checkout.session.async_payment_succeeded') {
      const metadata = (obj.metadata ?? null) as Record<string, unknown> | null
      const kind = typeof metadata?.kind === 'string' ? metadata.kind.trim().toLowerCase() : ''
      const sessionId = typeof obj.id === 'string' ? obj.id : null

      if (kind === 'booking_fee' && sessionId) {
        if (!bookingFeeEnabled) return jsonResponse(200, { ok: true })
        const done = await finalizeBookingFeeFromStripeSession({ adminClient, stripeKey, sessionId })
        if (!done.ok) return jsonResponse(200, { ok: true })
        return jsonResponse(200, { ok: true })
      }

      const usuarioId = normalizeUuid(metadata?.usuario_id)
      const { plano } = resolvePlanoFromMetadata(metadata)

      const paymentStatus = resolvePaymentStatus(obj.payment_status)
      const customerId = typeof obj.customer === 'string' ? obj.customer : null
      const subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : null
      const sessionId2 = sessionId

      let finalUsuarioId = usuarioId
      if (!finalUsuarioId) {
        const found = await findUsuarioIdByStripe(adminClient, { subscriptionId, customerId })
        finalUsuarioId = found.ok ? found.usuarioId : null
      }

      if (finalUsuarioId && plano) {
        let venc: string | null = null
        let statusPagamento: string | null = null
        let subscriptionObj: Record<string, unknown> | null = null

        if (subscriptionId) {
          statusPagamento = 'ativo'
          const subRes = await stripeApiRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=items.data.price.product`, {
            method: 'GET',
            key: stripeKey,
          })
          if (subRes.ok && subRes.body && typeof subRes.body === 'object') {
            subscriptionObj = subRes.body as Record<string, unknown>
            statusPagamento = resolvePagamentoStatusFromStripeSubscription(subscriptionObj)
            venc = toIsoDateFromUnixSeconds(subscriptionObj.current_period_end)
          }
        } else if (paymentStatus === 'paid') {
          statusPagamento = 'ativo'
          venc = toIsoDatePlusDays(30)
        }

        const extraPriceId = (Deno.env.get('STRIPE_PRICE_FUNCIONARIO_ADICIONAL') ?? '').trim()
        const extraProductId = 'prod_Tik80yLbCUqUhZ'
        const limiteFuncionarios = resolveLimiteFuncionariosFromStripe({
          plano,
          metadata,
          subscription: subscriptionObj,
          extraPriceId: extraPriceId || undefined,
          extraProductId: extraProductId || undefined,
        })
        const limiteAgendamentosMes = resolveLimiteAgendamentosMesFromPlano(plano)
        const whatsappQuotaMensal = resolveWhatsappQuotaMensalFromPlano(plano)

        if (statusPagamento) {
          await applyUsuarioPaymentUpdate(adminClient, finalUsuarioId, {
            plano,
            limite_funcionarios: limiteFuncionarios,
            limite_agendamentos_mes: limiteAgendamentosMes,
            whatsapp_quota_mensal: whatsappQuotaMensal,
            status_pagamento: statusPagamento,
            data_vencimento: venc,
            ativo: statusPagamento === 'ativo' ? true : undefined,
            free_trial_consumido: true,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            stripe_checkout_session_id: sessionId2,
            stripe_last_event_id: eventId,
            stripe_last_event_at: nowIso,
          })
        }
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
        ativo: statusPagamento === 'ativo' ? true : undefined,
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
      const extraPriceId = (Deno.env.get('STRIPE_PRICE_FUNCIONARIO_ADICIONAL') ?? '').trim()
      const extraProductId = 'prod_Tik80yLbCUqUhZ'
      const limiteFuncionarios = resolveLimiteFuncionariosFromStripe({
        plano,
        metadata,
        subscription: obj,
        extraPriceId: extraPriceId || undefined,
        extraProductId: extraProductId || undefined,
      })
      const limiteAgendamentosMes = resolveLimiteAgendamentosMesFromPlano(plano)
      const whatsappQuotaMensal = resolveWhatsappQuotaMensalFromPlano(plano)

      let finalUsuarioId = usuarioIdFromMeta
      if (!finalUsuarioId) {
        const found = await findUsuarioIdByStripe(adminClient, { subscriptionId, customerId })
        finalUsuarioId = found.ok ? found.usuarioId : null
      }
      if (!finalUsuarioId) return jsonResponse(200, { ok: true })

      const statusPagamento = resolvePagamentoStatusFromStripeSubscription(obj)
      const venc = toIsoDateFromUnixSeconds(obj.current_period_end)

      await applyUsuarioPaymentUpdate(adminClient, finalUsuarioId, {
        plano: plano ?? undefined,
        limite_funcionarios: plano ? limiteFuncionarios : undefined,
        limite_agendamentos_mes: plano ? limiteAgendamentosMes : undefined,
        whatsapp_quota_mensal: plano ? whatsappQuotaMensal : undefined,
        status_pagamento: statusPagamento,
        data_vencimento: venc,
        ativo: statusPagamento === 'ativo' ? true : undefined,
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

  let payload: Payload
  try {
    payload = (await req.json()) as Payload
  } catch {
    return jsonResponse(400, { error: 'invalid_json' })
  }

  if (payload && (payload as Payload).action === 'create_booking_fee_checkout') {
    if (!bookingFeeEnabled) return jsonResponse(400, { error: 'feature_disabled' })
    const origin = cleanUrl(req.headers.get('origin') ?? '')
    const siteUrl = cleanUrl(Deno.env.get('SITE_URL') ?? Deno.env.get('APP_URL') ?? origin)
    if (!siteUrl) return jsonResponse(500, { error: 'missing_env', message: 'Defina SITE_URL/APP_URL para montar success_url.' })

    return await handlePublicBookingFeeCheckout({
      adminClient,
      stripeKey,
      siteUrl,
      payload: payload as Payload & { action: 'create_booking_fee_checkout' },
    })
  }

  if (payload && (payload as Payload).action === 'sync_booking_fee_session') {
    if (!bookingFeeEnabled) return jsonResponse(400, { error: 'feature_disabled' })
    const sessionId = String((payload as Payload & { action: 'sync_booking_fee_session' }).session_id ?? '').trim()
    if (!sessionId) return jsonResponse(400, { error: 'invalid_session_id' })
    const done = await finalizeBookingFeeFromStripeSession({ adminClient, stripeKey, sessionId })
    if (!done.ok) return jsonResponse(400, { error: done.error })
    return jsonResponse(200, { ok: true, agendamento_id: done.agendamentoId })
  }

  const userClient = createClient<LooseDatabase>(supabaseUrl, anonKey, {
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

  const action = payload ? String((payload as Payload).action ?? '').trim() : ''
  if (
    !action ||
    (action !== 'create_checkout' &&
      action !== 'sync_checkout_session' &&
      action !== 'create_billing_portal' &&
      action !== 'cancel_subscription' &&
      action !== 'pause_subscription' &&
      action !== 'grant_free_months' &&
      action !== 'admin_get_usuario_stripe_status')
  ) {
    return jsonResponse(400, {
      error: 'invalid_action',
      message: 'Ação inválida ou Edge Function payments desatualizada. Faça deploy da função no Supabase.',
      function_version: PAYMENTS_FUNCTION_VERSION,
      supported_actions: [
        'create_checkout',
        'sync_checkout_session',
        'create_billing_portal',
        'cancel_subscription',
        'pause_subscription',
        'grant_free_months',
        'admin_get_usuario_stripe_status',
        'create_booking_fee_checkout',
        'sync_booking_fee_session',
      ],
    })
  }

  if (payload.action === 'sync_checkout_session') {
    const sessionId = String(payload.session_id ?? '').trim()
    if (!sessionId) return jsonResponse(400, { error: 'invalid_session_id' })

    const usuarioIdFromPayload = normalizeUuid(payload.usuario_id)

    const callerId = userData.user.id
    const { data: saRow } = await userClient.from('super_admin').select('id').eq('id', callerId).maybeSingle()
    const isSuperAdmin = Boolean(saRow)

    const sessionRes = await stripeApiRequest(`/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription&expand[]=payment_intent`, {
      method: 'GET',
      key: stripeKey,
    })
    if (!sessionRes.ok || !sessionRes.body || typeof sessionRes.body !== 'object') {
      return jsonResponse(400, { error: 'stripe_error', message: 'Falha ao consultar checkout no Stripe.', stripe: sessionRes.body })
    }

    const session = sessionRes.body as Record<string, unknown>
    const metadata = (session.metadata ?? null) as Record<string, unknown> | null
    const usuarioIdFromMeta = normalizeUuid(metadata?.usuario_id)
    const usuarioIdFromClientRef = normalizeUuid(session.client_reference_id)
    const finalUsuarioId = usuarioIdFromPayload ?? usuarioIdFromMeta ?? usuarioIdFromClientRef
    if (!finalUsuarioId) return jsonResponse(400, { error: 'missing_usuario_id' })
    if (!isSuperAdmin && callerId !== finalUsuarioId) return jsonResponse(403, { error: 'forbidden' })

    const { item, plano } = resolvePlanoFromMetadata(metadata)

    const customerId = typeof session.customer === 'string' ? session.customer : null
    const subscriptionRaw = session.subscription
    const subscriptionId =
      typeof subscriptionRaw === 'string'
        ? subscriptionRaw
        : subscriptionRaw && typeof subscriptionRaw === 'object' && typeof (subscriptionRaw as Record<string, unknown>).id === 'string'
          ? String((subscriptionRaw as Record<string, unknown>).id)
          : null

    let statusPagamento: string | null = null
    let venc: string | null = null
    let dataPagamentoFatura: string | null = null
    let stripeLastInvoiceId: string | null = null

    const paymentStatus = resolvePaymentStatus(session.payment_status)
    const paymentIntentRaw = session.payment_intent
    const paymentIntent = paymentIntentRaw && typeof paymentIntentRaw === 'object' ? (paymentIntentRaw as Record<string, unknown>) : null
    const paymentIntentStatus = typeof paymentIntent?.status === 'string' ? paymentIntent.status.trim().toLowerCase() : ''
    const isPaymentIntentPaid = paymentIntentStatus === 'succeeded'

    const resolveInvoiceIdFromStripeObjects = () => {
      const sessionInvoice = typeof session.invoice === 'string' ? session.invoice.trim() : ''
      if (sessionInvoice) return sessionInvoice

      const subObj = subscriptionRaw && typeof subscriptionRaw === 'object' ? (subscriptionRaw as Record<string, unknown>) : null
      const subInvoice = subObj && typeof subObj.latest_invoice === 'string' ? String(subObj.latest_invoice).trim() : ''
      if (subInvoice) return subInvoice

      const piInvoice = paymentIntent && typeof paymentIntent.invoice === 'string' ? String(paymentIntent.invoice).trim() : ''
      if (piInvoice) return piInvoice

      const latestChargeRaw = paymentIntent?.latest_charge
      const latestCharge = latestChargeRaw && typeof latestChargeRaw === 'object' ? (latestChargeRaw as Record<string, unknown>) : null
      const chargeInvoice = latestCharge && typeof latestCharge.invoice === 'string' ? String(latestCharge.invoice).trim() : ''
      if (chargeInvoice) return chargeInvoice

      return null
    }

    const invoiceId = resolveInvoiceIdFromStripeObjects()
    if (invoiceId) {
      const invRes = await stripeApiRequest(`/invoices/${encodeURIComponent(invoiceId)}`, { method: 'GET', key: stripeKey })
      if (invRes.ok && invRes.body && typeof invRes.body === 'object') {
        const inv = invRes.body as Record<string, unknown>
        stripeLastInvoiceId = typeof inv.id === 'string' && inv.id.trim() ? inv.id.trim() : invoiceId
        const st = inv.status_transitions && typeof inv.status_transitions === 'object' ? (inv.status_transitions as Record<string, unknown>) : null
        const paidAt = st && (st.paid_at ?? null)
        const paidDate = toIsoDateFromUnixSeconds(paidAt)
        const createdDate = toIsoDateFromUnixSeconds(inv.created)
        dataPagamentoFatura = paidDate ?? createdDate
      }
    }

    if (!dataPagamentoFatura) {
      dataPagamentoFatura = toIsoDateFromUnixSeconds(paymentIntent?.created ?? session.created)
    }

    if (plano && subscriptionRaw && typeof subscriptionRaw === 'object') {
      const subObj = subscriptionRaw as Record<string, unknown>
      statusPagamento = resolvePagamentoStatusFromStripeSubscription(subObj)
      venc = toIsoDateFromIsoPlusDays(dataPagamentoFatura, 30) ?? toIsoDateFromUnixSeconds(subObj.current_period_end)
    } else if (plano && subscriptionId) {
      const subRes = await stripeApiRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'GET', key: stripeKey })
      if (subRes.ok && subRes.body && typeof subRes.body === 'object') {
        const sub = subRes.body as Record<string, unknown>
        statusPagamento = resolvePagamentoStatusFromStripeSubscription(sub)
        venc = toIsoDateFromIsoPlusDays(dataPagamentoFatura, 30) ?? toIsoDateFromUnixSeconds(sub.current_period_end)
      } else {
        statusPagamento = 'ativo'
      }
    } else if (plano && paymentStatus === 'paid') {
      statusPagamento = 'ativo'
      venc = toIsoDateFromIsoPlusDays(dataPagamentoFatura, 30) ?? toIsoDatePlusDays(30)
    } else if (plano && isPaymentIntentPaid) {
      statusPagamento = 'ativo'
      venc = toIsoDateFromIsoPlusDays(dataPagamentoFatura, 30) ?? toIsoDatePlusDays(30)
    }

    const nowIso = new Date().toISOString()

    const extraPriceId = (Deno.env.get('STRIPE_PRICE_FUNCIONARIO_ADICIONAL') ?? '').trim()
    const extraProductId = 'prod_Tik80yLbCUqUhZ'
    const limiteFuncionarios = resolveLimiteFuncionariosFromStripe({
      plano,
      metadata,
      subscription: subscriptionRaw && typeof subscriptionRaw === 'object' ? subscriptionRaw : null,
      extraPriceId: extraPriceId || undefined,
      extraProductId: extraProductId || undefined,
    })
    const limiteAgendamentosMes = resolveLimiteAgendamentosMesFromPlano(plano)
    const whatsappQuotaMensal = resolveWhatsappQuotaMensalFromPlano(plano)

    const persisted = await applyUsuarioPaymentUpdate(adminClient, finalUsuarioId, {
      plano: plano ?? undefined,
      limite_funcionarios: plano ? limiteFuncionarios : undefined,
      limite_agendamentos_mes: plano ? limiteAgendamentosMes : undefined,
      whatsapp_quota_mensal: plano ? whatsappQuotaMensal : undefined,
      status_pagamento: statusPagamento ?? undefined,
      data_vencimento: venc ?? undefined,
      data_pagamento_fatura: dataPagamentoFatura ?? undefined,
      stripe_last_invoice_id: stripeLastInvoiceId ?? undefined,
      ativo: statusPagamento === 'ativo' ? true : undefined,
      free_trial_consumido: plano ? true : undefined,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_checkout_session_id: sessionId,
      stripe_last_event_id: `sync_session:${sessionId}`,
      stripe_last_event_at: nowIso,
    })

    if (!persisted.ok) {
      return jsonResponse(400, { error: 'db_error', message: persisted.error })
    }

    return jsonResponse(200, { ok: true, usuario_id: finalUsuarioId, item, plano, status_pagamento: statusPagamento, data_vencimento: venc })
  }

  if (payload.action === 'create_billing_portal') {
    const usuarioId = normalizeUuid(payload.usuario_id)
    if (!usuarioId) return jsonResponse(400, { error: 'invalid_usuario_id' })

    const callerId = userData.user.id
    const { data: saRow } = await userClient.from('super_admin').select('id').eq('id', callerId).maybeSingle()
    const isSuperAdmin = Boolean(saRow)
    if (!isSuperAdmin && callerId !== usuarioId) {
      return jsonResponse(403, { error: 'forbidden' })
    }

    const { data: usuarioRow, error: usuarioErr } = await adminClient
      .from('usuarios')
      .select('stripe_customer_id,email,nome_negocio')
      .eq('id', usuarioId)
      .maybeSingle()
    if (usuarioErr) {
      return jsonResponse(400, { error: 'db_error', message: usuarioErr.message })
    }

    const nowIso = new Date().toISOString()
    const email = typeof (usuarioRow as Record<string, unknown> | null)?.email === 'string' ? String((usuarioRow as Record<string, unknown>).email).trim() : ''
    const nomeNegocio =
      typeof (usuarioRow as Record<string, unknown> | null)?.nome_negocio === 'string' ? String((usuarioRow as Record<string, unknown>).nome_negocio).trim() : ''

    const searchStripeCustomerByEmail = async () => {
      if (!email) return null
      const query = `email:'${email.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
      const res = await stripeApiRequest(`/customers/search?query=${encodeURIComponent(query)}&limit=5`, { method: 'GET', key: stripeKey })
      if (!res.ok || !res.body || typeof res.body !== 'object') return null
      const dataRaw = (res.body as Record<string, unknown>).data
      if (!Array.isArray(dataRaw) || dataRaw.length === 0) return null

      const candidates: Array<{ id: string; created: number; metaMatch: boolean }> = []
      for (const c of dataRaw) {
        if (!c || typeof c !== 'object') continue
        const row = c as Record<string, unknown>
        const id = typeof row.id === 'string' ? row.id.trim() : ''
        if (!id) continue
        const created = typeof row.created === 'number' && Number.isFinite(row.created) ? row.created : 0
        const metadata = row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : null
        const metaUsuarioId = normalizeUuid(metadata?.usuario_id)
        candidates.push({ id, created, metaMatch: Boolean(metaUsuarioId && metaUsuarioId === usuarioId) })
      }
      if (candidates.length === 0) return null

      candidates.sort((a, b) => {
        if (a.metaMatch !== b.metaMatch) return a.metaMatch ? -1 : 1
        if (b.created !== a.created) return b.created - a.created
        return a.id.localeCompare(b.id)
      })

      const fallback: string | null = candidates[0]?.id ?? null
      let bestWithSubscription: string | null = null
      for (const c of candidates.slice(0, 5)) {
        const invRes = await stripeApiRequest(`/invoices?customer=${encodeURIComponent(c.id)}&limit=1`, { method: 'GET', key: stripeKey })
        if (invRes.ok && invRes.body && typeof invRes.body === 'object') {
          const invData = (invRes.body as Record<string, unknown>).data
          if (Array.isArray(invData) && invData.length > 0) return c.id
        }

        const subRes = await stripeApiRequest(`/subscriptions?customer=${encodeURIComponent(c.id)}&status=all&limit=1`, { method: 'GET', key: stripeKey })
        if (subRes.ok && subRes.body && typeof subRes.body === 'object') {
          const subData = (subRes.body as Record<string, unknown>).data
          if (Array.isArray(subData) && subData.length > 0) {
            if (!bestWithSubscription) bestWithSubscription = c.id
            if (c.metaMatch) return c.id
          }
        }
      }

      return bestWithSubscription ?? fallback
    }

    const createStripeCustomer = async () => {
      const customerParams = new URLSearchParams()
      if (email) customerParams.set('email', email)
      if (nomeNegocio) customerParams.set('name', nomeNegocio)
      customerParams.set('metadata[usuario_id]', usuarioId)

      const customerRes = await stripeApiRequest('/customers', { method: 'POST', key: stripeKey, params: customerParams })
      if (!customerRes.ok || !customerRes.body || typeof customerRes.body !== 'object') {
        return { ok: false as const, status: customerRes.status, body: customerRes.body }
      }
      const id = typeof (customerRes.body as Record<string, unknown>).id === 'string' ? String((customerRes.body as Record<string, unknown>).id).trim() : ''
      if (!id) {
        return { ok: false as const, status: customerRes.status, body: customerRes.body }
      }

      const persisted = await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
        stripe_customer_id: id,
        stripe_last_event_id: `billing_portal:customer_created:${id}`,
        stripe_last_event_at: nowIso,
      })
      if (!persisted.ok) {
        return { ok: false as const, status: 400, body: { error: 'db_error', message: persisted.error } }
      }

      return { ok: true as const, id }
    }

    let customerId = typeof (usuarioRow as Record<string, unknown> | null)?.stripe_customer_id === 'string' ? String((usuarioRow as Record<string, unknown>).stripe_customer_id).trim() : ''
    if (!customerId) {
      const found = await searchStripeCustomerByEmail()
      if (found) {
        const persisted = await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
          stripe_customer_id: found,
          stripe_last_event_id: `billing_portal:customer_found:${found}`,
          stripe_last_event_at: nowIso,
        })
        if (persisted.ok) customerId = found
      }
    }
    if (!customerId) {
      const created = await createStripeCustomer()
      if (!created.ok) {
        return jsonResponse(400, {
          error: 'stripe_error',
          message: 'Falha ao criar o cliente no Stripe para abrir o portal.',
          stripe_status: created.status,
          stripe_key_mode: stripeKeyMode,
          stripe: created.body,
        })
      }
      customerId = created.id
    }

    const origin = cleanUrl(req.headers.get('origin') ?? '')
    const siteUrl = cleanUrl(Deno.env.get('SITE_URL') ?? Deno.env.get('APP_URL') ?? origin)
    if (!siteUrl) {
      return jsonResponse(500, { error: 'missing_env', message: 'Defina SITE_URL/APP_URL para montar return_url.' })
    }

    const params = new URLSearchParams()
    params.set('customer', customerId)
    params.set('return_url', `${siteUrl}/pagamento`)

    const portalConfig = cleanEnvValue(Deno.env.get('STRIPE_BILLING_PORTAL_CONFIGURATION') ?? '')
    if (portalConfig) params.set('configuration', portalConfig)

    const portalRes = await stripeApiRequest('/billing_portal/sessions', { method: 'POST', key: stripeKey, params })
    if (!portalRes.ok || !portalRes.body || typeof portalRes.body !== 'object') {
      if (stripeCustomerNotFound(portalRes.body)) {
        const created = await createStripeCustomer()
        if (!created.ok) {
          return jsonResponse(400, {
            error: 'stripe_error',
            message: 'Falha ao recriar o cliente no Stripe para abrir o portal.',
            stripe_status: created.status,
            stripe_key_mode: stripeKeyMode,
            stripe: created.body,
          })
        }

        const retryParams = new URLSearchParams()
        retryParams.set('customer', created.id)
        retryParams.set('return_url', `${siteUrl}/pagamento`)
        if (portalConfig) retryParams.set('configuration', portalConfig)
        const retryRes = await stripeApiRequest('/billing_portal/sessions', { method: 'POST', key: stripeKey, params: retryParams })
        if (!retryRes.ok || !retryRes.body || typeof retryRes.body !== 'object') {
          const stripeMessage = stripeMessageFromBody(retryRes.body)
          return jsonResponse(400, {
            error: 'stripe_error',
            message: stripeMessage ? `Falha ao abrir o portal do Stripe: ${stripeMessage}` : 'Falha ao abrir o portal do Stripe.',
            stripe_status: retryRes.status,
            stripe_key_mode: stripeKeyMode,
            stripe: retryRes.body,
          })
        }

        const url = typeof (retryRes.body as Record<string, unknown>).url === 'string' ? String((retryRes.body as Record<string, unknown>).url) : ''
        if (!url.trim()) {
          return jsonResponse(400, {
            error: 'stripe_error',
            message: 'Stripe não retornou a URL do portal.',
            stripe_status: retryRes.status,
            stripe_key_mode: stripeKeyMode,
            stripe: retryRes.body,
          })
        }
        return jsonResponse(200, { ok: true, url })
      }

      const stripeMessage = stripeMessageFromBody(portalRes.body)
      return jsonResponse(400, {
        error: 'stripe_error',
        message: stripeMessage ? `Falha ao abrir o portal do Stripe: ${stripeMessage}` : 'Falha ao abrir o portal do Stripe.',
        stripe_status: portalRes.status,
        stripe_key_mode: stripeKeyMode,
        stripe: portalRes.body,
      })
    }

    const url = typeof (portalRes.body as Record<string, unknown>).url === 'string' ? String((portalRes.body as Record<string, unknown>).url) : ''
    if (!url.trim()) {
      return jsonResponse(400, {
        error: 'stripe_error',
        message: 'Stripe não retornou a URL do portal.',
        stripe_status: portalRes.status,
        stripe_key_mode: stripeKeyMode,
        stripe: portalRes.body,
      })
    }

    return jsonResponse(200, { ok: true, url })
  }

  if (payload.action === 'admin_get_usuario_stripe_status') {
    const usuarioId = normalizeUuid(payload.usuario_id)
    if (!usuarioId) return jsonResponse(400, { error: 'invalid_usuario_id' })

    const callerId = userData.user.id
    const { data: saRow } = await userClient.from('super_admin').select('id').eq('id', callerId).maybeSingle()
    const isSuperAdmin = Boolean(saRow)
    if (!isSuperAdmin && callerId !== usuarioId) return jsonResponse(403, { error: 'forbidden' })

    const { data: usuarioRow, error: usuarioErr } = await adminClient
      .from('usuarios')
      .select('email,plano,status_pagamento,data_vencimento,data_pagamento_fatura,stripe_last_invoice_id,stripe_customer_id,stripe_subscription_id')
      .eq('id', usuarioId)
      .maybeSingle()
    if (usuarioErr || !usuarioRow) return jsonResponse(404, { error: 'usuario_not_found' })

    const email = typeof (usuarioRow as Record<string, unknown> | null)?.email === 'string' ? String((usuarioRow as Record<string, unknown>).email).trim() : ''
    const dbPlano = typeof (usuarioRow as Record<string, unknown> | null)?.plano === 'string' ? String((usuarioRow as Record<string, unknown>).plano).trim() : ''
    const dbStatus =
      typeof (usuarioRow as Record<string, unknown> | null)?.status_pagamento === 'string'
        ? String((usuarioRow as Record<string, unknown>).status_pagamento).trim()
        : ''
    const dbVenc =
      typeof (usuarioRow as Record<string, unknown> | null)?.data_vencimento === 'string'
        ? String((usuarioRow as Record<string, unknown>).data_vencimento).trim()
        : null

    const dbPagamentoFatura =
      typeof (usuarioRow as Record<string, unknown> | null)?.data_pagamento_fatura === 'string'
        ? String((usuarioRow as Record<string, unknown>).data_pagamento_fatura).trim()
        : null
    const dbLastInvoiceId =
      typeof (usuarioRow as Record<string, unknown> | null)?.stripe_last_invoice_id === 'string'
        ? String((usuarioRow as Record<string, unknown>).stripe_last_invoice_id).trim()
        : null

    const productIdToPlano: Record<string, string> = {
      prod_Tik9tEMnGcTjdq: 'basic',
      prod_Tik8lu4o69znQA: 'pro',
      prod_Tik9hxnnoWGI6a: 'enterprise',
    }

    const searchStripeCustomerByEmail = async () => {
      if (!email) return null
      const query = `email:'${email.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
      const res = await stripeApiRequest(`/customers/search?query=${encodeURIComponent(query)}&limit=5`, { method: 'GET', key: stripeKey })
      if (!res.ok || !res.body || typeof res.body !== 'object') return null
      const dataRaw = (res.body as Record<string, unknown>).data
      if (!Array.isArray(dataRaw) || dataRaw.length === 0) return null
      const row = dataRaw[0]
      if (!row || typeof row !== 'object') return null
      const id = typeof (row as Record<string, unknown>).id === 'string' ? String((row as Record<string, unknown>).id).trim() : ''
      return id || null
    }

    const resolveStripeCustomerId = async () => {
      const fromDb =
        typeof (usuarioRow as Record<string, unknown> | null)?.stripe_customer_id === 'string'
          ? String((usuarioRow as Record<string, unknown>).stripe_customer_id).trim()
          : ''
      if (fromDb) return fromDb
      const found = await searchStripeCustomerByEmail()
      return found
    }

    const stripeSubscriptionId =
      typeof (usuarioRow as Record<string, unknown> | null)?.stripe_subscription_id === 'string'
        ? String((usuarioRow as Record<string, unknown>).stripe_subscription_id).trim()
        : ''

    const tryResolvePlanoFromSubscription = (subscription: Record<string, unknown>) => {
      const meta = subscription.metadata && typeof subscription.metadata === 'object' ? (subscription.metadata as Record<string, unknown>) : null
      const { plano } = resolvePlanoFromMetadata(meta)
      if (plano) return plano

      const items = subscription.items && typeof subscription.items === 'object' ? (subscription.items as Record<string, unknown>) : null
      const data = items?.data
      if (!Array.isArray(data)) return null
      for (const it of data) {
        if (!it || typeof it !== 'object') continue
        const priceRaw = (it as Record<string, unknown>).price
        const priceObj = priceRaw && typeof priceRaw === 'object' ? (priceRaw as Record<string, unknown>) : null
        const productRaw = priceObj?.product
        const productObj = productRaw && typeof productRaw === 'object' ? (productRaw as Record<string, unknown>) : null
        const productId = typeof productRaw === 'string' ? productRaw : typeof productObj?.id === 'string' ? String(productObj.id) : ''
        if (!productId) continue
        const mapped = productIdToPlano[productId]
        if (mapped) return mapped
      }
      return null
    }

    const nowIso = new Date().toISOString()

    if (stripeSubscriptionId) {
      const subRes = await stripeApiRequest(`/subscriptions/${encodeURIComponent(stripeSubscriptionId)}?expand[]=items.data.price.product`, {
        method: 'GET',
        key: stripeKey,
      })
      if (subRes.ok && subRes.body && typeof subRes.body === 'object') {
        const sub = subRes.body as Record<string, unknown>
        const plano = tryResolvePlanoFromSubscription(sub) ?? dbPlano
        const statusPagamento = resolvePagamentoStatusFromStripeSubscription(sub)
        const invoiceRaw = sub.latest_invoice
        const invoiceObj = invoiceRaw && typeof invoiceRaw === 'object' ? (invoiceRaw as Record<string, unknown>) : null
        const invoiceId = typeof invoiceRaw === 'string' ? invoiceRaw.trim() : typeof invoiceObj?.id === 'string' ? String(invoiceObj.id).trim() : ''
        let pagamentoFatura = dbPagamentoFatura
        let venc = toIsoDateFromIsoPlusDays(pagamentoFatura, 30) ?? toIsoDateFromUnixSeconds(sub.current_period_end)

        if (invoiceId) {
          const invRes = await stripeApiRequest(`/invoices/${encodeURIComponent(invoiceId)}`, { method: 'GET', key: stripeKey })
          if (invRes.ok && invRes.body && typeof invRes.body === 'object') {
            const inv = invRes.body as Record<string, unknown>
            const st = inv.status_transitions && typeof inv.status_transitions === 'object' ? (inv.status_transitions as Record<string, unknown>) : null
            const paidAt = st && (st.paid_at ?? null)
            pagamentoFatura = toIsoDateFromUnixSeconds(paidAt) ?? toIsoDateFromUnixSeconds(inv.created) ?? pagamentoFatura
            const vencFromCompra = toIsoDateFromIsoPlusDays(pagamentoFatura, 30)
            if (vencFromCompra) venc = vencFromCompra

            const shouldPersistInvoice = Boolean(
              (pagamentoFatura && pagamentoFatura !== dbPagamentoFatura) || (invoiceId && invoiceId !== dbLastInvoiceId)
            )
            if (shouldPersistInvoice) {
              await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
                data_pagamento_fatura: pagamentoFatura ?? undefined,
                stripe_last_invoice_id: invoiceId ?? undefined,
                data_vencimento: venc ?? undefined,
              })
            }
          }
        }

        await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
          plano: plano || undefined,
          status_pagamento: statusPagamento,
          data_vencimento: venc ?? dbVenc ?? undefined,
          ativo: statusPagamento === 'ativo' ? true : undefined,
          stripe_customer_id: (await resolveStripeCustomerId()) ?? undefined,
          stripe_subscription_id: stripeSubscriptionId,
          free_trial_consumido: plano ? true : undefined,
          stripe_last_event_id: `get_usuario_stripe_status:subscription_id:${stripeSubscriptionId}`,
          stripe_last_event_at: nowIso,
        })
        const cancelAtPeriodEnd = sub.cancel_at_period_end === true
        return jsonResponse(200, {
          ok: true,
          usuario_id: usuarioId,
          source: 'subscription_id',
          stripe_subscription_id: stripeSubscriptionId,
          plano,
          status_pagamento: statusPagamento,
          data_vencimento: venc ?? dbVenc,
          data_pagamento_fatura: pagamentoFatura,
          cancel_at_period_end: cancelAtPeriodEnd,
        })
      }
    }

    const customerId = await resolveStripeCustomerId()
    if (customerId) {
      const listRes = await stripeApiRequest(
        `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=1&expand[]=data.items.data.price.product`,
        { method: 'GET', key: stripeKey }
      )
      if (listRes.ok && listRes.body && typeof listRes.body === 'object') {
        const dataRaw = (listRes.body as Record<string, unknown>).data
        const first = Array.isArray(dataRaw) && dataRaw[0] && typeof dataRaw[0] === 'object' ? (dataRaw[0] as Record<string, unknown>) : null
        if (first) {
          const sid = typeof first.id === 'string' ? first.id.trim() : ''
          const plano = tryResolvePlanoFromSubscription(first) ?? dbPlano
          const statusPagamento = resolvePagamentoStatusFromStripeSubscription(first)
          const venc = toIsoDateFromUnixSeconds(first.current_period_end)
          const cancelAtPeriodEnd = first.cancel_at_period_end === true

          await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
            plano: plano || undefined,
            status_pagamento: statusPagamento,
            data_vencimento: venc ?? dbVenc ?? undefined,
            ativo: statusPagamento === 'ativo' ? true : undefined,
            stripe_customer_id: customerId,
            stripe_subscription_id: sid || undefined,
            free_trial_consumido: plano ? true : undefined,
            stripe_last_event_id: `get_usuario_stripe_status:customer_id:${customerId}`,
            stripe_last_event_at: nowIso,
          })
          return jsonResponse(200, {
            ok: true,
            usuario_id: usuarioId,
            source: 'customer_id',
            stripe_customer_id: customerId,
            stripe_subscription_id: sid || null,
            plano,
            status_pagamento: statusPagamento,
            data_vencimento: venc ?? dbVenc,
            cancel_at_period_end: cancelAtPeriodEnd,
          })
        }
      }

      const invRes = await stripeApiRequest(`/invoices?customer=${encodeURIComponent(customerId)}&limit=1`, { method: 'GET', key: stripeKey })
      if (invRes.ok && invRes.body && typeof invRes.body === 'object') {
        const invData = (invRes.body as Record<string, unknown>).data
        const inv = Array.isArray(invData) && invData[0] && typeof invData[0] === 'object' ? (invData[0] as Record<string, unknown>) : null
        if (inv) {
          const paid = inv.paid === true || String(inv.status ?? '').trim().toLowerCase() === 'paid'
          const st = inv.status_transitions && typeof inv.status_transitions === 'object' ? (inv.status_transitions as Record<string, unknown>) : null
          const paidAt = st && (st.paid_at ?? null)
          const invoiceId = typeof inv.id === 'string' ? inv.id.trim() : ''
          let pagamentoFatura = toIsoDateFromUnixSeconds(paidAt) ?? toIsoDateFromUnixSeconds(inv.created) ?? dbPagamentoFatura
          let vencFromCompra = toIsoDateFromIsoPlusDays(pagamentoFatura, 30)

          let planoFromStripe = dbPlano
          if (invoiceId) {
            const invFullRes = await stripeApiRequest(`/invoices/${encodeURIComponent(invoiceId)}?expand[]=lines.data.price.product`, {
              method: 'GET',
              key: stripeKey,
            })
            if (invFullRes.ok && invFullRes.body && typeof invFullRes.body === 'object') {
              const invFull = invFullRes.body as Record<string, unknown>
              const invMeta = invFull.metadata && typeof invFull.metadata === 'object' ? (invFull.metadata as Record<string, unknown>) : null
              const { plano } = resolvePlanoFromMetadata(invMeta)
              if (plano) planoFromStripe = plano

              const st2 = invFull.status_transitions && typeof invFull.status_transitions === 'object' ? (invFull.status_transitions as Record<string, unknown>) : null
              const paidAt2 = st2 && (st2.paid_at ?? null)
              pagamentoFatura = toIsoDateFromUnixSeconds(paidAt2) ?? toIsoDateFromUnixSeconds(invFull.created) ?? pagamentoFatura
              vencFromCompra = toIsoDateFromIsoPlusDays(pagamentoFatura, 30) ?? vencFromCompra
            }
          }

          const shouldPersist = Boolean(
            (pagamentoFatura && pagamentoFatura !== dbPagamentoFatura) || (invoiceId && invoiceId !== dbLastInvoiceId) || (vencFromCompra && vencFromCompra !== dbVenc)
          )
          if (shouldPersist) {
            await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
              data_pagamento_fatura: pagamentoFatura ?? undefined,
              stripe_last_invoice_id: invoiceId || undefined,
              data_vencimento: vencFromCompra ?? undefined,
            })
          }

          if (paid) {
            await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
              plano: planoFromStripe || undefined,
              status_pagamento: 'ativo',
              data_vencimento: vencFromCompra ?? dbVenc ?? undefined,
              ativo: true,
              stripe_customer_id: customerId,
              free_trial_consumido: planoFromStripe ? true : undefined,
              stripe_last_event_id: `get_usuario_stripe_status:invoice:${invoiceId || 'latest'}`,
              stripe_last_event_at: nowIso,
            })
          }
          return jsonResponse(200, {
            ok: true,
            usuario_id: usuarioId,
            source: 'invoice',
            stripe_customer_id: customerId,
            plano: planoFromStripe,
            status_pagamento: paid ? 'ativo' : dbStatus,
            data_vencimento: vencFromCompra ?? dbVenc,
            data_pagamento_fatura: pagamentoFatura,
          })
        }
      }
    }

    return jsonResponse(200, {
      ok: true,
      usuario_id: usuarioId,
      source: 'db',
      plano: dbPlano,
      status_pagamento: dbStatus,
      data_vencimento: dbVenc,
      data_pagamento_fatura: dbPagamentoFatura,
    })
  }

  if (payload.action === 'cancel_subscription') {
    const usuarioId = normalizeUuid(payload.usuario_id)
    if (!usuarioId) return jsonResponse(400, { error: 'invalid_usuario_id' })

    const callerId = userData.user.id
    const { data: saRow } = await userClient.from('super_admin').select('id').eq('id', callerId).maybeSingle()
    const isSuperAdmin = Boolean(saRow)
    if (!isSuperAdmin && callerId !== usuarioId) return jsonResponse(403, { error: 'forbidden' })

    const { data: usuarioRow, error: usuarioErr } = await adminClient
      .from('usuarios')
      .select('stripe_subscription_id,stripe_customer_id,email')
      .eq('id', usuarioId)
      .maybeSingle()
    if (usuarioErr || !usuarioRow) return jsonResponse(404, { error: 'usuario_not_found' })

    const dbSubId = typeof (usuarioRow as Record<string, unknown>).stripe_subscription_id === 'string' ? String((usuarioRow as Record<string, unknown>).stripe_subscription_id).trim() : ''
    const dbCustomerId = typeof (usuarioRow as Record<string, unknown>).stripe_customer_id === 'string' ? String((usuarioRow as Record<string, unknown>).stripe_customer_id).trim() : ''
    const email = typeof (usuarioRow as Record<string, unknown>).email === 'string' ? String((usuarioRow as Record<string, unknown>).email).trim() : ''

    const isMissingStripeSubscription = (body: unknown) => {
      if (!body || typeof body !== 'object') return false
      const obj = body as Record<string, unknown>
      const err = obj.error
      if (!err || typeof err !== 'object') return false
      const e = err as Record<string, unknown>
      const msg = typeof e.message === 'string' ? e.message.trim().toLowerCase() : ''
      const code = typeof e.code === 'string' ? e.code.trim().toLowerCase() : ''
      const param = typeof e.param === 'string' ? e.param.trim().toLowerCase() : ''
      if (msg.includes('no such subscription')) return true
      if (code === 'resource_missing' && (param === 'id' || param === 'subscription')) return true
      return false
    }

    const pickSubscriptionIdFromList = (body: unknown) => {
      if (!body || typeof body !== 'object') return null
      const dataRaw = (body as Record<string, unknown>).data
      if (!Array.isArray(dataRaw) || dataRaw.length === 0) return null
      const candidates = dataRaw
        .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : null))
        .filter(Boolean) as Record<string, unknown>[]
      if (candidates.length === 0) return null
      const preferredStatuses = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete'])
      const preferred = candidates.find((s) => preferredStatuses.has(String(s.status ?? '').trim().toLowerCase()))
      const chosen = preferred ?? candidates[0]
      const sid = typeof chosen.id === 'string' ? chosen.id.trim() : ''
      if (!sid) return null
      const customerId = typeof chosen.customer === 'string' ? chosen.customer.trim() : ''
      return { sid, customerId: customerId || null }
    }

    const resolveSubscriptionForUsuario = async () => {
      if (dbSubId) {
        const checkRes = await stripeApiRequest(`/subscriptions/${encodeURIComponent(dbSubId)}`, { method: 'GET', key: stripeKey })
        if (checkRes.ok && checkRes.body && typeof checkRes.body === 'object') {
          const sub = checkRes.body as Record<string, unknown>
          const customerId = typeof sub.customer === 'string' ? sub.customer.trim() : ''
          return { sid: dbSubId, customerId: customerId || (dbCustomerId || null) }
        }
        if (!isMissingStripeSubscription(checkRes.body)) {
          return { sid: dbSubId, customerId: dbCustomerId || null }
        }
      }

      if (dbCustomerId) {
        const listRes = await stripeApiRequest(`/subscriptions?customer=${encodeURIComponent(dbCustomerId)}&status=all&limit=10`, { method: 'GET', key: stripeKey })
        if (listRes.ok) {
          const picked = pickSubscriptionIdFromList(listRes.body)
          if (picked) return { sid: picked.sid, customerId: picked.customerId ?? dbCustomerId }
        }
      }

      if (email) {
        const query = `email:'${email.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
        const custRes = await stripeApiRequest(`/customers/search?query=${encodeURIComponent(query)}&limit=5`, { method: 'GET', key: stripeKey })
        if (custRes.ok && custRes.body && typeof custRes.body === 'object') {
          const dataRaw = (custRes.body as Record<string, unknown>).data
          const list = Array.isArray(dataRaw) ? dataRaw : []
          const candidates = list
            .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>) : null))
            .filter(Boolean) as Record<string, unknown>[]
          const sorted = candidates
            .map((c) => {
              const id = typeof c.id === 'string' ? c.id.trim() : ''
              const created = typeof c.created === 'number' && Number.isFinite(c.created) ? c.created : 0
              const metadata = c.metadata && typeof c.metadata === 'object' ? (c.metadata as Record<string, unknown>) : null
              const metaUsuarioId = normalizeUuid(metadata?.usuario_id)
              return { id, created, metaMatch: Boolean(metaUsuarioId && metaUsuarioId === usuarioId) }
            })
            .filter((c) => Boolean(c.id))
            .sort((a, b) => {
              if (a.metaMatch !== b.metaMatch) return a.metaMatch ? -1 : 1
              return b.created - a.created
            })

          for (const c of sorted) {
            const listRes = await stripeApiRequest(`/subscriptions?customer=${encodeURIComponent(c.id)}&status=all&limit=10`, { method: 'GET', key: stripeKey })
            if (!listRes.ok) continue
            const picked = pickSubscriptionIdFromList(listRes.body)
            if (picked) return { sid: picked.sid, customerId: picked.customerId ?? c.id }
          }
        }
      }

      return null
    }

    const resolved = await resolveSubscriptionForUsuario()
    const subId = resolved?.sid ?? ''
    const resolvedCustomerId = resolved?.customerId ?? null
    if (!subId) return jsonResponse(400, { error: 'missing_subscription', message: 'Não foi possível localizar uma assinatura no Stripe para este cliente.' })

    if (subId !== dbSubId || (resolvedCustomerId && resolvedCustomerId !== dbCustomerId)) {
      const nowIso = new Date().toISOString()
      await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
        stripe_subscription_id: subId,
        stripe_customer_id: resolvedCustomerId ?? undefined,
        stripe_last_event_id: `resolve_subscription:${subId}`,
        stripe_last_event_at: nowIso,
      })
    }

    const immediate = payload.immediate === null || payload.immediate === undefined ? true : Boolean(payload.immediate)

    const cancelRes = immediate
      ? await stripeApiRequest(`/subscriptions/${encodeURIComponent(subId)}`, { method: 'DELETE', key: stripeKey })
      : await stripeApiRequest(`/subscriptions/${encodeURIComponent(subId)}`, {
          method: 'POST',
          key: stripeKey,
          params: (() => {
            const p = new URLSearchParams()
            p.set('cancel_at_period_end', 'true')
            return p
          })(),
        })
    if (!cancelRes.ok || !cancelRes.body || typeof cancelRes.body !== 'object') {
      const msg = stripeMessageFromBody(cancelRes.body)
      return jsonResponse(400, {
        error: 'stripe_error',
        message: msg ? `Falha ao cancelar assinatura no Stripe: ${msg}` : 'Falha ao cancelar assinatura no Stripe.',
        stripe_status: cancelRes.status,
        stripe_key_mode: stripeKeyMode,
        stripe: cancelRes.body,
      })
    }

    const sub = cancelRes.body as Record<string, unknown>
    const statusPagamento = mapStripeSubscriptionToPagamentoStatus(sub.status)
    const venc = toIsoDateFromUnixSeconds(sub.current_period_end)
    const nowIso = new Date().toISOString()

    await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
      status_pagamento: statusPagamento,
      data_vencimento: venc ?? undefined,
      stripe_last_event_id: `cancel_subscription:${subId}`,
      stripe_last_event_at: nowIso,
    })

    return jsonResponse(200, {
      ok: true,
      usuario_id: usuarioId,
      stripe_subscription_id: subId,
      immediate,
      status_pagamento: statusPagamento,
      data_vencimento: venc,
      cancel_at_period_end: sub.cancel_at_period_end === true,
    })
  }

  if (payload.action === 'pause_subscription') {
    const usuarioId = normalizeUuid(payload.usuario_id)
    if (!usuarioId) return jsonResponse(400, { error: 'invalid_usuario_id' })

    const callerId = userData.user.id
    const { data: saRow } = await userClient.from('super_admin').select('id').eq('id', callerId).maybeSingle()
    const isSuperAdmin = Boolean(saRow)
    if (!isSuperAdmin && callerId !== usuarioId) return jsonResponse(403, { error: 'forbidden' })

    const { data: usuarioRow, error: usuarioErr } = await adminClient
      .from('usuarios')
      .select('stripe_subscription_id,status_pagamento')
      .eq('id', usuarioId)
      .maybeSingle()
    if (usuarioErr || !usuarioRow) return jsonResponse(404, { error: 'usuario_not_found' })

    const subId =
      typeof (usuarioRow as Record<string, unknown> | null)?.stripe_subscription_id === 'string'
        ? String((usuarioRow as Record<string, unknown>).stripe_subscription_id).trim()
        : ''
    if (!subId) {
      return jsonResponse(400, { error: 'missing_subscription', message: 'Cliente não tem stripe_subscription_id salvo.' })
    }

    const behaviorRaw = (payload as Payload & { action: 'pause_subscription' }).behavior
    const behavior = behaviorRaw === 'keep_as_draft' || behaviorRaw === 'mark_uncollectible' || behaviorRaw === 'void' ? behaviorRaw : 'void'
    const resumesAtRaw = (payload as Payload & { action: 'pause_subscription' }).resumes_at
    const resumesAt = typeof resumesAtRaw === 'number' && Number.isFinite(resumesAtRaw) && resumesAtRaw > 0 ? Math.floor(resumesAtRaw) : null

    const params = new URLSearchParams()
    params.set('pause_collection[behavior]', behavior)
    if (resumesAt) params.set('pause_collection[resumes_at]', String(resumesAt))

    const pauseRes = await stripeApiRequest(`/subscriptions/${encodeURIComponent(subId)}`, {
      method: 'POST',
      key: stripeKey,
      params,
    })
    if (!pauseRes.ok || !pauseRes.body || typeof pauseRes.body !== 'object') {
      const msg = stripeMessageFromBody(pauseRes.body)
      return jsonResponse(400, {
        error: 'stripe_error',
        message: msg ? `Falha ao pausar assinatura no Stripe: ${msg}` : 'Falha ao pausar assinatura no Stripe.',
        stripe_status: pauseRes.status,
        stripe_key_mode: stripeKeyMode,
        stripe: pauseRes.body,
      })
    }

    const sub = pauseRes.body as Record<string, unknown>
    const statusPagamento = resolvePagamentoStatusFromStripeSubscription(sub)
    const nowIso = new Date().toISOString()

    await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
      status_pagamento: statusPagamento,
      stripe_last_event_id: `pause_subscription:${subId}`,
      stripe_last_event_at: nowIso,
    })

    return jsonResponse(200, {
      ok: true,
      usuario_id: usuarioId,
      stripe_subscription_id: subId,
      behavior,
      resumes_at: resumesAt,
      status_pagamento: statusPagamento,
      pause_collection: sub.pause_collection,
    })
  }

  if (payload.action === 'grant_free_months') {
    const usuarioId = normalizeUuid(payload.usuario_id)
    if (!usuarioId) return jsonResponse(400, { error: 'invalid_usuario_id', message: 'usuario_id inválido.' })

    const discountInputFromPayload =
      typeof (payload as Payload & { action: 'grant_free_months' }).coupon_id === 'string'
        ? String((payload as Payload & { action: 'grant_free_months' }).coupon_id).trim()
        : ''
    const discountInputRaw = discountInputFromPayload ? cleanStripeDiscountInput(discountInputFromPayload) : ''
    const discountInput = discountInputRaw && /^[A-Za-z0-9_-]{3,64}$/.test(discountInputRaw) ? discountInputRaw : ''

    const monthsParsed = parsePositiveInt((payload as Payload & { action: 'grant_free_months' }).months)
    const months = monthsParsed ? clampInt(monthsParsed, 1, 24) : null
    if (!discountInput && !months) return jsonResponse(400, { error: 'invalid_input', message: 'Informe months (1–24) ou um cupom/promoção.' })

    const callerId = userData.user.id
    const { data: saRow } = await userClient.from('super_admin').select('id').eq('id', callerId).maybeSingle()
    const isSuperAdmin = Boolean(saRow)
    if (!isSuperAdmin) return jsonResponse(403, { error: 'forbidden', message: 'Ação permitida apenas para Super Admin.' })

    const { data: usuarioRow, error: usuarioErr } = await adminClient
      .from('usuarios')
      .select('stripe_subscription_id,stripe_customer_id,email,status_pagamento,data_vencimento,ativo')
      .eq('id', usuarioId)
      .maybeSingle()
    if (usuarioErr || !usuarioRow) return jsonResponse(404, { error: 'usuario_not_found' })

    const dbSubId = typeof (usuarioRow as Record<string, unknown>).stripe_subscription_id === 'string' ? String((usuarioRow as Record<string, unknown>).stripe_subscription_id).trim() : ''
    const dbCustomerId = typeof (usuarioRow as Record<string, unknown>).stripe_customer_id === 'string' ? String((usuarioRow as Record<string, unknown>).stripe_customer_id).trim() : ''
    const email = typeof (usuarioRow as Record<string, unknown>).email === 'string' ? String((usuarioRow as Record<string, unknown>).email).trim() : ''
    const dbStatusPagamento = typeof (usuarioRow as Record<string, unknown>).status_pagamento === 'string' ? String((usuarioRow as Record<string, unknown>).status_pagamento).trim() : ''

    const isMissingStripeSubscription = (body: unknown) => {
      if (!body || typeof body !== 'object') return false
      const obj = body as Record<string, unknown>
      const err = obj.error
      if (!err || typeof err !== 'object') return false
      const e = err as Record<string, unknown>
      const msg = typeof e.message === 'string' ? e.message.trim().toLowerCase() : ''
      const code = typeof e.code === 'string' ? e.code.trim().toLowerCase() : ''
      const param = typeof e.param === 'string' ? e.param.trim().toLowerCase() : ''
      if (msg.includes('no such subscription')) return true
      if (code === 'resource_missing' && (param === 'id' || param === 'subscription')) return true
      return false
    }

    const pickSubscriptionIdFromList = (body: unknown) => {
      if (!body || typeof body !== 'object') return null
      const dataRaw = (body as Record<string, unknown>).data
      if (!Array.isArray(dataRaw) || dataRaw.length === 0) return null
      const candidates = dataRaw
        .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : null))
        .filter(Boolean) as Record<string, unknown>[]
      if (candidates.length === 0) return null
      const preferredStatuses = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete'])
      const preferred = candidates.find((s) => preferredStatuses.has(String(s.status ?? '').trim().toLowerCase()))
      const chosen = preferred ?? candidates[0]
      const sid = typeof chosen.id === 'string' ? chosen.id.trim() : ''
      if (!sid) return null
      const customerId = typeof chosen.customer === 'string' ? chosen.customer.trim() : ''
      return { sid, customerId: customerId || null }
    }

    const resolveSubscriptionForUsuario = async () => {
      if (dbSubId) {
        const checkRes = await stripeApiRequest(`/subscriptions/${encodeURIComponent(dbSubId)}`, { method: 'GET', key: stripeKey })
        if (checkRes.ok && checkRes.body && typeof checkRes.body === 'object') {
          const sub = checkRes.body as Record<string, unknown>
          const customerId = typeof sub.customer === 'string' ? sub.customer.trim() : ''
          return { sid: dbSubId, customerId: customerId || (dbCustomerId || null) }
        }
        if (!isMissingStripeSubscription(checkRes.body)) {
          return { sid: dbSubId, customerId: dbCustomerId || null }
        }
      }

      if (dbCustomerId) {
        const listRes = await stripeApiRequest(`/subscriptions?customer=${encodeURIComponent(dbCustomerId)}&status=all&limit=10`, { method: 'GET', key: stripeKey })
        if (listRes.ok) {
          const picked = pickSubscriptionIdFromList(listRes.body)
          if (picked) return { sid: picked.sid, customerId: picked.customerId ?? dbCustomerId }
        }
      }

      if (email) {
        const query = `email:'${email.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
        const custRes = await stripeApiRequest(`/customers/search?query=${encodeURIComponent(query)}&limit=5`, { method: 'GET', key: stripeKey })
        if (custRes.ok && custRes.body && typeof custRes.body === 'object') {
          const dataRaw = (custRes.body as Record<string, unknown>).data
          const list = Array.isArray(dataRaw) ? dataRaw : []
          const candidates = list
            .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>) : null))
            .filter(Boolean) as Record<string, unknown>[]
          const sorted = candidates
            .map((c) => {
              const id = typeof c.id === 'string' ? c.id.trim() : ''
              const created = typeof c.created === 'number' && Number.isFinite(c.created) ? c.created : 0
              const metadata = c.metadata && typeof c.metadata === 'object' ? (c.metadata as Record<string, unknown>) : null
              const metaUsuarioId = normalizeUuid(metadata?.usuario_id)
              return { id, created, metaMatch: Boolean(metaUsuarioId && metaUsuarioId === usuarioId) }
            })
            .filter((c) => Boolean(c.id))
            .sort((a, b) => {
              if (a.metaMatch !== b.metaMatch) return a.metaMatch ? -1 : 1
              return b.created - a.created
            })

          for (const c of sorted) {
            const listRes = await stripeApiRequest(`/subscriptions?customer=${encodeURIComponent(c.id)}&status=all&limit=10`, { method: 'GET', key: stripeKey })
            if (!listRes.ok) continue
            const picked = pickSubscriptionIdFromList(listRes.body)
            if (picked) return { sid: picked.sid, customerId: picked.customerId ?? c.id }
          }
        }
      }

      return null
    }

    const resolved = await resolveSubscriptionForUsuario()
    const subId = resolved?.sid ?? ''
    const resolvedCustomerId = resolved?.customerId ?? null

    if (!subId) {
      if (discountInput) {
        return jsonResponse(400, {
          error: 'missing_subscription',
          message: 'Sem assinatura no Stripe. Para estender o período via banco, informe apenas meses (1–24).',
        })
      }
      if (!months) {
        return jsonResponse(400, { error: 'invalid_input', message: 'Sem assinatura no Stripe. Informe months (1–24) para estender o período.' })
      }

      const currentVenc = typeof (usuarioRow as Record<string, unknown>).data_vencimento === 'string' ? String((usuarioRow as Record<string, unknown>).data_vencimento).trim() : ''
      const todayIso = new Date().toISOString().slice(0, 10)
      const baseIso = (() => {
        const baseDate = currentVenc ? new Date(`${currentVenc}T00:00:00`) : null
        const today = new Date(`${todayIso}T00:00:00`)
        if (baseDate && Number.isFinite(baseDate.getTime()) && baseDate >= today) return currentVenc
        return todayIso
      })()
      const newVenc = addMonthsToIsoDate(baseIso, months)
      if (!newVenc) return jsonResponse(400, { error: 'invalid_date', message: 'Não foi possível calcular nova data de vencimento.' })

      const statusToPersist = dbStatusPagamento && dbStatusPagamento !== 'cancelado' ? dbStatusPagamento : 'trial'
      const nowIso = new Date().toISOString()
      const upd = await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
        status_pagamento: statusToPersist,
        data_vencimento: newVenc,
        ativo: true,
        stripe_last_event_id: `extend_period_db:${usuarioId}:${months}`,
        stripe_last_event_at: nowIso,
      })
      if (!upd.ok) return jsonResponse(500, { error: 'db_error', message: 'Falha ao atualizar usuário no banco.' })

      return jsonResponse(200, {
        ok: true,
        usuario_id: usuarioId,
        mode: 'db_extension',
        months,
        data_vencimento: newVenc,
        status_pagamento: statusToPersist,
      })
    }

    if (subId !== dbSubId || (resolvedCustomerId && resolvedCustomerId !== dbCustomerId)) {
      const nowIso = new Date().toISOString()
      await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
        stripe_subscription_id: subId,
        stripe_customer_id: resolvedCustomerId ?? undefined,
        stripe_last_event_id: `resolve_subscription:${subId}`,
        stripe_last_event_at: nowIso,
      })
    }

    let resolvedDiscount: ResolvedStripeDiscount | null = null
    if (discountInput) {
      resolvedDiscount = await resolveStripeDiscount(discountInput, stripeKey)
      if (!resolvedDiscount) {
        return jsonResponse(400, {
          error: 'invalid_coupon',
          message: `Cupom/promoção não encontrado ou inválido no Stripe: ${discountInput}`,
          stripe_key_mode: stripeKeyMode,
        })
      }
    }

    let finalDiscount: ResolvedStripeDiscount | null = resolvedDiscount
    if (!finalDiscount) {
      const couponParams = new URLSearchParams()
      couponParams.set('percent_off', '100')
      couponParams.set('duration', 'repeating')
      couponParams.set('duration_in_months', String(months))
      couponParams.set('max_redemptions', '1')
      couponParams.set('name', `SMagenda ${months} meses grátis`)
      couponParams.set('metadata[usuario_id]', usuarioId)
      couponParams.set('metadata[kind]', 'free_months')

      const couponRes = await stripeApiRequest('/coupons', { method: 'POST', key: stripeKey, params: couponParams })
      if (!couponRes.ok || !couponRes.body || typeof couponRes.body !== 'object') {
        const msg = stripeMessageFromBody(couponRes.body)
        return jsonResponse(400, {
          error: 'stripe_error',
          message: msg ? `Falha ao criar cupom no Stripe: ${msg}` : 'Falha ao criar cupom no Stripe.',
          stripe_status: couponRes.status,
          stripe_key_mode: stripeKeyMode,
          stripe: couponRes.body,
        })
      }

      const createdCouponId = typeof (couponRes.body as Record<string, unknown>).id === 'string' ? String((couponRes.body as Record<string, unknown>).id).trim() : ''
      if (!createdCouponId) {
        return jsonResponse(400, {
          error: 'stripe_error',
          message: 'Stripe não retornou id do cupom.',
          stripe_status: couponRes.status,
          stripe_key_mode: stripeKeyMode,
          stripe: couponRes.body,
        })
      }

      finalDiscount = { kind: 'coupon', id: createdCouponId }
    }

    if (!finalDiscount) {
      return jsonResponse(400, { error: 'invalid_input', message: 'Informe months (1–24) ou um cupom/promoção.' })
    }

    const ensuredDiscount = finalDiscount

    const parseStripeSubItems = (subscription: Record<string, unknown>) => {
      const itemsRaw = subscription.items && typeof subscription.items === 'object' ? (subscription.items as Record<string, unknown>) : null
      const data = itemsRaw?.data
      if (!Array.isArray(data)) return []
      const out: Array<{ priceId: string; quantity: number }> = []
      for (const it of data) {
        if (!it || typeof it !== 'object') continue
        const row = it as Record<string, unknown>
        const qty = parsePositiveInt(row.quantity) ?? 1
        const priceRaw = row.price
        const priceObj = priceRaw && typeof priceRaw === 'object' ? (priceRaw as Record<string, unknown>) : null
        const priceId = typeof priceRaw === 'string' ? priceRaw.trim() : typeof priceObj?.id === 'string' ? String(priceObj.id).trim() : ''
        if (!priceId) continue
        out.push({ priceId, quantity: qty })
      }
      return out
    }

    const stripeSubStatus = (subscription: Record<string, unknown> | null) => {
      if (!subscription) return ''
      return typeof subscription.status === 'string' ? subscription.status.trim().toLowerCase() : ''
    }

    const isSubscriptionNotUpdatable = (body: unknown) => {
      const msg = stripeMessageFromBody(body)
      if (!msg) return false
      const lower = msg.trim().toLowerCase()
      return lower.includes('a canceled subscription can only update')
    }

    const applyDiscountToSubscription = async (discount: ResolvedStripeDiscount, subscriptionId: string) => {
      const subParams = new URLSearchParams()
      if (discount.kind === 'promotion_code') subParams.set('discounts[0][promotion_code]', discount.id)
      else subParams.set('discounts[0][coupon]', discount.id)
      return stripeApiRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'POST', key: stripeKey, params: subParams })
    }

    const createSubscriptionFromExisting = async (input: { customerId: string; items: Array<{ priceId: string; quantity: number }>; discount: ResolvedStripeDiscount }) => {
      const params = new URLSearchParams()
      params.set('customer', input.customerId)
      params.set('metadata[usuario_id]', usuarioId)
      input.items.forEach((it, i) => {
        params.set(`items[${i}][price]`, it.priceId)
        params.set(`items[${i}][quantity]`, String(it.quantity))
      })
      if (input.discount.kind === 'promotion_code') params.set('discounts[0][promotion_code]', input.discount.id)
      else params.set('discounts[0][coupon]', input.discount.id)
      return stripeApiRequest('/subscriptions', { method: 'POST', key: stripeKey, params })
    }

    const fetchSubscription = async (subscriptionId: string) => {
      const res = await stripeApiRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=items.data.price.product`, {
        method: 'GET',
        key: stripeKey,
      })
      if (!res.ok || !res.body || typeof res.body !== 'object') return { ok: false as const, status: res.status, body: res.body }
      return { ok: true as const, sub: res.body as Record<string, unknown> }
    }

    let effectiveSubId = subId

    const initialFetch = await fetchSubscription(effectiveSubId)
    const initialSub = initialFetch.ok ? initialFetch.sub : null
    const initialCustomerId =
      (initialSub && typeof initialSub.customer === 'string' ? initialSub.customer.trim() : '') || (resolvedCustomerId ?? dbCustomerId)

    if (initialSub && (stripeSubStatus(initialSub) === 'canceled' || stripeSubStatus(initialSub) === 'incomplete_expired')) {
      const items = parseStripeSubItems(initialSub)
      if (!initialCustomerId || items.length === 0) {
        return jsonResponse(400, {
          error: 'stripe_error',
          message: 'Assinatura cancelada no Stripe e não foi possível recriar (itens/customer ausentes).',
          stripe_key_mode: stripeKeyMode,
        })
      }
      const createdRes = await createSubscriptionFromExisting({ customerId: initialCustomerId, items, discount: ensuredDiscount })
      if (!createdRes.ok || !createdRes.body || typeof createdRes.body !== 'object') {
        const msg = stripeMessageFromBody(createdRes.body)
        return jsonResponse(400, {
          error: 'stripe_error',
          message: msg ? `Falha ao recriar assinatura no Stripe: ${msg}` : 'Falha ao recriar assinatura no Stripe.',
          stripe_status: createdRes.status,
          stripe_key_mode: stripeKeyMode,
          stripe: createdRes.body,
        })
      }
      const createdSub = createdRes.body as Record<string, unknown>
      const newId = typeof createdSub.id === 'string' ? createdSub.id.trim() : ''
      if (!newId) {
        return jsonResponse(400, {
          error: 'stripe_error',
          message: 'Stripe não retornou id da nova assinatura.',
          stripe_status: createdRes.status,
          stripe_key_mode: stripeKeyMode,
          stripe: createdRes.body,
        })
      }
      effectiveSubId = newId

      const statusPagamento = resolvePagamentoStatusFromStripeSubscription(createdSub)
      const venc = toIsoDateFromUnixSeconds(createdSub.current_period_end)
      const nowIso = new Date().toISOString()
      await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
        status_pagamento: statusPagamento,
        data_vencimento: venc ?? undefined,
        ativo: statusPagamento === 'ativo' ? true : undefined,
        stripe_customer_id: initialCustomerId || undefined,
        stripe_subscription_id: effectiveSubId,
        stripe_last_event_id: `grant_free_months:recreate:${effectiveSubId}:${ensuredDiscount.kind}:${ensuredDiscount.id}`,
        stripe_last_event_at: nowIso,
      })

      return jsonResponse(200, {
        ok: true,
        usuario_id: usuarioId,
        stripe_subscription_id: effectiveSubId,
        months,
        discount: ensuredDiscount,
        status_pagamento: statusPagamento,
        data_vencimento: venc,
        stripe_discount: createdSub.discount,
        recreated_subscription: true,
      })
    }

    let appliedDiscount = ensuredDiscount
    let subRes = await applyDiscountToSubscription(appliedDiscount, effectiveSubId)
    if ((!subRes.ok || !subRes.body || typeof subRes.body !== 'object') && appliedDiscount.kind === 'promotion_code' && appliedDiscount.coupon_id) {
      const fallbackDiscount: ResolvedStripeDiscount = { kind: 'coupon', id: appliedDiscount.coupon_id }
      const subRes2 = await applyDiscountToSubscription(fallbackDiscount, effectiveSubId)
      if (subRes2.ok && subRes2.body && typeof subRes2.body === 'object') {
        appliedDiscount = fallbackDiscount
        subRes = subRes2
      }
    }

    if ((!subRes.ok || !subRes.body || typeof subRes.body !== 'object') && isSubscriptionNotUpdatable(subRes.body)) {
      const fetched = await fetchSubscription(effectiveSubId)
      const subNow = fetched.ok ? fetched.sub : null
      const customerIdNow =
        (subNow && typeof subNow.customer === 'string' ? subNow.customer.trim() : '') || (resolvedCustomerId ?? dbCustomerId)
      if (subNow && (stripeSubStatus(subNow) === 'canceled' || stripeSubStatus(subNow) === 'incomplete_expired')) {
        const items = parseStripeSubItems(subNow)
        if (!customerIdNow || items.length === 0) {
          return jsonResponse(400, {
            error: 'stripe_error',
            message: 'Assinatura cancelada no Stripe e não foi possível recriar (itens/customer ausentes).',
            stripe_key_mode: stripeKeyMode,
          })
        }
        const createdRes = await createSubscriptionFromExisting({ customerId: customerIdNow, items, discount: appliedDiscount })
        if (!createdRes.ok || !createdRes.body || typeof createdRes.body !== 'object') {
          const msg = stripeMessageFromBody(createdRes.body)
          return jsonResponse(400, {
            error: 'stripe_error',
            message: msg ? `Falha ao recriar assinatura no Stripe: ${msg}` : 'Falha ao recriar assinatura no Stripe.',
            stripe_status: createdRes.status,
            stripe_key_mode: stripeKeyMode,
            stripe: createdRes.body,
          })
        }
        const createdSub = createdRes.body as Record<string, unknown>
        const newId = typeof createdSub.id === 'string' ? createdSub.id.trim() : ''
        if (!newId) {
          return jsonResponse(400, {
            error: 'stripe_error',
            message: 'Stripe não retornou id da nova assinatura.',
            stripe_status: createdRes.status,
            stripe_key_mode: stripeKeyMode,
            stripe: createdRes.body,
          })
        }
        effectiveSubId = newId

        const statusPagamento = resolvePagamentoStatusFromStripeSubscription(createdSub)
        const venc = toIsoDateFromUnixSeconds(createdSub.current_period_end)
        const nowIso = new Date().toISOString()
        await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
          status_pagamento: statusPagamento,
          data_vencimento: venc ?? undefined,
          ativo: statusPagamento === 'ativo' ? true : undefined,
          stripe_customer_id: customerIdNow || undefined,
          stripe_subscription_id: effectiveSubId,
          stripe_last_event_id: `grant_free_months:recreate:${effectiveSubId}:${appliedDiscount.kind}:${appliedDiscount.id}`,
          stripe_last_event_at: nowIso,
        })

        return jsonResponse(200, {
          ok: true,
          usuario_id: usuarioId,
          stripe_subscription_id: effectiveSubId,
          months,
          discount: appliedDiscount,
          status_pagamento: statusPagamento,
          data_vencimento: venc,
          stripe_discount: createdSub.discount,
          recreated_subscription: true,
        })
      }
    }

    if (!subRes.ok || !subRes.body || typeof subRes.body !== 'object') {
      const msg = stripeMessageFromBody(subRes.body)
      const appliedLabel = appliedDiscount.kind === 'promotion_code' ? `promotion_code=${appliedDiscount.id}` : `coupon=${appliedDiscount.id}`
      return jsonResponse(400, {
        error: 'stripe_error',
        message: msg ? `Falha ao aplicar desconto no Stripe (${appliedLabel}): ${msg}` : `Falha ao aplicar desconto no Stripe (${appliedLabel}).`,
        stripe_status: subRes.status,
        stripe_key_mode: stripeKeyMode,
        stripe: subRes.body,
      })
    }

    const sub = subRes.body as Record<string, unknown>
    const statusPagamento = resolvePagamentoStatusFromStripeSubscription(sub)
    const venc = toIsoDateFromUnixSeconds(sub.current_period_end)
    const nowIso = new Date().toISOString()

    await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
      status_pagamento: statusPagamento,
      data_vencimento: venc ?? undefined,
      ativo: statusPagamento === 'ativo' ? true : undefined,
      stripe_subscription_id: effectiveSubId,
      stripe_last_event_id: `grant_free_months:${effectiveSubId}:${appliedDiscount.kind}:${appliedDiscount.id}`,
      stripe_last_event_at: nowIso,
    })

    return jsonResponse(200, {
      ok: true,
      usuario_id: usuarioId,
      stripe_subscription_id: effectiveSubId,
      months,
      discount: appliedDiscount,
      status_pagamento: statusPagamento,
      data_vencimento: venc,
      stripe_discount: sub.discount,
    })
  }

  if (payload.action !== 'create_checkout') {
    return jsonResponse(400, {
      error: 'invalid_action',
      message: 'Ação inválida ou Edge Function payments desatualizada. Faça deploy da função no Supabase.',
      function_version: PAYMENTS_FUNCTION_VERSION,
    })
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

  const planKeys = new Set(['basic', 'pro', 'enterprise'])
  const serviceKeys = new Set(['setup_completo', 'consultoria_hora'])
  if (!planKeys.has(item) && !serviceKeys.has(item)) {
    return jsonResponse(400, { error: 'invalid_plano', message: `Item inválido: ${item}.` })
  }

  const productIdMap: Record<string, string> = {
    basic: 'prod_Tik9tEMnGcTjdq',
    pro: 'prod_Tik8lu4o69znQA',
    enterprise: 'prod_Tik9hxnnoWGI6a',
    consultoria_hora: 'prod_TikBiK2IspRhUo',
    setup_completo: 'prod_TikBQXciLFeI6O',
  }

  const productId = productIdMap[item] ?? null
  if (!productId) {
    return jsonResponse(400, {
      error: 'missing_product',
      message: `Produto não configurado para item ${item}.`,
    })
  }

  const productRes = await stripeApiRequest(`/products/${encodeURIComponent(productId)}`, { method: 'GET', key: stripeKey })
  if (!productRes.ok || !productRes.body || typeof productRes.body !== 'object') {
    const stripeMessage = (() => {
      if (!productRes.body || typeof productRes.body !== 'object') return null
      const body = productRes.body as Record<string, unknown>
      const err = body.error
      if (!err || typeof err !== 'object') return null
      const msg = (err as Record<string, unknown>).message
      return typeof msg === 'string' && msg.trim() ? msg.trim() : null
    })()
    return jsonResponse(400, {
      error: 'stripe_error',
      message: stripeMessage
        ? `Falha ao consultar produto no Stripe (item=${item}, product=${productId}): ${stripeMessage}`
        : `Falha ao consultar produto no Stripe (item=${item}, product=${productId}).`,
      stripe_status: productRes.status,
      stripe_key_mode: stripeKeyMode,
      stripe: productRes.body,
    })
  }

  const product = productRes.body as Record<string, unknown>
  if (product.active !== true) {
    return jsonResponse(400, { error: 'inactive_product', message: `Produto inativo no Stripe (item=${item}, product=${productId}).` })
  }
  const dp = product.default_price
  const price = typeof dp === 'string' ? dp : dp && typeof dp === 'object' && typeof (dp as Record<string, unknown>).id === 'string' ? String((dp as Record<string, unknown>).id) : null
  if (!price) {
    return jsonResponse(400, { error: 'missing_price', message: `Produto sem default_price no Stripe (item=${item}, product=${productId}).` })
  }

  const origin = cleanUrl(req.headers.get('origin') ?? '')
  const siteUrl = cleanUrl(Deno.env.get('SITE_URL') ?? Deno.env.get('APP_URL') ?? origin)
  if (!siteUrl) {
    return jsonResponse(500, { error: 'missing_env', message: 'Defina SITE_URL/APP_URL para montar success_url.' })
  }

  const { data: usuarioRow, error: usuarioErr } = await adminClient
    .from('usuarios')
    .select('id,email,nome_negocio,stripe_customer_id')
    .eq('id', usuarioId)
    .maybeSingle()
  if (usuarioErr || !usuarioRow) {
    return jsonResponse(404, { error: 'usuario_not_found' })
  }

  const nowIso = new Date().toISOString()
  const email = typeof (usuarioRow as Record<string, unknown> | null)?.email === 'string' ? String((usuarioRow as Record<string, unknown>).email).trim() : ''
  const nomeNegocio =
    typeof (usuarioRow as Record<string, unknown> | null)?.nome_negocio === 'string' ? String((usuarioRow as Record<string, unknown>).nome_negocio).trim() : ''

  const searchStripeCustomerByEmail = async () => {
    if (!email) return null
    const query = `email:'${email.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
    const res = await stripeApiRequest(`/customers/search?query=${encodeURIComponent(query)}&limit=5`, { method: 'GET', key: stripeKey })
    if (!res.ok || !res.body || typeof res.body !== 'object') return null
    const dataRaw = (res.body as Record<string, unknown>).data
    if (!Array.isArray(dataRaw) || dataRaw.length === 0) return null

    const candidates: Array<{ id: string; created: number; metaMatch: boolean }> = []
    for (const c of dataRaw) {
      if (!c || typeof c !== 'object') continue
      const row = c as Record<string, unknown>
      const id = typeof row.id === 'string' ? row.id.trim() : ''
      if (!id) continue
      const created = typeof row.created === 'number' && Number.isFinite(row.created) ? row.created : 0
      const metadata = row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : null
      const metaUsuarioId = normalizeUuid(metadata?.usuario_id)
      candidates.push({ id, created, metaMatch: Boolean(metaUsuarioId && metaUsuarioId === usuarioId) })
    }
    if (candidates.length === 0) return null

    candidates.sort((a, b) => {
      if (a.metaMatch !== b.metaMatch) return a.metaMatch ? -1 : 1
      if (b.created !== a.created) return b.created - a.created
      return a.id.localeCompare(b.id)
    })

    const fallback: string | null = candidates[0]?.id ?? null
    let bestWithSubscription: string | null = null
    for (const c of candidates.slice(0, 5)) {
      const invRes = await stripeApiRequest(`/invoices?customer=${encodeURIComponent(c.id)}&limit=1`, { method: 'GET', key: stripeKey })
      if (invRes.ok && invRes.body && typeof invRes.body === 'object') {
        const invData = (invRes.body as Record<string, unknown>).data
        if (Array.isArray(invData) && invData.length > 0) return c.id
      }

      const subRes = await stripeApiRequest(`/subscriptions?customer=${encodeURIComponent(c.id)}&status=all&limit=1`, { method: 'GET', key: stripeKey })
      if (subRes.ok && subRes.body && typeof subRes.body === 'object') {
        const subData = (subRes.body as Record<string, unknown>).data
        if (Array.isArray(subData) && subData.length > 0) {
          if (!bestWithSubscription) bestWithSubscription = c.id
          if (c.metaMatch) return c.id
        }
      }
    }

    return bestWithSubscription ?? fallback
  }

  const createStripeCustomer = async () => {
    const customerParams = new URLSearchParams()
    if (email) customerParams.set('email', email)
    if (nomeNegocio) customerParams.set('name', nomeNegocio)
    customerParams.set('metadata[usuario_id]', usuarioId)

    const customerRes = await stripeApiRequest('/customers', { method: 'POST', key: stripeKey, params: customerParams })
    if (!customerRes.ok || !customerRes.body || typeof customerRes.body !== 'object') {
      return { ok: false as const, status: customerRes.status, body: customerRes.body }
    }
    const id = typeof (customerRes.body as Record<string, unknown>).id === 'string' ? String((customerRes.body as Record<string, unknown>).id).trim() : ''
    if (!id) {
      return { ok: false as const, status: customerRes.status, body: customerRes.body }
    }

    const persisted = await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
      stripe_customer_id: id,
      stripe_last_event_id: `checkout:customer_created:${id}`,
      stripe_last_event_at: nowIso,
    })
    if (!persisted.ok) {
      return { ok: false as const, status: 400, body: { error: 'db_error', message: persisted.error } }
    }

    return { ok: true as const, id }
  }

  let customerId =
    typeof (usuarioRow as Record<string, unknown> | null)?.stripe_customer_id === 'string' ? String((usuarioRow as Record<string, unknown>).stripe_customer_id).trim() : ''
  if (!customerId) {
    const found = await searchStripeCustomerByEmail()
    if (found) {
      const persisted = await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
        stripe_customer_id: found,
        stripe_last_event_id: `checkout:customer_found:${found}`,
        stripe_last_event_at: nowIso,
      })
      if (persisted.ok) customerId = found
    }
  }
  if (!customerId) {
    const created = await createStripeCustomer()
    if (!created.ok) {
      return jsonResponse(400, {
        error: 'stripe_error',
        message: 'Falha ao criar o cliente no Stripe para iniciar o checkout.',
        stripe_status: created.status,
        stripe_key_mode: stripeKeyMode,
        stripe: created.body,
      })
    }
    customerId = created.id
  }

  const rawMetodo = (payload.metodo ?? null) as unknown
  const metodo = rawMetodo === 'pix' ? 'pix' : 'card'
  const isPlan = planKeys.has(item)
  const mode = isPlan && metodo !== 'pix' ? 'subscription' : 'payment'

  const includedPro = 4
  const maxPro = 6
  let funcionariosTotal = 1
  if (item === 'pro') {
    const parsed = parsePositiveInt((payload as Record<string, unknown> | null)?.funcionarios_total)
    if (!parsed) {
      funcionariosTotal = includedPro
    } else if (parsed > maxPro) {
      return jsonResponse(400, { error: 'invalid_funcionarios_total', message: 'Para mais de 6 profissionais, use o plano EMPRESA.' })
    } else {
      funcionariosTotal = clampInt(parsed, includedPro, maxPro)
    }
  }
  const extraQty = item === 'pro' ? Math.max(0, funcionariosTotal - includedPro) : 0

  const successUrl = `${siteUrl}/pagamento?checkout=success&usuario_id=${encodeURIComponent(usuarioId)}&item=${encodeURIComponent(item)}&plano=${encodeURIComponent(item)}&session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl = `${siteUrl}/pagamento?checkout=cancel&usuario_id=${encodeURIComponent(usuarioId)}&item=${encodeURIComponent(item)}&plano=${encodeURIComponent(item)}`

  const params = new URLSearchParams()
  params.set('mode', mode)
  params.set('success_url', successUrl)
  params.set('cancel_url', cancelUrl)
  params.set('client_reference_id', usuarioId)
  params.set('customer', customerId)
  params.set('metadata[usuario_id]', usuarioId)
  params.set('metadata[item]', item)
  params.set('metadata[plano]', item)
  params.set('metadata[metodo]', metodo)
  params.set('metadata[billing_mode]', mode)
  params.set('metadata[created_by]', isSuperAdmin ? 'super_admin' : 'usuario')
  params.set('metadata[funcionarios_total]', String(funcionariosTotal))
  if (mode === 'subscription') {
    params.set('subscription_data[metadata][usuario_id]', usuarioId)
    params.set('subscription_data[metadata][item]', item)
    params.set('subscription_data[metadata][plano]', item)
    params.set('subscription_data[metadata][metodo]', metodo)
    params.set('subscription_data[metadata][funcionarios_total]', String(funcionariosTotal))
  }

  const validatePriceForProduct = async (
    candidatePriceId: string,
    expectedProductId: string,
    expectedMode: 'subscription' | 'payment'
  ) => {
    const id = (candidatePriceId ?? '').trim()
    if (!id) return false
    const res = await stripeApiRequest(`/prices/${encodeURIComponent(id)}?expand[]=product`, { method: 'GET', key: stripeKey })
    if (!res.ok || !res.body || typeof res.body !== 'object') return false
    const priceObj = res.body as Record<string, unknown>
    if (priceObj.active !== true) return false
    if (expectedMode === 'subscription' && priceObj.type !== 'recurring') return false
    if (expectedMode === 'payment' && priceObj.type !== 'one_time') return false
    const productRaw = priceObj.product
    const productObj = productRaw && typeof productRaw === 'object' ? (productRaw as Record<string, unknown>) : null
    const pid = typeof productRaw === 'string' ? productRaw : typeof productObj?.id === 'string' ? String(productObj.id) : ''
    if (!pid || pid !== expectedProductId) return false
    if (!productObj || productObj.active !== true) return false
    return true
  }

  let finalPrice: string | null = null
  const expectedType = mode === 'subscription' ? 'recurring' : 'one_time'

  if (metodo === 'pix' && isPlan) {
    const envKey = `STRIPE_PRICE_${item.toUpperCase()}_PIX`
    const altEnvKey = item === 'enterprise' ? 'STRIPE_PRICE_EMPRESA_PIX' : null
    const fromEnv = ((Deno.env.get(envKey) ?? '').trim() || (altEnvKey ? (Deno.env.get(altEnvKey) ?? '').trim() : '')).trim()

    if (fromEnv) {
      const ok = await validatePriceForProduct(fromEnv, productId, 'payment')
      if (!ok) {
        return jsonResponse(400, {
          error: 'invalid_price',
          message: `O Price informado em ${envKey} não está ativo, não é one-time, ou não pertence ao produto ${productId}.`,
        })
      }
      finalPrice = fromEnv
    } else {
      const resolved = await resolveActivePriceIdForProduct({
        productId,
        key: stripeKey,
        expectedMode: 'payment',
        currency: 'brl',
      })
      if (resolved) {
        finalPrice = resolved
      } else {
        return jsonResponse(400, {
          error: 'missing_env',
          message:
            item === 'enterprise'
              ? `Não encontrei um Price one-time (BRL) ativo no Stripe para o produto ${productId}. Crie um Price one-time no Stripe ou configure ${envKey} (ou ${altEnvKey}).`
              : `Não encontrei um Price one-time (BRL) ativo no Stripe para o produto ${productId}. Crie um Price one-time no Stripe ou configure ${envKey}.`,
        })
      }
    }
  } else {
    const envKey = `STRIPE_PRICE_${item.toUpperCase()}`
    const altEnvKey = item === 'enterprise' ? 'STRIPE_PRICE_EMPRESA' : null
    const fromEnv = ((Deno.env.get(envKey) ?? '').trim() || (altEnvKey ? (Deno.env.get(altEnvKey) ?? '').trim() : '')).trim()

    if (fromEnv) {
      const ok = await validatePriceForProduct(fromEnv, productId, mode)
      if (ok) finalPrice = fromEnv
    }

    if (!finalPrice) {
      const defaultOk = await validatePriceForProduct(price, productId, mode)
      if (defaultOk) {
        finalPrice = price
      } else {
        const resolved = await resolveActivePriceIdForProduct({
          productId,
          key: stripeKey,
          expectedMode: mode,
          currency: 'brl',
        })
        if (resolved) {
          finalPrice = resolved
        } else {
          return jsonResponse(400, {
            error: 'invalid_default_price',
            message: `default_price inválido para o modo ${mode} (esperado ${expectedType}) (item=${item}, product=${productId}, price=${price}).`,
          })
        }
      }
    }
  }

  if (!finalPrice) {
    return jsonResponse(400, { error: 'missing_price', message: `Não foi possível resolver um Price para item=${item}.` })
  }

  params.set('payment_method_types[0]', metodo)
  params.set('line_items[0][price]', finalPrice)
  params.set('line_items[0][quantity]', '1')

  if (item === 'pro' && extraQty > 0) {
    const extraProductId = 'prod_Tik80yLbCUqUhZ'
    const extraPriceEnvKey = mode === 'subscription' ? 'STRIPE_PRICE_FUNCIONARIO_ADICIONAL' : 'STRIPE_PRICE_FUNCIONARIO_ADICIONAL_PIX'
    let extraPrice = (Deno.env.get(extraPriceEnvKey) ?? '').trim()
    if (!extraPrice) {
      const resolved = await resolveActivePriceIdForProduct({
        productId: extraProductId,
        key: stripeKey,
        expectedMode: mode,
        currency: 'brl',
      })
      if (resolved) extraPrice = resolved
    }

    if (!extraPrice) {
      return jsonResponse(400, {
        error: 'missing_env',
        message: `Não encontrei um Price ativo (BRL) para o produto ${extraProductId}. Configure ${extraPriceEnvKey} com um Price no Stripe.`,
      })
    }

    const ok = await validatePriceForProduct(extraPrice, extraProductId, mode)
    if (!ok) {
      const expectedType = mode === 'subscription' ? 'recurring' : 'one_time'
      return jsonResponse(400, {
        error: 'invalid_price',
        message: `O Price informado em ${extraPriceEnvKey} não está ativo, não é ${expectedType}, ou não pertence ao produto ${extraProductId}.`,
      })
    }
    params.set('line_items[1][price]', extraPrice)
    params.set('line_items[1][quantity]', String(extraQty))
  }

  if (mode === 'payment') {
    params.set('invoice_creation[enabled]', 'true')
    params.set('invoice_creation[invoice_data][metadata][usuario_id]', usuarioId)
    params.set('invoice_creation[invoice_data][metadata][item]', item)
    params.set('invoice_creation[invoice_data][metadata][plano]', item)
    params.set('invoice_creation[invoice_data][metadata][metodo]', metodo)
    if (email) params.set('payment_intent_data[receipt_email]', email)
  }

  let res = await stripeRequest(params, stripeKey)
  if (!res.ok && stripeCustomerNotFound(res.body)) {
    const created = await createStripeCustomer()
    if (!created.ok) {
      return jsonResponse(400, {
        error: 'stripe_error',
        message: 'Falha ao recriar o cliente no Stripe para iniciar o checkout.',
        stripe_status: created.status,
        stripe_key_mode: stripeKeyMode,
        stripe: created.body,
      })
    }
    params.set('customer', created.id)
    res = await stripeRequest(params, stripeKey)
  }
  if (!res.ok) {
    const msg = stripeMessageFromBody(res.body)
    return jsonResponse(400, { error: 'stripe_error', message: msg ?? 'Falha ao criar checkout.', stripe: res.body })
  }

  const body = (res.body ?? null) as unknown
  const url = typeof (body as Record<string, unknown> | null)?.url === 'string' ? String((body as Record<string, unknown>).url) : null
  if (!url) return jsonResponse(400, { error: 'missing_url' })

  return jsonResponse(200, { url })
})
