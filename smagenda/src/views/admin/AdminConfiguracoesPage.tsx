import { useEffect, useMemo, useState } from 'react'
import { AdminShell } from '../../components/layout/AdminShell'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { supabase, supabaseEnv } from '../../lib/supabase'

function SqlCard({ title, description, sql, defaultOpen }: { title: string; description: string; sql: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen))
  return (
    <Card>
      <div className="p-6 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="text-sm text-slate-600">{description}</div>
          </div>
          <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
            {open ? 'Ocultar' : 'Mostrar'}
          </Button>
        </div>

        {open ? (
          <pre className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 overflow-auto">{sql}</pre>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
            Clique em “Mostrar” para ver o SQL.
          </div>
        )}
      </div>
    </Card>
  )
}

export function AdminConfiguracoesPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  const supabaseProjectUrl = supabaseEnv.ok
    ? supabaseEnv.values.VITE_SUPABASE_URL.replace(/\/$/, '')
    : 'https://<PROJECT_REF>.supabase.co'
  const supabaseAnonKey = supabaseEnv.ok ? supabaseEnv.values.VITE_SUPABASE_ANON_KEY : '<SUPABASE_ANON_KEY>'

  const [resendDomain, setResendDomain] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)
  const [resendResult, setResendResult] = useState<
    | null
    | {
        domain?: { id?: string | null; name?: string | null; status?: string | null; region?: string | null }
        dns?: {
          checked_at?: string | null
          nameservers?: string[]
          records?: Array<{
            record?: string | null
            name?: string
            type?: string
            fqdn?: string | null
            expected?: { value?: string | null; priority?: number | null }
            dns?: { found?: boolean; match?: boolean; values?: string[] }
            hint?: string | null
            resendStatus?: string | null
          }>
        }
        error?: string
        message?: string
      }
  >(null)

  const [resendTestFrom, setResendTestFrom] = useState('')
  const [resendTestTo, setResendTestTo] = useState('')
  const [resendTestSubject, setResendTestSubject] = useState('')
  const [resendTestSending, setResendTestSending] = useState(false)
  const [resendTestError, setResendTestError] = useState<string | null>(null)
  const [resendTestResult, setResendTestResult] = useState<unknown>(null)

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession()
      setUserId(data.session?.user?.id ?? null)
      const sessionEmail = data.session?.user?.email ?? null
      setEmail(sessionEmail)
      if (sessionEmail && !resendTestTo) setResendTestTo(sessionEmail)

      const host = window.location.hostname
      if (host && host !== 'localhost' && host !== '127.0.0.1' && host.includes('.') && !resendDomain) {
        setResendDomain(host)
      }
      if (host && host !== 'localhost' && host !== '127.0.0.1' && host.includes('.') && !resendTestFrom) {
        setResendTestFrom(`SMagenda <no-reply@${host}>`)
      }
    }
    run().catch(() => undefined)
  }, [resendDomain, resendTestFrom, resendTestTo])

  const sendResendTest = async () => {
    setResendTestSending(true)
    setResendTestError(null)
    setResendTestResult(null)

    if (!supabaseEnv.ok) {
      setResendTestError(`Supabase não configurado. Faltando: ${supabaseEnv.missing.join(', ')}`)
      setResendTestSending(false)
      return
    }

    const domain = resendDomain.trim().toLowerCase()
    if (!domain) {
      setResendTestError('Informe o domínio (ex.: smagenda.com.br).')
      setResendTestSending(false)
      return
    }

    const from = resendTestFrom.trim()
    const to = resendTestTo.trim()
    if (!from || !to) {
      setResendTestError('Informe remetente e destinatário.')
      setResendTestSending(false)
      return
    }

    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token ?? null
    if (!accessToken) {
      setResendTestError('Sessão expirada. Faça login novamente.')
      setResendTestSending(false)
      return
    }

    const fnUrl = `${supabaseEnv.values.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/resend-domain`
    const subject = resendTestSubject.trim() || 'Teste de email (Resend) — SMagenda'
    const text = `Teste real de envio via Resend em ${new Date().toISOString()}`

    try {
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseEnv.values.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ domain, action: 'send_test', from, to, subject, text }),
      })
      const json = (await res.json().catch(() => null)) as unknown
      if (!res.ok) {
        const obj = json && typeof json === 'object' ? (json as Record<string, unknown>) : null
        const msg = (typeof obj?.message === 'string' && obj.message) || (typeof obj?.error === 'string' && obj.error) || `HTTP ${res.status}`
        setResendTestError(String(msg))
        setResendTestResult(json)
        setResendTestSending(false)
        return
      }

      setResendTestResult(json)
      setResendTestSending(false)
    } catch (e: unknown) {
      setResendTestError(e instanceof Error ? e.message : 'Falha de rede ao enviar email')
      setResendTestSending(false)
    }
  }

  const runResend = async (action: 'status' | 'verify') => {
    setResendLoading(true)
    setResendError(null)
    setResendResult(null)

    if (!supabaseEnv.ok) {
      setResendError(`Supabase não configurado. Faltando: ${supabaseEnv.missing.join(', ')}`)
      setResendLoading(false)
      return
    }

    const domain = resendDomain.trim().toLowerCase()
    if (!domain) {
      setResendError('Informe o domínio (ex.: smagenda.com.br).')
      setResendLoading(false)
      return
    }

    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token ?? null
    if (!accessToken) {
      setResendError('Sessão expirada. Faça login novamente.')
      setResendLoading(false)
      return
    }

    const fnUrl = `${supabaseEnv.values.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/resend-domain`

    try {
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseEnv.values.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ domain, action }),
      })
      const json = (await res.json().catch(() => null)) as typeof resendResult
      if (!res.ok) {
        const msg = (json as { message?: string | null })?.message ?? (json as { error?: string | null })?.error ?? `HTTP ${res.status}`
        setResendError(String(msg))
        setResendResult(json)
        setResendLoading(false)
        return
      }

      setResendResult(json)
      setResendLoading(false)
    } catch (e: unknown) {
      setResendError(e instanceof Error ? e.message : 'Falha de rede ao checar DNS')
      setResendLoading(false)
    }
  }

  const sql = useMemo(() => {
    return `create or replace function public.is_super_admin() returns boolean
language sql stable as $$
  select exists (select 1 from public.super_admin sa where sa.id = auth.uid())
$$;

alter table public.usuarios enable row level security;
alter table public.funcionarios enable row level security;
alter table public.servicos enable row level security;
alter table public.agendamentos enable row level security;
alter table public.bloqueios enable row level security;

drop policy if exists "super_admin_full_usuarios" on public.usuarios;
create policy "super_admin_full_usuarios" on public.usuarios
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "super_admin_full_funcionarios" on public.funcionarios;
create policy "super_admin_full_funcionarios" on public.funcionarios
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "super_admin_full_servicos" on public.servicos;
create policy "super_admin_full_servicos" on public.servicos
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "super_admin_full_agendamentos" on public.agendamentos;
create policy "super_admin_full_agendamentos" on public.agendamentos
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "super_admin_full_bloqueios" on public.bloqueios;
create policy "super_admin_full_bloqueios" on public.bloqueios
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());`
  }, [])

  const sqlTrial = useMemo(() => {
    return `alter table public.usuarios add column if not exists data_vencimento date;

create or replace function public.ensure_usuario_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  jwt jsonb := auth.jwt();
  meta jsonb := coalesce(jwt -> 'user_metadata', '{}'::jsonb);
  v_nome text := coalesce(nullif(meta ->> 'nome_completo', ''), null);
  v_negocio text := coalesce(nullif(meta ->> 'nome_negocio', ''), null);
  v_slug text := coalesce(nullif(meta ->> 'slug', ''), null);
  v_telefone text := nullif(meta ->> 'telefone', '');
  v_email text := nullif(jwt ->> 'email', '');
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if nullif(meta ->> 'usuario_master_id', '') is not null then
    return;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'funcionarios') then
    if exists (select 1 from public.funcionarios f where f.id = uid) then
      return;
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'super_admin') then
    if exists (select 1 from public.super_admin sa where sa.id = uid) then
      return;
    end if;
  end if;

  if v_email is null then
    begin
      select u.email into v_email
      from auth.users u
      where u.id = uid;
    exception
      when others then
        v_email := null;
    end;
  end if;

  if v_email is null then
    return;
  end if;

  if v_nome is null then
    v_nome := nullif(split_part(v_email, '@', 1), '');
  end if;

  if v_negocio is null then
    v_negocio := v_nome;
  end if;

  if v_slug is null then
    v_slug := nullif(regexp_replace(lower(split_part(v_email, '@', 1)), '[^a-z0-9]+', '-', 'g'), '');
  end if;

  if v_slug is null then
    v_slug := 'u-' || substring(replace(uid::text, '-', '') from 1 for 8);
  end if;

  if exists (select 1 from public.usuarios u where u.slug = v_slug and u.id <> uid) then
    v_slug := v_slug || '-' || substring(replace(uid::text, '-', '') from 1 for 6);
  end if;

  insert into public.usuarios (
    id, nome_completo, nome_negocio, telefone, email, slug,
    plano, tipo_conta, limite_funcionarios, status_pagamento, data_vencimento, ativo
  )
  values (
    uid, v_nome, v_negocio, v_telefone, v_email, v_slug,
    'free', 'master', 1, 'trial', (current_date + 15), true
  )
  on conflict (id) do update
  set
    nome_completo = coalesce(public.usuarios.nome_completo, excluded.nome_completo),
    nome_negocio = coalesce(public.usuarios.nome_negocio, excluded.nome_negocio),
    telefone = coalesce(public.usuarios.telefone, excluded.telefone),
    email = coalesce(public.usuarios.email, excluded.email),
    slug = coalesce(public.usuarios.slug, excluded.slug),
    limite_funcionarios = coalesce(public.usuarios.limite_funcionarios, excluded.limite_funcionarios),
    data_vencimento = coalesce(public.usuarios.data_vencimento, excluded.data_vencimento);
end;
$$;

revoke all on function public.ensure_usuario_profile() from public;
grant execute on function public.ensure_usuario_profile() to authenticated;

update public.usuarios
set limite_funcionarios = 1
where status_pagamento = 'trial'
  and (limite_funcionarios is null or limite_funcionarios < 1);

update public.usuarios
set data_vencimento = current_date + 15
where status_pagamento = 'trial'
  and data_vencimento is null;`
  }, [])

  const sqlPaymentsStripe = useMemo(() => {
    return `alter table public.usuarios add column if not exists free_trial_consumido boolean not null default false;
alter table public.usuarios add column if not exists stripe_customer_id text;
alter table public.usuarios add column if not exists stripe_subscription_id text;
alter table public.usuarios add column if not exists stripe_checkout_session_id text;
alter table public.usuarios add column if not exists stripe_last_event_id text;
alter table public.usuarios add column if not exists stripe_last_event_at timestamptz;

update public.usuarios
set free_trial_consumido = true
where plano is not null
  and lower(trim(plano)) <> 'free'
  and free_trial_consumido is distinct from true;

create index if not exists usuarios_stripe_customer_id_idx on public.usuarios (stripe_customer_id);
create index if not exists usuarios_stripe_subscription_id_idx on public.usuarios (stripe_subscription_id);`
  }, [])

  const sqlRlsApp = useMemo(() => {
    return `alter table public.usuarios enable row level security;
alter table public.funcionarios enable row level security;
alter table public.servicos enable row level security;
alter table public.agendamentos enable row level security;
alter table public.bloqueios enable row level security;

alter table public.servicos add column if not exists taxa_agendamento numeric not null default 0;

create table if not exists public.super_admin (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default 'Super Admin',
  email text null,
  nivel text not null default 'super_admin',
  criado_em timestamptz not null default now(),
  whatsapp_api_url text,
  whatsapp_api_key text,
  whatsapp_instance_name text
);

alter table public.super_admin enable row level security;

drop policy if exists "super_admin_self_select" on public.super_admin;
create policy "super_admin_self_select" on public.super_admin
for select to authenticated
using (id = auth.uid());

drop policy if exists "super_admin_self_insert" on public.super_admin;
create policy "super_admin_self_insert" on public.super_admin
for insert to authenticated
with check (id = auth.uid());

drop policy if exists "super_admin_self_update" on public.super_admin;
create policy "super_admin_self_update" on public.super_admin
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

grant select, insert, update on public.super_admin to authenticated;

create or replace function public.is_super_admin() returns boolean
language sql stable as $$
  select exists (select 1 from public.super_admin sa where sa.id = auth.uid())
$$;

drop policy if exists "usuarios_select_self_or_master_for_funcionario" on public.usuarios;
create policy "usuarios_select_self_or_master_for_funcionario" on public.usuarios
for select to authenticated
using (
  id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1
    from public.funcionarios f
    where f.id = auth.uid()
      and f.usuario_master_id = usuarios.id
      and f.ativo = true
  )
);

drop policy if exists "usuarios_update_self" on public.usuarios;
create policy "usuarios_update_self" on public.usuarios
for update to authenticated
using (
  id = auth.uid()
  or public.is_super_admin()
)
with check (
  id = auth.uid()
  or public.is_super_admin()
);

drop policy if exists "funcionarios_select_master_or_self" on public.funcionarios;
create policy "funcionarios_select_master_or_self" on public.funcionarios
for select to authenticated
using (
  usuario_master_id = auth.uid()
  or public.is_super_admin()
  or id = auth.uid()
);

drop policy if exists "funcionarios_insert_master" on public.funcionarios;
create policy "funcionarios_insert_master" on public.funcionarios
for insert to authenticated
with check (
  usuario_master_id = auth.uid()
  or public.is_super_admin()
);

drop policy if exists "funcionarios_update_master" on public.funcionarios;
create policy "funcionarios_update_master" on public.funcionarios
for update to authenticated
using (
  usuario_master_id = auth.uid()
  or public.is_super_admin()
)
with check (
  usuario_master_id = auth.uid()
  or public.is_super_admin()
);

drop policy if exists "funcionarios_delete_master" on public.funcionarios;
create policy "funcionarios_delete_master" on public.funcionarios
for delete to authenticated
using (
  usuario_master_id = auth.uid()
  or public.is_super_admin()
);

drop policy if exists "servicos_select_master_or_funcionario" on public.servicos;
create policy "servicos_select_master_or_funcionario" on public.servicos
for select to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1
    from public.funcionarios f
    where f.id = auth.uid()
      and f.usuario_master_id = servicos.usuario_id
      and f.ativo = true
  )
);

drop policy if exists "servicos_insert_master_or_funcionario" on public.servicos;
create policy "servicos_insert_master_or_funcionario" on public.servicos
for insert to authenticated
with check (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1
    from public.funcionarios f
    where f.id = auth.uid()
      and f.usuario_master_id = servicos.usuario_id
      and f.ativo = true
      and f.pode_gerenciar_servicos = true
  )
);

drop policy if exists "servicos_update_master_or_funcionario" on public.servicos;
create policy "servicos_update_master_or_funcionario" on public.servicos
for update to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1
    from public.funcionarios f
    where f.id = auth.uid()
      and f.usuario_master_id = servicos.usuario_id
      and f.ativo = true
      and f.pode_gerenciar_servicos = true
  )
)
with check (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1
    from public.funcionarios f
    where f.id = auth.uid()
      and f.usuario_master_id = servicos.usuario_id
      and f.ativo = true
      and f.pode_gerenciar_servicos = true
  )
);

drop policy if exists "servicos_delete_master_or_funcionario" on public.servicos;
create policy "servicos_delete_master_or_funcionario" on public.servicos
for delete to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1
    from public.funcionarios f
    where f.id = auth.uid()
      and f.usuario_master_id = servicos.usuario_id
      and f.ativo = true
      and f.pode_gerenciar_servicos = true
  )
);

drop policy if exists "agendamentos_select_master_or_funcionario" on public.agendamentos;
create policy "agendamentos_select_master_or_funcionario" on public.agendamentos
for select to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or (
    funcionario_id = auth.uid()
    and exists (
      select 1
      from public.funcionarios f
      where f.id = auth.uid()
        and f.usuario_master_id = agendamentos.usuario_id
        and f.ativo = true
        and f.pode_ver_agenda = true
    )
  )
);

drop policy if exists "agendamentos_insert_master_or_funcionario" on public.agendamentos;
create policy "agendamentos_insert_master_or_funcionario" on public.agendamentos
for insert to authenticated
with check (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or (
    funcionario_id = auth.uid()
    and exists (
      select 1
      from public.funcionarios f
      where f.id = auth.uid()
        and f.usuario_master_id = agendamentos.usuario_id
        and f.ativo = true
        and f.pode_criar_agendamentos = true
    )
  )
);

drop policy if exists "agendamentos_update_master_or_funcionario" on public.agendamentos;
create policy "agendamentos_update_master_or_funcionario" on public.agendamentos
for update to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or (
    funcionario_id = auth.uid()
    and exists (
      select 1
      from public.funcionarios f
      where f.id = auth.uid()
        and f.usuario_master_id = agendamentos.usuario_id
        and f.ativo = true
        and (f.pode_cancelar_agendamentos = true or f.pode_criar_agendamentos = true)
    )
  )
)
with check (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or (
    funcionario_id = auth.uid()
    and exists (
      select 1
      from public.funcionarios f
      where f.id = auth.uid()
        and f.usuario_master_id = agendamentos.usuario_id
        and f.ativo = true
        and (f.pode_cancelar_agendamentos = true or f.pode_criar_agendamentos = true)
    )
  )
);

drop policy if exists "agendamentos_delete_master" on public.agendamentos;
create policy "agendamentos_delete_master" on public.agendamentos
for delete to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
);

drop policy if exists "bloqueios_select_master_or_funcionario" on public.bloqueios;
create policy "bloqueios_select_master_or_funcionario" on public.bloqueios
for select to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or (
    (bloqueios.funcionario_id is null or bloqueios.funcionario_id = auth.uid())
    and exists (
      select 1
      from public.funcionarios f
      where f.id = auth.uid()
        and f.usuario_master_id = bloqueios.usuario_id
        and f.ativo = true
        and f.pode_ver_agenda = true
    )
  )
);

drop policy if exists "bloqueios_insert_master_or_funcionario" on public.bloqueios;
create policy "bloqueios_insert_master_or_funcionario" on public.bloqueios
for insert to authenticated
with check (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1
    from public.funcionarios f
    where f.id = auth.uid()
      and f.usuario_master_id = bloqueios.usuario_id
      and f.ativo = true
      and f.pode_bloquear_horarios = true
      and (bloqueios.funcionario_id = auth.uid() or (bloqueios.funcionario_id is null and f.permissao = 'admin'))
  )
);

drop policy if exists "bloqueios_update_master_or_funcionario" on public.bloqueios;
create policy "bloqueios_update_master_or_funcionario" on public.bloqueios
for update to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1
    from public.funcionarios f
    where f.id = auth.uid()
      and f.usuario_master_id = bloqueios.usuario_id
      and f.ativo = true
      and f.pode_bloquear_horarios = true
      and (bloqueios.funcionario_id = auth.uid() or (bloqueios.funcionario_id is null and f.permissao = 'admin'))
  )
)
with check (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1
    from public.funcionarios f
    where f.id = auth.uid()
      and f.usuario_master_id = bloqueios.usuario_id
      and f.ativo = true
      and f.pode_bloquear_horarios = true
      and (bloqueios.funcionario_id = auth.uid() or (bloqueios.funcionario_id is null and f.permissao = 'admin'))
  )
);

drop policy if exists "bloqueios_delete_master_or_funcionario" on public.bloqueios;
create policy "bloqueios_delete_master_or_funcionario" on public.bloqueios
for delete to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1
    from public.funcionarios f
    where f.id = auth.uid()
      and f.usuario_master_id = bloqueios.usuario_id
      and f.ativo = true
      and f.pode_bloquear_horarios = true
      and (bloqueios.funcionario_id = auth.uid() or (bloqueios.funcionario_id is null and f.permissao = 'admin'))
  )
);

grant select, update on public.usuarios to authenticated;
grant select, insert, update, delete on public.funcionarios to authenticated;
grant select, insert, update, delete on public.servicos to authenticated;
grant select, insert, update, delete on public.agendamentos to authenticated;
grant select, insert, update, delete on public.bloqueios to authenticated;`
  }, [])

  const sqlPublicOcupacoes = useMemo(() => {
    return `drop function if exists public.public_get_ocupacoes(uuid, date, uuid);

create or replace function public.public_get_ocupacoes(p_usuario_id uuid, p_data date, p_funcionario_id uuid)
returns table (start_min int, end_min int)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    floor(extract(epoch from a.hora_inicio::time) / 60)::int as start_min,
    floor(extract(epoch from coalesce(a.hora_fim, a.hora_inicio)::time) / 60)::int as end_min
  from public.agendamentos a
  where a.usuario_id = p_usuario_id
    and a.data = p_data
    and a.status <> 'cancelado'
    and (p_funcionario_id is null or a.funcionario_id is null or a.funcionario_id = p_funcionario_id)

  union all

  select
    floor(extract(epoch from b.hora_inicio::time) / 60)::int as start_min,
    floor(extract(epoch from b.hora_fim::time) / 60)::int as end_min
  from public.bloqueios b
  where b.usuario_id = p_usuario_id
    and b.data = p_data
    and (p_funcionario_id is null or b.funcionario_id is null or b.funcionario_id = p_funcionario_id);
end;
$$;

revoke all on function public.public_get_ocupacoes(uuid, date, uuid) from public;
grant execute on function public.public_get_ocupacoes(uuid, date, uuid) to anon;
grant execute on function public.public_get_ocupacoes(uuid, date, uuid) to authenticated;`
  }, [])

  const sqlTaxaAgendamento = useMemo(() => {
    return `alter table public.servicos add column if not exists taxa_agendamento numeric not null default 0;

create table if not exists public.taxa_agendamento_pagamentos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  agendamento_id uuid null references public.agendamentos(id) on delete set null,
  servico_id uuid null references public.servicos(id) on delete set null,
  funcionario_id uuid null references public.funcionarios(id) on delete set null,
  cliente_nome text null,
  cliente_telefone text null,
  valor numeric not null default 0,
  moeda text not null default 'brl',
  status text not null default 'pendente',
  stripe_checkout_session_id text null,
  stripe_payment_intent_id text null,
  pago_em timestamptz null,
  credito_em timestamptz null,
  usado_em timestamptz null,
  utilizado_em_agendamento_id uuid null references public.agendamentos(id) on delete set null
);

do $$
begin
  if to_regclass('public.unidades') is null then
    alter table public.taxa_agendamento_pagamentos add column if not exists unidade_id uuid;
  else
    alter table public.taxa_agendamento_pagamentos add column if not exists unidade_id uuid references public.unidades(id) on delete set null;
  end if;
end;
$$;

create index if not exists taxa_agendamento_pagamentos_usuario_idx on public.taxa_agendamento_pagamentos (usuario_id, status, criado_em desc);
create index if not exists taxa_agendamento_pagamentos_cliente_idx on public.taxa_agendamento_pagamentos (usuario_id, cliente_telefone, status, criado_em desc);
create unique index if not exists taxa_agendamento_pagamentos_stripe_session_unique on public.taxa_agendamento_pagamentos (stripe_checkout_session_id) where stripe_checkout_session_id is not null;

alter table public.taxa_agendamento_pagamentos enable row level security;

drop policy if exists "taxa_agendamento_pagamentos_select_master_or_funcionario" on public.taxa_agendamento_pagamentos;
create policy "taxa_agendamento_pagamentos_select_master_or_funcionario" on public.taxa_agendamento_pagamentos
for select to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1
    from public.funcionarios f
    where f.id = auth.uid()
      and f.usuario_master_id = taxa_agendamento_pagamentos.usuario_id
      and f.ativo = true
      and f.pode_ver_financeiro = true
  )
);

grant select on public.taxa_agendamento_pagamentos to authenticated;

create or replace function public.agendamentos_tornar_taxa_credito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' then
    if lower(coalesce(NEW.status::text, '')) in ('nao_compareceu', 'não_compareceu', 'no_show')
      and lower(coalesce(OLD.status::text, '')) not in ('nao_compareceu', 'não_compareceu', 'no_show') then
      update public.taxa_agendamento_pagamentos
      set status = 'credito', credito_em = now()
      where agendamento_id = NEW.id
        and status = 'pago';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists agendamentos_tornar_taxa_credito_trg on public.agendamentos;
create trigger agendamentos_tornar_taxa_credito_trg
after update of status on public.agendamentos
for each row execute function public.agendamentos_tornar_taxa_credito();

create or replace function public.consume_taxa_agendamento_credito(p_usuario_id uuid, p_cliente_telefone text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_usuario_id is null or nullif(trim(coalesce(p_cliente_telefone, '')), '') is null then
    return null;
  end if;

  select t.id
  into v_id
  from public.taxa_agendamento_pagamentos t
  where t.usuario_id = p_usuario_id
    and t.cliente_telefone = p_cliente_telefone
    and t.status = 'credito'
  order by t.criado_em asc
  for update skip locked
  limit 1;

  if v_id is null then
    return null;
  end if;

  update public.taxa_agendamento_pagamentos
  set status = 'reservado'
  where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.consume_taxa_agendamento_credito(uuid, text) from public;
grant execute on function public.consume_taxa_agendamento_credito(uuid, text) to service_role;

drop function if exists public.public_get_servicos_publicos(uuid);

create or replace function public.public_get_servicos_publicos(p_usuario_id uuid)
returns table (
  id uuid,
  nome text,
  descricao text,
  duracao_minutos int,
  preco numeric,
  taxa_agendamento numeric,
  cor text,
  foto_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select s.id::uuid, s.nome::text, s.descricao::text, s.duracao_minutos::int, s.preco::numeric, s.taxa_agendamento::numeric, s.cor::text, s.foto_url::text
  from public.servicos s
  where s.usuario_id = p_usuario_id
    and s.ativo = true
  order by s.ordem asc nulls last, s.criado_em asc;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'public_create_agendamento_publico'
      and p.proargtypes = '2950 1082 25 2950 25 25 2950 25'::oidvector
  ) and exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'public_create_agendamento_publico'
      and p.proargtypes = '2950 1082 25 2950 25 25 2950'::oidvector
  ) then
    execute $fn$
      create function public.public_create_agendamento_publico(
        p_usuario_id uuid,
        p_data date,
        p_hora_inicio text,
        p_servico_id uuid,
        p_cliente_nome text,
        p_cliente_telefone text,
        p_funcionario_id uuid,
        p_status text default 'confirmado'
      )
      returns uuid
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        v_created_id uuid;
        v_status text;
      begin
        v_status := lower(coalesce(nullif(trim(coalesce(p_status, '')), ''), 'confirmado'));
        if v_status not in ('confirmado', 'pendente') then
          raise exception 'status_invalido';
        end if;

        v_created_id := public.public_create_agendamento_publico(
          p_usuario_id,
          p_data,
          p_hora_inicio,
          p_servico_id,
          p_cliente_nome,
          p_cliente_telefone,
          p_funcionario_id
        );

        update public.agendamentos
        set status = v_status
        where id = v_created_id
          and usuario_id = p_usuario_id;

        return v_created_id;
      end;
      $body$;
    $fn$;
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'public_create_agendamento_publico'
      and p.proargtypes = '2950 1082 25 2950 25 25 2950 2950 25'::oidvector
  ) and exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'public_create_agendamento_publico'
      and p.proargtypes = '2950 1082 25 2950 25 25 2950 2950'::oidvector
  ) then
    execute $fn$
      create function public.public_create_agendamento_publico(
        p_usuario_id uuid,
        p_data date,
        p_hora_inicio text,
        p_servico_id uuid,
        p_cliente_nome text,
        p_cliente_telefone text,
        p_funcionario_id uuid,
        p_unidade_id uuid default null,
        p_status text default 'confirmado'
      )
      returns uuid
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        v_created_id uuid;
        v_status text;
      begin
        v_status := lower(coalesce(nullif(trim(coalesce(p_status, '')), ''), 'confirmado'));
        if v_status not in ('confirmado', 'pendente') then
          raise exception 'status_invalido';
        end if;

        v_created_id := public.public_create_agendamento_publico(
          p_usuario_id,
          p_data,
          p_hora_inicio,
          p_servico_id,
          p_cliente_nome,
          p_cliente_telefone,
          p_funcionario_id,
          p_unidade_id
        );

        update public.agendamentos
        set status = v_status
        where id = v_created_id
          and usuario_id = p_usuario_id;

        return v_created_id;
      end;
      $body$;
    $fn$;
  end if;
end;
$$;`
  }, [])

  const sqlPublicBooking = useMemo(() => {
    return `drop function if exists public.public_get_usuario_publico(text);
drop function if exists public.public_get_servicos_publicos(uuid);
drop function if exists public.public_get_funcionarios_publicos(uuid);

alter table public.usuarios add column if not exists slug text;
create unique index if not exists usuarios_slug_unique on public.usuarios (slug);

alter table public.usuarios add column if not exists logo_url text;
alter table public.usuarios add column if not exists instagram_url text;
alter table public.usuarios add column if not exists tipo_negocio text;
alter table public.usuarios add column if not exists public_primary_color text;
alter table public.usuarios add column if not exists public_background_color text;
alter table public.usuarios add column if not exists public_use_background_image boolean not null default false;
alter table public.usuarios add column if not exists public_background_image_url text;
alter table public.usuarios add column if not exists timezone text;
alter table public.usuarios add column if not exists limite_agendamentos_mes int;

alter table public.servicos add column if not exists foto_url text;
alter table public.servicos add column if not exists taxa_agendamento numeric not null default 0;

create table if not exists public.taxa_agendamento_pagamentos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  agendamento_id uuid null references public.agendamentos(id) on delete set null,
  servico_id uuid null references public.servicos(id) on delete set null,
  funcionario_id uuid null references public.funcionarios(id) on delete set null,
  cliente_nome text null,
  cliente_telefone text null,
  valor numeric not null default 0,
  moeda text not null default 'brl',
  status text not null default 'pendente',
  stripe_checkout_session_id text null,
  stripe_payment_intent_id text null,
  pago_em timestamptz null,
  credito_em timestamptz null,
  usado_em timestamptz null,
  utilizado_em_agendamento_id uuid null references public.agendamentos(id) on delete set null
);

do $$
begin
  if to_regclass('public.unidades') is null then
    alter table public.taxa_agendamento_pagamentos add column if not exists unidade_id uuid;
  else
    alter table public.taxa_agendamento_pagamentos add column if not exists unidade_id uuid references public.unidades(id) on delete set null;
  end if;
end;
$$;

create index if not exists taxa_agendamento_pagamentos_usuario_idx on public.taxa_agendamento_pagamentos (usuario_id, status, criado_em desc);
create index if not exists taxa_agendamento_pagamentos_cliente_idx on public.taxa_agendamento_pagamentos (usuario_id, cliente_telefone, status, criado_em desc);
create unique index if not exists taxa_agendamento_pagamentos_stripe_session_unique on public.taxa_agendamento_pagamentos (stripe_checkout_session_id) where stripe_checkout_session_id is not null;

alter table public.taxa_agendamento_pagamentos enable row level security;

drop policy if exists "taxa_agendamento_pagamentos_select_master_or_funcionario" on public.taxa_agendamento_pagamentos;
create policy "taxa_agendamento_pagamentos_select_master_or_funcionario" on public.taxa_agendamento_pagamentos
for select to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1
    from public.funcionarios f
    where f.id = auth.uid()
      and f.usuario_master_id = taxa_agendamento_pagamentos.usuario_id
      and f.ativo = true
      and f.pode_ver_financeiro = true
  )
);

grant select on public.taxa_agendamento_pagamentos to authenticated;

create or replace function public.agendamentos_tornar_taxa_credito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' then
    if lower(coalesce(NEW.status::text, '')) in ('nao_compareceu', 'não_compareceu', 'no_show')
      and lower(coalesce(OLD.status::text, '')) not in ('nao_compareceu', 'não_compareceu', 'no_show') then
      update public.taxa_agendamento_pagamentos
      set status = 'credito', credito_em = now()
      where agendamento_id = NEW.id
        and status = 'pago';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists agendamentos_tornar_taxa_credito_trg on public.agendamentos;
create trigger agendamentos_tornar_taxa_credito_trg
after update of status on public.agendamentos
for each row execute function public.agendamentos_tornar_taxa_credito();

create or replace function public.consume_taxa_agendamento_credito(p_usuario_id uuid, p_cliente_telefone text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_usuario_id is null or nullif(trim(coalesce(p_cliente_telefone, '')), '') is null then
    return null;
  end if;

  select t.id
  into v_id
  from public.taxa_agendamento_pagamentos t
  where t.usuario_id = p_usuario_id
    and t.cliente_telefone = p_cliente_telefone
    and t.status = 'credito'
  order by t.criado_em asc
  for update skip locked
  limit 1;

  if v_id is null then
    return null;
  end if;

  update public.taxa_agendamento_pagamentos
  set status = 'reservado'
  where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.consume_taxa_agendamento_credito(uuid, text) from public;
grant execute on function public.consume_taxa_agendamento_credito(uuid, text) to service_role;

create or replace function public.public_get_usuario_publico(p_slug text)
returns table (
  id uuid,
  nome_negocio text,
  logo_url text,
  endereco text,
  telefone text,
  instagram_url text,
  horario_inicio text,
  horario_fim text,
  dias_trabalho int[],
  intervalo_inicio text,
  intervalo_fim text,
  ativo boolean,
  tipo_conta text,
  plano text,
  tipo_negocio text,
  public_primary_color text,
  public_background_color text,
  public_use_background_image boolean,
  public_background_image_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    u.id::uuid,
    u.nome_negocio::text,
    u.logo_url::text,
    u.endereco::text,
    u.telefone::text,
    u.instagram_url::text,
    u.horario_inicio::text,
    u.horario_fim::text,
    u.dias_trabalho::int[],
    u.intervalo_inicio::text,
    u.intervalo_fim::text,
    u.ativo::boolean,
    u.tipo_conta::text,
    u.plano::text,
    u.tipo_negocio::text,
    u.public_primary_color::text,
    u.public_background_color::text,
    u.public_use_background_image::boolean,
    u.public_background_image_url::text
  from public.usuarios u
  where u.slug = p_slug
    and u.ativo = true
  limit 1;
end;
$$;

create or replace function public.public_get_servicos_publicos(p_usuario_id uuid)
returns table (
  id uuid,
  nome text,
  descricao text,
  duracao_minutos int,
  preco numeric,
  taxa_agendamento numeric,
  cor text,
  foto_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select s.id::uuid, s.nome::text, s.descricao::text, s.duracao_minutos::int, s.preco::numeric, s.taxa_agendamento::numeric, s.cor::text, s.foto_url::text
  from public.servicos s
  where s.usuario_id = p_usuario_id
    and s.ativo = true
  order by s.ordem asc nulls last, s.criado_em asc;
end;
$$;

create or replace function public.public_get_funcionarios_publicos(p_usuario_master_id uuid)
returns table (
  id uuid,
  nome_completo text,
  horario_inicio text,
  horario_fim text,
  dias_trabalho int[],
  intervalo_inicio text,
  intervalo_fim text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select f.id::uuid, f.nome_completo::text, f.horario_inicio::text, f.horario_fim::text, f.dias_trabalho::int[], f.intervalo_inicio::text, f.intervalo_fim::text
  from public.funcionarios f
  where f.usuario_master_id = p_usuario_master_id
    and f.ativo = true
  order by f.criado_em asc;
end;
$$;

drop function if exists public.public_get_slots_publicos(uuid, date, uuid, uuid);

create or replace function public.public_get_slots_publicos(
  p_usuario_id uuid,
  p_data date,
  p_servico_id uuid,
  p_funcionario_id uuid
)
returns table (hora_inicio text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_base record;
  v_staff_exists boolean;
  v_staff_horario_inicio time;
  v_staff_horario_fim time;
  v_staff_dias_trabalho int[];
  v_staff_intervalo_inicio time;
  v_staff_intervalo_fim time;
  v_duracao int;
  v_weekday int;
  v_sched_inicio time;
  v_sched_fim time;
  v_iv_inicio time;
  v_iv_fim time;
  v_sched_inicio_min int;
  v_sched_fim_min int;
  v_iv_inicio_min int;
  v_iv_fim_min int;
  v_start_min int;
  v_end_min int;
  v_now_min int;
  v_min_lead_min int := 120;
  v_step_min int := 30;
  v_max_days int := 15;
  v_tz text;
  v_today date;
begin
  if p_usuario_id is null or p_data is null or p_servico_id is null then
    raise exception 'invalid_payload';
  end if;

  v_uid := p_usuario_id;
  select u.horario_inicio, u.horario_fim, u.dias_trabalho, u.intervalo_inicio, u.intervalo_fim, u.timezone
  into v_base
  from public.usuarios u
  where u.id = v_uid
    and u.ativo = true;

  if v_base is null then
    raise exception 'usuario_invalido';
  end if;

  v_tz := coalesce(nullif(v_base.timezone::text, ''), 'America/Sao_Paulo');
  v_today := (now() at time zone v_tz)::date;

  if p_data < v_today then
    raise exception 'data_passada';
  end if;

  if p_data > (v_today + v_max_days) then
    raise exception 'data_muito_futura';
  end if;

  select s.duracao_minutos
  into v_duracao
  from public.servicos s
  where s.id = p_servico_id
    and s.usuario_id = v_uid
    and s.ativo = true;

  if v_duracao is null or v_duracao <= 0 then
    raise exception 'servico_invalido';
  end if;

  if p_funcionario_id is not null then
    select true, f.horario_inicio, f.horario_fim, f.dias_trabalho, f.intervalo_inicio, f.intervalo_fim
    into v_staff_exists, v_staff_horario_inicio, v_staff_horario_fim, v_staff_dias_trabalho, v_staff_intervalo_inicio, v_staff_intervalo_fim
    from public.funcionarios f
    where f.id = p_funcionario_id
      and f.usuario_master_id = v_uid
      and f.ativo = true;

    if v_staff_exists is distinct from true then
      raise exception 'funcionario_invalido';
    end if;
  end if;

  v_sched_inicio := coalesce(v_staff_horario_inicio, v_base.horario_inicio::time);
  v_sched_fim := coalesce(v_staff_horario_fim, v_base.horario_fim::time);
  v_iv_inicio := coalesce(v_staff_intervalo_inicio, v_base.intervalo_inicio::time);
  v_iv_fim := coalesce(v_staff_intervalo_fim, v_base.intervalo_fim::time);

  if v_sched_inicio is null or v_sched_fim is null then
    raise exception 'horarios_nao_configurados';
  end if;

  v_weekday := extract(dow from p_data)::int;

  if v_staff_dias_trabalho is not null and cardinality(v_staff_dias_trabalho) > 0 then
    if not (v_weekday = any(v_staff_dias_trabalho)) then
      raise exception 'fora_do_dia_de_trabalho';
    end if;
  elsif v_base.dias_trabalho is not null and cardinality(v_base.dias_trabalho) > 0 then
    if not (v_weekday = any(v_base.dias_trabalho)) then
      raise exception 'fora_do_dia_de_trabalho';
    end if;
  end if;

  v_sched_inicio_min := floor(extract(epoch from v_sched_inicio) / 60)::int;
  v_sched_fim_min := floor(extract(epoch from v_sched_fim) / 60)::int;
  v_end_min := v_sched_fim_min - v_duracao;

  if v_end_min < v_sched_inicio_min then
    return;
  end if;

  v_start_min := v_sched_inicio_min;

  if v_iv_inicio is not null and v_iv_fim is not null then
    v_iv_inicio_min := floor(extract(epoch from v_iv_inicio) / 60)::int;
    v_iv_fim_min := floor(extract(epoch from v_iv_fim) / 60)::int;
  else
    v_iv_inicio_min := null;
    v_iv_fim_min := null;
  end if;

  if p_data = v_today then
    v_now_min := floor(extract(epoch from ((now() at time zone v_tz)::time)) / 60)::int;
    v_start_min := greatest(v_start_min, v_now_min + v_min_lead_min);
  end if;

  v_start_min := ((v_start_min + v_step_min - 1) / v_step_min) * v_step_min;

  return query
  with candidates as (
    select gs as start_min
    from generate_series(v_start_min, v_end_min, v_step_min) gs
  ),
  without_interval as (
    select c.start_min
    from candidates c
    where not (
      v_iv_inicio_min is not null
      and v_iv_fim_min is not null
      and c.start_min < v_iv_fim_min
      and v_iv_inicio_min < (c.start_min + v_duracao)
    )
  ),
  free as (
    select w.start_min
    from without_interval w
    where not exists (
      select 1
      from public.public_get_ocupacoes(v_uid, p_data, p_funcionario_id) r
      where w.start_min < r.end_min and r.start_min < (w.start_min + v_duracao)
      limit 1
    )
  )
  select to_char((time '00:00' + (free.start_min::text || ' minutes')::interval)::time, 'HH24:MI') as hora_inicio
  from free
  order by free.start_min asc;
end;
$$;

create or replace function public.public_create_agendamento_publico(
  p_usuario_id uuid,
  p_data date,
  p_hora_inicio text,
  p_servico_id uuid,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_funcionario_id uuid,
  p_status text default 'confirmado'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_base record;
  v_staff_exists boolean;
  v_staff_horario_inicio time;
  v_staff_horario_fim time;
  v_staff_dias_trabalho int[];
  v_staff_intervalo_inicio time;
  v_staff_intervalo_fim time;
  v_duracao int;
  v_start_min int;
  v_end_min int;
  v_weekday int;
  v_sched_inicio time;
  v_sched_fim time;
  v_iv_inicio time;
  v_iv_fim time;
  v_horario_fim text;
  v_created_id uuid;
  v_now_min int;
  v_min_lead_min int := 120;
  v_max_days int := 15;
  v_tz text;
  v_today date;
  v_limite_mes int;
  v_month_start date;
  v_month_end date;
  v_month_count int;
  v_status text;
begin
  if p_usuario_id is null or p_data is null or nullif(p_hora_inicio, '') is null or p_servico_id is null then
    raise exception 'invalid_payload';
  end if;

  v_status := lower(coalesce(nullif(trim(coalesce(p_status, '')), ''), 'confirmado'));
  if v_status not in ('confirmado', 'pendente') then
    raise exception 'status_invalido';
  end if;

  v_uid := p_usuario_id;

  select u.horario_inicio, u.horario_fim, u.dias_trabalho, u.intervalo_inicio, u.intervalo_fim, u.timezone, u.limite_agendamentos_mes
  into v_base
  from public.usuarios u
  where u.id = v_uid
    and u.ativo = true
  for update;

  if v_base is null then
    raise exception 'usuario_invalido';
  end if;

  v_tz := coalesce(nullif(v_base.timezone::text, ''), 'America/Sao_Paulo');
  v_today := (now() at time zone v_tz)::date;

  if p_data < v_today then
    raise exception 'data_passada';
  end if;

  if p_data > (v_today + v_max_days) then
    raise exception 'data_muito_futura';
  end if;

  v_limite_mes := v_base.limite_agendamentos_mes;
  if v_limite_mes is not null then
    if v_limite_mes <= 0 then
      raise exception 'limite_mensal_atingido';
    end if;

    v_month_start := date_trunc('month', p_data)::date;
    v_month_end := (v_month_start + interval '1 month')::date;

    select count(*)
    into v_month_count
    from public.agendamentos a
    where a.usuario_id = v_uid
      and a.data >= v_month_start
      and a.data < v_month_end
      and a.status <> 'cancelado';

    if v_month_count >= v_limite_mes then
      raise exception 'limite_mensal_atingido';
    end if;
  end if;

  select s.duracao_minutos
  into v_duracao
  from public.servicos s
  where s.id = p_servico_id
    and s.usuario_id = v_uid
    and s.ativo = true;

  if v_duracao is null or v_duracao <= 0 then
    raise exception 'servico_invalido';
  end if;

  if p_funcionario_id is not null then
    select true, f.horario_inicio, f.horario_fim, f.dias_trabalho, f.intervalo_inicio, f.intervalo_fim
    into v_staff_exists, v_staff_horario_inicio, v_staff_horario_fim, v_staff_dias_trabalho, v_staff_intervalo_inicio, v_staff_intervalo_fim
    from public.funcionarios f
    where f.id = p_funcionario_id
      and f.usuario_master_id = v_uid
      and f.ativo = true;

    if v_staff_exists is distinct from true then
      raise exception 'funcionario_invalido';
    end if;
  end if;

  v_sched_inicio := coalesce(v_staff_horario_inicio, v_base.horario_inicio::time);
  v_sched_fim := coalesce(v_staff_horario_fim, v_base.horario_fim::time);
  v_iv_inicio := coalesce(v_staff_intervalo_inicio, v_base.intervalo_inicio::time);
  v_iv_fim := coalesce(v_staff_intervalo_fim, v_base.intervalo_fim::time);

  if v_sched_inicio is null or v_sched_fim is null then
    raise exception 'horarios_nao_configurados';
  end if;

  v_weekday := extract(dow from p_data)::int;

  if v_staff_dias_trabalho is not null and cardinality(v_staff_dias_trabalho) > 0 then
    if not (v_weekday = any(v_staff_dias_trabalho)) then
      raise exception 'fora_do_dia_de_trabalho';
    end if;
  elsif v_base.dias_trabalho is not null and cardinality(v_base.dias_trabalho) > 0 then
    if not (v_weekday = any(v_base.dias_trabalho)) then
      raise exception 'fora_do_dia_de_trabalho';
    end if;
  end if;

  v_start_min := floor(extract(epoch from (p_hora_inicio::time)) / 60)::int;
  v_end_min := v_start_min + v_duracao;
  v_horario_fim := to_char(((p_hora_inicio::time) + (v_duracao::text || ' minutes')::interval)::time, 'HH24:MI');

  if p_data = v_today then
    v_now_min := floor(extract(epoch from ((now() at time zone v_tz)::time)) / 60)::int;
    if v_start_min < v_now_min + v_min_lead_min then
      raise exception 'antecedencia_minima';
    end if;
  end if;

  if v_start_min < floor(extract(epoch from v_sched_inicio) / 60)::int then
    raise exception 'fora_do_horario';
  end if;
  if v_end_min > floor(extract(epoch from v_sched_fim) / 60)::int then
    raise exception 'fora_do_horario';
  end if;

  if v_iv_inicio is not null and v_iv_fim is not null then
    if v_start_min < floor(extract(epoch from v_iv_fim) / 60)::int
      and floor(extract(epoch from v_iv_inicio) / 60)::int < v_end_min then
      raise exception 'intervalo';
    end if;
  end if;

  if exists (
    select 1
    from public.public_get_ocupacoes(v_uid, p_data, p_funcionario_id) r
    where v_start_min < r.end_min and r.start_min < v_end_min
    limit 1
  ) then
    raise exception 'ocupado';
  end if;

  insert into public.agendamentos (
    usuario_id,
    funcionario_id,
    servico_id,
    cliente_nome,
    cliente_telefone,
    data,
    hora_inicio,
    hora_fim,
    status
  )
  values (
    v_uid,
    p_funcionario_id,
    p_servico_id,
    nullif(p_cliente_nome, ''),
    nullif(p_cliente_telefone, ''),
    p_data,
    p_hora_inicio::time,
    v_horario_fim::time,
    v_status
  )
  returning id into v_created_id;

  return v_created_id;
end;
$$;

revoke all on function public.public_get_usuario_publico(text) from public;
revoke all on function public.public_get_servicos_publicos(uuid) from public;
revoke all on function public.public_get_funcionarios_publicos(uuid) from public;
revoke all on function public.public_get_slots_publicos(uuid, date, uuid, uuid) from public;
revoke all on function public.public_create_agendamento_publico(uuid, date, text, uuid, text, text, uuid, text) from public;

grant execute on function public.public_get_usuario_publico(text) to anon;
grant execute on function public.public_get_servicos_publicos(uuid) to anon;
grant execute on function public.public_get_funcionarios_publicos(uuid) to anon;
grant execute on function public.public_get_slots_publicos(uuid, date, uuid, uuid) to anon;
grant execute on function public.public_create_agendamento_publico(uuid, date, text, uuid, text, text, uuid, text) to anon;

grant execute on function public.public_get_usuario_publico(text) to authenticated;
grant execute on function public.public_get_servicos_publicos(uuid) to authenticated;
grant execute on function public.public_get_funcionarios_publicos(uuid) to authenticated;
grant execute on function public.public_get_slots_publicos(uuid, date, uuid, uuid) to authenticated;
grant execute on function public.public_create_agendamento_publico(uuid, date, text, uuid, text, text, uuid, text) to authenticated;`
  }, [])

  const sqlStorageLogos = useMemo(() => {
    return `insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = true;

alter table storage.objects enable row level security;

drop policy if exists "public_read_logos" on storage.objects;
create policy "public_read_logos" on storage.objects
for select to public
using (bucket_id = 'logos');

drop policy if exists "auth_write_own_logos" on storage.objects;
create policy "auth_write_own_logos" on storage.objects
for insert to authenticated
with check (bucket_id = 'logos' and name like auth.uid()::text || '/%');

drop policy if exists "auth_update_own_logos" on storage.objects;
create policy "auth_update_own_logos" on storage.objects
for update to authenticated
using (bucket_id = 'logos' and name like auth.uid()::text || '/%')
with check (bucket_id = 'logos' and name like auth.uid()::text || '/%');

drop policy if exists "auth_delete_own_logos" on storage.objects;
create policy "auth_delete_own_logos" on storage.objects
for delete to authenticated
using (bucket_id = 'logos' and name like auth.uid()::text || '/%');`
  }, [])

  const sqlStorageServicosFotos = useMemo(() => {
    return `insert into storage.buckets (id, name, public)
values ('servicos', 'servicos', true)
on conflict (id) do update set public = true;

alter table storage.objects enable row level security;

drop policy if exists "public_read_servicos" on storage.objects;
create policy "public_read_servicos" on storage.objects
for select to public
using (bucket_id = 'servicos');

drop policy if exists "auth_write_own_servicos" on storage.objects;
create policy "auth_write_own_servicos" on storage.objects
for insert to authenticated
with check (bucket_id = 'servicos' and name like auth.uid()::text || '/%');

drop policy if exists "auth_update_own_servicos" on storage.objects;
create policy "auth_update_own_servicos" on storage.objects
for update to authenticated
using (bucket_id = 'servicos' and name like auth.uid()::text || '/%')
with check (bucket_id = 'servicos' and name like auth.uid()::text || '/%');

drop policy if exists "auth_delete_own_servicos" on storage.objects;
create policy "auth_delete_own_servicos" on storage.objects
for delete to authenticated
using (bucket_id = 'servicos' and name like auth.uid()::text || '/%');`
  }, [])

  const sqlServicosFotosPro = useMemo(() => {
    return `alter table public.servicos add column if not exists foto_url text;

create or replace function public.servicos_enforce_foto_by_plano()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plano text;
begin
  if public.is_super_admin() then
    return NEW;
  end if;

  if nullif(coalesce(NEW.foto_url, ''), '') is null then
    return NEW;
  end if;

  select u.plano::text into v_plano
  from public.usuarios u
  where u.id = NEW.usuario_id;

  v_plano := lower(coalesce(nullif(v_plano, ''), 'free'));
  if v_plano not in ('pro', 'team', 'enterprise') then
    raise exception 'plano_sem_foto_servico';
  end if;

  return NEW;
end;
$$;

drop trigger if exists servicos_enforce_foto_by_plano on public.servicos;
create trigger servicos_enforce_foto_by_plano
before insert or update of foto_url on public.servicos
for each row execute function public.servicos_enforce_foto_by_plano();`
  }, [])

  const sqlServicosLimiteBasic = useMemo(() => {
    return `create or replace function public.servicos_enforce_limite_by_plano()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plano text;
  v_count int;
begin
  if public.is_super_admin() then
    return NEW;
  end if;

  select u.plano::text into v_plano
  from public.usuarios u
  where u.id = NEW.usuario_id;

  v_plano := lower(coalesce(nullif(v_plano, ''), 'free'));
  if v_plano in ('pro', 'team', 'enterprise') then
    return NEW;
  end if;

  select count(*) into v_count
  from public.servicos s
  where s.usuario_id = NEW.usuario_id;

  if coalesce(v_count, 0) >= 3 then
    raise exception 'limite_servicos_atingido';
  end if;

  return NEW;
end;
$$;

drop trigger if exists servicos_enforce_limite_by_plano on public.servicos;
create trigger servicos_enforce_limite_by_plano
before insert on public.servicos
for each row execute function public.servicos_enforce_limite_by_plano();`
  }, [])

  const sqlMultiUnidadesEnterprise = useMemo(() => {
    return `alter table public.usuarios add column if not exists tipo_negocio text;

alter table public.servicos add column if not exists taxa_agendamento numeric not null default 0;

create table if not exists public.taxa_agendamento_pagamentos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  agendamento_id uuid null references public.agendamentos(id) on delete set null,
  servico_id uuid null references public.servicos(id) on delete set null,
  funcionario_id uuid null references public.funcionarios(id) on delete set null,
  cliente_nome text null,
  cliente_telefone text null,
  valor numeric not null default 0,
  moeda text not null default 'brl',
  status text not null default 'pendente',
  stripe_checkout_session_id text null,
  stripe_payment_intent_id text null,
  pago_em timestamptz null,
  credito_em timestamptz null,
  usado_em timestamptz null,
  utilizado_em_agendamento_id uuid null references public.agendamentos(id) on delete set null
);

alter table public.taxa_agendamento_pagamentos add column if not exists unidade_id uuid references public.unidades(id) on delete set null;

create index if not exists taxa_agendamento_pagamentos_usuario_idx on public.taxa_agendamento_pagamentos (usuario_id, status, criado_em desc);
create index if not exists taxa_agendamento_pagamentos_cliente_idx on public.taxa_agendamento_pagamentos (usuario_id, cliente_telefone, status, criado_em desc);
create unique index if not exists taxa_agendamento_pagamentos_stripe_session_unique on public.taxa_agendamento_pagamentos (stripe_checkout_session_id) where stripe_checkout_session_id is not null;

alter table public.taxa_agendamento_pagamentos enable row level security;

drop policy if exists "taxa_agendamento_pagamentos_select_master_or_funcionario" on public.taxa_agendamento_pagamentos;
create policy "taxa_agendamento_pagamentos_select_master_or_funcionario" on public.taxa_agendamento_pagamentos
for select to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1
    from public.funcionarios f
    where f.id = auth.uid()
      and f.usuario_master_id = taxa_agendamento_pagamentos.usuario_id
      and f.ativo = true
      and f.pode_ver_financeiro = true
  )
);

grant select on public.taxa_agendamento_pagamentos to authenticated;

create or replace function public.agendamentos_tornar_taxa_credito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' then
    if lower(coalesce(NEW.status::text, '')) in ('nao_compareceu', 'não_compareceu', 'no_show')
      and lower(coalesce(OLD.status::text, '')) not in ('nao_compareceu', 'não_compareceu', 'no_show') then
      update public.taxa_agendamento_pagamentos
      set status = 'credito', credito_em = now()
      where agendamento_id = NEW.id
        and status = 'pago';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists agendamentos_tornar_taxa_credito_trg on public.agendamentos;
create trigger agendamentos_tornar_taxa_credito_trg
after update of status on public.agendamentos
for each row execute function public.agendamentos_tornar_taxa_credito();

create or replace function public.consume_taxa_agendamento_credito(p_usuario_id uuid, p_cliente_telefone text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_usuario_id is null or nullif(trim(coalesce(p_cliente_telefone, '')), '') is null then
    return null;
  end if;

  select t.id
  into v_id
  from public.taxa_agendamento_pagamentos t
  where t.usuario_id = p_usuario_id
    and t.cliente_telefone = p_cliente_telefone
    and t.status = 'credito'
  order by t.criado_em asc
  for update skip locked
  limit 1;

  if v_id is null then
    return null;
  end if;

  update public.taxa_agendamento_pagamentos
  set status = 'reservado'
  where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.consume_taxa_agendamento_credito(uuid, text) from public;
grant execute on function public.consume_taxa_agendamento_credito(uuid, text) to service_role;

drop function if exists public.public_get_servicos_publicos(uuid);

create or replace function public.public_get_servicos_publicos(p_usuario_id uuid)
returns table (
  id uuid,
  nome text,
  descricao text,
  duracao_minutos int,
  preco numeric,
  taxa_agendamento numeric,
  cor text,
  foto_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select s.id::uuid, s.nome::text, s.descricao::text, s.duracao_minutos::int, s.preco::numeric, s.taxa_agendamento::numeric, s.cor::text, s.foto_url::text
  from public.servicos s
  where s.usuario_id = p_usuario_id
    and s.ativo = true
  order by s.ordem asc nulls last, s.criado_em asc;
end;
$$;

create table if not exists public.unidades (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  nome text not null,
  slug text not null,
  endereco text null,
  telefone text null,
  horario_inicio text null,
  horario_fim text null,
  dias_trabalho int[] null,
  intervalo_inicio text null,
  intervalo_fim text null,
  timezone text null,
  public_primary_color text null,
  public_background_color text null,
  public_use_background_image boolean not null default false,
  public_background_image_url text null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create unique index if not exists unidades_usuario_slug_unique on public.unidades (usuario_id, slug);
create index if not exists unidades_usuario_idx on public.unidades (usuario_id);

alter table public.unidades enable row level security;

drop policy if exists "unidades_select_own" on public.unidades;
create policy "unidades_select_own" on public.unidades
for select to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
);

drop policy if exists "unidades_insert_own" on public.unidades;
create policy "unidades_insert_own" on public.unidades
for insert to authenticated
with check (
  usuario_id = auth.uid()
  or public.is_super_admin()
);

drop policy if exists "unidades_update_own" on public.unidades;
create policy "unidades_update_own" on public.unidades
for update to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
)
with check (
  usuario_id = auth.uid()
  or public.is_super_admin()
);

drop policy if exists "unidades_delete_own" on public.unidades;
create policy "unidades_delete_own" on public.unidades
for delete to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
);

grant select, insert, update, delete on public.unidades to authenticated;

alter table public.funcionarios add column if not exists unidade_id uuid references public.unidades(id) on delete set null;
alter table public.agendamentos add column if not exists unidade_id uuid references public.unidades(id) on delete set null;
alter table public.bloqueios add column if not exists unidade_id uuid references public.unidades(id) on delete set null;

create index if not exists funcionarios_unidade_idx on public.funcionarios (usuario_master_id, unidade_id);
create index if not exists agendamentos_unidade_idx on public.agendamentos (usuario_id, unidade_id, data);
create index if not exists bloqueios_unidade_idx on public.bloqueios (usuario_id, unidade_id, data);

drop function if exists public.public_get_usuario_publico(text);
drop function if exists public.public_get_usuario_publico(text, text);

create or replace function public.public_get_usuario_publico(p_slug text, p_unidade_slug text default null)
returns table (
  id uuid,
  nome_negocio text,
  logo_url text,
  endereco text,
  telefone text,
  instagram_url text,
  horario_inicio text,
  horario_fim text,
  dias_trabalho int[],
  intervalo_inicio text,
  intervalo_fim text,
  ativo boolean,
  tipo_conta text,
  plano text,
  tipo_negocio text,
  public_primary_color text,
  public_background_color text,
  public_use_background_image boolean,
  public_background_image_url text,
  unidade_id uuid,
  unidade_nome text,
  unidade_slug text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with base as (
    select u.*
    from public.usuarios u
    where u.slug = p_slug
      and u.ativo = true
    limit 1
  ), uni as (
    select un.*
    from public.unidades un
    join base b on b.id = un.usuario_id
    where p_unidade_slug is not null
      and un.slug = p_unidade_slug
      and un.ativo = true
    limit 1
  )
  select
    b.id::uuid,
    (case when u.id is not null then u.nome::text else b.nome_negocio::text end) as nome_negocio,
    b.logo_url::text,
    coalesce(u.endereco::text, b.endereco::text) as endereco,
    coalesce(u.telefone::text, b.telefone::text) as telefone,
    b.instagram_url::text,
    coalesce(u.horario_inicio::text, b.horario_inicio::text) as horario_inicio,
    coalesce(u.horario_fim::text, b.horario_fim::text) as horario_fim,
    coalesce(u.dias_trabalho::int[], b.dias_trabalho::int[]) as dias_trabalho,
    coalesce(u.intervalo_inicio::text, b.intervalo_inicio::text) as intervalo_inicio,
    coalesce(u.intervalo_fim::text, b.intervalo_fim::text) as intervalo_fim,
    b.ativo::boolean,
    b.tipo_conta::text,
    b.plano::text,
    b.tipo_negocio::text,
    coalesce(u.public_primary_color::text, b.public_primary_color::text) as public_primary_color,
    coalesce(u.public_background_color::text, b.public_background_color::text) as public_background_color,
    coalesce(u.public_use_background_image::boolean, b.public_use_background_image::boolean) as public_use_background_image,
    coalesce(u.public_background_image_url::text, b.public_background_image_url::text) as public_background_image_url,
    u.id::uuid as unidade_id,
    u.nome::text as unidade_nome,
    u.slug::text as unidade_slug
  from base b
  left join uni u on true;
end;
$$;

drop function if exists public.public_get_funcionarios_publicos(uuid);
drop function if exists public.public_get_funcionarios_publicos(uuid, uuid);

create or replace function public.public_get_funcionarios_publicos(p_usuario_master_id uuid, p_unidade_id uuid default null)
returns table (
  id uuid,
  nome_completo text,
  horario_inicio text,
  horario_fim text,
  dias_trabalho int[],
  intervalo_inicio text,
  intervalo_fim text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select f.id::uuid, f.nome_completo::text, f.horario_inicio::text, f.horario_fim::text, f.dias_trabalho::int[], f.intervalo_inicio::text, f.intervalo_fim::text
  from public.funcionarios f
  where f.usuario_master_id = p_usuario_master_id
    and f.ativo = true
    and (p_unidade_id is null or f.unidade_id = p_unidade_id)
  order by f.criado_em asc;
end;
$$;

drop function if exists public.public_get_ocupacoes(uuid, date, uuid);
drop function if exists public.public_get_ocupacoes(uuid, date, uuid, uuid);

create or replace function public.public_get_ocupacoes(p_usuario_id uuid, p_data date, p_funcionario_id uuid, p_unidade_id uuid default null)
returns table (start_min int, end_min int)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    floor(extract(epoch from a.hora_inicio::time) / 60)::int as start_min,
    floor(extract(epoch from coalesce(a.hora_fim, a.hora_inicio)::time) / 60)::int as end_min
  from public.agendamentos a
  where a.usuario_id = p_usuario_id
    and a.data = p_data
    and a.status <> 'cancelado'
    and (p_unidade_id is null and a.unidade_id is null or p_unidade_id is not null and a.unidade_id = p_unidade_id)
    and (p_funcionario_id is null or a.funcionario_id is null or a.funcionario_id = p_funcionario_id)

  union all

  select
    floor(extract(epoch from b.hora_inicio::time) / 60)::int as start_min,
    floor(extract(epoch from b.hora_fim::time) / 60)::int as end_min
  from public.bloqueios b
  where b.usuario_id = p_usuario_id
    and b.data = p_data
    and (p_unidade_id is null and b.unidade_id is null or p_unidade_id is not null and b.unidade_id = p_unidade_id)
    and (p_funcionario_id is null or b.funcionario_id is null or b.funcionario_id = p_funcionario_id);
end;
$$;

drop function if exists public.public_get_slots_publicos(uuid, date, uuid, uuid);
drop function if exists public.public_get_slots_publicos(uuid, date, uuid, uuid, uuid);

create or replace function public.public_get_slots_publicos(
  p_usuario_id uuid,
  p_data date,
  p_servico_id uuid,
  p_funcionario_id uuid,
  p_unidade_id uuid default null
)
returns table (hora_inicio text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_base record;
  v_staff_exists boolean;
  v_staff_horario_inicio time;
  v_staff_horario_fim time;
  v_staff_dias_trabalho int[];
  v_staff_intervalo_inicio time;
  v_staff_intervalo_fim time;
  v_duracao int;
  v_weekday int;
  v_sched_inicio time;
  v_sched_fim time;
  v_iv_inicio time;
  v_iv_fim time;
  v_sched_inicio_min int;
  v_sched_fim_min int;
  v_iv_inicio_min int;
  v_iv_fim_min int;
  v_start_min int;
  v_end_min int;
  v_now_min int;
  v_min_lead_min int := 120;
  v_step_min int := 30;
  v_max_days int := 15;
  v_tz text;
  v_today date;
  v_unidade_ok boolean;
begin
  if p_usuario_id is null or p_data is null or p_servico_id is null then
    raise exception 'invalid_payload';
  end if;

  v_uid := p_usuario_id;

  if p_unidade_id is not null then
    select true into v_unidade_ok
    from public.unidades un
    where un.id = p_unidade_id
      and un.usuario_id = v_uid
      and un.ativo = true;
    if v_unidade_ok is distinct from true then
      raise exception 'unidade_invalida';
    end if;
  end if;

  select
    coalesce(un.horario_inicio::text, u.horario_inicio::text) as horario_inicio,
    coalesce(un.horario_fim::text, u.horario_fim::text) as horario_fim,
    coalesce(un.dias_trabalho, u.dias_trabalho) as dias_trabalho,
    coalesce(un.intervalo_inicio::text, u.intervalo_inicio::text) as intervalo_inicio,
    coalesce(un.intervalo_fim::text, u.intervalo_fim::text) as intervalo_fim,
    coalesce(un.timezone::text, u.timezone::text) as timezone
  into v_base
  from public.usuarios u
  left join public.unidades un
    on un.id = p_unidade_id
    and un.usuario_id = u.id
    and un.ativo = true
  where u.id = v_uid
    and u.ativo = true;

  if v_base is null then
    raise exception 'usuario_invalido';
  end if;

  v_tz := coalesce(nullif(v_base.timezone::text, ''), 'America/Sao_Paulo');
  v_today := (now() at time zone v_tz)::date;

  if p_data < v_today then
    raise exception 'data_passada';
  end if;

  if p_data > (v_today + v_max_days) then
    raise exception 'data_muito_futura';
  end if;

  select s.duracao_minutos
  into v_duracao
  from public.servicos s
  where s.id = p_servico_id
    and s.usuario_id = v_uid
    and s.ativo = true;

  if v_duracao is null or v_duracao <= 0 then
    raise exception 'servico_invalido';
  end if;

  if p_funcionario_id is not null then
    select true, f.horario_inicio, f.horario_fim, f.dias_trabalho, f.intervalo_inicio, f.intervalo_fim
    into v_staff_exists, v_staff_horario_inicio, v_staff_horario_fim, v_staff_dias_trabalho, v_staff_intervalo_inicio, v_staff_intervalo_fim
    from public.funcionarios f
    where f.id = p_funcionario_id
      and f.usuario_master_id = v_uid
      and f.ativo = true
      and (p_unidade_id is null or f.unidade_id = p_unidade_id);

    if v_staff_exists is distinct from true then
      raise exception 'funcionario_invalido';
    end if;
  end if;

  v_sched_inicio := coalesce(v_staff_horario_inicio, v_base.horario_inicio::time);
  v_sched_fim := coalesce(v_staff_horario_fim, v_base.horario_fim::time);
  v_iv_inicio := coalesce(v_staff_intervalo_inicio, v_base.intervalo_inicio::time);
  v_iv_fim := coalesce(v_staff_intervalo_fim, v_base.intervalo_fim::time);

  if v_sched_inicio is null or v_sched_fim is null then
    raise exception 'horarios_nao_configurados';
  end if;

  v_weekday := extract(dow from p_data)::int;
  if p_funcionario_id is not null then
    if v_staff_dias_trabalho is not null and array_length(v_staff_dias_trabalho, 1) > 0 then
      if not (v_weekday = any(v_staff_dias_trabalho)) then
        raise exception 'fora_do_dia_de_trabalho';
      end if;
    end if;
  else
    if v_base.dias_trabalho is not null and array_length(v_base.dias_trabalho, 1) > 0 then
      if not (v_weekday = any(v_base.dias_trabalho)) then
        raise exception 'fora_do_dia_de_trabalho';
      end if;
    end if;
  end if;

  v_sched_inicio_min := floor(extract(epoch from v_sched_inicio) / 60)::int;
  v_sched_fim_min := floor(extract(epoch from v_sched_fim) / 60)::int;
  v_iv_inicio_min := case when v_iv_inicio is null then null else floor(extract(epoch from v_iv_inicio) / 60)::int end;
  v_iv_fim_min := case when v_iv_fim is null then null else floor(extract(epoch from v_iv_fim) / 60)::int end;

  if p_data = v_today then
    v_now_min := floor(extract(epoch from (now() at time zone v_tz)::time) / 60)::int;
  else
    v_now_min := -999999;
  end if;

  return query
  with windows as (
    select v_sched_inicio_min as start_min, v_sched_fim_min as end_min
    union all
    select v_iv_fim_min as start_min, v_sched_fim_min as end_min
    where v_iv_inicio_min is not null and v_iv_fim_min is not null and v_iv_inicio_min < v_iv_fim_min
  ),
  expanded as (
    select generate_series(w.start_min, w.end_min - v_duracao, v_step_min) as start_min
    from windows w
    where w.start_min is not null and w.end_min is not null and w.start_min < w.end_min
  ),
  filtered as (
    select e.start_min
    from expanded e
    where (e.start_min + v_duracao) <= v_sched_fim_min
      and (v_iv_inicio_min is null or v_iv_fim_min is null or e.start_min + v_duracao <= v_iv_inicio_min or e.start_min >= v_iv_fim_min)
      and e.start_min >= (v_now_min + v_min_lead_min)
  ),
  free as (
    select f.start_min
    from filtered f
    where not exists (
      select 1
      from public.public_get_ocupacoes(v_uid, p_data, p_funcionario_id, p_unidade_id) r
      where f.start_min < r.end_min and r.start_min < (f.start_min + v_duracao)
      limit 1
    )
  )
  select to_char((time '00:00' + (free.start_min::text || ' minutes')::interval)::time, 'HH24:MI') as hora_inicio
  from free
  order by free.start_min asc;
end;
$$;

drop function if exists public.public_create_agendamento_publico(uuid, date, text, uuid, text, text, uuid);
drop function if exists public.public_create_agendamento_publico(uuid, date, text, uuid, text, text, uuid, uuid);

create or replace function public.public_create_agendamento_publico(
  p_usuario_id uuid,
  p_data date,
  p_hora_inicio text,
  p_servico_id uuid,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_funcionario_id uuid,
  p_unidade_id uuid default null,
  p_status text default 'confirmado'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_base record;
  v_staff_exists boolean;
  v_staff_horario_inicio time;
  v_staff_horario_fim time;
  v_staff_dias_trabalho int[];
  v_staff_intervalo_inicio time;
  v_staff_intervalo_fim time;
  v_duracao int;
  v_start_min int;
  v_end_min int;
  v_weekday int;
  v_sched_inicio time;
  v_sched_fim time;
  v_iv_inicio time;
  v_iv_fim time;
  v_horario_fim text;
  v_created_id uuid;
  v_now_min int;
  v_min_lead_min int := 120;
  v_max_days int := 15;
  v_tz text;
  v_today date;
  v_limite_mes int;
  v_month_start date;
  v_month_end date;
  v_month_count int;
  v_unidade_ok boolean;
  v_status text;
begin
  if p_usuario_id is null or p_data is null or nullif(p_hora_inicio, '') is null or p_servico_id is null then
    raise exception 'invalid_payload';
  end if;

  v_status := lower(coalesce(nullif(trim(coalesce(p_status, '')), ''), 'confirmado'));
  if v_status not in ('confirmado', 'pendente') then
    raise exception 'status_invalido';
  end if;

  v_uid := p_usuario_id;

  select
    coalesce(un.horario_inicio::text, u.horario_inicio::text) as horario_inicio,
    coalesce(un.horario_fim::text, u.horario_fim::text) as horario_fim,
    coalesce(un.dias_trabalho, u.dias_trabalho) as dias_trabalho,
    coalesce(un.intervalo_inicio::text, u.intervalo_inicio::text) as intervalo_inicio,
    coalesce(un.intervalo_fim::text, u.intervalo_fim::text) as intervalo_fim,
    coalesce(un.timezone::text, u.timezone::text) as timezone,
    u.limite_agendamentos_mes as limite_agendamentos_mes
  into v_base
  from public.usuarios u
  left join public.unidades un
    on un.id = p_unidade_id
    and un.usuario_id = u.id
    and un.ativo = true
  where u.id = v_uid
    and u.ativo = true;

  if v_base is null then
    raise exception 'usuario_invalido';
  end if;

  if p_unidade_id is not null then
    select true into v_unidade_ok
    from public.unidades un
    where un.id = p_unidade_id
      and un.usuario_id = v_uid
      and un.ativo = true;
    if v_unidade_ok is distinct from true then
      raise exception 'unidade_invalida';
    end if;
  end if;

  v_tz := coalesce(nullif(v_base.timezone::text, ''), 'America/Sao_Paulo');
  v_today := (now() at time zone v_tz)::date;

  if p_data < v_today then
    raise exception 'data_passada';
  end if;

  if p_data > (v_today + v_max_days) then
    raise exception 'data_muito_futura';
  end if;

  v_weekday := extract(dow from p_data)::int;

  select s.duracao_minutos
  into v_duracao
  from public.servicos s
  where s.id = p_servico_id
    and s.usuario_id = v_uid
    and s.ativo = true;

  if v_duracao is null or v_duracao <= 0 then
    raise exception 'servico_invalido';
  end if;

  if p_funcionario_id is not null then
    select true, f.horario_inicio, f.horario_fim, f.dias_trabalho, f.intervalo_inicio, f.intervalo_fim
    into v_staff_exists, v_staff_horario_inicio, v_staff_horario_fim, v_staff_dias_trabalho, v_staff_intervalo_inicio, v_staff_intervalo_fim
    from public.funcionarios f
    where f.id = p_funcionario_id
      and f.usuario_master_id = v_uid
      and f.ativo = true
      and (p_unidade_id is null or f.unidade_id = p_unidade_id);

    if v_staff_exists is distinct from true then
      raise exception 'funcionario_invalido';
    end if;
  end if;

  if p_funcionario_id is not null then
    if v_staff_dias_trabalho is not null and array_length(v_staff_dias_trabalho, 1) > 0 then
      if not (v_weekday = any(v_staff_dias_trabalho)) then
        raise exception 'fora_do_dia_de_trabalho';
      end if;
    end if;
  else
    if v_base.dias_trabalho is not null and array_length(v_base.dias_trabalho, 1) > 0 then
      if not (v_weekday = any(v_base.dias_trabalho)) then
        raise exception 'fora_do_dia_de_trabalho';
      end if;
    end if;
  end if;

  v_sched_inicio := coalesce(v_staff_horario_inicio, v_base.horario_inicio::time);
  v_sched_fim := coalesce(v_staff_horario_fim, v_base.horario_fim::time);
  v_iv_inicio := coalesce(v_staff_intervalo_inicio, v_base.intervalo_inicio::time);
  v_iv_fim := coalesce(v_staff_intervalo_fim, v_base.intervalo_fim::time);

  if v_sched_inicio is null or v_sched_fim is null then
    raise exception 'horarios_nao_configurados';
  end if;

  v_start_min := floor(extract(epoch from p_hora_inicio::time) / 60)::int;
  v_end_min := v_start_min + v_duracao;
  v_horario_fim := to_char((time '00:00' + (v_end_min::text || ' minutes')::interval)::time, 'HH24:MI');

  if p_data = v_today then
    v_now_min := floor(extract(epoch from (now() at time zone v_tz)::time) / 60)::int;
    if v_start_min < (v_now_min + v_min_lead_min) then
      raise exception 'antecedencia_minima';
    end if;
  end if;

  if v_start_min < floor(extract(epoch from v_sched_inicio) / 60)::int or v_end_min > floor(extract(epoch from v_sched_fim) / 60)::int then
    raise exception 'fora_do_horario';
  end if;

  if v_iv_inicio is not null and v_iv_fim is not null then
    if v_start_min < floor(extract(epoch from v_iv_fim) / 60)::int and v_end_min > floor(extract(epoch from v_iv_inicio) / 60)::int then
      raise exception 'em_intervalo';
    end if;
  end if;

  if exists (
    select 1
    from public.public_get_ocupacoes(v_uid, p_data, p_funcionario_id, p_unidade_id) r
    where v_start_min < r.end_min and r.start_min < v_end_min
    limit 1
  ) then
    raise exception 'ocupado';
  end if;

  v_limite_mes := v_base.limite_agendamentos_mes;
  if v_limite_mes is not null then
    v_month_start := date_trunc('month', p_data)::date;
    v_month_end := (date_trunc('month', p_data) + interval '1 month - 1 day')::date;
    select count(*) into v_month_count
    from public.agendamentos a
    where a.usuario_id = v_uid
      and a.status <> 'cancelado'
      and a.data >= v_month_start
      and a.data <= v_month_end;
    if v_month_count >= v_limite_mes then
      raise exception 'limite_mensal_atingido';
    end if;
  end if;

  insert into public.agendamentos (
    usuario_id,
    funcionario_id,
    unidade_id,
    servico_id,
    cliente_nome,
    cliente_telefone,
    data,
    hora_inicio,
    hora_fim,
    status
  )
  values (
    v_uid,
    p_funcionario_id,
    p_unidade_id,
    p_servico_id,
    nullif(p_cliente_nome, ''),
    nullif(p_cliente_telefone, ''),
    p_data,
    p_hora_inicio::time,
    v_horario_fim::time,
    v_status
  )
  returning id into v_created_id;

  return v_created_id;
end;
$$;

revoke all on function public.public_get_usuario_publico(text, text) from public;
revoke all on function public.public_get_funcionarios_publicos(uuid, uuid) from public;
revoke all on function public.public_get_ocupacoes(uuid, date, uuid, uuid) from public;
revoke all on function public.public_get_slots_publicos(uuid, date, uuid, uuid, uuid) from public;
revoke all on function public.public_create_agendamento_publico(uuid, date, text, uuid, text, text, uuid, uuid, text) from public;

grant execute on function public.public_get_usuario_publico(text, text) to anon;
grant execute on function public.public_get_funcionarios_publicos(uuid, uuid) to anon;
grant execute on function public.public_get_ocupacoes(uuid, date, uuid, uuid) to anon;
grant execute on function public.public_get_slots_publicos(uuid, date, uuid, uuid, uuid) to anon;
grant execute on function public.public_create_agendamento_publico(uuid, date, text, uuid, text, text, uuid, uuid, text) to anon;

grant execute on function public.public_get_usuario_publico(text, text) to authenticated;
grant execute on function public.public_get_funcionarios_publicos(uuid, uuid) to authenticated;
grant execute on function public.public_get_ocupacoes(uuid, date, uuid, uuid) to authenticated;
grant execute on function public.public_get_slots_publicos(uuid, date, uuid, uuid, uuid) to authenticated;
grant execute on function public.public_create_agendamento_publico(uuid, date, text, uuid, text, text, uuid, uuid, text) to authenticated;`
  }, [])

  const sqlWhatsappAutomacao = useMemo(() => {
    return `alter table public.usuarios add column if not exists whatsapp_instance_name text;
alter table public.usuarios add column if not exists enviar_confirmacao boolean not null default true;
alter table public.usuarios add column if not exists enviar_lembrete boolean not null default false;
alter table public.usuarios add column if not exists lembrete_horas_antes int not null default 24;
alter table public.usuarios add column if not exists mensagem_confirmacao text;
alter table public.usuarios add column if not exists mensagem_lembrete text;

alter table public.agendamentos add column if not exists confirmacao_enviada boolean not null default false;
alter table public.agendamentos add column if not exists confirmacao_enviada_em timestamptz;
alter table public.agendamentos add column if not exists lembrete_enviado boolean not null default false;
alter table public.agendamentos add column if not exists lembrete_enviado_em timestamptz;

create index if not exists agendamentos_confirmacao_idx on public.agendamentos (usuario_id, status, confirmacao_enviada);
create index if not exists agendamentos_lembrete_idx on public.agendamentos (usuario_id, status, lembrete_enviado, data);

update public.usuarios
set whatsapp_instance_name = coalesce(whatsapp_instance_name, slug)
where whatsapp_instance_name is null and slug is not null;`
  }, [])

  const sqlWhatsappHabilitacao = useMemo(() => {
    return `alter table public.usuarios add column if not exists whatsapp_habilitado boolean not null default false;

create index if not exists usuarios_whatsapp_habilitado_idx on public.usuarios (whatsapp_habilitado);

create or replace function public.usuarios_block_whatsapp_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_super_admin() then
    return NEW;
  end if;

  if NEW.whatsapp_habilitado is distinct from OLD.whatsapp_habilitado
    or NEW.whatsapp_api_url is distinct from OLD.whatsapp_api_url
    or NEW.whatsapp_api_key is distinct from OLD.whatsapp_api_key then
    raise exception 'not_allowed';
  end if;

  return NEW;
end;
$$;

drop trigger if exists usuarios_block_whatsapp_update on public.usuarios;
create trigger usuarios_block_whatsapp_update
before update on public.usuarios
for each row execute function public.usuarios_block_whatsapp_update();`
  }, [])

  const sqlWhatsappSuperAdmin = useMemo(() => {
    return `create table if not exists public.super_admin (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default 'Super Admin',
  email text null,
  nivel text not null default 'super_admin',
  criado_em timestamptz not null default now(),
  whatsapp_api_url text,
  whatsapp_api_key text,
  whatsapp_instance_name text
);

alter table public.super_admin enable row level security;

drop policy if exists "super_admin_self_select" on public.super_admin;
create policy "super_admin_self_select" on public.super_admin
for select to authenticated
using (id = auth.uid());

drop policy if exists "super_admin_self_insert" on public.super_admin;
create policy "super_admin_self_insert" on public.super_admin
for insert to authenticated
with check (id = auth.uid());

drop policy if exists "super_admin_self_update" on public.super_admin;
create policy "super_admin_self_update" on public.super_admin
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

grant select, insert, update on public.super_admin to authenticated;

create or replace function public.is_super_admin() returns boolean
language sql stable as $$
  select exists (select 1 from public.super_admin sa where sa.id = auth.uid())
$$;

alter table public.usuarios enable row level security;

drop policy if exists "super_admin_select_usuarios" on public.usuarios;
create policy "super_admin_select_usuarios" on public.usuarios
for select to authenticated
using (public.is_super_admin());

grant select on public.usuarios to authenticated;`
  }, [])

  const sqlWhatsappGlobalConfig = useMemo(() => {
    return `create table if not exists public.super_admin (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default 'Super Admin',
  email text null,
  nivel text not null default 'super_admin',
  criado_em timestamptz not null default now(),
  whatsapp_api_url text,
  whatsapp_api_key text,
  whatsapp_instance_name text
);

alter table public.super_admin enable row level security;

drop policy if exists "super_admin_self_select" on public.super_admin;
create policy "super_admin_self_select" on public.super_admin
for select to authenticated
using (id = auth.uid());

drop policy if exists "super_admin_self_insert" on public.super_admin;
create policy "super_admin_self_insert" on public.super_admin
for insert to authenticated
with check (id = auth.uid());

drop policy if exists "super_admin_self_update" on public.super_admin;
create policy "super_admin_self_update" on public.super_admin
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

grant select, insert, update on public.super_admin to authenticated;

create or replace function public.is_super_admin() returns boolean
language sql stable as $$
  select exists (select 1 from public.super_admin sa where sa.id = auth.uid())
$$;

alter table public.usuarios add column if not exists whatsapp_habilitado boolean not null default false;
alter table public.usuarios add column if not exists whatsapp_instance_name text;
alter table public.usuarios add column if not exists enviar_confirmacao boolean not null default true;
alter table public.usuarios add column if not exists enviar_lembrete boolean not null default false;
alter table public.usuarios add column if not exists lembrete_horas_antes int not null default 24;
alter table public.usuarios add column if not exists mensagem_confirmacao text;
alter table public.usuarios add column if not exists mensagem_lembrete text;

create index if not exists usuarios_whatsapp_habilitado_idx on public.usuarios (whatsapp_habilitado);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usuarios'
      and column_name = 'whatsapp_api_url'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usuarios'
      and column_name = 'whatsapp_api_key'
  ) then
    execute 'drop trigger if exists usuarios_block_whatsapp_update on public.usuarios';
    execute 'update public.super_admin sa set whatsapp_api_url = coalesce(nullif(sa.whatsapp_api_url, ''''), u.whatsapp_api_url), whatsapp_api_key = coalesce(nullif(sa.whatsapp_api_key, ''''), u.whatsapp_api_key) from (select whatsapp_api_url, whatsapp_api_key from public.usuarios where whatsapp_api_url is not null and whatsapp_api_key is not null and nullif(whatsapp_api_url, '''') is not null and nullif(whatsapp_api_key, '''') is not null limit 1) u where (sa.whatsapp_api_url is null or sa.whatsapp_api_url = '''') and (sa.whatsapp_api_key is null or sa.whatsapp_api_key = '''')';
    execute 'update public.usuarios set whatsapp_api_url = null, whatsapp_api_key = null';

    execute $sql$
      create or replace function public.usuarios_block_whatsapp_update()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $func$
      begin
        if public.is_super_admin() then
          return NEW;
        end if;

        if NEW.whatsapp_habilitado is distinct from OLD.whatsapp_habilitado
          or NEW.whatsapp_api_url is distinct from OLD.whatsapp_api_url
          or NEW.whatsapp_api_key is distinct from OLD.whatsapp_api_key then
          raise exception 'not_allowed';
        end if;

        return NEW;
      end;
      $func$;
    $sql$;
    execute 'create trigger usuarios_block_whatsapp_update before update on public.usuarios for each row execute function public.usuarios_block_whatsapp_update()';
  else
    execute 'drop trigger if exists usuarios_block_whatsapp_update on public.usuarios';
    execute $sql$
      create or replace function public.usuarios_block_whatsapp_update()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $func$
      begin
        if public.is_super_admin() then
          return NEW;
        end if;

        if NEW.whatsapp_habilitado is distinct from OLD.whatsapp_habilitado then
          raise exception 'not_allowed';
        end if;

        return NEW;
      end;
      $func$;
    $sql$;
    execute 'create trigger usuarios_block_whatsapp_update before update on public.usuarios for each row execute function public.usuarios_block_whatsapp_update()';
  end if;
end;
$$;`
  }, [])

  const sqlFuncionarioHorarios = useMemo(() => {
    return `create or replace function public.funcionario_update_horarios(
  p_horario_inicio text,
  p_horario_fim text,
  p_dias_trabalho int[],
  p_intervalo_inicio text default null,
  p_intervalo_fim text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_exists boolean;
  v_start time;
  v_end time;
  v_iv_start time;
  v_iv_end time;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'unauthenticated';
  end if;

  select true
  into v_exists
  from public.funcionarios f
  where f.id = v_uid
    and f.ativo = true;

  if v_exists is distinct from true then
    raise exception 'funcionario_invalido';
  end if;

  if nullif(trim(p_horario_inicio), '') is null or nullif(trim(p_horario_fim), '') is null then
    raise exception 'horarios_invalidos';
  end if;

  v_start := p_horario_inicio::time;
  v_end := p_horario_fim::time;

  if v_end <= v_start then
    raise exception 'horarios_invalidos';
  end if;

  if p_dias_trabalho is null or array_length(p_dias_trabalho, 1) is null or array_length(p_dias_trabalho, 1) = 0 then
    raise exception 'dias_invalidos';
  end if;

  if exists (select 1 from unnest(p_dias_trabalho) d where d is null or d < 0 or d > 6) then
    raise exception 'dias_invalidos';
  end if;

  if nullif(trim(coalesce(p_intervalo_inicio, '')), '') is null and nullif(trim(coalesce(p_intervalo_fim, '')), '') is null then
    v_iv_start := null;
    v_iv_end := null;
  elsif nullif(trim(coalesce(p_intervalo_inicio, '')), '') is null or nullif(trim(coalesce(p_intervalo_fim, '')), '') is null then
    raise exception 'intervalo_invalido';
  else
    v_iv_start := p_intervalo_inicio::time;
    v_iv_end := p_intervalo_fim::time;
    if v_iv_end <= v_iv_start then
      raise exception 'intervalo_invalido';
    end if;
    if v_iv_start < v_start or v_iv_end > v_end then
      raise exception 'intervalo_invalido';
    end if;
  end if;

  update public.funcionarios
  set
    horario_inicio = v_start::text,
    horario_fim = v_end::text,
    dias_trabalho = p_dias_trabalho,
    intervalo_inicio = v_iv_start::text,
    intervalo_fim = v_iv_end::text
  where id = v_uid;
end;
$$;

revoke all on function public.funcionario_update_horarios(text, text, int[], text, text) from public;
grant execute on function public.funcionario_update_horarios(text, text, int[], text, text) to authenticated;`
  }, [])

  const sqlWhatsappLembretesCron = useMemo(() => {
    return `create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
declare
  v_jobid int;
begin
  select jobid
  into v_jobid
  from cron.job
  where command like '%whatsapp-lembretes%'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    '*/5 * * * *',
    $cron$
    select net.http_post(
      url:='${supabaseProjectUrl}/functions/v1/whatsapp-lembretes',
      headers:='{ "Content-Type": "application/json", "apikey": "${supabaseAnonKey}", "Authorization": "Bearer ${supabaseAnonKey}", "x-cron-secret": "<CRON_SECRET>" }'::jsonb,
      body:='{}'::jsonb
    );
    $cron$
  );
end;
$$;`
  }, [supabaseAnonKey, supabaseProjectUrl])

  const sqlBillingDailyCron = useMemo(() => {
    return `create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
declare
  v_jobid int;
begin
  select jobid
  into v_jobid
  from cron.job
  where command like '%whatsapp-lembretes%'
    and command like '%billing_daily%'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    '0 9 * * *',
    $cron$
    select net.http_post(
      url:='${supabaseProjectUrl}/functions/v1/whatsapp-lembretes',
      headers:='{ "Content-Type": "application/json", "apikey": "${supabaseAnonKey}", "Authorization": "Bearer ${supabaseAnonKey}", "x-cron-secret": "<CRON_SECRET>" }'::jsonb,
      body:='{ "action": "billing_daily" }'::jsonb
    );
    $cron$
  );
end;
$$;`
  }, [supabaseAnonKey, supabaseProjectUrl])

  const sqlBillingStatusTrigger = useMemo(() => {
    return `create extension if not exists pg_net;

create or replace function public.usuarios_notify_whatsapp_billing_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if TG_OP = 'UPDATE' then
      if NEW.status_pagamento is distinct from OLD.status_pagamento then
        begin
          perform net.http_post(
            url:='${supabaseProjectUrl}/functions/v1/whatsapp-lembretes',
            headers:='{ "Content-Type": "application/json", "apikey": "${supabaseAnonKey}", "Authorization": "Bearer ${supabaseAnonKey}", "x-cron-secret": "<CRON_SECRET>" }'::jsonb,
            body:=jsonb_build_object(
              'action', 'billing_status_changed',
              'usuario_id', NEW.id::text,
              'status_pagamento', NEW.status_pagamento
            )
          );
        exception
          when others then
            null;
        end;
      end if;
    end if;
  exception
    when others then
      null;
  end;

  return NEW;
end;
$$;

drop trigger if exists usuarios_whatsapp_billing_status_trg on public.usuarios;
create trigger usuarios_whatsapp_billing_status_trg
after update of status_pagamento on public.usuarios
for each row execute function public.usuarios_notify_whatsapp_billing_status();`
  }, [supabaseAnonKey, supabaseProjectUrl])

  const sqlWhatsappConfirmacaoTrigger = useMemo(() => {
    return `create extension if not exists pg_net;

create or replace function public.agendamentos_notify_whatsapp_confirmacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if TG_OP = 'INSERT' then
      if NEW.status = 'confirmado' then
        begin
          perform net.http_post(
            url:='${supabaseProjectUrl}/functions/v1/whatsapp-lembretes',
            headers:='{ "Content-Type": "application/json", "apikey": "${supabaseAnonKey}", "Authorization": "Bearer ${supabaseAnonKey}", "x-cron-secret": "<CRON_SECRET>" }'::jsonb,
            body:=jsonb_build_object('agendamento_id', NEW.id::text)
          );
        exception
          when others then
            null;
        end;
      end if;
    elsif TG_OP = 'UPDATE' then
      if NEW.status = 'confirmado' and (OLD.status is distinct from NEW.status) then
        begin
          perform net.http_post(
            url:='${supabaseProjectUrl}/functions/v1/whatsapp-lembretes',
            headers:='{ "Content-Type": "application/json", "apikey": "${supabaseAnonKey}", "Authorization": "Bearer ${supabaseAnonKey}", "x-cron-secret": "<CRON_SECRET>" }'::jsonb,
            body:=jsonb_build_object('agendamento_id', NEW.id::text)
          );
        exception
          when others then
            null;
        end;
      end if;
    end if;
  exception
    when others then
      null;
  end;
  return NEW;
end;
$$;

drop trigger if exists agendamentos_whatsapp_confirmacao_trg on public.agendamentos;
create trigger agendamentos_whatsapp_confirmacao_trg
after insert or update of status on public.agendamentos
for each row execute function public.agendamentos_notify_whatsapp_confirmacao();`
  }, [supabaseAnonKey, supabaseProjectUrl])

  const sqlAuditLogs = useMemo(() => {
    return `create extension if not exists pgcrypto;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  usuario_id uuid null,
  tabela text not null,
  acao text not null,
  registro_id text null,
  ator_email text null
);

create index if not exists audit_logs_criado_em_idx on public.audit_logs (criado_em desc);
create index if not exists audit_logs_usuario_id_idx on public.audit_logs (usuario_id);

alter table public.audit_logs enable row level security;

drop policy if exists "super_admin_select_audit_logs" on public.audit_logs;
create policy "super_admin_select_audit_logs" on public.audit_logs
for select to authenticated
using (public.is_super_admin());

create or replace function public.audit_logs_capture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := coalesce(to_jsonb(NEW), to_jsonb(OLD));
  v_usuario_id uuid := null;
  v_registro_id text := null;
  v_actor_email text := nullif(auth.jwt() ->> 'email', '');
begin
  begin
    if TG_TABLE_SCHEMA <> 'public' then
      return null;
    end if;

    if TG_TABLE_NAME = 'audit_logs' then
      return null;
    end if;

    v_registro_id := coalesce(v_row ->> 'id', null);

    if TG_TABLE_NAME = 'usuarios' then
      if (v_row ? 'id') then
        v_usuario_id := nullif(v_row ->> 'id', '')::uuid;
      end if;
    else
      if (v_row ? 'usuario_id') then
        v_usuario_id := nullif(v_row ->> 'usuario_id', '')::uuid;
      elsif (v_row ? 'usuario_master_id') then
        v_usuario_id := nullif(v_row ->> 'usuario_master_id', '')::uuid;
      end if;
    end if;

    insert into public.audit_logs (usuario_id, tabela, acao, registro_id, ator_email)
    values (v_usuario_id, TG_TABLE_NAME, lower(TG_OP), v_registro_id, v_actor_email);
  exception
    when others then
      return null;
  end;

  return null;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'usuarios') then
    drop trigger if exists audit_usuarios on public.usuarios;
    create trigger audit_usuarios
    after insert or update or delete on public.usuarios
    for each row execute function public.audit_logs_capture();
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'funcionarios') then
    drop trigger if exists audit_funcionarios on public.funcionarios;
    create trigger audit_funcionarios
    after insert or update or delete on public.funcionarios
    for each row execute function public.audit_logs_capture();
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'servicos') then
    drop trigger if exists audit_servicos on public.servicos;
    create trigger audit_servicos
    after insert or update or delete on public.servicos
    for each row execute function public.audit_logs_capture();
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'agendamentos') then
    drop trigger if exists audit_agendamentos on public.agendamentos;
    create trigger audit_agendamentos
    after insert or update or delete on public.agendamentos
    for each row execute function public.audit_logs_capture();
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'bloqueios') then
    drop trigger if exists audit_bloqueios on public.bloqueios;
    create trigger audit_bloqueios
    after insert or update or delete on public.bloqueios
    for each row execute function public.audit_logs_capture();
  end if;
end;
$$;`
  }, [])

  return (
    <AdminShell>
      <div className="space-y-6">
        <Card>
          <div className="p-6 space-y-2">
            <div className="text-sm font-semibold text-slate-900">Sessão</div>
            <div className="text-sm text-slate-700">{email ?? '—'}</div>
            <div className="text-xs text-slate-600 font-mono">{userId ?? '—'}</div>
          </div>
        </Card>

        <Card>
          <div className="p-6 space-y-3">
            <div className="text-sm font-semibold text-slate-900">Email (Resend) — DNS</div>
            <div className="text-sm text-slate-600">
              Esse checker não altera DNS. Ele só confirma se os registros exigidos pelo Resend já estão públicos.
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <div className="text-xs text-slate-600 mb-1">Domínio</div>
                <Input value={resendDomain} onChange={(e) => setResendDomain(e.target.value)} placeholder="smagenda.com.br" />
              </div>

              <div className="flex gap-2">
                <Button onClick={() => runResend('status')} disabled={resendLoading}>
                  Checar
                </Button>
                <Button variant="secondary" onClick={() => runResend('verify')} disabled={resendLoading}>
                  Revalidar no Resend
                </Button>
              </div>
            </div>

            {resendError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{resendError}</div> : null}

            {resendResult?.domain ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <div>
                      <span className="text-slate-600">Domínio:</span> <span className="font-mono">{resendResult.domain.name ?? '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-600">Status:</span> <span className="font-mono">{resendResult.domain.status ?? '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-600">Região:</span> <span className="font-mono">{resendResult.domain.region ?? '—'}</span>
                    </div>
                  </div>
                  {resendResult.dns?.nameservers && resendResult.dns.nameservers.length > 0 ? (
                    <div className="mt-2 text-xs text-slate-600">
                      NS: <span className="font-mono">{resendResult.dns.nameservers.join(' • ')}</span>
                    </div>
                  ) : null}
                </div>

                {resendResult.dns?.records && resendResult.dns.records.length > 0 ? (
                  <div className="space-y-2">
                    {resendResult.dns.records.map((r, idx) => {
                      const match = r.dns?.match === true
                      const found = r.dns?.found === true
                      const cls = match
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : found
                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                          : 'border-rose-200 bg-rose-50 text-rose-700'
                      return (
                        <div key={`${r.fqdn ?? idx}`} className={`rounded-xl border p-3 ${cls}`}>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                            <span className="font-mono">
                              {r.type ?? '—'} {r.fqdn ?? r.name ?? '—'}
                            </span>
                            <span className="text-slate-600">Resend:</span>
                            <span className="font-mono">{r.resendStatus ?? '—'}</span>
                            <span className="text-slate-600">DNS:</span>
                            <span className="font-mono">{match ? 'ok' : found ? 'encontrado (difere)' : 'não encontrado'}</span>
                          </div>

                          <div className="mt-2 text-xs">
                            <div>
                              <span className="text-slate-600">Esperado:</span>{' '}
                              <span className="font-mono break-all">
                                {r.expected?.value ?? '—'}
                                {typeof r.expected?.priority === 'number' ? ` (prio ${r.expected.priority})` : ''}
                              </span>
                            </div>

                            {r.dns?.values && r.dns.values.length > 0 ? (
                              <div className="mt-1">
                                <span className="text-slate-600">Retorno:</span>{' '}
                                <span className="font-mono break-all">{r.dns.values.join(' | ')}</span>
                              </div>
                            ) : null}

                            {r.hint ? <div className="mt-1 text-xs">{r.hint}</div> : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <div className="p-6 space-y-3">
            <div className="text-sm font-semibold text-slate-900">Email (Resend) — Teste de envio</div>
            <div className="text-sm text-slate-600">
              Envia um email real via API do Resend. Se falhar, normalmente é DNS/domínio não verificado ou falta da secret `RESEND_API_KEY`.
            </div>

            <div className="flex flex-col gap-3">
              <Input label="Remetente (From)" value={resendTestFrom} onChange={(e) => setResendTestFrom(e.target.value)} placeholder="SMagenda <no-reply@smagenda.com.br>" />
              <Input
                label="Destinatário (To)"
                value={resendTestTo}
                onChange={(e) => setResendTestTo(e.target.value)}
                placeholder="seuemail@dominio.com"
              />
              <Input
                label="Assunto"
                value={resendTestSubject}
                onChange={(e) => setResendTestSubject(e.target.value)}
                placeholder="Teste de email"
              />
              <div className="flex justify-end">
                <Button onClick={sendResendTest} disabled={resendTestSending || resendLoading}>
                  {resendTestSending ? 'Enviando…' : 'Enviar email teste'}
                </Button>
              </div>
            </div>

            {resendTestError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{resendTestError}</div>
            ) : null}
            {resendTestResult ? (
              <pre className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 overflow-auto whitespace-pre-wrap">
                {JSON.stringify(resendTestResult, null, 2)}
              </pre>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
              <div className="font-semibold text-slate-900">SMTP (Supabase Auth)</div>
              <div className="text-slate-600">
                Para os emails de confirmação e recuperação de senha do Supabase, configure em Authentication → SMTP Settings.
              </div>
              <div className="mt-2 text-xs text-slate-600 font-mono">
                Host=smtp.resend.com • Username=resend • Password=RESEND_API_KEY • Port=465 (SMTPS) ou 587 (STARTTLS)
              </div>
            </div>
          </div>
        </Card>

        <SqlCard
          title="SQL de políticas (Super Admin)"
          description="Use se as telas do admin retornarem erro de RLS/permissão."
          sql={sql}
        />

        <SqlCard
          title="SQL de Trial (15 dias / 1 funcionário)"
          description="Use para habilitar trial automático após confirmação de email."
          sql={sqlTrial}
        />

        <SqlCard
          title="SQL de Pagamento (Stripe)"
          description="Use para permitir que o webhook salve o status de pagamento real."
          sql={sqlPaymentsStripe}
        />

        <SqlCard
          title="SQL de políticas (Usuário / Funcionário)"
          description="Use para liberar o login e o acesso do funcionário às telas."
          sql={sqlRlsApp}
        />

        <SqlCard
          title="SQL do horário do funcionário"
          description="Use para permitir que o funcionário salve o próprio horário (início/fim/dias/intervalo)."
          sql={sqlFuncionarioHorarios}
        />

        <SqlCard
          title="SQL de horários públicos (ocupações + bloqueios)"
          description="Use para o link público respeitar agendamentos e bloqueios."
          sql={sqlPublicOcupacoes}
        />

        <SqlCard
          title="SQL do link público (listar + agendar)"
          description="Use para o link público funcionar com RLS habilitado, sem expor dados sensíveis."
          sql={sqlPublicBooking}
          defaultOpen
        />

        <SqlCard
          title="SQL da taxa de agendamento (créditos)"
          description="Use para habilitar taxa por serviço, cobrança no agendamento público e crédito por falta."
          sql={sqlTaxaAgendamento}
        />

        <SqlCard
          title="SQL de Multi-unidades (EMPRESA)"
          description="Use para criar filiais e habilitar links do tipo /agendar/:slug/:unidade."
          sql={sqlMultiUnidadesEnterprise}
        />

        <SqlCard title="SQL do Storage (logos)" description="Use para upload de logo no onboarding e exibição no link público." sql={sqlStorageLogos} />

        <SqlCard
          title="SQL do Storage (fotos de serviços)"
          description="Use para upload de fotos dos serviços (bucket público + políticas por usuário)."
          sql={sqlStorageServicosFotos}
        />

        <SqlCard title="SQL de fotos nos serviços (PRO+)" description="Use para liberar fotos de serviços apenas no plano PRO+." sql={sqlServicosFotosPro} />

        <SqlCard
          title="SQL de limite de serviços (BASIC)"
          description="Use para limitar a criação de serviços a 3 no plano BASIC/FREE."
          sql={sqlServicosLimiteBasic}
        />

        <SqlCard title="SQL do WhatsApp (automação)" description="Use para habilitar QR Code, confirmação automática e lembretes." sql={sqlWhatsappAutomacao} />

        <SqlCard
          title="SQL do WhatsApp (habilitação por cliente)"
          description="Use para liberar o WhatsApp por cliente via painel do Super Admin."
          sql={sqlWhatsappHabilitacao}
        />

        <SqlCard
          title="SQL do WhatsApp (Super Admin)"
          description="Use para salvar a Evolution API e enviar avisos na tela do Super Admin."
          sql={sqlWhatsappSuperAdmin}
        />

        <SqlCard
          title="SQL do WhatsApp (migração p/ config global)"
          description="Use para aplicar o modelo novo (URL/key no Super Admin) e limpar URL/key dos usuários."
          sql={sqlWhatsappGlobalConfig}
        />

        <SqlCard
          title="SQL do WhatsApp (cron de lembretes)"
          description="Use para executar lembretes automaticamente a cada 5 minutos."
          sql={sqlWhatsappLembretesCron}
        />

        <SqlCard
          title="SQL de Cobrança (cron diário)"
          description="Use para enviar avisos e suspender/cancelar automaticamente por atraso."
          sql={sqlBillingDailyCron}
        />

        <SqlCard
          title="SQL de Cobrança (trigger de status)"
          description="Use para avisar no WhatsApp quando o status do pagamento mudar."
          sql={sqlBillingStatusTrigger}
        />

        <SqlCard
          title="SQL do WhatsApp (trigger confirmação imediata)"
          description="Use para enviar confirmação automaticamente ao criar/confirmar um agendamento."
          sql={sqlWhatsappConfirmacaoTrigger}
        />

        <SqlCard title="SQL de Logs de Auditoria" description="Use para registrar ações nas tabelas e exibir em /admin/logs." sql={sqlAuditLogs} />
      </div>
    </AdminShell>
  )
}
