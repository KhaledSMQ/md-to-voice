import { useCallback, useEffect, useRef, useState } from 'react'
import { Reader } from './components/Reader'
import { FileDropOverlay } from './components/FileDropOverlay'
import {
  StorageError,
  createDocument,
  deleteDocument,
  getDocumentById,
  listAllDocuments,
  loadInitialDocument,
  putDocument,
  putResumeOnly,
  setActiveId,
  touchPlayed,
  type StoredDocument,
} from './lib/documentStore'
import {
  loadAppSettings,
  saveAppSettings,
} from './lib/appSettings'
import { useParsedDocument, wordMetaFromParsed } from './lib/useParsedDocument'

const SAMPLE_MD = `# Welcome to **md to voice**

Drop a .md file onto the window, paste with **⌘V**, or use the **pen** to edit in place. Then press **Play** to hear it read aloud while each word lights up in sync.

## How it works

1. The file is parsed and rendered as Markdown.
2. Every word is tagged with a global index.
3. Sentences stream one-by-one to the in-browser **Kokoro TTS** model.
4. While each sentence plays, the active word is highlighted in real time using a char-weighted timing curve (an idea borrowed from the *Pretext* karaoke teleprompter).

> Privacy first: nothing leaves your device. The 82M-parameter model runs locally via WebGPU or WebAssembly.

Your documents and **name** are saved in the browser. On return, the **last one you played** (or most recently saved) opens automatically.

Try changing the voice on the left, then hit play. You can pause with the **spacebar** at any time.
`

const SAVE_MS = 400
const LAYOUT_SAVE_MS = 400

type BootState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | {
      phase: 'ready'
      docId: string
      title: string
      markdown: string
      openResume: number
      documents: StoredDocument[]
    }

