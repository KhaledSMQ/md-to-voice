import { useCallback, useEffect, useRef, useState } from 'react'
import { Reader } from './components/Reader'
import { SourcePanel } from './components/SourcePanel'
import { ColumnResizeHandle } from './components/ColumnResizeHandle'
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
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_MAX,
  DEFAULT_APP_SETTINGS,
} from './lib/appSettings'
import { useParsedDocument, wordMetaFromParsed } from './lib/useParsedDocument'

const SAMPLE_MD = `# Welcome to **md to voice**

Use the **File** tab to upload a .md file, or **Edit / paste** in the sidebar. You can also use the **pen** button on the preview card to edit in place. Then press **Play** to hear it read aloud while each word lights up in sync.

## How it works

1. The file is parsed and rendered as Markdown.
2. Every word is tagged with a global index.
3. Sentences stream one-by-one to the in-browser **Kokoro TTS** model.
4. While each sentence plays, the active word is highlighted in real time using a char-weighted timing curve (an idea borrowed from the *Pretext* karaoke teleprompter).

> Privacy first: nothing leaves your device. The 82M-parameter model runs locally via WebGPU or WebAssembly.

Your documents and **name** are saved in the browser. On return, the **last one you played** (or most recently saved) opens automatically.

Try changing the voice on the right, then hit play. You can pause with the **spacebar** at any time.
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
  const [sourceTab, setSourceTab] = useState<'file' | 'edit'>('file')
  const [sidebarWidth, setSidebarWidth] = useState(() => loadAppSettings().sidebarWidth)
  const [controlsWidth, setControlsWidth] = useState(() => loadAppSettings().controlsWidth)
  const [fontSize, setFontSize] = useState(() => loadAppSettings().fontSize)
  const [storageBanner, setStorageBanner] = useState<string | null>(null)

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
      () => saveAppSettings({ sidebarWidth, controlsWidth, fontSize }),
      LAYOUT_SAVE_MS,
    )
    return () => clearTimeout(t)
  }, [sidebarWidth, controlsWidth, fontSize])

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

  const replaceMarkdownContent = useCallback(
    (text: string) => {
      onResumeReset()
      setMarkdown(text)
    },
    [onResumeReset],
  )

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
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="border-b border-white/5 bg-ink-950/40 backdrop-blur shrink-0">
        <div className="w-full px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-300 to-pink-400 grid place-items-center text-ink-950 font-black">
              md
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">md to voice</h1>
              <p className="text-xs text-ink-400">Karaoke-style Markdown reader · Kokoro TTS · Pretext</p>
            </div>
          </div>
          <a
            href="https://github.com/hexgrad/kokoro"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-ink-400 hover:text-ink-200"
          >
            Powered by kokoro-js
          </a>
        </div>
      </header>

      {storageBanner && (
        <div
          className="flex items-start justify-between gap-3 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-100 sm:px-6"
          role="alert"
        >
          <p className="min-w-0 leading-relaxed">{storageBanner}</p>
          <button
            type="button"
            className="shrink-0 rounded px-2 py-0.5 text-red-200/90 hover:bg-red-500/20"
            onClick={() => setStorageBanner(null)}
            aria-label="Dismiss storage error"
          >
            ×
          </button>
        </div>
      )}

      <main className="flex-1 w-full min-h-0 py-3 sm:py-4 flex flex-col gap-4 lg:flex-row lg:gap-0">
        <aside
          className="space-y-4 min-w-0 w-full lg:shrink-0 lg:w-[var(--sidebar-width)] px-3 sm:px-4 lg:px-0 lg:pl-4"
          style={{ ['--sidebar-width' as string]: `${sidebarWidth}px` }}
        >
          <SourcePanel
            markdown={markdown}
            title={title}
            onTitleChange={setTitle}
            onFile={(name, text) => void onFile(name, text)}
            onMarkdownFromEdit={setMarkdown}
            onMarkdownPaste={replaceMarkdownContent}
            sourceTab={sourceTab}
            onSourceTab={setSourceTab}
            documents={documents}
            activeId={docId}
            onSelectDocument={(id) => void selectDocument(id)}
            onNewDocument={() => void newDocument()}
            onDeleteDocument={(id) => void onDeleteDocument(id)}
            fontSize={fontSize}
            onFontSizeChange={setFontSize}
            wordCount={parsed.words.length}
            resumeWordIdx={
              documents.find((d) => d.id === docId)?.resumeWordIdx ?? openResume
            }
          />
        </aside>

        <ColumnResizeHandle
          value={sidebarWidth}
          min={SIDEBAR_WIDTH_MIN}
          max={SIDEBAR_WIDTH_MAX}
          onChange={setSidebarWidth}
          onReset={() => setSidebarWidth(DEFAULT_APP_SETTINGS.sidebarWidth)}
          panelSide="end"
          ariaLabel="Resize sidebar"
          className="hidden lg:block"
        />

        <section className="min-w-0 flex-1 flex flex-col px-3 sm:px-4 lg:px-0 lg:pr-4">
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
            onOpenFileTab={() => setSourceTab('file')}
            onOpenPasteTab={() => setSourceTab('edit')}
            onPlaybackBegan={onPlaybackBegan}
            fontSize={fontSize}
            onFontSizeChange={setFontSize}
            controlsWidth={controlsWidth}
            onControlsWidthChange={setControlsWidth}
          />
        </section>
      </main>

      <footer className="border-t border-white/5 py-3 text-center text-xs text-ink-500 shrink-0">
        Runs in your browser; the app shell is available offline after the first visit. TTS model (~160 MB)
        downloads on first use and is kept in the browser cache.
      </footer>
    </div>
  )
}
