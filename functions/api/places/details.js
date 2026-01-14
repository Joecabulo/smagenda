import { forwardJson, getApiKey, json } from '../_utils'

export async function onRequestGet(context) {
  const apiKey = getApiKey(context)
  if (!apiKey) return json({ error: 'missing_env', message: 'Defina GOOGLE_MAPS_API_KEY no Cloudflare Pages' }, { status: 500 })

  const u = new URL(context.request.url)
  const placeId = String(u.searchParams.get('place_id') ?? '').trim()
  if (!placeId) return json({ error: 'invalid_place_id' }, { status: 400 })

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('key', apiKey)
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

  return await forwardJson(url.toString())
}
