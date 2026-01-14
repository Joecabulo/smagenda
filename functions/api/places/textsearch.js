import { forwardJson, getApiKey, json } from '../_utils'

export async function onRequestGet(context) {
  const apiKey = getApiKey(context)
  if (!apiKey) return json({ error: 'missing_env', message: 'Defina GOOGLE_MAPS_API_KEY no Cloudflare Pages' }, { status: 500 })

  const u = new URL(context.request.url)
  const query = String(u.searchParams.get('query') ?? '').trim()
  const pageToken = String(u.searchParams.get('pagetoken') ?? '').trim()
  const location = String(u.searchParams.get('location') ?? '').trim()
  const radius = String(u.searchParams.get('radius') ?? '').trim()
  if (!query) return json({ error: 'invalid_query' }, { status: 400 })

  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('query', query)
  if (pageToken) url.searchParams.set('pagetoken', pageToken)
  if (location) url.searchParams.set('location', location)
  if (radius) url.searchParams.set('radius', radius)
  return await forwardJson(url.toString())
}
