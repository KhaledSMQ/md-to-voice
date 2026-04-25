const KEY = 'md-to-voice:v1:appSettings'

export const DEFAULT_APP_SETTINGS = {
  voice: 'af_heart',
  speed: 1,
} as const

export type AppSettings = {
  voice: string
  speed: number
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export function loadAppSettings(): AppSettings {
  if (!canUseStorage()) {
    return { voice: DEFAULT_APP_SETTINGS.voice, speed: DEFAULT_APP_SETTINGS.speed }
  }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) {
      return { voice: DEFAULT_APP_SETTINGS.voice, speed: DEFAULT_APP_SETTINGS.speed }
    }
    const p = JSON.parse(raw) as Record<string, unknown>
    const sp = typeof p.speed === 'number' ? p.speed : DEFAULT_APP_SETTINGS.speed
    return {
      voice: typeof p.voice === 'string' && p.voice.length > 0 ? p.voice : DEFAULT_APP_SETTINGS.voice,
      speed: Math.min(1.5, Math.max(0.5, sp)),
    }
  } catch {
    return { voice: DEFAULT_APP_SETTINGS.voice, speed: DEFAULT_APP_SETTINGS.speed }
  }
}

export function saveAppSettings(patch: Partial<AppSettings>): void {
  if (!canUseStorage()) return
  try {
    const prev = loadAppSettings()
    const next: AppSettings = {
      voice: typeof patch.voice === 'string' ? patch.voice : prev.voice,
      speed: typeof patch.speed === 'number' ? patch.speed : prev.speed,
    }
    if (next.speed < 0.5) next.speed = 0.5
    if (next.speed > 1.5) next.speed = 1.5
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}
