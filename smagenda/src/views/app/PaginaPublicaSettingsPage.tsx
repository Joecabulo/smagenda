import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { PageTutorial, TutorialOverlay } from '../../components/ui/TutorialOverlay'
import { formatBRMoney } from '../../lib/dates'
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
          body: 'Copie/abra sua URL de agendamento. Esse link é o que você divulga aos clientes.',
          target: 'link' as const,
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
  const [tipoNegocioInicial, setTipoNegocioInicial] = useState('')

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

  type ServicoPreview = {
    id: string
    nome: string
    duracao_minutos: number
    preco: number
    cor: string | null
    foto_url: string | null
    ativo?: boolean | null
    ordem?: number | null
  }

  const [servicosPreview, setServicosPreview] = useState<ServicoPreview[]>([])
  const [servicosPreviewLoading, setServicosPreviewLoading] = useState(false)
  const [servicosPreviewError, setServicosPreviewError] = useState<string | null>(null)

  const logoObjectUrl = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile])
  const bgObjectUrl = useMemo(() => (bgFile ? URL.createObjectURL(bgFile) : null), [bgFile])

  const canUseMedia = useMemo(() => {
    const p = String(usuario?.plano ?? '').trim().toLowerCase()
    return p === 'pro' || p === 'team' || p === 'enterprise'
  }, [usuario?.plano])

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
      setTipoNegocioInicial(nextTipoNegocio)
      setPrimaryColor(nextPrimary)
      setBackgroundColor(nextBgColor)
      setUseBackgroundImage(canUseMedia ? nextUseBgImage : false)
      setBackgroundImageUrl(nextBgUrl)
      setLoading(false)
    }
    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar')
      setLoading(false)
    })
  }, [usuarioId, canUseMedia])

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

  useEffect(() => {
    const run = async () => {
      if (!usuarioId) {
        setServicosPreview([])
        return
      }
      setServicosPreviewLoading(true)
      setServicosPreviewError(null)

      const cols = 'id,nome,duracao_minutos,preco,cor,foto_url,ativo,ordem'
      const res = await supabase
        .from('servicos')
        .select(cols)
        .eq('usuario_id', usuarioId)
        .eq('ativo', true)
        .order('ordem', { ascending: true })
        .order('criado_em', { ascending: true })
        .limit(6)

      if (res.error) {
        setServicosPreview([])
        setServicosPreviewError(res.error.message)
        setServicosPreviewLoading(false)
        return
      }

      setServicosPreview((res.data ?? []) as unknown as ServicoPreview[])
      setServicosPreviewLoading(false)
    }

    run().catch((e: unknown) => {
      setServicosPreview([])
      setServicosPreviewError(e instanceof Error ? e.message : 'Erro ao carregar serviços')
      setServicosPreviewLoading(false)
    })
  }, [usuarioId])

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

  const save = async () => {
    if (!usuarioId) return
    setSaving(true)
    setSaved(false)
    setError(null)
    setInfo(null)

    const lockedTipoBase = tipoNegocioInicial.trim()
    const nextTipo = tipoNegocio.trim()
    if (lockedTipoBase && nextTipo !== lockedTipoBase) {
      setError('Tipo de negócio já definido. Para alterar, solicite mudança no suporte.')
      setSaving(false)
      return
    }

    const slugSource = slug.trim() ? slug : ((nomeNegocio ?? '').trim() || `user-${usuarioId}`)
    const nextSlug = normalizeSlug(slugSource)
    if (!isValidSlug(nextSlug)) {
      setError('Slug inválido. Use letras minúsculas, números e hífen.')
      setSaving(false)
      return
    }

    let nextBgUrl: string | null = backgroundImageUrl.trim() ? backgroundImageUrl.trim() : null
    if (bgFile && !canUseMedia) {
      setError('Imagem de fundo disponível apenas no plano PRO ou EMPRESA.')
      setSaving(false)
      return
    }
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

    if (useBackgroundImage && !canUseMedia) {
      setError('Imagem de fundo disponível apenas no plano PRO ou EMPRESA.')
      setSaving(false)
      return
    }

    if (useBackgroundImage && !nextBgUrl) {
      setError('Envie uma imagem de fundo para ativar o fundo com imagem.')
      setSaving(false)
      return
    }

    let nextLogoUrl: string | null = logoUrl.trim() ? logoUrl.trim() : null
    if (logoFile && !canUseMedia) {
      setError('Logo disponível apenas no plano PRO ou EMPRESA.')
      setSaving(false)
      return
    }
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
      public_use_background_image: canUseMedia ? useBackgroundImage : false,
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
          ? 'Nome já está em uso. Escolha outro para o seu link público.'
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
    if (!tipoNegocioInicial.trim() && nextTipo) setTipoNegocioInicial(nextTipo)
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
        <div className="text-slate-700">{appPrincipal ? 'Acesso restrito.' : 'Carregando…'}</div>
      </AppShell>
    )
  }

  return (
    <PageTutorial usuarioId={usuarioId} page="pagina_publica">
      {({ tutorialOpen, tutorialStep, setTutorialStep, resetTutorial, closeTutorial }) => (
        <AppShell>
          <div className="mx-auto w-full max-w-3xl space-y-6">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="text-sm font-semibold text-slate-500">Configurações</div>
                <div className="text-xl font-semibold text-slate-900">Página pública de agendamento</div>
              </div>
              <Button variant="secondary" onClick={resetTutorial} className="w-full sm:w-auto">
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

                  <label className="block">
                    <div className="text-sm font-medium text-slate-700 mb-1">Tipo de negócio</div>
                    <select
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                      value={tipoNegocio}
                      onChange={(e) => setTipoNegocio(e.target.value)}
                      disabled={Boolean(tipoNegocioInicial.trim())}
                    >
                      <option value="">Geral</option>
                      <option value="lava_jatos">Lava-jato</option>
                      <option value="barbearia">Barbearia</option>
                      <option value="salao">Salão de beleza</option>
                      <option value="estetica">Estética</option>
                      <option value="odontologia">Odontologia</option>
                      <option value="manicure">Manicure</option>
                      <option value="pilates">Pilates / Estúdio</option>
                      <option value="faxina">Faxina / Diarista</option>
                    </select>
                    <div className="mt-1 text-xs text-slate-600">
                      {tipoNegocioInicial.trim()
                        ? 'Tipo de negócio bloqueado. Para alterar, solicite mudança no suporte.'
                        : 'Após salvar um tipo específico, ele fica bloqueado para evitar mudanças futuras.'}
                    </div>
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

                  {!canUseMedia ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      Logo e imagem de fundo estão disponíveis apenas no plano PRO ou EMPRESA. As cores ficam disponíveis em qualquer plano.
                    </div>
                  ) : null}

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
                  onClick={() => {
                    if (!canUseMedia) return
                    setUseBackgroundImage((v) => !v)
                  }}
                  disabled={!canUseMedia}
                  className={[
                    'h-10 w-full rounded-lg border px-3 text-sm font-medium',
                    useBackgroundImage ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900',
                    !canUseMedia ? 'opacity-60 cursor-not-allowed' : '',
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
                disabled={!canUseMedia}
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
              {canUseMedia && (logoObjectUrl || logoUrl.trim()) && (
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
                disabled={!canUseMedia}
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

            <div
              className="rounded-xl border border-slate-200 overflow-hidden"
              style={
                canUseMedia && useBackgroundImage && (bgObjectUrl || backgroundImageUrl.trim())
                  ? {
                      backgroundColor,
                      backgroundImage: `url(${bgObjectUrl ?? backgroundImageUrl.trim()})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : { backgroundColor }
              }
            >
              <div className="p-6" style={{ backgroundColor: canUseMedia && useBackgroundImage ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.9)' }}>
                <div className="text-sm font-semibold text-slate-900">Prévia (com serviços reais)</div>
                <div className="mt-3 flex items-center gap-3">
                  {(logoObjectUrl || logoUrl.trim()) && (
                    <img
                      src={logoObjectUrl ?? logoUrl.trim()}
                      alt="Logo"
                      className="h-12 w-12 rounded-xl object-cover border border-slate-200 bg-white"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-slate-900">{nomeNegocio ?? 'Seu negócio'}</div>
                    <div className="truncate text-sm text-slate-600">Agendamento online</div>
                  </div>
                </div>

                {instagramUrl.trim() ? (
                  <div className="mt-3 text-sm">
                    <a
                      className="font-semibold"
                      href={instagramUrl.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: primaryColor }}
                    >
                      Instagram
                    </a>
                  </div>
                ) : null}

                <div className="mt-4">
                  {servicosPreviewLoading ? <div className="text-sm text-slate-600">Carregando serviços…</div> : null}
                  {!servicosPreviewLoading && servicosPreviewError ? (
                    <div className="text-sm text-rose-700">Não foi possível carregar seus serviços para a prévia.</div>
                  ) : null}
                  {!servicosPreviewLoading && !servicosPreviewError && servicosPreview.length === 0 ? (
                    <div className="text-sm text-slate-600">Cadastre ao menos 1 serviço para ver a prévia completa.</div>
                  ) : null}

                  {!servicosPreviewLoading && !servicosPreviewError && servicosPreview.length > 0 ? (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {servicosPreview.slice(0, 4).map((s) => (
                        <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">{s.nome}</div>
                              <div className="text-xs text-slate-600">
                                {s.duracao_minutos}min · {formatBRMoney(s.preco)}
                              </div>
                            </div>
                            <div
                              className="h-5 w-5 rounded-full border border-slate-200"
                              style={{ backgroundColor: (s.cor ?? '').trim() ? s.cor ?? undefined : '#e2e8f0' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    className="h-10 w-full rounded-xl px-4 text-sm font-semibold text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Continuar
                  </button>
                </div>
              </div>
            </div>

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
