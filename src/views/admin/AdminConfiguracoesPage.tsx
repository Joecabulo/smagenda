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

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession()
      setUserId(data.session?.user?.id ?? null)
      setEmail(data.session?.user?.email ?? null)

      const host = window.location.hostname
      if (host && host !== 'localhost' && host !== '127.0.0.1' && host.includes('.') && !resendDomain) {
        setResendDomain(host)
      }
    }
    run().catch(() => undefined)
  }, [resendDomain])

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

  const sqlRlsApp = useMemo(() => {
    return `alter table public.usuarios enable row level security;
alter table public.funcionarios enable row level security;
alter table public.servicos enable row level security;
alter table public.agendamentos enable row level security;
alter table public.bloqueios enable row level security;

drop policy if exists "usuarios_select_self_or_master_for_funcionario" on public.usuarios;
create policy "usuarios_select_self_or_master_for_funcionario" on public.usuarios
for select to authenticated
using (
  id = auth.uid()
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
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "funcionarios_select_master_or_self" on public.funcionarios;
create policy "funcionarios_select_master_or_self" on public.funcionarios
for select to authenticated
using (
  usuario_master_id = auth.uid()
  or id = auth.uid()
);

drop policy if exists "funcionarios_insert_master" on public.funcionarios;
create policy "funcionarios_insert_master" on public.funcionarios
for insert to authenticated
with check (usuario_master_id = auth.uid());

drop policy if exists "funcionarios_update_master" on public.funcionarios;
create policy "funcionarios_update_master" on public.funcionarios
for update to authenticated
using (usuario_master_id = auth.uid())
with check (usuario_master_id = auth.uid());

drop policy if exists "funcionarios_delete_master" on public.funcionarios;
create policy "funcionarios_delete_master" on public.funcionarios
for delete to authenticated
using (usuario_master_id = auth.uid());

drop policy if exists "servicos_select_master_or_funcionario" on public.servicos;
create policy "servicos_select_master_or_funcionario" on public.servicos
for select to authenticated
using (
  usuario_id = auth.uid()
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
  or (
    funcionario_id = auth.uid()
    and exists (
      select 1
      from public.funcionarios f
      where f.id = auth.uid()
        and f.usuario_master_id = agendamentos.usuario_id
        and f.ativo = true
        and f.pode_cancelar_agendamentos = true
    )
  )
)
with check (
  usuario_id = auth.uid()
  or (
    funcionario_id = auth.uid()
    and exists (
      select 1
      from public.funcionarios f
      where f.id = auth.uid()
        and f.usuario_master_id = agendamentos.usuario_id
        and f.ativo = true
        and f.pode_cancelar_agendamentos = true
    )
  )
);

drop policy if exists "agendamentos_delete_master" on public.agendamentos;
create policy "agendamentos_delete_master" on public.agendamentos
for delete to authenticated
using (usuario_id = auth.uid());

drop policy if exists "bloqueios_select_master_or_funcionario" on public.bloqueios;
create policy "bloqueios_select_master_or_funcionario" on public.bloqueios
for select to authenticated
using (
  usuario_id = auth.uid()
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

  const sqlPublicBooking = useMemo(() => {
    return `drop function if exists public.public_get_usuario_publico(text);

alter table public.usuarios add column if not exists slug text;
create unique index if not exists usuarios_slug_unique on public.usuarios (slug);

alter table public.usuarios add column if not exists logo_url text;
alter table public.usuarios add column if not exists public_primary_color text;
alter table public.usuarios add column if not exists public_background_color text;
alter table public.usuarios add column if not exists public_background_image_url text;

create or replace function public.public_get_usuario_publico(p_slug text)
returns table (
  id uuid,
  nome_negocio text,
  logo_url text,
  endereco text,
  telefone text,
  horario_inicio text,
  horario_fim text,
  dias_trabalho int[],
  intervalo_inicio text,
  intervalo_fim text,
  ativo boolean,
  tipo_conta text,
  public_primary_color text,
  public_background_color text,
  public_background_image_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    u.id,
    u.nome_negocio,
    u.logo_url,
    u.endereco,
    u.telefone,
    u.horario_inicio,
    u.horario_fim,
    u.dias_trabalho,
    u.intervalo_inicio,
    u.intervalo_fim,
    u.ativo,
    u.tipo_conta::text,
    u.public_primary_color,
    u.public_background_color,
    u.public_background_image_url
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
  duracao_minutos int,
  preco numeric,
  cor text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select s.id, s.nome, s.duracao_minutos, s.preco, s.cor
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
  select f.id, f.nome_completo, f.horario_inicio, f.horario_fim, f.dias_trabalho, f.intervalo_inicio, f.intervalo_fim
  from public.funcionarios f
  where f.usuario_master_id = p_usuario_master_id
    and f.ativo = true
  order by f.criado_em asc;
end;
$$;

create or replace function public.public_create_agendamento_publico(
  p_usuario_id uuid,
  p_data date,
  p_hora_inicio text,
  p_servico_id uuid,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_funcionario_id uuid
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
  v_staff_horario_inicio text;
  v_staff_horario_fim text;
  v_staff_dias_trabalho int[];
  v_staff_intervalo_inicio text;
  v_staff_intervalo_fim text;
  v_duracao int;
  v_start_min int;
  v_end_min int;
  v_weekday int;
  v_sched_inicio text;
  v_sched_fim text;
  v_iv_inicio text;
  v_iv_fim text;
  v_horario_fim text;
  v_created_id uuid;
begin
  if p_usuario_id is null or p_data is null or nullif(p_hora_inicio, '') is null or p_servico_id is null then
    raise exception 'invalid_payload';
  end if;

  v_uid := p_usuario_id;

  select u.horario_inicio, u.horario_fim, u.dias_trabalho, u.intervalo_inicio, u.intervalo_fim
  into v_base
  from public.usuarios u
  where u.id = v_uid
    and u.ativo = true;

  if v_base is null then
    raise exception 'usuario_invalido';
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

  v_sched_inicio := coalesce(v_staff_horario_inicio, v_base.horario_inicio);
  v_sched_fim := coalesce(v_staff_horario_fim, v_base.horario_fim);
  v_iv_inicio := coalesce(v_staff_intervalo_inicio, v_base.intervalo_inicio);
  v_iv_fim := coalesce(v_staff_intervalo_fim, v_base.intervalo_fim);

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

  if v_start_min < floor(extract(epoch from (v_sched_inicio::time)) / 60)::int then
    raise exception 'fora_do_horario';
  end if;
  if v_end_min > floor(extract(epoch from (v_sched_fim::time)) / 60)::int then
    raise exception 'fora_do_horario';
  end if;

  if v_iv_inicio is not null and v_iv_fim is not null then
    if v_start_min < floor(extract(epoch from (v_iv_fim::time)) / 60)::int
      and floor(extract(epoch from (v_iv_inicio::time)) / 60)::int < v_end_min then
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
    p_hora_inicio,
    v_horario_fim,
    'pendente'
  )
  returning id into v_created_id;

  return v_created_id;
end;
$$;

revoke all on function public.public_get_usuario_publico(text) from public;
revoke all on function public.public_get_servicos_publicos(uuid) from public;
revoke all on function public.public_get_funcionarios_publicos(uuid) from public;
revoke all on function public.public_create_agendamento_publico(uuid, date, text, uuid, text, text, uuid) from public;

grant execute on function public.public_get_usuario_publico(text) to anon;
grant execute on function public.public_get_servicos_publicos(uuid) to anon;
grant execute on function public.public_get_funcionarios_publicos(uuid) to anon;
grant execute on function public.public_create_agendamento_publico(uuid, date, text, uuid, text, text, uuid) to anon;

grant execute on function public.public_get_usuario_publico(text) to authenticated;
grant execute on function public.public_get_servicos_publicos(uuid) to authenticated;
grant execute on function public.public_get_funcionarios_publicos(uuid) to authenticated;
grant execute on function public.public_create_agendamento_publico(uuid, date, text, uuid, text, text, uuid) to authenticated;`
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

drop policy if exists "super_admin_self_update" on public.super_admin;
create policy "super_admin_self_update" on public.super_admin
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

grant select, update on public.super_admin to authenticated;

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

drop policy if exists "super_admin_self_update" on public.super_admin;
create policy "super_admin_self_update" on public.super_admin
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

grant select, update on public.super_admin to authenticated;

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
      url:='https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-lembretes',
      headers:='{ "Content-Type": "application/json", "apikey": "<SUPABASE_ANON_KEY>", "Authorization": "Bearer <SUPABASE_ANON_KEY>", "x-cron-secret": "<CRON_SECRET>" }'::jsonb,
      body:='{}'::jsonb
    );
    $cron$
  );
end;
$$;`
  }, [])

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
          title="SQL de políticas (Usuário / Funcionário)"
          description="Use para liberar o login e o acesso do funcionário às telas."
          sql={sqlRlsApp}
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

        <SqlCard title="SQL do Storage (logos)" description="Use para upload de logo no onboarding e exibição no link público." sql={sqlStorageLogos} />

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

        <SqlCard title="SQL de Logs de Auditoria" description="Use para registrar ações nas tabelas e exibir em /admin/logs." sql={sqlAuditLogs} />
      </div>
    </AdminShell>
  )
}
