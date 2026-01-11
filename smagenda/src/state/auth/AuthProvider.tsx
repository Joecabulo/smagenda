import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { FuncionarioProfile, Principal, SuperAdminProfile, UsuarioProfile } from './types'
import { AuthContext, type AuthState, type Impersonation } from './AuthContext'

function deriveEmailPrefix(email: string | null) {
  if (!email) return null
  const prefix = email.split('@')[0]?.trim()
  return prefix ? prefix : null
}

function deriveSlug(base: string) {
  const slug = base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+)|(-+$)/g, '')
  return slug ? slug : null
}

function toUsuarioProfile(row: Record<string, unknown>, userId: string): UsuarioProfile {
  const rawEmail = typeof row.email === 'string' ? row.email : null
  const emailPrefix = deriveEmailPrefix(rawEmail)
  const nomeCompleto = typeof row.nome_completo === 'string' && row.nome_completo.trim() ? row.nome_completo : (emailPrefix ?? 'Usuário')
  const nomeNegocio = typeof row.nome_negocio === 'string' && row.nome_negocio.trim() ? row.nome_negocio : nomeCompleto

  const rawSlug = typeof row.slug === 'string' && row.slug.trim() ? row.slug : null
  const derivedFromEmail = emailPrefix ? deriveSlug(emailPrefix) : null
  const fallbackSlug = `u-${userId.replace(/-/g, '').slice(0, 8)}`
  const slug = rawSlug ?? derivedFromEmail ?? fallbackSlug

  const plano = (typeof row.plano === 'string' ? row.plano : 'free') as UsuarioProfile['plano']
  const tipoConta = (typeof row.tipo_conta === 'string' ? row.tipo_conta : 'master') as UsuarioProfile['tipo_conta']
  const statusPagamento = (typeof row.status_pagamento === 'string' ? row.status_pagamento : 'trial') as UsuarioProfile['status_pagamento']
  const freeTrialConsumido = row.free_trial_consumido === true
  const tipoNegocio = typeof row.tipo_negocio === 'string' ? row.tipo_negocio : null

  return {
    id: userId,
    nome_completo: nomeCompleto,
    nome_negocio: nomeNegocio,
    slug,
    tipo_negocio: tipoNegocio,
    logo_url: typeof row.logo_url === 'string' ? row.logo_url : null,
    telefone: typeof row.telefone === 'string' ? row.telefone : null,
    email: rawEmail ?? '',
    endereco: typeof row.endereco === 'string' ? row.endereco : null,
    horario_inicio: typeof row.horario_inicio === 'string' ? row.horario_inicio : null,
    horario_fim: typeof row.horario_fim === 'string' ? row.horario_fim : null,
    dias_trabalho: Array.isArray(row.dias_trabalho) ? (row.dias_trabalho as number[]) : null,
    intervalo_inicio: typeof row.intervalo_inicio === 'string' ? row.intervalo_inicio : null,
    intervalo_fim: typeof row.intervalo_fim === 'string' ? row.intervalo_fim : null,
    whatsapp_api_url: typeof row.whatsapp_api_url === 'string' ? row.whatsapp_api_url : null,
    plano,
    tipo_conta: tipoConta,
    limite_funcionarios: typeof row.limite_funcionarios === 'number' ? row.limite_funcionarios : null,
    status_pagamento: statusPagamento,
    data_vencimento: typeof row.data_vencimento === 'string' ? row.data_vencimento : null,
    free_trial_consumido: freeTrialConsumido,
    ativo: typeof row.ativo === 'boolean' ? row.ativo : true,
  }
}

