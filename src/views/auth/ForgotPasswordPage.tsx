import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { supabase } from '../../lib/supabase'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const canSubmit = useMemo(() => email.trim(), [email])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSent(false)

    const redirectTo = `${window.location.origin}/resetar-senha`
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
    if (err) {
      setError(err.message)
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold text-slate-900">Recuperar senha</div>
          <div className="text-sm text-slate-600">Envie um link para criar uma nova senha</div>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />

            {error ? <div className="text-sm text-rose-600">{error}</div> : null}
            {sent ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Enviamos um link para seu email. Verifique a caixa de entrada e spam.
              </div>
            ) : null}

            <Button type="submit" fullWidth disabled={!canSubmit || submitting}>
              Enviar link
            </Button>
          </div>

          <div className="mt-4 text-center text-sm text-slate-600">
            <Link to="/login" className="font-medium text-slate-900 hover:underline">
              Voltar para login
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

