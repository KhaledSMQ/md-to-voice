type Props = {
  message: string | null
}

/** Transient preview badge for zoom / seek / bookmark feedback. */
export function ReaderHud({ message }: Props) {
  if (!message) return null

  return (
    <div
      className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      <div
        key={message}
        className="reader-hud-badge rounded-full border border-white/15 bg-ink-950/90 px-3.5 py-1.5 font-mono text-[11px] tabular-nums text-ink-100 shadow-lg shadow-ink-950/40 backdrop-blur"
      >
        {message}
      </div>
    </div>
  )
}
