import { useCallback, useEffect, useRef, useState } from 'react'
import { dragEventHasFiles, readMarkdownFile } from '../lib/readMarkdownFile'

type Props = {
  onFile: (name: string, text: string) => void
  onError?: (message: string) => void
}

/**
 * Full-viewport drop target. Appears only while a file drag is held over the window.
 */
export function FileDropOverlay({ onFile, onError }: Props) {
  const [active, setActive] = useState(false)
  const depthRef = useRef(0)

  const reset = useCallback(() => {
    depthRef.current = 0
    setActive(false)
  }, [])

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!dragEventHasFiles(e)) return
      e.preventDefault()
      depthRef.current += 1
      setActive(true)
    }
    const onDragLeave = (e: DragEvent) => {
      if (!dragEventHasFiles(e)) return
      depthRef.current = Math.max(0, depthRef.current - 1)
      if (depthRef.current === 0) setActive(false)
    }
    const onDragOver = (e: DragEvent) => {
      if (!dragEventHasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e: DragEvent) => {
      if (!dragEventHasFiles(e)) return
      e.preventDefault()
      reset()
      const file = e.dataTransfer?.files?.[0]
      if (!file) return
      void readMarkdownFile(file).then((result) => {
        if (result.ok) onFile(result.name, result.text)
        else onError?.(result.error)
      })
    }
    const onDragEnd = () => reset()

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragend', onDragEnd)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', onDragEnd)
    }
  }, [onFile, onError, reset])

  if (!active) return null

  return (
    <div
      className="file-drop-overlay fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/75 backdrop-blur-sm"
      aria-hidden
    >
      <div className="mx-4 flex max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-amber-300/50 bg-ink-900/90 px-10 py-12 text-center shadow-2xl shadow-ink-950/60">
        <div className="grid h-14 w-14 place-items-center rounded-xl bg-amber-300/15 text-amber-200">
          <svg
            viewBox="0 0 24 24"
            width={28}
            height={28}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden
          >
            <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path
              d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="text-lg font-semibold text-ink-50">Drop to open</p>
        <p className="text-sm text-ink-400">Markdown · .md · .markdown · .txt</p>
      </div>
    </div>
  )
}
