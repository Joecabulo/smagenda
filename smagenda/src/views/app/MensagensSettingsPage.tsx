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
const defaultCancelamento = `Olá {nome}!\n\nSeu agendamento foi cancelado:\n📅 {data} às {hora}\n✂️ {servico}\n\nSe quiser remarcar, é só me chamar.\n{nome_negocio}`

function formatBRDateFromISO(isoDate: string) {
  const parts = isoDate.split('-')
  if (parts.length !== 3) return isoDate
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function formatBRL(value: number) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  } catch {
    return `R$ ${value.toFixed(2)}`
  }
}

function readExtrasEndereco(extras: unknown) {
  if (!extras || typeof extras !== 'object') return ''
  const v = (extras as Record<string, unknown>).endereco
  if (typeof v !== 'string') return ''
  const t = v.trim()
  return t ? t : ''
}

function interpolateTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`)
}

type TemplatePreset = {
  key: string
  title: string
  confirmacao: string
  lembrete: string
  cancelamento: string
}

const templatePresets: TemplatePreset[] = [
  {
    key: 'padrao_servicos',
    title: 'Padrão (serviços)',
    confirmacao: defaultConfirmacao,
    lembrete: defaultLembrete,
    cancelamento: defaultCancelamento,
  },
  {
    key: 'lava_jatos',
    title: 'Lava-jato',
    confirmacao:
      `Olá {nome}!\n\n✅ Sua lavagem está confirmada:\n📅 {data} às {hora}\n🚗 {servico}\n💰 {preco}\n\nLocal: {unidade_nome}\n{unidade_endereco}\n\nDúvidas/alterações: {telefone_profissional}\n{nome_negocio}`,
    lembrete:
      `Oi {nome}!\n\n⏰ Lembrete da sua lavagem:\n📅 {data} às {hora}\n🚗 {servico}\n\nLocal: {unidade_nome}\n{unidade_endereco}\n\nSe precisar remarcar: {telefone_profissional}`,
    cancelamento:
      `Olá {nome}!\n\n❌ Sua lavagem foi cancelada:\n📅 {data} às {hora}\n🚗 {servico}\n\nSe quiser remarcar, fale com a gente: {telefone_profissional}\n{nome_negocio}`,
  },
  {
    key: 'barbearia',
    title: 'Barbearia',
    confirmacao:
      `Olá {nome}!\n\n✅ Seu horário está confirmado:\n📅 {data} às {hora}\n✂️ {servico}\n💰 {preco}\n\nBarbeiro: {profissional_nome}\nLocal: {unidade_nome}\n{unidade_endereco}\n\nAté já!\n{nome_negocio}`,
    lembrete:
      `Oi {nome}!\n\n⏰ Lembrete do seu horário:\n📅 {data} às {hora}\n✂️ {servico}\n\nBarbeiro: {profissional_nome}\n\nSe precisar remarcar: {telefone_profissional}`,
    cancelamento:
      `Olá {nome}!\n\n❌ Seu horário foi cancelado:\n📅 {data} às {hora}\n✂️ {servico}\n\nSe quiser remarcar, chama aqui: {telefone_profissional}\n{nome_negocio}`,
  },
  {
    key: 'salao',
    title: 'Salão de beleza',
    confirmacao:
      `Olá {nome}!\n\n✅ Seu horário está confirmado:\n📅 {data} às {hora}\n💇 {servico}\n\nProfissional: {profissional_nome}\nLocal: {unidade_nome}\n{unidade_endereco}\n\nAté já!\n{nome_negocio}`,
    lembrete:
      `Oi {nome}!\n\n⏰ Lembrete do seu horário:\n📅 {data} às {hora}\n💇 {servico}\nProfissional: {profissional_nome}\n\nSe precisar remarcar, fale com a gente: {telefone_profissional}`,
    cancelamento:
      `Olá {nome}!\n\n❌ Seu horário foi cancelado:\n📅 {data} às {hora}\n💇 {servico}\n\nSe quiser remarcar, fale com a gente: {telefone_profissional}\n{nome_negocio}`,
  },
  {
    key: 'estetica',
    title: 'Estética',
    confirmacao:
      `Olá {nome}!\n\n✅ Seu atendimento está confirmado:\n📅 {data} às {hora}\n✨ {servico}\n\nProfissional: {profissional_nome}\nLocal: {unidade_nome}\n{unidade_endereco}\n\nAté breve!\n{nome_negocio}`,
    lembrete:
      `Oi {nome}!\n\n✨ Lembrete do seu atendimento:\n📅 {data} às {hora}\n✨ {servico}\n\nQualquer ajuste: {telefone_profissional}`,
    cancelamento:
      `Olá {nome}!\n\n❌ Seu atendimento foi cancelado:\n📅 {data} às {hora}\n✨ {servico}\n\nSe quiser remarcar, é só me chamar: {telefone_profissional}\n{nome_negocio}`,
  },
  {
    key: 'odontologia',
    title: 'Odontologia',
    confirmacao:
      `Olá {nome}!\n\n✅ Sua consulta está confirmada:\n📅 {data} às {hora}\n🦷 {servico}\n\nDentista: {profissional_nome}\nLocal: {unidade_nome}\n{unidade_endereco}\n\nQualquer dúvida: {telefone_profissional}\n{nome_negocio}`,
    lembrete:
      `Olá {nome}!\n\n🦷 Lembrete da sua consulta:\n📅 {data} às {hora}\nProcedimento: {servico}\n\nSe precisar remarcar: {telefone_profissional}`,
    cancelamento:
      `Olá {nome}!\n\n❌ Sua consulta foi cancelada:\n📅 {data} às {hora}\n🦷 {servico}\n\nSe quiser remarcar: {telefone_profissional}\n{nome_negocio}`,
  },
  {
    key: 'advocacia',
    title: 'Advocacia',
    confirmacao:
      `Olá {nome}!\n\n✅ Sua consulta está confirmada:\n📅 {data} às {hora}\n⚖️ {servico}\n\nProfissional: {profissional_nome}\nLocal: {unidade_nome}\n{unidade_endereco}\n\nEm caso de necessidade, fale com a gente: {telefone_profissional}\n{nome_negocio}`,
    lembrete:
      `Olá {nome}!\n\n⏰ Lembrete da sua consulta:\n📅 {data} às {hora}\n⚖️ {servico}\n\nSe precisar remarcar: {telefone_profissional}`,
    cancelamento:
      `Olá {nome}!\n\n❌ Sua consulta foi cancelada:\n📅 {data} às {hora}\n⚖️ {servico}\n\nSe quiser remarcar: {telefone_profissional}\n{nome_negocio}`,
  },
  {
    key: 'manicure',
    title: 'Manicure',
    confirmacao:
      `Olá {nome}!\n\n✅ Seu horário está confirmado:\n📅 {data} às {hora}\n💅 {servico}\n💰 {preco}\n\nProfissional: {profissional_nome}\nLocal: {unidade_nome}\n{unidade_endereco}\n\nAté já!\n{nome_negocio}`,
    lembrete:
      `Oi {nome}!\n\n⏰ Lembrete do seu horário:\n📅 {data} às {hora}\n💅 {servico}\n\nSe precisar remarcar: {telefone_profissional}`,
    cancelamento:
      `Olá {nome}!\n\n❌ Seu horário foi cancelado:\n📅 {data} às {hora}\n💅 {servico}\n\nSe quiser remarcar: {telefone_profissional}\n{nome_negocio}`,
  },
  {
    key: 'pilates',
    title: 'Pilates / Estúdio',
    confirmacao:
      `Olá {nome}!\n\n✅ Sua aula está confirmada:\n📅 {data} às {hora}\n🏋️ {servico}\n\nInstrutor: {profissional_nome}\nLocal: {unidade_nome}\n{unidade_endereco}\n\nAté lá!\n{nome_negocio}`,
    lembrete:
      `Oi {nome}!\n\n⏰ Lembrete da sua aula:\n📅 {data} às {hora}\n🏋️ {servico}\n\nSe precisar remarcar: {telefone_profissional}`,
    cancelamento:
      `Olá {nome}!\n\n❌ Sua aula foi cancelada:\n📅 {data} às {hora}\n🏋️ {servico}\n\nSe quiser remarcar: {telefone_profissional}\n{nome_negocio}`,
  },
  {
    key: 'academia',
    title: 'Academia',
    confirmacao:
      `Olá {nome}!\n\n✅ Sua aula está confirmada:\n📅 {data} às {hora}\n🏋️ {servico}\n\nInstrutor: {profissional_nome}\nLocal: {unidade_nome}\n{unidade_endereco}\n\nQualquer ajuste: {telefone_profissional}\n{nome_negocio}`,
    lembrete:
      `Oi {nome}!\n\n⏰ Lembrete da sua aula:\n📅 {data} às {hora}\n🏋️ {servico}\n\nSe precisar remarcar: {telefone_profissional}`,
    cancelamento:
      `Olá {nome}!\n\n❌ Sua aula foi cancelada:\n📅 {data} às {hora}\n🏋️ {servico}\n\nSe quiser remarcar: {telefone_profissional}\n{nome_negocio}`,
  },
  {
    key: 'faxina',
    title: 'Faxina / Diarista',
    confirmacao:
      `Olá {nome}!\n\n✅ Sua diária está confirmada:\n📅 {data} às {hora}\n🧹 {servico}\n💰 {preco}\n\nEndereço do cliente:\n{cliente_endereco}\n\nProfissional: {profissional_nome}\n\nQualquer ajuste: {telefone_profissional}\n{nome_negocio}`,
    lembrete:
      `Oi {nome}!\n\n⏰ Lembrete da sua diária:\n📅 {data} às {hora}\n🧹 {servico}\n\nEndereço do cliente:\n{cliente_endereco}\n\nSe precisar remarcar: {telefone_profissional}`,
    cancelamento:
      `Olá {nome}!\n\n❌ Sua diária foi cancelada:\n📅 {data} às {hora}\n🧹 {servico}\n\nSe quiser remarcar, é só me chamar: {telefone_profissional}\n{nome_negocio}`,
  },
]

const templateVars: Array<{ key: string; label: string }> = [
  { key: 'nome', label: 'Cliente' },
  { key: 'data', label: 'Data' },
  { key: 'hora', label: 'Hora' },
  { key: 'servico', label: 'Serviço' },
  { key: 'preco', label: 'Preço' },
  { key: 'cliente_endereco', label: 'Endereço cliente' },
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

type BusinessInfoRow = {
  nome_negocio: string | null
  telefone: string | null
  endereco: string | null
}

type AgendamentoPreviewRow = {
  id: string
  data: string
  hora_inicio: string | null
  cliente_nome: string | null
  cliente_telefone: string | null
  extras?: unknown | null
  servico?: { nome: string | null; preco: number | null } | null
  funcionario?: { nome_completo: string | null; telefone: string | null } | null
  unidade?: { nome: string | null; endereco: string | null; telefone: string | null } | null
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
  const usuarioId = appPrincipal?.kind === 'usuario' ? appPrincipal.profile.id : null
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
  const [mensagemCancelamento, setMensagemCancelamento] = useState(defaultCancelamento)
  const [presetKey, setPresetKey] = useState(templatePresets[0]?.key ?? 'padrao_servicos')
  const [lastField, setLastField] = useState<'confirmacao' | 'lembrete' | 'cancelamento'>('confirmacao')
  const confirmacaoRef = useRef<HTMLTextAreaElement | null>(null)
  const lembreteRef = useRef<HTMLTextAreaElement | null>(null)
  const cancelamentoRef = useRef<HTMLTextAreaElement | null>(null)
  const [enviarConfirmacao, setEnviarConfirmacao] = useState(true)
  const [enviarLembrete, setEnviarLembrete] = useState(false)
  const [enviarCancelamento, setEnviarCancelamento] = useState(true)
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

  const [businessInfo, setBusinessInfo] = useState<BusinessInfoRow>({ nome_negocio: null, telefone: null, endereco: null })
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewAgendamento, setPreviewAgendamento] = useState<AgendamentoPreviewRow | null>(null)

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

      const baseSelect = 'mensagem_confirmacao,mensagem_lembrete,mensagem_cancelamento'
      const baseFallbackSelect = 'mensagem_confirmacao,mensagem_lembrete'
      const baseFirst = await supabase.from('usuarios').select(baseSelect).eq('id', usuarioId).maybeSingle()

      if (baseFirst.error) {
        if (!isMissingColumnError(baseFirst.error.message)) {
          setError(baseFirst.error.message)
          setLoading(false)
          return
        }
        const baseSecond = await supabase.from('usuarios').select(baseFallbackSelect).eq('id', usuarioId).maybeSingle()
        if (baseSecond.error) {
          setError(baseSecond.error.message)
          setLoading(false)
          return
        }
        const baseRow = (baseSecond.data ?? null) as unknown as {
          mensagem_confirmacao?: string | null
          mensagem_lembrete?: string | null
          mensagem_cancelamento?: string | null
        } | null
        setMensagemConfirmacao(baseRow?.mensagem_confirmacao ?? defaultConfirmacao)
        setMensagemLembrete(baseRow?.mensagem_lembrete ?? defaultLembrete)
        setMensagemCancelamento(defaultCancelamento)
      } else {
        const baseRow = (baseFirst.data ?? null) as unknown as {
          mensagem_confirmacao?: string | null
          mensagem_lembrete?: string | null
          mensagem_cancelamento?: string | null
        } | null
        setMensagemConfirmacao(baseRow?.mensagem_confirmacao ?? defaultConfirmacao)
        setMensagemLembrete(baseRow?.mensagem_lembrete ?? defaultLembrete)
        setMensagemCancelamento(baseRow?.mensagem_cancelamento ?? defaultCancelamento)
      }

      const { data: extraData, error: extraErr } = await supabase
        .from('usuarios')
        .select('enviar_confirmacao,enviar_lembrete,enviar_cancelamento,lembrete_horas_antes')
        .eq('id', usuarioId)
        .maybeSingle()

      if (extraErr) {
        if (isMissingColumnError(extraErr.message)) {
          setSchemaIncompleto(true)
          setEnviarConfirmacao(true)
          setEnviarLembrete(false)
          setEnviarCancelamento(true)
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
          enviar_cancelamento?: boolean | null
          lembrete_horas_antes?: number | null
        } | null
      setEnviarConfirmacao(row?.enviar_confirmacao ?? true)
      setEnviarLembrete(row?.enviar_lembrete ?? false)
      setEnviarCancelamento(row?.enviar_cancelamento ?? true)
      setLembreteHorasAntes(typeof row?.lembrete_horas_antes === 'number' ? row?.lembrete_horas_antes : 24)

      const { data: bizData, error: bizErr } = await supabase.from('usuarios').select('nome_negocio,telefone,endereco').eq('id', usuarioId).maybeSingle()
      if (!bizErr) {
        const b = (bizData ?? null) as unknown as BusinessInfoRow | null
        setBusinessInfo({ nome_negocio: b?.nome_negocio ?? null, telefone: b?.telefone ?? null, endereco: b?.endereco ?? null })
      }

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

  useEffect(() => {
    const run = async () => {
      if (!usuarioId) return
      if (!agendamentoSelecionadoId) {
        setPreviewAgendamento(null)
        setPreviewError(null)
        return
      }

      setPreviewLoading(true)
      setPreviewError(null)

      const select =
        'id,data,hora_inicio,cliente_nome,cliente_telefone,extras,servico:servico_id(nome,preco),funcionario:funcionario_id(nome_completo,telefone),unidade:unidade_id(nome,endereco,telefone)'
      const { data, error } = await supabase.from('agendamentos').select(select).eq('id', agendamentoSelecionadoId).eq('usuario_id', usuarioId).maybeSingle()
      if (error) {
        setPreviewAgendamento(null)
        setPreviewError(error.message)
        setPreviewLoading(false)
        return
      }

      setPreviewAgendamento((data ?? null) as unknown as AgendamentoPreviewRow | null)
      setPreviewLoading(false)
    }

    run().catch((e: unknown) => {
      setPreviewAgendamento(null)
      setPreviewError(e instanceof Error ? e.message : 'Erro ao carregar prévia')
      setPreviewLoading(false)
    })
  }, [agendamentoSelecionadoId, usuarioId])

  const previewVars = useMemo(() => {
    if (!previewAgendamento) return null
    const clienteEndereco = readExtrasEndereco(previewAgendamento.extras)
    const unidadeEndereco = (previewAgendamento.unidade?.endereco ?? '').trim()
    const endereco = clienteEndereco || unidadeEndereco || (businessInfo.endereco ?? '')
    const telefoneProfissional = (previewAgendamento.funcionario?.telefone ?? '').trim() || (businessInfo.telefone ?? '')

    return {
      nome: previewAgendamento.cliente_nome ?? '',
      data: previewAgendamento.data ? formatBRDateFromISO(previewAgendamento.data) : '',
      hora: previewAgendamento.hora_inicio ?? '',
      servico: previewAgendamento.servico?.nome ?? '',
      preco: typeof previewAgendamento.servico?.preco === 'number' ? formatBRL(previewAgendamento.servico.preco) : '',
      cliente_endereco: clienteEndereco,
      profissional_nome: previewAgendamento.funcionario?.nome_completo ?? '',
      telefone_profissional: telefoneProfissional,
      unidade_nome: previewAgendamento.unidade?.nome ?? '',
      unidade_endereco: unidadeEndereco,
      unidade_telefone: (previewAgendamento.unidade?.telefone ?? '').trim(),
      endereco,
      nome_negocio: businessInfo.nome_negocio ?? '',
    } satisfies Record<string, string>
  }, [businessInfo.endereco, businessInfo.nome_negocio, businessInfo.telefone, previewAgendamento])

  const previewConfirmacao = useMemo(() => (previewVars ? interpolateTemplate(mensagemConfirmacao, previewVars) : ''), [mensagemConfirmacao, previewVars])
  const previewLembrete = useMemo(() => (previewVars ? interpolateTemplate(mensagemLembrete, previewVars) : ''), [mensagemLembrete, previewVars])
  const previewCancelamento = useMemo(() => (previewVars ? interpolateTemplate(mensagemCancelamento, previewVars) : ''), [mensagemCancelamento, previewVars])

  const save = async () => {
    if (!usuarioId) return
    setSaving(true)
    setSaved(false)
    setError(null)

    const baseUpdate = { mensagem_confirmacao: mensagemConfirmacao, mensagem_lembrete: mensagemLembrete, mensagem_cancelamento: mensagemCancelamento }
    const first = await supabase.from('usuarios').update(baseUpdate).eq('id', usuarioId)

    if (first.error) {
      if (isMissingColumnError(first.error.message)) {
        const fallbackUpdate = { mensagem_confirmacao: mensagemConfirmacao, mensagem_lembrete: mensagemLembrete }
        const second = await supabase.from('usuarios').update(fallbackUpdate).eq('id', usuarioId)
        if (second.error) {
          setError(second.error.message)
          setSaving(false)
          return
        }
      } else {
        setError(first.error.message)
        setSaving(false)
        return
      }
    }

    const { error: extraErr } = await supabase
      .from('usuarios')
      .update({ enviar_confirmacao: enviarConfirmacao, enviar_lembrete: enviarLembrete, enviar_cancelamento: enviarCancelamento, lembrete_horas_antes: lembreteHorasAntes })
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

  const getPreset = (key: string) => templatePresets.find((p) => p.key === key) ?? templatePresets[0]

  const applyPreset = (target: 'confirmacao' | 'lembrete' | 'cancelamento' | 'both' | 'all', keyOverride?: string) => {
    const preset = getPreset(keyOverride ?? presetKey)
    if (!preset) return
    if (target === 'confirmacao' || target === 'both' || target === 'all') setMensagemConfirmacao(preset.confirmacao)
    if (target === 'lembrete' || target === 'both' || target === 'all') setMensagemLembrete(preset.lembrete)
    if (target === 'cancelamento' || target === 'all') setMensagemCancelamento(preset.cancelamento)
  }

  const insertVar = (key: string) => {
    const token = `{${key}}`
    const active = lastField === 'confirmacao' ? confirmacaoRef.current : lastField === 'lembrete' ? lembreteRef.current : cancelamentoRef.current
    const getter = lastField === 'confirmacao' ? mensagemConfirmacao : lastField === 'lembrete' ? mensagemLembrete : mensagemCancelamento
    const setter =
      lastField === 'confirmacao' ? setMensagemConfirmacao : lastField === 'lembrete' ? setMensagemLembrete : setMensagemCancelamento
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

  if (!usuarioId) {
    return (
      <AppShell>
        <div className="text-slate-700">{appPrincipal ? 'Acesso restrito.' : 'Carregando…'}</div>
      </AppShell>
    )
  }

  return (
    <PageTutorial usuarioId={usuarioId} page="mensagens">
      {({ tutorialOpen, tutorialStep, setTutorialStep, resetTutorial, closeTutorial }) => (
        <AppShell>
          <div className="mx-auto w-full max-w-3xl space-y-6">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="text-sm font-semibold text-slate-500">Configurações</div>
                <div className="text-xl font-semibold text-slate-900">Mensagens automáticas</div>
              </div>
              <Button variant="secondary" onClick={resetTutorial} className="w-full sm:w-auto">
                Rever tutorial
              </Button>
            </div>

            <div className="space-y-3">
              {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
              {schemaIncompleto ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Seu Supabase ainda não tem as colunas de automação do WhatsApp. Execute o SQL do WhatsApp (automação) no painel de Admin.
                </div>
              ) : null}
              {saved ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Salvo.</div> : null}
            </div>

            <div
              className={
                tutorialOpen && tutorialSteps[tutorialStep]?.target === 'prefs'
                  ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
                  : ''
              }
            >
              <Card>
                <div className="space-y-4 p-4 sm:p-6">
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
                    className="h-4 w-4"
                  />
                  Enviar confirmação ao confirmar agendamento
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={enviarLembrete}
                    onChange={(e) => setEnviarLembrete(e.target.checked)}
                    disabled={!canEditTemplates || saving}
                    className="h-4 w-4"
                  />
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
                    <div className="w-14 text-right text-sm font-semibold text-slate-900">{lembreteHorasAntes}h</div>
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
                <div className="space-y-4 p-4 sm:p-6">
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
                className="w-full sm:w-auto"
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
                  <div className="space-y-4 p-4 sm:p-6">
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
                          onChange={(e) => {
                            const nextKey = e.target.value
                            setPresetKey(nextKey)
                            applyPreset('all', nextKey)
                          }}
                          disabled={!canEditTemplates || saving || loading}
                        >
                          {templatePresets.map((p) => (
                            <option key={p.key} value={p.key}>
                              {p.title}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="grid grid-cols-2 gap-2 sm:self-end md:grid-cols-4">
                        <Button
                          variant="secondary"
                          onClick={() => applyPreset('confirmacao')}
                          disabled={!canEditTemplates || saving || loading}
                          className="w-full h-10"
                        >
                          Aplicar confirmação
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => applyPreset('lembrete')}
                          disabled={!canEditTemplates || saving || loading}
                          className="w-full h-10"
                        >
                          Aplicar lembrete
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => applyPreset('cancelamento')}
                          disabled={!canEditTemplates || saving || loading}
                          className="w-full h-10"
                        >
                          Aplicar cancelamento
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => applyPreset('all')}
                          disabled={!canEditTemplates || saving || loading}
                          className="w-full h-10"
                        >
                          Aplicar tudo
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="space-y-4 p-4 sm:p-6">
                    <div className="text-sm font-semibold text-slate-900">Variáveis</div>
                    <div className="text-sm text-slate-600">Clique para inserir no campo selecionado (confirmação/lembrete/cancelamento).</div>

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      {templateVars.map((v) => (
                        <Button
                          key={v.key}
                          variant="secondary"
                          onClick={() => insertVar(v.key)}
                          disabled={!canEditTemplates || saving || loading}
                          className="w-full sm:w-auto"
                        >
                          {v.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="space-y-4 p-4 sm:p-6">
                    <div className="text-sm font-semibold text-slate-900">Mensagem de confirmação</div>
                    {loading ? (
                      <div className="text-sm text-slate-600">Carregando…</div>
                    ) : (
                      <textarea
                        className="w-full min-h-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 sm:text-sm"
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
                  <div className="space-y-4 p-4 sm:p-6">
                    <div className="text-sm font-semibold text-slate-900">Mensagem de lembrete</div>
                    {loading ? (
                      <div className="text-sm text-slate-600">Carregando…</div>
                    ) : (
                      <textarea
                        className="w-full min-h-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 sm:text-sm"
                        value={mensagemLembrete}
                        onChange={(e) => setMensagemLembrete(e.target.value)}
                        disabled={!canEditTemplates || saving}
                        ref={lembreteRef}
                        onFocus={() => setLastField('lembrete')}
                      />
                    )}
                  </div>
                </Card>

                <Card>
                  <div className="space-y-4 p-4 sm:p-6">
                    <div className="text-sm font-semibold text-slate-900">Mensagem de cancelamento</div>
                    {loading ? (
                      <div className="text-sm text-slate-600">Carregando…</div>
                    ) : (
                      <textarea
                        className="w-full min-h-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 sm:text-sm"
                        value={mensagemCancelamento}
                        onChange={(e) => setMensagemCancelamento(e.target.value)}
                        disabled={!canEditTemplates || saving}
                        ref={cancelamentoRef}
                        onFocus={() => setLastField('cancelamento')}
                      />
                    )}
                  </div>
                </Card>

                <Card>
                  <div className="space-y-4 p-4 sm:p-6">
                    <div className="text-sm font-semibold text-slate-900">Prévia (dados reais)</div>
                    <div className="text-sm text-slate-600">Usa o agendamento selecionado em “Validar confirmação automática”.</div>

                    {previewLoading ? <div className="text-sm text-slate-600">Carregando prévia…</div> : null}
                    {!previewLoading && previewError ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{previewError}</div>
                    ) : null}
                    {!previewLoading && !previewError && !previewAgendamento ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Selecione um agendamento para ver a prévia.</div>
                    ) : null}

                    {!previewLoading && !previewError && previewAgendamento ? (
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs font-semibold text-slate-600 mb-1">Confirmação</div>
                          <pre className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 overflow-auto whitespace-pre-wrap">{previewConfirmacao}</pre>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-600 mb-1">Lembrete</div>
                          <pre className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 overflow-auto whitespace-pre-wrap">{previewLembrete}</pre>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-600 mb-1">Cancelamento</div>
                          <pre className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 overflow-auto whitespace-pre-wrap">{previewCancelamento}</pre>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Card>

                {canEditTemplates ? (
                  <div className="flex justify-end">
                    <Button onClick={save} disabled={saving || loading} className="w-full sm:w-auto">
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
