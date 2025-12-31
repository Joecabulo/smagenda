import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0'

type Payload = {
  nome_completo: string
  email: string
  senha: string
  telefone?: string | null
  permissao: 'admin' | 'funcionario'
  horario_inicio?: string | null
  horario_fim?: string | null
  dias_trabalho?: number[] | null
  intervalo_inicio?: string | null
  intervalo_fim?: string | null
  pode_ver_agenda?: boolean
  pode_criar_agendamentos?: boolean
  pode_cancelar_agendamentos?: boolean
  pode_bloquear_horarios?: boolean
  pode_ver_financeiro?: boolean
  pode_gerenciar_servicos?: boolean
  pode_ver_clientes_de_outros?: boolean
  ativo?: boolean
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse(200, { ok: true })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, { error: 'missing_env' })
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

  const email = (payload.email ?? '').trim().toLowerCase()
  const senha = payload.senha ?? ''
  const nomeCompleto = (payload.nome_completo ?? '').trim()
  if (!email || !senha || !nomeCompleto) {
    return jsonResponse(400, { error: 'missing_fields' })
  }
  if (senha.trim().length < 8) {
    return jsonResponse(400, { error: 'weak_password' })
  }
  if (payload.permissao !== 'admin' && payload.permissao !== 'funcionario') {
    return jsonResponse(400, { error: 'invalid_permissao' })
  }

  const masterId = userData.user.id
  const { data: masterRow, error: masterErr } = await userClient
    .from('usuarios')
    .select('id,limite_funcionarios,ativo,status_pagamento,data_vencimento')
    .eq('id', masterId)
    .maybeSingle()

  if (masterErr || !masterRow) {
    return jsonResponse(403, { error: 'not_master' })
  }
  if (masterRow.ativo === false) {
    return jsonResponse(403, { error: 'master_inactive' })
  }

  const statusPagamento = String((masterRow as { status_pagamento?: unknown }).status_pagamento ?? '')
    .trim()
    .toLowerCase()
  const venc = String((masterRow as { data_vencimento?: unknown }).data_vencimento ?? '').trim()
  if (statusPagamento === 'trial' && venc) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const exp = new Date(`${venc}T00:00:00`)
    if (Number.isFinite(exp.getTime()) && exp < today) {
      return jsonResponse(403, { error: 'trial_expired' })
    }
  }

  if (statusPagamento && statusPagamento !== 'ativo' && statusPagamento !== 'trial') {
    return jsonResponse(403, { error: 'payment_inactive', status_pagamento: statusPagamento })
  }

  const { count: activeCount, error: countErr } = await userClient
    .from('funcionarios')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_master_id', masterId)
    .eq('ativo', true)

  if (countErr) {
    return jsonResponse(400, { error: 'cannot_check_limit' })
  }

  const limite = masterRow.limite_funcionarios
  if (typeof limite === 'number' && limite > 0 && (activeCount ?? 0) >= limite) {
    return jsonResponse(400, { error: 'limit_reached' })
  }

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: {
      nome_completo: nomeCompleto,
      usuario_master_id: masterId,
      permissao: payload.permissao,
    },
  })

  if (createErr || !created.user) {
    return jsonResponse(400, { error: 'create_user_failed', message: createErr?.message ?? 'unknown' })
  }

  const funcionarioId = created.user.id

  const insertPayload = {
    id: funcionarioId,
    usuario_master_id: masterId,
    nome_completo: nomeCompleto,
    email,
    telefone: payload.telefone ? String(payload.telefone).trim() : null,
    permissao: payload.permissao,
    horario_inicio: payload.horario_inicio ?? null,
    horario_fim: payload.horario_fim ?? null,
    dias_trabalho: payload.dias_trabalho ?? null,
    intervalo_inicio: payload.intervalo_inicio ?? null,
    intervalo_fim: payload.intervalo_fim ?? null,
    pode_ver_agenda: payload.pode_ver_agenda ?? true,
    pode_criar_agendamentos: payload.pode_criar_agendamentos ?? true,
    pode_cancelar_agendamentos: payload.pode_cancelar_agendamentos ?? true,
    pode_bloquear_horarios: payload.pode_bloquear_horarios ?? true,
    pode_ver_financeiro: payload.pode_ver_financeiro ?? false,
    pode_gerenciar_servicos: payload.pode_gerenciar_servicos ?? false,
    pode_ver_clientes_de_outros: payload.pode_ver_clientes_de_outros ?? false,
    ativo: payload.ativo ?? true,
  }

  const { error: insertErr } = await adminClient.from('funcionarios').insert(insertPayload)
  if (insertErr) {
    await adminClient.auth.admin.deleteUser(funcionarioId)
    return jsonResponse(400, { error: 'insert_funcionario_failed', message: insertErr.message })
  }

  return jsonResponse(200, { id: funcionarioId, email })
})
