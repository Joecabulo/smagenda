import { useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PageTutorial, TutorialOverlay } from '../../components/ui/TutorialOverlay'
import { checkJwtProject, supabase, supabaseEnv } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

const defaultConfirmacao = `Olá {nome}!\n\nSeu agendamento foi confirmado:\n📅 {data} às {hora}\n✂️ {servico}\n💰 {preco}\n\nLocal: {endereco}\n\nNos vemos em breve!\n{nome_negocio}`
const defaultLembrete = `Oi {nome}!\n\nLembrete: você tem agendamento em {data} às {hora}.\n\nSe não puder comparecer, me avise!\n{telefone_profissional}`

type TemplatePreset = {
  key: string
  title: string
  confirmacao: string
  lembrete: string
}

const templatePresets: TemplatePreset[] = [
  {
    key: 'padrao_servicos',
    title: 'Padrão (serviços)',
    confirmacao: defaultConfirmacao,
    lembrete: defaultLembrete,
  },
  {
    key: 'salao',
    title: 'Salão / Barbearia',
    confirmacao:
      `Olá {nome}!\n\n✅ Seu horário está confirmado:\n📅 {data} às {hora}\n✂️ {servico}\n\nProfissional: {profissional_nome}\nLocal: {unidade_nome}\n{unidade_endereco}\n\nAté já!\n{nome_negocio}`,
    lembrete:
      `Oi {nome}!\n\n⏰ Lembrete do seu horário:\n📅 {data} às {hora}\n✂️ {servico}\nProfissional: {profissional_nome}\n\nSe precisar remarcar, fale com a gente: {telefone_profissional}`,
  },
  {
    key: 'odontologia',
    title: 'Odontologia',
    confirmacao:
      `Olá {nome}!\n\n✅ Sua consulta está confirmada:\n📅 {data} às {hora}\n🦷 {servico}\n\nDoutor(a): {profissional_nome}\nLocal: {unidade_nome}\n{unidade_endereco}\n\nQualquer dúvida: {telefone_profissional}\n{nome_negocio}`,
    lembrete:
      `Olá {nome}!\n\n🦷 Lembrete da sua consulta:\n📅 {data} às {hora}\nProcedimento: {servico}\nProfissional: {profissional_nome}\n\nSe precisar remarcar: {telefone_profissional}`,
  },
  {
    key: 'estetica',
    title: 'Estética / Bem-estar',
    confirmacao:
      `Olá {nome}!\n\n✅ Seu atendimento está confirmado:\n📅 {data} às {hora}\n💆 {servico}\n\nProfissional: {profissional_nome}\nLocal: {unidade_nome}\n{unidade_endereco}\n\nAté breve!\n{nome_negocio}`,
    lembrete:
      `Oi {nome}!\n\n✨ Lembrete do seu atendimento:\n📅 {data} às {hora}\n💆 {servico}\n\nQualquer ajuste: {telefone_profissional}`,
  },
]

const templateVars: Array<{ key: string; label: string }> = [
  { key: 'nome', label: 'Cliente' },
  { key: 'data', label: 'Data' },
  { key: 'hora', label: 'Hora' },
  { key: 'servico', label: 'Serviço' },
  { key: 'preco', label: 'Preço' },
  { key: 'profissional_nome', label: 'Profissional' },
  { key: 'telefone_profissional', label: 'Telefone' },
  { key: 'unidade_nome', label: 'Unidade' },
  { key: 'unidade_endereco', label: 'Endereço unidade' },
  { key: 'unidade_telefone', label: 'Telefone unidade' },
  { key: 'endereco', label: 'Endereço (fallback)' },
  { key: 'nome_negocio', label: 'Nome do negócio' },
]

type AgendamentoConfirmadoRow = {
  id: string
  data: string
  hora_inicio: string | null
  cliente_nome: string | null
  cliente_telefone: string | null
  status?: string | null
  confirmacao_enviada?: boolean | null
}

