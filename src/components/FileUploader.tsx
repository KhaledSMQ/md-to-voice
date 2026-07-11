import { useCallback, useRef, useState } from 'react'
import { MARKDOWN_FILE_ACCEPT, readMarkdownFile } from '../lib/readMarkdownFile'

type Props = {
  onFile: (name: string, text: string) => void
  /** Compact trigger button instead of the large dashed drop zone. */
  compact?: boolean
  label?: string
  className?: string
}

export function FileUploader({
  onFile,
  compact = false,
  label = 'Open file',
  className = '',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      const result = await readMarkdownFile(file)
      if (result.ok) onFile(result.name, result.text)
      else setError(result.error)
    },
    [onFile],
  )

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={MARKDOWN_FILE_ACCEPT}
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) void handleFile(file)
        e.target.value = ''
      }}
    />
  )

  if (compact) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-ink-200 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-ink-50"
        >
          {label}
        </button>
        {input}
        {error && (
          <p className="mt-1.5 text-[11px] text-red-200" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group w-full cursor-pointer rounded-xl border-2 border-dashed border-white/10 bg-white/5 p-6 text-center transition-colors hover:border-white/20"
      >
        <div className="flex flex-col items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-white/5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              className="h-5 w-5 text-ink-300"
            >
              <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path
                d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-ink-200">{label}</p>
          <p className="text-xs text-ink-400">
            or drag onto the window · .md, .markdown, .txt
          </p>
        </div>
      </button>
      {input}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}
    </div>
  )
}
