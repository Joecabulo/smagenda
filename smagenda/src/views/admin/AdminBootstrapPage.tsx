import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { supabase } from '../../lib/supabase'

export function AdminBootstrapPage() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('lucioianael@gmail.com')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [sql, setSql] = useState<string | null>(null)

  const canSubmit = useMemo(() => email.trim() && password.trim(), [email, password])

  const ensureAuthenticated = async (): Promise<string> => {
    const { data } = await supabase.auth.getSession()
    const existingUserId = data.session?.user?.id
    if (existingUserId) return existingUserId

    const signInRes = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInRes.error) {
      const signUpRes = await supabase.auth.signUp({ email: email.trim(), password })
      if (signUpRes.error) {
        throw new Error(signInRes.error.message)
      }

      const retryRes = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (retryRes.error) throw new Error(retryRes.error.message)
      const retryUserId = retryRes.data.user?.id
      if (!retryUserId) throw new Error('Falha ao autenticar')
      return retryUserId
    }
    const userId = signInRes.data.user?.id
    if (!userId) throw new Error('Falha ao autenticar')
    return userId
  }

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
    setSubmitting(true)
    setError(null)
    setInfo(null)
    setSuccess(false)
    setSql(null)

    try {
      const userId = await ensureAuthenticated()
      setUserId(userId)

      const { data: existing, error: readErr } = await supabase.from('super_admin').select('id').eq('id', userId).maybeSingle()
      if (readErr) {
        const msg = readErr.message
        const missingTable = msg.includes("Could not find the table 'public.super_admin'") || msg.includes('schema cache')
        if (missingTable) {
          setError('Tabela super_admin não existe no Supabase.')
          setSql(buildCreateTableSql(email.trim()))
          return
        }
        throw new Error(msg)
      }

      if (!existing) {
        const { error: insertErr } = await supabase
          .from('super_admin')
          .insert({ id: userId, nome: 'Super Admin', email: email.trim(), nivel: 'super_admin' })
        if (insertErr) {
          setError('Usuário autenticado, mas não está cadastrado como Super Admin.')
          setSql(buildInsertSql(email.trim()))
          return
        }
      }

      setSuccess(true)
      navigate('/admin/dashboard', { replace: true })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao criar Super Admin'
      const notConfirmed = msg.toLowerCase().includes('confirm')
      setError(notConfirmed ? 'Email não confirmado. Reenvie o email de confirmação ou confirme no Supabase.' : msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div>
          <div className="text-xs font-semibold tracking-wide text-slate-500">SMagenda</div>
          <div className="text-2xl font-semibold text-slate-900">Bootstrap Super Admin (DEV)</div>
        </div>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
        {info ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div> : null}
        {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Criado.</div> : null}
        {userId ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            Seu <span className="font-mono text-xs">user_id</span>: <span className="font-mono text-xs">{userId}</span>
          </div>
        ) : null}

        <Card>
          <div className="p-6 space-y-4">
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            <Input label="Senha" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" />
            <Button fullWidth onClick={submit} disabled={!canSubmit || submitting}>
              Entrar e checar Super Admin
            </Button>
            {canResend ? (
              <Button fullWidth variant="secondary" onClick={resend} disabled={resending}>
                Reenviar email de confirmação
              </Button>
            ) : null}
          </div>
        </Card>

        {sql ? (
          <Card>
            <div className="p-6 space-y-3">
              <div className="text-sm font-semibold text-slate-900">SQL para rodar no Supabase</div>
              <pre className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 overflow-auto">{sql}</pre>
              <div className="text-sm text-slate-700">Depois de executar, tente novamente o login em /admin/login.</div>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function buildCreateTableSql(email: string) {
  const safeEmail = email.replace(/'/g, "''")
  return `create table if not exists public.super_admin (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default 'Super Admin',
  email text not null unique,
  nivel text not null default 'super_admin',
  criado_em timestamptz not null default now()
);

alter table public.super_admin enable row level security;

drop policy if exists "super_admin_select_own" on public.super_admin;
create policy "super_admin_select_own" on public.super_admin
for select to authenticated
using (id = auth.uid());

drop policy if exists "super_admin_insert_first" on public.super_admin;
create policy "super_admin_insert_first" on public.super_admin
for insert to authenticated
with check (id = auth.uid() and not exists (select 1 from public.super_admin));

insert into public.super_admin (id, nome, email, nivel)
select u.id, 'Super Admin', u.email, 'super_admin'
from auth.users u
where u.email = '${safeEmail}'
on conflict (id) do nothing;`
}

function buildInsertSql(email: string) {
  const safeEmail = email.replace(/'/g, "''")
  return `drop policy if exists "super_admin_insert_first" on public.super_admin;
create policy "super_admin_insert_first" on public.super_admin
for insert to authenticated
with check (id = auth.uid() and not exists (select 1 from public.super_admin));

insert into public.super_admin (id, nome, email, nivel)
select u.id, 'Super Admin', u.email, 'super_admin'
from auth.users u
where u.email = '${safeEmail}'
on conflict (id) do nothing;`
}
