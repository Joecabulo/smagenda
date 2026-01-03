import { createClient } from '@supabase/supabase-js'
import { checkRequiredEnvs } from './env'

export const supabaseEnv = checkRequiredEnvs(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'])

function cleanEnvString(value: string) {
  return String(value ?? '')
    .trim()
    .replace(/^['"`\s]+|['"`\s]+$/g, '')
}

const supabaseUrl = supabaseEnv.ok ? cleanEnvString(supabaseEnv.values.VITE_SUPABASE_URL).replace(/\/+$/g, '') : 'http://localhost'
const supabaseAnonKey = supabaseEnv.ok ? cleanEnvString(supabaseEnv.values.VITE_SUPABASE_ANON_KEY) : 'missing'

const fetchWithApiKey: typeof fetch = (input, init) => {
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  const initHeaders = new Headers(init?.headers ?? undefined)
  initHeaders.forEach((value, key) => headers.set(key, value))
  if (!headers.has('apikey')) headers.set('apikey', supabaseAnonKey)
  return fetch(input, { ...(init ?? {}), headers })
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: fetchWithApiKey,
  },
})

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  const payload = parts[1] ?? ''
  if (!payload) return null
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  try {
    const json = atob(padded)
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

export function checkJwtProject(jwt: string, supabaseUrlValue: string) {
  const expectedPrefix = `${supabaseUrlValue.replace(/\/+$/, '')}/auth/v1`
  const payload = decodeJwtPayload(jwt)
  const iss = typeof payload?.iss === 'string' ? payload.iss : null
  const ok = Boolean(iss && iss.startsWith(expectedPrefix))
  if (ok) return { ok: true as const }
  return { ok: false as const, iss, expectedPrefix }
}
