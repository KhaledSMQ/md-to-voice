import { useCallback, useEffect, useRef, useState } from 'react'
import { MarkdownReader, type MarkdownReaderHandle } from './MarkdownReader'
import { Controls } from './Controls'
import { usePlayer } from '../lib/usePlayer'
import type { Chunk } from '../lib/chunker'
import type { WordToken } from '../lib/tokenize'

type Props = {
  markdown: string
  sourceName: string
}

const DEFAULT_VOICE = 'af_heart'

export function Reader({ markdown, sourceName }: Props) {
  const readerRef = useRef<MarkdownReaderHandle>(null)
  const [docInfo, setDocInfo] = useState<{ words: WordToken[]; chunks: Chunk[] }>({
    words: [],
    chunks: [],
  })
  const [voice, setVoice] = useState<string>(DEFAULT_VOICE)
  const [speed, setSpeed] = useState<number>(1)

  const onActiveWord = useCallback((wIdx: number) => {
    const handle = readerRef.current
    if (!handle) return
    handle.setActive(wIdx)
    if (wIdx >= 0) handle.scrollToActive()
  }, [])

  const player = usePlayer({
    chunks: docInfo.chunks,
    voice,
    speed,
    onActiveWord,
  })

  const playerRef = useRef(player)
  playerRef.current = player

  const onWordClick = useCallback((wIdx: number) => {
    void playerRef.current.seekToWord(wIdx)
  }, [])

  useEffect(() => {
    readerRef.current?.reset()
  }, [markdown])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      }
      if (e.code === 'Space') {
        e.preventDefault()
        playerRef.current.toggle()
      } else if (e.code === 'Escape') {
        playerRef.current.stop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <MarkdownReader
        markdown={markdown}
        onParsed={setDocInfo}
        onWordClick={onWordClick}
        ref={readerRef}
      />

      <aside className="space-y-3">
        <Controls
          status={player.status}
          device={player.device}
          voices={player.voices}
          voice={voice}
          speed={speed}
          progress={player.progress}
          error={player.error}
          totalChunks={docInfo.chunks.length}
          currentChunkIdx={player.currentChunkIdx}
          onVoice={setVoice}
          onSpeed={setSpeed}
          onPlay={player.play}
          onPause={player.pause}
          onStop={player.stop}
        />

        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-ink-400">Source</span>
            <span className="font-mono text-ink-200 truncate max-w-[180px]" title={sourceName}>
              {sourceName}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-400">Words</span>
            <span className="font-mono text-ink-200">{docInfo.words.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-400">Chunks</span>
            <span className="font-mono text-ink-200">{docInfo.chunks.length}</span>
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-[11px] text-ink-400 leading-relaxed">
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-ink-200">Space</kbd>{' '}
          play / pause ·{' '}
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-ink-200">Esc</kbd>{' '}
          stop
        </div>
      </aside>
    </div>
  )
}
