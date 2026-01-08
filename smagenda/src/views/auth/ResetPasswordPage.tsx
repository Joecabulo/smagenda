import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { supabase } from '../../lib/supabase'

export function ResetPasswordPage() {
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const canSubmit = useMemo(() => password.trim().length >= 8 && password === confirm, [password, confirm])

  useEffect(() => {
    const run = async () => {
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      if (code) {
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeErr) {
          setError(exchangeErr.message)
          setLoading(false)
          return
        }
      }

      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        setError('Link inválido ou expirado. Solicite um novo link de recuperação.')
        setLoading(false)
        return
      }

      setLoading(false)
    }

    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao validar link')
      setLoading(false)
    })
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    const { error: updateErr } = await supabase.auth.updateUser({ password })
    if (updateErr) {
      setError(updateErr.message)
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    setSuccess(true)

    setTimeout(() => {
      navigate('/login', { replace: true })
    }, 800)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold text-slate-900">Criar nova senha</div>
          <div className="text-sm text-slate-600">Defina uma nova senha para sua conta</div>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            {loading ? <div className="text-sm text-slate-600">Validando link…</div> : null}
            {!loading ? (
              <>
                <Input
                  label="Nova senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                />
                <Input
                  label="Confirmar senha"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                />
              </>
            ) : null}

            {error ? <div className="text-sm text-rose-600">{error}</div> : null}
            {success ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Senha atualizada. Redirecionando…
              </div>
            ) : null}

            <Button type="submit" fullWidth disabled={loading || !canSubmit || submitting}>
              Salvar nova senha
            </Button>
          </div>

          <div className="mt-4 text-center text-sm text-slate-600">
            <Link to="/esqueci-senha" className="font-medium text-slate-900 hover:underline">
              Solicitar novo link
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

