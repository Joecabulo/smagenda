import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Principal, UsuarioProfile } from './types'

export type Impersonation = {
  usuarioId: string
}

export type AuthState = {
  session: Session | null
  principal: Principal | null
  appPrincipal: Principal | null
  masterUsuario: UsuarioProfile | null
  masterUsuarioLoading: boolean
  loading: boolean
  refresh: () => Promise<Principal | null>
  signOut: () => Promise<void>
  impersonation: Impersonation | null
  startImpersonation: (usuarioId: string) => Promise<{ ok: true } | { ok: false; message: string }>
  stopImpersonation: () => void
}

export const AuthContext = createContext<AuthState | null>(null)
