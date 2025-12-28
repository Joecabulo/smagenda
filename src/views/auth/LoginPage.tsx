import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { supabaseEnv } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuth } from '../../state/auth/useAuth'

export function LoginPage() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const diagnoseProfile = async () => {
    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr) return `auth.getUser: ${userErr.message}`
    const uid = userData.user?.id ?? null
    if (!uid) return 'Sessão não encontrada após login.'

    const check = async (table: 'usuarios' | 'funcionarios' | 'super_admin') => {
      const { data, error: err } = await supabase.from(table).select('id').eq('id', uid).maybeSingle()
      return { ok: !err, hasRow: Boolean((data as unknown as { id?: string | null } | null)?.id), err: err?.message ?? null }
    }

    const [u, f, s] = await Promise.all([check('usuarios'), check('funcionarios'), check('super_admin')])

    const firstErr = u.err ?? f.err ?? s.err
    if (firstErr) {
      const lower = firstErr.toLowerCase()
      const missingTable = lower.includes('could not find the table') || lower.includes('schema cache')
      if (missingTable) {
        return 'Tabelas SQL não configuradas no Supabase (public.usuarios / public.funcionarios / public.super_admin).'
      }

      const permission = lower.includes('permission denied') || lower.includes('row-level security') || lower.includes('rls')
      if (permission) {
        return 'Sem permissão para ler seu perfil na tabela. Execute o bloco “SQL de políticas (Usuário / Funcionário)” em /admin/configuracoes no SQL Editor do Supabase.'
      }

      return firstErr
    }

    if (!u.hasRow && !f.hasRow && !s.hasRow) {
      return 'Usuário existe no Auth, mas não existe registro nas tabelas (usuarios/funcionarios/super_admin). Execute “SQL de Trial” e depois faça login novamente.'
    }

    return null
  }

  useEffect(() => {
    const run = async () => {
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      const tokenHash = url.searchParams.get('token_hash')
      const type = url.searchParams.get('type')

      const hashParams = url.hash.startsWith('#') ? new URLSearchParams(url.hash.slice(1)) : null
      const accessToken = hashParams?.get('access_token')
      const refreshToken = hashParams?.get('refresh_token')
      const hashType = hashParams?.get('type')

      const hasCallback = Boolean(code || tokenHash)
      const hasHashSession = Boolean(accessToken && refreshToken)
      if (!hasCallback && !hasHashSession) return

      setSubmitting(true)
      setError(null)

      const finalType = type ?? hashType

      if (code) {
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeErr) {
          setError(exchangeErr.message)
          setSubmitting(false)
          return
        }
      } else if (hasHashSession && accessToken && refreshToken) {
        const { error: setErr } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (setErr) {
          setError(setErr.message)
          setSubmitting(false)
          return
        }
      } else if (tokenHash && finalType) {
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          type: finalType as 'signup' | 'magiclink' | 'recovery' | 'email_change' | 'invite',
          token_hash: tokenHash,
        })
        if (verifyErr) {
          setError(verifyErr.message)
          setSubmitting(false)
          return
        }
      }

      const { error: ensureErr } = await supabase.rpc('ensure_usuario_profile')
      if (ensureErr) {
        const msg = ensureErr.message
        const lower = msg.toLowerCase()
        const missingFn = lower.includes('ensure_usuario_profile') && (lower.includes('function') || lower.includes('rpc'))
        if (missingFn) {
          setError('Configuração do Supabase incompleta: crie a função ensure_usuario_profile (trial).')
          setSubmitting(false)
          return
        }
        const slugTaken = lower.includes('slug') && (lower.includes('duplicate') || lower.includes('unique'))
        if (slugTaken) {
          setError('Seu link (slug) já está em uso. Tente criar a conta novamente com outro slug.')
          setSubmitting(false)
          return
        }
      }

      const next = await refresh()
      if (!next) {
        const diag = await diagnoseProfile()
        setError(
          diag
            ? `Não foi possível carregar seu perfil. ${diag}`
            : 'Não foi possível carregar seu perfil. Verifique se as políticas (RLS) e tabelas do Supabase estão configuradas.'
        )
        setSubmitting(false)
        return
      }
      if (next.kind === 'funcionario') {
        navigate('/funcionario/agenda', { replace: true })
      } else if (next.kind === 'super_admin') {
        navigate('/admin/dashboard', { replace: true })
      } else {
        navigate(finalType === 'signup' ? '/onboarding' : '/dashboard', { replace: true })
      }
      setSubmitting(false)
    }

    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Falha ao confirmar email')
      setSubmitting(false)
    })
  }, [navigate, refresh])

  const canSubmit = useMemo(() => email.trim() && password.trim(), [email, password])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setInfo(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (signInError) {
      const msg = signInError.message
      const notConfirmed = msg.toLowerCase().includes('confirm')
      setError(notConfirmed ? 'Email não confirmado. Confirme no email ou solicite um novo link de confirmação.' : msg)
      setSubmitting(false)
      return
    }

    const { error: ensureErr } = await supabase.rpc('ensure_usuario_profile')
    if (ensureErr) {
      const msg = ensureErr.message
      const lower = msg.toLowerCase()
      const missingFn = lower.includes('ensure_usuario_profile') && (lower.includes('function') || lower.includes('rpc'))
      if (missingFn) {
        setError('Configuração do Supabase incompleta: crie a função ensure_usuario_profile (trial).')
        setSubmitting(false)
        return
      }
      const slugTaken = lower.includes('slug') && (lower.includes('duplicate') || lower.includes('unique'))
      if (slugTaken) {
        setError('Seu link (slug) já está em uso. Peça para alterar o slug no painel de admin.')
        setSubmitting(false)
        return
      }
    }

    const next = await refresh()
    if (!next) {
      const diag = await diagnoseProfile()
      setError(
        diag ? `Não foi possível carregar seu perfil. ${diag}` : 'Não foi possível carregar seu perfil. Verifique se as políticas (RLS) e tabelas do Supabase estão configuradas.'
      )
      setSubmitting(false)
      return
    }
    if (next.kind === 'funcionario') {
      navigate('/funcionario/agenda', { replace: true })
    } else if (next.kind === 'super_admin') {
      navigate('/admin/dashboard', { replace: true })
    } else {
      navigate('/dashboard', { replace: true })
    }
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold text-slate-900">SMagenda</div>
          <div className="text-sm text-slate-600">Entre para acessar sua agenda</div>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
            <Input
              label="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
            />
            {info ? <div className="text-sm text-emerald-700">{info}</div> : null}
            {error ? <div className="text-sm text-rose-600">{error}</div> : null}
            <Button type="submit" fullWidth disabled={!canSubmit || submitting}>
              Entrar
            </Button>
            {error?.toLowerCase().includes('confirm') === true ? (
              <Button
                type="button"
                fullWidth
                variant="secondary"
                disabled={!email.trim() || submitting}
                onClick={async () => {
                  setSubmitting(true)
                  setError(null)
                  setInfo(null)
                  if (!supabaseEnv.ok) {
                    setError(`Supabase não configurado. Faltando: ${supabaseEnv.missing.join(', ')}`)
                    setSubmitting(false)
                    return
                  }
                  const cleanEmail = email.trim().toLowerCase()
                  const redirectTo = `${window.location.origin}/login?type=signup`

                  try {
                    const res = await fetch(`${supabaseEnv.values.VITE_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/settings`, {
                      headers: {
                        apikey: supabaseEnv.values.VITE_SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${supabaseEnv.values.VITE_SUPABASE_ANON_KEY}`,
                      },
                    })
                    const json = (await res.json().catch(() => null)) as
                      | { external?: { email?: boolean }; mailer_autoconfirm?: boolean }
                      | null
                    const emailOn = json?.external?.email === true
                    const autoConfirm = json?.mailer_autoconfirm === true
                    if (!emailOn && !autoConfirm) {
                      setError('O provedor de Email está desativado no Supabase. Ative em Authentication → Providers → Email.')
                      setSubmitting(false)
                      return
                    }
                  } catch {
                    setError('Falha de rede ao verificar o Supabase. Verifique URL e chave.')
                    setSubmitting(false)
                    return
                  }

                  const { error: resendErr } = await supabase.auth.resend({
                    type: 'signup',
                    email: cleanEmail,
                    options: { emailRedirectTo: redirectTo },
                  })
                  if (resendErr) {
                    setError(resendErr.message)
                    setSubmitting(false)
                    return
                  }
                  setInfo('Email de confirmação reenviado. Verifique sua caixa de entrada e spam.')
                  setSubmitting(false)
                }}
              >
                Reenviar confirmação
              </Button>
            ) : null}
            <div className="text-center text-sm text-slate-600">
              <Link to="/esqueci-senha" className="font-medium text-slate-900 hover:underline">
                Esqueci minha senha
              </Link>
            </div>
          </div>

          <div className="mt-4 text-center text-sm text-slate-600">
            Não tem conta?{' '}
            <Link to="/cadastro" className="font-medium text-slate-900 hover:underline">
              Criar conta
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
