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
  | { action: 'grant_free_months'; usuario_id: string; months?: number | null }
  | { action: 'admin_get_usuario_status'; usuario_id: string }
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

const PAYMENTS_FUNCTION_VERSION = '2026-02-23-no-automatic-payment'

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

function parsePositiveInt(value: unknown) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isFinite(n)) return null
  const i = Math.floor(n)
  return i > 0 ? i : null
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function addMonthsToIsoDate(iso: string, months: number) {
  const [yyyy, mm, dd] = iso.split('-')
  if (!yyyy || !mm || !dd) return null
  const base = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  if (!Number.isFinite(base.getTime())) return null
  const target = new Date(base)
  target.setMonth(target.getMonth() + months)
  if (!Number.isFinite(target.getTime())) return null
  const outY = target.getFullYear()
  const outM = String(target.getMonth() + 1).padStart(2, '0')
  const outD = String(target.getDate()).padStart(2, '0')
  return `${outY}-${outM}-${outD}`
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
    data_pagamento_fatura?: string | null
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
  if (typeof update.status_pagamento === 'string' && update.status_pagamento.trim()) payload.status_pagamento = update.status_pagamento.trim().toLowerCase()
  if (update.status_pagamento === null) payload.status_pagamento = null
  if (typeof update.data_vencimento === 'string' && update.data_vencimento.trim()) payload.data_vencimento = update.data_vencimento.trim()
  if (update.data_vencimento === null) payload.data_vencimento = null
  if (typeof update.data_pagamento_fatura === 'string' && update.data_pagamento_fatura.trim()) payload.data_pagamento_fatura = update.data_pagamento_fatura.trim()
  if (update.data_pagamento_fatura === null) payload.data_pagamento_fatura = null
  if (update.free_trial_consumido === true) payload.free_trial_consumido = true
  if (update.free_trial_consumido === false) payload.free_trial_consumido = false
  if (update.ativo === true) payload.ativo = true
  if (update.ativo === false) payload.ativo = false

  if (Object.keys(payload).length === 0) return { ok: true as const }

  const { error } = await adminClient.from('usuarios').update(payload).eq('id', usuarioId)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse(200, { ok: true })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' })

  const supabaseUrl = String(Deno.env.get('SUPABASE_URL') ?? '').trim()
  const anonKey = String(Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim()
  const serviceRoleKey = String(Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, { error: 'missing_env' })
  }

  let payload: Payload
  try {
    payload = (await req.json()) as Payload
  } catch {
    return jsonResponse(400, { error: 'invalid_json' })
  }

  if (payload && (payload as Payload).action === 'create_booking_fee_checkout') {
    return jsonResponse(400, { error: 'payment_disabled', message: 'Pagamento automático indisponível no momento.' })
  }

  if (payload && (payload as Payload).action === 'sync_booking_fee_session') {
    return jsonResponse(400, { error: 'payment_disabled', message: 'Pagamento automático indisponível no momento.' })
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
      action !== 'admin_get_usuario_status')
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
        'admin_get_usuario_status',
        'create_booking_fee_checkout',
        'sync_booking_fee_session',
      ],
    })
  }

  if (payload.action === 'create_checkout' || payload.action === 'sync_checkout_session' || payload.action === 'create_billing_portal') {
    return jsonResponse(400, { error: 'payment_disabled', message: 'Pagamento automático indisponível no momento.' })
  }

  const adminClient = createClient<LooseDatabase>(supabaseUrl, serviceRoleKey)

  if (payload.action === 'admin_get_usuario_status') {
    const usuarioId = normalizeUuid(payload.usuario_id)
    if (!usuarioId) return jsonResponse(400, { error: 'invalid_usuario_id' })

    const callerId = userData.user.id
    const { data: saRow } = await userClient.from('super_admin').select('id').eq('id', callerId).maybeSingle()
    const isSuperAdmin = Boolean(saRow)
    if (!isSuperAdmin && callerId !== usuarioId) return jsonResponse(403, { error: 'forbidden' })

    const { data: usuarioRow, error: usuarioErr } = await adminClient
      .from('usuarios')
      .select('id,plano,status_pagamento,data_vencimento,data_pagamento_fatura,ativo')
      .eq('id', usuarioId)
      .maybeSingle()
    if (usuarioErr || !usuarioRow) return jsonResponse(404, { error: 'usuario_not_found' })

    const plano = typeof usuarioRow.plano === 'string' ? usuarioRow.plano : null
    const statusPagamento = typeof usuarioRow.status_pagamento === 'string' ? usuarioRow.status_pagamento : null
    const dataVencimento = typeof usuarioRow.data_vencimento === 'string' ? usuarioRow.data_vencimento : null
    const dataPagamentoFatura = typeof usuarioRow.data_pagamento_fatura === 'string' ? usuarioRow.data_pagamento_fatura : null
    const ativo = typeof usuarioRow.ativo === 'boolean' ? usuarioRow.ativo : null

    return jsonResponse(200, {
      ok: true,
      usuario_id: usuarioId,
      source: 'db',
      plano,
      status_pagamento: statusPagamento,
      data_vencimento: dataVencimento,
      data_pagamento_fatura: dataPagamentoFatura,
      ativo,
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
      .select('data_vencimento')
      .eq('id', usuarioId)
      .maybeSingle()
    if (usuarioErr || !usuarioRow) return jsonResponse(404, { error: 'usuario_not_found' })

    const dataVencimento = typeof usuarioRow.data_vencimento === 'string' ? usuarioRow.data_vencimento : null
    const update = await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
      status_pagamento: 'cancelado',
      ativo: false,
    })
    if (!update.ok) return jsonResponse(500, { error: 'db_error', message: 'Falha ao atualizar pagamento.' })

    return jsonResponse(200, {
      ok: true,
      usuario_id: usuarioId,
      status_pagamento: 'cancelado',
      data_vencimento: dataVencimento,
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
      .select('data_vencimento')
      .eq('id', usuarioId)
      .maybeSingle()
    if (usuarioErr || !usuarioRow) return jsonResponse(404, { error: 'usuario_not_found' })

    const dataVencimento = typeof usuarioRow.data_vencimento === 'string' ? usuarioRow.data_vencimento : null
    const update = await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
      status_pagamento: 'suspenso',
      ativo: false,
    })
    if (!update.ok) return jsonResponse(500, { error: 'db_error', message: 'Falha ao atualizar pagamento.' })

    return jsonResponse(200, {
      ok: true,
      usuario_id: usuarioId,
      status_pagamento: 'suspenso',
      data_vencimento: dataVencimento,
    })
  }

  if (payload.action === 'grant_free_months') {
    const usuarioId = normalizeUuid(payload.usuario_id)
    if (!usuarioId) return jsonResponse(400, { error: 'invalid_usuario_id', message: 'usuario_id inválido.' })

    const monthsParsed = parsePositiveInt((payload as Payload & { action: 'grant_free_months' }).months)
    const months = monthsParsed ? clampInt(monthsParsed, 1, 24) : null
    if (!months) return jsonResponse(400, { error: 'invalid_input', message: 'Informe months (1–24).' })

    const callerId = userData.user.id
    const { data: saRow } = await userClient.from('super_admin').select('id').eq('id', callerId).maybeSingle()
    const isSuperAdmin = Boolean(saRow)
    if (!isSuperAdmin) return jsonResponse(403, { error: 'forbidden', message: 'Ação permitida apenas para Super Admin.' })

    const { data: usuarioRow, error: usuarioErr } = await adminClient
      .from('usuarios')
      .select('status_pagamento,data_vencimento,ativo')
      .eq('id', usuarioId)
      .maybeSingle()
    if (usuarioErr || !usuarioRow) return jsonResponse(404, { error: 'usuario_not_found' })

    const dbStatusPagamentoNow =
      typeof (usuarioRow as Record<string, unknown>).status_pagamento === 'string'
        ? String((usuarioRow as Record<string, unknown>).status_pagamento).trim()
        : ''
    const currentVencNow =
      typeof (usuarioRow as Record<string, unknown>).data_vencimento === 'string'
        ? String((usuarioRow as Record<string, unknown>).data_vencimento).trim()
        : ''
    const todayIso = new Date().toISOString().slice(0, 10)
    const baseIso = (() => {
      const baseDate = currentVencNow ? new Date(`${currentVencNow}T00:00:00`) : null
      const today = new Date(`${todayIso}T00:00:00`)
      if (baseDate && Number.isFinite(baseDate.getTime()) && baseDate >= today) return currentVencNow
      return todayIso
    })()
    const newVenc = addMonthsToIsoDate(baseIso, months)
    if (!newVenc) return jsonResponse(400, { error: 'invalid_date', message: 'Não foi possível calcular nova data de vencimento.' })

    const statusToPersist = dbStatusPagamentoNow && dbStatusPagamentoNow !== 'cancelado' ? dbStatusPagamentoNow : 'trial'
    const upd = await applyUsuarioPaymentUpdate(adminClient, usuarioId, {
      status_pagamento: statusToPersist,
      data_vencimento: newVenc,
      ativo: true,
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

  return jsonResponse(400, { error: 'invalid_action', message: 'Ação não suportada.' })
})
