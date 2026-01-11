import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0'

type Payload = {
  usuario_master_id: string
  nome_completo: string
  email: string
  senha: string
  telefone?: string | null
  permissao: 'admin' | 'funcionario' | 'atendente'
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

function normalizeUuid(value: unknown) {
  const s = typeof value === 'string' ? value.trim() : ''
  if (!s) return null
  if (!/^[0-9a-fA-F-]{36}$/.test(s)) return null
  return s
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

  const callerId = userData.user.id
  const { data: saRow, error: saErr } = await userClient.from('super_admin').select('id').eq('id', callerId).maybeSingle()
  if (saErr || !saRow) {
    return jsonResponse(403, { error: 'forbidden', message: 'Sem permissão.' })
  }

  let payload: Payload
  try {
    payload = (await req.json()) as Payload
  } catch {
    return jsonResponse(400, { error: 'invalid_json' })
  }

  const masterId = normalizeUuid(payload.usuario_master_id)
  if (!masterId) return jsonResponse(400, { error: 'invalid_usuario_master_id' })

  const email = (payload.email ?? '').trim().toLowerCase()
  const senha = payload.senha ?? ''
  const nomeCompleto = (payload.nome_completo ?? '').trim()
  if (!email || !senha || !nomeCompleto) {
    return jsonResponse(400, { error: 'missing_fields' })
  }
  if (senha.trim().length < 8) {
    return jsonResponse(400, { error: 'weak_password' })
  }
  if (payload.permissao !== 'admin' && payload.permissao !== 'funcionario' && payload.permissao !== 'atendente') {
    return jsonResponse(400, { error: 'invalid_permissao' })
  }

  const { data: masterRow, error: masterErr } = await adminClient
    .from('usuarios')
    .select('id,plano,limite_funcionarios,ativo')
    .eq('id', masterId)
    .maybeSingle()

  if (masterErr || !masterRow) {
    return jsonResponse(404, { error: 'master_not_found' })
  }
  if (masterRow.ativo === false) {
    return jsonResponse(403, { error: 'master_inactive' })
  }

  const { count: activeCount, error: countErr } = await adminClient
    .from('funcionarios')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_master_id', masterId)
    .eq('ativo', true)

  if (countErr) {
    return jsonResponse(400, { error: 'cannot_check_limit', message: countErr.message })
  }

  const plano = String((masterRow as { plano?: unknown }).plano ?? '')
    .trim()
    .toLowerCase()

  let limiteEfetivo: number | null | undefined = masterRow.limite_funcionarios
  if (plano === 'enterprise') {
    limiteEfetivo = null
  } else if (plano === 'pro' || plano === 'team') {
    const raw = masterRow.limite_funcionarios
    const n = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null
    const base = 4
    const max = 6
    limiteEfetivo = !n || n < base ? base : Math.min(max, n)
  } else if (plano === 'basic' || plano === 'free') {
    limiteEfetivo = 1
  }

  if (typeof limiteEfetivo === 'number' && limiteEfetivo > 0 && (activeCount ?? 0) >= limiteEfetivo) {
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
    ativo: payload.ativo ?? true,
  }

  const { error: insertErr } = await adminClient.from('funcionarios').insert(insertPayload)
  if (insertErr) {
    await adminClient.auth.admin.deleteUser(funcionarioId)
    return jsonResponse(400, { error: 'insert_funcionario_failed', message: insertErr.message })
  }

  return jsonResponse(200, { id: funcionarioId, email })
})
