/**
 * Deterministic avatar metadata for Kokoro voice ids (`af_heart` → Heart).
 * Icons are symbolic (not photos) so the picker stays light and on-brand.
 */

export type VoiceIconKind =
  | 'heart'
  | 'star'
  | 'wave'
  | 'sun'
  | 'moon'
  | 'leaf'
  | 'flame'
  | 'spark'
  | 'orb'
  | 'bolt'
  | 'mountain'
  | 'bird'
  | 'book'
  | 'crown'
  | 'crystal'
  | 'person'

export type VoiceAvatarMeta = {
  leaf: string
  label: string
  icon: VoiceIconKind
  /** Gradient stops for the avatar disc. */
  from: string
  to: string
  accent: string
}

const ICON_BY_LEAF: Record<string, VoiceIconKind> = {
  heart: 'heart',
  alloy: 'crystal',
  aoede: 'bird',
  bella: 'spark',
  jessica: 'spark',
  kore: 'leaf',
  nicole: 'moon',
  nova: 'star',
  river: 'wave',
  sarah: 'sun',
  sky: 'sun',
  adam: 'mountain',
  echo: 'wave',
  eric: 'bolt',
  fenrir: 'flame',
  liam: 'leaf',
  michael: 'orb',
  onyx: 'crystal',
  puck: 'spark',
  santa: 'crown',
  alice: 'book',
  emma: 'leaf',
  isabella: 'crown',
  lily: 'leaf',
  daniel: 'book',
  fable: 'book',
  george: 'mountain',
  lewis: 'orb',
  dora: 'sun',
  alex: 'bolt',
  siwis: 'spark',
  alpha: 'star',
  beta: 'orb',
  omega: 'moon',
  psi: 'spark',
  sara: 'heart',
  nicola: 'person',
  gongitsune: 'bird',
  nezumi: 'spark',
  tebukuro: 'leaf',
  kumo: 'sun',
  xiaobei: 'moon',
  xiaoni: 'leaf',
  xiaoxiao: 'sun',
  xiaoyi: 'wave',
  yunjian: 'mountain',
  yunxi: 'wave',
  yunxia: 'sun',
  yunyang: 'flame',
}

const PALETTES = [
  { from: '#f59e0b', to: '#db2777', accent: '#fde68a' },
  { from: '#38bdf8', to: '#6366f1', accent: '#bae6fd' },
  { from: '#34d399', to: '#0d9488', accent: '#a7f3d0' },
  { from: '#fb7185', to: '#e11d48', accent: '#fecdd3' },
  { from: '#a78bfa', to: '#7c3aed', accent: '#ddd6fe' },
  { from: '#fbbf24', to: '#ea580c', accent: '#fde68a' },
  { from: '#2dd4bf', to: '#0284c7', accent: '#99f6e4' },
  { from: '#e879f9', to: '#db2777', accent: '#f5d0fe' },
] as const

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function voiceLeaf(id: string): string {
  const i = id.indexOf('_')
  return i >= 0 ? id.slice(i + 1) : id
}

export function voiceDisplayName(id: string, catalogName?: string): string {
  if (catalogName && catalogName.trim()) return catalogName.trim()
  const leaf = voiceLeaf(id)
  if (!leaf) return id
  return leaf.charAt(0).toUpperCase() + leaf.slice(1)
}

export function getVoiceAvatarMeta(id: string, catalogName?: string): VoiceAvatarMeta {
  const leaf = voiceLeaf(id).toLowerCase()
  const label = voiceDisplayName(id, catalogName)
  const icon = ICON_BY_LEAF[leaf] ?? 'person'
  const palette = PALETTES[hashId(id) % PALETTES.length]!
  return { leaf, label, icon, ...palette }
}