export default function App() {
  const [boot, setBoot] = useState<BootState>({ phase: 'loading' })
  const [controlsWidth, setControlsWidth] = useState(() => loadAppSettings().controlsWidth)
  const [fontSize, setFontSize] = useState(() => loadAppSettings().fontSize)
  const [readingPreset, setReadingPreset] = useState(() => loadAppSettings().readingPreset)
  const [readingTypography, setReadingTypography] = useState(() => loadAppSettings().readingTypography)
  const [readingBrightness, setReadingBrightness] = useState(() => loadAppSettings().readingBrightness)
  const [measureWidth, setMeasureWidth] = useState(() => loadAppSettings().measureWidth)
  const [storageBanner, setStorageBanner] = useState<string | null>(null)
  const [readingFocus, setReadingFocus] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)

  const [docId, setDocId] = useState('')
  const [title, setTitle] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [openResume, setOpenResume] = useState(0)
  const [documents, setDocuments] = useState<StoredDocument[]>([])

  const parsed = useParsedDocument(markdown)
  const parsedRef = useRef(parsed)
  const docIdRef = useRef(docId)
  const titleRef = useRef(title)
  const markdownRef = useRef(markdown)

  useEffect(() => {
    parsedRef.current = parsed
  }, [parsed])
  useEffect(() => {
    docIdRef.current = docId
  }, [docId])
  useEffect(() => {
    titleRef.current = title
  }, [title])
  useEffect(() => {
    markdownRef.current = markdown
  }, [markdown])

  const reportStorageError = useCallback((err: unknown) => {
    const msg =
      err instanceof StorageError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Failed to save documents.'
    setStorageBanner(msg)
  }, [])

  const refreshDocuments = useCallback(async () => {
    try {
      const list = await listAllDocuments()
      setDocuments(list)
    } catch (err) {
      reportStorageError(err)
    }
  }, [reportStorageError])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const initial = await loadInitialDocument(SAMPLE_MD, 'sample.md')
        const list = await listAllDocuments()
        if (cancelled) return
        setDocId(initial.id)
        setTitle(initial.title)
        setMarkdown(initial.markdown)
        setOpenResume(initial.resumeWordIdx)
        setDocuments(list)
        setBoot({
          phase: 'ready',
          docId: initial.id,
          title: initial.title,
          markdown: initial.markdown,
          openResume: initial.resumeWordIdx,
          documents: list,
        })
      } catch (err) {
        if (cancelled) return
        setBoot({
          phase: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (boot.phase !== 'ready') return
    const t = setTimeout(() => {
      const meta = wordMetaFromParsed(parsedRef.current)
      void putDocument(docId, {
        title,
        markdown,
        wordCount: meta.wordCount,
        lastWordGlobalIdx: meta.lastWordGlobalIdx,
      })
        .then((updated) => {
          if (!updated) return
          setDocuments((prev) => {
            const i = prev.findIndex((d) => d.id === updated.id)
            if (i < 0) return prev
            const next = [...prev]
            next[i] = { ...updated }
            return next
          })
        })
        .catch(reportStorageError)
    }, SAVE_MS)
    return () => clearTimeout(t)
  }, [boot.phase, docId, title, markdown, reportStorageError])

  useEffect(() => {
    const t = setTimeout(
      () =>
        saveAppSettings({
          controlsWidth,
          fontSize,
          readingPreset,
          readingTypography,
          readingBrightness,
          measureWidth,
        }),
      LAYOUT_SAVE_MS,
    )
    return () => clearTimeout(t)
  }, [controlsWidth, fontSize, readingPreset, readingTypography, readingBrightness, measureWidth])

  const applyDocument = useCallback((d: StoredDocument) => {
    setDocId(d.id)
    setTitle(d.title)
    setMarkdown(d.markdown)
    setOpenResume(d.resumeWordIdx != null && d.resumeWordIdx >= 0 ? d.resumeWordIdx : 0)
  }, [])

  const patchDocInList = useCallback((id: string, patch: Partial<StoredDocument>) => {
    setDocuments((prev) => {
      const i = prev.findIndex((d) => d.id === id)
      if (i < 0) return prev
      const next = [...prev]
      next[i] = { ...next[i]!, ...patch }
      return next
    })
  }, [])

  const onResumeFromPlayback = useCallback(
    (w: number) => {
      const id = docIdRef.current
      void putResumeOnly(id, w)
        .then(() => patchDocInList(id, { resumeWordIdx: w }))
        .catch(reportStorageError)
    },
    [patchDocInList, reportStorageError],
  )

  const onResumeFlush = useCallback(
    (w: number) => {
      const id = docIdRef.current
      void putResumeOnly(id, w)
        .then(() => patchDocInList(id, { resumeWordIdx: w }))
        .catch(reportStorageError)
    },
    [patchDocInList, reportStorageError],
  )

  const onResumeReset = useCallback(() => {
    const id = docIdRef.current
    void putResumeOnly(id, 0)
      .then(() => {
        patchDocInList(id, { resumeWordIdx: undefined })
        setOpenResume(0)
      })
      .catch(reportStorageError)
    setOpenResume(0)
  }, [patchDocInList, reportStorageError])

  const selectDocument = useCallback(
    async (id: string) => {
      if (id === docIdRef.current) return
      const meta = wordMetaFromParsed(parsedRef.current)
      try {
        await putDocument(docIdRef.current, {
          title: titleRef.current,
          markdown: markdownRef.current,
          wordCount: meta.wordCount,
          lastWordGlobalIdx: meta.lastWordGlobalIdx,
        })
        const d = await getDocumentById(id)
        if (d) {
          await setActiveId(d.id)
          applyDocument(d)
          await refreshDocuments()
        }
      } catch (err) {
        reportStorageError(err)
      }
    },
    [applyDocument, refreshDocuments, reportStorageError],
  )

  const newDocument = useCallback(async () => {
    const meta = wordMetaFromParsed(parsedRef.current)
    try {
      await putDocument(docIdRef.current, {
        title: titleRef.current,
        markdown: markdownRef.current,
        wordCount: meta.wordCount,
        lastWordGlobalIdx: meta.lastWordGlobalIdx,
      })
      const d = await createDocument('Untitled.md', '#\n', true, {
        wordCount: 0,
        lastWordGlobalIdx: 0,
      })
      applyDocument(d)
      await refreshDocuments()
    } catch (err) {
      reportStorageError(err)
    }
  }, [applyDocument, refreshDocuments, reportStorageError])

  const onFile = useCallback(
    async (name: string, text: string) => {
      const meta = wordMetaFromParsed(parsedRef.current)
      try {
        await putDocument(docIdRef.current, {
          title: titleRef.current,
          markdown: markdownRef.current,
          wordCount: meta.wordCount,
          lastWordGlobalIdx: meta.lastWordGlobalIdx,
        })
        const d = await createDocument(name || 'pasted.md', text, true)
        applyDocument(d)
        await refreshDocuments()
      } catch (err) {
        reportStorageError(err)
      }
    },
    [applyDocument, refreshDocuments, reportStorageError],
  )

  const onDeleteDocument = useCallback(
    async (id: string) => {
      try {
        if (id !== docIdRef.current) {
          await deleteDocument(id)
          await refreshDocuments()
          return
        }
        const next = await deleteDocument(id)
        if (next) {
          applyDocument(next)
        } else {
          const d = await createDocument('Untitled.md', '#\n', true, {
            wordCount: 0,
            lastWordGlobalIdx: 0,
          })
          applyDocument(d)
        }
        await refreshDocuments()
      } catch (err) {
        reportStorageError(err)
      }
    },
    [applyDocument, refreshDocuments, reportStorageError],
  )

  const onPlaybackBegan = useCallback(() => {
    const id = docIdRef.current
    void touchPlayed(id)
      .then(() => {
        patchDocInList(id, { lastPlayedAt: Date.now() })
      })
      .catch(reportStorageError)
  }, [patchDocInList, reportStorageError])

  if (boot.phase === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-ink-950 text-ink-300">
        <p className="text-sm">Loading documents…</p>
      </div>
    )
  }

  if (boot.phase === 'error') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-ink-950 px-6 text-center">
        <p className="text-sm font-medium text-red-200">Could not open the document library</p>
        <p className="max-w-md text-xs text-ink-400">{boot.message}</p>
        <button
          type="button"
          className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs text-ink-100"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    )
  }

  return (
    <div className={`flex h-screen flex-col overflow-hidden ${readingFocus ? 'is-immersive' : ''}`}>
      <FileDropOverlay
        onFile={(name, text) => {
          setDropError(null)
          void onFile(name, text)
        }}
        onError={(message) => setDropError(message)}
      />

      {(storageBanner || dropError) && (
        <div
          className="flex items-start justify-between gap-3 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-100 sm:px-6"
          role="alert"
        >
          <p className="min-w-0 leading-relaxed">{storageBanner ?? dropError}</p>
          <button
            type="button"
            className="shrink-0 rounded px-2 py-0.5 text-red-200/90 hover:bg-red-500/20"
            onClick={() => {
              setStorageBanner(null)
              setDropError(null)
            }}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <main className="flex-1 w-full min-h-0 py-2 sm:py-3 flex flex-col px-3 sm:px-4">
        <Reader
          activeDocId={docId}
          openResume={openResume}
          onResumeFromPlayback={onResumeFromPlayback}
          onResumeFlush={onResumeFlush}
          onResumeReset={onResumeReset}
          markdown={markdown}
          parsed={parsed}
          sourceName={title}
          onTitleChange={setTitle}
          onMarkdownChange={setMarkdown}
          onFile={(name, text) => void onFile(name, text)}
          documents={documents}
          onSelectDocument={(id) => void selectDocument(id)}
          onNewDocument={() => void newDocument()}
          onDeleteDocument={(id) => void onDeleteDocument(id)}
          onPlaybackBegan={onPlaybackBegan}
          onReadingFocusChange={setReadingFocus}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          readingPreset={readingPreset}
          onReadingPresetChange={setReadingPreset}
          readingTypography={readingTypography}
          onReadingTypographyChange={setReadingTypography}
          readingBrightness={readingBrightness}
          onReadingBrightnessChange={setReadingBrightness}
          measureWidth={measureWidth}
          onMeasureWidthChange={setMeasureWidth}
          controlsWidth={controlsWidth}
          onControlsWidthChange={setControlsWidth}
        />
      </main>

      <footer
        className={`border-t border-white/5 text-center text-xs text-ink-500 shrink-0 overflow-hidden transition-[max-height,opacity,padding,border-color] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          readingFocus ? 'max-h-0 border-transparent py-0 opacity-0' : 'max-h-16 py-3 opacity-100'
        }`}
      >
        Runs in your browser; the app shell is available offline after the first visit. TTS model (~160 MB)
        downloads on first use and is kept in the browser cache. Drop a .md file anywhere to open it.
      </footer>
    </div>
  )
}
