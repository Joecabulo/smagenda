import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
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
  const usuarioId = appPrincipal?.kind === 'usuario' ? appPrincipal.profile.id : null
  const nomeNegocio = appPrincipal?.kind === 'usuario' ? appPrincipal.profile.nome_negocio : null

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [slug, setSlug] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const [primaryColor, setPrimaryColor] = useState('#0f172a')
  const [backgroundColor, setBackgroundColor] = useState('#f8fafc')
  const [backgroundImageUrl, setBackgroundImageUrl] = useState('')
  const [bgFile, setBgFile] = useState<File | null>(null)

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
    return `${window.location.origin}/agendar/${slug.trim()}`
  }, [slug])

  useEffect(() => {
    const run = async () => {
      if (!usuarioId) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
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
      const nextPrimary = typeof row.public_primary_color === 'string' ? row.public_primary_color : '#0f172a'
      const nextBgColor = typeof row.public_background_color === 'string' ? row.public_background_color : '#f8fafc'
      const nextBgUrl = typeof row.public_background_image_url === 'string' ? row.public_background_image_url : ''

      setSlug(nextSlug)
      setLogoUrl(nextLogo)
      setPrimaryColor(nextPrimary)
      setBackgroundColor(nextBgColor)
      setBackgroundImageUrl(nextBgUrl)
      setLoading(false)
    }
    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Erro ao carregar')
      setLoading(false)
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
        setError(missingBucket ? 'Configuração do Supabase incompleta: crie o bucket "logos" no Storage e habilite leitura pública + upload do próprio usuário.' : msg)
        setSaving(false)
        return
      }
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
        setError(missingBucket ? 'Configuração do Supabase incompleta: crie o bucket "logos" no Storage e habilite leitura pública + upload do próprio usuário.' : msg)
        setSaving(false)
        return
      }
    }

    const payload: Record<string, unknown> = {
      slug: nextSlug,
      logo_url: nextLogoUrl,
      public_primary_color: primaryColor.trim() ? primaryColor.trim() : null,
      public_background_color: backgroundColor.trim() ? backgroundColor.trim() : null,
      public_background_image_url: nextBgUrl,
    }

    const { error: updateErr } = await supabase.from('usuarios').update(payload).eq('id', usuarioId)
    if (updateErr) {
      const lower = updateErr.message.toLowerCase()
      const duplicate = lower.includes('duplicate') || lower.includes('unique')
      setError(duplicate ? 'Esse slug já está em uso. Tente outro.' : updateErr.message)
      setSaving(false)
      return
    }

    await refresh()
    setSlug(nextSlug)
    setSaved(true)
    setSaving(false)
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <div className="text-sm font-semibold text-slate-500">Configurações</div>
          <div className="text-xl font-semibold text-slate-900">Página pública de agendamento</div>
        </div>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
        {saved ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Salvo.</div> : null}

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

            <Input label="URL pública" value={publicLink} readOnly />

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

        <Card>
          <div className="p-6 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Aparência</div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input label="Cor principal" type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
              <Input label="Cor de fundo" type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} />
              <Input label="Logo (URL opcional)" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
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
                label="Imagem de fundo (URL opcional)"
                value={backgroundImageUrl}
                onChange={(e) => setBackgroundImageUrl(e.target.value)}
                placeholder="https://..."
              />
              <Input
                label="Ou enviar imagem de fundo"
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
            </div>

            {(bgObjectUrl || backgroundImageUrl.trim()) && (
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

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving || loading} style={{ backgroundColor: primaryColor, borderColor: primaryColor }}>
                {saving ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </div>
        </Card>

        {loading ? <div className="text-sm text-slate-600">Carregando…</div> : null}
      </div>
    </AppShell>
  )
}