function toFuncionarioProfile(row: Record<string, unknown>, userId: string): FuncionarioProfile {
  const permissao = row.permissao === 'admin' ? 'admin' : row.permissao === 'atendente' ? 'atendente' : 'funcionario'
  return {
    id: userId,
    usuario_master_id: String(row.usuario_master_id ?? ''),
    nome_completo: String(row.nome_completo ?? ''),
    email: String(row.email ?? ''),
    telefone: typeof row.telefone === 'string' ? row.telefone : null,
    permissao,
    pode_ver_agenda: row.pode_ver_agenda !== false,
    pode_criar_agendamentos: row.pode_criar_agendamentos !== false,
    pode_cancelar_agendamentos: row.pode_cancelar_agendamentos !== false,
    pode_bloquear_horarios: row.pode_bloquear_horarios !== false,
    pode_ver_financeiro: row.pode_ver_financeiro === true,
    pode_gerenciar_servicos: row.pode_gerenciar_servicos === true,
    pode_ver_clientes_de_outros: row.pode_ver_clientes_de_outros === true,
    horario_inicio: typeof row.horario_inicio === 'string' ? row.horario_inicio : null,
    horario_fim: typeof row.horario_fim === 'string' ? row.horario_fim : null,
    dias_trabalho: Array.isArray(row.dias_trabalho) ? (row.dias_trabalho as number[]) : null,
    intervalo_inicio: typeof row.intervalo_inicio === 'string' ? row.intervalo_inicio : null,
    intervalo_fim: typeof row.intervalo_fim === 'string' ? row.intervalo_fim : null,
    capacidade_dia_inteiro: typeof row.capacidade_dia_inteiro === 'number' && Number.isFinite(row.capacidade_dia_inteiro) ? Math.max(1, Math.min(2, Math.floor(row.capacidade_dia_inteiro))) : 1,
    ativo: row.ativo !== false,
  }
}

