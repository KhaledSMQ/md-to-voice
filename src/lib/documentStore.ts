import { parseDocument } from './parseDocument'

const STORAGE_KEY = 'md-to-voice:v1:documents'
const ACTIVE_KEY = 'md-to-voice:v1:activeId'
const MAX_DOCS = 50

export type StoredDocument = {
  id: string
  title: string
  markdown: string
  /** First time the document was created in this app (ms). */
  createdAt: number
  updatedAt: number
  lastPlayedAt: number
  /** Global word index to continue playback from the chunk that contains it. Omitted = start. */
  resumeWordIdx?: number
  /** Cached on save for sidebar progress without re-parsing the list. */
  wordCount?: number
  lastWordGlobalIdx?: number
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function readRaw(): StoredDocument[] {
  if (!canUseStorage()) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const p = JSON.parse(raw) as unknown
    if (!Array.isArray(p)) return []
    return p
      .filter(
        (x: unknown) =>
          x != null &&
          typeof x === 'object' &&
          'id' in (x as object) &&
          'title' in (x as object) &&
          'markdown' in (x as object),
      )
      .map((d: any) => {
        const updatedAt = Number(d.updatedAt) || 0
        const doc: StoredDocument = {
        id: String(d.id),
        title: String(d.title).slice(0, 200) || 'Untitled',
        markdown: String(d.markdown),
        createdAt: Number(d.createdAt) || updatedAt,
        updatedAt,
        lastPlayedAt: Number(d.lastPlayedAt) || 0,
        }
        if (d.resumeWordIdx != null) {
          const r = Math.floor(Number(d.resumeWordIdx))
          if (Number.isFinite(r) && r >= 0) doc.resumeWordIdx = r
        }
        if (d.wordCount != null) {
          const n = Math.floor(Number(d.wordCount))
          if (Number.isFinite(n) && n >= 0) doc.wordCount = n
        }
        if (d.lastWordGlobalIdx != null) {
          const n = Math.floor(Number(d.lastWordGlobalIdx))
          if (Number.isFinite(n) && n >= 0) doc.lastWordGlobalIdx = n
        }
        return doc
      })
  } catch {
    return []
  }
}

function writeRaw(docs: StoredDocument[]): void {
  if (!canUseStorage()) return
  try {
    const trimmed = docs
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_DOCS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // quota / private mode
  }
}

