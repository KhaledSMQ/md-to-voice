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
  DEFAULT_READING_LEADING,
  DEFAULT_READING_PARAGRAPH,
  DEFAULT_READING_TRACKING,
  isReadingLeadingId,
  isReadingParagraphId,
  isReadingTrackingId,
  type ReadingLeadingId,
  type ReadingParagraphId,
  type ReadingTrackingId,
} from './readingRhythm'
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
  /** Start playback automatically after pasting markdown. */
  autoplayOnPaste: true,
  /** Collapse header tools + library shelf while playing/paused. */
  autoHideOnPlay: true,
  /** Enter focus mode automatically when playback starts. */
  autoFocusOnPlay: false,
  /** Preview panel reading theme (contrast / hue). */
  readingPreset: DEFAULT_READING_PRESET as ReadingPresetId,
  /** Curated reading face. */
  readingTypography: DEFAULT_READING_TYPOGRAPHY as ReadingTypographyId,
  /** Page light 0–100 (50 = authored preset balance). */
  readingBrightness: BRIGHTNESS_DEFAULT,
  /** Reading column width in `ch` (100 = fill panel). */
  measureWidth: MEASURE_WIDTH_DEFAULT,
  /** Line height preset (auto = face default). */
  readingLeading: DEFAULT_READING_LEADING as ReadingLeadingId,
  /** Letter-spacing preset (auto = face default). */
  readingTracking: DEFAULT_READING_TRACKING as ReadingTrackingId,
  /** Paragraph gap preset. */
  readingParagraph: DEFAULT_READING_PARAGRAPH as ReadingParagraphId,
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
  autoplayOnPaste: boolean
  autoHideOnPlay: boolean
  autoFocusOnPlay: boolean
  readingPreset: ReadingPresetId
  readingTypography: ReadingTypographyId
  readingBrightness: number
  measureWidth: number
  readingLeading: ReadingLeadingId
  readingTracking: ReadingTrackingId
  readingParagraph: ReadingParagraphId
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
      sortRaw === 'played' || sortRaw === 'added' || sortRaw === 'name'
        ? sortRaw
        : DEFAULT_APP_SETTINGS.recentsSort
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
    const autoplayOnPaste =
      typeof p.autoplayOnPaste === 'boolean'
        ? p.autoplayOnPaste
        : DEFAULT_APP_SETTINGS.autoplayOnPaste
    const autoHideOnPlay =
      typeof p.autoHideOnPlay === 'boolean'
        ? p.autoHideOnPlay
        : DEFAULT_APP_SETTINGS.autoHideOnPlay
    const autoFocusOnPlay =
      typeof p.autoFocusOnPlay === 'boolean'
        ? p.autoFocusOnPlay
        : DEFAULT_APP_SETTINGS.autoFocusOnPlay
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
    const readingLeading = isReadingLeadingId(p.readingLeading)
      ? p.readingLeading
      : DEFAULT_APP_SETTINGS.readingLeading
    const readingTracking = isReadingTrackingId(p.readingTracking)
      ? p.readingTracking
      : DEFAULT_APP_SETTINGS.readingTracking
    const readingParagraph = isReadingParagraphId(p.readingParagraph)
      ? p.readingParagraph
      : DEFAULT_APP_SETTINGS.readingParagraph
    return {
      voice: typeof p.voice === 'string' && p.voice.length > 0 ? p.voice : DEFAULT_APP_SETTINGS.voice,
      speed: clampSpeed(sp),
      volume: clampVolume(vol),
      recentsSort,
      fontSize,
      sidebarWidth,
      controlsWidth,
      teleprompterMode,
      autoplayOnPaste,
      autoHideOnPlay,
      autoFocusOnPlay,
      readingPreset,
      readingTypography,
      readingBrightness,
      measureWidth,
      readingLeading,
      readingTracking,
      readingParagraph,
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
        patch.recentsSort === 'played' ||
        patch.recentsSort === 'added' ||
        patch.recentsSort === 'name'
          ? patch.recentsSort
          : prev.recentsSort,
      fontSize: typeof patch.fontSize === 'number' ? clampFontSize(patch.fontSize) : prev.fontSize,
      sidebarWidth:
        typeof patch.sidebarWidth === 'number'
          ? clampSidebarWidth(patch.sidebarWidth)
          : prev.sidebarWidth,
      controlsWidth:
        typeof patch.controlsWidth === 'number'
          ? clampControlsWidth(patch.controlsWidth)
          : prev.controlsWidth,
      teleprompterMode:
        typeof patch.teleprompterMode === 'boolean' ? patch.teleprompterMode : prev.teleprompterMode,
      autoplayOnPaste:
        typeof patch.autoplayOnPaste === 'boolean' ? patch.autoplayOnPaste : prev.autoplayOnPaste,
      autoHideOnPlay:
        typeof patch.autoHideOnPlay === 'boolean' ? patch.autoHideOnPlay : prev.autoHideOnPlay,
      autoFocusOnPlay:
        typeof patch.autoFocusOnPlay === 'boolean' ? patch.autoFocusOnPlay : prev.autoFocusOnPlay,
      readingPreset: isReadingPresetId(patch.readingPreset)
        ? patch.readingPreset
        : prev.readingPreset,
      readingTypography: isReadingTypographyId(patch.readingTypography)
        ? patch.readingTypography
        : prev.readingTypography,
      readingBrightness: isBrightnessValue(patch.readingBrightness)
        ? clampBrightness(patch.readingBrightness)
        : prev.readingBrightness,
      measureWidth:
        typeof patch.measureWidth === 'number'
          ? clampMeasureWidth(patch.measureWidth)
          : prev.measureWidth,
      readingLeading: isReadingLeadingId(patch.readingLeading)
        ? patch.readingLeading
        : prev.readingLeading,
      readingTracking: isReadingTrackingId(patch.readingTracking)
        ? patch.readingTracking
        : prev.readingTracking,
      readingParagraph: isReadingParagraphId(patch.readingParagraph)
        ? patch.readingParagraph
        : prev.readingParagraph,
    }
    next.speed = clampSpeed(next.speed)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}
