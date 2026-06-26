import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Reader } from './components/Reader'
import { SourcePanel } from './components/SourcePanel'
import { ColumnResizeHandle } from './components/ColumnResizeHandle'
import {
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

const SAVE_MS = 500
const LAYOUT_SAVE_MS = 400

let initialDocCache: ReturnType<typeof loadInitialDocument> | null = null
function getInitialDoc() {
  if (!initialDocCache) {
    initialDocCache = loadInitialDocument(SAMPLE_MD, 'sample.md')
  }
  return initialDocCache
}

export default function App() {
  const [sourceTab, setSourceTab] = useState<'file' | 'edit'>('file')
  const [sidebarWidth, setSidebarWidth] = useState(() => loadAppSettings().sidebarWidth)
  const [controlsWidth, setControlsWidth] = useState(() => loadAppSettings().controlsWidth)
  const [fontSize, setFontSize] = useState(() => loadAppSettings().fontSize)
  const [docId, setDocId] = useState(() => getInitialDoc().id)
  const [title, setTitle] = useState(() => getInitialDoc().title)
  const [markdown, setMarkdown] = useState(() => getInitialDoc().markdown)
  const [openResume, setOpenResume] = useState(() => getInitialDoc().resumeWordIdx)

  const [historyKey, setHistoryKey] = useState(0)
  const documents = useMemo(
    () => listAllDocuments(),
    [docId, title, markdown, historyKey],
  )

  useEffect(() => {
    const t = setTimeout(() => {
      putDocument(docId, { title, markdown })
    }, SAVE_MS)
    return () => clearTimeout(t)
  }, [docId, title, markdown])

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
    setHistoryKey((k) => k + 1)
  }, [])

  const docIdRef = useRef(docId)
  docIdRef.current = docId

  const onResumeFromPlayback = useCallback((w: number) => {
    putResumeOnly(docIdRef.current, w)
    setHistoryKey((k) => k + 1)
  }, [])

  const onResumeFlush = useCallback((w: number) => {
    putResumeOnly(docIdRef.current, w)
    setHistoryKey((k) => k + 1)
  }, [])

  const onResumeReset = useCallback(() => {
    putResumeOnly(docIdRef.current, 0)
    setOpenResume(0)
    setHistoryKey((k) => k + 1)
  }, [])

  const replaceMarkdownContent = useCallback((text: string) => {
    onResumeReset()
    setMarkdown(text)
  }, [onResumeReset])

  const selectDocument = useCallback(
    (id: string) => {
      if (id === docId) return
      putDocument(docId, { title, markdown })
      const d = getDocumentById(id)
      if (d) {
        setActiveId(d.id)
        applyDocument(d)
      }
    },
    [docId, title, markdown, applyDocument],
  )

  const newDocument = useCallback(() => {
    putDocument(docId, { title, markdown })
    const d = createDocument('Untitled.md', '#\n', true)
    applyDocument(d)
  }, [docId, title, markdown, applyDocument])

  const onFile = useCallback(
    (name: string, text: string) => {
      putDocument(docId, { title, markdown })
      const d = createDocument(name || 'pasted.md', text, true)
      applyDocument(d)
    },
    [docId, title, markdown, applyDocument],
  )

  const onDeleteDocument = useCallback(
    (id: string) => {
      if (id !== docId) {
        const next = deleteDocument(id)
        void next
        setHistoryKey((k) => k + 1)
        return
      }
      const next = deleteDocument(id)
      if (next) {
        applyDocument(next)
      } else {
        const d = createDocument('Untitled.md', '#\n', true)
        applyDocument(d)
      }
    },
    [docId, applyDocument],
  )

  const onPlaybackBegan = useCallback(() => {
    touchPlayed(docId)
    setHistoryKey((k) => k + 1)
  }, [docId])

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

      <main className="flex-1 w-full min-h-0 py-3 sm:py-4 flex flex-col gap-4 lg:flex-row lg:gap-0">
        <aside
          className="space-y-4 min-w-0 w-full lg:shrink-0 lg:w-[var(--sidebar-width)] px-3 sm:px-4 lg:px-0 lg:pl-4"
          style={{ ['--sidebar-width' as string]: `${sidebarWidth}px` }}
        >
          <SourcePanel
            markdown={markdown}
            title={title}
            onTitleChange={setTitle}
            onFile={onFile}
            onMarkdownFromEdit={setMarkdown}
            onMarkdownPaste={replaceMarkdownContent}
            sourceTab={sourceTab}
            onSourceTab={setSourceTab}
            documents={documents}
            activeId={docId}
            onSelectDocument={selectDocument}
            onNewDocument={newDocument}
            onDeleteDocument={onDeleteDocument}
            fontSize={fontSize}
            onFontSizeChange={setFontSize}
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
