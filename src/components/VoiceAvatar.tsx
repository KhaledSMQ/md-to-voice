import type { VoiceIconKind } from '../lib/voiceAvatars'

type Props = {
  icon: VoiceIconKind
  from: string
  to: string
  accent: string
  label: string
  /** Compact = carousel side slides; default = selected size. */
  size?: 'md' | 'lg'
  selected?: boolean
  language?: string
}

export function VoiceAvatar({
  icon,
  from,
  to,
  accent,
  label,
  size = 'lg',
  selected = false,
  language,
}: Props) {
  const dim = size === 'lg' ? 'h-14 w-14' : 'h-11 w-11'
  const badge = languageBadge(language)

  return (
    <span
      className={`voice-avatar relative inline-flex shrink-0 items-center justify-center rounded-full ${dim} ${
        selected ? 'voice-avatar-selected' : ''
      }`}
      title={label}
      style={{
        background: `linear-gradient(145deg, ${from} 0%, ${to} 100%)`,
        boxShadow: selected
          ? `0 0 0 2px rgba(15,23,42,0.9), 0 0 0 4px ${accent}, 0 8px 24px rgba(0,0,0,0.35)`
          : `0 4px 14px rgba(0,0,0,0.28)`,
      }}
      aria-hidden
    >
      <span className="text-white drop-shadow-sm">
        <VoiceIcon kind={icon} />
      </span>
      {badge && (
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full border border-ink-950/80 bg-ink-900 px-1 py-px text-[8px] font-semibold uppercase leading-none tracking-wide text-ink-200">
          {badge}
        </span>
      )}
    </span>
  )
}

function languageBadge(language?: string): string | null {
  if (!language) return null
  const l = language.toLowerCase()
  if (l === 'en-us' || l === 'en_us') return 'US'
  if (l === 'en-gb' || l === 'en_gb') return 'UK'
  if (l.startsWith('en')) return 'EN'
  if (l.startsWith('es')) return 'ES'
  if (l.startsWith('fr')) return 'FR'
  if (l.startsWith('ja') || l.startsWith('jp')) return 'JA'
  if (l.startsWith('zh') || l.startsWith('cmn')) return 'ZH'
  if (l.startsWith('hi')) return 'HI'
  if (l.startsWith('it')) return 'IT'
  if (l.startsWith('pt')) return 'PT'
  return language.slice(0, 2).toUpperCase()
}

function VoiceIcon({ kind }: { kind: VoiceIconKind }) {
  const props = {
    viewBox: '0 0 24 24',
    width: 22,
    height: 22,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.85,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (kind) {
    case 'heart':
      return (
        <svg {...props}>
          <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'star':
      return (
        <svg {...props}>
          <path d="m12 3 2.4 5.4 5.9.6-4.5 3.9 1.4 5.7L12 15.8 6.8 18.6l1.4-5.7L3.7 9l5.9-.6L12 3z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'wave':
      return (
        <svg {...props}>
          <path d="M3 14c2-3 3.5-4 5-4s3 2 5 2 3.5-2 5-2 3 1 3 1" />
          <path d="M3 19c2-3 3.5-4 5-4s3 2 5 2 3.5-2 5-2 3 1 3 1" />
        </svg>
      )
    case 'sun':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
          <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
        </svg>
      )
    case 'moon':
      return (
        <svg {...props}>
          <path d="M19 13.5A7.5 7.5 0 1 1 10.5 5 6 6 0 0 0 19 13.5z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'leaf':
      return (
        <svg {...props}>
          <path d="M5 19c8-1 12-7 14-14-7 2-13 6-14 14z" fill="currentColor" stroke="none" />
          <path d="M5 19c3-4 7-7 12-9" stroke="rgba(0,0,0,0.25)" />
        </svg>
      )
    case 'flame':
      return (
        <svg {...props}>
          <path d="M12 3c2 3 5 4.5 5 9a5 5 0 1 1-10 0c0-2.5 1.5-4 3-5.5C11 8 11.5 9.5 12 3z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'spark':
      return (
        <svg {...props}>
          <path d="M12 3v6M12 15v6M3 12h6M15 12h6M6.2 6.2l4.2 4.2M13.6 13.6l4.2 4.2M17.8 6.2l-4.2 4.2M10.4 13.6l-4.2 4.2" />
        </svg>
      )
    case 'orb':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'bolt':
      return (
        <svg {...props}>
          <path d="M13 3 6 13h5l-1 8 8-12h-5l0-6z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'mountain':
      return (
        <svg {...props}>
          <path d="m3 18 6-10 3 5 3-4 6 9H3z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'bird':
      return (
        <svg {...props}>
          <path d="M4 14c4-1 6-4 7-7 2 3 5 5 9 5-3 2-5 5-5 8-3-2-6-3-11-6z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'book':
      return (
        <svg {...props}>
          <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15.5H7.5A2.5 2.5 0 0 0 5 21V5.5z" />
          <path d="M5 18.5A2.5 2.5 0 0 1 7.5 16H19" />
        </svg>
      )
    case 'crown':
      return (
        <svg {...props}>
          <path d="m4 16 2-9 4 4 2-6 2 6 4-4 2 9H4z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'crystal':
      return (
        <svg {...props}>
          <path d="m12 3 6 7-6 11L6 10l6-7z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'person':
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="9" r="3.2" fill="currentColor" stroke="none" />
          <path d="M6.5 19c1.2-3.2 3-4.5 5.5-4.5S16.3 15.8 17.5 19" />
        </svg>
      )
  }
}
