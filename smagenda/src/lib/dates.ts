export function toISODate(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatBRDate(value: Date): string {
  return value.toLocaleDateString('pt-BR')
}

export function formatBRMoney(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function parseTimeToMinutes(value: string): number {
  const [hh, mm] = value.split(':').map((v) => Number(v))
  return hh * 60 + mm
}

export function minutesToTime(value: number): string {
  const hh = Math.floor(value / 60)
  const mm = value % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function normalizeTimeHHMM(value: string): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const parts = raw.split(':')
  if (parts.length < 2) return raw
  const hh = String(parts[0] ?? '').padStart(2, '0')
  const mm = String(parts[1] ?? '').padStart(2, '0')
  return `${hh}:${mm}`
}
