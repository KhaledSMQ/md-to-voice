import { normalizeBookmarks, type DocumentBookmark } from './bookmarks'

export type { DocumentBookmark }

const DB_NAME = 'md-to-voice'
const DB_VERSION = 1
const STORE = 'documents'
const META_STORE = 'meta'
const ACTIVE_KEY = 'activeId'
const MAX_DOCS = 50

const LEGACY_DOCS_KEY = 'md-to-voice:v1:documents'
const LEGACY_ACTIVE_KEY = 'md-to-voice:v1:activeId'

export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'StorageError'
  }
}

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
  /** User bookmarks (newest-first). Omitted = none. */
  bookmarks?: DocumentBookmark[]
  /** Cached on save for sidebar progress without re-parsing the list. */
  wordCount?: number
  lastWordGlobalIdx?: number
}

export type RecentsSort = 'played' | 'added' | 'name'

export type InitialDocumentState = {
  id: string
  title: string
  markdown: string
  createdDefault: boolean
  resumeWordIdx: number
}

let dbPromise: Promise<IDBDatabase> | null = null
let legacyCleared = false

function canUseIdb(): boolean {
  return typeof indexedDB !== 'undefined'
}

function clearLegacyLocalStorage(): void {
  if (legacyCleared) return
  legacyCleared = true
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(LEGACY_DOCS_KEY)
    localStorage.removeItem(LEGACY_ACTIVE_KEY)
  } catch {
    // ignore
  }
}

function openDb(): Promise<IDBDatabase> {
  if (!canUseIdb()) {
    return Promise.reject(new StorageError('IndexedDB is not available in this browser.'))
  }
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => {
      dbPromise = null
      reject(new StorageError('Failed to open document database.', { cause: req.error }))
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
  return dbPromise
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () =>
      reject(new StorageError('IndexedDB request failed.', { cause: req.error }))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () =>
      reject(new StorageError('IndexedDB transaction failed.', { cause: tx.error }))
    tx.onabort = () =>
      reject(new StorageError('IndexedDB transaction aborted.', { cause: tx.error }))
  })
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; message?: string; cause?: { name?: string } }
  if (e.name === 'QuotaExceededError') return true
  if (e.cause?.name === 'QuotaExceededError') return true
  if (typeof e.message === 'string' && /quota/i.test(e.message)) return true
  return false
}

function wrapWriteError(err: unknown): StorageError {
  if (err instanceof StorageError) {
    if (isQuotaError(err) || isQuotaError(err.cause)) {
      return new StorageError(
        'Storage is full. Remove some documents or free disk space, then try again.',
        { cause: err },
      )
    }
    return err
  }
  if (isQuotaError(err)) {
    return new StorageError(
      'Storage is full. Remove some documents or free disk space, then try again.',
      { cause: err },
    )
  }
  return new StorageError('Failed to save documents.', { cause: err })
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeDoc(raw: unknown): StoredDocument | null {
  if (raw == null || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  if (typeof d.id !== 'string' || typeof d.title !== 'string' || typeof d.markdown !== 'string') {
    return null
  }
  const updatedAt = Number(d.updatedAt) || 0
  const doc: StoredDocument = {
    id: d.id,
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
  const bookmarks = normalizeBookmarks(d.bookmarks)
  if (bookmarks) doc.bookmarks = bookmarks
  return doc
}

async function readAll(): Promise<StoredDocument[]> {
  clearLegacyLocalStorage()
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  const store = tx.objectStore(STORE)
  const rows = await reqToPromise(store.getAll())
  await txDone(tx)
  const docs: StoredDocument[] = []
  for (const row of rows) {
    const n = normalizeDoc(row)
    if (n) docs.push(n)
  }
  docs.sort((a, b) => b.updatedAt - a.updatedAt)
  return docs
}

async function writeAll(docs: StoredDocument[]): Promise<void> {
  clearLegacyLocalStorage()
  const trimmed = [...docs]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_DOCS)
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    store.clear()
    for (const d of trimmed) store.put(d)
    await txDone(tx)
  } catch (err) {
    throw wrapWriteError(err)
  }
}

async function readActiveId(): Promise<string | null> {
  const db = await openDb()
  const tx = db.transaction(META_STORE, 'readonly')
  const v = await reqToPromise(tx.objectStore(META_STORE).get(ACTIVE_KEY))
  await txDone(tx)
  return typeof v === 'string' ? v : null
}

async function writeActiveId(id: string | null): Promise<void> {
  try {
    const db = await openDb()
    const tx = db.transaction(META_STORE, 'readwrite')
    const store = tx.objectStore(META_STORE)
    if (id) store.put(id, ACTIVE_KEY)
    else store.delete(ACTIVE_KEY)
    await txDone(tx)
  } catch (err) {
    throw wrapWriteError(err)
  }
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
  })[0]!
}

/** All stored documents (newest update first). */
export async function listAllDocuments(): Promise<StoredDocument[]> {
  return readAll()
}

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

export async function getDocumentById(id: string): Promise<StoredDocument | null> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  const raw = await reqToPromise(tx.objectStore(STORE).get(id))
  await txDone(tx)
  return normalizeDoc(raw)
}