async function sendConfirmacaoWhatsapp(agendamentoId: string) {
  if (!supabaseEnv.ok) {
    return { ok: false as const, status: 0, body: { error: 'missing_supabase_env' } }
  }

  const supabaseUrl = supabaseEnv.values.VITE_SUPABASE_URL
  const supabaseAnonKey = supabaseEnv.values.VITE_SUPABASE_ANON_KEY

  const tryRefresh = async () => {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
    if (refreshErr) return null
    return refreshed.session ?? null
  }

  const { data: sessionData } = await supabase.auth.getSession()
  let session = sessionData.session
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = session?.expires_at ?? null

  if (session && expiresAt && expiresAt <= now + 60) {
    const refreshed = await tryRefresh()
    if (refreshed) session = refreshed
  }

  const token = session?.access_token ?? null
  if (!token) {
    return { ok: false as const, status: 401, body: { error: 'session_expired' } }
  }

  const tokenProject = checkJwtProject(token, supabaseUrl)
  if (!tokenProject.ok) {
    await supabase.auth.signOut().catch(() => undefined)
    return { ok: false as const, status: 401, body: { error: 'jwt_project_mismatch', iss: tokenProject.iss, expected: tokenProject.expectedPrefix } }
  }

  const callFetch = async (jwt: string) => {
    const fnUrl = `${supabaseUrl}/functions/v1/whatsapp`
    let res: Response
    try {
      res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${jwt}`,
          'x-user-jwt': jwt,
        },
        body: JSON.stringify({ action: 'send_confirmacao', agendamento_id: agendamentoId }),
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha de rede'
      return { ok: false as const, status: 0, body: { error: 'network_error', message: msg } }
    }

    const fnVersion = res.headers.get('x-smagenda-fn')

    const text = await res.text()
    let parsed: unknown = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = text
    }

    if (!res.ok && res.status === 401 && !fnVersion) {
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed as Record<string, unknown>).message === 'Invalid JWT' &&
        (parsed as Record<string, unknown>).code === 401
      ) {
        return { ok: false as const, status: 401, body: { error: 'supabase_gateway_invalid_jwt' } }
      }
    }

    if (!res.ok) return { ok: false as const, status: res.status, body: parsed }
    return { ok: true as const, status: res.status, body: parsed }
  }

  const isInvalidJwtPayload = (payload: unknown) => {
    if (typeof payload === 'string') return payload.includes('Invalid JWT')
    if (!payload || typeof payload !== 'object') return false
    const obj = payload as Record<string, unknown>
    return obj.message === 'Invalid JWT' || obj.error === 'invalid_jwt'
  }

  const first = await callFetch(token)
  if (
    !first.ok &&
    first.status === 401 &&
    typeof first.body === 'object' &&
    first.body !== null &&
    (first.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt'
  ) {
    return first
  }

  if (!first.ok && first.status === 401 && isInvalidJwtPayload(first.body)) {
    const refreshed = await tryRefresh()
    const nextToken = refreshed?.access_token ?? null
    if (!nextToken) return { ok: false as const, status: 401, body: { error: 'invalid_jwt' } }
    return callFetch(nextToken)
  }

  return first
}

export function MensagensSettingsPage() {
  const { appPrincipal } = useAuth()
  const navigate = useNavigate()
  const usuarioId =
    appPrincipal?.kind === 'usuario' ? appPrincipal.profile.id : appPrincipal?.kind === 'funcionario' ? appPrincipal.profile.usuario_master_id : null
  const canEditTemplates = useMemo(() => appPrincipal?.kind === 'usuario' && Boolean(usuarioId), [appPrincipal?.kind, usuarioId])
  const canTestConfirmacao = Boolean(usuarioId)

  const tutorialSteps = useMemo(
    () =>
      [
        {
          title: 'Ative as automações',
          body: 'Ligue/desligue confirmação e lembrete automático. Ajuste as horas do lembrete conforme seu fluxo.',
          target: 'prefs' as const,
        },
        {
          title: 'Edite os templates',
          body: 'Personalize as mensagens e use variáveis como {nome}, {data} e {hora}.',
          target: 'templates' as const,
        },
        {
          title: 'Teste com um agendamento',
          body: 'Selecione um agendamento e envie uma confirmação para validar o WhatsApp em produção.',
          target: 'test' as const,
        },
      ] as const,
    []
  )

  const [mensagemConfirmacao, setMensagemConfirmacao] = useState(defaultConfirmacao)
  const [mensagemLembrete, setMensagemLembrete] = useState(defaultLembrete)
  const [presetKey, setPresetKey] = useState(templatePresets[0]?.key ?? 'padrao_servicos')
  const [lastField, setLastField] = useState<'confirmacao' | 'lembrete'>('confirmacao')
  const confirmacaoRef = useRef<HTMLTextAreaElement | null>(null)
  const lembreteRef = useRef<HTMLTextAreaElement | null>(null)
  const [enviarConfirmacao, setEnviarConfirmacao] = useState(true)
  const [enviarLembrete, setEnviarLembrete] = useState(false)
  const [lembreteHorasAntes, setLembreteHorasAntes] = useState(24)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [schemaIncompleto, setSchemaIncompleto] = useState(false)

  const [agLoading, setAgLoading] = useState(false)
  const [agendamentosConfirmados, setAgendamentosConfirmados] = useState<AgendamentoConfirmadoRow[]>([])
  const [agendamentoSelecionadoId, setAgendamentoSelecionadoId] = useState('')
  const [sendingConfirmacao, setSendingConfirmacao] = useState(false)
  const [sendConfirmacaoResult, setSendConfirmacaoResult] = useState<string | null>(null)
  const [agError, setAgError] = useState<string | null>(null)

  const isMissingColumnError = (message: string) => message.toLowerCase().includes('does not exist') && message.toLowerCase().includes('column')

  useEffect(() => {
    const run = async () => {
      if (!usuarioId) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      setSchemaIncompleto(false)

      const { data: baseData, error: baseErr } = await supabase
        .from('usuarios')
        .select('mensagem_confirmacao,mensagem_lembrete')
        .eq('id', usuarioId)
        .maybeSingle()

      if (baseErr) {
        setError(baseErr.message)
        setLoading(false)
        return
      }

      const baseRow = (baseData ?? null) as unknown as { mensagem_confirmacao?: string | null; mensagem_lembrete?: string | null } | null
      setMensagemConfirmacao(baseRow?.mensagem_confirmacao ?? defaultConfirmacao)
      setMensagemLembrete(baseRow?.mensagem_lembrete ?? defaultLembrete)

      const { data: extraData, error: extraErr } = await supabase
        .from('usuarios')
        .select('enviar_confirmacao,enviar_lembrete,lembrete_horas_antes')
        .eq('id', usuarioId)
        .maybeSingle()

      if (extraErr) {
        if (isMissingColumnError(extraErr.message)) {
          setSchemaIncompleto(true)
          setEnviarConfirmacao(true)
          setEnviarLembrete(false)
          setLembreteHorasAntes(24)
          setLoading(false)
          return
        }
        setError(extraErr.message)
        setLoading(false)
        return
      }
      const row =
        (extraData ?? null) as unknown as {
          enviar_confirmacao?: boolean | null
          enviar_lembrete?: boolean | null
          lembrete_horas_antes?: number | null
        } | null
      setEnviarConfirmacao(row?.enviar_confirmacao ?? true)
      setEnviarLembrete(row?.enviar_lembrete ?? false)
      setLembreteHorasAntes(typeof row?.lembrete_horas_antes === 'number' ? row?.lembrete_horas_antes : 24)
      setLoading(false)
    }
    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar mensagens')
      setLoading(false)
    })
  }, [usuarioId])

  useEffect(() => {
    const run = async () => {
      if (!usuarioId) return
      setAgLoading(true)
      setSendConfirmacaoResult(null)
      setAgError(null)

      const baseSelect = 'id,data,hora_inicio,cliente_nome,cliente_telefone,status,confirmacao_enviada'
      const fallbackSelect = 'id,data,hora_inicio,cliente_nome,cliente_telefone,status'
      const isMissingColumnError = (message: string) => message.toLowerCase().includes('does not exist') && message.toLowerCase().includes('column')

      const first = await supabase
        .from('agendamentos')
        .select(baseSelect)
        .eq('usuario_id', usuarioId)
        .order('data', { ascending: false })
        .order('hora_inicio', { ascending: false })
        .limit(30)

      if (first.error) {
        if (!isMissingColumnError(first.error.message)) {
          setAgendamentosConfirmados([])
          setAgError(first.error.message)
          setAgLoading(false)
          return
        }

        const second = await supabase
          .from('agendamentos')
          .select(fallbackSelect)
          .eq('usuario_id', usuarioId)
          .order('data', { ascending: false })
          .order('hora_inicio', { ascending: false })
          .limit(30)

        if (second.error) {
          setAgendamentosConfirmados([])
          setAgError(second.error.message)
          setAgLoading(false)
          return
        }

        const list = (second.data ?? []) as unknown as AgendamentoConfirmadoRow[]
        setAgendamentosConfirmados(list)
        setAgendamentoSelecionadoId((prev) => prev || (list[0]?.id ?? ''))
        setAgLoading(false)
        return
      }

      const list = (first.data ?? []) as unknown as AgendamentoConfirmadoRow[]
      setAgendamentosConfirmados(list)
      setAgendamentoSelecionadoId((prev) => prev || (list[0]?.id ?? ''))
      setAgLoading(false)
    }

    run().catch(() => {
      setAgError('Erro ao carregar agendamentos')
      setAgLoading(false)
    })
  }, [usuarioId])

  const selectedAgendamento = useMemo(() => {
    if (!agendamentoSelecionadoId) return null
    return agendamentosConfirmados.find((a) => a.id === agendamentoSelecionadoId) ?? null
  }, [agendamentoSelecionadoId, agendamentosConfirmados])

  const save = async () => {
    if (!usuarioId) return
    setSaving(true)
    setSaved(false)
    setError(null)

    const { error: baseErr } = await supabase
      .from('usuarios')
      .update({ mensagem_confirmacao: mensagemConfirmacao, mensagem_lembrete: mensagemLembrete })
      .eq('id', usuarioId)

    if (baseErr) {
      setError(baseErr.message)
      setSaving(false)
      return
    }

    const { error: extraErr } = await supabase
      .from('usuarios')
      .update({ enviar_confirmacao: enviarConfirmacao, enviar_lembrete: enviarLembrete, lembrete_horas_antes: lembreteHorasAntes })
      .eq('id', usuarioId)

    if (extraErr) {
      if (isMissingColumnError(extraErr.message)) {
        setSchemaIncompleto(true)
        setSaving(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        return
      }
      setError(extraErr.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const applyPreset = (target: 'confirmacao' | 'lembrete' | 'both') => {
    const preset = templatePresets.find((p) => p.key === presetKey) ?? templatePresets[0]
    if (!preset) return
    if (target === 'confirmacao' || target === 'both') setMensagemConfirmacao(preset.confirmacao)
    if (target === 'lembrete' || target === 'both') setMensagemLembrete(preset.lembrete)
  }

  const insertVar = (key: string) => {
    const token = `{${key}}`
    const active = lastField === 'confirmacao' ? confirmacaoRef.current : lembreteRef.current
    const getter = lastField === 'confirmacao' ? mensagemConfirmacao : mensagemLembrete
    const setter = lastField === 'confirmacao' ? setMensagemConfirmacao : setMensagemLembrete
    if (!active) {
      setter(`${getter}${getter ? ' ' : ''}${token}`)
      return
    }

    const start = active.selectionStart ?? getter.length
    const end = active.selectionEnd ?? getter.length
    const next = `${getter.slice(0, start)}${token}${getter.slice(end)}`
    setter(next)
    requestAnimationFrame(() => {
      active.focus()
      const pos = start + token.length
      active.setSelectionRange(pos, pos)
    })
  }

  return (
    <PageTutorial usuarioId={usuarioId} page="mensagens">
      {({ tutorialOpen, tutorialStep, setTutorialStep, resetTutorial, closeTutorial }) => (
        <AppShell>
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-500">Configurações</div>
                <div className="text-xl font-semibold text-slate-900">Mensagens automáticas</div>
              </div>
              <Button variant="secondary" onClick={resetTutorial}>
                Rever tutorial
              </Button>
            </div>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
        {schemaIncompleto ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Seu Supabase ainda não tem as colunas de automação do WhatsApp. Execute o SQL do WhatsApp (automação) no painel de Admin.
          </div>
        ) : null}
        {saved ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Salvo.</div> : null}

            <div
              className={
                tutorialOpen && tutorialSteps[tutorialStep]?.target === 'prefs'
                  ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
                  : ''
              }
            >
              <Card>
                <div className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Preferências de envio</div>
            {loading ? (
              <div className="text-sm text-slate-600">Carregando…</div>
            ) : (
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={enviarConfirmacao}
                    onChange={(e) => setEnviarConfirmacao(e.target.checked)}
                    disabled={!canEditTemplates || saving}
                  />
                  Enviar confirmação ao confirmar agendamento
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={enviarLembrete} onChange={(e) => setEnviarLembrete(e.target.checked)} disabled={!canEditTemplates || saving} />
                  Enviar lembrete automático
                </label>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">Enviar lembrete X horas antes</div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={4}
                      max={72}
                      step={1}
                      value={lembreteHorasAntes}
                      onChange={(e) => setLembreteHorasAntes(Number(e.target.value))}
                      disabled={!canEditTemplates || saving || !enviarLembrete}
                      className="w-full"
                    />
                    <div className="text-sm font-semibold text-slate-900 w-12 text-right">{lembreteHorasAntes}h</div>
                  </div>
                </div>
              </div>
            )}
                </div>
              </Card>
            </div>

            <div
              className={
                tutorialOpen && tutorialSteps[tutorialStep]?.target === 'test'
                  ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
                  : ''
              }
            >
              <Card>
                <div className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Validar confirmação automática</div>
            <div className="text-sm text-slate-600">Salve o template antes de testar o envio.</div>

            {agLoading ? <div className="text-sm text-slate-600">Carregando agendamentos…</div> : null}

            {!agLoading && agError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{agError}</div> : null}

            {!agLoading && agendamentosConfirmados.length === 0 ? (
              <div className="space-y-3">
                <div className="text-sm text-slate-600">Nenhum agendamento encontrado.</div>
                <div>
                  <Button variant="secondary" onClick={() => navigate('/dashboard')}>
                    Ir para Agenda
                  </Button>
                </div>
              </div>
            ) : null}

            {!agLoading && agendamentosConfirmados.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-700">Agendamento</div>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                  value={agendamentoSelecionadoId}
                  onChange={(e) => setAgendamentoSelecionadoId(e.target.value)}
                  disabled={!canTestConfirmacao || saving || sendingConfirmacao}
                >
                  <option value="">Selecione…</option>
                  {agendamentosConfirmados.map((a) => {
                    const data = a.data ? a.data.split('-').reverse().join('/') : ''
                    const hora = a.hora_inicio ?? ''
                    const nome = a.cliente_nome ?? 'Cliente'
                    const tel = a.cliente_telefone ? ` • ${a.cliente_telefone}` : ''
                    const flag = a.confirmacao_enviada ? ' • já enviada' : ''
                    const status = (a.status ?? '').trim() ? ` • ${(a.status ?? '').trim()}` : ''
                    return (
                      <option key={a.id} value={a.id}>
                        {data} {hora} • {nome}
                        {tel}
                        {status}
                        {flag}
                      </option>
                    )
                  })}
                </select>
              </div>
            ) : null}

            {!agLoading && selectedAgendamento && (selectedAgendamento.status ?? '').trim().toLowerCase() !== 'confirmado' ? (
              <div className="text-sm text-amber-800 rounded-xl border border-amber-200 bg-amber-50 p-3">
                Esse agendamento ainda não está como “confirmado”. A confirmação automática só envia após confirmar.
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button
                onClick={async () => {
                  if (!agendamentoSelecionadoId) return
                  if ((selectedAgendamento?.status ?? '').trim().toLowerCase() !== 'confirmado') return
                  setSendConfirmacaoResult(null)
                  setSendingConfirmacao(true)
                  const res = await sendConfirmacaoWhatsapp(agendamentoSelecionadoId)
                  if (!res.ok) {
                    if (
                      typeof res.body === 'object' &&
                      res.body !== null &&
                      (res.body as Record<string, unknown>).error === 'supabase_gateway_invalid_jwt'
                    ) {
                      setSendConfirmacaoResult('JWT inválido para chamar a Edge Function. Saia e entre novamente. Se persistir, reimplante a função com verify_jwt=false (--no-verify-jwt).')
                      setSendingConfirmacao(false)
                      return
                    }
                    if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).error === 'jwt_project_mismatch') {
                      setSendConfirmacaoResult('Sessão do Supabase pertence a outro projeto. Saia e entre novamente no sistema.')
                      setSendingConfirmacao(false)
                      return
                    }
                    if (typeof res.body === 'object' && res.body !== null && (res.body as Record<string, unknown>).error === 'invalid_jwt') {
                      setSendConfirmacaoResult('Sessão inválida no Supabase. Saia e entre novamente no sistema.')
                      setSendingConfirmacao(false)
                      return
                    }
                    if (typeof res.body === 'object' && res.body !== null) {
                      const hint = (res.body as Record<string, unknown>).hint
                      if (typeof hint === 'string' && hint.trim()) {
                        setSendConfirmacaoResult(hint)
                        setSendingConfirmacao(false)
                        return
                      }
                      const code = (res.body as Record<string, unknown>).error
                      if (code === 'instance_not_connected') {
                        setSendConfirmacaoResult('WhatsApp não conectado. Vá em Configurações > WhatsApp e conecte a instância (QR Code).')
                        setSendingConfirmacao(false)
                        return
                      }
                    }
                    const details = typeof res.body === 'string' ? res.body : JSON.stringify(res.body)
                    setSendConfirmacaoResult(`Falha ao enviar confirmação (HTTP ${res.status}): ${details}`)
                    setSendingConfirmacao(false)
                    return
                  }

                  const details = typeof res.body === 'string' ? res.body : JSON.stringify(res.body)
                  setSendConfirmacaoResult(details || 'Enviado.')
                  setSendingConfirmacao(false)
                }}
                disabled={
                  !canTestConfirmacao ||
                  saving ||
                  loading ||
                  sendingConfirmacao ||
                  !agendamentoSelecionadoId ||
                  (selectedAgendamento?.status ?? '').trim().toLowerCase() !== 'confirmado'
                }
              >
                {sendingConfirmacao ? 'Enviando…' : 'Enviar confirmação agora'}
              </Button>
            </div>

            {sendConfirmacaoResult ? (
              <pre className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 overflow-auto whitespace-pre-wrap">{sendConfirmacaoResult}</pre>
            ) : null}
                </div>
              </Card>
            </div>

            <div
              className={
                tutorialOpen && tutorialSteps[tutorialStep]?.target === 'templates'
                  ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
                  : ''
              }
            >
              <div className="space-y-6">
                <Card>
                  <div className="p-6 space-y-4">
                    <div className="text-sm font-semibold text-slate-900">Modelos prontos</div>
                    <div className="text-sm text-slate-600">
                      Escolha um modelo e ajuste se quiser. As variáveis são preenchidas automaticamente com dados reais do agendamento.
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block">
                        <div className="text-sm font-medium text-slate-700 mb-1">Modelo</div>
                        <select
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                          value={presetKey}
                          onChange={(e) => setPresetKey(e.target.value)}
                          disabled={!canEditTemplates || saving || loading}
                        >
                          {templatePresets.map((p) => (
                            <option key={p.key} value={p.key}>
                              {p.title}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="flex items-end justify-end gap-2">
                        <Button variant="secondary" onClick={() => applyPreset('confirmacao')} disabled={!canEditTemplates || saving || loading}>
                          Aplicar na confirmação
                        </Button>
                        <Button variant="secondary" onClick={() => applyPreset('lembrete')} disabled={!canEditTemplates || saving || loading}>
                          Aplicar no lembrete
                        </Button>
                        <Button variant="secondary" onClick={() => applyPreset('both')} disabled={!canEditTemplates || saving || loading}>
                          Aplicar nos dois
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="p-6 space-y-4">
                    <div className="text-sm font-semibold text-slate-900">Variáveis</div>
                    <div className="text-sm text-slate-600">Clique para inserir no campo selecionado (confirmação/lembrete).</div>

                    <div className="flex flex-wrap gap-2">
                      {templateVars.map((v) => (
                        <Button key={v.key} variant="secondary" onClick={() => insertVar(v.key)} disabled={!canEditTemplates || saving || loading}>
                          {v.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="p-6 space-y-4">
                    <div className="text-sm font-semibold text-slate-900">Mensagem de confirmação</div>
                    {loading ? (
                      <div className="text-sm text-slate-600">Carregando…</div>
                    ) : (
                      <textarea
                        className="w-full min-h-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                        value={mensagemConfirmacao}
                        onChange={(e) => setMensagemConfirmacao(e.target.value)}
                        disabled={!canEditTemplates || saving}
                        ref={confirmacaoRef}
                        onFocus={() => setLastField('confirmacao')}
                      />
                    )}
                  </div>
                </Card>

                <Card>
                  <div className="p-6 space-y-4">
                    <div className="text-sm font-semibold text-slate-900">Mensagem de lembrete</div>
                    {loading ? (
                      <div className="text-sm text-slate-600">Carregando…</div>
                    ) : (
                      <textarea
                        className="w-full min-h-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                        value={mensagemLembrete}
                        onChange={(e) => setMensagemLembrete(e.target.value)}
                        disabled={!canEditTemplates || saving}
                        ref={lembreteRef}
                        onFocus={() => setLastField('lembrete')}
                      />
                    )}
                  </div>
                </Card>

                {canEditTemplates ? (
                  <div className="flex justify-end">
                    <Button onClick={save} disabled={saving || loading}>
                      Salvar
                    </Button>
                  </div>
                ) : (
                  <div className="text-sm text-slate-600">Edição disponível apenas para a conta master.</div>
                )}
              </div>
            </div>
          </div>

          <TutorialOverlay
            open={tutorialOpen}
            steps={tutorialSteps}
            step={tutorialStep}
            onStepChange={setTutorialStep}
            onClose={closeTutorial}
            titleFallback="Mensagens"
          />
        </AppShell>
      )}
    </PageTutorial>
  )
}
