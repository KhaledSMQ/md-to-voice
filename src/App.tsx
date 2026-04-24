import { useState } from 'react'
import { FileUploader } from './components/FileUploader'
import { Reader } from './components/Reader'

const SAMPLE_MD = `# Welcome to **md to voice**

Upload a Markdown file using the panel on the left, then press **Play** to hear it read aloud while each word lights up in sync.

## How it works

1. The file is parsed and rendered as Markdown.
2. Every word is tagged with a global index.
3. Sentences stream one-by-one to the in-browser **Kokoro TTS** model.
4. While each sentence plays, the active word is highlighted in real time using a char-weighted timing curve (an idea borrowed from the *Pretext* karaoke teleprompter).

> Privacy first: nothing leaves your device. The 82M-parameter model runs locally via WebGPU or WebAssembly.

Try changing the voice on the right, then hit play. You can pause with the **spacebar** at any time.
`

export default function App() {
  const [markdown, setMarkdown] = useState<string>(SAMPLE_MD)
  const [fileName, setFileName] = useState<string>('sample.md')

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/5 bg-ink-950/40 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
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

      <main className="flex-1 mx-auto max-w-7xl w-full px-6 py-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <FileUploader
            currentName={fileName}
            onFile={(name, text) => {
              setFileName(name)
              setMarkdown(text)
            }}
          />
        </aside>

        <section className="min-w-0">
          <Reader markdown={markdown} sourceName={fileName} />
        </section>
      </main>

      <footer className="border-t border-white/5 py-3 text-center text-xs text-ink-500">
        Runs 100% in your browser. First load downloads ~160 MB (then cached).
      </footer>
    </div>
  )
}