async function resolvePrincipal(userId: string): Promise<Principal | null> {
  const isMissingTable = (msg: string) => msg.includes('schema cache') || msg.includes("Could not find the table 'public.")

  const { data: superAdmin, error: superAdminErr } = await supabase.from('super_admin').select('id,nome,email,nivel').eq('id', userId).maybeSingle()
  if (superAdminErr) {
    if (!isMissingTable(superAdminErr.message)) return null
  }
  if (superAdmin) return { kind: 'super_admin', profile: superAdmin as unknown as SuperAdminProfile }

  const { data: funcionario, error: funcionarioErr } = await supabase
    .from('funcionarios')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (funcionarioErr) {
    if (!isMissingTable(funcionarioErr.message)) return null
  }
  if (funcionario) return { kind: 'funcionario', profile: toFuncionarioProfile(funcionario as unknown as Record<string, unknown>, userId) }

  const { data: usuario, error: usuarioErr } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (usuarioErr) {
    if (!isMissingTable(usuarioErr.message)) return null
  }
  if (usuario) return { kind: 'usuario', profile: toUsuarioProfile(usuario as unknown as Record<string, unknown>, userId) }

  const { error: ensureErr } = await supabase.rpc('ensure_usuario_profile')
  if (!ensureErr) {
    const { data: usuario2 } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (usuario2) return { kind: 'usuario', profile: toUsuarioProfile(usuario2 as unknown as Record<string, unknown>, userId) }
  }

  return null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<import('@supabase/supabase-js').Session | null>(null)
  const [principal, setPrincipal] = useState<Principal | null>(null)
  const [masterUsuario, setMasterUsuario] = useState<UsuarioProfile | null>(null)
  const [masterUsuarioLoading, setMasterUsuarioLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  const [impersonation, setImpersonation] = useState<Impersonation | null>(() => {
    try {
      const raw = window.localStorage.getItem('smagenda:impersonation')
      if (!raw) return null
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object') return null
      const p = parsed as Record<string, unknown>
      const usuarioId = typeof p.usuarioId === 'string' ? p.usuarioId : null
      return usuarioId ? { usuarioId } : null
    } catch {
      return null
    }
  })

  const [impersonatedUsuario, setImpersonatedUsuario] = useState<UsuarioProfile | null>(null)

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    if (data.session?.user?.id) {
      const next = await resolvePrincipal(data.session.user.id)
      setPrincipal(next)
      return next
    } else {
      setPrincipal(null)
      return null
    }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setPrincipal(null)
    setImpersonation(null)
    setImpersonatedUsuario(null)
    try {
      window.localStorage.removeItem('smagenda:impersonation')
    } catch {
      return
    }
  }, [])

  const stopImpersonation = useCallback(() => {
    setImpersonation(null)
    setImpersonatedUsuario(null)
    try {
      window.localStorage.removeItem('smagenda:impersonation')
    } catch {
      return
    }
  }, [])

  const startImpersonation = useCallback(
    async (usuarioId: string) => {
      if (principal?.kind !== 'super_admin') return { ok: false as const, message: 'Sem permissão.' }
      const id = usuarioId.trim()
      if (!id) return { ok: false as const, message: 'Cliente inválido.' }

      const { data, error } = await supabase.from('usuarios').select('*').eq('id', id).maybeSingle()
      if (error) return { ok: false as const, message: error.message }
      if (!data) return { ok: false as const, message: 'Cliente não encontrado na tabela usuarios.' }

      const profile = toUsuarioProfile(data as unknown as Record<string, unknown>, id)
      setImpersonation({ usuarioId: id })
      setImpersonatedUsuario(profile)
      try {
        window.localStorage.setItem('smagenda:impersonation', JSON.stringify({ usuarioId: id }))
      } catch {
        return { ok: true as const }
      }
      return { ok: true as const }
    },
    [principal?.kind]
  )

  useEffect(() => {
    const run = async () => {
      if (!impersonation) {
        setImpersonatedUsuario(null)
        return
      }
      if (principal?.kind !== 'super_admin') {
        stopImpersonation()
        return
      }

      const { data, error } = await supabase.from('usuarios').select('*').eq('id', impersonation.usuarioId).maybeSingle()
      if (error || !data) {
        stopImpersonation()
        return
      }
      setImpersonatedUsuario(toUsuarioProfile(data as unknown as Record<string, unknown>, impersonation.usuarioId))
    }

    run().catch(() => {
      stopImpersonation()
    })
  }, [impersonation, principal?.kind, stopImpersonation])

  useEffect(() => {
    void (async () => {
      await Promise.resolve()
      await refresh()
    })()
      .catch(() => undefined)
      .finally(() => setLoading(false))

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession?.user?.id) {
        setPrincipal(null)
        return
      }
      resolvePrincipal(nextSession.user.id)
        .then((p) => setPrincipal(p))
        .catch(() => setPrincipal(null))
    })

    return () => {
      subscription.subscription.unsubscribe()
    }
  }, [refresh])

  useEffect(() => {
    const run = async () => {
      if (principal?.kind !== 'funcionario') {
        setMasterUsuario(null)
        setMasterUsuarioLoading(false)
        return
      }

      const masterIdRaw = principal.profile.usuario_master_id
      const masterId = typeof masterIdRaw === 'string' ? masterIdRaw.trim() : ''
      if (!masterId) {
        setMasterUsuario(null)
        setMasterUsuarioLoading(false)
        return
      }

      setMasterUsuarioLoading(true)
      const { data, error } = await supabase.from('usuarios').select('*').eq('id', masterId).maybeSingle()
      if (error || !data) {
        setMasterUsuario(null)
        setMasterUsuarioLoading(false)
        return
      }

      setMasterUsuario(toUsuarioProfile(data as unknown as Record<string, unknown>, masterId))
      setMasterUsuarioLoading(false)
    }

    run().catch(() => {
      setMasterUsuario(null)
      setMasterUsuarioLoading(false)
    })
  }, [principal])

  const appPrincipal = useMemo<Principal | null>(() => {
    if (principal?.kind === 'super_admin' && impersonation && impersonatedUsuario) {
      return { kind: 'usuario', profile: impersonatedUsuario }
    }
    return principal
  }, [impersonatedUsuario, impersonation, principal])

  const value = useMemo<AuthState>(
    () => ({
      session,
      principal,
      appPrincipal,
      masterUsuario,
      masterUsuarioLoading,
      loading,
      refresh,
      signOut,
      impersonation,
      startImpersonation,
      stopImpersonation,
    }),
    [session, principal, appPrincipal, masterUsuario, masterUsuarioLoading, loading, refresh, signOut, impersonation, startImpersonation, stopImpersonation]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
