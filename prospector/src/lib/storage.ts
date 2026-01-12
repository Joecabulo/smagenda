import type { Establishment } from '../types'

const STORAGE_KEY = 'prospector:v1'

type Persisted = {
  establishments: Establishment[]
}

export function loadState(): Persisted {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return { establishments: [] }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return { establishments: [] }
    const obj = parsed as Record<string, unknown>
    const rows = obj.establishments
    if (!Array.isArray(rows)) return { establishments: [] }
    return { establishments: rows as Establishment[] }
  } catch {
    return { establishments: [] }
  }
}

export function saveState(state: Persisted) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function exportJson(establishments: Establishment[]) {
  return JSON.stringify({ establishments, exportedAt: new Date().toISOString() }, null, 2)
}

export function importJson(json: string): Establishment[] {
  const parsed = JSON.parse(json) as unknown
  if (!parsed || typeof parsed !== 'object') return []
  const obj = parsed as Record<string, unknown>
  const rows = obj.establishments
  if (!Array.isArray(rows)) return []
  return rows as Establishment[]
}