function readActiveId(): string | null {
  if (!canUseStorage()) return null
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

function writeActiveId(id: string | null): void {
  if (!canUseStorage()) return
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id)
    else localStorage.removeItem(ACTIVE_KEY)
  } catch {
    // ignore
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function pickDefaultOpen(docs: StoredDocument[], preferredId: string | null): StoredDocument | null {
  if (docs.length === 0) return null
  if (preferredId) {
    const found = docs.find((d) => d.id === preferredId)
    if (found) return found
  }
  return [...docs].sort((a, b) => {
    const p = b.lastPlayedAt - a.lastPlayedAt
    if (p !== 0) return p
    return b.updatedAt - a.updatedAt
  })[0]
}

export function listDocumentsByRecency(): StoredDocument[] {
  return [...readRaw()].sort((a, b) => {
    const p = b.lastPlayedAt - a.lastPlayedAt
    if (p !== 0) return p
    return b.updatedAt - a.updatedAt
  })
}

/** All stored documents, unsorted (storage order: newest update first). */
export function listAllDocuments(): StoredDocument[] {
  return [...readRaw()]
}

export type RecentsSort = 'played' | 'added' | 'name'

export function sortRecents(
  documents: StoredDocument[],
  sort: RecentsSort,
  getDisplayTitle: (d: StoredDocument) => string,
): StoredDocument[] {
  const out = [...documents]
  out.sort((a, b) => {
    if (sort === 'name') {
      const an = getDisplayTitle(a).toLowerCase()
      const bn = getDisplayTitle(b).toLowerCase()
      const c = an.localeCompare(bn, undefined, { sensitivity: 'base' })
      if (c !== 0) return c
      return a.id.localeCompare(b.id)
    }
    if (sort === 'added') {
      const c = b.createdAt - a.createdAt
      if (c !== 0) return c
      return b.updatedAt - a.updatedAt
    }
    const p = b.lastPlayedAt - a.lastPlayedAt
    if (p !== 0) return p
    return b.updatedAt - a.updatedAt
  })
  return out
}

export function getDocumentById(id: string): StoredDocument | null {
  return readRaw().find((d) => d.id === id) ?? null
}

export function saveDocument(doc: StoredDocument, setAsActive: boolean): void {
  const all = readRaw()
  const i = all.findIndex((d) => d.id === doc.id)
  if (i >= 0) all[i] = doc
  else all.push(doc)
  writeRaw(all)
  if (setAsActive) writeActiveId(doc.id)
}

export function setActiveId(id: string | null): void {
  writeActiveId(id)
}

export function createDocument(
  title: string,
  markdown: string,
  setAsActive: boolean,
): StoredDocument {
  const now = Date.now()
  const parsed = parseDocument(markdown)
  const w = parsed.words
  const doc: StoredDocument = {
    id: newId(),
    title: title || 'Untitled',
    markdown,
    createdAt: now,
    updatedAt: now,
    lastPlayedAt: 0,
    wordCount: w.length,
    lastWordGlobalIdx: w.length > 0 ? w[w.length - 1]!.idx : 0,
  }
  saveDocument(doc, setAsActive)
  return doc
}

export function touchPlayed(docId: string): void {
  const all = readRaw()
  const d = all.find((x) => x.id === docId)
  if (!d) return
  d.lastPlayedAt = Date.now()
  writeRaw(all)
  setActiveId(docId)
}

export function updateDocumentText(docId: string, markdown: string): void {
  putDocument(docId, { markdown })
}

export function updateDocumentTitle(docId: string, title: string): void {
  putDocument(docId, { title })
}

export function putDocument(
  id: string,
  patch: { title?: string; markdown?: string; resumeWordIdx?: number | null },
): void {
  const all = readRaw()
  const d = all.find((x) => x.id === id)
  if (!d) return
  if (typeof patch.title === 'string') d.title = patch.title.slice(0, 200) || 'Untitled'
  if (typeof patch.markdown === 'string') {
    d.markdown = patch.markdown
    const w = parseDocument(d.markdown).words
    d.wordCount = w.length
    d.lastWordGlobalIdx = w.length > 0 ? w[w.length - 1]!.idx : 0
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'resumeWordIdx')) {
    if (patch.resumeWordIdx == null || patch.resumeWordIdx < 0) {
      delete d.resumeWordIdx
    } else {
      d.resumeWordIdx = Math.floor(patch.resumeWordIdx)
    }
  }
  d.updatedAt = Date.now()
  writeRaw(all)
}

/** Update only resume line; does not bump `updatedAt` (avoids shuffling "recents" order). */
export function putResumeOnly(id: string, wordIdx: number): void {
  const all = readRaw()
  const d = all.find((x) => x.id === id)
  if (!d) return
  if (wordIdx < 0) {
    delete d.resumeWordIdx
  } else {
    d.resumeWordIdx = Math.floor(wordIdx)
  }
  writeRaw(all)
}

export function deleteDocument(id: string): StoredDocument | null {
  const all = readRaw()
  const wasActive = readActiveId() === id
  const nextAll = all.filter((d) => d.id !== id)
  if (nextAll.length === all.length) return null
  writeRaw(nextAll)
  if (!wasActive) return null
  const next = pickDefaultOpen(nextAll, null)
  writeActiveId(next?.id ?? null)
  return next ?? null
}

export type InitialDocumentState = {
  id: string
  title: string
  markdown: string
  createdDefault: boolean
  resumeWordIdx: number
}

export function loadInitialDocument(
  defaultMarkdown: string,
  defaultTitle: string,
): InitialDocumentState {
  const all = readRaw()
  if (all.length === 0) {
    const d = createDocument(defaultTitle, defaultMarkdown, true)
    return {
      id: d.id,
      title: d.title,
      markdown: d.markdown,
      createdDefault: true,
      resumeWordIdx: 0,
    }
  }
  const doc = pickDefaultOpen(all, null)
  if (!doc) {
    const d = createDocument(defaultTitle, defaultMarkdown, true)
    return {
      id: d.id,
      title: d.title,
      markdown: d.markdown,
      createdDefault: true,
      resumeWordIdx: 0,
    }
  }
  setActiveId(doc.id)
  const r = doc.resumeWordIdx
  return {
    id: doc.id,
    title: doc.title,
    markdown: doc.markdown,
    createdDefault: false,
    resumeWordIdx: r != null && r >= 0 ? r : 0,
  }
}
