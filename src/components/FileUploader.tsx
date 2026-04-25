import { useCallback, useRef, useState } from 'react'

const ACCEPT = '.md,.markdown,.mdx,.txt,text/markdown,text/plain'
const MAX_BYTES = 5 * 1024 * 1024

type Props = {
  onFile: (name: string, text: string) => void
}

export function FileUploader({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      if (file.size > MAX_BYTES) {
        setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`)
        return
      }
      try {
        const text = await file.text()
        onFile(file.name, text)
      } catch (err) {
        setError(`Failed to read file: ${(err as Error).message}`)
      }
    },
    [onFile],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files?.[0]
      if (file) void handleFile(file)
    },
    [handleFile],
  )

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        className={`group cursor-pointer rounded-xl border-2 border-dashed p-6 transition-colors ${
          isDragging
            ? 'border-amber-300 bg-amber-300/5'
            : 'border-white/10 bg-white/5 hover:border-white/20'
        }`}
      >
        <div className="flex flex-col items-center text-center gap-2">
          <div className="h-10 w-10 rounded-lg bg-white/5 grid place-items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              className="h-5 w-5 text-ink-300"
            >
              <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm text-ink-200 font-medium">Drop a Markdown file</p>
          <p className="text-xs text-ink-400">
            or <span className="underline decoration-dotted">click to browse</span> · .md, .markdown, .txt
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}
    </div>
  )
}
