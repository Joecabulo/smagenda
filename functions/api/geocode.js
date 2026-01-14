import { forwardJson, getApiKey, json } from './_utils'

export async function onRequestGet(context) {
  const apiKey = getApiKey(context)
  if (!apiKey) return json({ error: 'missing_env', message: 'Defina GOOGLE_MAPS_API_KEY no Cloudflare Pages' }, { status: 500 })

  const address = String(context?.request?.url ? new URL(context.request.url).searchParams.get('address') : '').trim()
  if (!address) return json({ error: 'invalid_address' }, { status: 400 })

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('address', address)
  return await forwardJson(url.toString())
}
