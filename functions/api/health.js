import { getApiKey, json } from './_utils'

export async function onRequestGet(context) {
  const apiKey = getApiKey(context)
  return json({ ok: true, hasKey: Boolean(apiKey) })
}
