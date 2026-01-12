import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const API_KEY = String(process.env.GOOGLE_MAPS_API_KEY ?? '').trim()
if (!API_KEY) {
  console.error('Defina GOOGLE_MAPS_API_KEY no ambiente antes de rodar este script.')
  process.exit(1)
}

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchJson(url) {
  const res = await fetch(url)
  const text = await res.text()
  if (!text.trim()) throw new Error(`Resposta vazia (${res.status}) em ${url}`)
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`JSON inválido (${res.status}) em ${url}`)
  }
  if (!res.ok) {
    const msg = parsed && typeof parsed === 'object' && typeof parsed.message === 'string' ? parsed.message : null
    throw new Error(msg ? `HTTP ${res.status}: ${msg}` : `HTTP ${res.status}`)
  }
  return parsed
}

async function geocode(address) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('key', API_KEY)
  url.searchParams.set('address', address)
  const body = await fetchJson(url.toString())
  const loc = body?.results?.[0]?.geometry?.location
  const lat = typeof loc?.lat === 'number' ? loc.lat : null
  const lng = typeof loc?.lng === 'number' ? loc.lng : null
  return { lat, lng }
}

async function textSearch({ query, location, radius, pageToken }) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
  url.searchParams.set('key', API_KEY)
  url.searchParams.set('query', query)
  if (location) url.searchParams.set('location', location)
  if (radius) url.searchParams.set('radius', String(radius))
  if (pageToken) url.searchParams.set('pagetoken', pageToken)
  return await fetchJson(url.toString())
}

async function details(placeId) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('key', API_KEY)
  url.searchParams.set('place_id', placeId)
  url.searchParams.set(
    'fields',
    [
      'place_id',
      'name',
      'formatted_address',
      'address_component',
      'geometry',
      'types',
      'url',
      'website',
      'formatted_phone_number',
      'international_phone_number',
    ].join(',')
  )
  return await fetchJson(url.toString())
}

function findComponent(components, type) {
  const arr = Array.isArray(components) ? components : []
  for (const c of arr) {
    const t = Array.isArray(c?.types) ? c.types : []
    if (t.includes(type)) return c
  }
  return null
}

function extractAddressParts(placeDetails) {
  const components = placeDetails?.address_components
  const route = findComponent(components, 'route')
  const streetNumber = findComponent(components, 'street_number')
  const city = findComponent(components, 'administrative_area_level_2') ?? findComponent(components, 'locality')
  const state = findComponent(components, 'administrative_area_level_1')
  const postalCode = findComponent(components, 'postal_code')

  return {
    street: String(route?.long_name ?? '').trim() || null,
    number: String(streetNumber?.long_name ?? '').trim() || null,
    city: String(city?.long_name ?? '').trim() || null,
    state: String(state?.short_name ?? state?.long_name ?? '').trim() || null,
    postalCode: String(postalCode?.long_name ?? '').trim() || null,
  }
}

function newId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseStreetNumber(value) {
  const s = String(value ?? '').trim()
  if (!s) return null
  const m = s.match(/\d+/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

function normKey(s) {
  return String(s ?? '').trim().toLowerCase()
}

function sortEstablishments(a, b) {
  const streetA = normKey(a.street)
  const streetB = normKey(b.street)
  if (streetA !== streetB) return streetA.localeCompare(streetB)
  const na = parseStreetNumber(a.number)
  const nb = parseStreetNumber(b.number)
  if (na !== null && nb !== null && na !== nb) return na - nb
  if (na === null && nb !== null) return 1
  if (na !== null && nb === null) return -1
  return normKey(a.name).localeCompare(normKey(b.name))
}

function groupByStreetAndSegment(rows) {
  const grouped = {}
  for (const e of rows) {
    const street = String(e.street ?? 'Sem rua').trim() || 'Sem rua'
    const segments = Array.isArray(e.segments) && e.segments.length > 0 ? e.segments : ['Sem segmento']
    if (!grouped[street]) grouped[street] = {}
    for (const s of segments) {
      if (!grouped[street][s]) grouped[street][s] = []
      grouped[street][s].push(e)
    }
  }

  const streets = Object.keys(grouped).sort((a, b) => normKey(a).localeCompare(normKey(b)))
  const out = []
  for (const street of streets) {
    const segs = grouped[street]
    const segKeys = Object.keys(segs).sort((a, b) => normKey(a).localeCompare(normKey(b)))
    out.push({
      street,
      segments: segKeys.map((k) => ({ segment: k, count: segs[k].length, placeIds: segs[k].map((x) => x.placeId) })),
    })
  }
  return out
}

async function main() {
  console.log(`Geocodificando centro de ${CITY_QUERY}...`)
  const center = await geocode(CITY_QUERY)
  const location = center.lat !== null && center.lng !== null ? `${center.lat},${center.lng}` : null
  const radius = 14000

  const byPlaceId = new Map()

  for (const seg of SEGMENTS) {
    const q = `${seg.query} ${CITY_QUERY}`
    console.log(`Buscando: ${q}`)

    let pageToken = null
    let pages = 0
    do {
      const search = await textSearch({ query: q, location, radius, pageToken })
      const results = Array.isArray(search?.results) ? search.results : []

      for (const r of results) {
        const placeId = String(r?.place_id ?? '').trim()
        if (!placeId) continue

        const existing = byPlaceId.get(placeId)
        if (existing) {
          const nextSegs = new Set([...(existing.segments ?? []), seg.label])
          existing.segments = Array.from(nextSegs)
          byPlaceId.set(placeId, existing)
          continue
        }

        const det = await details(placeId)
        const d = det?.result ?? null
        if (!d || typeof d !== 'object') continue

        const now = new Date().toISOString()
        const parts = extractAddressParts(d)
        const phone = String(d.formatted_phone_number ?? d.international_phone_number ?? '').trim() || null
        const url = String(d.url ?? '').trim() || null
        const website = String(d.website ?? '').trim() || null
        const formattedAddress = String(d.formatted_address ?? r.formatted_address ?? '').trim()
        const lat = typeof d.geometry?.location?.lat === 'number' ? d.geometry.location.lat : typeof r.geometry?.location?.lat === 'number' ? r.geometry.location.lat : null
        const lng = typeof d.geometry?.location?.lng === 'number' ? d.geometry.location.lng : typeof r.geometry?.location?.lng === 'number' ? r.geometry.location.lng : null
        const types = Array.isArray(d.types) ? d.types.filter((t) => typeof t === 'string') : Array.isArray(r.types) ? r.types.filter((t) => typeof t === 'string') : []

        const row = {
          id: newId(),
          placeId,
          name: String(d.name ?? r.name ?? '').trim() || 'Sem nome',
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
        }

        byPlaceId.set(placeId, row)
        await sleep(70)
      }

      pageToken = typeof search?.next_page_token === 'string' ? search.next_page_token : null
      pages += 1
      if (pageToken) await sleep(2300)
    } while (pageToken && pages < 3)
  }

  const establishments = Array.from(byPlaceId.values()).sort(sortEstablishments)
  const grouped = groupByStreetAndSegment(establishments)

  const out = {
    city: 'Itabirito',
    state: 'MG',
    generatedAt: new Date().toISOString(),
    total: establishments.length,
    grouped,
    establishments,
  }

  const dir = join(process.cwd(), 'data')
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, 'itabirito.prospector.json')
  await writeFile(filePath, JSON.stringify(out, null, 2), 'utf-8')
  console.log(`Arquivo gerado: ${filePath}`)
  console.log(`Total de estabelecimentos (deduplicado): ${establishments.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

