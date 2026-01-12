import React, { useEffect, useMemo, useState } from 'react'
import type { Establishment, EstablishmentStatus, ImportPreset } from './types'
import { newId } from './lib/id'
import { extractAddressParts } from './lib/address'
import { loadState, saveState, exportJson, importJson } from './lib/storage'
import { geocode, health, placesDetails, placesTextSearch } from './lib/api'

const PRESETS: ImportPreset[] = [
  {
    key: 'agendamentos_todos',
    label: 'Todos (por agendamento)',
    queries: [
      'salão de beleza',
      'cabeleireiro',
      'barbearia',
      'barber shop',
      'manicure',
      'pedicure',
      'esmalteria',
      'depilação',
      'design de sobrancelhas',
      'extensão de cílios',
      'clínica de estética',
      'estética facial',
      'estética corporal',
      'massagem',
      'drenagem linfática',
      'spa',
      'clínica médica',
      'consultório médico',
      'dermatologista',
      'oftalmologista',
      'dentista',
      'clínica odontológica',
      'ortodontista',
      'fisioterapia',
      'pilates',
      'quiropraxia',
      'osteopatia',
      'psicólogo',
      'psiquiatra',
      'terapeuta',
      'nutricionista',
      'fonoaudiólogo',
      'laboratório',
      'clínica de exames',
      'yoga',
      'personal trainer',
      'treinamento funcional',
      'estúdio de dança',
      'artes marciais',
      'pet shop',
      'banho e tosa',
      'tosa',
      'clínica veterinária',
      'veterinário',
      'lava jato',
      'estética automotiva',
      'polimento',
      'oficina mecânica',
      'auto elétrica',
      'funilaria e pintura',
      'estúdio de tatuagem',
      'body piercing',
      'fotógrafo',
      'estúdio fotográfico',
    ],
  },
  {
    key: 'beleza',
    label: 'Beleza',
    queries: ['salão de beleza', 'cabeleireiro', 'barbearia', 'manicure', 'estética', 'spa'],
  },
  {
    key: 'saude',
    label: 'Clínicas e Saúde',
    queries: ['clínica', 'clínica odontológica', 'dentista', 'oftalmologista', 'fisioterapia'],
  },
  {
    key: 'bem_estar',
    label: 'Bem-estar',
    queries: ['pilates', 'yoga', 'massagem'],
  },
]

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function toCsv(rows: Establishment[]) {
  const headers = [
    'placeId',
    'name',
    'formattedAddress',
    'street',
    'number',
    'city',
    'state',
    'postalCode',
    'status',
    'contactName',
    'contactPhone',
    'phone',
    'website',
    'googleMapsUrl',
    'notes',
    'lastVisitAt',
    'updatedAt',
    'createdAt',
  ]
  const escape = (v: unknown) => {
    const s = String(v ?? '')
    const needs = s.includes(',') || s.includes('"') || s.includes('\n')
    const out = s.replaceAll('"', '""')
    return needs ? `"${out}"` : out
  }
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push(
      headers
        .map((h) =>
          escape(
            (r as unknown as Record<string, unknown>)[h] ??
              (h === 'placeId' ? r.placeId : '')
          )
        )
        .join(',')
    )
  }
  return lines.join('\n')
}

function statusLabel(s: EstablishmentStatus) {
  if (s === 'novo') return 'Novo'
  if (s === 'visitado') return 'Visitado'
  if (s === 'confirmado') return 'Confirmado'
  if (s === 'aprovado') return 'Aprovado'
  if (s === 'recusou') return 'Recusou'
  return 'Sem resposta'
}

function statusColor(s: EstablishmentStatus) {
  if (s === 'novo') return 'gray'
  if (s === 'visitado') return 'blue'
  if (s === 'confirmado') return 'violet'
  if (s === 'aprovado') return 'green'
  if (s === 'recusou') return 'red'
  return 'orange'
}

function normalizePhone(value: string) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const digits = raw.replace(/\D+/g, '')
  if (!digits) return ''
  if (digits.startsWith('55')) return digits
  if (digits.length >= 10) return `55${digits}`
  return digits
}

function toWhatsAppUrl(phoneRaw: string, message?: string) {
  const phone = normalizePhone(phoneRaw)
  if (!phone) return null
  const base = `https://wa.me/${phone}`
  if (!message) return base
  return `${base}?text=${encodeURIComponent(message)}`
}

function normKey(s: unknown) {
  return String(s ?? '').trim().toLowerCase()
}

