import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { PageTutorial, TutorialOverlay } from '../../components/ui/TutorialOverlay'
import { slugify } from '../../lib/slug'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../state/auth/useAuth'

function isValidSlug(s: string) {
  if (!s.trim()) return false
  if (s.length < 2) return false
  if (s.length > 60) return false
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)
}

function normalizeSlug(s: string) {
  return slugify(s).slice(0, 60)
}

function toIsoDateLocal(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const yyyy = x.getFullYear()
  const mm = String(x.getMonth() + 1).padStart(2, '0')
  const dd = String(x.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function rpcErrText(err: unknown) {
  const e = err && typeof err === 'object' ? (err as Record<string, unknown>) : null
  const msg = typeof e?.message === 'string' ? e.message.trim() : 'Erro'
  const code = typeof e?.code === 'string' ? e.code.trim() : ''
  const details = typeof e?.details === 'string' ? e.details.trim() : ''
  const hint = typeof e?.hint === 'string' ? e.hint.trim() : ''
  const parts = [msg]
  if (code && !msg.includes(code)) parts.push(code)
  if (details && details !== msg) parts.push(details)
  if (hint) parts.push(hint)
  return parts.filter(Boolean).join(' — ')
}

function isSignatureMismatchText(lower: string) {
  return (
    lower.includes('does not exist') ||
    lower.includes('function') ||
    lower.includes('rpc') ||
    (lower.includes('schema cache') && lower.includes('could not find'))
  )
}

function shouldRetryWithoutKey(err: unknown, key: string) {
  const lower = rpcErrText(err).toLowerCase()
  return lower.includes(key.toLowerCase()) && isSignatureMismatchText(lower)
}

async function callRpcWithSignatureFallback<T>(
  fnName: string,
  args: Record<string, unknown>,
  extra?: {
    unidadeId?: string | null
    canAddUnidadeId?: boolean
    canDropUnidadeId?: boolean
    canDropFuncionarioId?: boolean
    canDropUnidadeSlug?: boolean
  }
): Promise<{ ok: true; data: T } | { ok: false; errorText: string }> {
  const first = await supabase.rpc(fnName, args)
  if (!first.error) return { ok: true as const, data: first.data as T }

  const firstText = rpcErrText(first.error)
  const firstLower = firstText.toLowerCase()
  if (!isSignatureMismatchText(firstLower)) return { ok: false as const, errorText: firstText }

  const hasUnidadeId = Object.prototype.hasOwnProperty.call(args, 'p_unidade_id')
  const hasFuncionarioId = Object.prototype.hasOwnProperty.call(args, 'p_funcionario_id')
  const hasUnidadeSlug = Object.prototype.hasOwnProperty.call(args, 'p_unidade_slug')
  const unidadeId = extra?.unidadeId ?? null

  const withoutKey = (o: Record<string, unknown>, key: string) => {
    const next: Record<string, unknown> = { ...o }
    delete (next as Record<string, unknown>)[key]
    return next
  }

  const variants: Record<string, unknown>[] = []

  if (hasUnidadeId && extra?.canDropUnidadeId !== false && shouldRetryWithoutKey(first.error, 'p_unidade_id')) variants.push(withoutKey(args, 'p_unidade_id'))
  if (!hasUnidadeId && extra?.canAddUnidadeId && unidadeId) variants.push({ ...args, p_unidade_id: unidadeId })

  if (hasFuncionarioId && extra?.canDropFuncionarioId !== false && shouldRetryWithoutKey(first.error, 'p_funcionario_id')) {
    variants.push(withoutKey(args, 'p_funcionario_id'))
  }

  if (hasUnidadeSlug && extra?.canDropUnidadeSlug !== false && shouldRetryWithoutKey(first.error, 'p_unidade_slug')) variants.push(withoutKey(args, 'p_unidade_slug'))

  for (const v of variants) {
    const retry = await supabase.rpc(fnName, v)
    if (!retry.error) return { ok: true as const, data: retry.data as T }
  }

  return { ok: false as const, errorText: firstText }
}

export function PaginaPublicaSettingsPage() {
  const { appPrincipal, refresh } = useAuth()
  const usuario = appPrincipal?.kind === 'usuario' ? appPrincipal.profile : null
  const usuarioId = usuario?.id ?? null
  const nomeNegocio = usuario?.nome_negocio ?? null

  const tutorialSteps = useMemo(
    () =>
      [
        {
          title: 'Seu link público',
          body: 'Defina o slug e copie/abra sua URL de agendamento. Esse link é o que você divulga aos clientes.',
          target: 'link' as const,
        },
        {
          title: 'Validar em produção',
          body: 'Use a validação para confirmar se a página pública carrega e se o Supabase retorna horários reais.',
          target: 'test' as const,
        },
        {
          title: 'Personalizar aparência',
          body: 'Ajuste cores, logo e imagem de fundo para deixar a página com a cara do seu negócio.',
          target: 'appearance' as const,
        },
        {
          title: 'Salvar alterações',
          body: 'Finalize clicando em “Salvar”. Depois, abra o link para conferir o resultado.',
          target: 'save' as const,
        },
      ] as const,
    []
  )

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [slug, setSlug] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [instagramUrl, setInstagramUrl] = useState('')

  const [tipoNegocio, setTipoNegocio] = useState('')

  const [primaryColor, setPrimaryColor] = useState('#0f172a')
  const [backgroundColor, setBackgroundColor] = useState('#f8fafc')
  const [useBackgroundImage, setUseBackgroundImage] = useState(false)
  const [backgroundImageUrl, setBackgroundImageUrl] = useState('')
  const [bgFile, setBgFile] = useState<File | null>(null)

  type Unidade = {
    id: string
    nome: string
    slug: string
    endereco: string | null
    telefone: string | null
    ativo: boolean
  }

  const canUseMultiUnits = useMemo(() => {
    const p = String(usuario?.plano ?? '').trim().toLowerCase()
    return p === 'enterprise'
  }, [usuario?.plano])
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [unidadesLoading, setUnidadesLoading] = useState(false)
  const [savingUnidade, setSavingUnidade] = useState(false)
  const [unidadeNome, setUnidadeNome] = useState('')
  const [unidadeSlug, setUnidadeSlug] = useState('')
  const [unidadeEndereco, setUnidadeEndereco] = useState('')
  const [unidadeTelefone, setUnidadeTelefone] = useState('')

  const [publicTestRunning, setPublicTestRunning] = useState(false)
  const [publicTestResult, setPublicTestResult] = useState<string | null>(null)
  const [publicTestError, setPublicTestError] = useState<string | null>(null)
  const [publicTestUnidadeSlug, setPublicTestUnidadeSlug] = useState('')
  const [publicTestData, setPublicTestData] = useState(() => toIsoDateLocal(new Date()))

  const logoObjectUrl = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile])
  const bgObjectUrl = useMemo(() => (bgFile ? URL.createObjectURL(bgFile) : null), [bgFile])

  useEffect(() => {
    if (!logoObjectUrl) return
    return () => {
      URL.revokeObjectURL(logoObjectUrl)
    }
  }, [logoObjectUrl])

  useEffect(() => {
    if (!bgObjectUrl) return
    return () => {
      URL.revokeObjectURL(bgObjectUrl)
    }
  }, [bgObjectUrl])

  const publicLink = useMemo(() => {
    if (!slug.trim()) return ''
    return `${window.location.origin}/agendar/${encodeURIComponent(slug.trim())}`
  }, [slug])

  const unidadeLink = useMemo(() => {
    return (unidadeSlugValue: string) => {
      if (!slug.trim() || !unidadeSlugValue.trim()) return ''
      return `${window.location.origin}/agendar/${encodeURIComponent(slug.trim())}/${encodeURIComponent(unidadeSlugValue.trim())}`
    }
  }, [slug])

  useEffect(() => {
    const run = async () => {
      if (!usuarioId) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      setInfo(null)
      setSaved(false)
      const { data, error: err } = await supabase.from('usuarios').select('*').eq('id', usuarioId).maybeSingle()
      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }
      const row = (data ?? {}) as Record<string, unknown>
      const nextSlug = typeof row.slug === 'string' ? row.slug : ''
      const nextLogo = typeof row.logo_url === 'string' ? row.logo_url : ''
      const nextInstagram = typeof row.instagram_url === 'string' ? row.instagram_url : ''
      const nextTipoNegocio = typeof row.tipo_negocio === 'string' ? row.tipo_negocio : ''
      const nextPrimary = typeof row.public_primary_color === 'string' ? row.public_primary_color : '#0f172a'
      const nextBgColor = typeof row.public_background_color === 'string' ? row.public_background_color : '#f8fafc'
      const nextUseBgImage = typeof row.public_use_background_image === 'boolean' ? row.public_use_background_image : false
      const nextBgUrl = typeof row.public_background_image_url === 'string' ? row.public_background_image_url : ''

      setSlug(nextSlug)
      setLogoUrl(nextLogo)
      setInstagramUrl(nextInstagram)
      setTipoNegocio(nextTipoNegocio)
      setPrimaryColor(nextPrimary)
      setBackgroundColor(nextBgColor)
      setUseBackgroundImage(nextUseBgImage)
      setBackgroundImageUrl(nextBgUrl)
      setLoading(false)
    }
    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar')
      setLoading(false)
    })
  }, [usuarioId])

  useEffect(() => {
    const run = async () => {
      if (!canUseMultiUnits || !usuarioId) {
        setUnidades([])
        return
      }
      setUnidadesLoading(true)
      const { data, error: err } = await supabase
        .from('unidades')
        .select('id,nome,slug,endereco,telefone,ativo')
        .eq('usuario_id', usuarioId)
        .order('criado_em', { ascending: true })

      if (err) {
        setError(err.message)
        setUnidadesLoading(false)
        return
      }
      setUnidades((data ?? []) as unknown as Unidade[])
      setUnidadesLoading(false)
    }
    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar unidades')
      setUnidadesLoading(false)
    })
  }, [canUseMultiUnits, usuarioId])

  const uploadBackground = async (file: File) => {
    if (!usuarioId) throw new Error('Sessão inválida')
    const safeName = file.name
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .slice(0, 80)
    const key = `${usuarioId}/bg-${Date.now()}-${safeName || 'bg'}`
    const { error: uploadErr } = await supabase.storage.from('logos').upload(key, file, {
      upsert: true,
      contentType: file.type || undefined,
    })
    if (uploadErr) throw uploadErr
    const { data } = supabase.storage.from('logos').getPublicUrl(key)
    const publicUrl = data?.publicUrl
    if (!publicUrl) throw new Error('Não foi possível obter a URL pública do fundo')
    return publicUrl
  }

  const uploadLogo = async (file: File) => {
    if (!usuarioId) throw new Error('Sessão inválida')
    const safeName = file.name
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .slice(0, 80)
    const key = `${usuarioId}/logo-public-${Date.now()}-${safeName || 'logo'}`
    const { error: uploadErr } = await supabase.storage.from('logos').upload(key, file, {
      upsert: true,
      contentType: file.type || undefined,
    })
    if (uploadErr) throw uploadErr
    const { data } = supabase.storage.from('logos').getPublicUrl(key)
    const publicUrl = data?.publicUrl
    if (!publicUrl) throw new Error('Não foi possível obter a URL pública do logo')
    return publicUrl
  }

  const generateFromBusiness = () => {
    const base = (nomeNegocio ?? '').trim()
    const next = normalizeSlug(base)
    setSlug(next)
  }

  const save = async () => {
    if (!usuarioId) return
    setSaving(true)
    setSaved(false)
    setError(null)
    setInfo(null)

    const nextSlug = normalizeSlug(slug)
    if (!isValidSlug(nextSlug)) {
      setError('Slug inválido. Use letras minúsculas, números e hífen.')
      setSaving(false)
      return
    }

    let nextBgUrl: string | null = backgroundImageUrl.trim() ? backgroundImageUrl.trim() : null
    if (bgFile) {
      try {
        const url = await uploadBackground(bgFile)
        nextBgUrl = url
        setBackgroundImageUrl(url)
        setBgFile(null)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Falha ao enviar imagem'
        const lower = msg.toLowerCase()
        const missingBucket = lower.includes('bucket') || lower.includes('not found')
        const rls = lower.includes('row-level security') || lower.includes('row level security')
        setError(
          missingBucket
            ? 'Configuração do Supabase incompleta: crie o bucket "logos" no Storage e habilite leitura pública + upload do próprio usuário.'
            : rls
              ? 'Sem permissão para enviar ao Storage. Execute o SQL do Storage (logos) em /admin/configuracoes.'
              : msg
        )
        setSaving(false)
        return
      }
    }

    if (useBackgroundImage && !nextBgUrl) {
      setError('Envie uma imagem de fundo para ativar o fundo com imagem.')
      setSaving(false)
      return
    }

    let nextLogoUrl: string | null = logoUrl.trim() ? logoUrl.trim() : null
    if (logoFile) {
      try {
        const url = await uploadLogo(logoFile)
        nextLogoUrl = url
        setLogoUrl(url)
        setLogoFile(null)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Falha ao enviar logo'
        const lower = msg.toLowerCase()
        const missingBucket = lower.includes('bucket') || lower.includes('not found')
        const rls = lower.includes('row-level security') || lower.includes('row level security')
        setError(
          missingBucket
            ? 'Configuração do Supabase incompleta: crie o bucket "logos" no Storage e habilite leitura pública + upload do próprio usuário.'
            : rls
              ? 'Sem permissão para enviar ao Storage. Execute o SQL do Storage (logos) em /admin/configuracoes.'
              : msg
        )
        setSaving(false)
        return
      }
    }

    const payload: Record<string, unknown> = {
      slug: nextSlug,
      logo_url: nextLogoUrl,
      instagram_url: instagramUrl.trim() ? instagramUrl.trim() : null,
      tipo_negocio: tipoNegocio.trim() ? tipoNegocio.trim() : null,
      public_primary_color: primaryColor.trim() ? primaryColor.trim() : null,
      public_background_color: backgroundColor.trim() ? backgroundColor.trim() : null,
      public_use_background_image: useBackgroundImage,
      public_background_image_url: nextBgUrl,
    }

    const { error: updateErr } = await supabase.from('usuarios').update(payload).eq('id', usuarioId)
    if (updateErr) {
      const msg = updateErr.message
      const lower = msg.toLowerCase()
      const duplicate = lower.includes('duplicate') || lower.includes('unique')
      const missingColumn = (lower.includes('schema cache') && lower.includes('column')) || (lower.includes('does not exist') && lower.includes('column'))
      const rls = lower.includes('row-level security') || lower.includes('row level security')
      setError(
        duplicate
          ? 'Esse slug já está em uso. Tente outro.'
          : missingColumn
            ? 'Configuração do Supabase incompleta: atualize o SQL do link público (listar + agendar).'
            : rls
              ? 'Sem permissão para atualizar seu perfil (RLS). Execute o SQL de políticas (Usuário / Funcionário) em /admin/configuracoes.'
            : msg
      )
      setSaving(false)
      return
    }

    await refresh()
    setSlug(nextSlug)
    setSaved(true)
    setSaving(false)
  }

  const createUnidade = async () => {
    if (!canUseMultiUnits || !usuarioId) return
    const nome = unidadeNome.trim()
    if (!nome) {
      setError('Informe o nome da unidade.')
      return
    }
    const slugRaw = (unidadeSlug.trim() || nome).trim()
    const nextSlug = normalizeSlug(slugRaw)
    if (!isValidSlug(nextSlug)) {
      setError('Slug da unidade inválido. Use letras minúsculas, números e hífen.')
      return
    }

    setSavingUnidade(true)
    setError(null)
    setInfo(null)

    const payload: Record<string, unknown> = {
      usuario_id: usuarioId,
      nome,
      slug: nextSlug,
      endereco: unidadeEndereco.trim() ? unidadeEndereco.trim() : null,
      telefone: unidadeTelefone.trim() ? unidadeTelefone.trim() : null,
    }

    const { error: insertErr } = await supabase.from('unidades').insert(payload)
    if (insertErr) {
      const msg = insertErr.message
      const lower = msg.toLowerCase()
      const duplicate = lower.includes('duplicate') || lower.includes('unique')
      setError(duplicate ? 'Já existe uma unidade com esse slug.' : msg)
      setSavingUnidade(false)
      return
    }

    setUnidadeNome('')
    setUnidadeSlug('')
    setUnidadeEndereco('')
    setUnidadeTelefone('')
    setInfo('Unidade criada.')
    setSavingUnidade(false)

    const { data, error: reloadErr } = await supabase
      .from('unidades')
      .select('id,nome,slug,endereco,telefone,ativo')
      .eq('usuario_id', usuarioId)
      .order('criado_em', { ascending: true })
    if (!reloadErr) setUnidades((data ?? []) as unknown as Unidade[])
  }

  const toggleUnidadeAtiva = async (id: string, ativo: boolean) => {
    if (!canUseMultiUnits || !usuarioId) return
    setSavingUnidade(true)
    setError(null)
    setInfo(null)
    const { error: updateErr } = await supabase.from('unidades').update({ ativo: !ativo }).eq('id', id).eq('usuario_id', usuarioId)
    if (updateErr) {
      setError(updateErr.message)
      setSavingUnidade(false)
      return
    }
    setUnidades((prev) => prev.map((u) => (u.id === id ? { ...u, ativo: !ativo } : u)))
    setSavingUnidade(false)
  }

  if (!usuarioId) {
    return (
      <AppShell>
        <div className="text-slate-700">Acesso restrito.</div>
      </AppShell>
    )
  }

  return (
    <PageTutorial usuarioId={usuarioId} page="pagina_publica">
      {({ tutorialOpen, tutorialStep, setTutorialStep, resetTutorial, closeTutorial }) => (
        <AppShell>
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-500">Configurações</div>
                <div className="text-xl font-semibold text-slate-900">Página pública de agendamento</div>
              </div>
              <Button variant="secondary" onClick={resetTutorial}>
                Rever tutorial
              </Button>
            </div>

            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
            {info ? <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{info}</div> : null}
            {saved ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Salvo.</div> : null}

            <div
              className={
                tutorialOpen && tutorialSteps[tutorialStep]?.target === 'link'
                  ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
                  : ''
              }
            >
              <Card>
                <div className="p-6 space-y-4">
                  <div className="text-sm font-semibold text-slate-900">Link público</div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      label="Slug (ex: single-motion)"
                      value={slug}
                      onChange={(e) => setSlug(normalizeSlug(e.target.value))}
                      placeholder="sua-empresa"
                    />
                    <div className="flex items-end">
                      <Button variant="secondary" onClick={generateFromBusiness} disabled={!nomeNegocio || saving || loading}>
                        Gerar do nome
                      </Button>
                    </div>
                  </div>

                  <label className="block">
                    <div className="text-sm font-medium text-slate-700 mb-1">Tipo de negócio</div>
                    <select
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                      value={tipoNegocio}
                      onChange={(e) => setTipoNegocio(e.target.value)}
                    >
                      <option value="">Geral</option>
                      <option value="lava_jatos">Lava-jato</option>
                      <option value="barbearia">Barbearia</option>
                      <option value="salao">Salão de beleza</option>
                      <option value="estetica">Estética</option>
                      <option value="odontologia">Odontologia</option>
                    </select>
                  </label>

                  <Input label="URL pública" value={publicLink} readOnly />

                  <Input
                    label="Instagram (opcional)"
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                    placeholder="@seuusuario ou https://instagram.com/seuusuario"
                  />

                  <div className="flex gap-3">
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        if (!publicLink) return
                        await navigator.clipboard.writeText(publicLink)
                        setSaved(true)
                      }}
                      disabled={!publicLink}
                    >
                      Copiar link
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (!publicLink) return
                        window.open(publicLink, '_blank', 'noopener,noreferrer')
                      }}
                      disabled={!publicLink}
                    >
                      Abrir
                    </Button>
                  </div>
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
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Validação do link público</div>
                    <div className="text-sm text-slate-600">Testa o carregamento e o GET de horários via RPC do Supabase.</div>
                  </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Data (para buscar horários)"
                type="date"
                value={publicTestData}
                onChange={(e) => setPublicTestData(e.target.value)}
              />
              <Input
                label="Unidade slug (opcional)"
                value={publicTestUnidadeSlug}
                onChange={(e) => setPublicTestUnidadeSlug(normalizeSlug(e.target.value))}
                placeholder="centro"
              />
            </div>

            {canUseMultiUnits && unidades.length > 0 ? (
              <label className="block">
                <div className="text-sm font-medium text-slate-700 mb-1">Selecionar unidade (EMPRESA)</div>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                  value={publicTestUnidadeSlug}
                  onChange={(e) => setPublicTestUnidadeSlug(e.target.value)}
                >
                  <option value="">Sem unidade</option>
                  {unidades
                    .filter((u) => u.ativo)
                    .map((u) => (
                      <option key={u.id} value={u.slug}>
                        {u.nome} ({u.slug})
                      </option>
                    ))}
                </select>
              </label>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={async () => {
                  if (!slug.trim()) return

                  setPublicTestRunning(true)
                  setPublicTestError(null)
                  setPublicTestResult(null)

                  try {
                    const wantsUnidade = Boolean(publicTestUnidadeSlug.trim())
                    const userArgs: Record<string, unknown> = { p_slug: slug.trim() }
                    if (wantsUnidade) userArgs.p_unidade_slug = publicTestUnidadeSlug.trim()

                    const userRes = await callRpcWithSignatureFallback<unknown>('public_get_usuario_publico', userArgs, {
                      canDropUnidadeSlug: true,
                    })
                    if (!userRes.ok) throw new Error(userRes.errorText)
                    const userDataRaw = userRes.data
                    const userData = Array.isArray(userDataRaw)
                      ? ((userDataRaw[0] ?? null) as Record<string, unknown> | null)
                      : ((userDataRaw ?? null) as Record<string, unknown> | null)
                    if (!userData) throw new Error('Usuário público não encontrado')

                    const usuarioPublico = userData as unknown as Record<string, unknown>
                    const publicUsuarioId =
                      typeof usuarioPublico.usuario_id === 'string'
                        ? usuarioPublico.usuario_id
                        : typeof usuarioPublico.id === 'string'
                          ? usuarioPublico.id
                          : null
                    if (!publicUsuarioId) throw new Error('Resposta sem usuario_id')

                    const unidadeId = typeof usuarioPublico.unidade_id === 'string' ? usuarioPublico.unidade_id : null

                    const { data: servicesData, error: servicesErr } = await supabase.rpc('public_get_servicos_publicos', { p_usuario_id: publicUsuarioId })
                    if (servicesErr) throw servicesErr
                    const servicesList = Array.isArray(servicesData) ? (servicesData as unknown as Array<Record<string, unknown>>) : []
                    const firstServicoId = typeof servicesList[0]?.id === 'string' ? String(servicesList[0].id) : null
                    if (!firstServicoId) throw new Error('Nenhum serviço público encontrado')

                    const staffArgs: Record<string, unknown> = { p_usuario_master_id: publicUsuarioId }
                    if (unidadeId) staffArgs.p_unidade_id = unidadeId
                    const staffRes = await callRpcWithSignatureFallback<unknown>('public_get_funcionarios_publicos', staffArgs, {
                      unidadeId,
                      canDropUnidadeId: true,
                      canAddUnidadeId: false,
                    })
                    if (!staffRes.ok) throw new Error(staffRes.errorText)
                    const staffList = Array.isArray(staffRes.data) ? (staffRes.data as unknown as Array<Record<string, unknown>>) : []

                    const planoPublico = String(usuarioPublico.plano ?? '').trim().toLowerCase()
                    const canChooseProfessional = planoPublico === 'pro' || planoPublico === 'team' || planoPublico === 'enterprise'
                    const hasStaff = canChooseProfessional && staffList.length > 0
                    const firstFuncionarioId = hasStaff && typeof staffList[0]?.id === 'string' ? String(staffList[0].id) : null

                    const slotsArgs: Record<string, unknown> = {
                      p_usuario_id: publicUsuarioId,
                      p_data: publicTestData,
                      p_servico_id: firstServicoId,
                      p_funcionario_id: hasStaff ? firstFuncionarioId : null,
                    }
                    if (unidadeId) slotsArgs.p_unidade_id = unidadeId

                    const slotsRes = await callRpcWithSignatureFallback<unknown>('public_get_slots_publicos', slotsArgs, {
                      unidadeId,
                      canAddUnidadeId: false,
                      canDropUnidadeId: true,
                      canDropFuncionarioId: true,
                    })
                    if (!slotsRes.ok) throw new Error(slotsRes.errorText)

                    const rawSlots = (slotsRes.data ?? []) as unknown
                    const rows = Array.isArray(rawSlots) ? rawSlots : []
                    const list = rows
                      .map((r) => {
                        if (typeof r === 'string') return r.trim()
                        if (!r || typeof r !== 'object') return ''
                        const obj = r as Record<string, unknown>
                        if (typeof obj.hora_inicio === 'string') return obj.hora_inicio.trim()
                        if (typeof obj.hora === 'string') return obj.hora.trim()
                        return ''
                      })
                      .filter(Boolean)
                    const uniqueSorted = Array.from(new Set(list)).sort((a, b) => a.localeCompare(b))

                    const resumo = {
                      slug: slug.trim(),
                      unidade_slug: wantsUnidade ? publicTestUnidadeSlug.trim() : null,
                      usuario_id: publicUsuarioId,
                      unidade_id: unidadeId,
                      servicos: servicesList.length,
                      funcionarios_publicos: staffList.length,
                      usa_profissional: hasStaff,
                      slots: uniqueSorted.length,
                      slots_preview: uniqueSorted.slice(0, 24),
                    }
                    setPublicTestResult(JSON.stringify(resumo, null, 2))
                  } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : 'Falha ao validar'
                    setPublicTestError(msg)
                  } finally {
                    setPublicTestRunning(false)
                  }
                }}
                disabled={publicTestRunning || loading || saving || !slug.trim()}
              >
                {publicTestRunning ? 'Validando…' : 'Validar agora'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const wantsUnidade = Boolean(publicTestUnidadeSlug.trim())
                  const url = wantsUnidade ? unidadeLink(publicTestUnidadeSlug.trim()) : publicLink
                  if (!url) return
                  window.open(url, '_blank', 'noopener,noreferrer')
                }}
                disabled={!publicLink}
              >
                Abrir link
              </Button>
            </div>

            {publicTestError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{publicTestError}</div> : null}
            {publicTestResult ? (
              <pre className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 overflow-auto">{publicTestResult}</pre>
            ) : null}
                </div>
              </Card>
            </div>

        {canUseMultiUnits ? (
          <Card>
            <div className="p-6 space-y-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Unidades</div>
                <div className="text-sm text-slate-600">Crie filiais com link público próprio.</div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Nome" value={unidadeNome} onChange={(e) => setUnidadeNome(e.target.value)} placeholder="Unidade Centro" />
                <Input label="Slug" value={unidadeSlug} onChange={(e) => setUnidadeSlug(normalizeSlug(e.target.value))} placeholder="centro" />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Endereço (opcional)" value={unidadeEndereco} onChange={(e) => setUnidadeEndereco(e.target.value)} placeholder="Rua X, 123" />
                <Input label="Telefone (opcional)" value={unidadeTelefone} onChange={(e) => setUnidadeTelefone(e.target.value)} placeholder="(11) 99999-9999" />
              </div>

              <div className="flex justify-end">
                <Button onClick={createUnidade} disabled={savingUnidade || unidadesLoading || loading || saving}>
                  {savingUnidade ? 'Salvando…' : 'Adicionar unidade'}
                </Button>
              </div>

              {unidadesLoading ? <div className="text-sm text-slate-600">Carregando unidades…</div> : null}
              {!unidadesLoading && unidades.length === 0 ? <div className="text-sm text-slate-600">Nenhuma unidade cadastrada.</div> : null}

              {unidades.length > 0 ? (
                <div className="space-y-3">
                  {unidades.map((u) => {
                    const link = unidadeLink(u.slug)
                    return (
                      <div key={u.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{u.nome}</div>
                            <div className="text-xs text-slate-600">/{u.slug}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="secondary" onClick={() => toggleUnidadeAtiva(u.id, u.ativo)} disabled={savingUnidade}>
                              {u.ativo ? 'Desativar' : 'Ativar'}
                            </Button>
                          </div>
                        </div>

                        <Input label="URL da unidade" value={link} readOnly />

                        <div className="flex flex-wrap gap-3">
                          <Button
                            variant="secondary"
                            onClick={async () => {
                              if (!link) return
                              await navigator.clipboard.writeText(link)
                              setInfo('Link da unidade copiado.')
                            }}
                            disabled={!link}
                          >
                            Copiar link
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              if (!link) return
                              window.open(link, '_blank', 'noopener,noreferrer')
                            }}
                            disabled={!link}
                          >
                            Abrir
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

            <div
              className={
                tutorialOpen && tutorialSteps[tutorialStep]?.target === 'appearance'
                  ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl'
                  : ''
              }
            >
              <Card>
                <div className="p-6 space-y-4">
                  <div className="text-sm font-semibold text-slate-900">Aparência</div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input label="Cor principal" type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
              <Input
                label="Cor de fundo"
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                disabled={useBackgroundImage}
              />
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => setUseBackgroundImage((v) => !v)}
                  className={[
                    'h-10 w-full rounded-lg border px-3 text-sm font-medium',
                    useBackgroundImage ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900',
                  ].join(' ')}
                >
                  {useBackgroundImage ? 'Usar imagem de fundo: Sim' : 'Usar imagem de fundo: Não'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Ou enviar logo"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  if (!file) {
                    setLogoFile(null)
                    return
                  }
                  if (!file.type.startsWith('image/')) {
                    setError('Selecione um arquivo de imagem (PNG/JPG/WebP).')
                    setLogoFile(null)
                    return
                  }
                  const maxBytes = 2 * 1024 * 1024
                  if (file.size > maxBytes) {
                    setError('Imagem muito grande (máx 2MB).')
                    setLogoFile(null)
                    return
                  }
                  setError(null)
                  setLogoFile(file)
                }}
              />
              {(logoObjectUrl || logoUrl.trim()) && (
                <div className="flex items-end">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <img src={logoObjectUrl ?? logoUrl.trim()} alt="Logo" className="h-14 w-14 rounded-xl object-cover border border-slate-200" />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Enviar imagem de fundo"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  if (!file) {
                    setBgFile(null)
                    return
                  }
                  if (!file.type.startsWith('image/')) {
                    setError('Selecione um arquivo de imagem (PNG/JPG/WebP).')
                    setBgFile(null)
                    return
                  }
                  const maxBytes = 3 * 1024 * 1024
                  if (file.size > maxBytes) {
                    setError('Imagem muito grande (máx 3MB).')
                    setBgFile(null)
                    return
                  }
                  setError(null)
                  setBgFile(file)
                }}
              />
              <div />
            </div>

            {useBackgroundImage && (bgObjectUrl || backgroundImageUrl.trim()) && (
              <div
                className="rounded-xl border border-slate-200 overflow-hidden"
                style={{ backgroundColor, backgroundImage: `url(${bgObjectUrl ?? backgroundImageUrl.trim()})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              >
                <div className="p-6" style={{ backgroundColor: 'rgba(255,255,255,0.75)' }}>
                  <div className="text-sm font-semibold text-slate-900">Prévia</div>
                  <div className="text-sm text-slate-700">Sua página pública usará essas cores e fundo.</div>
                </div>
              </div>
            )}

                  <div
                    className={
                      tutorialOpen && tutorialSteps[tutorialStep]?.target === 'save'
                        ? 'ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 rounded-xl p-2 -m-2'
                        : ''
                    }
                  >
                    <div className="flex justify-end">
                      <Button onClick={save} disabled={saving || loading} style={{ backgroundColor: primaryColor, borderColor: primaryColor }}>
                        {saving ? 'Salvando…' : 'Salvar'}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {loading ? <div className="text-sm text-slate-600">Carregando…</div> : null}

            <TutorialOverlay
              open={tutorialOpen}
              steps={tutorialSteps}
              step={tutorialStep}
              onStepChange={setTutorialStep}
              onClose={closeTutorial}
              titleFallback="Página pública"
            />
          </div>
        </AppShell>
      )}
    </PageTutorial>
  )
}
