import { createClient } from '@supabase/supabase-js'
import { checkRequiredEnvs } from './env'

export const supabaseEnv = checkRequiredEnvs(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'])

const supabaseUrl = supabaseEnv.ok ? supabaseEnv.values.VITE_SUPABASE_URL : 'http://localhost'
const supabaseAnonKey = supabaseEnv.ok ? supabaseEnv.values.VITE_SUPABASE_ANON_KEY : 'missing'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