function parseStreetNumber(value: unknown) {
  const s = String(value ?? '').trim()
  if (!s) return null
  const m = s.match(/\d+/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

function sleep(ms: number) {
  return new Promise((r) => window.setTimeout(r, ms))
}

async function assertBackendReady() {
  const h = await health()
  if (!h?.ok) throw new Error('Backend indisponível. Inicie o prospector/server e tente novamente.')
  if (h.hasKey === false) throw new Error('Defina GOOGLE_MAPS_API_KEY no prospector/server/.env e reinicie o server.')
}

async function copyText(text: string) {
  const v = String(text ?? '').trim()
  if (!v) return false
  try {
    await navigator.clipboard.writeText(v)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = v
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      ta.style.top = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

function formatIsoDate(value: string | null) {
  const s = String(value ?? '').trim()
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('pt-BR')
}

const CSS = `
:root{
  --bg:#0b1220;
  --panel:#0f1b31;
  --panel2:#0c172b;
  --border:rgba(255,255,255,.08);
  --text:rgba(255,255,255,.92);
  --muted:rgba(255,255,255,.68);
  --muted2:rgba(255,255,255,.52);
  --shadow: 0 18px 50px rgba(0,0,0,.35);
  --radius:14px;
  --radius2:10px;
}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(1200px 600px at 15% 10%, rgba(99,102,241,.25), transparent 60%), radial-gradient(900px 500px at 90% 0%, rgba(34,197,94,.18), transparent 60%), var(--bg); color:var(--text)}
a{color:rgba(147,197,253,.95);text-decoration:none}
a:hover{text-decoration:underline}
.app{max-width:1280px;margin:0 auto;padding:20px}
.top{display:flex;gap:14px;flex-wrap:wrap;align-items:center}
.title{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.title h1{margin:0;font-size:22px;letter-spacing:.2px}
.subtitle{color:var(--muted);font-size:13px}
.kpis{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}
.chip{border:1px solid var(--border);background:rgba(255,255,255,.04);padding:7px 10px;border-radius:999px;font-size:12px;color:var(--muted)}
.chip b{color:var(--text);font-weight:700}
.layout{display:grid;grid-template-columns:420px 1fr;gap:14px;margin-top:14px}
@media (max-width: 980px){.layout{grid-template-columns:1fr}}
.panel{border:1px solid var(--border);background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03));border-radius:var(--radius);box-shadow:var(--shadow)}
.panelHeader{padding:12px 12px 10px;border-bottom:1px solid var(--border)}
.panelBody{padding:12px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
.field{display:grid;gap:6px;min-width:200px;flex:1}
.field span{font-size:12px;color:var(--muted)}
.input, .select, .textarea{width:100%;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.04);color:var(--text);padding:10px 10px;outline:none}
.input:focus, .select:focus, .textarea:focus{border-color:rgba(99,102,241,.55);box-shadow:0 0 0 4px rgba(99,102,241,.12)}
.textarea{min-height:90px;resize:vertical}
.btn{border:1px solid var(--border);background:rgba(255,255,255,.05);color:var(--text);border-radius:12px;padding:10px 12px;cursor:pointer}
.btn:hover{background:rgba(255,255,255,.09)}
.btn:disabled{opacity:.55;cursor:not-allowed}
.btnPrimary{background:linear-gradient(180deg, rgba(99,102,241,.95), rgba(79,70,229,.95));border-color:rgba(99,102,241,.55)}
.btnPrimary:hover{background:linear-gradient(180deg, rgba(129,140,248,.95), rgba(99,102,241,.95))}
.btnDanger{background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.35)}
.btnDanger:hover{background:rgba(239,68,68,.2)}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
.muted{color:var(--muted)}
.muted2{color:var(--muted2)}
.split{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width: 700px){.split{grid-template-columns:1fr}}
.list{display:flex;flex-direction:column;gap:10px}
.streetHeader{padding:8px 10px;border:1px solid var(--border);border-radius:14px;background:rgba(255,255,255,.03);color:var(--muted);font-size:12px;letter-spacing:.2px}
.listHeader{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.listScroll{max-height:calc(100vh - 260px);overflow:auto;padding-right:6px}
@media (max-width: 980px){.listScroll{max-height:unset}}
.item{border:1px solid var(--border);background:rgba(12,23,43,.35);border-radius:14px;padding:12px;cursor:pointer;display:grid;gap:8px}
.item:hover{background:rgba(12,23,43,.5)}
.itemActive{outline:2px solid rgba(99,102,241,.45);background:rgba(12,23,43,.65)}
.itemTop{display:flex;gap:10px;align-items:flex-start}
.badge{font-size:11px;padding:5px 8px;border-radius:999px;border:1px solid var(--border);background:rgba(255,255,255,.04);color:var(--muted)}
.badge.gray{background:rgba(148,163,184,.12);border-color:rgba(148,163,184,.25);color:rgba(226,232,240,.95)}
.badge.blue{background:rgba(59,130,246,.14);border-color:rgba(59,130,246,.28);color:rgba(191,219,254,.98)}
.badge.violet{background:rgba(139,92,246,.14);border-color:rgba(139,92,246,.28);color:rgba(221,214,254,.98)}
.badge.green{background:rgba(34,197,94,.14);border-color:rgba(34,197,94,.28);color:rgba(187,247,208,.98)}
.badge.red{background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.28);color:rgba(254,202,202,.98)}
.badge.orange{background:rgba(249,115,22,.14);border-color:rgba(249,115,22,.28);color:rgba(255,237,213,.98)}
.itemName{font-weight:750;line-height:1.15}
.itemAddr{font-size:12px;color:var(--muted);line-height:1.25}
.itemMeta{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:var(--muted2)}
.actions{display:flex;gap:8px;flex-wrap:wrap}
.sep{height:1px;background:var(--border);margin:10px 0}
.hint{color:var(--muted);font-size:13px;line-height:1.4}
.progressWrap{margin-top:10px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.03);padding:10px}
.progressTop{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.progressMsg{color:var(--muted);font-size:12px;line-height:1.35}
.progressPct{color:var(--muted2);font-size:12px}
.progressTrack{margin-top:8px;height:10px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid var(--border);overflow:hidden}
.progressFill{height:100%;background:linear-gradient(90deg, rgba(99,102,241,.95), rgba(34,197,94,.75));width:0%}
.progressIndeterminate{height:100%;width:40%;background:linear-gradient(90deg, rgba(99,102,241,.95), rgba(34,197,94,.75));border-radius:999px;animation:progressMove 1.1s ease-in-out infinite}
@keyframes progressMove{0%{transform:translateX(-60%)}100%{transform:translateX(260%)}}
`

export function App() {
  const [state, setState] = useState(() => loadState())
  const [city, setCity] = useState('')
  const [street, setStreet] = useState('')
  const [presetKey, setPresetKey] = useState(PRESETS[0]?.key ?? 'beleza')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<{ active: boolean; done: number; total: number; message: string }>(() => ({ active: false, done: 0, total: 0, message: '' }))
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<EstablishmentStatus | 'all'>('all')
  const [onlyWithPhone, setOnlyWithPhone] = useState(false)
  const [onlyMissingContact, setOnlyMissingContact] = useState(false)
  const [sortKey, setSortKey] = useState<'updated_desc' | 'name_asc' | 'status' | 'last_visit_desc' | 'street_number'>('updated_desc')
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [installPrompt, setInstallPrompt] = useState<unknown>(null)

  const preset = useMemo(() => PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0]!, [presetKey])

  const upsertMany = (rows: Establishment[]) => {
    const byPlace = new Map<string, Establishment>()
    for (const e of state.establishments) byPlace.set(e.placeId, e)
    for (const r of rows) {
      const prev = byPlace.get(r.placeId)
      if (prev) {
        const mergedSegments = (() => {
          const a = Array.isArray(prev.segments) ? prev.segments : []
          const b = Array.isArray(r.segments) ? r.segments : []
          const next = Array.from(new Set([...a, ...b].map((x) => String(x).trim()).filter(Boolean)))
          return next.length > 0 ? next : undefined
        })()
        byPlace.set(r.placeId, {
          ...prev,
          name: r.name || prev.name,
          formattedAddress: r.formattedAddress || prev.formattedAddress,
          street: r.street ?? prev.street,
          number: r.number ?? prev.number,
          city: r.city ?? prev.city,
          state: r.state ?? prev.state,
          postalCode: r.postalCode ?? prev.postalCode,
          lat: r.lat ?? prev.lat,
          lng: r.lng ?? prev.lng,
          types: r.types.length > 0 ? r.types : prev.types,
          segments: mergedSegments,
          googleMapsUrl: r.googleMapsUrl ?? prev.googleMapsUrl,
          phone: r.phone ?? prev.phone,
          website: r.website ?? prev.website,
          fetchedAt: r.fetchedAt,
          updatedAt: new Date().toISOString(),
        })
      } else {
        byPlace.set(r.placeId, r)
      }
    }
    const next = { establishments: Array.from(byPlace.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
    setState(next)
    saveState(next)
  }

  const updateOne = (placeId: string, patch: Partial<Establishment>) => {
    const next = {
      establishments: state.establishments.map((e) =>
        e.placeId === placeId
          ? { ...e, ...patch, updatedAt: new Date().toISOString() }
          : e
      ),
    }
    setState(next)
    saveState(next)
  }

  const toastNow = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 1800)
  }

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as unknown)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const updateStatus = (placeId: string, status: EstablishmentStatus) => {
    const patch: Partial<Establishment> = { status }
    if (status === 'visitado') patch.lastVisitAt = new Date().toISOString()
    updateOne(placeId, patch)
  }

  const progressStart = (message: string) => {
    setProgress({ active: true, done: 0, total: 0, message })
  }

  const progressSetMessage = (message: string) => {
    setProgress((p) => (p.active ? { ...p, message } : p))
  }

  const progressAddTotal = (n: number) => {
    const x = Number(n)
    if (!Number.isFinite(x) || x <= 0) return
    setProgress((p) => (p.active ? { ...p, total: p.total + x } : p))
  }

  const progressIncDone = (n: number) => {
    const x = Number(n)
    if (!Number.isFinite(x) || x <= 0) return
    setProgress((p) => (p.active ? { ...p, done: p.done + x } : p))
  }

  const progressEnd = () => {
    setProgress({ active: false, done: 0, total: 0, message: '' })
  }

  const runImport = async () => {
    const c = city.trim()
    const s = street.trim()
    if (!c || !s) {
      setError('Informe cidade e rua.')
      return
    }
    setError(null)
    setLoading(true)
    progressStart('Iniciando importação…')
    try {
      progressAddTotal(1)
      progressSetMessage('Verificando backend…')
      await assertBackendReady()
      progressIncDone(1)
      const all: Establishment[] = []

      const streets = s
        .split(/[\n;]+/g)
        .map((x) => x.trim())
        .filter(Boolean)

      for (const streetName of streets) {
        progressAddTotal(1)
        progressSetMessage(`Geocodificando: ${streetName}`)
        const geo = await geocode(`${streetName} ${c}`)
        progressIncDone(1)
        const loc0 = geo.results?.[0]?.geometry?.location
        const lat0 = typeof loc0?.lat === 'number' ? loc0.lat : null
        const lng0 = typeof loc0?.lng === 'number' ? loc0.lng : null
        const location = lat0 !== null && lng0 !== null ? `${lat0},${lng0}` : null

        for (const q of preset.queries) {
          const fullQuery = `${q} ${streetName} ${c}`
          let pageToken: string | null = null
          let pages = 0
          do {
            progressAddTotal(1)
            progressSetMessage(`Buscando: ${q} • ${streetName}`)
            const res = await placesTextSearch({ query: fullQuery, pageToken, location, radius: 6000 })
            progressIncDone(1)
            const results = Array.isArray(res.results) ? res.results : []
            const validResults = results.filter((r) => String(r.place_id ?? '').trim())
            progressAddTotal(validResults.length)
            for (const r of validResults) {
              const pid = (r.place_id ?? '').trim()
              progressSetMessage(`Detalhando: ${(r.name ?? '').trim() || pid}`)
              const det = await placesDetails(pid)
              progressIncDone(1)
              const d = det.result
              const parts = extractAddressParts(d)
              const now = new Date().toISOString()
              const phone = (d.formatted_phone_number ?? d.international_phone_number ?? '').trim() || null
              const url = (d.url ?? '').trim() || null
              const website = (d.website ?? '').trim() || null
              const formattedAddress = (d.formatted_address ?? r.formatted_address ?? '').trim()
              const lat = typeof d.geometry?.location?.lat === 'number' ? d.geometry?.location?.lat : typeof r.geometry?.location?.lat === 'number' ? r.geometry?.location?.lat : null
              const lng = typeof d.geometry?.location?.lng === 'number' ? d.geometry?.location?.lng : typeof r.geometry?.location?.lng === 'number' ? r.geometry?.location?.lng : null
              const types = Array.isArray(d.types) ? d.types.filter((t) => typeof t === 'string') : Array.isArray(r.types) ? r.types.filter((t) => typeof t === 'string') : []
              all.push({
                id: newId(),
                placeId: pid,
                name: (d.name ?? r.name ?? '').trim() || 'Sem nome',
                formattedAddress,
                street: parts.street,
                number: parts.number,
                city: parts.city,
                state: parts.state,
                postalCode: parts.postalCode,
                lat,
                lng,
                types,
                segments: [q],
                googleMapsUrl: url,
                phone,
                website,
                fetchedAt: now,
                status: 'novo',
                contactName: null,
                contactPhone: null,
                notes: null,
                lastVisitAt: null,
                updatedAt: now,
                createdAt: now,
              })
              await sleep(70)
            }
            pageToken = typeof res.next_page_token === 'string' ? res.next_page_token : null
            pages += 1
            if (pageToken) await new Promise((r) => setTimeout(r, 2200))
          } while (pageToken && pages < 3)
        }
      }
      progressAddTotal(1)
      progressSetMessage('Salvando no sistema…')
      upsertMany(all)
      progressIncDone(1)
      if (all.length > 0) setSelectedPlaceId(all[0]?.placeId ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao importar.')
    } finally {
      setLoading(false)
      progressEnd()
    }
  }

  const runImportItabirito = async () => {
    setError(null)
    setLoading(true)
    progressStart('Iniciando importação de Itabirito…')
    try {
      progressAddTotal(1)
      progressSetMessage('Verificando backend…')
      await assertBackendReady()
      progressIncDone(1)
      const CITY_QUERY = 'Itabirito MG'
      const SEGMENTS = [
        { label: 'Salão de beleza', query: 'salão de beleza' },
        { label: 'Cabeleireiro', query: 'cabeleireiro' },
        { label: 'Barbearia', query: 'barbearia' },
        { label: 'Manicure', query: 'manicure' },
        { label: 'Depilação', query: 'depilação' },
        { label: 'Estética', query: 'estética' },
        { label: 'Spa', query: 'spa' },
        { label: 'Pilates', query: 'pilates' },
        { label: 'Yoga', query: 'yoga' },
        { label: 'Fisioterapia', query: 'fisioterapia' },
        { label: 'Clínica', query: 'clínica' },
        { label: 'Clínica odontológica', query: 'clínica odontológica' },
        { label: 'Dentista', query: 'dentista' },
        { label: 'Oftalmologista', query: 'oftalmologista' },
        { label: 'Médico', query: 'médico' },
      ]

      setCity('Itabirito')
      setStreet('')
      setSortKey('street_number')

      progressAddTotal(1)
      progressSetMessage('Geocodificando: Itabirito MG')
      const geo = await geocode(CITY_QUERY)
      progressIncDone(1)
      const loc0 = geo.results?.[0]?.geometry?.location
      const lat0 = typeof loc0?.lat === 'number' ? loc0.lat : null
      const lng0 = typeof loc0?.lng === 'number' ? loc0.lng : null
      const location = lat0 !== null && lng0 !== null ? `${lat0},${lng0}` : null
      const radius = 14000

      const byPlaceId = new Map<string, Establishment>()

      for (const seg of SEGMENTS) {
        const fullQuery = `${seg.query} ${CITY_QUERY}`
        let pageToken: string | null = null
        let pages = 0
        do {
          progressAddTotal(1)
          progressSetMessage(`Buscando: ${seg.label} • Itabirito`)
          const res = await placesTextSearch({ query: fullQuery, pageToken, location, radius })
          progressIncDone(1)
          const results = Array.isArray(res.results) ? res.results : []
          const validResults = results.filter((r) => String(r.place_id ?? '').trim())
          progressAddTotal(validResults.length)
          for (const r of validResults) {
            const pid = (r.place_id ?? '').trim()

            const existing = byPlaceId.get(pid)
            if (existing) {
              const nextSegs = new Set([...(existing.segments ?? []), seg.label])
              existing.segments = Array.from(nextSegs)
              byPlaceId.set(pid, existing)
              progressIncDone(1)
              continue
            }

            progressSetMessage(`Detalhando: ${(r.name ?? '').trim() || pid}`)
            const det = await placesDetails(pid)
            progressIncDone(1)
            const d = det.result
            const parts = extractAddressParts(d)
            const now = new Date().toISOString()
            const phone = (d.formatted_phone_number ?? d.international_phone_number ?? '').trim() || null
            const url = (d.url ?? '').trim() || null
            const website = (d.website ?? '').trim() || null
            const formattedAddress = (d.formatted_address ?? r.formatted_address ?? '').trim()
            const lat = typeof d.geometry?.location?.lat === 'number' ? d.geometry?.location?.lat : typeof r.geometry?.location?.lat === 'number' ? r.geometry?.location?.lat : null
            const lng = typeof d.geometry?.location?.lng === 'number' ? d.geometry?.location?.lng : typeof r.geometry?.location?.lng === 'number' ? r.geometry?.location?.lng : null
            const types = Array.isArray(d.types) ? d.types.filter((t) => typeof t === 'string') : Array.isArray(r.types) ? r.types.filter((t) => typeof t === 'string') : []

            byPlaceId.set(pid, {
              id: newId(),
              placeId: pid,
              name: (d.name ?? r.name ?? '').trim() || 'Sem nome',
              formattedAddress,
              street: parts.street,
              number: parts.number,
              city: parts.city,
              state: parts.state,
              postalCode: parts.postalCode,
              lat,
              lng,
              types,
              segments: [seg.label],
              googleMapsUrl: url,
              phone,
              website,
              fetchedAt: now,
              status: 'novo',
              contactName: null,
              contactPhone: null,
              notes: null,
              lastVisitAt: null,
              updatedAt: now,
              createdAt: now,
            })
            await sleep(70)
          }
          pageToken = typeof res.next_page_token === 'string' ? res.next_page_token : null
          pages += 1
          if (pageToken) await sleep(2200)
        } while (pageToken && pages < 3)
      }

      progressAddTotal(1)
      progressSetMessage('Salvando no sistema…')
      upsertMany(Array.from(byPlaceId.values()))
      progressIncDone(1)
      toastNow('Itabirito importado')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao importar.')
    } finally {
      setLoading(false)
      progressEnd()
    }
  }

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase()
    const rows = state.establishments.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false
      if (onlyWithPhone && !String(e.phone ?? '').trim()) return false
      if (onlyMissingContact) {
        const hasContactName = String(e.contactName ?? '').trim()
        const hasContactPhone = String(e.contactPhone ?? '').trim()
        if (hasContactName || hasContactPhone) return false
      }
      if (!f) return true
      const hay = `${e.name} ${e.formattedAddress} ${e.street ?? ''} ${e.city ?? ''}`.toLowerCase()
      return hay.includes(f)
    })
    const sorted = [...rows]
    sorted.sort((a, b) => {
      if (sortKey === 'updated_desc') return b.updatedAt.localeCompare(a.updatedAt)
      if (sortKey === 'last_visit_desc') return String(b.lastVisitAt ?? '').localeCompare(String(a.lastVisitAt ?? ''))
      if (sortKey === 'name_asc') return a.name.localeCompare(b.name)
      if (sortKey === 'status') return a.status.localeCompare(b.status) || b.updatedAt.localeCompare(a.updatedAt)
      if (sortKey === 'street_number') {
        const sa = normKey(a.street)
        const sb = normKey(b.street)
        if (sa !== sb) return sa.localeCompare(sb)
        const na = parseStreetNumber(a.number)
        const nb = parseStreetNumber(b.number)
        if (na !== null && nb !== null && na !== nb) return na - nb
        if (na === null && nb !== null) return 1
        if (na !== null && nb === null) return -1
        return normKey(a.name).localeCompare(normKey(b.name))
      }
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    return sorted
  }, [state.establishments, filter, statusFilter, onlyWithPhone, onlyMissingContact, sortKey])

  const listNodes = useMemo(() => {
    if (sortKey !== 'street_number') return filtered.map((e) => ({ kind: 'item' as const, e }))
    const out: Array<{ kind: 'street' | 'item'; street?: string; e?: Establishment }> = []
    let lastStreet = ''
    for (const e of filtered) {
      const street = String(e.street ?? 'Sem rua').trim() || 'Sem rua'
      if (street !== lastStreet) {
        out.push({ kind: 'street', street })
        lastStreet = street
      }
      out.push({ kind: 'item', e })
    }
    return out
  }, [filtered, sortKey])

  const stats = useMemo(() => {
    const total = state.establishments.length
    const by: Record<EstablishmentStatus, number> = {
      novo: 0,
      visitado: 0,
      confirmado: 0,
      aprovado: 0,
      recusou: 0,
      sem_resposta: 0,
    }
    for (const e of state.establishments) by[e.status] = (by[e.status] ?? 0) + 1
    return { total, by }
  }, [state.establishments])

  const selected = useMemo(() => {
    const id = String(selectedPlaceId ?? '').trim()
    if (!id) return null
    return state.establishments.find((e) => e.placeId === id) ?? null
  }, [state.establishments, selectedPlaceId])

  const progressPct = progress.active && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : null
  const progressDone = progress.total > 0 ? Math.min(progress.done, progress.total) : progress.done
  const progressLabel = progress.total > 0 ? `${progressDone}/${progress.total} • ${progressPct ?? 0}%` : progressDone > 0 ? String(progressDone) : '…'

  return (
    <div className="app">
      <style>{CSS}</style>
      <div className="top">
        <div className="title">
          <h1>Prospector</h1>
          <div className="subtitle">Importe do Google Maps e acompanhe seu funil</div>
        </div>
        <div className="kpis">
          {installPrompt ? (
            <button
              className="btn"
              onClick={async () => {
                const ev = installPrompt as unknown as { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome?: string }> }
                if (!ev?.prompt) return
                await ev.prompt()
                const choice = await ev.userChoice
                setInstallPrompt(null)
                if (choice?.outcome === 'accepted') toastNow('Instalação iniciada')
              }}
            >
              Instalar
            </button>
          ) : null}
          <div className="chip">
            Total <b>{stats.total}</b>
          </div>
          <div className="chip">
            Novos <b>{stats.by.novo}</b>
          </div>
          <div className="chip">
            Visitados <b>{stats.by.visitado}</b>
          </div>
          <div className="chip">
            Confirmados <b>{stats.by.confirmado}</b>
          </div>
          <div className="chip">
            Aprovados <b>{stats.by.aprovado}</b>
          </div>
          <div className="chip">
            Recusou <b>{stats.by.recusou}</b>
          </div>
        </div>
      </div>

      <div className="layout">
        <div className="panel">
          <div className="panelHeader">
            <div className="toolbar">
              <div className="field" style={{ minWidth: 220 }}>
                <span>Buscar</span>
                <input className="input" placeholder="Nome, rua, bairro…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              </div>
              <div className="field" style={{ minWidth: 170, flex: '0 0 auto' }}>
                <span>Status</span>
                <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as EstablishmentStatus | 'all')}>
                  <option value="all">Todos</option>
                  <option value="novo">Novo</option>
                  <option value="visitado">Visitado</option>
                  <option value="confirmado">Confirmado</option>
                  <option value="aprovado">Aprovado</option>
                  <option value="recusou">Recusou</option>
                  <option value="sem_resposta">Sem resposta</option>
                </select>
              </div>
              <div className="field" style={{ minWidth: 170, flex: '0 0 auto' }}>
                <span>Ordenar</span>
                <select className="select" value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)}>
                  <option value="updated_desc">Atualizados (recentes)</option>
                  <option value="last_visit_desc">Visitados (recentes)</option>
                  <option value="name_asc">Nome (A–Z)</option>
                  <option value="status">Status</option>
                  <option value="street_number">Rua e número</option>
                </select>
              </div>
              <button className="btn" onClick={() => setOnlyWithPhone((v) => !v)}>
                {onlyWithPhone ? 'Com telefone: ON' : 'Com telefone'}
              </button>
              <button className="btn" onClick={() => setOnlyMissingContact((v) => !v)}>
                {onlyMissingContact ? 'Sem contato: ON' : 'Sem contato'}
              </button>
            </div>
            <div className="sep" />
            <div className="row">
              <div className="field" style={{ minWidth: 220 }}>
                <span>Cidade</span>
                <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex: Belo Horizonte" />
              </div>
              <div className="field" style={{ minWidth: 280 }}>
                <span>Rua (aceita várias; separe com ; ou quebra de linha)</span>
                <input className="input" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Ex: Av. Afonso Pena; Rua X" />
              </div>
              <div className="field" style={{ minWidth: 200, flex: '0 0 auto' }}>
                <span>Segmento</span>
                <select className="select" value={presetKey} onChange={(e) => setPresetKey(e.target.value)}>
                  {PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn btnPrimary" onClick={runImport} disabled={loading}>
                {loading ? 'Importando…' : 'Importar do Google Maps'}
              </button>
              <button className="btn" onClick={runImportItabirito} disabled={loading}>
                {loading ? 'Importando…' : 'Importar Itabirito (cidade inteira)'}
              </button>
              <button
                className="btn"
                onClick={() => downloadText(`prospector-${new Date().toISOString().slice(0, 10)}.json`, exportJson(state.establishments))}
              >
                Exportar JSON
              </button>
              <button
                className="btn"
                onClick={() => {
                  const csv = toCsv(state.establishments)
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `prospector-${new Date().toISOString().slice(0, 10)}.csv`
                  document.body.appendChild(a)
                  a.click()
                  a.remove()
                  URL.revokeObjectURL(url)
                }}
              >
                Exportar CSV
              </button>
              <label className="field" style={{ minWidth: 200, flex: '0 0 auto' }}>
                <span>Importar JSON</span>
                <input
                  className="input"
                  type="file"
                  accept="application/json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const text = await file.text()
                    const imported = importJson(text)
                    upsertMany(imported)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
            {progress.active ? (
              <div className="progressWrap">
                <div className="progressTop">
                  <div className="progressMsg">{progress.message || 'Importando…'}</div>
                  <div className="progressPct">{progressLabel}</div>
                </div>
                <div className="progressTrack">
                  {progressPct === null ? (
                    <div className="progressIndeterminate" />
                  ) : (
                    <div className="progressFill" style={{ width: `${progressPct}%` }} />
                  )}
                </div>
              </div>
            ) : null}
            {error ? <div style={{ marginTop: 10, color: 'rgba(254,202,202,.95)' }}>{error}</div> : null}
            {toast ? <div style={{ marginTop: 10, color: 'rgba(187,247,208,.98)' }}>{toast}</div> : null}
          </div>

          <div className="panelBody">
            <div className="listHeader">
              <div className="muted">Resultados: <b style={{ color: 'var(--text)' }}>{filtered.length}</b></div>
              <div className="muted2">Clique em um item para ver detalhes</div>
            </div>
            <div className="sep" />
            <div className="listScroll">
              <div className="list">
                {listNodes.map((n) => {
                  if (n.kind === 'street') return <div key={`street:${n.street}`} className="streetHeader">{n.street}</div>
                  const e = n.e!
                  const active = selectedPlaceId === e.placeId
                  const badge = statusColor(e.status)
                  const hasPhone = Boolean(String(e.phone ?? '').trim())
                  const hasContact = Boolean(String(e.contactName ?? '').trim() || String(e.contactPhone ?? '').trim())
                  return (
                    <div
                      key={e.placeId}
                      className={`item ${active ? 'itemActive' : ''}`}
                      onClick={() => setSelectedPlaceId(e.placeId)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') setSelectedPlaceId(e.placeId)
                      }}
                    >
                      <div className="itemTop">
                        <span className={`badge ${badge}`}>{statusLabel(e.status)}</span>
                        <div style={{ display: 'grid', gap: 3 }}>
                          <div className="itemName">{e.name}</div>
                          <div className="itemAddr">{e.formattedAddress || `${e.street ?? ''} ${e.number ?? ''}`.trim()}</div>
                        </div>
                      </div>
                      <div className="itemMeta">
                        <span>{hasPhone ? '☎️ telefone' : 'sem telefone'}</span>
                        <span>{hasContact ? '👤 contato' : 'sem contato'}</span>
                        <span>Atualizado: {formatIsoDate(e.updatedAt)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div className="title">
              <div style={{ fontWeight: 800 }}>Detalhes</div>
              {selected ? <div className="subtitle">{selected.name}</div> : <div className="subtitle">Selecione um estabelecimento</div>}
            </div>
          </div>
          <div className="panelBody">
            {!selected ? (
              <div className="hint">
                Use a lista à esquerda para selecionar um estabelecimento. Aqui você consegue:
                <div style={{ height: 8 }} />
                <div className="muted2">- mudar status (confirmado/aprovado/recusou)</div>
                <div className="muted2">- salvar contato (nome e número)</div>
                <div className="muted2">- abrir Maps / WhatsApp / copiar dados</div>
              </div>
            ) : (
              <>
                <div className="actions">
                  <span className={`badge ${statusColor(selected.status)}`}>{statusLabel(selected.status)}</span>
                  <button className="btn" onClick={() => updateStatus(selected.placeId, 'visitado')}>Visitado hoje</button>
                  <button className="btn" onClick={() => updateStatus(selected.placeId, 'confirmado')}>Confirmado</button>
                  <button className="btn" onClick={() => updateStatus(selected.placeId, 'aprovado')}>Aprovado</button>
                  <button className="btn btnDanger" onClick={() => updateStatus(selected.placeId, 'recusou')}>Recusou</button>
                  <button className="btn" onClick={() => updateStatus(selected.placeId, 'sem_resposta')}>Sem resposta</button>
                </div>

                <div className="sep" />

                <div className="split">
                  <div>
                    <div className="muted">Endereço</div>
                    <div style={{ marginTop: 6, lineHeight: 1.35 }}>{selected.formattedAddress || '-'}</div>
                    <div style={{ marginTop: 10 }} className="actions">
                      <button
                        className="btn"
                        onClick={async () => {
                          const ok = await copyText(selected.formattedAddress)
                          if (ok) toastNow('Endereço copiado')
                        }}
                      >
                        Copiar endereço
                      </button>
                      {selected.googleMapsUrl ? (
                        <a className="btn" href={selected.googleMapsUrl} target="_blank" rel="noreferrer">Abrir no Maps</a>
                      ) : null}
                      {selected.website ? (
                        <a className="btn" href={selected.website} target="_blank" rel="noreferrer">Site</a>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <div className="muted">Telefone (Google)</div>
                    <div style={{ marginTop: 6, lineHeight: 1.35 }}>{selected.phone || '-'}</div>
                    <div style={{ marginTop: 10 }} className="actions">
                      <button
                        className="btn"
                        onClick={async () => {
                          const ok = await copyText(selected.phone ?? '')
                          if (ok) toastNow('Telefone copiado')
                        }}
                      >
                        Copiar telefone
                      </button>
                      {selected.phone ? <a className="btn" href={`tel:${selected.phone}`}>Ligar</a> : null}
                      {selected.phone ? (
                        <a className="btn" href={toWhatsAppUrl(selected.phone) ?? '#'} target="_blank" rel="noreferrer">
                          WhatsApp
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="sep" />

                <div className="split">
                  <label className="field">
                    <span>Nome (contato)</span>
                    <input
                      className="input"
                      value={selected.contactName ?? ''}
                      onChange={(ev) => updateOne(selected.placeId, { contactName: ev.target.value })}
                      placeholder="Ex: Ana"
                    />
                  </label>
                  <label className="field">
                    <span>Número (contato)</span>
                    <input
                      className="input"
                      value={selected.contactPhone ?? ''}
                      onChange={(ev) => updateOne(selected.placeId, { contactPhone: ev.target.value })}
                      placeholder="Ex: (31) 9xxxx-xxxx"
                    />
                  </label>
                </div>

                <div style={{ marginTop: 10 }} className="actions">
                  <button
                    className="btn"
                    onClick={async () => {
                      const ok = await copyText(`${selected.contactName ?? ''} ${selected.contactPhone ?? ''}`.trim())
                      if (ok) toastNow('Contato copiado')
                    }}
                  >
                    Copiar contato
                  </button>
                  {selected.contactPhone ? (
                    <a className="btn" href={toWhatsAppUrl(selected.contactPhone, `Olá! Tudo bem?`) ?? '#'} target="_blank" rel="noreferrer">
                      WhatsApp (contato)
                    </a>
                  ) : null}
                </div>

                <div style={{ marginTop: 10 }}>
                  <label className="field">
                    <span>Observações</span>
                    <textarea
                      className="textarea"
                      value={selected.notes ?? ''}
                      onChange={(ev) => updateOne(selected.placeId, { notes: ev.target.value })}
                      placeholder="Ex: falou com a gerente; pediu para voltar semana que vem…"
                    />
                  </label>
                </div>

                {Array.isArray(selected.segments) && selected.segments.length > 0 ? (
                  <>
                    <div className="sep" />
                    <div>
                      <div className="muted">Segmentos (Google)</div>
                      <div style={{ marginTop: 8 }} className="actions">
                        {selected.segments.map((s) => (
                          <span key={s} className="badge gray">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}

                <div className="sep" />

                <div className="actions">
                  <button
                    className="btn"
                    onClick={async () => {
                      try {
                        const det = await placesDetails(selected.placeId)
                        const d = det.result
                        const parts = extractAddressParts(d)
                        updateOne(selected.placeId, {
                          name: (d.name ?? selected.name).trim(),
                          formattedAddress: (d.formatted_address ?? selected.formattedAddress).trim(),
                          street: parts.street,
                          number: parts.number,
                          city: parts.city,
                          state: parts.state,
                          postalCode: parts.postalCode,
                          phone: (d.formatted_phone_number ?? d.international_phone_number ?? '').trim() || null,
                          website: (d.website ?? '').trim() || null,
                          googleMapsUrl: (d.url ?? '').trim() || null,
                          fetchedAt: new Date().toISOString(),
                        })
                        toastNow('Atualizado do Google')
                      } catch {
                        toastNow('Falha ao atualizar')
                      }
                    }}
                  >
                    Atualizar do Google
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      const next = {
                        establishments: state.establishments.filter((x) => x.placeId !== selected.placeId),
                      }
                      setState(next)
                      saveState(next)
                      setSelectedPlaceId(null)
                      toastNow('Removido')
                    }}
                  >
                    Remover
                  </button>
                </div>

                <div style={{ marginTop: 10 }} className="muted2">
                  Última visita: {selected.lastVisitAt ? formatIsoDate(selected.lastVisitAt) : '-'}
                  <br />
                  Atualizado: {formatIsoDate(selected.updatedAt)}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
