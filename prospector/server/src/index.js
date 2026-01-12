import express from 'express'
import cors from 'cors'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
app.use(cors({ origin: true }))

async function loadEnvFileIfPresent(filePath) {
  let raw
  try {
    raw = await readFile(filePath, 'utf-8')
  } catch {
    return
  }
  for (const line of raw.split(/\r?\n/g)) {
    const s = line.trim()
    if (!s || s.startsWith('#')) continue
    const idx = s.indexOf('=')
    if (idx <= 0) continue
    const key = s.slice(0, idx).trim()
    let value = s.slice(idx + 1).trim()
    if (!key) continue
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] == null) process.env[key] = value
  }
}

const here = dirname(fileURLToPath(import.meta.url))
await loadEnvFileIfPresent(join(here, '..', '.env'))
await loadEnvFileIfPresent(join(here, '..', '..', '.env'))
await loadEnvFileIfPresent(join(process.cwd(), '.env'))

const apiKey = String(process.env.GOOGLE_MAPS_API_KEY ?? '').trim()

function requireKey(res) {
  if (apiKey) return true
  res.status(500).json({ error: 'missing_env', message: 'Defina GOOGLE_MAPS_API_KEY no server/.env' })
  return false
}

async function forwardJson(url, res) {
  const upstream = await fetch(url)
  const text = await upstream.text()
  let parsed
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = { raw: text }
  }
  res.status(upstream.status).json(parsed)
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasKey: Boolean(apiKey) })
})

app.get('/api/geocode', async (req, res) => {
  if (!requireKey(res)) return
  const address = String(req.query.address ?? '').trim()
  if (!address) {
    res.status(400).json({ error: 'invalid_address' })
    return
  }
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('address', address)
  await forwardJson(url.toString(), res)
})

app.get('/api/places/textsearch', async (req, res) => {
  if (!requireKey(res)) return
  const query = String(req.query.query ?? '').trim()
  const pageToken = String(req.query.pagetoken ?? '').trim()
  const location = String(req.query.location ?? '').trim()
  const radius = String(req.query.radius ?? '').trim()
  if (!query) {
    res.status(400).json({ error: 'invalid_query' })
    return
  }
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('query', query)
  if (pageToken) url.searchParams.set('pagetoken', pageToken)
  if (location) url.searchParams.set('location', location)
  if (radius) url.searchParams.set('radius', radius)
  await forwardJson(url.toString(), res)
})

app.get('/api/places/details', async (req, res) => {
  if (!requireKey(res)) return
  const placeId = String(req.query.place_id ?? '').trim()
  if (!placeId) {
    res.status(400).json({ error: 'invalid_place_id' })
    return
  }
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
  await forwardJson(url.toString(), res)
})

const port = Number(process.env.PORT ?? '8787')
app.listen(port, () => {
  console.log(`prospector-server listening on http://localhost:${port}`)
})
