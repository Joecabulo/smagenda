import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'
import type { Principal } from './types'
import { supabase } from '../../lib/supabase'

type Props = {
  children: React.ReactNode
  requiredKind?: Principal['kind']
}

export function RequireAuth({ children, requiredKind }: Props) {
  const { loading, session, principal, appPrincipal, impersonation, signOut } = useAuth()
  const location = useLocation()
  const [masterBlocked, setMasterBlocked] = useState(false)
  const [checkingMaster, setCheckingMaster] = useState(false)
  const masterId = principal?.kind === 'funcionario' ? principal.profile.usuario_master_id : null

  useEffect(() => {
    const run = async () => {
      if (!session || !masterId) {
        setMasterBlocked(false)
        setCheckingMaster(false)
        return
      }

      setCheckingMaster(true)
      const { data, error } = await supabase
        .from('usuarios')
        .select('status_pagamento,data_vencimento,ativo')
        .eq('id', masterId)
        .maybeSingle()

      if (error || !data) {
        setMasterBlocked(true)
        setCheckingMaster(false)
        return
      }

      if (data.ativo === false) {
        setMasterBlocked(true)
        setCheckingMaster(false)
        return
      }

      const status = String(data.status_pagamento ?? '').trim().toLowerCase()
      if (status && status !== 'ativo' && status !== 'trial') {
        setMasterBlocked(true)
        setCheckingMaster(false)
        return
      }

      const venc = data.data_vencimento
      if (data.status_pagamento === 'trial' && venc) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const exp = new Date(`${venc}T00:00:00`)
        if (Number.isFinite(exp.getTime()) && exp < today) {
          setMasterBlocked(true)
          setCheckingMaster(false)
          return
        }
      }

      setMasterBlocked(false)
      setCheckingMaster(false)
    }

    run().catch(() => {
      setMasterBlocked(true)
      setCheckingMaster(false)
    })
  }, [masterId, session])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Carregando…</div>
      </div>
    )
  }

  if (checkingMaster) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Carregando…</div>
      </div>
    )
  }

  if (!session) {
    const adminPath = location.pathname.startsWith('/admin')
    return <Navigate to={adminPath ? '/admin/login' : '/login'} replace />
  }

  if (!principal) {
    return <Navigate to="/login" replace />
  }

  const inAdmin = location.pathname.startsWith('/admin')
  const inPagamento = location.pathname === '/pagamento'
  const effective = inAdmin ? principal : (appPrincipal ?? principal)

  if (principal.kind === 'funcionario' && masterBlocked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-3 rounded-xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Acesso indisponível</div>
          <div className="text-sm text-slate-600">O acesso do seu estabelecimento está pausado.</div>
          <button
            type="button"
            className="w-full inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-300 bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => void signOut()}
          >
            Sair
          </button>
        </div>
      </div>
    )
  }

  if (principal.kind === 'usuario') {
    const venc = principal.profile.data_vencimento
    if (principal.profile.status_pagamento === 'trial' && venc) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const exp = new Date(`${venc}T00:00:00`)
      if (Number.isFinite(exp.getTime()) && exp < today) {
        if (inPagamento) return <>{children}</>
        return (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md space-y-3 rounded-xl border border-slate-200 bg-white p-6">
              <div className="text-sm font-semibold text-slate-900">Período de teste expirado</div>
              <div className="text-sm text-slate-600">Seu acesso foi pausado. Regularize o pagamento para reativar.</div>
              <button
                type="button"
                className="w-full inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-300 bg-slate-900 text-white hover:bg-slate-800"
                onClick={() => {
                  window.location.href = '/pagamento'
                }}
              >
                Ir para pagamento
              </button>
              <button
                type="button"
                className="w-full inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white text-slate-900 hover:bg-slate-50"
                onClick={() => void signOut()}
              >
                Sair
              </button>
            </div>
          </div>
        )
      }
    }

    if (principal.profile.status_pagamento !== 'ativo' && principal.profile.status_pagamento !== 'trial') {
      if (inPagamento) return <>{children}</>
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md space-y-3 rounded-xl border border-slate-200 bg-white p-6">
            <div className="text-sm font-semibold text-slate-900">Pagamento pendente</div>
            <div className="text-sm text-slate-600">Seu acesso está restrito até a regularização do pagamento.</div>
            <button
              type="button"
              className="w-full inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-300 bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => {
                window.location.href = '/pagamento'
              }}
            >
              Ir para pagamento
            </button>
            <button
              type="button"
              className="w-full inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white text-slate-900 hover:bg-slate-50"
              onClick={() => void signOut()}
            >
              Sair
            </button>
          </div>
        </div>
      )
    }
  }

  if (principal.kind === 'super_admin' && !inAdmin && !impersonation) {
    return <Navigate to="/admin/dashboard" replace />
  }

  if (requiredKind && effective.kind !== requiredKind) {
    if (principal.kind === 'super_admin') return <Navigate to="/admin/dashboard" replace />
    if (effective.kind === 'funcionario') return <Navigate to="/funcionario/agenda" replace />
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
