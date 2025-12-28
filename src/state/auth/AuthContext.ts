import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Principal } from './types'

export type AuthState = {
  session: Session | null
  principal: Principal | null
  loading: boolean
  refresh: () => Promise<Principal | null>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
