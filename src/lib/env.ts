export function getRequiredEnv(name: string): string {
  const value = import.meta.env[name] as string | undefined
  if (!value) throw new Error(`Missing env var: ${name}`)
  return value
}

export function getOptionalEnv(name: string): string | null {
  const raw = import.meta.env[name] as string | undefined
  const value = String(raw ?? '').trim()
  return value ? value : null
}

export type EnvCheck = { ok: true; values: Record<string, string> } | { ok: false; missing: string[] }

export function checkRequiredEnvs(names: string[]): EnvCheck {
  const values: Record<string, string> = {}
  const missing: string[] = []

  for (const name of names) {
    const value = import.meta.env[name] as string | undefined
    if (!value) {
      missing.push(name)
      continue
    }
    values[name] = value
  }

  if (missing.length > 0) return { ok: false, missing }
  return { ok: true, values }
}
