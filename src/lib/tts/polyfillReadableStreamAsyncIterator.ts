/**
 * Safari / iOS (and some older Chromium) lack ReadableStream async iteration.
 * phonemizer.js uses `for await (... of stream)` while gunzipping eSpeak data at
 * module init, which throws: TypeError: undefined is not a function.
 *
 * Must run before `kokoro-js` / `phonemizer` are imported.
 */
export function polyfillReadableStreamAsyncIterator(): void {
  if (typeof ReadableStream === 'undefined') return

  const proto = ReadableStream.prototype as ReadableStream<Uint8Array> & {
    [Symbol.asyncIterator]?: () => AsyncIterableIterator<Uint8Array>
    values?: () => AsyncIterableIterator<Uint8Array>
  }

  if (typeof proto[Symbol.asyncIterator] === 'function') return

  async function* values(this: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
    const reader = this.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        if (value !== undefined) yield value
      }
    } finally {
      reader.releaseLock()
    }
  }

  // defineProperty: Safari sometimes ignores plain assignment on the prototype.
  Object.defineProperty(proto, Symbol.asyncIterator, {
    value: values,
    writable: true,
    configurable: true,
  })
  if (typeof proto.values !== 'function') {
    Object.defineProperty(proto, 'values', {
      value: values,
      writable: true,
      configurable: true,
    })
  }
}

polyfillReadableStreamAsyncIterator()
