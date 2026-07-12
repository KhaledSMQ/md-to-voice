import type { RecentsSort } from './documentStore'
import {
  BRIGHTNESS_DEFAULT,
  clampBrightness,
  isBrightnessValue,
} from './readingBrightness'
import {
  DEFAULT_READING_PRESET,
  MEASURE_WIDTH_DEFAULT,
  clampMeasureWidth,
  isReadingPresetId,
  type ReadingPresetId,
} from './readingPresets'
import {
  DEFAULT_READING_TYPOGRAPHY,
  isReadingTypographyId,
  type ReadingTypographyId,
} from './readingTypography'

const KEY = 'md-to-voice:v1:appSettings'

export const DEFAULT_APP_SETTINGS = {
  voice: 'af_heart',
  speed: 1,
  volume: 1,
  recentsSort: 'played' as RecentsSort,
  fontSize: 19,
  sidebarWidth: 320,
  controlsWidth: 280,
  /** Apple Lyrics–style centered teleprompter while speaking. Opt-in. */
  teleprompterMode: false,
  /** Preview panel reading theme (contrast / hue). */
  readingPreset: DEFAULT_READING_PRESET as ReadingPresetId,
  /** Curated reading face. */
  readingTypography: DEFAULT_READING_TYPOGRAPHY as ReadingTypographyId,
  /** Page light 0–100 (50 = authored preset balance). */
  readingBrightness: BRIGHTNESS_DEFAULT,
  /** Reading column width in `ch` (100 = fill panel). */
  measureWidth: MEASURE_WIDTH_DEFAULT,
} as const

export const VOLUME_MIN = 0
export const VOLUME_MAX = 1

export const FONT_SIZE_MIN = 14
export const FONT_SIZE_MAX = 32
export const SPEED_MIN = 0.5
export const SPEED_MAX = 1.5
export const SPEED_STEP = 0.1
export const SIDEBAR_WIDTH_MIN = 260
export const SIDEBAR_WIDTH_MAX = 720
export const CONTROLS_WIDTH_MIN = 220
export const CONTROLS_WIDTH_MAX = 480

export function clampFontSize(n: number): number {
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)))
}

export function clampSpeed(n: number): number {
  const stepped = Math.round(n * 100) / 100
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, stepped))
}

export type AppSettings = {
  voice: string
  speed: number
  volume: number
  recentsSort: RecentsSort
  fontSize: number
  sidebarWidth: number
  controlsWidth: number
  teleprompterMode: boolean
  readingPreset: ReadingPresetId
  readingTypography: ReadingTypographyId
  readingBrightness: number
  measureWidth: number
}

function clampVolume(n: number): number {
  return Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, n))
}

function clampSidebarWidth(n: number): number {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(n)))
}

function clampControlsWidth(n: number): number {
  return Math.min(CONTROLS_WIDTH_MAX, Math.max(CONTROLS_WIDTH_MIN, Math.round(n)))
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export function loadAppSettings(): AppSettings {
  if (!canUseStorage()) {
    return { ...DEFAULT_APP_SETTINGS }
  }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) {
      return { ...DEFAULT_APP_SETTINGS }
    }
    const p = JSON.parse(raw) as Record<string, unknown>
    const sp = typeof p.speed === 'number' ? p.speed : DEFAULT_APP_SETTINGS.speed
    const vol = typeof p.volume === 'number' ? p.volume : DEFAULT_APP_SETTINGS.volume
    const sortRaw = p.recentsSort
    const recentsSort =
      sortRaw === 'played' || sortRaw === 'added' || sortRaw === 'name' ? sortRaw : DEFAULT_APP_SETTINGS.recentsSort
    const fontSize =
      typeof p.fontSize === 'number' ? clampFontSize(p.fontSize) : DEFAULT_APP_SETTINGS.fontSize
    const sidebarWidth =
      typeof p.sidebarWidth === 'number'
        ? clampSidebarWidth(p.sidebarWidth)
        : DEFAULT_APP_SETTINGS.sidebarWidth
    const controlsWidth =
      typeof p.controlsWidth === 'number'
        ? clampControlsWidth(p.controlsWidth)
        : DEFAULT_APP_SETTINGS.controlsWidth
    const teleprompterMode =
      typeof p.teleprompterMode === 'boolean'
        ? p.teleprompterMode
        : DEFAULT_APP_SETTINGS.teleprompterMode
    const readingPreset = isReadingPresetId(p.readingPreset)
      ? p.readingPreset
      : DEFAULT_APP_SETTINGS.readingPreset
    const readingTypography = isReadingTypographyId(p.readingTypography)
      ? p.readingTypography
      : DEFAULT_APP_SETTINGS.readingTypography
    const readingBrightness = isBrightnessValue(p.readingBrightness)
      ? clampBrightness(p.readingBrightness)
      : DEFAULT_APP_SETTINGS.readingBrightness
    const measureWidth =
      typeof p.measureWidth === 'number'
        ? clampMeasureWidth(p.measureWidth)
        : DEFAULT_APP_SETTINGS.measureWidth
    return {
      voice: typeof p.voice === 'string' && p.voice.length > 0 ? p.voice : DEFAULT_APP_SETTINGS.voice,
      speed: clampSpeed(sp),
      volume: clampVolume(vol),
      recentsSort,
      fontSize,
      sidebarWidth,
      controlsWidth,
      teleprompterMode,
      readingPreset,
      readingTypography,
      readingBrightness,
      measureWidth,
    }
  } catch {
    return { ...DEFAULT_APP_SETTINGS }
  }
}

export function saveAppSettings(patch: Partial<AppSettings>): void {
  if (!canUseStorage()) return
  try {
    const prev = loadAppSettings()
    const next: AppSettings = {
      voice: typeof patch.voice === 'string' ? patch.voice : prev.voice,
      speed: typeof patch.speed === 'number' ? patch.speed : prev.speed,
      volume: typeof patch.volume === 'number' ? clampVolume(patch.volume) : prev.volume,
      recentsSort:
        patch.recentsSort === 'played' || patch.recentsSort === 'added' || patch.recentsSort === 'name'
          ? patch.recentsSort
          : prev.recentsSort,
      fontSize: typeof patch.fontSize === 'number' ? clampFontSize(patch.fontSize) : prev.fontSize,
      sidebarWidth:
        typeof patch.sidebarWidth === 'number' ? clampSidebarWidth(patch.sidebarWidth) : prev.sidebarWidth,
      controlsWidth:
        typeof patch.controlsWidth === 'number'
          ? clampControlsWidth(patch.controlsWidth)
          : prev.controlsWidth,
      teleprompterMode:
        typeof patch.teleprompterMode === 'boolean' ? patch.teleprompterMode : prev.teleprompterMode,
      readingPreset: isReadingPresetId(patch.readingPreset) ? patch.readingPreset : prev.readingPreset,
      readingTypography: isReadingTypographyId(patch.readingTypography)
        ? patch.readingTypography
        : prev.readingTypography,
      readingBrightness: isBrightnessValue(patch.readingBrightness)
        ? clampBrightness(patch.readingBrightness)
        : prev.readingBrightness,
      measureWidth:
        typeof patch.measureWidth === 'number' ? clampMeasureWidth(patch.measureWidth) : prev.measureWidth,
    }
    next.speed = clampSpeed(next.speed)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}