export async function setActiveId(id: string | null): Promise<void> {
  await writeActiveId(id)
}

export async function saveDocument(doc: StoredDocument, setAsActive: boolean): Promise<void> {
  const all = await readAll()
  const i = all.findIndex((d) => d.id === doc.id)
  if (i >= 0) all[i] = doc
  else all.push(doc)
  await writeAll(all)
  if (setAsActive) await writeActiveId(doc.id)
}

export async function createDocument(
  title: string,
  markdown: string,
  setAsActive: boolean,
  meta?: { wordCount?: number; lastWordGlobalIdx?: number },
): Promise<StoredDocument> {
  const now = Date.now()
  const doc: StoredDocument = {
    id: newId(),
    title: title || 'Untitled',
    markdown,
    createdAt: now,
    updatedAt: now,
    lastPlayedAt: 0,
  }
  if (meta?.wordCount != null) doc.wordCount = meta.wordCount
  if (meta?.lastWordGlobalIdx != null) doc.lastWordGlobalIdx = meta.lastWordGlobalIdx
  await saveDocument(doc, setAsActive)
  return doc
}

export async function touchPlayed(docId: string): Promise<void> {
  const all = await readAll()
  const d = all.find((x) => x.id === docId)
  if (!d) return
  d.lastPlayedAt = Date.now()
  await writeAll(all)
  await writeActiveId(docId)
}

export async function putDocument(
  id: string,
  patch: {
    title?: string
    markdown?: string
    resumeWordIdx?: number | null
    bookmarks?: DocumentBookmark[] | null
    wordCount?: number
    lastWordGlobalIdx?: number
  },
): Promise<StoredDocument | null> {
  const all = await readAll()
  const d = all.find((x) => x.id === id)
  if (!d) return null
  if (typeof patch.title === 'string') d.title = patch.title.slice(0, 200) || 'Untitled'
  if (typeof patch.markdown === 'string') {
    d.markdown = patch.markdown
    if (typeof patch.wordCount === 'number') d.wordCount = patch.wordCount
    if (typeof patch.lastWordGlobalIdx === 'number') d.lastWordGlobalIdx = patch.lastWordGlobalIdx
  } else {
    if (typeof patch.wordCount === 'number') d.wordCount = patch.wordCount
    if (typeof patch.lastWordGlobalIdx === 'number') d.lastWordGlobalIdx = patch.lastWordGlobalIdx
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'resumeWordIdx')) {
    if (patch.resumeWordIdx == null || patch.resumeWordIdx < 0) {
      delete d.resumeWordIdx
    } else {
      d.resumeWordIdx = Math.floor(patch.resumeWordIdx)
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'bookmarks')) {
    const normalized = normalizeBookmarks(patch.bookmarks)
    if (normalized) d.bookmarks = normalized
    else delete d.bookmarks
  }
  d.updatedAt = Date.now()
  await writeAll(all)
  return d
}

/** Update only resume line; does not bump `updatedAt`. */
export async function putResumeOnly(id: string, wordIdx: number): Promise<void> {
  const all = await readAll()
  const d = all.find((x) => x.id === id)
  if (!d) return
  if (wordIdx < 0) {
    delete d.resumeWordIdx
  } else {
    d.resumeWordIdx = Math.floor(wordIdx)
  }
  await writeAll(all)
}

/** Update only bookmarks; does not bump `updatedAt`. */
export async function putBookmarksOnly(
  id: string,
  bookmarks: DocumentBookmark[],
): Promise<void> {
  const all = await readAll()
  const d = all.find((x) => x.id === id)
  if (!d) return
  const normalized = normalizeBookmarks(bookmarks)
  if (normalized) d.bookmarks = normalized
  else delete d.bookmarks
  await writeAll(all)
}

export async function deleteDocument(id: string): Promise<StoredDocument | null> {
  const all = await readAll()
  const wasActive = (await readActiveId()) === id
  const nextAll = all.filter((d) => d.id !== id)
  if (nextAll.length === all.length) return null
  await writeAll(nextAll)
  if (!wasActive) return null
  const next = pickDefaultOpen(nextAll, null)
  await writeActiveId(next?.id ?? null)
  return next ?? null
}

export async function loadInitialDocument(
  defaultMarkdown: string,
  defaultTitle: string,
): Promise<InitialDocumentState> {
  clearLegacyLocalStorage()
  const all = await readAll()
  if (all.length === 0) {
    const d = await createDocument(defaultTitle, defaultMarkdown, true)
    return {
      id: d.id,
      title: d.title,
      markdown: d.markdown,
      createdDefault: true,
      resumeWordIdx: 0,
    }
  }
  const preferred = await readActiveId()
  const doc = pickDefaultOpen(all, preferred)
  if (!doc) {
    const d = await createDocument(defaultTitle, defaultMarkdown, true)
    return {
      id: d.id,
      title: d.title,
      markdown: d.markdown,
      createdDefault: true,
      resumeWordIdx: 0,
    }
  }
  await writeActiveId(doc.id)
  const r = doc.resumeWordIdx
  return {
    id: doc.id,
    title: doc.title,
    markdown: doc.markdown,
    createdDefault: false,
    resumeWordIdx: r != null && r >= 0 ? r : 0,
  }
}
