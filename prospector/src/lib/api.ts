export type PlacesTextResult = {
  place_id: string
  name: string
  formatted_address?: string
  geometry?: { location?: { lat?: number; lng?: number } }
  types?: string[]
}

export type PlacesDetails = {
  place_id: string
  name: string
  formatted_address?: string
  adr_address?: string
  url?: string
  website?: string
  formatted_phone_number?: string
  international_phone_number?: string
  geometry?: { location?: { lat?: number; lng?: number } }
  address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>
  types?: string[]
}

export type Health = {
  ok: boolean
  hasKey?: boolean
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new Error('Backend indisponível. Verifique se o Prospector está publicado e tente novamente.')
  }

  const text = await res.text()
  if (!text.trim()) {
    if (String(url).startsWith('/api')) {
      throw new Error(`Backend indisponível (${res.status}). Verifique se o Prospector está publicado e tente novamente.`)
    }
    throw new Error(`Resposta vazia do backend (${res.status}).`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new Error(`Resposta inválida do backend (${res.status}).`)
  }

  if (!res.ok) {
    const message = (() => {
      if (!parsed || typeof parsed !== 'object') return null
      const obj = parsed as Record<string, unknown>
      const m = obj.message
      return typeof m === 'string' && m.trim() ? m.trim() : null
    })()
    throw new Error(message ? `HTTP ${res.status}: ${message}` : `HTTP ${res.status}`)
  }

  return parsed as T
}

export async function geocode(address: string) {
  return await getJson<{ results: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }> }>(
    `/api/geocode?address=${encodeURIComponent(address)}`
  )
}

export async function health() {
  return await getJson<Health>('/api/health')
}

export async function placesTextSearch(input: { query: string; pageToken?: string | null; location?: string | null; radius?: number | null }) {
  const q = encodeURIComponent(input.query)
  const pt = input.pageToken ? `&pagetoken=${encodeURIComponent(input.pageToken)}` : ''
  const loc = input.location ? `&location=${encodeURIComponent(input.location)}` : ''
  const rad = input.radius && Number.isFinite(input.radius) ? `&radius=${encodeURIComponent(String(input.radius))}` : ''
  return await getJson<{ results: PlacesTextResult[]; next_page_token?: string }>(`/api/places/textsearch?query=${q}${pt}${loc}${rad}`)
}

export async function placesDetails(placeId: string) {
  return await getJson<{ result: PlacesDetails }>(`/api/places/details?place_id=${encodeURIComponent(placeId)}`)
}
