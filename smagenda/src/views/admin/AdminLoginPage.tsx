import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

export function AdminLoginPage() {
  const navigate = useNavigate()
  const { refresh } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const canSubmit = useMemo(() => email.trim() && password.trim(), [email, password])

  const canResend = useMemo(() => email.trim().length > 0 && error?.toLowerCase().includes('confirm') === true, [email, error])

  const resend = async () => {
    if (!email.trim()) return
    setResending(true)
    setInfo(null)
    try {
      const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
      if (resendErr) {
        setError(resendErr.message)
        return
      }
      setInfo('Email de confirmação reenviado. Verifique sua caixa de entrada e spam.')
    } finally {
      setResending(false)
    }
  }

  const submit = async () => {
    const inputEmail = email.trim().toLowerCase()
    setSubmitting(true)
    setError(null)
    setInfo(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: inputEmail, password })
    if (signInError) {
      const msg = signInError.message
      const notConfirmed = msg.toLowerCase().includes('confirm')
      setError(notConfirmed ? 'Email não confirmado. Reenvie o email de confirmação ou confirme no Supabase.' : msg)
      setSubmitting(false)
      return
    }
    await refresh()

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user?.id
    if (!userId) {
      setError('Falha ao iniciar sessão')
      setSubmitting(false)
      return
    }

    const { data: adminRow, error: adminErr } = await supabase.from('super_admin').select('id').eq('id', userId).maybeSingle()
    if (adminErr) {
      const msg = adminErr.message
      const missingTable = msg.includes("Could not find the table 'public.super_admin'") || msg.includes('schema cache')
      setError(missingTable ? 'Tabela super_admin não configurada no Supabase. Acesse /admin/bootstrap para ver o SQL.' : msg)
      await supabase.auth.signOut()
      setSubmitting(false)
      return
    }

    if (!adminRow) {
      setError('Conta não autorizada para Super Admin. Use o login normal em /login.')
      await supabase.auth.signOut()
      setSubmitting(false)
      return
    }
    setSubmitting(false)
    navigate('/admin/dashboard')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div>
          <div className="text-xs font-semibold tracking-wide text-slate-500">SMagenda</div>
          <div className="text-2xl font-semibold text-slate-900">Login Super Admin</div>
        </div>
        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
        {info ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div> : null}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button fullWidth onClick={submit} disabled={!canSubmit || submitting}>
            Entrar
          </Button>
          <div className="text-center text-sm text-slate-600">
            <Link to="/esqueci-senha" className="font-medium text-slate-900 hover:underline">
              Esqueci minha senha
            </Link>
          </div>
          {canResend ? (
            <Button fullWidth variant="secondary" onClick={resend} disabled={resending}>
              Reenviar email de confirmação
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
