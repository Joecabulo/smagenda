export function json(data, init) {
  const status = init?.status ?? 200
  const headers = new Headers(init?.headers)
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(data), { status, headers })
}

export function getApiKey(context) {
  return String(context?.env?.GOOGLE_MAPS_API_KEY ?? '').trim()
}

export async function forwardJson(url) {
  const upstream = await fetch(url)
  const text = await upstream.text()
  let parsed
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = { raw: text }
  }
  return json(parsed, { status: upstream.status })
}
