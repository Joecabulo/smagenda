import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { supabaseEnv } from '../../lib/supabase'
import { slugify } from '../../lib/slug'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuth } from '../../state/auth/useAuth'

const MIN_PASSWORD_LENGTH = 11
const TERMS_VERSION = '2026-01-11'
const PRIVACY_VERSION = '2026-01-11'

export function CadastroPage() {
  const navigate = useNavigate()
  const { refresh } = useAuth()

  const [nomeCompleto, setNomeCompleto] = useState('')
  const [nomeNegocio, setNomeNegocio] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cupomConvite, setCupomConvite] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [slug, setSlug] = useState('')
  const [acceptedLegal, setAcceptedLegal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [diagnostico, setDiagnostico] = useState<string | null>(null)

  const derivedSlug = useMemo(() => (slug ? slugify(slug) : slugify(nomeNegocio)), [slug, nomeNegocio])
  const showDiagnostico = useMemo(() => {
    if (!import.meta.env.DEV) return false
    return new URLSearchParams(window.location.search).get('debug') === '1'
  }, [])
  const canSubmit = useMemo(
    () =>
      nomeCompleto.trim() &&
      nomeNegocio.trim() &&
      email.trim() &&
      senha.trim().length >= MIN_PASSWORD_LENGTH &&
      derivedSlug.trim() &&
      acceptedLegal,
    [nomeCompleto, nomeNegocio, email, senha, derivedSlug, acceptedLegal]
  )

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setInfo(null)
    setDiagnostico(null)

    if (!acceptedLegal) {
      setError('Você precisa aceitar os Termos de Uso e a Política de Privacidade para criar a conta.')
      setSubmitting(false)
      return
    }

    const cleanEmail = email.trim().toLowerCase()
    const cleanPassword = senha
    const cleanNomeCompleto = nomeCompleto.trim()
    const cleanNomeNegocio = nomeNegocio.trim()
    const cleanTelefone = telefone.trim() || null
    const cleanCupomConvite = cupomConvite.trim() || null
    const acceptedAt = new Date().toISOString()
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''

    if (!supabaseEnv.ok) {
      setError(`Supabase não configurado. Faltando: ${supabaseEnv.missing.join(', ')}`)
      setSubmitting(false)
      return
    }

    const redirectTo = `${window.location.origin}/login?type=signup`

    try {
      const res = await fetch(`${supabaseEnv.values.VITE_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/settings`, {
        headers: {
          apikey: supabaseEnv.values.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${supabaseEnv.values.VITE_SUPABASE_ANON_KEY}`,
        },
      })
      if (!res.ok) {
        setError(`Falha ao conectar no Supabase (HTTP ${res.status}). Verifique URL e chave.`)
        setSubmitting(false)
        return
      }
      const json = (await res.json().catch(() => null)) as
        | { disable_signup?: boolean; external?: { email?: boolean }; mailer_autoconfirm?: boolean }
        | null
      if (json) {
        const host = (() => {
          try {
            return new URL(supabaseEnv.values.VITE_SUPABASE_URL).host
          } catch {
            return supabaseEnv.values.VITE_SUPABASE_URL
          }
        })()
        const emailOn = json.external?.email === true
        const signupOff = json.disable_signup === true
        const autoConfirm = json.mailer_autoconfirm === true
        setDiagnostico(
          `Supabase=${host} • Conexão OK • Email=${emailOn ? 'on' : 'off'} • Signup=${signupOff ? 'off' : 'on'} • AutoConfirm=${autoConfirm ? 'on' : 'off'}${
            emailOn && !autoConfirm
              ? ' • Dica: se o email não chega, configure SMTP (Resend) em Authentication → SMTP Settings e valide em /admin/configuracoes.'
              : ''
          }`
        )
        if (signupOff) {
          setError('O cadastro está desabilitado no Supabase (disable_signup=true).')
          setSubmitting(false)
          return
        }
        if (!emailOn && !autoConfirm) {
          setError(
            'O provedor de Email está desativado no Supabase. Ative em Authentication → Providers → Email. Depois, tente novamente.'
          )
          setSubmitting(false)
          return
        }
      }
    } catch {
      setError('Falha de rede ao conectar no Supabase. Verifique sua conexão e a URL do Supabase.')
      setSubmitting(false)
      return
    }
    let signUpRes: Awaited<ReturnType<typeof supabase.auth.signUp>> | null = null
    try {
      signUpRes = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            nome_completo: cleanNomeCompleto,
            nome_negocio: cleanNomeNegocio,
            telefone: cleanTelefone,
            cupom_convite: cleanCupomConvite,
            slug: derivedSlug,
            termos_versao: TERMS_VERSION,
            privacidade_versao: PRIVACY_VERSION,
            legal_aceite_em: acceptedAt,
            legal_user_agent: userAgent,
          },
        },
      })
    } catch {
      setError('Falha ao comunicar com o Supabase. Verifique as variáveis de ambiente e a rede.')
      setSubmitting(false)
      return
    }
    const data = signUpRes?.data
    const signUpError = signUpRes?.error
    if (!data) {
      setError('Falha ao criar usuário (resposta inválida do Supabase).')
      setSubmitting(false)
      return
    }

    if (signUpError) {
      const msg = signUpError.message
      const lower = msg.toLowerCase()
      const tooShort = lower.includes('password') && lower.includes('at least')
      const alreadyRegistered = lower.includes('already') || lower.includes('registered') || lower.includes('exists')
      const redirectInvalid = lower.includes('redirect') || lower.includes('url')
      const captcha = lower.includes('captcha')
      if (alreadyRegistered) {
        setInfo('Este email já possui conta. Se ainda não recebeu a confirmação, clique em Reenviar confirmação.')
        setSubmitting(false)
        return
      }
      if (redirectInvalid) {
        setError(`O Supabase rejeitou a URL de redirecionamento. Adicione nas Redirect URLs: ${redirectTo}`)
        setSubmitting(false)
        return
      }
      if (captcha) {
        setError('O Supabase está exigindo CAPTCHA no cadastro e o app ainda não envia o token. Desative CAPTCHA no Auth ou adicione suporte no app.')
        setSubmitting(false)
        return
      }

      setError(tooShort ? `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.` : msg)
      setSubmitting(false)
      return
    }

    const userId = data.user?.id
    if (!userId) {
      setError('Falha ao criar usuário')
      setSubmitting(false)
      return
    }

    if (!data.session) {
      const confirmationSentAt = (data.user as unknown as { confirmation_sent_at?: string | null } | null)?.confirmation_sent_at
      if (!confirmationSentAt) {
        const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email: cleanEmail, options: { emailRedirectTo: redirectTo } })
        if (resendErr) {
          setError(resendErr.message)
          setSubmitting(false)
          return
        }
      }

      setInfo('Conta criada. Enviamos um email de confirmação. Verifique sua caixa de entrada e spam.')
      setSubmitting(false)
      return
    }

    const { data: usuarioRow, error: usuarioErr } = await supabase.from('usuarios').select('id').eq('id', userId).maybeSingle()
    if (usuarioErr) {
      setError(usuarioErr.message)
      setSubmitting(false)
      return
    }
    if (!usuarioRow) {
      await supabase.rpc('ensure_usuario_profile')
      const { data: usuarioRow2 } = await supabase.from('usuarios').select('id').eq('id', userId).maybeSingle()
      if (!usuarioRow2) {
        setError('Cadastro criado, mas o perfil do usuário não foi configurado no Supabase.')
        setSubmitting(false)
        return
      }
    }

    const { error: acceptErr } = await supabase.rpc('accept_legal_terms', {
      p_terms_version: TERMS_VERSION,
      p_privacy_version: PRIVACY_VERSION,
    })
    if (acceptErr) {
      const msg = acceptErr.message
      const lower = msg.toLowerCase()
      const missingFn = lower.includes('accept_legal_terms') && (lower.includes('function') || lower.includes('rpc'))
      const missingCols = lower.includes('termos_aceitos_em') || lower.includes('privacidade_aceita_em')

      if (missingFn || missingCols) {
        setInfo(
          'Conta criada. Para registrar o aceite no perfil do usuário, rode o SQL de Termos/Privacidade em /admin/configuracoes (Super Admin).'
        )
      }
    }

    await refresh()
    navigate('/onboarding', { replace: true })
    setSubmitting(false)
  }

  const resendConfirm = async () => {
    setSubmitting(true)
    setError(null)
    setDiagnostico(null)
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
      if (emailOn && !autoConfirm) {
        setDiagnostico('Dica: se o email não chega, configure SMTP (Resend) em Authentication → SMTP Settings e valide em /admin/configuracoes.')
      }
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

    const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email: cleanEmail, options: { emailRedirectTo: redirectTo } })
    if (resendErr) {
      setError(resendErr.message)
      setSubmitting(false)
      return
    }
    setInfo('Email de confirmação reenviado. Verifique sua caixa de entrada e spam.')
    setSubmitting(false)
  }

  const canResend = useMemo(() => Boolean(email.trim()) && (info !== null || error?.toLowerCase().includes('confirm') === true), [email, error, info])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold text-slate-900">Criar conta</div>
          <div className="text-sm text-slate-600">Setup em menos de 10 minutos</div>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <Input label="Nome completo" value={nomeCompleto} onChange={(e) => setNomeCompleto(e.target.value)} />
            <Input label="Nome do negócio" value={nomeNegocio} onChange={(e) => setNomeNegocio(e.target.value)} />
            <Input label="Telefone (com WhatsApp)" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            <Input label="Cupom de convite" value={cupomConvite} onChange={(e) => setCupomConvite(e.target.value)} />
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
            <div className="space-y-1">
              <Input
                label="Senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
              />
              <div className="text-xs text-slate-600">Mínimo: {MIN_PASSWORD_LENGTH} caracteres.</div>
            </div>
            <Input label="Slug (editável)" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={derivedSlug} />
            <div className="text-xs text-slate-600">Seu link ficará: /agendar/{derivedSlug}</div>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={acceptedLegal}
                onChange={(e) => setAcceptedLegal(e.target.checked)}
              />
              <span>
                Eu li e aceito os{' '}
                <a className="font-medium text-slate-900 hover:underline" href="/termos" target="_blank" rel="noreferrer">
                  Termos de Uso
                </a>{' '}
                e a{' '}
                <a className="font-medium text-slate-900 hover:underline" href="/privacidade" target="_blank" rel="noreferrer">
                  Política de Privacidade
                </a>
                .
              </span>
            </label>

            {info ? <div className="text-sm text-emerald-700">{info}</div> : null}
            {showDiagnostico && diagnostico ? <div className="text-xs text-slate-600">{diagnostico}</div> : null}
            {error ? <div className="text-sm text-rose-600">{error}</div> : null}

            <Button type="submit" fullWidth disabled={!canSubmit || submitting}>
              Criar conta grátis
            </Button>

            {canResend ? (
              <Button type="button" fullWidth variant="secondary" disabled={!email.trim() || submitting} onClick={resendConfirm}>
                Reenviar confirmação
              </Button>
            ) : null}
          </div>

          <div className="mt-4 text-center text-sm text-slate-600">
            Já tem conta?{' '}
            <Link to="/login" className="font-medium text-slate-900 hover:underline">
              Entrar
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
